// Reference data for cannabis terpenes and cannabinoids.
//
// Every vapor-pressure model below comes from PubChem, the NIST Chemistry WebBook, and
// NIST's 2026 gas-saturation study for THC/CBD/CBN.
// Values are mmHg; temperatures °C unless a field says otherwise.

export type CompoundClass =
  | 'monoterpene'
  | 'monoterpenoid'
  | 'sesquiterpene'
  | 'sesquiterpenoid'
  | 'diterpenoid'
  | 'cannabinoid';

export type VaporPressureModel =
  /** NIST form: log10(P/bar) = A − B/(T/K + C) */
  | { kind: 'antoine'; A: number; B: number; C: number }
  /** Clausius–Clapeyron anchored at (tRefC, pRef mmHg) with ΔHvap in kJ/mol */
  | { kind: 'cc'; tRefC: number; pRef: number; dH: number }
  /** Two measured (T, P) points, ln P linear in 1/T */
  | { kind: 'twoPoint'; t1C: number; p1: number; t2C: number; p2: number }
  /** Clarke–Glew fit (NIST 2026): p0 = 100 kPa, θ = 307.15 K; ΔG, ΔH in kJ/mol, ΔCp in J/(mol·K) */
  | { kind: 'clarkeGlew'; dG: number; dH: number; dCp: number }
  /** Estimate: a fixed multiple of another compound's vapor pressure */
  | { kind: 'scaled'; of: CompoundId; factor: number };

export type Confidence = 'high' | 'medium' | 'low';

export interface Compound {
  id: CompoundId;
  name: string;
  cls: CompoundClass;
  /** Normal boiling point at 760 mmHg in °C (null = unknown / hypothetical) */
  bp760: number | null;
  bpNote: string;
  /** What popular "vaporization temperature" charts claim, if it differs from reality */
  chartClaim?: { value: string; explanation: string };
  vp: VaporPressureModel;
  vpConfidence: Confidence;
  aroma: string;
  /** Lower-case aliases incl. German spellings, used by the label/COA parser */
  aliases: string[];
}

export type TerpeneId =
  | 'myrcene'
  | 'limonene'
  | 'alphaPinene'
  | 'betaPinene'
  | 'terpinolene'
  | 'ocimene'
  | 'camphene'
  | 'carene'
  | 'alphaTerpinene'
  | 'gammaTerpinene'
  | 'sabinene'
  | 'pCymene'
  | 'linalool'
  | 'eucalyptol'
  | 'borneol'
  | 'fenchol'
  | 'terpineol'
  | 'geraniol'
  | 'isopulegol'
  | 'caryophyllene'
  | 'humulene'
  | 'valencene'
  | 'farnesene'
  | 'nerolidol'
  | 'bisabolol'
  | 'guaiol'
  | 'caryophylleneOxide'
  | 'phytol';

export type CannabinoidId = 'thc' | 'cbd' | 'cbn' | 'cbg' | 'cbc' | 'thcv';
export type CompoundId = TerpeneId | CannabinoidId;

const c = (x: Compound) => x;

