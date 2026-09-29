import { describe, expect, it } from 'vitest';
import { vaporPressure } from './vaporPressure';
import { DEFAULT_MODEL, Simulator, amountsFromPercent, balloonRetention, kThc } from './releaseModel';
import { cylinderVolumeL, fillPlan, learnFromCalibrations, robinVolumeL, summarizeCalibrations, usableLengthCm, type BalloonProfile } from './balloon';
import { buildPlan, completeProfile, type PlanInput } from './planner';

// Reference values: vapor pressures derived from NIST WebBook / PubChem parameters.
const near = (actual: number, expected: number, relTol = 0.06) =>
  expect(Math.abs(actual - expected) / expected).toBeLessThan(relTol);

describe('vapor pressure models reproduce the reference tables (mmHg)', () => {
  it.each([
    ['myrcene', 180, 939],
    ['myrcene', 230, 2840],
    ['alphaPinene', 180, 1330],
    ['limonene', 180, 805],
    ['linalool', 200, 789],
    ['terpinolene', 200, 931],
    ['caryophyllene', 180, 86],
    ['caryophyllene', 230, 364],
    ['nerolidol', 200, 53],
    ['bisabolol', 180, 31],
    ['phytol', 200, 8.5],
    ['geraniol', 180, 178],
    ['valencene', 180, 101],
    ['guaiol', 180, 39],
    ['borneol', 180, 332],
    ['terpineol', 200, 473],
  ] as const)('%s at %i °C ≈ %d', (id, t, expected) => near(vaporPressure(id, t), expected));

  it.each([
    ['thc', 150, 0.054],
    ['thc', 180, 0.345],
    ['thc', 230, 3.93],
    ['cbd', 200, 1.56],
    ['cbn', 210, 1.44],
  ] as const)('%s at %i °C ≈ %d (NIST 2026 Clarke–Glew)', (id, t, expected) => near(vaporPressure(id, t), expected, 0.03));

  it('boiling points land at ~760 mmHg', () => {
    near(vaporPressure('limonene', 177.6), 760, 0.01);
    // Stull's Antoine fit puts myrcene's Tb ~4 K above the CRC value (known offset).
    near(vaporPressure('myrcene', 171), 760, 0.05);
  });
});

describe('release model', () => {
  it('THC rate constant matches the Volcano calibration (Eyal 2023)', () => {
    near(kThc(180, DEFAULT_MODEL), 0.0055, 0.001);
    const k220 = kThc(220, DEFAULT_MODEL);
    expect(k220).toBeGreaterThan(0.016);
    expect(k220).toBeLessThan(0.022);
  });

  it('pure-THC load: fraction released over time is close to measured values at 180 °C', () => {
    const sim = new Simulator({ thc: 40 }, DEFAULT_MODEL);
    const at = (s: number) =>
      sim.run(sim.initialState(), { segments: [{ tempC: 180, seconds: s }], preheatSeconds: 0 }).result.cumCannReleased;
    // Eyal: ~10 % @20 s, ~20 % @40 s, ~44 % @120 s, ~66 % @180 s
    expect(at(40)).toBeGreaterThan(0.13);
    expect(at(40)).toBeLessThan(0.24);
    expect(at(120)).toBeGreaterThan(0.36);
    expect(at(120)).toBeLessThan(0.52);
  });

  it('monoterpenes leave first (~20 s at 180 °C), sesquiterpenes follow, THC lags far behind (Eyal 2023)', () => {
    const sim = new Simulator({ myrcene: 1, caryophyllene: 1, nerolidol: 1, thc: 20 }, DEFAULT_MODEL);
    const { result } = sim.run(sim.initialState(), { segments: [{ tempC: 180, seconds: 20 }], preheatSeconds: 0 });
    const eta = DEFAULT_MODEL.deliveryTerp * DEFAULT_MODEL.firstBalloonDelivery;
    const myrcene = (result.delivered.myrcene ?? 0) / eta;
    const caryophyllene = (result.delivered.caryophyllene ?? 0) / eta;
    const nerolidol = (result.delivered.nerolidol ?? 0) / eta;
    expect(myrcene).toBeGreaterThan(0.85);
    expect(caryophyllene).toBeGreaterThan(0.4);
    expect(caryophyllene).toBeLessThan(myrcene);
    expect(nerolidol).toBeLessThan(caryophyllene);
    expect(result.cumCannReleased).toBeLessThan(0.12);
  });

  it('hotter settings release heavy terpenes faster (vapor-pressure driven)', () => {
    const at = (t: number) => {
      const sim = new Simulator({ nerolidol: 1 }, DEFAULT_MODEL);
      return sim.run(sim.initialState(), { segments: [{ tempC: t, seconds: 30 }], preheatSeconds: 0 }).result.terpMg;
    };
    expect(at(200)).toBeGreaterThan(at(170) * 1.3);
  });

  it('balloons decline at a fixed temperature once the herb depletes', () => {
    const sim = new Simulator(amountsFromPercent({ thc: 20, myrcene: 0.5 }, 250), DEFAULT_MODEL);
    const res = sim.runAll(Array.from({ length: 6 }, () => ({ segments: [{ tempC: 185, seconds: 45 }], preheatSeconds: 3 })));
    const doses = res.map((r) => r.cannMg);
    expect(doses[5]).toBeLessThan(doses[1]);
    expect(res[5].cumCannReleased).toBeGreaterThan(res[2].cumCannReleased);
  });

  it('balloon storage loses ~11 % THC in 10 minutes', () => {
    near(1 - balloonRetention(10), 0.105, 0.05);
  });
});

