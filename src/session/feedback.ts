import type { SessionRating, StrainPrefs } from '../data/types';

/**
 * Turns a session rating into small temperature adjustments for the next plan of the same strain.
 * Deliberately conservative (±2–4 °C per rating, capped at ±15 °C in total).
 */
export function adjustmentFromRating(r: SessionRating): { firstC: number; laterC: number; text: string } {
  let firstC = 0;
  let laterC = 0;
  const notes: string[] = [];
  if (r.smoothness <= 2) {
    laterC -= 4;
    firstC -= 2;
    notes.push('harsh → cooler balloons');
  }
  if (r.strength === 1) {
    laterC -= 4;
    notes.push('too strong → −4 °C on later balloons');
  } else if (r.strength === -1 && r.smoothness > 2) {
    laterC += 4;
    notes.push('too weak → +4 °C on later balloons');
  }
  if (r.taste <= 2 && r.strength !== -1) {
    firstC -= 4;
    notes.push('little flavour → cooler first balloon');
  }
  if (!notes.length) notes.push('dialled in — no change');
  return { firstC, laterC, text: notes.join(' · ') };
}

export function applyAdjustment(prefs: StrainPrefs, adj: { firstC: number; laterC: number }): Partial<StrainPrefs> {
  const clamp = (x: number) => Math.max(-15, Math.min(15, x));
  return {
    firstOffsetC: clamp((prefs.firstOffsetC ?? 0) + adj.firstC),
    laterOffsetC: clamp((prefs.laterOffsetC ?? 0) + adj.laterC),
  };
}