export const COMPOUNDS: Record<CompoundId, Compound> = {
  myrcene: c({
    id: 'myrcene',
    name: 'β-Myrcene',
    cls: 'monoterpene',
    bp760: 167,
    bpNote: '166–168 °C (CRC Handbook; NIST 440.2 K)',
    vp: { kind: 'antoine', A: 4.56112, B: 1849.102, C: -38.899 },
    vpConfidence: 'high',
    aroma: 'earthy, musky, ripe mango, herbal',
    aliases: ['beta-myrcene', 'b-myrcene', 'myrcene', 'myrcen', 'beta-myrcen', 'b-myrcen'],
  }),
  limonene: c({
    id: 'limonene',
    name: 'd-Limonene',
    cls: 'monoterpene',
    bp760: 177.6,
    bpNote: '175–178 °C (CRC 95th ed.; NIST 450 K)',
    vp: { kind: 'cc', tRefC: 177.6, pRef: 760, dH: 40.9 },
    vpConfidence: 'high',
    aroma: 'citrus peel, orange, lemon',
    aliases: ['d-limonene', 'r-limonene', '(+)-limonene', 'limonene', 'limonen', 'd-limonen'],
  }),
  alphaPinene: c({
    id: 'alphaPinene',
    name: 'α-Pinene',
    cls: 'monoterpene',
    bp760: 156,
    bpNote: '155–156 °C (Merck Index)',
    vp: { kind: 'antoine', A: 3.92161, B: 1411.869, C: -68.817 },
    vpConfidence: 'high',
    aroma: 'pine needles, fresh, resinous',
    aliases: ['alpha-pinene', 'a-pinene', 'alpha-pinen', 'a-pinen', 'pinene', 'pinen'],
  }),
  betaPinene: c({
    id: 'betaPinene',
    name: 'β-Pinene',
    cls: 'monoterpene',
    bp760: 166,
    bpNote: '163–166 °C (CRC 86th ed.)',
    vp: { kind: 'antoine', A: 3.94631, B: 1465.029, C: -67.626 },
    vpConfidence: 'high',
    aroma: 'pine, woody, dill, basil',
    aliases: ['beta-pinene', 'b-pinene', 'beta-pinen', 'b-pinen'],
  }),
  terpinolene: c({
    id: 'terpinolene',
    name: 'Terpinolene',
    cls: 'monoterpene',
    bp760: 185,
    bpNote: '183–187 °C (CRC 95th ed.; NIST 458 K)',
    vp: { kind: 'antoine', A: 2.95742, B: 934.936, C: -146.641 },
    vpConfidence: 'medium',
    aroma: 'fresh, piney, floral, herbal, a hint of citrus',
    aliases: ['terpinolene', 'terpinolen', 'alpha-terpinolene'],
  }),
  ocimene: c({
    id: 'ocimene',
    name: 'β-Ocimene',
    cls: 'monoterpene',
    bp760: 176,
    bpNote: '174–177 °C (JECFA)',
    chartClaim: {
      value: '~100 °C',
      explanation: 'Some charts list about 100 °C; the measured boiling point at 1 atm is 174–177 °C.',
    },
    vp: { kind: 'cc', tRefC: 176, pRef: 760, dH: 40 },
    vpConfidence: 'medium',
    aroma: 'sweet, herbaceous, woody, tropical',
    aliases: ['beta-ocimene', 'b-ocimene', 'trans-ocimene', 'cis-ocimene', 'ocimene', 'ocimen', 'beta-ocimen', 'trans-beta-ocimene', 'cis-beta-ocimene'],
  }),
  camphene: c({
    id: 'camphene',
    name: 'Camphene',
    cls: 'monoterpene',
    bp760: 159,
    bpNote: '156–161 °C (CRC 95th ed.)',
    vp: { kind: 'antoine', A: 4.73866, B: 1893.487, C: -33.855 },
    vpConfidence: 'high',
    aroma: 'damp woodland, fir needles, camphor',
    aliases: ['camphene', 'camphen'],
  }),
  carene: c({
    id: 'carene',
    name: 'Δ3-Carene',
    cls: 'monoterpene',
    bp760: 172,
    bpNote: '169–174 °C (JECFA; NIST 446.5 K)',
    vp: { kind: 'cc', tRefC: 173, pRef: 760, dH: 40 },
    vpConfidence: 'medium',
    aroma: 'sweet, pungent, pine and cedar',
    aliases: ['delta-3-carene', '3-carene', 'd3-carene', 'carene', 'delta-3-caren', '3-caren', 'caren'],
  }),
  alphaTerpinene: c({
    id: 'alphaTerpinene',
    name: 'α-Terpinene',
    cls: 'monoterpene',
    bp760: 173,
    bpNote: '173–175 °C (JECFA)',
    vp: { kind: 'cc', tRefC: 174, pRef: 760, dH: 40 },
    vpConfidence: 'medium',
    aroma: 'citrus, woody, herbal',
    aliases: ['alpha-terpinene', 'a-terpinene', 'alpha-terpinen', 'a-terpinen'],
  }),
  gammaTerpinene: c({
    id: 'gammaTerpinene',
    name: 'γ-Terpinene',
    cls: 'monoterpene',
    bp760: 182,
    bpNote: '181–183 °C (JECFA; NIST 456 K)',
    vp: { kind: 'cc', tRefC: 183, pRef: 760, dH: 41 },
    vpConfidence: 'medium',
    aroma: 'herbal, citrus, oily',
    aliases: ['gamma-terpinene', 'g-terpinene', 'gamma-terpinen', 'g-terpinen'],
  }),
  sabinene: c({
    id: 'sabinene',
    name: 'Sabinene',
    cls: 'monoterpene',
    bp760: 164,
    bpNote: '163.6 °C (NIST 436.7 K)',
    vp: { kind: 'cc', tRefC: 163.5, pRef: 760, dH: 39 },
    vpConfidence: 'medium',
    aroma: 'spicy, peppery, woody',
    aliases: ['sabinene', 'sabinen'],
  }),
  pCymene: c({
    id: 'pCymene',
    name: 'p-Cymene',
    cls: 'monoterpene',
    bp760: 177,
    bpNote: '177.1 °C (CRC 91st ed.)',
    vp: { kind: 'antoine', A: 4.16214, B: 1599.29, C: -65.491 },
    vpConfidence: 'high',
    aroma: 'citrus, woody, spicy',
    aliases: ['p-cymene', 'para-cymene', 'p-cymol', 'p-cymen', 'cymene'],
  }),
  linalool: c({
    id: 'linalool',
    name: 'Linalool',
    cls: 'monoterpenoid',
    bp760: 198,
    bpNote: '194–200 °C (CRC 95th ed.; NIST 471.8 K)',
    vp: { kind: 'cc', tRefC: 198.6, pRef: 760, dH: 50.3 },
    vpConfidence: 'high',
    aroma: 'floral, lavender, sweet citrus',
    aliases: ['linalool', 'linalol', 'beta-linalool'],
  }),
  eucalyptol: c({
    id: 'eucalyptol',
    name: 'Eucalyptol (1,8-cineole)',
    cls: 'monoterpenoid',
    bp760: 176,
    bpNote: '176–177 °C (CRC 95th ed.)',
    vp: { kind: 'cc', tRefC: 176.4, pRef: 760, dH: 41.1 },
    vpConfidence: 'medium',
    aroma: 'cooling, eucalyptus, camphor, mint',
    aliases: ['eucalyptol', 'eukalyptol', '1,8-cineole', '1,8-cineol', 'cineole', 'cineol'],
  }),
  borneol: c({
    id: 'borneol',
    name: 'Borneol',
    cls: 'monoterpenoid',
    bp760: 213,
    bpNote: '212–213 °C (Hawley’s; NIST 486.4 K)',
    vp: { kind: 'cc', tRefC: 213, pRef: 760, dH: 46 },
    vpConfidence: 'medium',
    aroma: 'camphor, woody, minty',
    aliases: ['borneol', 'isoborneol', 'endo-borneol'],
  }),
  fenchol: c({
    id: 'fenchol',
    name: 'Fenchol',
    cls: 'monoterpenoid',
    bp760: 201,
    bpNote: '201–202 °C (secondary)',
    vp: { kind: 'antoine', A: 3.71725, B: 1292.226, C: -123.546 },
    vpConfidence: 'medium',
    aroma: 'camphor, lemon, pine, basil',
    aliases: ['fenchol', 'fenchyl alcohol', 'endo-fenchol', 'fenchylalkohol'],
  }),
  terpineol: c({
    id: 'terpineol',
    name: 'α-Terpineol',
    cls: 'monoterpenoid',
    bp760: 218,
    bpNote: '217–221 °C (NIST 490.7 K)',
    vp: { kind: 'antoine', A: 4.42892, B: 1844.962, C: -74.617 },
    vpConfidence: 'medium',
    aroma: 'floral, lilac, sweet',
    aliases: ['alpha-terpineol', 'a-terpineol', 'terpineol', 'terpineole'],
  }),
  geraniol: c({
    id: 'geraniol',
    name: 'Geraniol',
    cls: 'monoterpenoid',
    bp760: 230,
    bpNote: '229–230 °C (Hawley’s; NIST 503 K)',
    vp: { kind: 'twoPoint', t1C: 117.5, p1: 17, t2C: 230, p2: 760 },
    vpConfidence: 'medium',
    aroma: 'rose, floral, citrus',
    aliases: ['geraniol'],
  }),
  isopulegol: c({
    id: 'isopulegol',
    name: 'Isopulegol',
    cls: 'monoterpenoid',
    bp760: 217,
    bpNote: '216–218 °C (JECFA)',
    vp: { kind: 'twoPoint', t1C: 91, p1: 12, t2C: 217, p2: 760 },
    vpConfidence: 'medium',
    aroma: 'minty, cooling, herbal',
    aliases: ['isopulegol', '(-)-isopulegol'],
  }),
  caryophyllene: c({
    id: 'caryophyllene',
    name: 'β-Caryophyllene',
    cls: 'sesquiterpene',
    bp760: 260,
    bpNote: '256–264 °C at 1 atm (JECFA; Eyal et al. 2023)',
    chartClaim: {
      value: '119 °C (or 130/160 °C)',
      explanation:
        'Charts copy a reduced-pressure value: it boils at 129–130 °C only at 14 mmHg (119 °C ≈ 9 mmHg). At normal pressure it boils at ~260 °C — yet it still evaporates readily far below that.',
    },
    vp: { kind: 'twoPoint', t1C: 129.5, p1: 14, t2C: 260, p2: 760 },
    vpConfidence: 'medium',
    aroma: 'black pepper, spicy, woody, clove',
    aliases: ['beta-caryophyllene', 'b-caryophyllene', 'trans-caryophyllene', 'caryophyllene', 'caryophyllen', 'beta-caryophyllen', 'b-caryophyllen', 'e-caryophyllene'],
  }),
  humulene: c({
    id: 'humulene',
    name: 'α-Humulene',
    cls: 'sesquiterpene',
    bp760: null,
    bpNote: 'Not measured at 1 atm; estimated ~245–280 °C. Reduced-pressure data conflict.',
    chartClaim: {
      value: '106 °C',
      explanation: '106–107 °C is its boiling point at ~5 mmHg (a vacuum), not at normal pressure.',
    },
    vp: { kind: 'scaled', of: 'caryophyllene', factor: 0.7 },
    vpConfidence: 'low',
    aroma: 'hoppy, woody, earthy',
    aliases: ['alpha-humulene', 'a-humulene', 'humulene', 'humulen', 'alpha-humulen', 'a-humulen', 'alpha-caryophyllene'],
  }),
  valencene: c({
    id: 'valencene',
    name: 'Valencene',
    cls: 'sesquiterpene',
    bp760: null,
    bpNote: '123 °C at 11 mmHg (JECFA); ~250 °C at 1 atm (estimate)',
    vp: { kind: 'cc', tRefC: 123, pRef: 11, dH: 58 },
    vpConfidence: 'low',
    aroma: 'sweet orange, citrus, woody',
    aliases: ['valencene', 'valencen'],
  }),
  farnesene: c({
    id: 'farnesene',
    name: 'β-Farnesene',
    cls: 'sesquiterpene',
    bp760: null,
    bpNote: 'No measured boiling point found; treated like β-caryophyllene (estimate).',
    vp: { kind: 'scaled', of: 'caryophyllene', factor: 1 },
    vpConfidence: 'low',
    aroma: 'green apple, woody, herbal',
    aliases: ['beta-farnesene', 'b-farnesene', 'trans-beta-farnesene', 'farnesene', 'farnesen', 'e-beta-farnesene'],
  }),
  nerolidol: c({
    id: 'nerolidol',
    name: 'trans-Nerolidol',
    cls: 'sesquiterpenoid',
    bp760: 276,
    bpNote: '275–277 °C (JECFA)',
    chartClaim: {
      value: '122 °C',
      explanation: 'A vacuum value (~1 mmHg). At normal pressure nerolidol boils at 275–277 °C.',
    },
    vp: { kind: 'twoPoint', t1C: 114, p1: 0.75, t2C: 276, p2: 760 },
    vpConfidence: 'medium',
    aroma: 'woody, floral, tree bark, citrus',
    aliases: ['trans-nerolidol', 'cis-nerolidol', 'nerolidol', 'nerolidol 1', 'nerolidol 2', 'total nerolidol'],
  }),
  bisabolol: c({
    id: 'bisabolol',
    name: 'α-Bisabolol',
    cls: 'sesquiterpenoid',
    bp760: 314,
    bpNote: '~314 °C (secondary); 151–152 °C at 12 mmHg (JECFA)',
    chartClaim: {
      value: '153 °C',
      explanation: 'That is its boiling point at ~12 mmHg. At normal pressure it is ~314 °C.',
    },
    vp: { kind: 'twoPoint', t1C: 151.5, p1: 12, t2C: 314, p2: 760 },
    vpConfidence: 'low',
    aroma: 'floral, chamomile, honey',
    aliases: ['alpha-bisabolol', 'a-bisabolol', 'bisabolol', '(-)-alpha-bisabolol', 'levomenol'],
  }),
  guaiol: c({
    id: 'guaiol',
    name: 'Guaiol',
    cls: 'sesquiterpenoid',
    bp760: null,
    bpNote: 'Not measured; ~288 °C inferred from NIST data range (estimate).',
    vp: { kind: 'cc', tRefC: 288, pRef: 760, dH: 58 },
    vpConfidence: 'low',
    aroma: 'pine, woody, rose',
    aliases: ['guaiol', 'guajol', 'guaiac alcohol'],
  }),
  caryophylleneOxide: c({
    id: 'caryophylleneOxide',
    name: 'Caryophyllene oxide',
    cls: 'sesquiterpenoid',
    bp760: null,
    bpNote: 'No primary data; ~280 °C assumed (estimate).',
    vp: { kind: 'cc', tRefC: 280, pRef: 760, dH: 60 },
    vpConfidence: 'low',
    aroma: 'woody, dry, spicy',
    aliases: ['caryophyllene oxide', 'caryophyllenoxid', 'caryophyllene-oxide', 'beta-caryophyllene oxide', 'caryophyllenoxide'],
  }),
  phytol: c({
    id: 'phytol',
    name: 'Phytol',
    cls: 'diterpenoid',
    bp760: null,
    bpNote: '202–204 °C at 10 mmHg; above 300 °C at 1 atm (not measured)',
    chartClaim: {
      value: '204–210 °C',
      explanation: 'A vacuum value (~10–15 mmHg); at normal pressure phytol would need >300 °C.',
    },
    vp: { kind: 'twoPoint', t1C: 131.5, p1: 0.1, t2C: 203, p2: 10 },
    vpConfidence: 'medium',
    aroma: 'grassy, balsamic, mild',
    aliases: ['phytol'],
  }),
  thc: c({
    id: 'thc',
    name: 'Δ9-THC',
    cls: 'cannabinoid',
    bp760: null,
    bpNote: 'Hypothetical ~380–450 °C; it decomposes before boiling.',
    chartClaim: {
      value: '157 °C',
      explanation:
        '157 °C is a vacuum distillation temperature (0.05 Torr, Adams 1941). THC evaporates slowly at 170–190 °C and faster at 200–230 °C.',
    },
    vp: { kind: 'clarkeGlew', dG: 54.75, dH: 119.0, dCp: -157 },
    vpConfidence: 'medium',
    aroma: '—',
    aliases: ['thc', 'delta-9-thc', 'd9-thc', 'delta9-thc', 'dronabinol', 'total thc', 'thc total', 'gesamt-thc', 'thc gesamt'],
  }),
  cbd: c({
    id: 'cbd',
    name: 'CBD',
    cls: 'cannabinoid',
    bp760: null,
    bpNote: 'Hypothetical ~420–465 °C; decomposes first.',
    chartClaim: {
      value: '160–180 °C',
      explanation: 'Misleading: CBD is actually ~1.6× more volatile than THC at vaporizer temperatures (NIST 2026).',
    },
    vp: { kind: 'clarkeGlew', dG: 52.84, dH: 117.16, dCp: -162 },
    vpConfidence: 'medium',
    aroma: '—',
    aliases: ['cbd', 'cannabidiol', 'total cbd', 'cbd total', 'gesamt-cbd', 'cbd gesamt'],
  }),
  cbn: c({
    id: 'cbn',
    name: 'CBN',
    cls: 'cannabinoid',
    bp760: null,
    bpNote: 'Hypothetical ~420 °C.',
    chartClaim: { value: '185 °C', explanation: '185 °C is its boiling point at 0.05 mmHg (a vacuum).' },
    vp: { kind: 'clarkeGlew', dG: 56.73, dH: 123.12, dCp: -150 },
    vpConfidence: 'medium',
    aroma: '—',
    aliases: ['cbn', 'cannabinol'],
  }),
  cbg: c({
    id: 'cbg',
    name: 'CBG',
    cls: 'cannabinoid',
    bp760: null,
    bpNote: 'No vapor-pressure data; assumed THC-like (estimate).',
    vp: { kind: 'scaled', of: 'thc', factor: 1 },
    vpConfidence: 'low',
    aroma: '—',
    aliases: ['cbg', 'cannabigerol', 'total cbg'],
  }),
  cbc: c({
    id: 'cbc',
    name: 'CBC',
    cls: 'cannabinoid',
    bp760: null,
    bpNote: 'No vapor-pressure data; assumed THC-like (estimate).',
    chartClaim: { value: '220 °C', explanation: 'No measurement behind this number could be traced.' },
    vp: { kind: 'scaled', of: 'thc', factor: 1 },
    vpConfidence: 'low',
    aroma: '—',
    aliases: ['cbc', 'cannabichromene'],
  }),
  thcv: c({
    id: 'thcv',
    name: 'THCV',
    cls: 'cannabinoid',
    bp760: null,
    bpNote: 'No data; smaller homologue of THC, so probably 2–4× more volatile (estimate).',
    chartClaim: { value: '<220 °C', explanation: 'Likely a 0.05 Torr distillation value; no primary measurement found.' },
    vp: { kind: 'scaled', of: 'thc', factor: 2.5 },
    vpConfidence: 'low',
    aroma: '—',
    aliases: ['thcv', 'tetrahydrocannabivarin'],
  }),
};

export const TERPENE_IDS = (Object.keys(COMPOUNDS) as CompoundId[]).filter(
  (id) => COMPOUNDS[id].cls !== 'cannabinoid',
) as TerpeneId[];
export const CANNABINOID_IDS: CannabinoidId[] = ['thc', 'cbd', 'cbn', 'cbg', 'cbc', 'thcv'];

export const isCannabinoid = (id: CompoundId): id is CannabinoidId => COMPOUNDS[id].cls === 'cannabinoid';

export const CLASS_LABEL: Record<CompoundClass, string> = {
  monoterpene: 'Monoterpene',
  monoterpenoid: 'Monoterpene alcohol/ether',
  sesquiterpene: 'Sesquiterpene',
  sesquiterpenoid: 'Sesquiterpene alcohol/oxide',
  diterpenoid: 'Diterpene alcohol',
  cannabinoid: 'Cannabinoid',
};

/** THC equivalents from acid forms: decarboxylation keeps 314.5/358.5 of the mass. */
export const DECARB_FACTOR = 0.877;
