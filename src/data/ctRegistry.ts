// Live lookup: Connecticut DCP "Medical Marijuana and Adult-Use Cannabis Brand Registry"
// (data.ct.gov dataset egd5-wb6r, Socrata API). Public open data, CORS-enabled, no key.
// Each registered product lists 8 terpenes and cannabinoids from a third-party lab, plus a
// link to the lab report. Values arrive as text (e.g. "<0.10") and are parsed here.

import { DECARB_FACTOR, type CompoundId } from '../science/compounds';
import type { Amounts } from '../science/releaseModel';
import { cleanQuery } from './names';

const URL_BASE = 'https://data.ct.gov/resource/egd5-wb6r.json';

const TERPENE_FIELDS: Record<string, CompoundId> = {
  b_myrcene: 'myrcene',
  limonene: 'limonene',
  b_caryophyllene: 'caryophyllene',
  humulene_hum: 'humulene',
  linalool_lin: 'linalool',
  a_pinene: 'alphaPinene',
  b_pinene: 'betaPinene',
  ocimene: 'ocimene',
};

const FLOWER_FORMS = ['Usable Marijuana', 'Raw material (flower)', 'Flower', 'Raw Flower'];

interface RawRecord {
  brand_name?: string;
  dosage_form?: string;
  producer?: string;
  approval_date?: string;
  registration_number?: string;
  lab_analysis?: { url?: string };
  tetrahydrocannabinol_thc?: string;
  tetrahydrocannabinol_acid_thca?: string;
  cannabidiols_cbd?: string;
  cannabidiol_acid_cbda?: string;
  cbg?: string;
  cbg_a?: string;
  cannabichromene_cbc?: string;
  cannbinol_cbn?: string;
  tetrahydrocannabivarin_thcv?: string;
  [key: string]: unknown;
}

export interface RegistryProduct {
  brandName: string;
  producer: string;
  approvalDate: string;
  dosageForm: string;
  registration: string;
  labReportUrl?: string;
  percent: Amounts;
  terpenesMeasured: number;
}

export function parseRegistryValue(v: unknown): number {
  if (typeof v !== 'string') return 0;
  const s = v.trim();
  if (!s || s.startsWith('<') || /^n\.?d\.?$/i.test(s)) return 0;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function mapRecord(r: RawRecord): RegistryProduct {
  const percent: Amounts = {};
  let terpenesMeasured = 0;
  for (const [field, id] of Object.entries(TERPENE_FIELDS)) {
    const v = parseRegistryValue(r[field]);
    if (v > 0) {
      percent[id] = v;
      terpenesMeasured++;
    }
  }
  const thc = parseRegistryValue(r.tetrahydrocannabinol_thc) + DECARB_FACTOR * parseRegistryValue(r.tetrahydrocannabinol_acid_thca);
  const cbd = parseRegistryValue(r.cannabidiols_cbd) + DECARB_FACTOR * parseRegistryValue(r.cannabidiol_acid_cbda);
  const cbg = parseRegistryValue(r.cbg) + DECARB_FACTOR * parseRegistryValue(r.cbg_a);
  if (thc > 0) percent.thc = Math.round(thc * 100) / 100;
  if (cbd > 0) percent.cbd = Math.round(cbd * 100) / 100;
  if (cbg > 0) percent.cbg = Math.round(cbg * 100) / 100;
  const cbc = parseRegistryValue(r.cannabichromene_cbc);
  const cbn = parseRegistryValue(r.cannbinol_cbn);
  const thcv = parseRegistryValue(r.tetrahydrocannabivarin_thcv);
  if (cbc > 0) percent.cbc = cbc;
  if (cbn > 0) percent.cbn = cbn;
  if (thcv > 0) percent.thcv = thcv;
  return {
    brandName: r.brand_name ?? 'Unknown product',
    producer: r.producer ?? '',
    approvalDate: (r.approval_date ?? '').slice(0, 10),
    dosageForm: r.dosage_form ?? '',
    registration: r.registration_number ?? '',
    labReportUrl: r.lab_analysis?.url,
    percent,
    terpenesMeasured,
  };
}

export async function searchRegistry(name: string, signal?: AbortSignal): Promise<RegistryProduct[]> {
  const term = cleanQuery(name).toUpperCase().replace(/'/g, "''");
  if (term.length < 2) return [];
  const forms = FLOWER_FORMS.map((f) => `'${f}'`).join(',');
  const params = new URLSearchParams({
    $where: `upper(brand_name) like '%${term}%' AND dosage_form in(${forms})`,
    $order: 'approval_date DESC',
    $limit: '40',
  });
  const res = await fetch(`${URL_BASE}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Registry lookup failed (${res.status})`);
  const rows = (await res.json()) as RawRecord[];
  // Pre-rolls are ground and often older; keep whole-flower products only.
  return rows
    .map(mapRecord)
    .filter((p) => p.terpenesMeasured >= 3 && !/pre-?\s?rolls?|joint|blunt|cone/i.test(p.brandName));
}
