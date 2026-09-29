import { COMPOUNDS, type CompoundId, type VaporPressureModel } from './compounds';

const R = 8.314462618; // J/(mol·K)
const MMHG_PER_BAR = 750.0616827;
const PA_PER_MMHG = 133.322368;
const THETA = 307.15; // K, reference temperature of the NIST 2026 Clarke–Glew fits
const P0_PA = 100_000;

export const toKelvin = (c: number) => c + 273.15;

function evaluate(model: VaporPressureModel, tC: number): number {
  const T = toKelvin(tC);
  switch (model.kind) {
    case 'antoine':
      return Math.pow(10, model.A - model.B / (T + model.C)) * MMHG_PER_BAR;
    case 'cc': {
      const tRef = toKelvin(model.tRefC);
      return model.pRef * Math.exp(-((model.dH * 1000) / R) * (1 / T - 1 / tRef));
    }
    case 'twoPoint': {
      const t1 = toKelvin(model.t1C);
      const t2 = toKelvin(model.t2C);
      const b = Math.log(model.p2 / model.p1) / (1 / t1 - 1 / t2);
      return model.p1 * Math.exp(-b * (1 / T - 1 / t1));
    }
    case 'clarkeGlew': {
      const dG = model.dG * 1000;
      const dH = model.dH * 1000;
      const lnP =
        (-dG / THETA + dH * (1 / THETA - 1 / T) + model.dCp * (THETA / T - 1 + Math.log(T / THETA))) / R;
      return (P0_PA * Math.exp(lnP)) / PA_PER_MMHG;
    }
    case 'scaled':
      return model.factor * vaporPressure(model.of, tC);
  }
}

/** Saturation vapor pressure of the pure compound in mmHg at tC °C. */
export function vaporPressure(id: CompoundId, tC: number): number {
  return evaluate(COMPOUNDS[id].vp, tC);
}

/** How many times faster a compound evaporates than THC at the same temperature (ideal-solution ratio). */
export function volatilityVsThc(id: CompoundId, tC: number): number {
  return vaporPressure(id, tC) / vaporPressure('thc', tC);
}
