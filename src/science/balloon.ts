// Balloon volume and fill-time maths.
//
// - Volcano pump: on/off only, ~12 L/min (Volcano Medic 2 IFU; same platform as the Hybrid).
// - Length can be entered two ways: the inflatable length (valve to where the air stops at the
//   top, without the knot tip) or the cut length, of which ~8 cm go into the knot and the valve
//   fold (S&B: tie one end, pull the fixation ring ~3 cm over 16 pleats).
// - Validated by a user calibration (2026-09-29): official S&B balloon tube, 28 cm flat, 55 cm
//   inflatable, filled to the brim in 51 s → Robin model 10.6 L / 53.2 s at 12 L/min (+4 %).
// - Tubular balloon of lay-flat width W and inflatable length L:
//     upper bound (ideal cylinder)   V = W²·L/π
//     practical (Robin "paper bag")  V ≈ W²·L/π − 0.142·W³·(1 − 10^(−L/W))
// - "Full" = just taut (no wrinkles). S&B: never fill completely (over-pressure loses vapour).
// - Calibrating the time-to-taut with the real balloon beats any geometry estimate.

export type BalloonKind = 'easyValve' | 'easyValveXL' | 'solidValve' | 'diy';

export interface Calibration {
  at: string;
  seconds: number;
}

export interface BalloonProfile {
  id: string;
  name: string;
  kind: BalloonKind;
  /** Lay-flat width in cm (measured flat, unstretched) */
  widthCm?: number;
  /** Length in cm — the inflatable length (valve to top), or the cut length if lengthIsCut */
  lengthCm?: number;
  /** lengthCm is the cut piece; the knot and valve fold (~8 cm) are subtracted */
  lengthIsCut?: boolean;
  /** Measured volume in litres (e.g. water displacement) — overrides geometry */
  volumeL?: number;
  /** Calibrated seconds until "just taut" (median of runs) */
  fullTimeS?: number;
  calibrations: Calibration[];
  /** Target fill in % of full (S&B: never 100 %) */
  fillPercent: number;
  notes?: string;
  createdAt: string;
}

export const BALLOON_PRESETS: Record<BalloonKind, { label: string; nominalL: number; lengthCm: number; note: string }> = {
  easyValve: {
    label: 'Easy Valve (standard)',
    nominalL: 8,
    lengthCm: 60,
    note: '≈ 8 L (retailers; Hazekamp 2006 used a 55 cm ≈ 8 L balloon). Users report 30–40 s to fill on a Hybrid.',
  },
  easyValveXL: {
    label: 'Easy Valve XL',
    nominalL: 12.5,
    lengthCm: 90,
    note: '≈ 12–13 L (estimate from 90 cm length; calibrate it).',
  },
  solidValve: {
    label: 'Solid Valve (cut from roll)',
    nominalL: 8,
    lengthCm: 60,
    note: 'S&B: 3 m roll = five 60 cm balloons. The official tube measured ~28 cm flat (user measurement). Enter width and length.',
  },
  diy: {
    label: 'Self-made (oven bag / roasting tube)',
    nominalL: 8,
    lengthCm: 55,
    note: 'Width varies a lot (e.g. Toppits Bratschlauch 31 cm ≈ 1.7× a standard balloon). Measure or calibrate.',
  },
};

/** Length lost to the knot and the valve fold (knot ~5 cm, fixation ring ~3 cm over the pleats). */
export const KNOT_AND_FOLD_CM = 8;

export function usableLengthCm(cutLengthCm: number): number {
  return Math.max(5, cutLengthCm - KNOT_AND_FOLD_CM);
}

/** Inflatable length of a balloon profile, whichever way its length was entered. */
export function inflatableLengthCm(b: Pick<BalloonProfile, 'lengthCm' | 'lengthIsCut'>): number | undefined {
  if (!b.lengthCm || b.lengthCm <= 0) return undefined;
  return b.lengthIsCut ? usableLengthCm(b.lengthCm) : b.lengthCm;
}

