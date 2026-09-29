// Release model: how much of each compound leaves the herb and ends up in a balloon.
//
// Physics:
// - Nothing "boils" in a Volcano. Each compound evaporates below its boiling point at a
//   rate set by its vapor pressure; hot air strips it from the resin (first-order loss).
// - Cannabinoids: calibrated directly to Volcano (Medic) measurements, Eyal et al. 2023:
//   THC k ≈ 0.0055 s⁻¹ at 180 °C and ≈ 0.019 s⁻¹ at 220 °C (effective Ea ≈ 58 kJ/mol).
//   CBD/CBN/… scale with their vapor pressure relative to THC (NIST 2026 data).
// - Terpenes: 100–5000× more volatile than THC, so their release is limited by how fast the
//   herb heats and how fast air sweeps it, not by vapor pressure alone. Modelled as a
//   saturating rate k = kCap·P/(P + P½) at an effective herb temperature, gated by resin
//   mobility: trichome resin only flows once warm (rosin presses work at ~80–110 °C), which
//   is why ground flower keeps its aroma at room temperature despite high monoterpene
//   vapor pressures.
// - Delivery into the balloon is incomplete (condensation on chamber/valve/balloon):
//   Hazekamp 2006 and Lanz 2016 imply ~65–70 % of released cannabinoids reach the balloon;
//   Fischedick 2010 recovered 45–85 % of terpenes.
//
// This is an evidence-informed estimate, not a validated simulator. Absolute numbers carry
// roughly ±50 % uncertainty; the relative behaviour (what comes out first, how balloons
// decline, what a temperature step does) is the useful part.

import { isCannabinoid, type CompoundId } from './compounds';
import { toKelvin, vaporPressure } from './vaporPressure';

const R = 8.314462618;

export interface ModelParams {
  ambientC: number;
  /** THC first-order release constant at 180 °C set temperature (s⁻¹) */
  kThc180: number;
  /** Effective temperature sensitivity of THC release (kJ/mol) */
  eaEffKJ: number;
  /** Maximum terpene release rate (s⁻¹), limited by heat and mass transfer */
  terpKCap: number;
  /** Vapor pressure (mmHg) at which a terpene releases at half the cap */
  terpHalfPressure: number;
  /** Effective herb temperature = ambient + fraction·(set − ambient); the chamber runs cooler than the heater */
  herbTempFraction: number;
  /** Herb temperature (°C) at which trichome resin is half-mobilised */
  resinMobileC: number;
  /** Width (°C) of the resin-mobility transition */
  resinWidthC: number;
  /** Heat-up time constant for the first balloon (cold chamber), s */
  heatUpTauFirst: number;
  /** Heat-up time constant for later balloons (warm chamber), s */
  heatUpTauNext: number;
  /** Chamber temperature at the start of later balloons, °C */
  warmStartC: number;
  deliveryTerp: number;
  deliveryCann: number;
  /** Extra loss in the first balloon because chamber and valve are still cold */
  firstBalloonDelivery: number;
  /** Pump flow in litres per minute (Volcano Medic 2 spec: ~12 L/min) */
  flowLpm: number;
}

export const DEFAULT_MODEL: ModelParams = {
  ambientC: 25,
  kThc180: 0.0055,
  eaEffKJ: 58,
  terpKCap: 0.2,
  terpHalfPressure: 20,
  herbTempFraction: 0.65,
  resinMobileC: 92,
  resinWidthC: 8,
  heatUpTauFirst: 6,
  heatUpTauNext: 3,
  warmStartC: 70,
  deliveryTerp: 0.65,
  deliveryCann: 0.65,
  firstBalloonDelivery: 0.85,
  flowLpm: 12,
};

export type Amounts = Partial<Record<CompoundId, number>>;

export interface Segment {
  tempC: number;
  seconds: number;
}

export interface BalloonSpec {
  segments: Segment[];
  /** Pump seconds before the balloon is attached (that vapour is vented) */
  preheatSeconds: number;
}

export interface BalloonResult {
  delivered: Amounts;
  ventedInPreheat: Amounts;
  terpMg: number;
  cannMg: number;
  thcMg: number;
  cbdMg: number;
  /** Terpene share of the vapour mass in the balloon (0–1) */
  terpShare: number;
  volumeL: number;
  densityMgPerL: number;
  /** Cumulative share of the original cannabinoids released so far (0–1) */
  cumCannReleased: number;
  /** Cumulative share of the original terpenes released so far (0–1) */
  cumTerpReleased: number;
  /** Terpenes delivered in this balloon as a share of all terpenes loaded (0–1) */
  terpCapture: number;
  /** Terpene mass vented during pre-heat as a share of all terpenes loaded (0–1) */
  terpVented: number;
}

