// Parses terpene/cannabinoid values pasted from a certificate of analysis (COA), a product
// label, or a pharmacy product page — English or German, decimal point or comma,
// units %, mg/g, mg/kg, ppm, µg/g; "ND", "n.n.", "<LOQ" handled as below the limit.

import { COMPOUNDS, DECARB_FACTOR, type CompoundId } from '../science/compounds';
import type { Amounts } from '../science/releaseModel';

type AcidId = 'thca' | 'cbda' | 'cbga' | 'thcTotal' | 'cbdTotal';
type Target = CompoundId | AcidId;

const EXTRA_ALIASES: Record<AcidId, string[]> = {
  thca: ['thca', 'thc a', 'thca a', 'thc acid', 'thc saure', 'thc-saure', 'tetrahydrocannabinolic acid', 'tetrahydrocannabinolsaure', 'delta 9 thca', 'd9 thca'],
  cbda: ['cbda', 'cbd a', 'cbd acid', 'cbd saure', 'cannabidiolic acid', 'cannabidiolsaure'],
  cbga: ['cbga', 'cbg a', 'cannabigerolic acid'],
  thcTotal: ['total thc', 'thc total', 'gesamt thc', 'thc gesamt', 'total delta 9 thc', 'thc max', 'max thc', 'thc (total)', 'gesamt-thc'],
  cbdTotal: ['total cbd', 'cbd total', 'gesamt cbd', 'cbd gesamt', 'max cbd', 'cbd max'],
};

