// The playback engine against a fake expo-audio: settings, the browser gate, the voice policy,
// and failures that must stay silent instead of reaching the game. (Runs in the app project.)
import manifestJson from '../../../../assets/themes/elevator-quest/audio/manifest.json';
import type { AudioCue } from './cues';
import { FOLLOW_GAP_MS, SPEECH_TAIL_MS, SPEECH_WAIT_MARGIN_MS } from '../director/director';
import { DEFAULT_AUDIO, DUCK_HOLD_MS, DUCK_RAMP_MS, gainFor, narrationGain } from './mix';
import { ELEVENLABS_V1, PROTOTYPE_MODERN, SOUND_SLOTS, type SoundSlot } from './profile';

interface FakePlayer {
  source: unknown;
  volume: number;
  loop: boolean;
  plays: number;
  pauses: number;
  /** Freed (remove() was called). */
  removed: boolean;
  /** Volume writes after remove(): a freed native player must never be touched. */
  writesAfterRemove: number;
  play: jest.Mock;
  pause: jest.Mock;
  seekTo: jest.Mock;
  remove: jest.Mock;
  addListener: jest.Mock;
  /** The player reports that its file has played to the end (expo-audio's playbackStatusUpdate, didJustFinish). */
  finish(): void;
  /** Status listeners still subscribed. */
  listeners: number;
}

/** A status listener (named for jest.mock's scope rule). */
type MockListener = (mockStatus: { didJustFinish: boolean }) => void;

const mockPlayers: FakePlayer[] = [];
let mockFailOn: (source: unknown) => 'create' | 'play' | null = () => null;
let mockGateOpen = true;
const mockGateListeners: (() => void)[] = [];
let clock = 0;

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => undefined),
  createAudioPlayer: jest.fn((source: unknown) => {
    if (mockFailOn(source) === 'create') throw new Error('decode failed');
    let volume = 1;
    const listeners = new Set<MockListener>();
    const p = {
      source,
      loop: false,
      plays: 0,
      pauses: 0,
      removed: false,
      writesAfterRemove: 0,
      play: jest.fn(() => {
        if (mockFailOn(source) === 'play') throw new Error('play failed');
        p.plays += 1;
      }),
      pause: jest.fn(() => (p.pauses += 1)),
      seekTo: jest.fn(async () => undefined),
      remove: jest.fn(() => {
        p.removed = true;
      }),
      addListener: jest.fn((_event: string, fn: MockListener) => {
        listeners.add(fn);
        return { remove: () => void listeners.delete(fn) };
      }),
      finish: () => {
        for (const fn of [...listeners]) fn({ didJustFinish: true });
      },
    } as unknown as FakePlayer;
    Object.defineProperty(p, 'volume', {
      get: () => volume,
      set: (v: number) => {
        if (p.removed) p.writesAfterRemove += 1;
        volume = v;
      },
    });
    Object.defineProperty(p, 'listeners', { get: () => listeners.size });
    mockPlayers.push(p);
    return p;
  }),
}));

jest.mock('./audioGate', () => ({
  createAudioGate: () => ({
    isOpen: () => mockGateOpen,
    onOpen: (l: () => void) => {
      if (mockGateOpen) l();
      else mockGateListeners.push(l);
      return () => undefined;
    },
  }),
}));

// jest-expo turns every required sound file into the same number; give each approved file its own.
jest.mock('./assets', () => {
  const m = require('../../../../assets/themes/elevator-quest/audio/manifest.json') as { packs: Record<string, { status: string }>; assets: Record<string, { pack: string }> };
  const ids = Object.keys(m.assets).filter((id) => m.packs[m.assets[id]!.pack]?.status === 'approved');
  return { AUDIO_ASSETS: Object.fromEntries(ids.map((id, i) => [id, 100 + i])) };
});

// eslint-disable-next-line import/first -- the mocks above must be registered before the engine loads
import { SPEECH_END_MARGIN_MS, SPEECH_FADE_MS, createAudioEngine } from './audioEngine';
// eslint-disable-next-line import/first
import { AUDIO_ASSETS } from './assets';
// eslint-disable-next-line import/first
import { SEQUENCE_GAP_MS, createSpeech } from './speech';

const play = (slot: SoundSlot): AudioCue => ({ at: clock, action: 'play', slot });
const sourceOf = (slot: SoundSlot) => AUDIO_ASSETS[PROTOTYPE_MODERN.slots[slot]!.asset];
const playsOf = (slot: SoundSlot) => mockPlayers.filter((p) => p.source === sourceOf(slot)).reduce((n, p) => n + p.plays, 0);
const engine = (settings = DEFAULT_AUDIO) => createAudioEngine(PROTOTYPE_MODERN, settings, () => clock);