export interface SimState {
  left: Float64Array;
  prevSetC: number;
  index: number;
  releasedTerp: number;
  releasedCann: number;
}

export function kThc(setC: number, p: ModelParams): number {
  const T = toKelvin(setC);
  return p.kThc180 * Math.exp(-((p.eaEffKJ * 1000) / R) * (1 / T - 1 / toKelvin(180)));
}

export function herbTemp(setC: number, p: ModelParams): number {
  return p.ambientC + p.herbTempFraction * (setC - p.ambientC);
}

/** First-order release constant (s⁻¹) of a compound when the chamber is effectively at `effC`. */
export function releaseRate(id: CompoundId, effC: number, p: ModelParams): number {
  if (effC <= p.ambientC + 1) return 0;
  const tHerb = herbTemp(effC, p);
  if (isCannabinoid(id)) {
    const ratio = id === 'thc' ? 1 : vaporPressure(id, tHerb) / vaporPressure('thc', tHerb);
    return kThc(effC, p) * ratio;
  }
  const P = vaporPressure(id, tHerb);
  const mobility = 1 / (1 + Math.exp(-(tHerb - p.resinMobileC) / p.resinWidthC));
  return ((p.terpKCap * P) / (P + p.terpHalfPressure)) * mobility;
}

export function totals(a: Amounts) {
  let terp = 0;
  let cann = 0;
  for (const [id, mg] of Object.entries(a) as [CompoundId, number][]) {
    if (!mg) continue;
    if (isCannabinoid(id)) cann += mg;
    else terp += mg;
  }
  return { terp, cann };
}

/** Converts % w/w values and a load in mg into mg of each compound. */
export function amountsFromPercent(percent: Amounts, loadMg: number): Amounts {
  const out: Amounts = {};
  for (const [id, pct] of Object.entries(percent) as [CompoundId, number][]) {
    if (pct && pct > 0) out[id] = (loadMg * pct) / 100;
  }
  return out;
}

const GRID_STEP = 0.5;
const GRID_MAX_C = 245;
const DT = 0.25;

/**
 * Fast, stateful simulator. Release rates are tabulated once per compound over the
 * chamber-temperature range so a planner can run thousands of balloon simulations.
 */
export class Simulator {
  readonly ids: CompoundId[];
  private readonly cann: boolean[];
  private readonly initial: Float64Array;
  private readonly table: Float64Array[];
  private readonly gridStart: number;
  readonly totalTerp: number;
  readonly totalCann: number;

  constructor(
    initial: Amounts,
    readonly p: ModelParams = DEFAULT_MODEL,
  ) {
    this.ids = (Object.keys(initial) as CompoundId[]).filter((id) => (initial[id] ?? 0) > 0);
    this.cann = this.ids.map(isCannabinoid);
    this.initial = Float64Array.from(this.ids.map((id) => initial[id] ?? 0));
    this.gridStart = p.ambientC;
    const n = Math.ceil((GRID_MAX_C - this.gridStart) / GRID_STEP) + 1;
    this.table = this.ids.map((id) => {
      const row = new Float64Array(n);
      for (let i = 0; i < n; i++) row[i] = releaseRate(id, this.gridStart + i * GRID_STEP, p);
      return row;
    });
    const t = totals(initial);
    this.totalTerp = t.terp;
    this.totalCann = t.cann;
  }

  initialState(): SimState {
    return { left: Float64Array.from(this.initial), prevSetC: this.p.ambientC, index: 0, releasedTerp: 0, releasedCann: 0 };
  }

  private rate(i: number, effC: number): number {
    const x = (effC - this.gridStart) / GRID_STEP;
    if (x <= 0) return 0;
    const row = this.table[i];
    const lo = Math.floor(x);
    if (lo >= row.length - 1) return row[row.length - 1];
    const f = x - lo;
    return row[lo] * (1 - f) + row[lo + 1] * f;
  }