export function cylinderVolumeL(widthCm: number, lengthCm: number): number {
  return (widthCm * widthCm * lengthCm) / Math.PI / 1000;
}

export function robinVolumeL(widthCm: number, lengthCm: number): number {
  const w = Math.min(widthCm, lengthCm);
  const h = Math.max(widthCm, lengthCm);
  const v = w ** 3 * (h / (Math.PI * w) - 0.142 * (1 - Math.pow(10, -h / w)));
  return Math.max(0, v / 1000);
}

export type VolumeSource = 'measured' | 'geometry' | 'preset';

export interface VolumeEstimate {
  litres: number;
  upperBoundL?: number;
  source: VolumeSource;
}

export function estimateVolume(b: BalloonProfile): VolumeEstimate {
  if (b.volumeL && b.volumeL > 0) return { litres: b.volumeL, source: 'measured' };
  const usable = inflatableLengthCm(b);
  if (b.widthCm && b.widthCm > 0 && usable) {
    return {
      litres: robinVolumeL(b.widthCm, usable),
      upperBoundL: cylinderVolumeL(b.widthCm, usable),
      source: 'geometry',
    };
  }
  return { litres: BALLOON_PRESETS[b.kind].nominalL, source: 'preset' };
}

export type FillSource = 'calibrated' | 'learned' | VolumeSource;

export interface LearningSample {
  id: string;
  name: string;
  widthCm: number;
  lengthCm: number;
  lengthIsCut: boolean;
  /** Robin-formula volume from width × inflatable length */
  modelL: number;
  /** Time-to-taut the geometry model predicts at the configured flow */
  predictedS: number;
  /** Calibrated time-to-taut */
  measuredS: number;
  /** measured ÷ predicted */
  ratio: number;
  /** Volume the calibration implies at the configured flow */
  impliedL: number;
}

export interface CalibrationLearning {
  /** Median measured ÷ predicted time over calibrated balloons with width × length (1 = model exact) */
  factor: number;
  n: number;
  range: [number, number];
  samples: LearningSample[];
  /** Pump flow implied by balloons with a measured (water-displacement) volume, L/min */
  measuredFlowLpm?: number;
}

/** Ratios outside this band are almost certainly typos (cm vs mm, a leaking balloon) and are ignored. */
const RATIO_BAND: [number, number] = [0.3, 3];

/**
 * Learns from the user's own calibrations. Each calibrated balloon with width × length says
 * how its real time-to-taut compares with the geometry model at the configured pump flow.
 * The median ratio folds together everything the model can't see — knot and pleat losses,
 * how taut "taut" is for this user, film stiffness, the real pump flow and chamber
 * resistance — and is applied to self-made balloons that haven't been calibrated yet.
 * A balloon with a measured volume additionally reveals the real pump flow (V / t).
 */
export function learnFromCalibrations(balloons: BalloonProfile[], flowLpm: number): CalibrationLearning | null {
  const flowLps = flowLpm / 60;
  const samples: LearningSample[] = [];
  const flows: number[] = [];
  for (const b of balloons) {
    if (!b.fullTimeS || b.fullTimeS <= 0) continue;
    if (b.volumeL && b.volumeL > 0) flows.push((b.volumeL / b.fullTimeS) * 60);
    const usable = inflatableLengthCm(b);
    if (!b.widthCm || !usable || !b.lengthCm) continue;
    const modelL = robinVolumeL(b.widthCm, usable);
    if (modelL <= 0) continue;
    const predictedS = modelL / flowLps;
    const ratio = b.fullTimeS / predictedS;
    if (ratio < RATIO_BAND[0] || ratio > RATIO_BAND[1]) continue;
    samples.push({
      id: b.id,
      name: b.name,
      widthCm: b.widthCm,
      lengthCm: b.lengthCm,
      lengthIsCut: !!b.lengthIsCut,
      modelL,
      predictedS,
      measuredS: b.fullTimeS,
      ratio,
      impliedL: b.fullTimeS * flowLps,
    });
  }
  if (!samples.length && !flows.length) return null;
  const ratios = samples.map((s) => s.ratio);
  return {
    factor: samples.length ? median(ratios) : 1,
    n: samples.length,
    range: samples.length ? [Math.min(...ratios), Math.max(...ratios)] : [1, 1],
    samples,
    measuredFlowLpm: flows.length ? median(flows) : undefined,
  };
}

