// Offline strain database (built by scripts/build-strain-db.mjs): per-strain medians and IQR from
// US flower lab tests — Smith et al. 2022 (CC0, 2013–2021) merged with Cannlytics Florida
// (2019–2024) and California (2020–2024) lab results (CC BY 4.0).

import { COMPOUNDS, type CannabinoidId, type CompoundId, type TerpeneId } from '../science/compounds';
import type { Amounts } from '../science/releaseModel';
import { STRAIN_ALIASES, cleanQuery, diceSimilarity, normalizeName } from './names';

type Quartiles = [number, number, number];

export type DbSourceKey = 'smith' | 'fl' | 'ca';

export interface DbStrain {
  /** slug */
  s: string;
  /** display name */
  n: string;
  /** samples with terpene data */
  k: number;
  /** samples with cannabinoid data */
  kc: number;
  /** distinct producers */
  p: number;
  /** distinct labs */
  l: number;
  /** US regions */
  r: string[];
  /** contributing datasets */
  src: DbSourceKey[];
  /** first/last test year (Florida data only) */
  y: [string, string] | null;
  /** indica / sativa / hybrid label (weak predictor) */
  c: string | null;
  pop: number;
  /** per terpene: [median, p25, p75, share detected] */
  t: Partial<Record<TerpeneId, [number, number, number, number]>>;
  tt: Quartiles | null;
  cn: Partial<Record<CannabinoidId, Quartiles>>;
  /** dominant-terpene distribution: [id, share] */
  dom: [TerpeneId, number][];
  chem: string | null;
  conf: 'high' | 'medium' | 'low';
}

export interface DbSourceInfo {
  name: string;
  url: string;
  license: string;
  coverage: string;
}

export interface StrainDb {
  version: number;
  builtAt: string;
  sources: Record<DbSourceKey, DbSourceInfo>;
  note: string;
  total: Quartiles;
  strains: DbStrain[];
}

let cache: Promise<StrainDb> | null = null;

export function loadStrainDb(): Promise<StrainDb> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/strains.json`).then((r) => {
    if (!r.ok) throw new Error(`Strain database missing (${r.status})`);
    return r.json() as Promise<StrainDb>;
  });
  cache.catch(() => (cache = null));
  return cache;
}

export interface SearchHit {
  strain: DbStrain;
  score: number;
  via: 'exact' | 'alias' | 'prefix' | 'contains' | 'fuzzy';
}

export function searchStrains(db: StrainDb, query: string, limit = 12): SearchHit[] {
  const q = cleanQuery(query);
  if (!q) {
    return [...db.strains]
      .sort((a, b) => b.pop - a.pop || b.k - a.k)
      .slice(0, limit)
      .map((strain) => ({ strain, score: 0, via: 'fuzzy' as const }));
  }
  const qSlug = q.replace(/ /g, '-');
  const alias = STRAIN_ALIASES[q];
  const qTokens = q.split(' ');
  const hits: SearchHit[] = [];
  for (const strain of db.strains) {
    const name = normalizeName(strain.n);
    const slugWords = strain.s.replace(/-/g, ' ');
    let score = 0;
    let via: SearchHit['via'] = 'fuzzy';
    if (strain.s === qSlug) {
      score = 100;
      via = 'exact';
    } else if (alias === strain.s) {
      score = 96;
      via = 'alias';
    } else if (slugWords.startsWith(q) || name.startsWith(q)) {
      score = 80 - Math.min(15, (slugWords.length - q.length) / 2);
      via = 'prefix';
    } else if (qTokens.every((t) => slugWords.split(' ').includes(t) || name.split(' ').includes(t))) {
      score = 66;
      via = 'contains';
    } else {
      const sim = Math.max(diceSimilarity(q, slugWords), diceSimilarity(q, name));
      if (sim >= 0.55) score = sim * 60;
    }
    if (score > 0) {
      score += Math.min(6, Math.log10(strain.k + 1) * 2);
      hits.push({ strain, score, via });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface DbProfile {
  percent: Amounts;
  ranges: Partial<Record<CompoundId, [number, number]>>;
  detected: Partial<Record<CompoundId, number>>;
}

/** Converts a DB record into % w/w medians (+ IQR). Values at the dataset floor (≤ 0.01 %) count as absent. */
export function profileFromDb(s: DbStrain): DbProfile {
  const percent: Amounts = {};
  const ranges: DbProfile['ranges'] = {};
  const detected: DbProfile['detected'] = {};
  for (const [id, q] of Object.entries(s.t) as [TerpeneId, [number, number, number, number]][]) {
    if (!COMPOUNDS[id]) continue;
    const [med, p25, p75, det] = q;
    detected[id] = det;
    if (med > 0.011) percent[id] = med;
    if (p75 > 0.011) ranges[id] = [p25, p75];
  }
  for (const [id, q] of Object.entries(s.cn) as [CannabinoidId, Quartiles][]) {
    const [med, p25, p75] = q;
    if (med > 0.05) percent[id] = med;
    if (p75 > 0.05) ranges[id] = [p25, p75];
  }
  return { percent, ranges, detected };
}

export function sourceLabel(db: StrainDb, s: DbStrain): string {
  const label: Record<DbSourceKey, string> = { smith: 'Smith et al. 2022 (CC0)', fl: 'Cannlytics Florida (CC BY 4.0)', ca: 'Cannlytics California (CC BY 4.0)' };
  return s.src.map((k) => label[k]).join(' + ') || db.note;
}

export function describeDbStrain(s: DbStrain): string {
  const dom = s.dom[0];
  const domText = dom ? ` · top terpene ${COMPOUNDS[dom[0]]?.name ?? dom[0]} in ${Math.round(dom[1] * 100)} % of tests` : '';
  const years = s.y ? ` · ${s.y[0] === s.y[1] ? s.y[0] : `${s.y[0]}–${s.y[1]}`}` : '';
  return `${s.k} lab tests · ${s.p} producers · ${s.l} labs (${s.r.join(', ')})${years}${domText}`;
}
