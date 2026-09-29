import { describe, expect, it } from 'vitest';
import { findCompoundNames } from './coaParser';
import { combineEstimates, estimateFromLineage, estimateFromNames, fromDbStrain, typicalProfile, type TerpeneSetDb } from './estimate';
import { describeLineage, parseCross, resolveLineage } from './lineage';
import { parseProductName } from './productName';
import type { DbStrain, StrainDb } from './strainDb';

describe('German product names', () => {
  it('parses brand, THC/CBD, origin, code and cultivar', () => {
    const p = parseProductName('Huala 22/1 CA ALM Alien Mints');
    expect(p).toMatchObject({ brand: 'Huala', thc: 22, cbdBelowOne: true, originCode: 'CA', origin: 'Canada', code: 'ALM', cultivar: 'Alien Mints' });
    expect(parseProductName('Aurora 20/1 Pink Kush')).toMatchObject({ brand: 'Aurora', thc: 20, cultivar: 'Pink Kush' });
    expect(parseProductName('101-BLOOM Pink Certz 22/1')).toMatchObject({ brand: '101-BLOOM', thc: 22, cultivar: 'Pink Certz' });
    expect(parseProductName('Bediol 6/8')).toMatchObject({ thc: 6, cbd: 8 });
    expect(parseProductName('Blue Dream').cultivar).toBe('Blue Dream');
    expect(parseProductName('Blue Dream').thc).toBeUndefined();
  });

  it('finds terpene names without amounts (German spelling, any order)', () => {
    expect(findCompoundNames('Terpene: Myrcen, D-Limonen, α-Humulen, β-Caryophyllen, Linalool')).toEqual([
      'myrcene',
      'limonene',
      'humulene',
      'caryophyllene',
      'linalool',
    ]);
    expect(findCompoundNames('Caryophyllenoxid und β-Caryophyllen')).toEqual(['caryophylleneOxide', 'caryophyllene']);
  });

  it('parses crosses from names and package text', () => {
    expect(parseCross('Runtz x Alien Mintz')).toEqual(['Runtz', 'Alien Mintz']);
    expect(parseCross('Sorte: Alien Mints\nGenetik: Alien Cookies × Animal Mints')).toEqual(['Alien Cookies', 'Animal Mints']);
    expect(parseCross('Blue Dream')).toBeNull();
  });
});

const sets: TerpeneSetDb = {
  terpenes: ['myrcene', 'limonene', 'caryophyllene', 'humulene', 'linalool'],
  total: 1.8,
  main: { myrcene: 0.4, limonene: 0.3, caryophyllene: 0.3, humulene: 0.12, linalool: 0.12 },
  minor: {},
  sets: [
    { k: 3, s: ['caryophyllene', 'limonene', 'myrcene'], n: 400, m: [0.3, 0.32, 0.4, 0.1, 0.05] },
    { k: 2, s: ['caryophyllene', 'limonene'], n: 900, m: [0.1, 0.35, 0.45, 0.12, 0.06] },
    { k: 2, s: ['limonene', 'myrcene'], n: 200, m: [0.5, 0.3, 0.1, 0.03, 0.04] },
  ],
};

describe('estimate from terpene names', () => {
  it('uses the exact top-k combination when it is common enough', () => {
    const r = estimateFromNames(sets, ['myrcene', 'limonene', 'caryophyllene']);
    expect(r.percent).toMatchObject({ myrcene: 0.3, limonene: 0.32, caryophyllene: 0.4 });
    expect(r.provenance.method).toBe('names-estimate');
    expect(r.provenance.steps.join(' ')).toContain('400');
    expect(r.confidence).toBe('medium');
  });

  it('falls back to subsets, raises listed terpenes and adds unmeasured ones', () => {
    const r = estimateFromNames(sets, ['limonene', 'caryophyllene', 'linalool', 'eucalyptol']);
    expect(r.percent.limonene).toBeGreaterThan(0.3);
    expect(r.percent.linalool).toBeGreaterThanOrEqual(0.072 - 1e-9); // 0.6 × main
    expect(r.percent.eucalyptol).toBe(0.06);
    expect(r.confidence).toBe('low');
    expect(r.provenance.steps.some((s) => s.includes('not measured'))).toBe(true);
  });
});

const strain = (s: string, n: string, k: number, t: Record<string, number>): DbStrain => ({
  s,
  n,
  k,
  kc: k,
  p: 5,
  l: 2,
  r: ['FL'],
  src: ['smith'],
  y: null,
  c: null,
  pop: 0,
  t: Object.fromEntries(Object.entries(t).map(([id, v]) => [id, [v, v * 0.8, v * 1.2, 1]])),
  tt: null,
  cn: { thc: [20, 18, 22] },
  dom: [['limonene', 0.6]],
  chem: null,
  conf: 'medium',
});

const db = {
  strains: [
    strain('alien-cookies', 'Alien Cookies', 16, { limonene: 0.4, caryophyllene: 0.3 }),
    strain('bubba-kush', 'Bubba Kush', 85, { myrcene: 0.5, caryophyllene: 0.2 }),
    strain('animal-mints', 'Animal Mints', 9, { limonene: 0.2, caryophyllene: 0.5 }),
  ],
} as unknown as StrainDb;

describe('estimate from parents', () => {
  it('resolves reported lineage recursively (Kush Mints has no lab data → its parents)', () => {
    const node = resolveLineage(db, 'Alien Mints');
    expect(node.kind).toBe('cross');
    const r = estimateFromLineage(node)!;
    // Alien Mints = Alien Cookies × (Bubba Kush × Animal Mints)
    expect(r.percent.limonene).toBeCloseTo((0.4 + (0 + 0.2) / 2) / 2, 3);
    expect(r.percent.myrcene).toBeCloseTo((0 + 0.25) / 2, 3);
    expect(r.provenance.method).toBe('lineage-estimate');
    const text = describeLineage(node).join(' ');
    expect(text).toContain('commonly reported');
    expect(text).toContain('Kush Mints: no own lab data');
  });

  it('uses stated parents and combines with the names estimate (60/40)', () => {
    const lin = estimateFromLineage(resolveLineage(db, 'Mystery', ['Alien Cookies', 'Bubba Kush']))!;
    const names = estimateFromNames(sets, ['myrcene', 'limonene', 'caryophyllene']);
    const both = combineEstimates(names, lin);
    expect(both.provenance.method).toBe('combined-estimate');
    expect(both.percent.limonene).toBeCloseTo(0.6 * 0.32 + 0.4 * 0.2, 3);
  });

  it('lab data for the strain itself always has the lab-strain method', () => {
    const r = fromDbStrain(db.strains[0], 'alien cookies');
    expect(r.provenance.method).toBe('lab-strain');
    expect(typicalProfile().provenance.method).toBe('typical');
  });
});
