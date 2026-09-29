// Parses medical-cannabis product names as used in German pharmacies, e.g.
//   "Huala 22/1 CA ALM Alien Mints"      → brand Huala, THC 22 %, CBD < 1 %, origin CA, code ALM, cultivar Alien Mints
//   "Aurora 20/1 Pink Kush"              → brand Aurora, THC 20 %, CBD < 1 %, cultivar Pink Kush
//   "101-BLOOM Pink Certz 22/1"          → brand 101-BLOOM, THC 22 %, cultivar Pink Certz
//   "Blue Dream"                         → cultivar Blue Dream

const ORIGINS: Record<string, string> = {
  CA: 'Canada',
  PT: 'Portugal',
  DK: 'Denmark',
  NL: 'Netherlands',
  DE: 'Germany',
  CO: 'Colombia',
  AU: 'Australia',
  UY: 'Uruguay',
  MK: 'North Macedonia',
  ZA: 'South Africa',
  IL: 'Israel',
  ES: 'Spain',
  JM: 'Jamaica',
  LS: 'Lesotho',
  UG: 'Uganda',
  CZ: 'Czechia',
  GR: 'Greece',
  MT: 'Malta',
  US: 'USA',
};

export interface ParsedProductName {
  raw: string;
  brand?: string;
  thc?: number;
  /** CBD in %, or undefined when the label says "1" (i.e. < 1 %) */
  cbd?: number;
  cbdBelowOne?: boolean;
  origin?: string;
  originCode?: string;
  code?: string;
  /** The cultivar part to look up in lab data (falls back to the whole name) */
  cultivar: string;
}

const RATIO = /(\d{1,2}(?:[.,]\d{1,2})?)\s*\/\s*(\d{1,2}(?:[.,]\d{1,2})?)/;
const num = (s: string) => Number(s.replace(',', '.'));

export function parseProductName(input: string): ParsedProductName {
  const raw = input.trim().replace(/\s+/g, ' ');
  const out: ParsedProductName = { raw, cultivar: raw };
  const m = RATIO.exec(raw);
  if (!m) return out;
  const thc = num(m[1]);
  const cbd = num(m[2]);
  if (thc > 35 || cbd > 30) return out; // not a THC/CBD ratio
  out.thc = thc;
  if (cbd <= 1) out.cbdBelowOne = true;
  else out.cbd = cbd;

  const before = raw.slice(0, m.index).trim().split(' ').filter(Boolean);
  const after = raw.slice(m.index + m[0].length).trim().split(' ').filter(Boolean);
  if (after.length && ORIGINS[after[0].toUpperCase()] && after[0] === after[0].toUpperCase()) {
    out.originCode = after[0].toUpperCase();
    out.origin = ORIGINS[out.originCode];
    after.shift();
  }
  // A short all-caps token right after the ratio/origin is the cultivar code (e.g. ALM, BTR, GSC).
  if (after.length && /^[A-Z0-9]{2,5}$/.test(after[0])) out.code = after.shift();

  if (after.length) {
    out.brand = before.join(' ') || undefined;
    out.cultivar = after.join(' ');
  } else if (before.length > 1) {
    out.brand = before[0];
    out.cultivar = before.slice(1).join(' ');
  } else {
    out.brand = before[0];
    out.cultivar = out.code ?? raw;
  }
  return out;
}