/** Greek letters → words, strip accents/punctuation. "β-Myrcen" → "beta myrcen". */
export function normalizeCompoundText(s: string): string {
  return s
    .replace(/[αa]\s*-(?=[a-z])/gi, (m) => (m[0] === 'α' ? 'alpha ' : m))
    .replace(/α/g, 'alpha ')
    .replace(/β/g, 'beta ')
    .replace(/γ/g, 'gamma ')
    .replace(/[δΔ]/g, 'delta ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Matcher {
  target: Target;
  regex: RegExp;
  length: number;
}

let matchers: Matcher[] | null = null;

function buildMatchers(): Matcher[] {
  const list: Matcher[] = [];
  const add = (target: Target, alias: string) => {
    const norm = normalizeCompoundText(alias);
    if (!norm) return;
    const body = norm.split(' ').map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
    list.push({ target, regex: new RegExp(`(?:^|[^a-z0-9])${body}(?:$|[^a-z0-9])`), length: norm.length });
  };
  for (const c of Object.values(COMPOUNDS)) {
    add(c.id, c.name);
    c.aliases.forEach((a) => add(c.id, a));
  }
  for (const [id, aliases] of Object.entries(EXTRA_ALIASES) as [AcidId, string[]][]) aliases.forEach((a) => add(id, a));
  return list.sort((a, b) => b.length - a.length);
}

export interface ParsedValue {
  target: Target;
  label: string;
  value: number | null;
  unit: string;
  line: string;
}

export interface ParsedCoa {
  percent: Amounts;
  values: ParsedValue[];
  belowLimit: CompoundId[];
  unmatched: string[];
  warnings: string[];
}

const VALUE_TOKEN = /^(<|≤|&lt;)?\s*(\d+(?:[.,]\d+)?)\s*(%|mg\/g|mg\/kg|ppm|µg\/g|μg\/g|ug\/g)?$/i;
const UNIT_TOKEN = /^(%|mg\/g|mg\/kg|ppm|µg\/g|μg\/g|ug\/g|w\/w|%\s*w\/w)$/i;
const BELOW_TOKEN = /^(nd|n\.d\.?|n\.n\.?|nn|bql|blq|<\s*loq|<loq|<\s*lod|<lod|loq|lod|nicht\s+nachweisbar|not\s+detected|<\s*nwg)$/i;

function toPercent(value: number, unit: string, isCannabinoid: boolean): number {
  const u = unit.toLowerCase();
  if (u === 'mg/g') return value / 10;
  if (u === 'mg/kg' || u === 'ppm' || u === 'µg/g' || u === 'μg/g' || u === 'ug/g') return value / 10000;
  if (u === '%') return value;
  // No unit: flower terpenes are almost never above ~5 %, cannabinoids never above 100 %.
  if (!isCannabinoid && value > 6) return value / 10;
  return value;
}

export function parseCoaText(text: string): ParsedCoa {
  matchers ??= buildMatchers();
  const values: ParsedValue[] = [];
  const unmatched: string[] = [];
  const warnings: string[] = [];
  const globalUnit = /mg\s*\/\s*g/i.test(text) && !/%/.test(text) ? 'mg/g' : '';

  for (const rawLine of text.split(/\r?\n|;/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const norm = normalizeCompoundText(line);
    const m = matchers.find((x) => x.regex.test(norm));
    if (!m) {
      if (/\d/.test(line)) unmatched.push(line);
      continue;
    }
    const tokens = line.split(/[\s|:\t]+/).filter(Boolean);
    let value: number | null = null;
    let unit = '';
    let below = false;
    for (let i = 1; i < tokens.length; i++) {
      const tok = tokens[i];
      if (BELOW_TOKEN.test(tok) || (tok === '<' && tokens[i + 1] && /^\d/.test(tokens[i + 1]))) {
        below = true;
        break;
      }
      const vm = VALUE_TOKEN.exec(tok);
      if (vm && !/[a-z]/i.test(tok.replace(/mg\/g|mg\/kg|ppm|µg\/g|μg\/g|ug\/g/i, ''))) {
        if (vm[1]) {
          below = true;
          break;
        }
        value = Number(vm[2].replace(',', '.'));
        unit = vm[3] ?? (tokens[i + 1] && UNIT_TOKEN.test(tokens[i + 1]) ? tokens[i + 1].replace(/\s*w\/w/i, '') : '');
        if (unit.toLowerCase() === 'w/w') unit = '%';
        break;
      }
    }
    if (!unit && globalUnit) unit = globalUnit;
    values.push({ target: m.target, label: line.split(/[\s|:\t]+/)[0], value: below ? 0 : value, unit, line });
  }

  const percent: Amounts = {};
  const belowLimit: CompoundId[] = [];
  const acids: Partial<Record<AcidId, number>> = {};
  for (const v of values) {
    if (v.value === null) continue;
    const isAcid = v.target in EXTRA_ALIASES;
    const isCann = isAcid || (COMPOUNDS[v.target as CompoundId]?.cls === 'cannabinoid');
    const pct = toPercent(v.value, v.unit, isCann);
    if (isAcid) {
      acids[v.target as AcidId] = pct;
      continue;
    }
    const id = v.target as CompoundId;
    if (pct <= 0) {
      if (!percent[id]) belowLimit.push(id);
      continue;
    }
    percent[id] = (percent[id] ?? 0) + pct;
  }

  // Cannabinoid totals: prefer a stated total, else neutral + 0.877 × acid.
  if (acids.thcTotal) percent.thc = acids.thcTotal;
  else if (acids.thca) percent.thc = round2((percent.thc ?? 0) + DECARB_FACTOR * acids.thca);
  if (acids.cbdTotal) percent.cbd = acids.cbdTotal;
  else if (acids.cbda) percent.cbd = round2((percent.cbd ?? 0) + DECARB_FACTOR * acids.cbda);
  if (acids.cbga) percent.cbg = round2((percent.cbg ?? 0) + DECARB_FACTOR * acids.cbga);

  const terpTotal = Object.entries(percent)
    .filter(([id]) => COMPOUNDS[id as CompoundId]?.cls !== 'cannabinoid')
    .reduce((s, [, v]) => s + (v ?? 0), 0);
  for (const [id, v] of Object.entries(percent) as [CompoundId, number][]) {
    if (COMPOUNDS[id].cls !== 'cannabinoid' && v > 1.5) {
      warnings.push(`${COMPOUNDS[id].name} ${v.toFixed(2)} % is unusually high for flower — check the unit (mg/g vs %).`);
    }
  }
  if (terpTotal > 5) warnings.push(`Total terpenes ${terpTotal.toFixed(1)} % is unusually high — check units.`);
  if ((percent.thc ?? 0) > 35) warnings.push(`THC ${percent.thc} % looks too high for flower — check units.`);
  return { percent, values, belowLimit, unmatched, warnings };
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}

/**
 * All compounds mentioned in free text, in order of first appearance — e.g. a pharmacy page's
 * "Terpene: Myrcen, D-Limonen, α-Humulen, β-Caryophyllen, Linalool" (names without amounts).
 */
export function findCompoundNames(text: string): CompoundId[] {
  matchers ??= buildMatchers();
  let norm = ` ${normalizeCompoundText(text)} `;
  const firstIndex = new Map<CompoundId, number>();
  for (const m of matchers) {
    if (m.target in EXTRA_ALIASES) continue;
    const re = new RegExp(m.regex.source, 'g');
    const hit = re.exec(norm);
    if (!hit) continue;
    const id = m.target as CompoundId;
    if (!firstIndex.has(id) || hit.index < firstIndex.get(id)!) firstIndex.set(id, hit.index);
    // Blank out the match (same length keeps later indices stable) so "caryophyllene" can't re-match inside "caryophyllene oxide".
    norm = norm.replace(new RegExp(m.regex.source, 'g'), (s) => ' '.repeat(s.length));
  }
  return [...firstIndex.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}
