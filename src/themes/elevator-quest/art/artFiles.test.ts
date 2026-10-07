// The art files themselves (not their looks): every image the manifest lists is in the repository,
// is not damaged, and has the size and transparency its entry says; and nothing sits in the art
// folder without an entry. Damaged files once passed every other gate (99be216: three PNGs lost
// bytes before they were committed): the browser then drew half a back wall over black, and a
// Lifty pose with only its antenna, so Lifty vanished.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { ART_MANIFEST } from './catalog';

const ART_DIR = path.join(__dirname, '../../../../assets/themes/elevator-quest/art');

type Decoded = { width: number; height: number; hasAlphaChannel: boolean; alphaAt?: (x: number, y: number) => number };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Reads a whole 8-bit, non-interlaced PNG: every chunk's checksum, the image data, the end marker. */
function readPng(buf: Buffer): Decoded {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG');
  let at = 8;
  let header: { width: number; height: number; depth: number; type: number; interlace: number } | null = null;
  const data: Buffer[] = [];
  let ended = false;
  while (!ended) {
    if (at + 12 > buf.length) throw new Error('file ends inside a chunk (truncated)');
    const length = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    if (at + 12 + length > buf.length) throw new Error(`${type} chunk is cut short (truncated)`);
    if (zlib.crc32(buf.subarray(at + 4, at + 8 + length)) >>> 0 !== buf.readUInt32BE(at + 8 + length)) throw new Error(`${type} chunk checksum fails (damaged)`);
    const body = buf.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8]!, type: body[9]!, interlace: body[12]! };
    if (type === 'IDAT') data.push(body);
    if (type === 'IEND') ended = true;
    at += 12 + length;
  }
  if (!header) throw new Error('no IHDR');
  const { width, height, depth, type, interlace } = header;
  const channels = PNG_CHANNELS[type];
  if (depth !== 8 || interlace !== 0 || channels === undefined) throw new Error(`unsupported PNG (bit depth ${depth}, colour type ${type}, interlace ${interlace}): export 8-bit RGB or RGBA`);
  const raw = zlib.inflateSync(Buffer.concat(data)); // throws on damaged image data
  const stride = width * channels;
  if (raw.length !== height * (stride + 1)) throw new Error(`image data holds ${raw.length} bytes, expected ${height * (stride + 1)}`);
  if (type !== 6) return { width, height, hasAlphaChannel: type === 4 };
  // Undo the row filters so the alpha channel can be read.
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= channels ? px[y * stride + i - channels]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + i]! : 0;
      const c = i >= channels && y > 0 ? px[(y - 1) * stride + i - channels]! : 0;
      const p = a + b - c;
      const pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      const predictor = [0, a, b, (a + b) >> 1, pr][filter];
      if (predictor === undefined) throw new Error(`bad row filter ${filter}`);
      px[y * stride + i] = (x + predictor) & 0xff;
    }
  }
  return { width, height, hasAlphaChannel: true, alphaAt: (x, y) => px[y * stride + x * 4 + 3]! };
}

/** Reads a WebP's container and size. Its pixels are not decoded here: the length check catches truncation. */
function readWebp(buf: Buffer): Decoded {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') throw new Error('not a WebP');
  if (buf.readUInt32LE(4) + 8 !== buf.length) throw new Error(`RIFF size ${buf.readUInt32LE(4) + 8} does not match the file's ${buf.length} bytes (truncated or padded)`);
  const chunk = buf.toString('latin1', 12, 16);
  if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1, hasAlphaChannel: (buf[20]! & 0x10) !== 0 };
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, hasAlphaChannel: ((bits >> 28) & 1) === 1 };
  }
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, hasAlphaChannel: false };
  throw new Error(`unknown WebP chunk ${chunk}`);
}

const read = (file: string) => (file.endsWith('.png') ? readPng : readWebp)(fs.readFileSync(path.join(ART_DIR, file)));

/** A tiny real PNG (8-bit RGBA): transparent corners, an opaque middle. */
function tinyPng(): Buffer {
  const size = 4;
  const rows: number[] = [];
  for (let y = 0; y < size; y++) {
    rows.push(0);
    for (let x = 0; x < size; x++) rows.push(255, 128, 0, x > 0 && x < 3 && y > 0 && y < 3 ? 255 : 0);
  }
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'latin1'), body])) >>> 0);
    return Buffer.concat([len, Buffer.from(type, 'latin1'), body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]);
}