  run(state: SimState, spec: BalloonSpec): { state: SimState; result: BalloonResult } {
    const p = this.p;
    const first = state.index === 0;
    const tau = first ? p.heatUpTauFirst : p.heatUpTauNext;
    const left = Float64Array.from(state.left);
    const released = new Float64Array(this.ids.length);
    const vented = new Float64Array(this.ids.length);
    let eff = first ? p.ambientC : Math.min(p.warmStartC, state.prevSetC);
    let prevSetC = state.prevSetC;

    const advance = (setC: number, seconds: number, sink: Float64Array) => {
      const n = Math.max(1, Math.round(seconds / DT));
      const dt = seconds / n;
      const decay = Math.exp(-dt / tau);
      for (let s = 0; s < n; s++) {
        eff = setC - (setC - eff) * decay;
        for (let i = 0; i < left.length; i++) {
          const m = left[i];
          if (m <= 0) continue;
          const dm = m * (1 - Math.exp(-this.rate(i, eff) * dt));
          left[i] = m - dm;
          sink[i] += dm;
        }
      }
    };

    const segs = spec.segments.filter((s) => s.seconds > 0);
    if (segs.length && spec.preheatSeconds > 0) advance(segs[0].tempC, spec.preheatSeconds, vented);
    let seconds = 0;
    for (const seg of segs) {
      advance(seg.tempC, seg.seconds, released);
      seconds += seg.seconds;
      prevSetC = seg.tempC;
    }

    const delivered: Amounts = {};
    const ventedOut: Amounts = {};
    const factor = first ? p.firstBalloonDelivery : 1;
    let terp = 0;
    let cann = 0;
    let relTerp = 0;
    let relCann = 0;
    let ventTerp = 0;
    this.ids.forEach((id, i) => {
      const eta = this.cann[i] ? p.deliveryCann : p.deliveryTerp;
      const d = released[i] * eta * factor;
      if (d > 0) delivered[id] = d;
      if (vented[i] > 0) ventedOut[id] = vented[i];
      if (this.cann[i]) {
        cann += d;
        relCann += released[i] + vented[i];
      } else {
        terp += d;
        relTerp += released[i] + vented[i];
        ventTerp += vented[i];
      }
    });
    const releasedTerp = state.releasedTerp + relTerp;
    const releasedCann = state.releasedCann + relCann;
    const volumeL = (seconds * p.flowLpm) / 60;
    const result: BalloonResult = {
      delivered,
      ventedInPreheat: ventedOut,
      terpMg: terp,
      cannMg: cann,
      thcMg: delivered.thc ?? 0,
      cbdMg: delivered.cbd ?? 0,
      terpShare: terp + cann > 0 ? terp / (terp + cann) : 0,
      volumeL,
      densityMgPerL: volumeL > 0 ? (terp + cann) / volumeL : 0,
      cumCannReleased: this.totalCann > 0 ? releasedCann / this.totalCann : 0,
      cumTerpReleased: this.totalTerp > 0 ? releasedTerp / this.totalTerp : 0,
      terpCapture: this.totalTerp > 0 ? terp / this.totalTerp : 0,
      terpVented: this.totalTerp > 0 ? ventTerp / this.totalTerp : 0,
    };
    return { state: { left, prevSetC, index: state.index + 1, releasedTerp, releasedCann }, result };
  }

  runAll(specs: BalloonSpec[]): BalloonResult[] {
    let state = this.initialState();
    return specs.map((spec) => {
      const out = this.run(state, spec);
      state = out.state;
      return out.result;
    });
  }
}

export function simulate(initial: Amounts, balloons: BalloonSpec[], p: ModelParams = DEFAULT_MODEL): BalloonResult[] {
  return new Simulator(initial, p).runAll(balloons);
}

/** THC left in a stored balloon after `minutes` (Hazekamp 2006: ~11 % lost at 10 min, ~90 % at 3 h). */
export function balloonRetention(minutes: number): number {
  return Math.exp(-minutes / 90);
}

export type Comfort = 'smooth' | 'moderate' | 'harsh';

/**
 * Heuristic comfort label. Harshness rises with temperature (S&B IFU; 5 of 12 subjects
 * coughed at ~225 °C in Zuurman 2008) and with vapour density.
 */
export function comfortOf(maxTempC: number, densityMgPerL: number): Comfort {
  const score = Math.max(0, (maxTempC - 195) / 25) + Math.max(0, (densityMgPerL - 1.2) / 1.2);
  if (score < 0.55) return 'smooth';
  if (score < 1.1) return 'moderate';
  return 'harsh';
}