export interface FillPlan {
  /** Pump seconds for the chosen fill % */
  seconds: number;
  /** Estimated seconds to "just taut" */
  fullSeconds: number;
  /** Effective fill % after safety caps */
  fillPercent: number;
  litres: number;
  source: FillSource;
  warnings: string[];
}

/** Uncalibrated balloons are capped because W is hard to measure (V ∝ W², 5 % error → 10 %). */
const UNCALIBRATED_MAX_FILL = 75;

export function fillPlan(
  b: BalloonProfile,
  flowLpm: number,
  maxPumpSeconds: number,
  learning?: CalibrationLearning | null,
): FillPlan {
  const warnings: string[] = [];
  const flowLps = flowLpm / 60;
  let fullSeconds: number;
  let source: FillSource;
  let fill = Math.min(100, Math.max(10, b.fillPercent));

  if (b.fullTimeS && b.fullTimeS > 0) {
    fullSeconds = b.fullTimeS;
    source = 'calibrated';
  } else {
    const vol = estimateVolume(b);
    fullSeconds = vol.litres / flowLps;
    source = vol.source;
    if (vol.source === 'geometry' && learning && learning.n > 0) {
      fullSeconds *= learning.factor;
      source = 'learned';
      warnings.push(
        `Estimated from your ${learning.n} calibrated balloon${learning.n > 1 ? 's' : ''} (geometry ×${learning.factor.toFixed(2)}). Calibrate this one to be exact.`,
      );
    }
    if (fill > UNCALIBRATED_MAX_FILL) {
      warnings.push(`Not calibrated yet — fill capped at ${UNCALIBRATED_MAX_FILL} % for safety.`);
      fill = UNCALIBRATED_MAX_FILL;
    }
  }

  let seconds = (fullSeconds * fill) / 100;
  if (seconds > maxPumpSeconds) {
    warnings.push(`Capped at the ${maxPumpSeconds} s pump limit (Settings).`);
    seconds = maxPumpSeconds;
    fill = (seconds / fullSeconds) * 100;
  }
  if (b.calibrations.length) {
    const last = b.calibrations[b.calibrations.length - 1];
    const ageDays = (Date.now() - new Date(last.at).getTime()) / 86_400_000;
    if (ageDays > 28) warnings.push('Calibration is older than 4 weeks — re-check (pump/filter drift).');
  }
  return {
    seconds: Math.round(seconds * 10) / 10,
    fullSeconds: Math.round(fullSeconds * 10) / 10,
    fillPercent: Math.round(fill),
    litres: (fullSeconds * flowLps * fill) / 100,
    source,
    warnings,
  };
}

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median of the last three calibration runs, plus a drift warning (>15 % change). */
export function summarizeCalibrations(runs: Calibration[]): { fullTimeS?: number; drift?: string } {
  if (!runs.length) return {};
  const recent = runs.slice(-3).map((r) => r.seconds);
  const fullTimeS = Math.round(median(recent) * 10) / 10;
  let drift: string | undefined;
  if (runs.length > 3) {
    const older = median(runs.slice(0, -3).map((r) => r.seconds));
    const change = (fullTimeS - older) / older;
    if (Math.abs(change) > 0.15) {
      drift = `Fill time changed ${change > 0 ? '+' : ''}${Math.round(change * 100)} % vs. earlier runs — check the air filter, balloon and seals.`;
    }
  }
  return { fullTimeS, drift };
}
