#!/usr/bin/env node
// Development calibration art for the production-art pipeline. NOT game art.
//
//   node scripts/generate-art-calibration.js
//
// Writes flat test patterns (grids, safe-core and reserved-zone outlines, pivot dots, baselines,
// pips that identify a pose or object) into assets/dev/art/, the matching manifest
// (assets/dev/art/calibration.json, same schema as the production manifest), and the static
// require list the developer tools use (src/devtools/artCalibrationSources.ts). They exist to line
// up layers, crops, pivots and fallbacks before real art arrives. They are bundled only into
// development builds (the developer tools import them; check:bundle keeps them out of production).
//
// No dependencies: a tiny RGBA rasterizer and PNG encoder. One landing is also re-encoded as
// lossless WebP with Pillow (python3 -I) when it is available, so the WebP decode path is exercised
// in the browser; without Pillow the existing WebP file is kept and a warning is printed.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const OUT = path.join(root, 'assets', 'dev', 'art');

// ---------- raster ----------

function canvas(w, h, fill = [0, 0, 0, 0]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set(fill, i * 4);
  return { w, h, px };
}
function blend(c, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  const sa = a / 255;
  const da = c.px[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  c.px[i] = (r * sa + c.px[i] * da * (1 - sa)) / oa;
  c.px[i + 1] = (g * sa + c.px[i + 1] * da * (1 - sa)) / oa;
  c.px[i + 2] = (b * sa + c.px[i + 2] * da * (1 - sa)) / oa;
  c.px[i + 3] = oa * 255;
}
function rect(c, x, y, w, h, color) {
  for (let yy = Math.max(0, Math.round(y)); yy < Math.min(c.h, Math.round(y + h)); yy++) for (let xx = Math.max(0, Math.round(x)); xx < Math.min(c.w, Math.round(x + w)); xx++) blend(c, xx, yy, color);
}
function stroke(c, x, y, w, h, t, color, dash = 0) {
  const on = (v) => !dash || Math.floor(v / dash) % 2 === 0;
  for (let xx = x; xx < x + w; xx++) if (on(xx - x)) (rect(c, xx, y, 1, t, color), rect(c, xx, y + h - t, 1, t, color));
  for (let yy = y; yy < y + h; yy++) if (on(yy - y)) (rect(c, x, yy, t, 1, color), rect(c, x + w - t, yy, t, 1, color));
}
function circle(c, cx, cy, r, color, ring = 0) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r && (!ring || d >= r - ring)) blend(c, x, y, color);
    }
}
function line(c, x1, y1, x2, y2, t, color) {
  const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
  for (let i = 0; i <= n; i++) circle(c, x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, t / 2, color);
}
/** Seven-segment digits (a floor id in a corner), blocky on purpose: a test mark, not lettering. */
function digits(c, text, x, y, h, color) {
  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  const w = h * 0.55;
  const t = Math.max(2, h * 0.12);
  [...String(text)].forEach((d, i) => {
    const ox = x + i * (w + t * 1.5);
    const s = SEG[d] || '';
    if (s.includes('a')) rect(c, ox, y, w, t, color);
    if (s.includes('b')) rect(c, ox + w - t, y, t, h / 2, color);
    if (s.includes('c')) rect(c, ox + w - t, y + h / 2, t, h / 2, color);
    if (s.includes('d')) rect(c, ox, y + h - t, w, t, color);
    if (s.includes('e')) rect(c, ox, y + h / 2, t, h / 2, color);
    if (s.includes('f')) rect(c, ox, y, t, h / 2, color);
    if (s.includes('g')) rect(c, ox, y + h / 2 - t / 2, w, t, color);
  });
}
function pips(c, n, x, y, r, color) {
  for (let i = 0; i < n; i++) circle(c, x + i * r * 2.6, y, r, color);
}

