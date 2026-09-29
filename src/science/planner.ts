// Session planner: turns a strain profile + balloon size into a temperature and pump time per balloon.
//
// Evidence base (Hazekamp 2006, Lanz 2016, Eyal 2023, Volcano Medic instructions):
// - Terpenes leave the herb first at ANY setting ≥ ~160 °C (Eyal 2023: monoterpenes almost
//   completely within ~20 s at 180 °C). Boiling-point charts do not describe release.
// - What temperature really controls is how much cannabinoid comes along. So the first
//   balloon's temperature decides the flavour/strength balance ("terpene share"), and the
//   strain's terpene amount and volatility decide where that balance sits.
// - At a fixed temperature, balloons decline as the herb depletes; stepping up compensates.
//   The planner picks each later temperature so every balloon carries a similar dose.
// - Terpene-based plans are about taste and consistency — not about promised effects.

import { CANNABINOID_IDS, COMPOUNDS, TERPENE_IDS, isCannabinoid, type CompoundId, type TerpeneId } from './compounds';
import {
  DEFAULT_MODEL,
  Simulator,
  amountsFromPercent,
  comfortOf,
  type Amounts,
  type BalloonResult,
  type BalloonSpec,
  type Comfort,
  type ModelParams,
  type Segment,
  type SimState,
} from './releaseModel';

export type Goal = 'flavor' | 'balanced' | 'intense';

export interface GoalSpec {
  label: string;
  blurb: string;
  /** Wanted terpene share of the first balloon's vapour mass */
  terpShareTarget: number;
  /** Allowed range for the first balloon, °C */
  firstRange: [number, number];
  /** Highest temperature this goal will use (the last balloon ends here), °C */
  maxC: number;
  /** Share of the cannabinoids released in a single-balloon session */
  singleExtraction: number;
}

export const GOALS: Record<Goal, GoalSpec> = {
  flavor: {
    label: 'Flavor first',
    blurb: 'Low first balloon for maximum taste, gentle steps, finishing at 200 °C.',
    terpShareTarget: 0.5,
    firstRange: [160, 180],
    maxC: 200,
    singleExtraction: 0.2,
  },
  balanced: {
    label: 'Balanced',
    blurb: 'Tasty first balloon, then even-strength balloons up to 210 °C.',
    terpShareTarget: 0.41,
    firstRange: [170, 190],
    maxC: 210,
    singleExtraction: 0.35,
  },
  intense: {
    label: 'Intense',
    blurb: 'Dense balloons and thorough extraction up to 222 °C; flavour takes a back seat.',
    terpShareTarget: 0.315,
    firstRange: [182, 202],
    maxC: 222,
    singleExtraction: 0.55,
  },
};

export interface PlanInput {
  /** Composition in % w/w (terpenes and cannabinoids; totals, i.e. THCA already converted) */
  percent: Amounts;
  loadMg: number;
  /** Pump seconds per balloon (from the balloon profile) */
  pumpSeconds: number;
  balloonCount: number;
  goal: Goal;
  minTempC: number;
  maxTempC: number;
  preheatSeconds: number;
  /** Personal adjustments learned from ratings */
  firstOffsetC?: number;
  laterOffsetC?: number;
  model?: ModelParams;
}

export interface PlannedBalloon {
  index: number;
  tempC: number;
  segments: Segment[];
  pumpSeconds: number;
  preheatSeconds: number;
  result: BalloonResult;
  aroma: { id: TerpeneId; share: number }[];
  comfort: Comfort;
}

export interface ProfileInsight {
  totalTerpPct: number;
  dominant: { id: TerpeneId; pct: number }[];
  /** Share of terpene mass by volatility class (0–1) */
  classShares: { monoterpenes: number; oxygenatedMono: number; sesquiterpenes: number; lowVolatility: number };
  thcPct: number;
  cbdPct: number;
  assumed: string[];
}

export interface Plan {
  input: PlanInput;
  balloons: PlannedBalloon[];
  insight: ProfileInsight;
  totals: { terpMg: number; cannMg: number; thcMg: number; cbdMg: number; cannReleased: number; terpReleased: number };
  explanation: string[];
  warnings: string[];
}

/** Typical US flower (median of ~43k lab tests, Smith et al. 2022) — used when a profile has no terpenes. */
export const TYPICAL_TERPENES: Amounts = {
  myrcene: 0.35,
  caryophyllene: 0.3,
  limonene: 0.28,
  humulene: 0.1,
  linalool: 0.08,
  alphaPinene: 0.06,
  betaPinene: 0.07,
  ocimene: 0.04,
  terpinolene: 0.02,
  bisabolol: 0.02,
  nerolidol: 0.02,
};

