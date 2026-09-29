/** Lower-case, strip accents and punctuation, collapse whitespace. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/#/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NOISE = new Set([
  'flower', 'flowers', 'bud', 'buds', 'bluten', 'blute', 'cannabis', 'medical', 'strain', 'sorte', 'pre', 'roll', 'preroll',
  'prerolls', 'vape', 'cart', 'cartridge', 'live', 'resin', 'rosin', 'indica', 'sativa', 'hybrid', 'dominant', 'thc', 'cbd',
  'g', 'gr', 'gram', 'grams', 'oz', 'eighth', 'whole', 'ground', 'smalls', 'shake', 'popcorn',
]);

/** Removes weights, batch codes and format words: "Blue Dream 3.5g Flower 00345" → "blue dream". */
export function cleanQuery(s: string): string {
  return normalizeName(s)
    .split(' ')
    .filter((t) => t && !NOISE.has(t) && !/^\d+(g|mg|oz)?$/.test(t) && !/^\d+\s*\d*g$/.test(t) && !/^[a-z]?\d{3,}$/.test(t))
    .join(' ');
}

export const slugify = (s: string) => cleanQuery(s).replace(/ /g, '-');

/** Common names and abbreviations → dataset slug (Leafly-style). */
export const STRAIN_ALIASES: Record<string, string> = {
  gg4: 'original-glue',
  'gg 4': 'original-glue',
  'gorilla glue': 'original-glue',
  'gorilla glue 4': 'original-glue',
  'gorilla glue no 4': 'original-glue',
  'original glue': 'original-glue',
  gsc: 'gsc',
  'girl scout cookies': 'gsc',
  'girl scouts cookies': 'gsc',
  'sunset sherbet': 'sunset-sherbert',
  'sunset sherbert': 'sunset-sherbert',
  ak47: 'ak-47',
  'ak 47': 'ak-47',
  gdp: 'granddaddy-purple',
  'grand daddy purple': 'granddaddy-purple',
  'granddaddy purp': 'granddaddy-purple',
  ssh: 'super-silver-haze',
  'sour d': 'sour-diesel',
  sd: 'sour-diesel',
  jh: 'jack-herer',
  'jack': 'jack-herer',
  'og': 'og-kush',
  'bd': 'blue-dream',
  'ww': 'white-widow',
  'nl': 'northern-lights',
  'gmo': 'gmo-cookies',
  'garlic cookies': 'gmo-cookies',
  'wedding cake': 'wedding-cake',
  'pineapple exp': 'pineapple-express',
  'gelato 41': 'gelato',
  'blue cheese': 'blue-cheese',
  'uk cheese': 'cheese',
  'ghost train': 'ghost-train-haze',
  'gth': 'ghost-train-haze',
  'tangerine dream': 'tangerine-dream',
  'mimosa': 'mimosa',
  'la confidential': 'la-confidential',
};

/** Sørensen–Dice similarity on character bigrams (0–1). */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = grams.get(g) ?? 0;
    if (n > 0) {
      grams.set(g, n - 1);
      hits++;
    }
  }
  return (2 * hits) / (a.length + b.length - 2);
}
