// Audit P1: the OS "reduce motion" switch is the starting default only when nothing is stored.
import type { GameRuntime } from '../../runtime/gameRuntime';
import type { AudioEngine } from './audio/audioEngine';
import type { AudioSettings } from './audio/mix';
import type { Director } from './director/director';
import { createPlaytestLog } from './director/playtestLog';
import type { MiniGameHost } from './minigames/host';
import { assembleSession, parseSettings, resolveMotion } from './sessionCore';

describe('initial motion setting', () => {
  it('a stored choice always wins over the OS', () => {
    expect(resolveMotion({ motion: 'normal' }, true)).toEqual({ motion: 'normal', source: 'stored' });
    expect(resolveMotion({ motion: 'reduced' }, false)).toEqual({ motion: 'reduced', source: 'stored' });
    expect(resolveMotion({ motion: 'reduced' }, null)).toEqual({ motion: 'reduced', source: 'stored' });
  });

  it('with nothing stored, the OS switch decides', () => {
    expect(resolveMotion({}, true)).toEqual({ motion: 'reduced', source: 'os' });
    expect(resolveMotion({}, false)).toEqual({ motion: 'normal', source: 'default' });
  });

  it('an unreadable OS setting or a garbled stored value falls back to normal motion', () => {
    expect(resolveMotion({}, null)).toEqual({ motion: 'normal', source: 'default' });
    expect(resolveMotion({ motion: 'sideways' }, true)).toEqual({ motion: 'reduced', source: 'os' });
  });

  it('parseSettings applies it and leaves sound settings alone', () => {
    expect(parseSettings({}, true).motion).toBe('reduced');
    expect(parseSettings({ motion: 'normal' }, true).motion).toBe('normal');
    expect(parseSettings({ output: 'quiet' }, true).audio.output).toBe('quiet');
    expect(parseSettings({}).motion).toBe('normal');
  });
});

describe('voice settings (the narration switch and the voice volume)', () => {
  it('default to on at full volume, and read back what was stored', () => {
    expect(parseSettings({}).audio).toMatchObject({ narration: true, voice: 1 });
    expect(parseSettings({ narration: 'off', voice: '0.4' }).audio).toMatchObject({ narration: false, voice: 0.4 });
    expect(parseSettings({ narration: 'on', voice: '7' }).audio).toMatchObject({ narration: true, voice: 1 });
    expect(parseSettings({ voice: 'loud' }).audio.voice).toBe(1);
    expect(parseSettings({ voice: '0' }).audio.voice).toBe(0);
  });

  it('setVoice applies to the mix, persists like the other settings, and switching off hushes a line at once', () => {
    const put: [string, string][] = [];
    const mixes: AudioSettings[] = [];
    const hush = jest.fn();
    const parts = {
      learnerId: 'learner-a',
      runtime: { putSetting: async (_l: string, k: string, v: string) => void put.push([k, v]) } as unknown as GameRuntime,
      director: { setMotion: () => {} } as unknown as Director,
      audio: { setSettings: (a: AudioSettings) => void mixes.push(a) } as unknown as AudioEngine,
      log: createPlaytestLog(),
      skillsBefore: null,
      games: {} as MiniGameHost,
      speech: { speak: () => false, hush },
    };
    const s = assembleSession(parts, parseSettings({ output: 'quiet', effects: '0.5' }));
    s.setVoice(true, 0.7);
    expect(hush).not.toHaveBeenCalled();
    s.setVoice(false, 0.7);
    expect(hush).toHaveBeenCalledTimes(1);
    expect(put).toEqual([
      ['narration', 'on'],
      ['voice', '0.7'],
      ['narration', 'off'],
      ['voice', '0.7'],
    ]);
    expect(mixes.at(-1)).toEqual({ output: 'quiet', effects: 0.5, narration: false, voice: 0.7 });
    expect(s.settings.get().audio).toMatchObject({ narration: false, voice: 0.7 });
    // The sound setting keeps the voice settings, and the voice settings keep the sound setting.
    s.setAudio('normal', 0.9);
    expect(mixes.at(-1)).toEqual({ output: 'normal', effects: 0.9, narration: false, voice: 0.7 });
  });
});