describe('balloon maths', () => {
  it('matches the worked examples (W, L in cm → litres)', () => {
    near(cylinderVolumeL(22, 60), 9.2, 0.02);
    near(robinVolumeL(22, 60), 7.7, 0.03);
    near(robinVolumeL(31, 60), 14.2, 0.03);
    near(robinVolumeL(20, 60), 6.5, 0.03);
  });

  const base: BalloonProfile = {
    id: 'b',
    name: 'Test',
    kind: 'diy',
    calibrations: [],
    fillPercent: 80,
    createdAt: new Date().toISOString(),
  };

  it('uses the calibrated time when present', () => {
    const plan = fillPlan({ ...base, fullTimeS: 40 }, 12, 90);
    expect(plan.seconds).toBe(32);
    expect(plan.source).toBe('calibrated');
  });

  it('caps uncalibrated balloons at 75 % and respects the pump limit', () => {
    const geo = fillPlan({ ...base, widthCm: 31, lengthCm: 60 }, 12, 90);
    expect(geo.fillPercent).toBe(75);
    near(geo.seconds, (14.2 / 0.2) * 0.75, 0.04);
    // the same balloon entered as a 68 cm cut piece has the same 60 cm inflatable length
    near(fillPlan({ ...base, widthCm: 31, lengthCm: 68, lengthIsCut: true }, 12, 90).seconds, geo.seconds, 0.001);
    const capped = fillPlan({ ...base, fullTimeS: 200, fillPercent: 90 }, 12, 90);
    expect(capped.seconds).toBe(90);
  });

  it('user calibration: official S&B tube 28 cm flat, 55 cm effective, brim in 51 s → model within 5 %', () => {
    const user = { ...base, id: 'user', kind: 'solidValve' as const, widthCm: 28, lengthCm: 55, fullTimeS: 51 };
    near(robinVolumeL(28, 55), 10.64, 0.01);
    const learning = learnFromCalibrations([user], 12)!;
    expect(learning.n).toBe(1);
    near(learning.factor, 51 / (robinVolumeL(28, 55) / 0.2), 0.001);
    expect(Math.abs(learning.factor - 1)).toBeLessThan(0.05);
    near(learning.samples[0].impliedL, 10.2, 0.01);
  });

  it('learns a correction from calibrated balloons and applies it to uncalibrated ones', () => {
    const cal = [
      { ...base, id: 'a', widthCm: 25, lengthCm: 47, fullTimeS: 44 },
      { ...base, id: 'b', widthCm: 25, lengthCm: 65, lengthIsCut: true, fullTimeS: 55 },
      { ...base, id: 'typo', widthCm: 2.5, lengthCm: 55, fullTimeS: 44 }, // cm/mm mix-up is ignored
    ];
    const learning = learnFromCalibrations(cal, 12)!;
    expect(learning.n).toBe(2);
    const model = (w: number, inflatable: number) => robinVolumeL(w, inflatable) / 0.2;
    near(learning.factor, (44 / model(25, 47) + 55 / model(25, usableLengthCm(65))) / 2, 0.001);
    const fresh = fillPlan({ ...base, id: 'new', widthCm: 25, lengthCm: 52, fillPercent: 70 }, 12, 90, learning);
    expect(fresh.source).toBe('learned');
    near(fresh.fullSeconds, model(25, 52) * learning.factor, 0.01);
    // presets and calibrated balloons are not changed by learning
    expect(fillPlan({ ...base, kind: 'easyValve' }, 12, 90, learning).source).toBe('preset');
    expect(fillPlan(cal[0], 12, 90, learning).fullSeconds).toBe(44);
  });

  it('derives the real pump flow from a measured volume', () => {
    const learning = learnFromCalibrations([{ ...base, volumeL: 9, fullTimeS: 50 }], 12)!;
    near(learning.measuredFlowLpm!, 10.8, 0.001);
  });

  it('summarises calibration runs and flags drift', () => {
    const at = new Date().toISOString();
    expect(summarizeCalibrations([{ at, seconds: 38 }, { at, seconds: 41 }, { at, seconds: 40 }]).fullTimeS).toBe(40);
    const drift = summarizeCalibrations([
      { at, seconds: 40 },
      { at, seconds: 40 },
      { at, seconds: 52 },
      { at, seconds: 53 },
      { at, seconds: 51 },
    ]);
    expect(drift.drift).toBeTruthy();
  });
});