// ---------- PNG ----------

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(c) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0);
  ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((c.w * 4 + 1) * c.h);
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * 4 + 1)] = 0;
    Buffer.from(c.px.buffer, y * c.w * 4, c.w * 4).copy(raw, y * (c.w * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- the landing canvas (mirrors src/themes/elevator-quest/art/fit.ts and manifest.ts) ----------

const SAFE = { x: 0.16, y: 0.08, w: 0.68, h: 0.84 };
const OVERSCAN = 0.03;
const ASPECTS = { min: 0.72, max: 1.12 };
// Door-unit zones drawn natively over an illustrated landing (ui/landingArt.ts): the live sign (with
// the floor number on it, D136) and the mission-object floor. The middle of the wall is the scene's.
const ZONES = { sign: { x: 0.18, y: 0.085, w: 0.64, h: 0.11 }, objectWide: { x: 0.26, y: 0.6, w: 0.48, h: 0.2 } };
function reserved(zone) {
  let [x0, y0, x1, y1] = [1, 1, 0, 0];
  for (let i = 0; i <= 24; i++) {
    const a = ASPECTS.min + ((ASPECTS.max - ASPECTS.min) * i) / 24;
    const door = { x: 0, y: 0, w: a * 400, h: 400 };
    const m = door.w * OVERSCAN;
    const box = { x: -m, y: -m, w: door.w + 2 * m, h: door.h + 2 * m };
    const s = Math.max(box.w, box.h); // square canvas
    const p = { x: box.x + (box.w - s) / 2, y: box.y + (box.h - s) / 2, w: s, h: s };
    const r = { x: zone.x * door.w, y: zone.y * door.h, w: zone.w * door.w, h: zone.h * door.h };
    x0 = Math.min(x0, (r.x - p.x) / p.w);
    y0 = Math.min(y0, (r.y - p.y) / p.h);
    x1 = Math.max(x1, (r.x + r.w - p.x) / p.w);
    y1 = Math.max(y1, (r.y + r.h - p.y) / p.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const C = {
  slate: [43, 47, 54, 255],
  grid: [58, 64, 74, 255],
  grid2: [74, 82, 96, 255],
  safe: [72, 200, 120, 255],
  zone: [240, 170, 60, 200],
  zoneFill: [240, 170, 60, 40],
  cyan: [70, 200, 230, 255],
  magenta: [220, 90, 200, 255],
  white: [235, 240, 245, 255],
  pivot: [255, 80, 80, 255],
};
const TINT = { 7: [90, 140, 220, 255], 9: [150, 200, 230, 255], 13: [200, 120, 70, 255], 15: [70, 90, 160, 255], 20: [90, 170, 110, 255] };

function landingBackground(floor, size = 1024) {
  const c = canvas(size, size, C.slate);
  for (let v = 0; v < size; v += 64) (rect(c, v, 0, 1, size, v % 256 ? C.grid : C.grid2), rect(c, 0, v, size, 1, v % 256 ? C.grid : C.grid2));
  rect(c, 0, 0, size, size * 0.05, TINT[floor]);
  rect(c, 0, size * 0.95, size, size * 0.05, TINT[floor]);
  for (const z of Object.values(ZONES)) {
    const r = reserved(z);
    rect(c, r.x * size, r.y * size, r.w * size, r.h * size, C.zoneFill);
    stroke(c, Math.round(r.x * size), Math.round(r.y * size), Math.round(r.w * size), Math.round(r.h * size), 3, C.zone, 12);
  }
  stroke(c, Math.round(SAFE.x * size), Math.round(SAFE.y * size), Math.round(SAFE.w * size), Math.round(SAFE.h * size), 6, C.safe);
  line(c, size / 2 - 24, size / 2, size / 2 + 24, size / 2, 3, C.white);
  line(c, size / 2, size / 2 - 24, size / 2, size / 2 + 24, 3, C.white);
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) rect(c, x * (size - 40), y * (size - 40), 40, 40, C.magenta);
  digits(c, floor, SAFE.x * size + 14, (SAFE.y + SAFE.h) * size - 70, 52, C.white);
  return c;
}

/** A moving piece: a flat shape with its pivot marked, so a wrong pivot shows at once. */
function movingPiece(w, h, kind, pivot) {
  const c = canvas(w, h);
  if (kind === 'blades') for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    line(c, w / 2, h / 2, w / 2 + Math.cos(a) * w * 0.46, h / 2 + Math.sin(a) * h * 0.46, w * 0.09, C.cyan);
  }
  if (kind === 'slab') (rect(c, 0, h * 0.2, w, h * 0.6, C.magenta), rect(c, 0, h * 0.2, w, h * 0.1, C.white));
  if (kind === 'hook') (rect(c, w * 0.45, 0, w * 0.1, h * 0.8, C.white), circle(c, w / 2, h * 0.86, w * 0.3, C.cyan, w * 0.1));
  if (kind === 'flag') (rect(c, 0, 0, w * 0.06, h, C.white), rect(c, w * 0.06, h * 0.04, w * 0.9, h * 0.38, C.magenta));
  if (kind === 'capsule') (circle(c, w / 2, w / 2, w / 2, C.cyan), rect(c, 0, w / 2, w, h - w, C.cyan), rect(c, w * 0.2, w * 0.4, w * 0.15, h * 0.5, C.white));
  circle(c, pivot.x * (w - 1), pivot.y * (h - 1), Math.max(6, w * 0.05), C.pivot);
  return c;
}

function lightOverlay(size, color, spots) {
  const c = canvas(size, size);
  for (const [x, y, r] of spots) for (let k = 6; k >= 1; k--) circle(c, x * size, y * size, (r * size * k) / 6, [color[0], color[1], color[2], 18]);
  return c;
}

// ---------- cabin, Lifty, objects, icons ----------

function grid(w, h, base, step, color, edge) {
  const c = canvas(w, h, base);
  for (let x = 0; x < w; x += step) rect(c, x, 0, 1, h, color);
  for (let y = 0; y < h; y += step) rect(c, 0, y, w, 1, color);
  if (edge) stroke(c, 0, 0, w, h, 4, edge);
  return c;
}
const BRASS = [150, 120, 70, 255];
const BRASS_DARK = [100, 78, 45, 255];
function cabinPiece(name, w, h) {
  switch (name) {
    case 'backing': {
      const c = grid(w, h, [60, 52, 44, 255], 128, [80, 70, 58, 255]);
      line(c, w * 0.5 - 40, h * 0.56, w * 0.5 + 40, h * 0.56, 4, C.white);
      line(c, w * 0.5, h * 0.56 - 40, w * 0.5, h * 0.56 + 40, 4, C.white);
      return c;
    }
    case 'door-left':
    case 'door-right': {
      const c = grid(w, h, [96, 104, 112, 255], 64, [110, 118, 128, 255]);
      // The meeting edge is bright: the cover fit keeps it in view.
      rect(c, name === 'door-left' ? w - 24 : 0, 0, 24, h, C.cyan);
      return c;
    }
    case 'frame-top':
    case 'frame-left':
    case 'frame-right': {
      const c = canvas(w, h, BRASS);
      for (let v = 0; v < Math.max(w, h); v += 32) w > h ? rect(c, v, 0, 2, h, BRASS_DARK) : rect(c, 0, v, w, 2, BRASS_DARK);
      return c;
    }
    case 'wall-left':
    case 'wall-right': {
      const c = grid(w, h, [70, 62, 52, 255], 64, [86, 76, 64, 255]);
      rect(c, name === 'wall-left' ? w - 12 : 0, 0, 12, h, C.cyan);
      return c;
    }
    case 'ceiling':
      return grid(w, h, [40, 44, 50, 255], 128, [60, 66, 74, 255], C.cyan);
    case 'floor':
      return grid(w, h, [52, 46, 40, 255], 64, [66, 58, 50, 255]);
    case 'inlay': {
      const c = canvas(w, h);
      for (let k = 0; k < 3; k++) circle(c, w / 2, h / 2, h * (0.45 - k * 0.12), BRASS, 6);
      return c;
    }
    case 'light': {
      const c = canvas(w, h);
      for (const x of [0.3, 0.7]) for (let k = 6; k >= 1; k--) circle(c, x * w, 0.04 * h, (0.25 * w * k) / 6, [C.cyan[0], C.cyan[1], C.cyan[2], 18]);
      return c;
    }
  }
  throw new Error(name);
}

// Lifty's production poses (D137), in LIFTY_POSES order (art/manifest.ts).
const POSES = ['neutral', 'help', 'thinking', 'success', 'concerned', 'quiet'];
function liftyPose(i) {
  const s = 512;
  const c = canvas(s, s);
  const base = Math.round(s * 0.94);
  rect(c, 0, base, s, 3, C.pivot); // baseline
  rect(c, s / 2 - 1, 0, 2, s, [255, 255, 255, 60]); // centre line
  rect(c, s * 0.3, s * 0.5, s * 0.4, base - s * 0.5, [200, 200, 205, 255]); // body block
  rect(c, s * 0.26, s * 0.18, s * 0.48, s * 0.28, [235, 225, 210, 255]); // head block
  rect(c, s * 0.31, s * 0.22, s * 0.38, s * 0.2, [20, 40, 50, 255]); // screen
  pips(c, i + 1, s * 0.36, s * 0.32, 10, C.cyan); // which pose
  if (i === 1) line(c, s * 0.7, s * 0.56, s * 0.95, s * 0.5, 14, C.magenta); // pointing arm
  return c;
}

const OBJECTS = [['repairKit', 'repair-kit', false], ['toolbox', 'toolbox', false], ['spareParts', 'spare-parts', false], ['crew', 'crew', true], ['beacon', 'beacon', false], ['loadingDock', 'loading-dock', true]];
function objectImage(i, wide) {
  const w = wide ? 768 : 512;
  const h = 320;
  const c = canvas(w, h);
  const base = Math.round(h * 0.95);
  rect(c, 0, base, w, 3, C.pivot);
  rect(c, w * 0.15, h * 0.3, w * 0.7, base - h * 0.3, [210, 160, 70, 255]);
  stroke(c, Math.round(w * 0.15), Math.round(h * 0.3), Math.round(w * 0.7), Math.round(base - h * 0.3), 6, C.white);
  pips(c, i + 1, w * 0.25, h * 0.5, 12, [40, 40, 50, 255]);
  return c;
}

function icon(floor) {
  const c = canvas(256, 256);
  rect(c, 16, 16, 224, 224, TINT[floor]);
  stroke(c, 16, 16, 224, 224, 8, C.white);
  digits(c, floor, 60, 70, 110, C.white);
  return c;
}

// ---------- write ----------

const PROV = { provider: 'Calibration generator (scripts/generate-art-calibration.js)', aiGenerated: false, humanReviewed: false, license: 'Project-original test pattern. Development only, never shipped.' };
const entries = [];
const written = [];
function save(file, img, entry) {
  const full = path.join(OUT, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, png(img));
  written.push(file);
  entries.push({ ...entry, file, width: img.w, height: img.h, provenance: PROV });
}

fs.rmSync(OUT, { recursive: true, force: true });

for (const floor of [7, 9, 13, 15, 20]) save(`landings/${floor}/background.png`, landingBackground(floor), { id: `landing.${floor}.background`, kind: 'landing', alpha: false, layer: 'background', floor });
save('landings/15/core.png', movingPiece(128, 384, 'capsule', { x: 0.5, y: 1 }), { id: 'landing.15.core', kind: 'landing', alpha: true, layer: 'moving', floor: 15, rect: { x: 0.18, y: 0.3, w: 0.1, h: 0.36 }, motion: { kind: 'tilt', pivot: { x: 0.5, y: 1 }, amount: 0.12, trigger: 'touch' }, hit: { x: 0.17, y: 0.28, w: 0.13, h: 0.4 } });
save('landings/15/light-restored.png', lightOverlay(512, C.cyan, [[0.23, 0.48, 0.3]]), { id: 'landing.15.light-restored', kind: 'landing', alpha: true, layer: 'light', floor: 15, state: 'restored' });
save('landings/15/light-dormant.png', canvas(512, 512, [10, 14, 30, 120]), { id: 'landing.15.light-dormant', kind: 'landing', alpha: true, layer: 'light', floor: 15, state: 'dormant' });
save('landings/7/platform.png', movingPiece(384, 96, 'slab', { x: 0.5, y: 0.5 }), { id: 'landing.7.platform', kind: 'landing', alpha: true, layer: 'moving', floor: 7, rect: { x: 0.18, y: 0.66, w: 0.12, h: 0.04 }, motion: { kind: 'slide', pivot: { x: 0.5, y: 0.5 }, amount: 0.04, trigger: 'arrival' } });
save('landings/9/turbine.png', movingPiece(512, 512, 'blades', { x: 0.5, y: 0.5 }), { id: 'landing.9.turbine', kind: 'landing', alpha: true, layer: 'moving', floor: 9, rect: { x: 0.7, y: 0.26, w: 0.13, h: 0.13 }, motion: { kind: 'spin', pivot: { x: 0.5, y: 0.5 }, amount: 1, trigger: 'arrival' } });
save('landings/13/hook.png', movingPiece(128, 384, 'hook', { x: 0.5, y: 0 }), { id: 'landing.13.hook', kind: 'landing', alpha: true, layer: 'moving', floor: 13, rect: { x: 0.74, y: 0.26, w: 0.05, h: 0.16 }, motion: { kind: 'tilt', pivot: { x: 0.5, y: 0 }, amount: 0.15, trigger: 'arrival' } });
save('landings/20/flag.png', movingPiece(192, 256, 'flag', { x: 0.03, y: 1 }), { id: 'landing.20.flag', kind: 'landing', alpha: true, layer: 'moving', floor: 20, rect: { x: 0.72, y: 0.36, w: 0.09, h: 0.12 }, motion: { kind: 'tilt', pivot: { x: 0.03, y: 1 }, amount: 0.12, trigger: 'arrival' } });

// Runtime sizes from CABIN_CANVAS (art/manifest.ts).
const CABIN = { backing: [1280, 1280], ceiling: [1536, 96], floor: [1536, 192], inlay: [768, 192], 'wall-left': [192, 1152], 'wall-right': [192, 1152], 'frame-top': [768, 48], 'frame-left': [48, 768], 'frame-right': [48, 768], 'door-left': [384, 768], 'door-right': [384, 768], light: [768, 576] };
for (const [name, [w, h]] of Object.entries(CABIN)) save(`cabin/${name}.png`, cabinPiece(name, w, h), { id: `cabin.${name}`, kind: 'cabin', alpha: ['inlay', 'light'].includes(name), layer: name });
POSES.forEach((pose, i) => save(`lifty/${pose}.png`, liftyPose(i), { id: `lifty.${pose}`, kind: 'lifty', alpha: true, pose }));
OBJECTS.forEach(([visual, slug, wide], i) => save(`objects/${slug}.png`, objectImage(i, wide), { id: `object.${slug}`, kind: 'object', alpha: true, visual }));
for (const floor of [7, 9, 13, 20]) save(`icons/floor-${floor}.png`, icon(floor), { id: `icon.floor-${floor}`, kind: 'icon', alpha: true, floor });

// One landing as lossless WebP: exercises the WebP decoder (the format production art is expected to use).
const webpFrom = 'landings/20/background.png';
const webpTo = 'landings/20/background.webp';
const py = spawnSync('python3', ['-I', '-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], "WEBP", lossless=True)', path.join(OUT, webpFrom), path.join(OUT, webpTo)], { encoding: 'utf8' });
if (py.status === 0) {
  fs.rmSync(path.join(OUT, webpFrom));
  const e = entries.find((x) => x.file === webpFrom);
  e.file = webpTo;
  e.provenance = { ...PROV, provider: 'Calibration generator, re-encoded as lossless WebP (Pillow)' };
  written.splice(written.indexOf(webpFrom), 1, webpTo);
} else console.warn(`warning: Pillow not available, ${webpTo} not made (${(py.stderr || '').trim().split('\n').pop()})`);

const manifest = { schemaVersion: 1, theme: 'elevator-quest', assets: entries.map(({ id, kind, file, width, height, alpha, provenance, ...rest }) => ({ id, kind, file, width, height, alpha, provenance, ...rest })) };
fs.writeFileSync(path.join(OUT, 'calibration.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const req = (f) => `require('../../assets/dev/art/${f}')`;
const sources = [
  '// Generated by scripts/generate-art-calibration.js. Do not edit by hand.',
  '// Development calibration art (assets/dev/art): static requires so Metro bundles exactly these files,',
  '// and only into builds that include the developer tools.',
  "import type { ArtSource } from '../themes/elevator-quest/art/manifest';",
  '',
  'export const CALIBRATION_SOURCES: Readonly<Record<string, ArtSource>> = {',
  ...manifest.assets.map((a) => `  '${a.id}': ${req(a.file)},`),
  '};',
  '',
].join('\n');
fs.writeFileSync(path.join(root, 'src', 'devtools', 'artCalibrationSources.ts'), sources);

const bytes = written.reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`wrote ${written.length} calibration images (${(bytes / 1024).toFixed(0)} KB) to assets/dev/art, calibration.json, and src/devtools/artCalibrationSources.ts`);
