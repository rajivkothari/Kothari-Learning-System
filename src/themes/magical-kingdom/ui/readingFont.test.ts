// The reading typeface shipped in the app is Andika 6.101 exactly as published, with its licence, and the native
// build, the browser build and the styles all name the same two files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import manifest from '../../../../assets/themes/magical-kingdom/fonts/manifest.json';
import app from '../../../../app.json';
import { NO_READING_FONT, READING_BOLD_FACE, READING_FAMILY } from './readingFontFamily';

const ROOT = path.join(__dirname, '../../../..');
const DIR = path.join(ROOT, 'assets/themes/magical-kingdom/fonts');
const sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, file))).digest('hex');

/** The Windows English strings of a TrueType file's name table, by name id. */
function names(file: string): Record<number, string> {
  const b = fs.readFileSync(path.join(DIR, file));
  let table = 0;
  for (let i = 0; i < b.readUInt16BE(4); i++) if (b.toString('ascii', 12 + i * 16, 16 + i * 16) === 'name') table = b.readUInt32BE(20 + i * 16);
  const out: Record<number, string> = {};
  for (let i = 0; i < b.readUInt16BE(table + 2); i++) {
    const r = table + 6 + i * 12;
    if (b.readUInt16BE(r) !== 3 || b.readUInt16BE(r + 4) !== 0x409) continue;
    const at = table + b.readUInt16BE(table + 4) + b.readUInt16BE(r + 10);
    out[b.readUInt16BE(r + 6)] = Buffer.from(b.subarray(at, at + b.readUInt16BE(r + 8))).swap16().toString('utf16le');
  }
  return out;
}

describe('Magical Kingdom reading typeface', () => {
  it('ships Andika 6.101 as published, with the Open Font License beside it', () => {
    expect(manifest.licence).toBe('OFL-1.1');
    expect(manifest.commit).toBe('515797205c54276da8c06026f479d3a9d5404932');
    const licence = fs.readFileSync(path.join(DIR, manifest.licenceFile), 'utf8');
    expect(licence).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(licence).toContain('with Reserved Font Names "Andika" and "SIL"');
    expect(sha256(manifest.licenceFile)).toBe(manifest.licenceSha256);
    expect(manifest.files.map((f) => f.file)).toEqual(['Andika-Regular.ttf', 'Andika-Bold.ttf']);
    for (const f of manifest.files) {
      expect(fs.statSync(path.join(DIR, f.file)).size).toBe(f.bytes);
      expect(sha256(f.file)).toBe(f.sha256);
      const n = names(f.file);
      expect([n[1], n[2], n[6], n[5]]).toEqual([f.family, f.subfamily, f.postScriptName, `Version ${manifest.version}`]);
      expect(n[13]).toContain('SIL Open Font License');
    }
    expect(fs.readdirSync(DIR).sort()).toEqual(['manifest.json', manifest.licenceFile, ...manifest.files.map((f) => f.file)].sort());
  });

  it('is named the same way in the files, the native build and the styles', () => {
    const [regular, bold] = manifest.files;
    expect(READING_FAMILY).toBe(regular!.family);
    expect(bold!.family).toBe(READING_FAMILY);
    expect(READING_BOLD_FACE).toBe(bold!.postScriptName);
    const plugin = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-font') as unknown as [string, { android: { fonts: { fontFamily: string; fontDefinitions: { path: string; weight: number }[] }[] }; ios: { fonts: string[] } }];
    const paths = manifest.files.map((f) => `./assets/themes/magical-kingdom/fonts/${f.file}`);
    expect(plugin[1].android.fonts).toEqual([{ fontFamily: READING_FAMILY, fontDefinitions: manifest.files.map((f, i) => ({ path: paths[i], weight: f.weight })) }]);
    expect(plugin[1].ios.fonts).toEqual(paths);
    for (const p of paths) expect(fs.existsSync(path.join(ROOT, p))).toBe(true);
    // The browser build loads the same two files; the native build loads none at runtime (they would ship twice).
    const web = fs.readFileSync(path.join(__dirname, 'readingFont.web.ts'), 'utf8');
    expect([...web.matchAll(/require\('\.\.\/\.\.\/\.\.\/\.\.\/assets\/themes\/magical-kingdom\/fonts\/([A-Za-z-]+\.ttf)'\)/g)].map((m) => m[1])).toEqual(manifest.files.map((f) => f.file));
    expect(fs.readFileSync(path.join(__dirname, 'readingFont.ts'), 'utf8')).not.toMatch(/require\(/);
    expect(NO_READING_FONT).toEqual({ regular: {}, bold: {} });
  });
});
