/// <reference types="node" />
// The sound files themselves: every file in the audio folder is decoded and checked against its
// manifest entry (format, length, level, clean edges), and the pack rules (rights status, which set
// plays where, how approval works) are checked without any audio device. The narration pack (M9) is
// MP3: its frames are walked here, its words are checked in narration.test.ts.
import fs from 'node:fs';
import path from 'node:path';

import { AUDIO_MANIFEST, PRODUCTION_PROFILE, approvedSlotsOnly, assetsWithStatus, packStatus, productionProfile, profileForParam, reviewProfile, type AudioManifest } from './packs';
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

interface Mp3 {
  version: 'MPEG1';
  layer: 3;
  channels: number;
  sampleRate: number;
  bitrate: number;
  frames: number;
}

/**
 * Minimal MP3 frame walker: MPEG-1 Layer III only (anything else fails the format test). Every frame
 * must have the same header settings; the first frame is the encoder's Info frame (no audio).
 */
function readMp3(file: string): Mp3 {
  const b = fs.readFileSync(file);
  const RATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const SAMPLE_RATES = [44100, 48000, 32000];
  let at = 0;
  let first: Omit<Mp3, 'frames'> | null = null;
  let frames = 0;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff || (b[at + 1]! & 0xe0) !== 0xe0) throw new Error(`${file}: lost frame sync at byte ${at}`);
    const versionBits = (b[at + 1]! >> 3) & 3;
    const layerBits = (b[at + 1]! >> 1) & 3;
    if (versionBits !== 3 || layerBits !== 1) throw new Error(`${file}: not MPEG-1 Layer III at byte ${at}`);
    const bitrate = RATES[b[at + 2]! >> 4]! * 1000;
    const sampleRate = SAMPLE_RATES[(b[at + 2]! >> 2) & 3]!;
    const padding = (b[at + 2]! >> 1) & 1;
    const channels = b[at + 3]! >> 6 === 3 ? 1 : 2;
    const header = { version: 'MPEG1' as const, layer: 3 as const, channels, sampleRate, bitrate };
    if (!first) first = header;
    else if (JSON.stringify(first) !== JSON.stringify(header)) throw new Error(`${file}: frame ${frames} changes format`);
    at += Math.floor((144 * bitrate) / sampleRate) + padding;
    frames += 1;
  }
  if (!first || at !== b.length) throw new Error(`${file}: trailing bytes after the last frame`);
  return { ...first, frames };
}

const peakDb = (x: Float64Array) => 20 * Math.log10(x.reduce((m, v) => Math.max(m, Math.abs(v)), 1e-9));
const allFiles = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? allFiles(path.join(dir, d.name)).map((f) => `${d.name}/${f}`) : /\.(wav|mp3)$/.test(d.name) ? [d.name] : []));