beforeEach(() => {
  mockPlayers.length = 0;
  mockGateListeners.length = 0;
  mockFailOn = () => null;
  mockGateOpen = true;
  clock = 1000;
});

describe('audio engine (native set)', () => {
  it('plays the profile it is given from the approved files (the native production set)', async () => {
    const e = await engine();
    expect(e.status()).toMatchObject({ ready: true, profile: PROTOTYPE_MODERN.id, silent: [] });
    e.handle([play('arrivalChime')]);
    expect(playsOf('arrivalChime')).toBe(1);
    e.release();
  });

  it('a slot the profile has no sound for plays its fallback: the up and down chimes play the one chime; a tick and the hall bell stay silent', async () => {
    const e = await engine();
    e.handle([play('arrivalChimeUp')]);
    expect(playsOf('arrivalChime')).toBe(1);
    clock += 1000;
    e.handle([play('arrivalChimeDown')]);
    expect(playsOf('arrivalChime')).toBe(2);
    const before = mockPlayers.reduce((n, p) => n + p.plays, 0);
    clock += 1000;
    e.handle([play('floorTick'), play('hallCallBell')]);
    expect(mockPlayers.reduce((n, p) => n + p.plays, 0)).toBe(before);
    e.release();
  });

  it('mute plays nothing; quiet plays softer', async () => {
    const muted = await engine({ output: 'muted', effects: 1 });
    muted.handle([play('arrivalChime'), play('floorButtonPress')]);
    expect(mockPlayers.reduce((n, p) => n + p.plays, 0)).toBe(0);
    muted.release();
    mockPlayers.length = 0;
    const quiet = await engine({ output: 'quiet', effects: 1 });
    quiet.handle([play('doorClosed')]);
    const p = mockPlayers.find((x) => x.source === sourceOf('doorClosed') && x.plays > 0)!;
    expect(p.volume).toBeLessThan(PROTOTYPE_MODERN.slots.doorClosed!.gain);
    quiet.release();
  });

  it('rapid taps do not pile up: twenty presses in 200 ms start at most three clicks', async () => {
    const e = await engine();
    for (let i = 0; i < 20; i++) {
      clock += 10;
      e.handle([play('floorButtonPress')]);
    }
    expect(playsOf('floorButtonPress')).toBeLessThanOrEqual(3);
    expect(e.status().dropped).toBeGreaterThanOrEqual(17);
    e.release();
  });

  it('a pile of landing sounds at once is capped', async () => {
    const e = await engine();
    const things: SoundSlot[] = ['toolboxOpen', 'fanStart', 'gearTurn', 'springBoing', 'windmillTurn', 'radioStatic', 'craneLower', 'coreHum'];
    // the placeholders share one file, so the per-file rule already holds them back
    e.handle(things.map(play));
    expect(mockPlayers.reduce((n, p) => n + p.plays, 0)).toBeLessThanOrEqual(4);
    e.release();
  });

  it('before a browser allows sound, one-shots are dropped (not queued) and loops wait for the gate', async () => {
    mockGateOpen = false;
    const e = await engine();
    e.handle([play('arrivalChime'), { at: clock, action: 'loopStart', slot: 'ambientMachinery' }]);
    expect(mockPlayers.reduce((n, p) => n + p.plays, 0)).toBe(0);
    expect(e.status().waitingForGesture).toBe(true);
    mockGateOpen = true;
    for (const l of mockGateListeners) l();
    // the bed starts; the chime asked for earlier does not burst out late
    expect(playsOf('arrivalChime')).toBe(0);
    expect(mockPlayers.find((p) => p.loop && p.source === sourceOf('ambientMachinery'))!.plays).toBe(1);
    e.release();
  });

  it('a loop never stops with a hard cut', async () => {
    jest.useFakeTimers();
    try {
      const e = await engine();
      e.handle([{ at: clock, action: 'loopStart', slot: 'doorMotor' }, { at: clock, action: 'loopStop', slot: 'doorMotor', fadeMs: 0 }]);
      const p = mockPlayers.find((x) => x.loop && x.source === sourceOf('doorMotor'))!;
      expect(p.pauses).toBe(0);
      jest.advanceTimersByTime(200);
      expect(p.pauses).toBe(1);
      expect(p.volume).toBe(0);
      e.release();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a file that fails to load leaves only its own slot silent', async () => {
    mockFailOn = (s) => (s === sourceOf('arrivalChime') ? 'create' : null);
    const e = await engine();
    expect(e.status().silent).toContain('arrivalChime');
    expect(() => e.handle([play('arrivalChime'), play('doorClosed')])).not.toThrow();
    expect(playsOf('doorClosed')).toBe(1);
    e.release();
  });

  it('a player that throws on play is caught and reported, never thrown into the game', async () => {
    mockFailOn = (s) => (s === sourceOf('completion') ? 'play' : null);
    const e = await engine();
    expect(() => e.handle([play('completion')])).not.toThrow();
    expect(e.status()).toMatchObject({ ready: false, error: 'play failed' });
    e.release();
  });
});

describe('audio engine narration (say, M9)', () => {
  const narr = (wordId: string) => AUDIO_ASSETS[`nar-${wordId}`];
  const speaking = () => mockPlayers.filter((p) => Object.keys(AUDIO_ASSETS).some((id) => id.startsWith('nar-') && AUDIO_ASSETS[id] === p.source));
  /** Narration players that are sounding now: started, not paused, volume above zero. */
  const audible = () => speaking().filter((p) => p.plays > 0 && p.pauses === 0 && p.volume > 0);

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('says a bundled word through the dialogue mix, and knows which keys it can say', async () => {
    const e = await engine();
    expect(e.canSay!('word.w01')).toBe(true);
    expect(e.canSay!('word.w38')).toBe(false);
    expect(e.say!('word.w01')).toBe(true);
    expect(audible().map((p) => p.source)).toEqual([narr('w01')]);
    expect(audible()[0]!.volume).toBe(narrationGain(DEFAULT_AUDIO));
    e.release();
  });

  it('a new say() stops the one before: a replay never stacks', async () => {
    const e = await engine();
    e.say!('word.w01');
    clock += 100;
    e.say!('word.w01');
    clock += 100;
    e.say!('word.w02');
    jest.advanceTimersByTime(SPEECH_FADE_MS + 10);
    expect(audible().map((p) => p.source)).toEqual([narr('w02')]);
    // The replaced ones faded out, paused and were freed, never cut mid-sample.
    const stopped = speaking().filter((p) => p.source === narr('w01'));
    expect(stopped).toHaveLength(2);
    for (const p of stopped) expect({ volume: p.volume, pauses: p.pauses, removed: p.remove.mock.calls.length }).toEqual({ volume: 0, pauses: 1, removed: 1 });
    e.release();
  });

  it('hush() stops it with a short fade; suspend() stops it too', async () => {
    const e = await engine();
    e.say!('word.w03');
    e.hush!();
    expect(audible()).toHaveLength(1); // still fading
    jest.advanceTimersByTime(SPEECH_FADE_MS + 10);
    expect(audible()).toHaveLength(0);
    expect(() => e.hush!()).not.toThrow();
    e.say!('word.w04');
    e.suspend();
    jest.advanceTimersByTime(SPEECH_FADE_MS + 10);
    expect(audible()).toHaveLength(0);
    e.release();
  });

  it('muted says nothing; quiet says it softer; muting while it speaks silences it', async () => {
    const muted = await engine({ output: 'muted', effects: 1 });
    expect(muted.say!('word.w01')).toBe(false);
    expect(speaking().reduce((n, p) => n + p.plays, 0)).toBe(0);
    muted.release();
    const quiet = await engine({ output: 'quiet', effects: 1 });
    quiet.say!('word.w01');
    expect(audible()[0]!.volume).toBe(narrationGain({ output: 'quiet', effects: 1 }));
    expect(narrationGain({ output: 'quiet', effects: 1 })).toBeLessThan(narrationGain(DEFAULT_AUDIO));
    quiet.setSettings({ output: 'muted', effects: 1 });
    expect(audible()).toHaveLength(0);
    quiet.release();
  });

  it('muting while it speaks stops the sentence (paused and freed), not only turns it down', async () => {
    const e = await engine();
    e.say!('word.w01');
    const [p] = audible();
    e.setSettings({ output: 'muted', effects: 0.8 });
    expect(p!.volume).toBe(0);
    jest.advanceTimersByTime(SPEECH_FADE_MS + 10);
    expect({ pauses: p!.pauses, removed: p!.remove.mock.calls.length }).toEqual({ pauses: 1, removed: 1 });
    expect(audible()).toHaveLength(0);
    e.release();
  });

  it('unmuting does not resume the old sentence; the next say() speaks again', async () => {
    const e = await engine();
    e.say!('word.w02');
    const [old] = audible();
    e.setSettings({ output: 'muted', effects: 0.8 });
    e.setSettings(DEFAULT_AUDIO);
    jest.advanceTimersByTime(SPEECH_FADE_MS + 10);
    expect(old!.volume).toBe(0);
    expect(old!.plays).toBe(1);
    expect(audible()).toHaveLength(0);
    // Quiet is not mute: a sentence under quiet keeps speaking, only softer.
    e.say!('word.w03');
    e.setSettings({ output: 'quiet', effects: 0.8 });
    expect(audible().map((p) => [p.source, p.volume])).toEqual([[narr('w03'), narrationGain({ output: 'quiet', effects: 0.8 })]]);
    e.release();
  });

  it('the effects volume does not turn speech down (it is not an effect)', async () => {
    const e = await engine({ output: 'normal', effects: 0 });
    e.say!('word.w05');
    expect(audible()[0]!.volume).toBe(narrationGain(DEFAULT_AUDIO));
    e.release();
  });

  it('an unknown key is silent and throws nothing; before a browser allows sound a word is dropped, not queued', async () => {
    const e = await engine();
    expect(e.say!('word.nope')).toBe(false);
    expect(e.say!('arrivalChime')).toBe(false);
    expect(speaking()).toHaveLength(0);
    e.release();
    mockGateOpen = false;
    const gated = await engine();
    expect(gated.say!('word.w01')).toBe(false);
    mockGateOpen = true;
    for (const l of mockGateListeners) l();
    expect(speaking().reduce((n, p) => n + p.plays, 0)).toBe(0);
    gated.release();
  });

  it('a recording that fails to load is silent and never throws into the game', async () => {
    mockFailOn = (s) => (s === narr('w06') ? 'create' : s === narr('w07') ? 'play' : null);
    const e = await engine();
    expect(() => e.say!('word.w06')).not.toThrow();
    expect(e.say!('word.w06')).toBe(false);
    expect(e.say!('word.w07')).toBe(false);
    expect(e.say!('word.w08')).toBe(true);
    e.release();
  });

  it('release() frees every narration player', async () => {
    const e = await engine();
    e.say!('word.w01');
    e.say!('word.w02');
    e.release();
    for (const p of speaking()) expect(p.remove).toHaveBeenCalledTimes(1);
  });

  const lengthOf = (w: string) => (manifestJson as { assets: Record<string, { durationMs: number }> }).assets[`nar-${w}`]!.durationMs;
  const playerOf = (w: string) => mockPlayers.filter((p) => p.source === narr(w)).at(-1)!;

  it('a recording plays to its own end: at its manifest length nothing stops it, and the line is over when its player says so', async () => {
    const e = await engine();
    const ended = jest.fn();
    expect(e.say!('word.w01', ended)).toBe(true);
    const word = playerOf('w01');
    const gain = word.volume;
    // The manifest length after the request: a player that took a while to start still has the end of
    // the word to say (measured in desktop Chromium: 79 to 101 ms of w01, whose last sound ends 96 ms
    // before the file does). Nothing is paused, freed or turned down, and nobody is told it is over.
    jest.advanceTimersByTime(lengthOf('w01') + 300);
    expect({ pauses: word.pauses, removed: word.removed, volume: word.volume }).toEqual({ pauses: 0, removed: false, volume: gain });
    expect(e.speaking!()).toBe(true);
    expect(ended).not.toHaveBeenCalled();
    // The player reports its own finish: the line is over, once, and the silent player is freed.
    word.finish();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith('ended');
    expect(e.speaking!()).toBe(false);
    expect({ pauses: word.pauses, removed: word.removed, volume: word.volume, listeners: word.listeners }).toEqual({ pauses: 0, removed: true, volume: gain, listeners: 0 });
    // Nothing more comes of it: not the fallback timer, not a second report from the player.
    word.finish();
    jest.advanceTimersByTime(60_000);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(word.writesAfterRemove).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    e.release();
  });

  it('a player that never reports its finish: the fallback ends the line after the manifest length plus a margin, and fades (never a hard cut)', async () => {
    const e = await engine();
    const ended = jest.fn();
    e.say!('word.w01', ended);
    const word = playerOf('w01');
    jest.advanceTimersByTime(lengthOf('w01') + SPEECH_END_MARGIN_MS - 1);
    expect(ended).not.toHaveBeenCalled();
    expect({ pauses: word.pauses, removed: word.removed }).toEqual({ pauses: 0, removed: false });
    jest.advanceTimersByTime(1);
    // Over for whoever waits on it, at once and once...
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith('ended');
    expect(e.speaking!()).toBe(false);
    // ...but the player might still be sounding (it never said): it fades before it is paused and freed.
    expect({ pauses: word.pauses, removed: word.removed }).toEqual({ pauses: 0, removed: false });
    jest.advanceTimersByTime(SPEECH_FADE_MS / 2);
    expect(word.volume).toBeGreaterThan(0);
    expect(word.volume).toBeLessThan(narrationGain(DEFAULT_AUDIO));
    jest.advanceTimersByTime(SPEECH_FADE_MS);
    expect({ volume: word.volume, pauses: word.pauses, removed: word.removed, late: word.writesAfterRemove }).toEqual({ volume: 0, pauses: 1, removed: true, late: 0 });
    // The margin is far more than a player takes to start, so the fallback cannot cut a slow start.
    expect(SPEECH_END_MARGIN_MS).toBeGreaterThanOrEqual(1500);
    // A story beat waiting on the line (director afterSpeech) outlasts this fallback and its breath.
    expect(SPEECH_WAIT_MARGIN_MS).toBeGreaterThanOrEqual(SPEECH_END_MARGIN_MS + SPEECH_TAIL_MS);
    jest.advanceTimersByTime(60_000);
    expect(ended).toHaveBeenCalledTimes(1);
    e.release();
  });

  it('the end is reported exactly once however a line ends: replaced, hushed, muted, tab hidden, released, or never started', async () => {
    const e = await engine();
    const [a, b, c, d, f] = [jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn()];
    e.say!('word.w02', a);
    e.say!('word.w03', b);
    expect(a).toHaveBeenCalledWith('stopped');
    e.hush!();
    expect(b).toHaveBeenCalledWith('stopped');
    e.say!('word.w04', c);
    e.setSettings({ output: 'muted', effects: 1 });
    expect(c).toHaveBeenCalledWith('stopped');
    e.setSettings(DEFAULT_AUDIO);
    e.say!('word.w05', d);
    e.suspend();
    expect(d).toHaveBeenCalledWith('stopped');
    e.resume();
    // A stopped player that finishes by itself during its fade, or after it, tells nobody again.
    for (const w of ['w02', 'w03', 'w04', 'w05']) playerOf(w).finish();
    jest.advanceTimersByTime(60_000);
    // Never called for a say that did not start (muted).
    e.setSettings({ output: 'muted', effects: 1 });
    const never = jest.fn();
    expect(e.say!('word.w06', never)).toBe(false);
    e.setSettings(DEFAULT_AUDIO);
    e.say!('word.w07', f);
    e.release();
    expect(f).toHaveBeenCalledWith('stopped');
    jest.advanceTimersByTime(60_000);
    for (const fn of [a, b, c, d, f]) expect(fn).toHaveBeenCalledTimes(1);
    expect(never).not.toHaveBeenCalled();
    // Every stopped player faded to silence before it was paused; none was written to after it was freed.
    for (const w of ['w02', 'w03', 'w04', 'w05', 'w07']) expect({ w, late: playerOf(w).writesAfterRemove, removed: playerOf(w).removed }).toEqual({ w, late: 0, removed: true });
  });
});

describe('audio engine ducking under speech', () => {
  const narr = (wordId: string) => AUDIO_ASSETS[`nar-${wordId}`];
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('the ambient bed ramps down while a word speaks and back up after it; a new one-shot starts lower; taps do not change', async () => {
    const lengthOf = (w: string) => (manifestJson as { assets: Record<string, { durationMs: number }> }).assets[`nar-${w}`]!.durationMs;
    const e = await engine();
    e.handle([{ at: clock, action: 'loopStart', slot: 'ambientMachinery' }]);
    const bed = mockPlayers.find((p) => p.source === sourceOf('ambientMachinery'))!;
    const full = gainFor(PROTOTYPE_MODERN, 'ambientMachinery', DEFAULT_AUDIO);
    expect(bed.volume).toBe(full);
    e.say!('word.w01');
    // A ramp, never a jump: partway after one step, at the ducked level after DUCK_RAMP_MS.
    jest.advanceTimersByTime(40);
    expect(bed.volume).toBeLessThan(full);
    expect(bed.volume).toBeGreaterThan(gainFor(PROTOTYPE_MODERN, 'ambientMachinery', DEFAULT_AUDIO, true));
    jest.advanceTimersByTime(DUCK_RAMP_MS);
    expect(bed.volume).toBeCloseTo(gainFor(PROTOTYPE_MODERN, 'ambientMachinery', DEFAULT_AUDIO, true), 3);
    clock += 500;
    e.handle([play('doorClosed'), play('floorButtonPress')]);
    const door = mockPlayers.find((p) => p.source === sourceOf('doorClosed') && p.plays > 0)!;
    expect(door.volume).toBeCloseTo(gainFor(PROTOTYPE_MODERN, 'doorClosed', DEFAULT_AUDIO, true), 3);
    expect(door.volume).toBeLessThan(gainFor(PROTOTYPE_MODERN, 'doorClosed', DEFAULT_AUDIO));
    const click = mockPlayers.find((p) => p.source === sourceOf('floorButtonPress') && p.plays > 0)!;
    expect(click.volume).toBe(gainFor(PROTOTYPE_MODERN, 'floorButtonPress', DEFAULT_AUDIO));
    // The word ends (its player says so): the bed comes back up, as a ramp.
    jest.advanceTimersByTime(lengthOf('w01'));
    mockPlayers.find((p) => p.source === narr('w01'))!.finish();
    // It holds a moment first (another line may follow), then ramps.
    jest.advanceTimersByTime(DUCK_HOLD_MS - 1);
    expect(bed.volume).toBeCloseTo(gainFor(PROTOTYPE_MODERN, 'ambientMachinery', DEFAULT_AUDIO, true), 3);
    jest.advanceTimersByTime(1 + DUCK_RAMP_MS + 40);
    expect(bed.volume).toBeCloseTo(full, 3);
    // Hushed early: back up too.
    e.say!('word.w02');
    jest.advanceTimersByTime(DUCK_RAMP_MS + 40);
    expect(bed.volume).toBeLessThan(full);
    e.hush!();
    jest.advanceTimersByTime(DUCK_RAMP_MS + 40);
    expect(bed.volume).toBeCloseTo(full, 3);
    expect(narr('w02')).toBeDefined();
    e.release();
  });
});

describe('audio engine: one duck for a sequence, and nothing left behind', () => {
  const narr = (wordId: string) => AUDIO_ASSETS[`nar-${wordId}`];
  const playerOf = (w: string) => mockPlayers.filter((p) => p.source === narr(w)).at(-1)!;
  const full = gainFor(PROTOTYPE_MODERN, 'ambientMachinery', DEFAULT_AUDIO);
  const ducked = gainFor(PROTOTYPE_MODERN, 'ambientMachinery', DEFAULT_AUDIO, true);
  const schedule = (fn: () => void, ms: number) => {
    const h = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(h) };
  };
  /** An engine with the ambient bed running, and the bed's player. */
  async function withBed() {
    const e = await engine();
    e.handle([{ at: clock, action: 'loopStart', slot: 'ambientMachinery' }]);
    return { e, bed: mockPlayers.find((p) => p.source === sourceOf('ambientMachinery'))! };
  }
  /** Step time, noting the bed's level at every step. */
  function levels(bed: FakePlayer, ms: number, step = 10) {
    const seen: number[] = [];
    for (let t = 0; t < ms; t += step) {
      jest.advanceTimersByTime(step);
      seen.push(bed.volume);
    }
    return seen;
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('the hold outlasts every gap a second line can start after', () => {
    expect(DUCK_HOLD_MS).toBeGreaterThan(SEQUENCE_GAP_MS);
    expect(DUCK_HOLD_MS).toBeGreaterThan(FOLLOW_GAP_MS);
    expect(DUCK_HOLD_MS).toBeGreaterThan(SPEECH_TAIL_MS);
  });

  it('two lines of a sequence share one duck: the bed stays down through the gap and comes back up once, after the last line', async () => {
    const { e, bed } = await withBed();
    const speech = createSpeech(e, { schedule, enabled: () => true, review: false });
    const ended = jest.fn();
    // Two approved recordings stand in for "the announcer, then Lifty".
    expect(speech.speak(['word.w01', 'word.w02'], ended)).toBe(true);
    jest.advanceTimersByTime(1000);
    expect(bed.volume).toBeCloseTo(ducked, 3);
    playerOf('w01').finish();
    // The gap, and the start of the second line: the bed never leaves the ducked level. (It used to
    // climb most of the way back up in these 180 ms and be pushed down again.)
    const gap = levels(bed, SEQUENCE_GAP_MS + 300);
    expect(Math.max(...gap)).toBeCloseTo(ducked, 3);
    expect(e.speaking!()).toBe(true);
    expect(playerOf('w02').plays).toBe(1);
    jest.advanceTimersByTime(2000);
    expect(bed.volume).toBeCloseTo(ducked, 3);
    // The last line ends: held, then one ramp up, never down again.
    playerOf('w02').finish();
    expect(ended).toHaveBeenCalledTimes(1);
    const after = levels(bed, DUCK_HOLD_MS + DUCK_RAMP_MS + 200);
    expect(after.slice(0, Math.floor(DUCK_HOLD_MS / 10) - 1).every((v) => Math.abs(v - ducked) < 0.001)).toBe(true);
    expect(after.at(-1)).toBeCloseTo(full, 3);
    for (let i = 1; i < after.length; i++) expect(after[i]!).toBeGreaterThanOrEqual(after[i - 1]!);
    expect(jest.getTimerCount()).toBe(0);
    e.release();
  });

  it('hushed in the gap, the mix comes back at once; a second line that cannot start lets it back by itself', async () => {
    const { e, bed } = await withBed();
    const speech = createSpeech(e, { schedule, enabled: () => true, review: false });
    speech.speak(['word.w01', 'word.w02']);
    jest.advanceTimersByTime(1000);
    playerOf('w01').finish();
    jest.advanceTimersByTime(SEQUENCE_GAP_MS / 2);
    speech.hush();
    // No waiting out the hold: the ramp starts now.
    jest.advanceTimersByTime(40);
    expect(bed.volume).toBeGreaterThan(ducked);
    jest.advanceTimersByTime(DUCK_RAMP_MS);
    expect(bed.volume).toBeCloseTo(full, 3);
    expect(mockPlayers.filter((p) => p.source === narr('w02'))).toHaveLength(0);
    // The second line's file fails: the hold still ends, once, and the bed is back.
    mockFailOn = (s) => (s === narr('w04') ? 'create' : null);
    speech.speak(['word.w03', 'word.w04']);
    jest.advanceTimersByTime(1000);
    expect(bed.volume).toBeCloseTo(ducked, 3);
    playerOf('w03').finish();
    jest.advanceTimersByTime(DUCK_HOLD_MS + DUCK_RAMP_MS + 100);
    expect(bed.volume).toBeCloseTo(full, 3);
    expect(speech.speaking()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    e.release();
  });

  it('release() while a line speaks: its end is reported, no timer is left running, and no freed player is written to', async () => {
    const { e, bed } = await withBed();
    const ended = jest.fn();
    e.say!('word.w01', ended);
    jest.advanceTimersByTime(400);
    expect(bed.volume).toBeCloseTo(ducked, 3);
    const word = playerOf('w01');
    e.release();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith('stopped');
    expect({ bed: bed.removed, word: word.removed }).toEqual({ bed: true, word: true });
    // Nothing is pending. (release() used to clear the ramps and then start new ones by stopping the
    // line, which wrote volume to the freed loop players for another 200 ms.)
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(5000);
    expect(mockPlayers.map((p) => p.writesAfterRemove).reduce((a, b) => a + b, 0)).toBe(0);
    // Released in the hold after a line, too.
    const second = await withBed();
    second.e.say!('word.w02');
    playerOf('w02').finish();
    second.e.release();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(5000);
    expect(mockPlayers.map((p) => p.writesAfterRemove).reduce((a, b) => a + b, 0)).toBe(0);
    // And a released engine says nothing more.
    expect(second.e.say!('word.w03')).toBe(false);
  });
});

describe('audio engine (sound set chosen by the platform)', () => {
  it('a missing file in the set is silent, the rest plays', async () => {
    jest.resetModules();
    jest.doMock('./activeSet', () => ({ activeSoundSet: () => ({ profile: ELEVENLABS_V1, sources: { 'el1-chime': 11, 'el1-button-press': 12 } }) }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh engine after jest.doMock
    const { createAudioEngine: create } = require('./audioEngine') as typeof import('./audioEngine');
    const e = await create(PROTOTYPE_MODERN, DEFAULT_AUDIO, () => clock);
    expect(e.status().profile).toBe(ELEVENLABS_V1.id);
    expect(e.status().silent!.length).toBe(SOUND_SLOTS.filter((s) => ELEVENLABS_V1.slots[s]).length - 3); // chime + the two button slots load
    expect(() => e.handle(SOUND_SLOTS.map(play))).not.toThrow();
    expect(mockPlayers.filter((p) => p.source === 11).reduce((n, p) => n + p.plays, 0)).toBe(1);
    e.release();
    jest.dontMock('./activeSet');
  });

  it('at most four one-shots at once; an arrival chime still gets through, replacing the oldest', async () => {
    jest.resetModules();
    const ids = SOUND_SLOTS.map((s) => ELEVENLABS_V1.slots[s]?.asset).filter((a): a is string => Boolean(a));
    const sources = Object.fromEntries(ids.map((id, i) => [id, 500 + i]));
    jest.doMock('./activeSet', () => ({ activeSoundSet: () => ({ profile: ELEVENLABS_V1, sources }) }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh engine after jest.doMock
    const { createAudioEngine: create } = require('./audioEngine') as typeof import('./audioEngine');
    const e = await create(PROTOTYPE_MODERN, DEFAULT_AUDIO, () => clock);
    const things: SoundSlot[] = ['toolboxOpen', 'fanStart', 'gearTurn', 'springBoing', 'windmillTurn', 'radioStatic', 'craneLower', 'coreHum'];
    e.handle(things.map(play));
    const total = () => mockPlayers.reduce((n, p) => n + p.plays, 0);
    expect(total()).toBe(4);
    expect(e.status().dropped).toBe(4);
    clock += 20;
    e.handle([play('arrivalChime')]);
    expect(total()).toBe(5);
    expect(mockPlayers.reduce((n, p) => n + p.pauses, 0)).toBe(1);
    e.release();
    jest.dontMock('./activeSet');
  });

  it('the browser playtest build plays the generated pack by default and the placeholders on ?sound=placeholder', () => {
    let params: Record<string, string> = {};
    jest.resetModules();
    jest.doMock('../../../platform/launchParams', () => ({ launchParams: () => params }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after jest.doMock
    const web = require('./activeSet.web') as typeof import('./activeSet.web');
    const def = web.activeSoundSet(PROTOTYPE_MODERN);
    expect(def.profile.id).toBe(ELEVENLABS_V1.id);
    for (const slot of SOUND_SLOTS) {
      const s = ELEVENLABS_V1.slots[slot];
      if (s) expect({ slot, bundled: def.sources[s.asset] !== undefined }).toEqual({ slot, bundled: true });
    }
    params = { sound: 'placeholder' };
    expect(web.activeSoundSet(ELEVENLABS_V1).profile.id).toBe(PROTOTYPE_MODERN.id);
    params = { sound: 'production' };
    expect(web.activeSoundSet(PROTOTYPE_MODERN).profile.id).toBe(ELEVENLABS_V1.id);
    jest.dontMock('../../../platform/launchParams');
  });

  it('?sound=production in the browser is what a production build plays: no file of the review list, and no pending voice', () => {
    let params: Record<string, string> = {};
    jest.resetModules();
    jest.doMock('../../../platform/launchParams', () => ({ launchParams: () => params }));
    // A recording of the pending voice pack, as the review list will carry one once a line is recorded.
    jest.doMock('../../../devtools/audioReviewSources', () => ({ AUDIO_REVIEW_SOURCES: { 'voice-lifty-intro': 901, 'button-click': 902 } }));
    /* eslint-disable @typescript-eslint/no-require-imports -- loaded after jest.doMock */
    const web = require('./activeSet.web') as typeof import('./activeSet.web');
    const native = require('./activeSet') as typeof import('./activeSet');
    const { AUDIO_ASSETS: approved } = require('./assets') as typeof import('./assets');
    const { voicePlayable } = require('./speech') as typeof import('./speech');
    /* eslint-enable @typescript-eslint/no-require-imports */
    // The playtest build by default: the review list is in the set, and pending packs may speak.
    expect(web.activeSoundSet(PROTOTYPE_MODERN).sources['voice-lifty-intro']).toBe(901);
    expect(web.playsReviewPacks()).toBe(true);
    expect(native.playsReviewPacks()).toBe(false);
    // ?sound=production: exactly the approved files a native build carries, and pending packs stay silent.
    params = { sound: 'production' };
    const set = web.activeSoundSet(PROTOTYPE_MODERN);
    expect(set.sources).toEqual(approved);
    expect(set.sources['voice-lifty-intro']).toBeUndefined();
    expect(web.playsReviewPacks()).toBe(false);
    // With that answer a recorded line of a pending pack is not playable, even if its file were there.
    const manifest = { packs: { 'elevenlabs-voice-v1': { status: 'pending' as const } }, assets: { 'voice-lifty-intro': { pack: 'elevenlabs-voice-v1', durationMs: 4000, narrationKey: 'voice.lifty.intro' } } };
    expect(voicePlayable('voice.lifty.intro', web.playsReviewPacks(), manifest)).toBe(false);
    params = {};
    expect(voicePlayable('voice.lifty.intro', web.playsReviewPacks(), manifest)).toBe(true);
    jest.dontMock('../../../platform/launchParams');
    jest.dontMock('../../../devtools/audioReviewSources');
  });
});
