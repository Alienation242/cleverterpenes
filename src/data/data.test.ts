import { describe, expect, it } from 'vitest';
import { parseCoaText } from './coaParser';
import { mapRecord, parseRegistryValue } from './ctRegistry';
import { cleanQuery, diceSimilarity } from './names';
import { searchStrains, type StrainDb } from './strainDb';

describe('COA / label parser', () => {
  it('reads a German pharmacy label with decimal commas and acids', () => {
    const r = parseCoaText(`THC-Säure (THCA): 24,6 %
THC: 0,8 %
CBD: < 0,05 %
β-Myrcen 0,45 %
Limonen 0,31 %
β-Caryophyllen 0,52 %
Linalool n.n.
α-Humulen 0,14 %
Caryophyllenoxid 0,03 %`);
    expect(r.percent.myrcene).toBeCloseTo(0.45);
    expect(r.percent.limonene).toBeCloseTo(0.31);
    expect(r.percent.caryophyllene).toBeCloseTo(0.52);
    expect(r.percent.humulene).toBeCloseTo(0.14);
    expect(r.percent.caryophylleneOxide).toBeCloseTo(0.03);
    expect(r.percent.thc).toBeCloseTo(0.8 + 0.877 * 24.6, 1);
    expect(r.belowLimit).toContain('linalool');
  });

  it('reads an English COA table in mg/g and ppm', () => {
    const r = parseCoaText(`Analyte | Result | Unit
beta-Myrcene | 6.12 | mg/g
d-Limonene | 3.40 | mg/g
alpha-Pinene | 850 | ppm
1,8-Cineole | ND |
Total THC | 22.1 | %`);
    expect(r.percent.myrcene).toBeCloseTo(0.612);
    expect(r.percent.limonene).toBeCloseTo(0.34);
    expect(r.percent.alphaPinene).toBeCloseTo(0.085);
    expect(r.percent.thc).toBeCloseTo(22.1);
    expect(r.belowLimit).toContain('eucalyptol');
  });

  it('does not confuse α-/β-pinene or caryophyllene / its oxide', () => {
    const r = parseCoaText('α-Pinene 0.10%\nβ-Pinene 0.07%\nCaryophyllene oxide 0.02%\nβ-Caryophyllene 0.4%');
    expect(r.percent.alphaPinene).toBeCloseTo(0.1);
    expect(r.percent.betaPinene).toBeCloseTo(0.07);
    expect(r.percent.caryophylleneOxide).toBeCloseTo(0.02);
    expect(r.percent.caryophyllene).toBeCloseTo(0.4);
  });
});

describe('Connecticut registry mapping', () => {
  it('parses text values and converts THCA to total THC', () => {
    expect(parseRegistryValue('<0.10')).toBe(0);
    expect(parseRegistryValue('1.16')).toBe(1.16);
    const p = mapRecord({
      brand_name: 'Some Serious TK43 3.5g Flower 00080',
      tetrahydrocannabinol_thc: '1.125',
      tetrahydrocannabinol_acid_thca: '30.660',
      b_myrcene: '1.16',
      b_caryophyllene: '0.66',
      limonene: '0.67',
      linalool_lin: '0.39',
      humulene_hum: '0.20',
      a_pinene: '0.07',
      b_pinene: '0.09',
      ocimene: '0.03',
    });
    expect(p.percent.thc).toBeCloseTo(1.125 + 0.877 * 30.66, 1);
    expect(p.terpenesMeasured).toBe(8);
  });
});

describe('strain name matching', () => {
  const db = {
    terpenes: [],
    cannabinoids: [],
    strains: [
      { s: 'blue-dream', n: 'Blue Dream', k: 552, pop: 0.9 },
      { s: 'original-glue', n: 'Original Glue (GG4 / Gorilla Glue #4)', k: 973, pop: 0.8 },
      { s: 'blueberry', n: 'Blueberry', k: 100, pop: 0.5 },
    ],
  } as unknown as StrainDb;

  it('cleans product names', () => {
    expect(cleanQuery('Blue Dream 3.5g Flower 00345')).toBe('blue dream');
  });

  it('finds exact, alias and fuzzy matches', () => {
    expect(searchStrains(db, 'Blue Dream')[0].strain.s).toBe('blue-dream');
    expect(searchStrains(db, 'GG4')[0].strain.s).toBe('original-glue');
    expect(searchStrains(db, 'Gorilla Glue')[0].strain.s).toBe('original-glue');
    expect(searchStrains(db, 'blu dreem')[0].strain.s).toBe('blue-dream');
  });

  it('dice similarity is symmetric and bounded', () => {
    expect(diceSimilarity('night', 'nacht')).toBeCloseTo(diceSimilarity('nacht', 'night'));
    expect(diceSimilarity('abc', 'abc')).toBe(1);
  });
});