describe('sound files', () => {
  const entries = Object.entries(AUDIO_MANIFEST.assets);

  it('every sound file in the folder belongs to a manifest entry, and every entry has its file', () => {
    expect(allFiles(DIR).sort()).toEqual(entries.map(([, a]) => a.file).sort());
  });

  const wavs = entries.filter(([, a]) => a.file.endsWith('.wav'));
  const mp3s = entries.filter(([, a]) => a.file.endsWith('.mp3'));

  it('every file has the container its pack says', () => {
    for (const [id, a] of entries) expect({ id, ext: path.extname(a.file).slice(1) }).toEqual({ id, ext: AUDIO_MANIFEST.packs[a.pack]!.format.container });
  });

  it.each(mp3s)('%s is an MP3 of its pack format, with the length the manifest gives', (_id, a) => {
    const m = readMp3(path.join(DIR, a.file));
    const f = AUDIO_MANIFEST.packs[a.pack]!.format as { channels: number; sampleRate: number; bitrate?: number };
    expect({ channels: m.channels, sampleRate: m.sampleRate, bitrate: m.bitrate }).toEqual({ channels: f.channels, sampleRate: f.sampleRate, bitrate: f.bitrate });
    // Audio frames (all but the Info frame) cover the decoded length plus the encoder's delay and padding (under two frames).
    const coded = ((m.frames - 1) * 1152 * 1000) / m.sampleRate;
    expect(coded).toBeGreaterThanOrEqual(a.durationMs);
    expect(coded - a.durationMs).toBeLessThan((2 * 1152 * 1000) / m.sampleRate);
  });

  it.each(wavs)('%s decodes as its pack format, with the length the manifest gives', (_id, a) => {
    const w = readWav(path.join(DIR, a.file));
    const f = AUDIO_MANIFEST.packs[a.pack]!.format;
    expect({ format: w.format, channels: w.channels, sampleRate: w.sampleRate, bits: w.bits }).toEqual({ format: 1, channels: f.channels, sampleRate: f.sampleRate, bits: 16 });
    expect(Math.abs((w.samples.length / w.sampleRate) * 1000 - a.durationMs)).toBeLessThanOrEqual(2);
  });

  const generatedPacks = [ELEVENLABS_V1.pack, ...(ELEVENLABS_V1.extraPacks ?? [])];
  const generated = entries.filter(([, a]) => generatedPacks.includes(a.pack));

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
  const withPack = (pack: string, status: 'approved' | 'pending' | 'rejected'): AudioManifest => ({ ...AUDIO_MANIFEST, packs: { ...AUDIO_MANIFEST.packs, [pack]: { ...AUDIO_MANIFEST.packs[pack]!, status } } });
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

  it('the mini-game pack (elevenlabs-v2, M9) is approved under the same terms, with every take recorded', () => {
    expect(packStatus('elevenlabs-v2')).toBe('approved');
    expect(ELEVENLABS_V1.extraPacks).toEqual(['elevenlabs-v2']);
    const pack = AUDIO_MANIFEST.packs['elevenlabs-v2'] as unknown as Record<string, unknown>;
    expect(String(pack.rights)).toMatch(/D163/);
    expect(String(pack.rights)).toMatch(/elevenlabs\.io\/sound-effects\/commercial/);
    expect(String(pack.approvedBy)).toMatch(/project owner/);
    expect(pack.humanReviewed).toBe(false);
    expect(String(pack.reviewNote)).toMatch(/Nobody has listened/);
    for (const [id, a] of Object.entries(AUDIO_MANIFEST.assets).filter(([, x]) => x.pack === 'elevenlabs-v2')) {
      const e = a as unknown as { generation: { prompt: string; generationId: string }[]; processing: string[] };
      expect({ id, takes: e.generation.length > 0, prompts: e.generation.every((g) => g.prompt.length > 10 && g.generationId.length > 10), processing: e.processing.length > 0 }).toEqual({ id, takes: true, prompts: true, processing: true });
    }
  });

  it('a mini-game pack that is not approved leaves only its own slots silent in production', () => {
    for (const status of ['pending', 'rejected'] as const) {
      const p = productionProfile(withPack('elevenlabs-v2', status));
      for (const slot of SOUND_SLOTS) {
        const pack = ELEVENLABS_V1.slots[slot] ? AUDIO_MANIFEST.assets[ELEVENLABS_V1.slots[slot]!.asset]!.pack : null;
        expect({ slot, status, plays: p.slots[slot] }).toEqual({ slot, status, plays: pack === 'elevenlabs-v2' ? null : ELEVENLABS_V1.slots[slot] });
      }
    }
    // All approved: the same profile object, untouched.
    expect(approvedSlotsOnly(ELEVENLABS_V1)).toBe(ELEVENLABS_V1);
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

  it('the placeholder set gives the mini-games quiet clicks and no loops (M9)', () => {
    for (const slot of ['golfRoll', 'freightMove'] as const) expect(PROTOTYPE_MODERN.slots[slot]).toBeNull();
    for (const slot of ['golfHit', 'tilePlace', 'tileUndo', 'cratePick', 'cratePlace', 'gaugeTick'] as const) expect(PROTOTYPE_MODERN.slots[slot]!.asset).toBe('button-click');
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

  it('feedback and landing things are one-shots with a rate limit; only the three beds and the two mini-game motions loop', () => {
    expect(SOUND_SLOTS.filter((s) => SLOT_SPECS[s].loop)).toEqual(['doorMotor', 'travelLoop', 'ambientMachinery', 'golfRoll', 'freightMove']);
    for (const slot of SOUND_SLOTS) if (!SLOT_SPECS[slot].loop) expect({ slot, gap: SLOT_SPECS[slot].gapMs >= 90 }).toEqual({ slot, gap: true });
    // A wrong answer is never louder or more insistent than a right one.
    expect(SLOT_SPECS.answerWrong.gapMs).toBeGreaterThanOrEqual(SLOT_SPECS.answerRight.gapMs);
    expect(ELEVENLABS_V1.slots.answerWrong!.gain).toBeLessThanOrEqual(ELEVENLABS_V1.slots.answerRight!.gain);
  });
});

describe('the M9 slot contract', () => {
  it('names every slot the mini-games play (Word Golf and Cargo Commander), each with its own generated sound', () => {
    const contract = ['golfHit', 'golfRoll', 'golfCup', 'holeComplete', 'tilePlace', 'tileUndo', 'cratePick', 'cratePlace', 'gaugeTick', 'freightMove', 'deliveryComplete'] as const;
    for (const slot of contract) {
      expect((SOUND_SLOTS as readonly string[]).includes(slot)).toBe(true);
      const s = ELEVENLABS_V1.slots[slot]!;
      expect({ slot, pack: AUDIO_MANIFEST.assets[s.asset]!.pack }).toEqual({ slot, pack: 'elevenlabs-v2' });
      // No mini-game sound is essential: every one has a picture.
      expect({ slot, essential: SLOT_SPECS[slot].essential }).toEqual({ slot, essential: false });
    }
    // Eleven slots, eleven different files.
    expect(new Set(contract.map((slot) => ELEVENLABS_V1.slots[slot]!.asset)).size).toBe(contract.length);
    // Taking a tile back is never louder than placing it.
    expect(ELEVENLABS_V1.slots.tileUndo!.gain).toBeLessThanOrEqual(ELEVENLABS_V1.slots.tilePlace!.gain);
  });
});