describe('art file check', () => {
  it('reads a sound PNG and refuses a truncated or altered one', () => {
    const good = tinyPng();
    const img = readPng(good);
    expect([img.width, img.height, img.alphaAt!(0, 0), img.alphaAt!(1, 1)]).toEqual([4, 4, 0, 255]);
    const idat = good.indexOf('IDAT');
    const cut = Buffer.concat([good.subarray(0, idat + 10), good.subarray(idat + 14)]); // bytes lost mid-file
    expect(() => readPng(cut)).toThrow(/truncated|damaged/);
    const flipped = Buffer.from(good);
    flipped[idat + 6] = flipped[idat + 6]! ^ 0xff;
    expect(() => readPng(flipped)).toThrow(/damaged/);
  });
});

describe('art files', () => {
  it.each(ART_MANIFEST.assets.map((a) => [a.id, a] as const))('%s is intact and matches its entry', (_id, a) => {
    const img = read(a.file);
    expect([img.width, img.height]).toEqual([a.width, a.height]);
    if (!a.alpha) {
      // Opaque art: no transparency anywhere.
      if (img.alphaAt) for (let y = 0; y < img.height; y += 7) for (let x = 0; x < img.width; x += 7) expect(img.alphaAt(x, y)).toBe(255);
      else expect(img.hasAlphaChannel).toBe(false);
      return;
    }
    expect(img.hasAlphaChannel).toBe(true);
    if (!img.alphaAt) return; // WebP: the container says it carries alpha; pixels are checked by eye.
    let clear = 0;
    let opaque = 0;
    for (let y = 0; y < img.height; y += 4)
      for (let x = 0; x < img.width; x += 4) {
        const alpha = img.alphaAt(x, y);
        if (alpha === 255) opaque++;
        else if (alpha === 0) clear++;
      }
    // A transparent file really uses its transparency (not a painted checkerboard).
    expect(clear).toBeGreaterThan(0);
    if (a.kind !== 'lifty' && a.kind !== 'object') return; // overlays and strips may be soft or edge to edge
    // Cut-outs (Lifty, mission objects): clear corners around a solid figure.
    const corners = [img.alphaAt(0, 0), img.alphaAt(img.width - 1, 0), img.alphaAt(0, img.height - 1), img.alphaAt(img.width - 1, img.height - 1)];
    expect(corners).toEqual([0, 0, 0, 0]);
    expect(opaque).toBeGreaterThan(0);
  });

  it('every manifest entry has its file on disk', () => {
    expect(ART_MANIFEST.assets.filter((a) => !fs.existsSync(path.join(ART_DIR, a.file))).map((a) => a.file)).toEqual([]);
  });

  it('production and review requires point at the manifest file of the same asset', () => {
    const root = path.join(__dirname, '../../../..');
    const lists: [string, RegExp][] = [
      ['src/themes/elevator-quest/art/sources.ts', /^\s+'([a-z0-9.-]+)': require\('\.\.\/\.\.\/\.\.\/\.\.\/assets\/themes\/elevator-quest\/art\/([^']+)'\),$/gm],
      ['src/devtools/artReviewSources.ts', /^\s+'([a-z0-9.-]+)': require\('\.\.\/\.\.\/assets\/themes\/elevator-quest\/art\/([^']+)'\),$/gm],
    ];
    for (const [file, re] of lists) {
      const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/^\s*\/\/.*$/gm, '');
      const required = [...text.matchAll(re)].map((m) => [m[1]!, m[2]!] as const);
      // Every require line is one the pattern understood (none hidden by a different spelling).
      expect({ file, lines: required.length }).toEqual({ file, lines: (text.match(/require\(/g) ?? []).length });
      for (const [id, f] of required) expect({ file, id, file_: f }).toEqual({ file, id, file_: ART_MANIFEST.assets.find((a) => a.id === id)?.file });
    }
  });

  it('every file in the art folder has a manifest entry', () => {
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.relative(ART_DIR, path.join(dir, d.name)).split(path.sep).join('/')]));
    const listed = new Set(ART_MANIFEST.assets.map((a) => a.file));
    expect(fs.existsSync(ART_DIR) ? walk(ART_DIR).filter((f) => !listed.has(f)) : []).toEqual([]);
  });
});
