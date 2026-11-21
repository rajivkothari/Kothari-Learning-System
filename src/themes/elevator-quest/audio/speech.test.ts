// The tower's voices over a fake engine: a sequence plays in order and says when it is over; nothing
// is said that the build may not play; nothing is queued. (Playback itself: audioEngine.test.tsx.)
import type { SpeechEnd } from './audioEngine';
import { AUDIO_MANIFEST, type AudioManifest } from './packs';
import { VOICE_KEYS } from '../content/voice';
import { SEQUENCE_GAP_MS, createSpeech, voicePlayable } from './speech';

/** A manifest with the real packs plus a voice pack (status given) holding three test lines. */
const manifestWith = (status: 'approved' | 'pending' | 'rejected'): AudioManifest => ({
  packs: { ...AUDIO_MANIFEST.packs, 'voice-test': { status } },
  assets: {
    ...AUDIO_MANIFEST.assets,
    'v-arrive': { pack: 'voice-test', durationMs: 1200, narrationKey: 'voice.elevator.floor8' },
    'v-lifty': { pack: 'voice-test', durationMs: 2500, narrationKey: 'voice.lifty.intro' },
    'v-crew': { pack: 'voice-test', durationMs: 3000, narrationKey: 'voice.crew.coldOpen' },
  },
});

/** Timers on a fake clock. */
function fakeTime() {
  let now = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let id = 0;
  return {
    schedule(fn: () => void, ms: number) {
      const t = { at: now + ms, fn, id: ++id };
      timers.push(t);
      return { cancel: () => void (timers = timers.filter((x) => x !== t)) };
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const t = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!t) break;
        timers = timers.filter((x) => x !== t);
        now = t.at;
        t.fn();
      }
      now = end;
    },
  };
}

/** An engine that "plays" each key for its manifest length on the fake clock, one at a time. */
function fakeEngine(time: ReturnType<typeof fakeTime>, manifest: AudioManifest, opts: { muted?: boolean; bundled?: (k: string) => boolean } = {}) {
  const log: string[] = [];
  let playing: { key: string; onEnd?: (r: SpeechEnd) => void; timer: { cancel(): void } } | null = null;
  const stop = () => {
    const p = playing;
    playing = null;
    if (!p) return;
    p.timer.cancel();
    log.push(`stop:${p.key}`);
    p.onEnd?.('stopped');
  };
  return {
    log,
    canSay: (k: string) => (opts.bundled ? opts.bundled(k) : Object.values(manifest.assets).some((a) => a.narrationKey === k)),
    say(key: string, onEnd?: (r: SpeechEnd) => void) {
      stop();
      if (opts.muted) return false;
      const ms = Object.values(manifest.assets).find((a) => a.narrationKey === key)?.durationMs ?? 500;
      log.push(`say:${key}`);
      const me = {
        key,
        timer: time.schedule(() => {
          if (playing !== me) return;
          playing = null;
          log.push(`end:${key}`);
          me.onEnd?.('ended');
        }, ms),
        ...(onEnd ? { onEnd } : {}),
      };
      playing = me;
      return true;
    },
    hush: stop,
  };
}

const KEYS = ['voice.elevator.floor8', 'voice.lifty.intro'];

