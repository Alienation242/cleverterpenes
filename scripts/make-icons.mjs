// Rasterises the app icon (same shapes as public/icon.svg) into PNGs without dependencies.
// Usage: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BG = [15, 15, 16];
const ORANGE = [255, 106, 61];
const BLUE = [57, 135, 229];
const VOLCANO = [[100, 400], [215, 180], [256, 235], [297, 180], [412, 400]];
const DOTS = [
  [256, 120, 38, 1],
  [180, 92, 20, 0.7],
  [330, 98, 26, 0.85],
];

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundRect(x, y, size, r) {
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Colour of one sample in 512-unit space: [r, g, b, a]. */
function sample(x, y, maskable) {
  if (!maskable && !inRoundRect(x, y, 512, 112)) return [0, 0, 0, 0];
  let c = [...BG, 1];
  if (inPolygon(x, y, VOLCANO)) c = [...ORANGE, 1];
  for (const [cx, cy, r, a] of DOTS) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) c = [c[0] * (1 - a) + BLUE[0] * a, c[1] * (1 - a) + BLUE[1] * a, c[2] * (1 - a) + BLUE[2] * a, 1];
  }
  return c;
}

function render(size, maskable) {
  const ss = 4;
  const scale = 512 / size;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          // Maskable icons keep the art inside the central 80 % safe zone.
          let x = (px + (sx + 0.5) / ss) * scale;
          let y = (py + (sy + 0.5) / ss) * scale;
          if (maskable) {
            x = 256 + (x - 256) / 0.8;
            y = 256 + (y - 256) / 0.8;
          }
          const [cr, cg, cb, ca] = sample(x, y, maskable);
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const n = ss * ss;
      const o = 1 + px * 4;
      row[o] = a ? Math.round(r / a) : 0;
      row[o + 1] = a ? Math.round(g / a) : 0;
      row[o + 2] = a ? Math.round(b / a) : 0;
      row[o + 3] = Math.round((a / n) * 255);
    }
    rows.push(row);
  }
  return png(size, size, Buffer.concat(rows));
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(path.join(ROOT, 'public', 'icon-192.png'), render(192, false));
writeFileSync(path.join(ROOT, 'public', 'icon-512.png'), render(512, false));
writeFileSync(path.join(ROOT, 'public', 'icon-maskable-512.png'), render(512, true));
console.log('Icons written to public/');
