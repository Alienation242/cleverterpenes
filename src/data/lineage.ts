// Strain lineage → estimated terpene profile from the parents' lab data.
//
// Sources of lineage, in order of preference:
//   1. What the user or the product states ("Genetik: Alien Cookies x Animal Mints", "Runtz x Alien Mintz").
//   2. A small curated table of commonly reported crosses for popular strains. These are breeder
//      claims as widely reported; some are disputed (alternatives listed). Always shown to the user.
// Parents without lab data are resolved through their own parents (up to two generations).

import { COMPOUNDS, type CompoundId } from '../science/compounds';
import type { Amounts } from '../science/releaseModel';
import { cleanQuery } from './names';
import { profileFromDb, searchStrains, type DbStrain, type StrainDb } from './strainDb';

export interface LineageEntry {
  parents: string[];
  /** Other reported lineages */
  alt?: string[][];
  /** A selected phenotype of a single parent, not a cross */
  phenotype?: boolean;
}

/** Commonly reported lineages (breeder claims). Keys are slugs. */
export const LINEAGE: Record<string, LineageEntry> = {
  'alien-mints': { parents: ['Alien Cookies', 'Kush Mints'], alt: [['Alien Cookies', 'Animal Mints']] },
  'alien-mintz': { parents: ['Alien Cookies', 'Kush Mints'], alt: [['Alien Cookies', 'Animal Mints']] },
  'kush-mints': { parents: ['Bubba Kush', 'Animal Mints'] },
  'animal-mints': { parents: ['Animal Cookies', 'GSC'] },
  'animal-cookies': { parents: ['GSC', 'Fire OG'] },
  gelato: { parents: ['Sunset Sherbert', 'Thin Mint'] },
  'gelato-33': { parents: ['Sunset Sherbert', 'Thin Mint'] },
  'gelato-41': { parents: ['Sunset Sherbert', 'Thin Mint'] },
  runtz: { parents: ['Zkittlez', 'Gelato'] },
  'pink-runtz': { parents: ['Runtz'], phenotype: true },
  'white-runtz': { parents: ['Runtz'], phenotype: true },
  zkittlez: { parents: ['Grape Ape', 'Grapefruit'] },
  'sunset-sherbert': { parents: ['GSC', 'Pink Panties'] },
  'sunset-sherbet': { parents: ['GSC', 'Pink Panties'] },
  gsc: { parents: ['OG Kush', 'Durban Poison'] },
  'thin-mint': { parents: ['GSC'], phenotype: true },
  'wedding-cake': { parents: ['Triangle Kush', 'Animal Mints'], alt: [['Cherry Pie', 'GSC']] },
  'ice-cream-cake': { parents: ['Wedding Cake', 'Gelato'] },
  'wedding-crasher': { parents: ['Wedding Cake', 'Purple Punch'] },
  'purple-punch': { parents: ['Larry OG', 'Granddaddy Purple'] },
  mimosa: { parents: ['Clementine', 'Purple Punch'] },
  'do-si-dos': { parents: ['GSC', 'Face Off OG'] },
  slurricane: { parents: ['Do-Si-Dos', 'Purple Punch'] },
  biscotti: { parents: ['Gelato', 'South Florida OG'] },
  'gary-payton': { parents: ['The Y', 'Snowman'] },
  'cereal-milk': { parents: ['Y Life', 'Snowman'] },
  'apple-fritter': { parents: ['Sour Apple', 'Animal Cookies'] },
  'tropicana-cookies': { parents: ['GSC', 'Tangie'] },
  jealousy: { parents: ['Sunset Sherbert', 'Gelato'] },
  'gmo-cookies': { parents: ['Chemdawg', 'GSC'] },
  gmo: { parents: ['Chemdawg', 'GSC'] },
  'modified-grapes': { parents: ['GMO Cookies', 'Purple Punch'] },
  'blue-dream': { parents: ['Blueberry', 'Haze'] },
  'pineapple-express': { parents: ['Trainwreck', 'Hawaiian'] },
  headband: { parents: ['OG Kush', 'Sour Diesel'] },
  'sour-diesel': { parents: ['Chemdawg', 'Super Skunk'] },
  'original-glue': { parents: ["Chem's Sister", 'Sour Dubb', 'Chocolate Diesel'] },
  'strawberry-banana': { parents: ['Banana Kush', 'Bubble Gum'] },
  'banana-kush': { parents: ['Ghost OG', 'Skunk Haze'] },
  'cookies-and-cream': { parents: ['Starfighter', 'GSC'] },
  'forbidden-fruit': { parents: ['Cherry Pie', 'Tangie'] },
  'cherry-pie': { parents: ['Granddaddy Purple', 'Durban Poison'] },
  'granddaddy-purple': { parents: ['Purple Urkle', 'Big Bud'] },
  'master-kush': { parents: ['Hindu Kush', 'Skunk #1'] },
  'pink-kush': { parents: ['OG Kush'], phenotype: true },
  'ghost-train-haze': { parents: ['Ghost OG', "Neville's Wreck"] },
  'super-lemon-haze': { parents: ['Lemon Skunk', 'Super Silver Haze'] },
  'super-silver-haze': { parents: ['Skunk #1', 'Northern Lights', 'Haze'] },
  'lemon-haze': { parents: ['Lemon Skunk', 'Silver Haze'] },
  'bruce-banner': { parents: ['OG Kush', 'Strawberry Diesel'] },
  'larry-og': { parents: ['OG Kush', 'SFV OG'] },
  'fire-og': { parents: ['OG Kush', 'SFV OG'] },
  'triangle-kush': { parents: ['OG Kush'], phenotype: true },
  'sfv-og': { parents: ['OG Kush'], phenotype: true },
  'og-kush': { parents: ['Chemdawg', 'Hindu Kush'] },
  tangie: { parents: ['California Orange', 'Skunk #1'] },
  'sour-tangie': { parents: ['Sour Diesel', 'Tangie'] },
  'critical-kush': { parents: ['Critical Mass', 'OG Kush'] },
  'kush-cake': { parents: ['Kush Mints', 'Wedding Cake'] },
  'peanut-butter-breath': { parents: ['Do-Si-Dos', 'Mendo Breath'] },
  gushers: { parents: ['Gelato', 'Triangle Kush'] },
  oreoz: { parents: ['Cookies and Cream', 'Secret Weapon'] },
  motorbreath: { parents: ['Chemdawg', 'SFV OG'] },
  mac: { parents: ['Alien Cookies', 'Colombian', 'Starfighter'] },
  'grape-ape': { parents: ['Mendocino Purps', 'Skunk #1', 'Afghani'] },
  'lemon-cherry-gelato': { parents: ['Sunset Sherbert', 'GSC'] },
  'permanent-marker': { parents: ['Biscotti', 'Jealousy'] },
};