describe('speech: sequences', () => {
  it('plays the announcer, then Lifty, in order with a short gap, and reports the end once', () => {
    const time = fakeTime();
    const m = manifestWith('approved');
    const e = fakeEngine(time, m);
    const s = createSpeech(e, { schedule: time.schedule, enabled: () => true, review: false, manifest: m });
    const ended = jest.fn();
    expect(s.speak(KEYS, ended)).toBe(true);
    expect(s.speaking()).toBe(true);
    expect(s.current()).toEqual(KEYS);
    time.advance(1200);
    expect(e.log).toEqual(['say:voice.elevator.floor8', 'end:voice.elevator.floor8']);
    time.advance(SEQUENCE_GAP_MS);
    expect(e.log.at(-1)).toBe('say:voice.lifty.intro');
    expect(ended).not.toHaveBeenCalled();
    time.advance(2500);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(s.speaking()).toBe(false);
    time.advance(10_000);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('skips a line with no recording and plays the rest; with nothing to play it does not start and never reports', () => {
    const time = fakeTime();
    const m = manifestWith('approved');
    const e = fakeEngine(time, m);
    const s = createSpeech(e, { schedule: time.schedule, enabled: () => true, review: false, manifest: m });
    const ended = jest.fn();
    expect(s.speak(['voice.crew.notRecorded', 'voice.lifty.intro'], ended)).toBe(true);
    expect(e.log).toEqual(['say:voice.lifty.intro']);
    time.advance(2500);
    expect(ended).toHaveBeenCalledTimes(1);
    const never = jest.fn();
    expect(s.speak(['voice.crew.notRecorded', 'word.nope'], never)).toBe(false);
    time.advance(60_000);
    expect(never).not.toHaveBeenCalled();
  });

  it('a new sequence stops the old one, which reports its end at once; hush() stops it and reports once', () => {
    const time = fakeTime();
    const m = manifestWith('approved');
    const e = fakeEngine(time, m);
    const s = createSpeech(e, { schedule: time.schedule, enabled: () => true, review: false, manifest: m });
    const first = jest.fn();
    const second = jest.fn();
    s.speak(KEYS, first);
    time.advance(300);
    s.speak(['voice.crew.coldOpen'], second);
    expect(first).toHaveBeenCalledTimes(1);
    expect(e.log).toEqual(['say:voice.elevator.floor8', 'stop:voice.elevator.floor8', 'say:voice.crew.coldOpen']);
    s.hush();
    expect(second).toHaveBeenCalledTimes(1);
    expect(s.speaking()).toBe(false);
    time.advance(10_000);
    // Nothing of either sequence comes back later: nothing is queued.
    expect(e.log.filter((l) => l.startsWith('say:'))).toHaveLength(2);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(() => s.hush()).not.toThrow();
  });

  it('hushed in the gap between two lines, the second never starts', () => {
    const time = fakeTime();
    const m = manifestWith('approved');
    const e = fakeEngine(time, m);
    const s = createSpeech(e, { schedule: time.schedule, enabled: () => true, review: false, manifest: m });
    const ended = jest.fn();
    s.speak(KEYS, ended);
    time.advance(1200 + SEQUENCE_GAP_MS / 2);
    s.hush();
    time.advance(10_000);
    expect(e.log).toEqual(['say:voice.elevator.floor8', 'end:voice.elevator.floor8']);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('says nothing with the narration switch off, or when the engine cannot speak (muted, or before a browser allows sound)', () => {
    const time = fakeTime();
    const m = manifestWith('approved');
    let on = false;
    const s = createSpeech(fakeEngine(time, m), { schedule: time.schedule, enabled: () => on, review: false, manifest: m });
    expect(s.speak(KEYS)).toBe(false);
    on = true;
    expect(s.speak(KEYS)).toBe(true);
    const muted = createSpeech(fakeEngine(time, m, { muted: true }), { schedule: time.schedule, enabled: () => true, review: false, manifest: m });
    const ended = jest.fn();
    expect(muted.speak(KEYS, ended)).toBe(false);
    expect(muted.speaking()).toBe(false);
    time.advance(10_000);
    expect(ended).not.toHaveBeenCalled();
  });
});

describe('speech: how long a sequence is (what a story beat waits for)', () => {
  it('the measured lengths of the lines that would play, plus the gaps; no line counted longer than the cap; null when nothing would play', () => {
    const time = fakeTime();
    const m = manifestWith('approved');
    let on = true;
    const s = createSpeech(fakeEngine(time, m), { schedule: time.schedule, enabled: () => on, review: false, manifest: m });
    expect(s.sequenceMs!(KEYS, 9000)).toBe(1200 + SEQUENCE_GAP_MS + 2500);
    expect(s.sequenceMs!(['voice.lifty.intro', 'voice.crew.coldOpen', 'voice.elevator.floor8'], 9000)).toBe(2500 + 3000 + 1200 + 2 * SEQUENCE_GAP_MS);
    // A line with no recording takes no time (it is skipped); a line longer than the cap counts as the cap.
    expect(s.sequenceMs!(['voice.crew.notRecorded', 'voice.lifty.intro'], 9000)).toBe(2500);
    expect(s.sequenceMs!(KEYS, 2000)).toBe(1200 + SEQUENCE_GAP_MS + 2000);
    expect(s.sequenceMs!(['voice.crew.notRecorded'], 9000)).toBeNull();
    expect(s.sequenceMs!([], 9000)).toBeNull();
    // Nothing would be said with the Voices switch off, or from a pack this build may not play.
    on = false;
    expect(s.sequenceMs!(KEYS, 9000)).toBeNull();
    const pending = manifestWith('pending');
    expect(createSpeech(fakeEngine(time, pending), { schedule: time.schedule, enabled: () => true, review: false, manifest: pending }).sequenceMs!(KEYS, 9000)).toBeNull();
  });
});

describe('speech: which builds may play a pack', () => {
  it('an approved pack plays everywhere; a pending one only in the browser review build; a rejected one nowhere', () => {
    expect(voicePlayable('voice.lifty.intro', false, manifestWith('approved'))).toBe(true);
    expect(voicePlayable('voice.lifty.intro', false, manifestWith('pending'))).toBe(false);
    expect(voicePlayable('voice.lifty.intro', true, manifestWith('pending'))).toBe(true);
    expect(voicePlayable('voice.lifty.intro', true, manifestWith('rejected'))).toBe(false);
    expect(voicePlayable('voice.lifty.unknown', true, manifestWith('approved'))).toBe(false);
  });

  it('a pending pack is silent in a production build even when its file is bundled', () => {
    const time = fakeTime();
    const m = manifestWith('pending');
    const prod = createSpeech(fakeEngine(time, m), { schedule: time.schedule, enabled: () => true, review: false, manifest: m });
    expect(prod.speak(KEYS)).toBe(false);
    const review = createSpeech(fakeEngine(time, m), { schedule: time.schedule, enabled: () => true, review: true, manifest: m });
    expect(review.speak(KEYS)).toBe(true);
  });

  it('a recording in the manifest but not in the build is silent', () => {
    const time = fakeTime();
    const m = manifestWith('approved');
    const s = createSpeech(fakeEngine(time, m, { bundled: () => false }), { schedule: time.schedule, enabled: () => true, review: true, manifest: m });
    expect(s.speak(KEYS)).toBe(false);
  });
});

describe('speech: the real manifest today (the voice pack is pending with no recordings)', () => {
  it('no line of the script can play, in a production build or in the browser review build, even over an engine that could say anything', () => {
    const time = fakeTime();
    const anything = { say: () => true, hush: () => {}, canSay: () => true };
    for (const review of [false, true]) {
      const s = createSpeech(anything, { schedule: time.schedule, enabled: () => true, review });
      for (const key of VOICE_KEYS) expect({ key, played: s.speak([key]) }).toEqual({ key, played: false });
      expect(s.speak(VOICE_KEYS)).toBe(false);
      expect(s.speaking()).toBe(false);
    }
  });
});
