/// <reference types="node" />
// Narration for the mini-games (M9): the registry and the host contract, without an audio device.
// The playback itself (one voice at a time, mute, the browser gate) is tested against a fake
// expo-audio in audioEngine.test.tsx.
import fs from 'node:fs';
import path from 'node:path';

import manifestJson from '../../../../assets/themes/elevator-quest/audio/manifest.json';
import wordGolf from '../../../../content/themes/elevator-quest/minigames/wordGolf.json';
import type { Narration as HostNarration } from '../minigames/hostSound';
import { createNarration, wordNarrationKey } from './narration';
import { approvedNarrationKeys, narrationAsset, type AudioManifest, type AudioManifestFile } from './packs';

/** The full manifest (formats, loudness, prompts, rights); game code reads only the slim runtime.json. */
const AUDIO_MANIFEST = manifestJson as unknown as AudioManifestFile;

const DIR = path.join(__dirname, '../../../../assets/themes/elevator-quest/audio');
const PACK = 'elevenlabs-narration-v1';
const KEPT_WITH_NOTE = ['nar-w12'];

/** A fake engine: plays one recording at a time, like audioEngine.ts, and records what happened. */
function fakeEngine(bundled: (key: string) => boolean = (key) => narrationAsset(key) !== null) {
  const log: string[] = [];
  let playing: string | null = null;
  return {
    log,
    playing: () => playing,
    canSay: (key: string) => bundled(key),
    say(key: string) {
      if (playing) log.push(`stop:${playing}`);
      playing = key;
      log.push(`say:${key}`);
      return true;
    },
    hush() {
      if (playing) log.push(`stop:${playing}`);
      playing = null;
    },
  };
}

const withPackStatus = (status: 'approved' | 'pending' | 'rejected'): AudioManifest => ({ ...AUDIO_MANIFEST, packs: { ...AUDIO_MANIFEST.packs, [PACK]: { ...AUDIO_MANIFEST.packs[PACK]!, status } } });

describe('narration registry', () => {
  const words = Object.keys((wordGolf as { words: Record<string, unknown> }).words).sort();

  it('every Word Golf word has exactly one approved recording, keyed word.<wordId>; no retired word is registered', () => {
    expect(words.length).toBeGreaterThan(0);
    expect(approvedNarrationKeys()).toEqual(words.map(wordNarrationKey).sort());
    expect(narrationAsset('word.w38')).toBeNull();
    const keys = Object.values(AUDIO_MANIFEST.assets).flatMap((a) => (a.narrationKey ? [a.narrationKey] : []));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every recording is a small mono MP3 in the narration pack, says the word first and last, and was checked by transcription', () => {
    const pack = AUDIO_MANIFEST.packs[PACK]!;
    expect(pack.format).toMatchObject({ container: 'mp3', channels: 1, sampleRate: 44100 });
    for (const [id, a] of Object.entries(AUDIO_MANIFEST.assets).filter(([, x]) => x.narrationKey)) {
      expect({ id, pack: a.pack, loop: a.loop }).toEqual({ id, pack: PACK, loop: false });
      const bytes = fs.readFileSync(path.join(DIR, a.file));
      // An MPEG audio frame sync (no ID3 tag is written), and a size that fits 64 kbps for its length.
      expect({ id, sync: bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 }).toEqual({ id, sync: true });
      expect(bytes.length).toBeLessThanOrEqual(Math.ceil((64_000 / 8) * (a.durationMs / 1000) * 1.1) + 2048);
      expect(a.durationMs).toBeLessThanOrEqual(8000);
      // The word, a sentence, the word: the first and last words are the same.
      const said = a.text!.replace(/[.!?]/g, '').split(/\s+/);
      expect({ id, same: said[0]!.toLowerCase() === said[said.length - 1]!.toLowerCase() }).toEqual({ id, same: true });
      const v = (a as unknown as { verification: { matches: boolean; transcript: string; note?: string } }).verification;
      // One take is kept although the transcript is not word for word: its record says why (w12: the
      // transcriber heard a 20 ms "A" touching the last "ship"; the word is heard all three times).
      if (KEPT_WITH_NOTE.includes(id)) expect(v.note ?? '').toMatch(/heard all three times/);
      else expect({ id, matches: v.matches }).toEqual({ id, matches: true });
      expect(a.loudness!.truePeakDb).toBeLessThanOrEqual(-3);
    }
  });

  it('the pack record says on what grounds it is approved, and that nobody has listened', () => {
    const pack = AUDIO_MANIFEST.packs[PACK] as unknown as Record<string, unknown>;
    expect(pack.status).toBe('approved');
    expect(String(pack.rights)).toMatch(/D163/);
    expect(String(pack.approvedBy)).toMatch(/project owner/);
    expect(pack.humanReviewed).toBe(false);
    expect(String(pack.reviewNote)).toMatch(/Nobody has listened/);
  });
});

describe('narration (the mini-game host contract)', () => {
  it('is the host Narration contract', () => {
    const n: HostNarration = createNarration(fakeEngine());
    expect(typeof n.has).toBe('function');
  });

  it('has() is true only for a bundled, approved recording', () => {
    const n = createNarration(fakeEngine());
    expect(n.has('word.w01')).toBe(true);
    expect(n.has('word.w39')).toBe(true);
    expect(n.has('word.w38')).toBe(false); // retired
    expect(n.has('word.nope')).toBe(false);
    expect(n.has('arrivalChime')).toBe(false);
    // Approved in the manifest but not bundled (an engine that cannot play it): not had.
    expect(createNarration(fakeEngine(() => false)).has('word.w01')).toBe(false);
    // Bundled but the pack is pending or rejected: not had.
    expect(createNarration(fakeEngine(), withPackStatus('pending')).has('word.w01')).toBe(false);
    expect(createNarration(fakeEngine(), withPackStatus('rejected')).has('word.w01')).toBe(false);
  });

  it('say() plays the recording; a missing key is silent and throws nothing', () => {
    const e = fakeEngine();
    const n = createNarration(e);
    n.say('word.w05');
    expect(e.playing()).toBe('word.w05');
    expect(() => n.say('word.w38')).not.toThrow();
    expect(() => n.say('')).not.toThrow();
    expect(e.log).toEqual(['say:word.w05']);
  });

  it('a new say() stops the previous one: a replay never stacks', () => {
    const e = fakeEngine();
    const n = createNarration(e);
    n.say('word.w01');
    n.say('word.w01');
    n.say('word.w02');
    expect(e.log).toEqual(['say:word.w01', 'stop:word.w01', 'say:word.w01', 'stop:word.w01', 'say:word.w02']);
    expect(e.playing()).toBe('word.w02');
  });

  it('hush() stops it, and is harmless when nothing plays', () => {
    const e = fakeEngine();
    const n = createNarration(e);
    n.hush();
    n.say('word.w03');
    n.hush();
    expect(e.playing()).toBeNull();
    expect(e.log).toEqual(['say:word.w03', 'stop:word.w03']);
  });

  it('over an engine without narration (a test double) it says nothing and has nothing', () => {
    const n = createNarration({});
    expect(n.has('word.w01')).toBe(false);
    expect(() => {
      n.say('word.w01');
      n.hush();
    }).not.toThrow();
  });
});