const CROSS = /^(.+?)\s+(?:x|×|X)\s+(.+)$/;

/** "Runtz x Alien Mintz" / "Genetik: Alien Cookies × Animal Mints" → ["Runtz", "Alien Mintz"]. */
export function parseCross(text: string): string[] | null {
  const line =
    text
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(genetik|genetics|genetic|lineage|kreuzung|cross|abstammung)\s*[:\-–]\s*/i, '').trim())
      .find((l) => CROSS.test(l)) ?? '';
  const m = CROSS.exec(line);
  if (!m) return null;
  const parts = [m[1], ...m[2].split(/\s+(?:x|×|X)\s+/)].map((s) => s.replace(/[()]/g, '').trim()).filter((s) => s.length >= 2);
  return parts.length >= 2 ? parts : null;
}

export type LineageNode =
  | { kind: 'data'; name: string; strain: DbStrain }
  | { kind: 'cross'; name: string; phenotype: boolean; reported: boolean; alt?: string[][]; children: LineageNode[] }
  | { kind: 'unknown'; name: string };

function exactDbMatch(db: StrainDb, name: string): DbStrain | null {
  const hit = searchStrains(db, name, 1)[0];
  return hit && (hit.via === 'exact' || hit.via === 'alias') ? hit.strain : null;
}

