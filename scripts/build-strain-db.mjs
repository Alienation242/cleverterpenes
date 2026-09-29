// Builds the offline lab-data files used by the app:
//   public/data/strains.json       per-strain terpene/cannabinoid medians + IQR, merged from all sources
//   public/data/terpene-sets.json  "names only" priors: median profile per set of top-k terpenes
//
// Sources
//   1. Smith, Vergara, Keegan & Jikomes (2022), PLOS ONE 17(5): e0267498 — 89,923 US flower tests
//      (AK, CA, FL, MI, OR, WA; 2013–2021). https://github.com/cjsmith015/phytochemical-diversity-cannabis
//      Licence CC0-1.0.
//   2. Cannlytics "cannabis_results", Florida subset (Kaycha Labs, TerpLife; 2019–2024).
//   3. Cannlytics "cannabis_results", California subset (SC Labs, BelCosta, Cannalysis; 2020–2024).
//      https://huggingface.co/datasets/cannlytics/cannabis_results — Licence CC BY 4.0 (credit in the app).
//
// Usage: node scripts/build-strain-db.mjs   (raw files are downloaded once into scripts/.cache/)

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvRecords } from './lib/csvStream.mjs';
import { parseResultsCell } from './lib/pyLiteral.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'scripts', '.cache');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const SMITH_RAW = 'https://raw.githubusercontent.com/cjsmith015/phytochemical-diversity-cannabis/main/data/';
const SMITH_LAB = 'preproc_lab_data_pub_20220218.csv';
const SMITH_INFO = 'strain_info_pub_20210915.csv';
const FL_URL = 'https://huggingface.co/datasets/cannlytics/cannabis_results/resolve/main/data/fl/fl-results-latest.csv';
const FL_FILE = 'cannlytics-fl-results-latest.csv';
const CA_URL = 'https://huggingface.co/datasets/cannlytics/cannabis_results/resolve/main/data/ca/ca-results-latest.csv';
const CA_FILE = 'cannlytics-ca-results-latest.csv';
const MIN_SAMPLES = 3;
const FLOOR = 0.0101; // Smith's below-LOQ floor is 0.01 %

// Smith CSV column -> compound id
const SMITH_TERPS = {
  myrcene: 'myrcene',
  limonene: 'limonene',
  caryophyllene: 'caryophyllene',
  humulene: 'humulene',
  linalool: 'linalool',
  alphaPinene: 'a_pinene',
  betaPinene: 'b_pinene',
  terpinolene: 'terpinolene',
  ocimene: 'tot_ocimene',
  bisabolol: 'bisabolol',
  nerolidol: 'tot_nerolidol_ct',
  camphene: 'camphene',
  gammaTerpinene: 'g_terpinene',
  alphaTerpinene: 'a_terpinene',
};
const SMITH_CANN = { thc: 'tot_thc', cbd: 'tot_cbd', cbg: 'tot_cbg', cbc: 'tot_cbc', cbn: 'tot_cbn', thcv: 'tot_thcv' };
const SMITH_TOP = Object.fromEntries(Object.entries(SMITH_TERPS).map(([id, col]) => [col, id]));

// Cannlytics result keys -> compound id (values that map to the same id are summed)
const FL_TERPS = {
  beta_myrcene: 'myrcene',
  myrcene: 'myrcene',
  d_limonene: 'limonene',
  delta_limonene: 'limonene',
  limonene: 'limonene',
  beta_caryophyllene: 'caryophyllene',
  caryophyllene: 'caryophyllene',
  alpha_humulene: 'humulene',
  humulene: 'humulene',
  linalool: 'linalool',
  alpha_pinene: 'alphaPinene',
  beta_pinene: 'betaPinene',
  terpinolene: 'terpinolene',
  alpha_ocimene: 'ocimene',
  beta_ocimene: 'ocimene',
  ocimene: 'ocimene',
  alpha_bisabolol: 'bisabolol',
  trans_nerolidol: 'nerolidol',
  cis_nerolidol: 'nerolidol',
  nerolidol: 'nerolidol',
  camphene: 'camphene',
  gamma_terpinene: 'gammaTerpinene',
  alpha_terpinene: 'alphaTerpinene',
  caryophyllene_oxide: 'caryophylleneOxide',
  guaiol: 'guaiol',
  fenchol: 'fenchol',
  alpha_terpineol: 'terpineol',
  terpineol: 'terpineol',
  borneol: 'borneol',
  geraniol: 'geraniol',
  valencene: 'valencene',
  delta_3_carene: 'carene',
  eucalyptol: 'eucalyptol',
  sabinene: 'sabinene',
  isopulegol: 'isopulegol',
  trans_beta_farnesene: 'farnesene',
  p_cymene: 'pCymene',
};
const CANN_IDS = ['thc', 'cbd', 'cbg', 'cbc', 'cbn', 'thcv'];
const SET_TERPS = Object.keys(SMITH_TERPS); // universe for the names-only priors (measured in both sources)

