// The playback engine against a fake expo-audio: settings, the browser gate, the voice policy,
// and failures that must stay silent instead of reaching the game. (Runs in the app project.)
import type { AudioCue } from './cues';
import { DEFAULT_AUDIO, narrationGain } from './mix';
import { ELEVENLABS_V1, PROTOTYPE_MODERN, SOUND_SLOTS, type SoundSlot } from './profile';

interface FakePlayer {
  source: unknown;
  volume: number;
  loop: boolean;
  plays: number;
  pauses: number;
  play: jest.Mock;
  pause: jest.Mock;
  seekTo: jest.Mock;
  remove: jest.Mock;
}

const mockPlayers: FakePlayer[] = [];
let mockFailOn: (source: unknown) => 'create' | 'play' | null = () => null;
let mockGateOpen = true;
const mockGateListeners: (() => void)[] = [];
let clock = 0;

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => undefined),
  createAudioPlayer: jest.fn((source: unknown) => {
    if (mockFailOn(source) === 'create') throw new Error('decode failed');
    const p: FakePlayer = {
      source,
      volume: 1,
      loop: false,
      plays: 0,
      pauses: 0,
      play: jest.fn(() => {
        if (mockFailOn(source) === 'play') throw new Error('play failed');
        p.plays += 1;
      }),
      pause: jest.fn(() => (p.pauses += 1)),
      seekTo: jest.fn(async () => undefined),
      remove: jest.fn(),
    };
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
import { SPEECH_FADE_MS, createAudioEngine } from './audioEngine';
// eslint-disable-next-line import/first
import { AUDIO_ASSETS } from './assets';

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
});