describe('planner', () => {
  const input = (over: Partial<PlanInput> = {}): PlanInput => ({
    percent: { thc: 20, myrcene: 0.6, limonene: 0.4, caryophyllene: 0.4, linalool: 0.15, humulene: 0.15, alphaPinene: 0.1 },
    loadMg: 250,
    pumpSeconds: 32,
    balloonCount: 4,
    goal: 'balanced',
    minTempC: 160,
    maxTempC: 230,
    preheatSeconds: 5,
    ...over,
  });

  it('produces non-decreasing temperatures within the goal limits', () => {
    for (const goal of ['flavor', 'balanced', 'intense'] as const) {
      const plan = buildPlan(input({ goal }));
      const temps = plan.balloons.map((b) => b.tempC);
      for (let i = 1; i < temps.length; i++) expect(temps[i]).toBeGreaterThanOrEqual(temps[i - 1]);
      expect(Math.max(...temps)).toBeLessThanOrEqual(goal === 'flavor' ? 200 : goal === 'balanced' ? 210 : 222);
      expect(temps[0]).toBeGreaterThanOrEqual(160);
    }
  });

  it('orders the first balloon: flavor < balanced < intense', () => {
    const t = (goal: 'flavor' | 'balanced' | 'intense') => buildPlan(input({ goal })).balloons[0].tempC;
    expect(t('flavor')).toBeLessThan(t('balanced'));
    expect(t('balanced')).toBeLessThan(t('intense'));
  });

  it('a terpene-rich profile allows a hotter first balloon than a terpene-poor one', () => {
    const rich = buildPlan(input({ percent: { thc: 20, myrcene: 1.2, limonene: 0.8, caryophyllene: 0.8, linalool: 0.3 } }));
    const poor = buildPlan(input({ percent: { thc: 20, myrcene: 0.2, caryophyllene: 0.2, limonene: 0.1 } }));
    expect(rich.balloons[0].tempC).toBeGreaterThan(poor.balloons[0].tempC);
  });

  it('larger balloons lower the first-balloon temperature (more air carries more cannabinoid)', () => {
    const small = buildPlan(input({ pumpSeconds: 20 }));
    const big = buildPlan(input({ pumpSeconds: 60 }));
    expect(big.balloons[0].tempC).toBeLessThanOrEqual(small.balloons[0].tempC);
  });

  it('keeps later balloons roughly even in dose', () => {
    const plan = buildPlan(input({ balloonCount: 5, loadMg: 350 }));
    const doses = plan.balloons.slice(1, -1).map((b) => b.result.cannMg);
    const spread = (Math.max(...doses) - Math.min(...doses)) / Math.max(...doses);
    expect(spread).toBeLessThan(0.35);
  });

  it('fills in defaults for incomplete profiles', () => {
    const { percent, assumed } = completeProfile({});
    expect(percent.thc).toBe(18);
    expect(assumed.length).toBe(2);
    const plan = buildPlan(input({ percent: {} }));
    expect(plan.balloons.length).toBe(4);
  });

  it('single balloon plans respect the goal extraction', () => {
    const plan = buildPlan(input({ balloonCount: 1, goal: 'intense', loadMg: 100, pumpSeconds: 50 }));
    expect(plan.balloons).toHaveLength(1);
    expect(plan.balloons[0].tempC).toBeGreaterThan(195);
  });
});