const NAME_OVERRIDES = {
  'ak-47': 'AK-47',
  gsc: 'GSC (Girl Scout Cookies)',
  'original-glue': 'Original Glue (GG4 / Gorilla Glue #4)',
  'og-kush': 'OG Kush',
  'sfv-og': 'SFV OG',
  mac: 'MAC (Miracle Alien Cookies)',
  gmo: 'GMO (Garlic Cookies)',
  'gmo-cookies': 'GMO Cookies',
  'sunset-sherbert': 'Sunset Sherbert (Sunset Sherbet)',
};
const UPPER = new Set(['og', 'gsc', 'ak', 'bc', 'la', 'sfv', 'gmo', 'mac', 'gdp', 'ssh', 'sk', 'uk', 'nyc', 'cbd', 'thc', 'xxx', 'pb', 'dj', 'jf', 'tk', 'hp', 'gg', 'ny', 'sd', 'mk', 'ms', 'ii', 'iii', 'iv', 'vi', 'usa', 'ogkb', 'lsd', 'bx', 'f1', 's1', 'r2', 'bk', 'rs', 'cb', 'qp', 'kgb', 'jb', 'gt']);
const NOISE = new Set([
  'flower', 'flowers', 'whole', 'ground', 'smalls', 'small', 'shake', 'popcorn', 'indica', 'sativa', 'hybrid', 'cannabis', 'strain', 'bud', 'buds',
  'pre', 'roll', 'preroll', 'mini', 'minis', 'bulk', 'eighth', 'eighths', 'quarter', 'half', 'ounce', 'oz', 'g', 'gr', 'gram', 'grams',
  'indoor', 'outdoor', 'sungrown', 'greenhouse', 'mixed', 'light', 'dep', 'premium', 'reserve', 'select', 'craft', 'nugs', 'jar', 'pack',
]);
const JUNK = /^(n a|na|none|unknown|various|mixed|mix|blend|matrix derivative|test|sample|flower|n\/a|tbd|house|other|assorted)$/;

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function cachedFile(name, url) {
  const local = path.join(CACHE, name);
  if (!(await exists(local))) {
    await mkdir(CACHE, { recursive: true });
    console.log(`Downloading ${name} …`);
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(local));
  }
  return local;
}

async function readCsv(file) {
  const rows = [];
  for await (const r of csvRecords(file)) rows.push(r);
  return rows;
}

function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const sortNum = (a) => [...a].sort((x, y) => x - y);

function slugOf(name) {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s[-|–]\s.*$/, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/#/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t && !NOISE.has(t) && !/^\d+(\.\d+)?(g|mg|oz)?$/.test(t))
    .join('-');
}

