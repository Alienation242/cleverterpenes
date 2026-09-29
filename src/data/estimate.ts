// Every terpene profile in cleverTerpenes comes with its provenance: which method produced it, the
// steps taken and the sources used — from a lab test of your own batch down to a clearly
// labelled estimate.

import { COMPOUNDS, TERPENE_IDS, type CompoundId, type TerpeneId } from '../science/compounds';
import { TYPICAL_TERPENES } from '../science/planner';
import type { Amounts } from '../science/releaseModel';
import type { RegistryProduct } from './ctRegistry';
import { describeLineage, lineageProfile, lineageSources, lineageTestCount, type LineageNode } from './lineage';
import { profileFromDb, type DbStrain } from './strainDb';
import type { DataConfidence, Provenance, StrainSource } from './types';

export interface ProfileResult {
  percent: Amounts;
  ranges?: Partial<Record<CompoundId, [number, number]>>;
  confidence: DataConfidence;
  source: StrainSource;
  provenance: Provenance;
}

const SRC_SMITH = { name: 'Smith et al. 2022, PLOS ONE — US lab tests 2013–2021', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9119530/', license: 'CC0' };
const SRC_FL = { name: 'Cannlytics cannabis_results — Florida lab tests 2019–2024', url: 'https://huggingface.co/datasets/cannlytics/cannabis_results', license: 'CC BY 4.0' };
const SRC_CA = { name: 'Cannlytics cannabis_results — California lab tests 2020–2024', url: 'https://huggingface.co/datasets/cannlytics/cannabis_results', license: 'CC BY 4.0' };
const SRC_CT = { name: 'Connecticut DCP brand registry (data.ct.gov)', url: 'https://data.ct.gov/resource/egd5-wb6r' };
const DB_SOURCES = { smith: SRC_SMITH, fl: SRC_FL, ca: SRC_CA } as const;

const names = (ids: CompoundId[]) => ids.map((id) => COMPOUNDS[id].name).join(', ');
const fmt = (n: number) => n.toLocaleString('en-US');

function dbSources(s: DbStrain) {
  return s.src.map((k) => DB_SOURCES[k]);
}

/* ---------- lab data ---------- */

export function fromBatchLabel(percent: Amounts, detail: string): ProfileResult {
  return {
    percent,
    confidence: 'batch',
    source: 'coa',
    provenance: {
      method: 'lab-batch',
      steps: [detail, 'This is the most accurate profile possible — it is the lab result for the flower you actually have.'],
      sources: [],
    },
  };
}

export function fromDbStrain(s: DbStrain, query?: string): ProfileResult {
  const prof = profileFromDb(s);
  const dom = s.dom[0];
  const steps = [
    query && query.trim().toLowerCase() !== s.n.toLowerCase() ? `Matched “${query.trim()}” to “${s.n}” in the offline lab database.` : `Found “${s.n}” in the offline lab database.`,
    `Profile = median of ${s.k} lab tests from ${s.p} producers and ${s.l} labs (${s.r.join(', ')}${s.y ? `, ${s.y[0] === s.y[1] ? s.y[0] : `${s.y[0]}–${s.y[1]}`}` : ''}); whiskers show the middle 50 % of tests.`,
    dom
      ? `Consistency: ${COMPOUNDS[dom[0]]?.name ?? dom[0]} was the top terpene in ${Math.round(dom[1] * 100)} % of those tests${dom[1] < 0.6 ? ' — this strain name varies a lot between growers' : ''}.`
      : 'No dominant-terpene statistics available.',
    'Strain names predict a batch only loosely (Smith et al. 2022): your batch can differ; its label/COA would be more accurate.',
  ];
  return { percent: prof.percent, ranges: prof.ranges, confidence: s.conf, source: 'database', provenance: { method: 'lab-strain', steps, sources: dbSources(s) } };
}

export function fromRegistryProduct(p: RegistryProduct): ProfileResult {
  return {
    percent: p.percent,
    confidence: 'medium',
    source: 'registry',
    provenance: {
      method: 'lab-product',
      steps: [
        `Lab test of the registered product “${p.brandName}” by ${p.producer || 'an unnamed producer'} (approved ${p.approvalDate}).`,
        `${p.terpenesMeasured} terpenes measured by a third-party lab; THC/CBD are totals (acid forms × 0.877).`,
        'A different batch than yours — good reference, not your flower.',
      ],
      sources: [{ ...SRC_CT, url: p.labReportUrl ?? SRC_CT.url }],
    },
  };
}

export function fromRegistryMedian(products: RegistryProduct[], query: string): ProfileResult {
  const ids = new Set(products.flatMap((p) => Object.keys(p.percent) as CompoundId[]));
  const percent: Amounts = {};
  const ranges: Partial<Record<CompoundId, [number, number]>> = {};
  for (const id of ids) {
    const vals = products.map((p) => p.percent[id] ?? 0).sort((a, b) => a - b);
    const q = (f: number) => vals[Math.min(vals.length - 1, Math.max(0, Math.round((vals.length - 1) * f)))];
    if (q(0.5) > 0.011) percent[id] = Math.round(q(0.5) * 100) / 100;
    if (q(0.75) > 0.011) ranges[id] = [q(0.25), q(0.75)];
  }
  return {
    percent,
    ranges,
    confidence: products.length >= 5 ? 'medium' : 'low',
    source: 'registry',
    provenance: {
      method: 'lab-product',
      steps: [
        `Median of ${products.length} lab-tested products matching “${query}” in Connecticut’s registry (${products[products.length - 1]?.approvalDate ?? ''} – ${products[0]?.approvalDate ?? ''}).`,
        'Only 8 terpenes are reported there; other terpenes are missing rather than zero.',
        'Different batches and growers than yours.',
      ],
      sources: [SRC_CT],
    },
  };
}

/* ---------- estimates ---------- */

export interface TerpeneSetDb {
  terpenes: TerpeneId[];
  total: number;
  main: Partial<Record<TerpeneId, number>>;
  minor: Partial<Record<TerpeneId, number>>;
  sets: { k: number; s: TerpeneId[]; n: number; m: number[] }[];
}

let setsCache: Promise<TerpeneSetDb> | null = null;
export function loadTerpeneSets(): Promise<TerpeneSetDb> {
  setsCache ??= fetch(`${import.meta.env.BASE_URL}data/terpene-sets.json`).then((r) => {
    if (!r.ok) throw new Error(`Terpene priors missing (${r.status})`);
    return r.json() as Promise<TerpeneSetDb>;
  });
  setsCache.catch(() => (setsCache = null));
  return setsCache;
}

/** Amount assumed for a listed main terpene the lab datasets don't measure (e.g. eucalyptol). */
const UNMEASURED_MAIN = 0.06;

/**
 * Terpene names without amounts → amounts from lab tests whose top-k terpenes are exactly those
 * names (falling back to smaller subsets when a combination is rare).
 */
export function estimateFromNames(db: TerpeneSetDb, listed: TerpeneId[]): ProfileResult {
  const unique = [...new Set(listed)];
  const inData = unique.filter((id) => db.terpenes.includes(id));
  const extras = unique.filter((id) => !db.terpenes.includes(id));
  const steps: string[] = [`Terpene names from the product (no amounts): ${names(unique)}.`];
  const percent: Amounts = {};
  let confidence: DataConfidence = 'low';

  if (!inData.length) {
    Object.assign(percent, TYPICAL_TERPENES);
    steps.push('None of these terpenes are measured in the lab datasets, so a typical flower profile is used as the base.');
  } else {
    const want = new Set(inData);
    let matched: TerpeneSetDb['sets'] = [];
    let usedK = 0;
    for (let k = Math.min(5, inData.length); k >= 1; k--) {
      const exactK = k === inData.length;
      const groups = db.sets.filter((g) => g.k === k && g.s.every((id) => want.has(id)));
      const n = groups.reduce((a, g) => a + g.n, 0);
      if (groups.length && n >= (exactK ? 15 : 30)) {
        matched = groups;
        usedK = k;
        break;
      }
    }
    if (matched.length) {
      const n = matched.reduce((a, g) => a + g.n, 0);
      db.terpenes.forEach((id, i) => {
        const v = matched.reduce((a, g) => a + g.m[i] * g.n, 0) / n;
        if (v > 0.011) percent[id] = Math.round(v * 1000) / 1000;
      });
      if (usedK === inData.length) {
        steps.push(`Found ${fmt(n)} US lab tests whose ${usedK} most abundant terpenes are exactly these.`);
        confidence = n >= 100 ? 'medium' : 'low';
      } else {
        steps.push(
          `No large group had exactly this combination, so ${matched.length} group${matched.length > 1 ? 's' : ''} of lab tests sharing ${usedK} of these as top terpenes were combined (${fmt(n)} tests).`,
        );
      }
      steps.push('Amounts = median of those tests; terpenes not on the list keep the small amounts those tests typically had.');
    } else {
      Object.assign(percent, TYPICAL_TERPENES);
      steps.push('This combination is too rare in the lab data; started from a typical flower profile.');
    }
    // Listed terpenes must be meaningful even if the matched group had little of them.
    for (const id of inData) {
      const floor = (db.main[id] ?? 0.1) * 0.6;
      if ((percent[id] ?? 0) < floor) {
        percent[id] = Math.round(floor * 1000) / 1000;
        steps.push(`${COMPOUNDS[id].name} is listed as a main terpene, so it was raised to at least ${floor.toFixed(2)} %.`);
      }
    }
  }
  for (const id of extras) {
    percent[id] = UNMEASURED_MAIN;
  }
  if (extras.length) {
    steps.push(`${names(extras)} ${extras.length > 1 ? 'are' : 'is'} not measured in the lab datasets — assumed ${UNMEASURED_MAIN} % (a typical minor main terpene).`);
  }
  steps.push('Estimate ±50 % per terpene. Pasting the batch label or COA replaces it with real values.');
  return {
    percent,
    confidence,
    source: 'names',
    provenance: { method: 'names-estimate', steps, sources: [SRC_SMITH, SRC_FL, SRC_CA] },
  };
}

/** Lineage (reported, stated or entered) → mean of the parents' lab medians, recursively. */
export function estimateFromLineage(node: LineageNode): ProfileResult | null {
  const percent = lineageProfile(node);
  if (!percent || !Object.keys(percent).length) return null;
  const strains = lineageSources(node);
  const tests = lineageTestCount(node);
  const thc = strains.map((st) => st.cn.thc?.[0]).filter((v): v is number => v !== undefined);
  if (thc.length) percent.thc = Math.round((thc.reduce((x, y) => x + y, 0) / thc.length) * 10) / 10;
  return {
    percent,
    confidence: 'low',
    source: 'lineage',
    provenance: {
      method: 'lineage-estimate',
      steps: [
        ...describeLineage(node),
        `Profile = average of the parents’ lab medians (${tests} lab tests in total), each parent weighted equally.`,
        'Offspring can lean towards either parent — treat this as a rough guess. The terpene names on the package or a COA make it much better.',
      ],
      sources: [...new Map(strains.flatMap(dbSources).map((x) => [x.name, x])).values()],
    },
  };
}

/** Terpene-name estimate refined with the parents: 60 % names (chemotype), 40 % parents (genetics). */
export function combineEstimates(names: ProfileResult, lineage: ProfileResult, namesWeight = 0.6): ProfileResult {
  const ids = new Set([...Object.keys(names.percent), ...Object.keys(lineage.percent)] as CompoundId[]);
  const percent: Amounts = {};
  for (const id of ids) {
    if (COMPOUNDS[id].cls === 'cannabinoid') continue;
    const v = namesWeight * (names.percent[id] ?? 0) + (1 - namesWeight) * (lineage.percent[id] ?? 0);
    if (v > 0.011) percent[id] = Math.round(v * 1000) / 1000;
  }
  if (lineage.percent.thc !== undefined) percent.thc = lineage.percent.thc;
  return {
    percent,
    confidence: names.confidence === 'medium' ? 'medium' : 'low',
    source: 'names',
    provenance: {
      method: 'combined-estimate',
      steps: [
        `Combined two independent estimates: ${Math.round(namesWeight * 100)} % from the terpene names, ${Math.round((1 - namesWeight) * 100)} % from the parent strains.`,
        'From the terpene names:',
        ...names.provenance.steps.filter((x) => !x.startsWith('Estimate ±')).map((x) => '  ' + x),
        'From the parents:',
        ...lineage.provenance.steps.filter((x) => !x.startsWith('Offspring')).map((x) => '  ' + x),
        'Estimate ±50 % per terpene. Pasting the batch label or COA replaces it with real values.',
      ],
      sources: [...new Map([...names.provenance.sources, ...lineage.provenance.sources].map((x) => [x.name, x])).values()],
    },
  };
}

export function typicalProfile(): ProfileResult {
  return {
    percent: { ...TYPICAL_TERPENES },
    confidence: 'low',
    source: 'typical',
    provenance: {
      method: 'typical',
      steps: [
        'No lab data, terpene list or lineage was available.',
        'Using the median profile of typical US flower (≈1.3 % terpenes: myrcene, caryophyllene, limonene first).',
        'Replace it as soon as you have the product’s terpene list or label.',
      ],
      sources: [SRC_SMITH],
    },
  };
}

/** Terpene ids mentioned in free text (names without amounts), e.g. a pharmacy page's "Terpene: Myrcen, Limonen…". */
export function isTerpene(id: CompoundId): id is TerpeneId {
  return (TERPENE_IDS as CompoundId[]).includes(id);
}