const LOW_VOLATILITY: TerpeneId[] = ['nerolidol', 'bisabolol', 'guaiol', 'caryophylleneOxide', 'phytol', 'valencene'];

/** Roughly one useful balloon per ~60 mg for an 8 L balloon; smaller balloons need a few more. */
export function suggestBalloonCount(loadMg: number, litres = 8): number {
  const n = (loadMg / 60) * Math.pow(8 / Math.max(2, litres), 0.6);
  return Math.max(1, Math.min(8, Math.round(n)));
}

export function completeProfile(percent: Amounts): { percent: Amounts; assumed: string[] } {
  const out: Amounts = {};
  const assumed: string[] = [];
  for (const [id, v] of Object.entries(percent) as [CompoundId, number][]) {
    if (COMPOUNDS[id] && Number.isFinite(v) && v > 0) out[id] = v;
  }
  const terp = TERPENE_IDS.reduce((s, id) => s + (out[id] ?? 0), 0);
  if (terp <= 0) {
    Object.assign(out, TYPICAL_TERPENES);
    assumed.push('No terpene data — using a typical US flower profile (≈1.3 % terpenes).');
  }
  const cann = CANNABINOID_IDS.reduce((s, id) => s + (out[id] ?? 0), 0);
  if (cann <= 0) {
    out.thc = 18;
    assumed.push('No cannabinoid data — assuming 18 % THC.');
  }
  return { percent: out, assumed };
}

export function profileInsight(percent: Amounts, assumed: string[] = []): ProfileInsight {
  const terps = TERPENE_IDS.map((id) => ({ id, pct: percent[id] ?? 0 })).filter((t) => t.pct > 0);
  const total = terps.reduce((s, t) => s + t.pct, 0);
  const share = (pred: (id: TerpeneId) => boolean) =>
    total > 0 ? terps.filter((t) => pred(t.id)).reduce((s, t) => s + t.pct, 0) / total : 0;
  return {
    totalTerpPct: total,
    dominant: terps.sort((a, b) => b.pct - a.pct).slice(0, 3),
    classShares: {
      monoterpenes: share((id) => COMPOUNDS[id].cls === 'monoterpene'),
      oxygenatedMono: share((id) => COMPOUNDS[id].cls === 'monoterpenoid'),
      sesquiterpenes: share((id) => COMPOUNDS[id].cls === 'sesquiterpene' && !LOW_VOLATILITY.includes(id)),
      lowVolatility: share((id) => LOW_VOLATILITY.includes(id)),
    },
    thcPct: percent.thc ?? 0,
    cbdPct: percent.cbd ?? 0,
    assumed,
  };
}

function aromaOf(r: BalloonResult): { id: TerpeneId; share: number }[] {
  const entries = (Object.entries(r.delivered) as [CompoundId, number][]).filter(([id]) => !isCannabinoid(id));
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  if (sum <= 0) return [];
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, v]) => ({ id: id as TerpeneId, share: v / sum }));
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

interface Ctx {
  sim: Simulator;
  seconds: number;
  preheatFirst: number;
  preheatLater: number;
}

const spec = (ctx: Ctx, tempC: number, index: number): BalloonSpec => ({
  segments: [{ tempC, seconds: ctx.seconds }],
  preheatSeconds: index === 0 ? ctx.preheatFirst : ctx.preheatLater,
});

/** Lowest integer temperature in [lo, hi] whose balloon delivers at least `dose` mg cannabinoids. */
function lowestTempForDose(ctx: Ctx, state: SimState, index: number, dose: number, lo: number, hi: number): number {
  const doseAt = (t: number) => ctx.sim.run(state, spec(ctx, t, index)).result.cannMg;
  if (doseAt(lo) >= dose) return lo;
  if (doseAt(hi) < dose) return hi;
  let a = lo;
  let b = hi;
  while (b - a > 1) {
    const m = Math.floor((a + b) / 2);
    if (doseAt(m) >= dose) b = m;
    else a = m;
  }
  return b;
}

/** Greedy stepping: each balloon gets the lowest temperature (≥ the previous one) that reaches `dose`. */
function stepSequence(ctx: Ctx, state1: SimState, t1: number, n: number, dose: number, maxC: number) {
  const temps = [t1];
  let state = state1;
  let feasible = true;
  for (let k = 1; k < n; k++) {
    const t = lowestTempForDose(ctx, state, k, dose, temps[k - 1], maxC);
    const out = ctx.sim.run(state, spec(ctx, t, k));
    if (out.result.cannMg < dose * 0.999) feasible = false;
    temps.push(t);
    state = out.state;
  }
  return { temps, feasible };
}