function displayName(slug) {
  if (NAME_OVERRIDES[slug]) return NAME_OVERRIDES[slug];
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => (UPPER.has(w) ? w.toUpperCase() : /^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Vowel-stripped trade abbreviations ("grpebblgm", "mnty blzzrd") can't be matched by users — skip them. */
function looksAbbreviated(slug) {
  const letters = slug.replace(/[^a-z]/g, '');
  if (letters.length < 3) return true;
  const vowels = (letters.match(/[aeiouy]/g) ?? []).length;
  return vowels / letters.length < 0.22;
}

function confidenceTier(n, producers, agreement) {
  if (n >= 50 && producers >= 10 && agreement >= 0.75) return 'high';
  if (n >= 10 && agreement >= 0.5) return 'medium';
  return 'low';
}

/* ---------- loaders → unified samples ---------- */

function smithSamples(rows) {
  const out = [];
  for (const r of rows) {
    const slug = r.strain_slug?.trim() || null;
    const terps = {};
    if (r.has_terps === 'True') {
      for (const [id, col] of Object.entries(SMITH_TERPS)) {
        const v = Number(r[col]);
        if (Number.isFinite(v)) terps[id] = v;
      }
    }
    const cann = {};
    if (r.has_cannabs === 'True') {
      for (const [id, col] of Object.entries(SMITH_CANN)) {
        const v = Number(r[col]);
        if (Number.isFinite(v)) cann[id] = v;
      }
    }
    out.push({
      slug,
      source: 'smith',
      producer: `smith:${r.anon_producer}`,
      lab: `smith:${r.lab_id}`,
      region: r.region,
      terps,
      total: Number(r.total_terps),
      cann,
      dominant: SMITH_TOP[r.top_terp_f] ?? null,
      chem: r.chemotype || null,
    });
  }
  return out;
}

async function cannlyticsSamples(file, source, region) {
  const out = [];
  for await (const r of csvRecords(file)) {
    if (!/^flower/i.test(r.product_type ?? '')) continue;
    const rawName = (r.strain_name || (source === 'ca' ? r.product_name : '') || '').trim().toLowerCase();
    if (!rawName || JUNK.test(rawName)) continue;
    const slug = slugOf(rawName);
    if (!slug || looksAbbreviated(slug)) continue;
    const results = parseResultsCell(r.results);
    if (!Array.isArray(results)) continue;
    const terps = {};
    const seenKeys = new Set();
    for (const x of results) {
      if (!x || !/terp/i.test(String(x.analysis ?? ''))) continue;
      const id = FL_TERPS[x.key];
      if (!id || seenKeys.has(x.key)) continue; // totals are unmapped; repeated keys count once
      seenKeys.add(x.key);
      const units = String(x.units ?? '').toLowerCase();
      let v = Number(x.value);
      if (units === 'mg/g') v = v / 10;
      else if (units && units !== 'percent' && units !== '%') continue;
      if (!Number.isFinite(v) && Number.isFinite(Number(x.mg_g))) v = Number(x.mg_g) / 10;
      if (!Number.isFinite(v) || v < 0) continue;
      terps[id] = (terps[id] ?? 0) + v;
    }
    // Unit sanity: flower terpenes sum to ~0.3–5 %; a sum above 12 means the cells were mg/g.
    const terpSum = Object.values(terps).reduce((a, b) => a + b, 0);
    if (terpSum > 12) for (const id of Object.keys(terps)) terps[id] /= 10;
    if (Object.values(terps).filter((v) => v > FLOOR).length < 3) continue;
    const cann = {};
    const thc = Number(r.total_thc);
    const cbd = Number(r.total_cbd);
    if (Number.isFinite(thc) && thc > 0 && thc < 45) cann.thc = thc;
    if (Number.isFinite(cbd) && cbd >= 0 && cbd < 30) cann.cbd = cbd;
    const dominant = Object.entries(terps).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    out.push({
      slug,
      source,
      producer: r.producer ? `${source}:${r.producer.trim().toLowerCase()}` : `${source}-lab:${r.lab}`,
      lab: `${source}:${r.lab}`,
      region,
      terps,
      total: Number(r.total_terpenes),
      cann,
      dominant,
      chem: null,
      date: (r.date_tested || '').slice(0, 10),
    });
  }
  return out;
}

/* ---------- aggregation ---------- */

function aggregate(samples, info) {
  const bySlug = new Map();
  for (const s of samples) {
    if (!s.slug) continue;
    if (!bySlug.has(s.slug)) bySlug.set(s.slug, []);
    bySlug.get(s.slug).push(s);
  }
  const strains = [];
  for (const [slug, all] of bySlug) {
    const terpRows = all.filter((s) => Object.keys(s.terps).length >= 3);
    if (terpRows.length < MIN_SAMPLES) continue;
    const cannRows = all.filter((s) => Object.keys(s.cann).length);
    const ids = new Set(terpRows.flatMap((s) => Object.keys(s.terps)));
    const t = {};
    for (const id of ids) {
      const vals = sortNum(terpRows.map((s) => s.terps[id]).filter((v) => v !== undefined));
      if (vals.length < Math.max(3, terpRows.length * 0.3)) continue;
      const q = [r2(quantile(vals, 0.5)), r2(quantile(vals, 0.25)), r2(quantile(vals, 0.75)), r2(vals.filter((v) => v > FLOOR).length / vals.length)];
      if (q[2] > 0.011) t[id] = q;
    }
    const cn = {};
    for (const id of CANN_IDS) {
      const vals = sortNum(cannRows.map((s) => s.cann[id]).filter((v) => v !== undefined));
      if (vals.length) cn[id] = [r2(quantile(vals, 0.5)), r2(quantile(vals, 0.25)), r2(quantile(vals, 0.75))];
    }
    const totals = sortNum(terpRows.map((s) => s.total).filter((v) => Number.isFinite(v) && v > 0));
    const domCounts = {};
    for (const s of terpRows) if (s.dominant) domCounts[s.dominant] = (domCounts[s.dominant] ?? 0) + 1;
    const dom = Object.entries(domCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, c]) => [id, r2(c / terpRows.length)]);
    const agreement = dom.length ? dom[0][1] : 0;
    const producers = new Set(terpRows.map((s) => s.producer)).size;
    const chemCounts = {};
    for (const s of cannRows) if (s.chem) chemCounts[s.chem] = (chemCounts[s.chem] ?? 0) + 1;
    const dates = terpRows.map((s) => s.date).filter(Boolean).sort();
    const meta = info.get(slug);
    strains.push({
      s: slug,
      n: displayName(slug),
      k: terpRows.length,
      kc: cannRows.length,
      p: producers,
      l: new Set(terpRows.map((s) => s.lab)).size,
      r: [...new Set(terpRows.map((s) => s.region))].sort(),
      src: [...new Set(terpRows.map((s) => s.source))].sort(),
      y: dates.length ? [dates[0].slice(0, 4), dates[dates.length - 1].slice(0, 4)] : null,
      c: meta?.strain_category && meta.strain_category !== 'None' ? meta.strain_category : null,
      pop: meta?.strain_popularity ? r2(Number(meta.strain_popularity)) : 0,
      t,
      tt: totals.length ? [r2(quantile(totals, 0.5)), r2(quantile(totals, 0.25)), r2(quantile(totals, 0.75))] : null,
      cn,
      dom,
      chem: Object.entries(chemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      conf: confidenceTier(terpRows.length, producers, agreement),
    });
  }
  return strains.sort((a, b) => b.k - a.k);
}

/**
 * "Names only" priors: many products (all German pharmacy flowers) list their main terpenes
 * without amounts. For every combination of top-k terpenes (k = 1…5) we store the median
 * profile of the samples whose top-k terpenes are exactly that set.
 */
function terpeneSets(samples) {
  const MIN_N = 15;
  const groups = new Map();
  const main = Object.fromEntries(SET_TERPS.map((id) => [id, []]));
  const minor = Object.fromEntries(SET_TERPS.map((id) => [id, []]));
  const totals = [];
  const MAJOR = ['myrcene', 'limonene', 'caryophyllene', 'humulene', 'linalool', 'alphaPinene', 'betaPinene', 'terpinolene'];
  for (const s of samples) {
    // The eight major terpenes must be measured; rarer ones missing from a lab's panel count as absent.
    if (MAJOR.some((id) => s.terps[id] === undefined)) continue;
    const v = SET_TERPS.map((id) => s.terps[id] ?? 0);
    const ranked = SET_TERPS.map((id, i) => [id, v[i]])
      .filter(([, x]) => x > FLOOR)
      .sort((a, b) => b[1] - a[1]);
    const top5 = new Set(ranked.slice(0, 5).map(([id]) => id));
    SET_TERPS.forEach((id, i) => (top5.has(id) ? main : minor)[id].push(v[i]));
    if (Number.isFinite(s.total) && s.total > 0) totals.push(s.total);
    for (let k = 1; k <= Math.min(5, ranked.length); k++) {
      const set = ranked
        .slice(0, k)
        .map(([id]) => id)
        .sort();
      const key = `${k}|${set.join('+')}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { k, s: set, rows: [] }));
      g.rows.push(v);
    }
  }
  const med = (arr) => (arr.length ? r3(quantile(sortNum(arr), 0.5)) : 0);
  const sets = [];
  for (const g of groups.values()) {
    if (g.rows.length < MIN_N) continue;
    sets.push({ k: g.k, s: g.s, n: g.rows.length, m: SET_TERPS.map((_, i) => med(g.rows.map((r) => r[i]))) });
  }
  sets.sort((a, b) => a.k - b.k || b.n - a.n);
  return {
    version: 1,
    builtAt: new Date().toISOString().slice(0, 10),
    source: 'Median profiles of US flower lab tests grouped by their top-k terpenes (Smith et al. 2022, CC0; Cannlytics Florida + California, CC BY 4.0)',
    terpenes: SET_TERPS,
    total: med(totals),
    main: Object.fromEntries(SET_TERPS.map((id) => [id, med(main[id])])),
    minor: Object.fromEntries(SET_TERPS.map((id) => [id, med(minor[id])])),
    sets,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const smithRows = await readCsv(await cachedFile(SMITH_LAB, SMITH_RAW + SMITH_LAB));
  const infoRows = await readCsv(await cachedFile(SMITH_INFO, SMITH_RAW + SMITH_INFO));
  const info = new Map(infoRows.map((r) => [r.strain_slug, r]));
  const smith = smithSamples(smithRows);
  console.log(`Smith et al.: ${smithRows.length} rows`);
  const fl = await cannlyticsSamples(await cachedFile(FL_FILE, FL_URL), 'fl', 'FL');
  console.log(`Cannlytics Florida: ${fl.length} flower samples with terpene profiles`);
  const ca = await cannlyticsSamples(await cachedFile(CA_FILE, CA_URL), 'ca', 'CA');
  console.log(`Cannlytics California: ${ca.length} flower samples with terpene profiles`);

  const samples = [...smith, ...fl, ...ca];
  const sets = terpeneSets(samples);
  const setsJson = JSON.stringify(sets);
  await writeFile(path.join(OUT_DIR, 'terpene-sets.json'), setsJson);
  console.log(`Wrote ${sets.sets.length} terpene-set profiles (${(setsJson.length / 1024).toFixed(0)} KB)`);

  const strains = aggregate(samples, info);
  const overallTotals = sortNum(smith.map((s) => s.total).filter((v) => Number.isFinite(v) && v > 0));
  const out = {
    version: 2,
    builtAt: new Date().toISOString().slice(0, 10),
    sources: {
      smith: {
        name: 'Smith, Vergara, Keegan & Jikomes (2022), PLOS ONE 17(5): e0267498',
        url: 'https://github.com/cjsmith015/phytochemical-diversity-cannabis',
        license: 'CC0-1.0',
        coverage: 'US flower lab tests (AK, CA, FL, MI, OR, WA), 2013–2021, six labs',
      },
      fl: {
        name: 'Cannlytics cannabis_results — Florida (Kaycha Labs, TerpLife Labs)',
        url: 'https://huggingface.co/datasets/cannlytics/cannabis_results',
        license: 'CC BY 4.0',
        coverage: 'Florida medical flower lab tests, 2019–2024',
      },
      ca: {
        name: 'Cannlytics cannabis_results — California (SC Labs, BelCosta Labs, Cannalysis)',
        url: 'https://huggingface.co/datasets/cannlytics/cannabis_results',
        license: 'CC BY 4.0',
        coverage: 'California flower lab tests, 2020–2024',
      },
    },
    note: 'Values are % w/w. Terpene values of 0.01 % are a below-quantification floor.',
    total: [r2(quantile(overallTotals, 0.5)), r2(quantile(overallTotals, 0.25)), r2(quantile(overallTotals, 0.75))],
    strains,
  };
  const json = JSON.stringify(out);
  await writeFile(path.join(OUT_DIR, 'strains.json'), json);
  const tiers = strains.reduce((acc, s) => ((acc[s.conf] = (acc[s.conf] ?? 0) + 1), acc), {});
  const bySrc = strains.reduce((acc, s) => ((acc[s.src.join('+')] = (acc[s.src.join('+')] ?? 0) + 1), acc), {});
  console.log(`Wrote ${strains.length} strains (${(json.length / 1024).toFixed(0)} KB) — tiers ${JSON.stringify(tiers)} — sources ${JSON.stringify(bySrc)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