const slugOf = (name: string) => cleanQuery(name).replace(/ /g, '-');

/** Builds a lineage tree; parents with little or no lab data are resolved through their own parents. */
export function resolveLineage(db: StrainDb, name: string, parents?: string[], depth = 2): LineageNode {
  const own = exactDbMatch(db, name);
  if (!parents && own && own.k >= 5) return { kind: 'data', name: own.n, strain: own };
  const entry = parents ? { parents } : LINEAGE[slugOf(name)];
  if (entry && depth > 0) {
    const children = entry.parents.map((p) => resolveLineage(db, p, undefined, depth - 1));
    if (children.some((c) => c.kind !== 'unknown')) {
      return {
        kind: 'cross',
        name,
        phenotype: !!(entry as LineageEntry).phenotype,
        reported: !parents,
        alt: (entry as LineageEntry).alt,
        children,
      };
    }
  }
  if (own) return { kind: 'data', name: own.n, strain: own };
  return { kind: 'unknown', name };
}

/** Terpene profile of a lineage node: lab medians, or the equal-weight mean of its known parents. */
export function lineageProfile(node: LineageNode): Amounts | null {
  if (node.kind === 'unknown') return null;
  if (node.kind === 'data') {
    const p = profileFromDb(node.strain).percent;
    return Object.fromEntries(Object.entries(p).filter(([id]) => COMPOUNDS[id as CompoundId].cls !== 'cannabinoid')) as Amounts;
  }
  const profiles = node.children.map(lineageProfile).filter((p): p is Amounts => !!p);
  if (!profiles.length) return null;
  const ids = new Set(profiles.flatMap((p) => Object.keys(p) as CompoundId[]));
  const out: Amounts = {};
  for (const id of ids) {
    const v = profiles.reduce((a, p) => a + (p[id] ?? 0), 0) / profiles.length;
    if (v > 0.011) out[id] = Math.round(v * 1000) / 1000;
  }
  return out;
}

/** Plain-language description of the tree for the "how this profile was made" steps. */
export function describeLineage(node: LineageNode, top = true): string[] {
  if (node.kind === 'data') return [`${node.strain.n}: ${node.strain.k} lab tests.`];
  if (node.kind === 'unknown') return [`${node.name}: no lab data and no known parents — left out.`];
  const joined = node.children.map((c) => (c.kind === 'data' ? c.strain.n : c.name)).join(' × ');
  const head = node.phenotype
    ? `${node.name} is a selected phenotype of ${joined}.`
    : `${node.name} = ${joined}${node.reported ? ' (commonly reported lineage — breeder claims, sometimes disputed)' : ' (as you stated)'}.`;
  const alt = node.alt?.length ? [`Also reported: ${node.alt.map((a) => a.join(' × ')).join('; ')}.`] : [];
  const kids = node.children.flatMap((c) => (c.kind === 'cross' ? [`${c.name}: no own lab data → ${describeLineage(c, false).join(' ')}`] : describeLineage(c, false)));
  return top ? [head, ...alt, ...kids] : [head, ...kids];
}

export function lineageTestCount(node: LineageNode): number {
  if (node.kind === 'data') return node.strain.k;
  if (node.kind === 'unknown') return 0;
  return node.children.reduce((a, c) => a + lineageTestCount(c), 0);
}

export function lineageSources(node: LineageNode): DbStrain[] {
  if (node.kind === 'data') return [node.strain];
  if (node.kind === 'unknown') return [];
  return node.children.flatMap(lineageSources);
}