export function buildPlan(rawInput: PlanInput): Plan {
  const model = rawInput.model ?? DEFAULT_MODEL;
  const { percent, assumed } = completeProfile(rawInput.percent);
  const input: PlanInput = { ...rawInput, percent };
  const goal = GOALS[input.goal];
  const n = clamp(Math.round(input.balloonCount), 1, 10);
  const minC = clamp(Math.round(input.minTempC), 40, 230);
  const maxC = clamp(Math.min(Math.round(input.maxTempC), goal.maxC), minC, 230);
  const seconds = Math.max(1, input.pumpSeconds);
  const sim = new Simulator(amountsFromPercent(percent, input.loadMg), model);
  const ctx: Ctx = {
    sim,
    seconds,
    preheatFirst: Math.max(0, input.preheatSeconds),
    preheatLater: Math.max(0, Math.min(input.preheatSeconds, 3)),
  };
  const s0 = sim.initialState();
  const warnings: string[] = [];
  const explanation: string[] = [];
  const insight = profileInsight(percent, assumed);

  let temps: number[];
  let firstReason = '';

  if (n === 1) {
    // Single balloon: pick the temperature that releases the goal's share of cannabinoids.
    const target = goal.singleExtraction;
    let t = minC;
    for (let c = minC; c <= maxC; c++) {
      t = c;
      if (sim.run(s0, spec(ctx, c, 0)).result.cumCannReleased >= target) break;
    }
    t = clamp(t + (input.firstOffsetC ?? 0), minC, maxC);
    temps = [t];
    firstReason = `One balloon at ${t} °C releases about ${Math.round(
      sim.run(s0, spec(ctx, t, 0)).result.cumCannReleased * 100,
    )} % of the cannabinoids (goal “${goal.label}”: ~${Math.round(target * 100)} %).`;
  } else {
    // Balloon 1: the hottest temperature (within the goal's range) that still keeps the
    // terpene share at the goal's target — terpene-rich or volatile profiles go higher.
    const lo = clamp(goal.firstRange[0], minC, maxC);
    const hi = clamp(goal.firstRange[1], lo, maxC);
    let t1 = lo;
    let hitTarget = false;
    for (let c = lo; c <= hi; c++) {
      if (sim.run(s0, spec(ctx, c, 0)).result.terpShare >= goal.terpShareTarget) {
        t1 = c;
        hitTarget = true;
      }
    }
    const shareAtLo = sim.run(s0, spec(ctx, lo, 0)).result.terpShare;
    if (!hitTarget && shareAtLo < goal.terpShareTarget) {
      warnings.push(
        `Even at ${lo} °C this profile only reaches a ${Math.round(shareAtLo * 100)} % terpene share — flavour will be subtle (low terpene content or aged flower).`,
      );
    }
    t1 = clamp(t1 + (input.firstOffsetC ?? 0), minC, maxC);
    const first = sim.run(s0, spec(ctx, t1, 0));

    // Later balloons: make the weakest balloon as strong as possible ("max–min" dose).
    // The greedy stepper raises the temperature only as far as needed to hold the dose,
    // so the session climbs smoothly and the last balloon lands near the goal's maximum.
    let a = 0;
    let b = sim.run(first.state, spec(ctx, maxC, 1)).result.cannMg;
    for (let i = 0; i < 24; i++) {
      const m = (a + b) / 2;
      if (stepSequence(ctx, first.state, t1, n, m, maxC).feasible) a = m;
      else b = m;
    }
    temps = stepSequence(ctx, first.state, t1, n, a, maxC).temps;
    const later = input.laterOffsetC ?? 0;
    if (later) {
      temps = temps.map((t, i) => (i === 0 ? t : clamp(t + later, minC, maxC)));
      for (let i = 1; i < temps.length; i++) temps[i] = Math.max(temps[i], temps[i - 1]);
    }
    const r1 = first.result;
    firstReason =
      `Balloon 1 at ${t1} °C: about ${fmt(r1.terpMg)} mg terpenes and ${fmt(r1.cannMg)} mg cannabinoids — ` +
      `${Math.round(r1.terpShare * 100)} % terpene share (goal “${goal.label}”: ≥ ${Math.round(goal.terpShareTarget * 100)} %).`;
  }

  // Final simulation of the chosen temperatures.
  let state = s0;
  const balloons: PlannedBalloon[] = temps.map((t, i) => {
    const sp = spec(ctx, t, i);
    const out = sim.run(state, sp);
    state = out.state;
    return {
      index: i,
      tempC: t,
      segments: sp.segments,
      pumpSeconds: seconds,
      preheatSeconds: sp.preheatSeconds,
      result: out.result,
      aroma: aromaOf(out.result),
      comfort: comfortOf(t, out.result.densityMgPerL),
    };
  });

  const sum = (f: (b: PlannedBalloon) => number) => balloons.reduce((s, b) => s + f(b), 0);
  const last = balloons[balloons.length - 1].result;
  const totalsOut = {
    terpMg: sum((b) => b.result.terpMg),
    cannMg: sum((b) => b.result.cannMg),
    thcMg: sum((b) => b.result.thcMg),
    cbdMg: sum((b) => b.result.cbdMg),
    cannReleased: last.cumCannReleased,
    terpReleased: last.cumTerpReleased,
  };

  // Explanation, in plain language.
  const ins = insight;
  const dom = ins.dominant.map((d) => `${COMPOUNDS[d.id].name} ${d.pct.toFixed(2)} %`).join(', ');
  explanation.push(
    `Terpenes ${ins.totalTerpPct.toFixed(2)} % (typical flower ≈ 1.9 %): ${dom || '—'}. ` +
      `${Math.round(ins.classShares.monoterpenes * 100)} % volatile monoterpenes, ` +
      `${Math.round(ins.classShares.sesquiterpenes * 100)} % sesquiterpenes, ` +
      `${Math.round((ins.classShares.oxygenatedMono + ins.classShares.lowVolatility) * 100)} % heavier alcohols.`,
  );
  explanation.push(firstReason);
  if (balloons.length === 2) {
    explanation.push(
      `Balloon 2 at ${temps[1]} °C (the goal’s top temperature) takes out most of what is left — ≈ ${fmt(balloons[1].result.cannMg)} mg cannabinoids.`,
    );
  } else if (balloons.length > 2) {
    const doses = balloons.slice(1).map((b) => b.result.cannMg);
    explanation.push(
      `Balloons 2–${balloons.length} step ${temps.slice(1).join(' → ')} °C so each carries ≈ ${fmt(
        doses.reduce((a, b) => a + b, 0) / doses.length,
      )} mg cannabinoids even though the herb depletes (flat temperatures would fade balloon by balloon).`,
    );
  }
  const b1 = balloons[0].result;
  explanation.push(
    `Flavour is front-loaded: balloon 1 holds ~${Math.round(b1.terpCapture * 100)} % of the loaded terpenes` +
      (balloons.length > 1 ? `, balloon 2 ~${Math.round(balloons[1].result.terpCapture * 100)} %.` : '.') +
      (b1.terpVented > 0.02
        ? ` The ${ctx.preheatFirst} s pre-heat vents ~${Math.round(b1.terpVented * 100)} % of them — shorten it for more taste.`
        : ''),
  );
  explanation.push(
    `Each balloon: ${seconds.toFixed(1)} s of pump ≈ ${((seconds * model.flowLpm) / 60).toFixed(1)} L. ` +
      `Session releases ~${Math.round(totalsOut.cannReleased * 100)} % of the cannabinoids.`,
  );

  if (temps.some((t) => t >= 215)) {
    warnings.push('Balloons at ≥ 215 °C are often felt as harsh; S&B advises raising temperature only as a last resort.');
  }
  if (balloons.length > 2) {
    const later = balloons.slice(1).map((b) => b.result.cannMg);
    if (Math.min(...later) < b1.cannMg * 0.8) {
      warnings.push('Later balloons will be thin — fewer balloons, a larger load or a higher maximum would use the herb better.');
    }
  }
  warnings.push(...assumed);

  return { input, balloons, insight, totals: totalsOut, explanation, warnings };
}

/** Re-simulates a user-edited plan (custom temperatures, segments, pump times). */
export function evaluateCustom(
  percentRaw: Amounts,
  loadMg: number,
  specs: BalloonSpec[],
  model: ModelParams = DEFAULT_MODEL,
): PlannedBalloon[] {
  const { percent } = completeProfile(percentRaw);
  const sim = new Simulator(amountsFromPercent(percent, loadMg), model);
  let state = sim.initialState();
  return specs.map((sp, i) => {
    const out = sim.run(state, sp);
    state = out.state;
    const seconds = sp.segments.reduce((s, x) => s + x.seconds, 0);
    const maxT = Math.max(...sp.segments.map((s) => s.tempC));
    return {
      index: i,
      tempC: maxT,
      segments: sp.segments,
      pumpSeconds: seconds,
      preheatSeconds: sp.preheatSeconds,
      result: out.result,
      aroma: aromaOf(out.result),
      comfort: comfortOf(maxT, out.result.densityMgPerL),
    };
  });
}

function fmt(x: number): string {
  return x >= 10 ? x.toFixed(0) : x.toFixed(1);
}
