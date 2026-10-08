/// <reference types="node" />
// The sound files themselves: every file in the audio folder is decoded and checked against its
// manifest entry (format, length, level, clean edges), and the pack rules (rights status, which set
// plays where, how approval works) are checked without any audio device.
import fs from 'node:fs';
import path from 'node:path';

import { AUDIO_MANIFEST, PRODUCTION_PROFILE, assetsWithStatus, packStatus, productionProfile, profileForParam, reviewProfile, type AudioManifest } from './packs';
import { ELEVENLABS_V1, PROTOTYPE_MODERN, SLOT_SPECS, SOUND_SLOTS, type SoundSlot } from './profile';

const DIR = path.join(__dirname, '../../../../assets/themes/elevator-quest/audio');

interface Wav {
  format: number;
  channels: number;
  sampleRate: number;
  bits: number;
  samples: Float64Array;
}

/** Minimal RIFF/WAVE reader: PCM 16-bit only (anything else fails the format test). */
function readWav(file: string): Wav {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${file}: not RIFF/WAVE`);
  let at = 12;
  let fmt: Omit<Wav, 'samples'> | null = null;
  let samples: Float64Array | null = null;
  while (at + 8 <= b.length) {
    const id = b.toString('ascii', at, at + 4);
    const size = b.readUInt32LE(at + 4);
    const body = at + 8;
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(body), channels: b.readUInt16LE(body + 2), sampleRate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    if (id === 'data') {
      const n = Math.floor(size / 2);
      samples = new Float64Array(n);
      for (let i = 0; i < n; i++) samples[i] = b.readInt16LE(body + i * 2) / 32768;
    }
    at = body + size + (size % 2);
  }
  if (!fmt || !samples) throw new Error(`${file}: missing fmt or data chunk`);
  return { ...fmt, samples };
}

const peakDb = (x: Float64Array) => 20 * Math.log10(x.reduce((m, v) => Math.max(m, Math.abs(v)), 1e-9));
const allFiles = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? allFiles(path.join(dir, d.name)).map((f) => `${d.name}/${f}`) : d.name.endsWith('.wav') ? [d.name] : []));

describe('sound files', () => {
  const entries = Object.entries(AUDIO_MANIFEST.assets);

  it('every WAV in the folder belongs to a manifest entry, and every entry has its file', () => {
    expect(allFiles(DIR).sort()).toEqual(entries.map(([, a]) => a.file).sort());
  });

  it.each(entries)('%s decodes as its pack format, with the length the manifest gives', (_id, a) => {
    const w = readWav(path.join(DIR, a.file));
    const f = AUDIO_MANIFEST.packs[a.pack]!.format;
    expect({ format: w.format, channels: w.channels, sampleRate: w.sampleRate, bits: w.bits }).toEqual({ format: 1, channels: f.channels, sampleRate: f.sampleRate, bits: 16 });
    expect(Math.abs((w.samples.length / w.sampleRate) * 1000 - a.durationMs)).toBeLessThanOrEqual(2);
  });

  const generated = entries.filter(([, a]) => a.pack === ELEVENLABS_V1.pack);

  it.each(generated)('%s is level-safe and starts and ends cleanly', (_id, a) => {
    const x = readWav(path.join(DIR, a.file)).samples;
    // Sample peak never passes -3 dBFS (the recorded true peak is the stricter check, below).
    expect(peakDb(x)).toBeLessThanOrEqual(-3);
    expect(a.loudness).toBeDefined();
    expect(a.loudness!.truePeakDb).toBeLessThanOrEqual(-3);
    if (a.loop) {
      // A loop wraps without a step: the jump from the last sample to the first is small.
      expect(Math.abs(x[0]! - x[x.length - 1]!)).toBeLessThan(0.02);
    } else {
      // A one-shot fades in and out: no click at either edge.
      expect(Math.abs(x[0]!)).toBeLessThan(0.01);
      expect(Math.abs(x[x.length - 1]!)).toBeLessThan(0.01);
      expect(a.durationMs).toBeLessThanOrEqual(2500);
    }
  });

  it('no surprise loud sound: with its profile gain, every generated slot stays under -20 LUFS, frequent clicks and loops well under', () => {
    const loudest: Partial<Record<SoundSlot, number>> = {};
    for (const slot of SOUND_SLOTS) {
      const s = ELEVENLABS_V1.slots[slot];
      if (!s) continue;
      const lufs = AUDIO_MANIFEST.assets[s.asset]!.loudness!.lufs + 20 * Math.log10(s.gain);
      loudest[slot] = Math.round(lufs * 10) / 10;
      expect({ slot, under: lufs <= -20 }).toEqual({ slot, under: true });
      if (SLOT_SPECS[slot].loop) expect({ slot, under: lufs <= -28 }).toEqual({ slot, under: true });
    }
    for (const click of ['floorButtonPress', 'doorButtonPress', 'floorButtonActivate'] as const) expect({ click, under: loudest[click]! <= -28 }).toEqual({ click, under: true });
    // The ambient bed sits far below everything else.
    expect(loudest.ambientMachinery!).toBeLessThanOrEqual(-38);
  });

  it('the golf putt is one composite on the game clock: tap at 0, roll to 1300 ms, cup drop from 1300 ms', () => {
    const a = AUDIO_MANIFEST.assets['el1-golf-putt'] as (typeof AUDIO_MANIFEST.assets)[string] & { marks: { tapMs: number; rollEndMs: number; dropMs: [number, number] } };
    expect(a.marks).toEqual({ tapMs: 0, rollEndMs: 1300, dropMs: [1300, 1550] });
    const w = readWav(path.join(DIR, a.file));
    const at = (ms: number) => Math.round((ms / 1000) * w.sampleRate);
    const peak = (from: number, to: number) => peakDb(w.samples.slice(at(from), at(to)));
    expect(peak(0, 30)).toBeGreaterThan(-6); // the tap
    expect(peak(1290, 1450)).toBeGreaterThan(-6); // the drop
    expect(peak(200, 1250)).toBeLessThan(peak(0, 30) - 3); // the roll is quieter than either
    expect(a.durationMs).toBeGreaterThanOrEqual(1550);
  });
});

describe('sound packs and rights', () => {
  const withStatus = (status: 'approved' | 'pending' | 'rejected'): AudioManifest => ({ ...AUDIO_MANIFEST, packs: { ...AUDIO_MANIFEST.packs, 'elevenlabs-v1': { ...AUDIO_MANIFEST.packs['elevenlabs-v1']!, status } } });

  it('the generated pack is approved, and its record says on what grounds (D163)', () => {
    expect(packStatus('elevenlabs-v1')).toBe('approved');
    const pack = AUDIO_MANIFEST.packs['elevenlabs-v1'] as unknown as Record<string, unknown>;
    expect(String(pack.rights)).toMatch(/paid subscription/);
    expect(String(pack.rights)).toMatch(/elevenlabs\.io\/sound-effects\/commercial/);
    expect(String(pack.approvedBy)).toMatch(/project owner/);
    for (const [id, a] of Object.entries(AUDIO_MANIFEST.assets).filter(([, x]) => x.pack === 'elevenlabs-v1')) {
      const e = a as unknown as { generation: { prompt: string; generationId: string }[]; processing: string[] };
      expect({ id, takes: e.generation.length > 0, prompts: e.generation.every((g) => g.prompt.length > 10 && g.generationId.length > 10), processing: e.processing.length > 0 }).toEqual({ id, takes: true, prompts: true, processing: true });
    }
  });

  it('production plays the approved pack; a pending or rejected pack falls back to the placeholders', () => {
    expect(PRODUCTION_PROFILE).toBe(ELEVENLABS_V1);
    expect(productionProfile(withStatus('pending'))).toBe(PROTOTYPE_MODERN);
    expect(productionProfile(withStatus('approved'))).toBe(ELEVENLABS_V1);
    expect(productionProfile(withStatus('rejected'))).toBe(PROTOTYPE_MODERN);
    // The require lists follow the same status (audio.test.ts holds the files to it).
    expect(assetsWithStatus('pending', withStatus('approved'))).toEqual([]);
    expect(assetsWithStatus('approved', withStatus('approved')).filter((id) => id.startsWith('el1-')).length).toBe(assetsWithStatus('pending', withStatus('pending')).length);
    expect(assetsWithStatus('pending')).toEqual([]);
  });

  it('the browser playtest build plays the newest pack that is not rejected, with a URL switch back to the placeholders', () => {
    expect(reviewProfile()).toBe(ELEVENLABS_V1);
    expect(profileForParam(undefined)).toBe(ELEVENLABS_V1);
    expect(profileForParam('placeholder')).toBe(PROTOTYPE_MODERN);
    expect(profileForParam('production')).toBe(ELEVENLABS_V1);
    expect(profileForParam('something-else')).toBe(ELEVENLABS_V1);
    // While a pack is pending, the browser plays it but `production` means the placeholders.
    expect(profileForParam(undefined, withStatus('pending'))).toBe(ELEVENLABS_V1);
    expect(profileForParam('production', withStatus('pending'))).toBe(PROTOTYPE_MODERN);
    // A rejected pack is played nowhere, not even in review.
    expect(reviewProfile(withStatus('rejected'))).toBe(PROTOTYPE_MODERN);
  });

  it('the placeholder set keeps the native build sounding as before M8.1 for the new slots', () => {
    for (const slot of ['answerRight', 'answerWrong', 'discovery'] as const) expect(PROTOTYPE_MODERN.slots[slot]).toBeNull();
    for (const slot of ['toolboxOpen', 'golfPutt', 'coreHum'] as const) expect(PROTOTYPE_MODERN.slots[slot]).toEqual(PROTOTYPE_MODERN.slots.landingReaction);
  });
});

describe('the M8.1 slot contract', () => {
  it('names every slot other owners play (landings.json and the director)', () => {
    const contract = ['toolboxOpen', 'toolboxClose', 'fanStart', 'gearTurn', 'springBoing', 'windmillTurn', 'radioStatic', 'craneLower', 'coreHum', 'drawerSlide', 'bookOpen', 'telescopeTurn', 'golfPutt', 'answerRight', 'answerWrong', 'discovery', 'landingReaction', 'floorButtonPress', 'doorMotor', 'doorClosed', 'doorOpened', 'motorStart', 'travelLoop', 'deceleration', 'arrivalStop', 'arrivalChime', 'completion'];
    for (const slot of contract) expect((SOUND_SLOTS as readonly string[]).includes(slot)).toBe(true);
  });

  it('feedback and landing things are one-shots with a rate limit; only the three beds loop', () => {
    expect(SOUND_SLOTS.filter((s) => SLOT_SPECS[s].loop)).toEqual(['doorMotor', 'travelLoop', 'ambientMachinery']);
    for (const slot of SOUND_SLOTS) if (!SLOT_SPECS[slot].loop) expect({ slot, gap: SLOT_SPECS[slot].gapMs >= 90 }).toEqual({ slot, gap: true });
    // A wrong answer is never louder or more insistent than a right one.
    expect(SLOT_SPECS.answerWrong.gapMs).toBeGreaterThanOrEqual(SLOT_SPECS.answerRight.gapMs);
    expect(ELEVENLABS_V1.slots.answerWrong!.gain).toBeLessThanOrEqual(ELEVENLABS_V1.slots.answerRight!.gain);
  });
});
