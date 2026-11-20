// The kingdom's effects are the files their manifest records: two CC0 packs with their licence texts, 16 bit
// mono 44.1 kHz WAV, peaks at or under -3 dBFS, each quieter than speech, and not yet heard by a person.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import manifest from '../../../../assets/themes/magical-kingdom/audio/effects-v1/manifest.json';

const DIR = path.join(__dirname, '../../../../assets/themes/magical-kingdom/audio/effects-v1');
const sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, file))).digest('hex');
const db = (v: number) => Math.round(20 * Math.log10(v) * 10) / 10;

/** Reads a PCM WAV: its format and its samples as fractions of full scale. */
function wav(file: string) {
  const b = fs.readFileSync(path.join(DIR, file));
  expect(b.toString('ascii', 0, 4) + b.toString('ascii', 8, 12)).toBe('RIFFWAVE');
  let format = { encoding: 0, channels: 0, sampleRate: 0, bits: 0 };
  let samples: number[] = [];
  for (let at = 12; at + 8 <= b.length; ) {
    const id = b.toString('ascii', at, at + 4), size = b.readUInt32LE(at + 4);
    if (id === 'fmt ') format = { encoding: b.readUInt16LE(at + 8), channels: b.readUInt16LE(at + 10), sampleRate: b.readUInt32LE(at + 12), bits: b.readUInt16LE(at + 22) };
    if (id === 'data') samples = Array.from({ length: size / 2 }, (_, i) => b.readInt16LE(at + 8 + i * 2) / 32768);
    at += 8 + size + (size & 1);
  }
  return { format, samples, bytes: b.length };
}

describe('Magical Kingdom effects', () => {
  it('ships two CC0 packs with their licence texts', () => {
    for (const pack of Object.values(manifest.packs)) {
      expect(pack.licence).toBe('CC0-1.0');
      const text = fs.readFileSync(path.join(DIR, pack.licenceFile), 'utf8');
      expect(text).toContain('creativecommons.org/publicdomain/zero/1.0');
      expect(text).toContain('Kenney');
      expect(sha256(pack.licenceFile)).toBe(pack.licenceSha256);
    }
  });

  it('each effect is the recorded file, in the recorded format, quieter than speech', () => {
    expect(manifest.effects.map((e) => e.slot).sort()).toEqual(['effect:gift', 'effect:place', 'effect:remove', 'effect:retry', 'effect:success']);
    for (const e of manifest.effects) {
      const { format, samples, bytes } = wav(e.file);
      expect(bytes).toBe(e.bytes);
      expect(sha256(e.file)).toBe(e.sha256);
      expect(format).toEqual({ encoding: 1, channels: 1, sampleRate: 44100, bits: 16 });
      expect(Object.keys(manifest.packs)).toContain(e.pack);
      const peak = db(samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0));
      const rms = db(Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length));
      expect(peak).toBe(e.peakDb);
      expect(rms).toBe(e.rmsDb);
      expect(samples.length / format.sampleRate).toBeCloseTo(e.durationSeconds, 2);
      // No sudden loud audio: well under full scale, and under the quietest recorded speech clip.
      expect(peak).toBeLessThanOrEqual(-3);
      expect(rms).toBeLessThan(manifest.speech.quietestMeanDb);
      // A fade at each end: the file neither starts nor stops on a loud sample.
      expect(Math.abs(samples[0]!)).toBeLessThan(0.01);
      expect(Math.abs(samples[samples.length - 1]!)).toBeLessThan(0.01);
      // Short: an effect, not music.
      expect(e.durationSeconds).toBeLessThan(1.2);
    }
    // Nothing else sits in the folder unrecorded.
    expect(fs.readdirSync(DIR).sort()).toEqual(['manifest.json', ...Object.values(manifest.packs).map((p) => p.licenceFile), ...manifest.effects.map((e) => e.file)].sort());
  });

  it('the app plays exactly these files, and says nobody has heard them yet', () => {
    const source = fs.readFileSync(path.join(__dirname, 'effects.ts'), 'utf8');
    const wired = [...source.matchAll(/'(effect:[a-z]+)': require\('\.\.\/\.\.\/\.\.\/\.\.\/assets\/themes\/magical-kingdom\/audio\/effects-v1\/([a-z]+\.wav)'\)/g)].map((m) => `${m[1]}=${m[2]}`);
    expect(wired.sort()).toEqual(manifest.effects.map((e) => `${e.slot}=${e.file}`).sort());
    expect(source.match(/require\(/g)).toHaveLength(manifest.effects.length);
    expect(manifest.heard).toBe(false);
  });
});
