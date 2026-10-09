// The host's small parts (M9): its words, the sound passthrough, the mock session WG and CC build on.
import { SOUND_SLOTS } from '../audio/profile';
import type { AudioCue } from '../audio/cues';
import { MINI_GAMES } from './catalog';
import { HOST_COPY, entranceLabel } from './hostCopy';
import { createGameSound, silentSound } from './hostSound';
import { createMockSession } from './testing/mockSession';

describe('host copy (temporary, until it moves to the content JSON)', () => {
  const words = [...Object.values(HOST_COPY.games), ...Object.values(HOST_COPY.entrance), ...Object.values(HOST_COPY.resume), HOST_COPY.play, HOST_COPY.entranceHint, HOST_COPY.back, HOST_COPY.backHint, HOST_COPY.loading, HOST_COPY.missing, HOST_COPY.trouble, HOST_COPY.placeholder];
  it('names every game, in plain words: no em dash, no exclamation, nothing about speed, scores or losing', () => {
    for (const g of MINI_GAMES) {
      expect(HOST_COPY.games[g.titleKey]).toBeTruthy();
      expect(entranceLabel(g.titleKey, false)).toMatch(/^PLAY /);
      expect(entranceLabel(g.titleKey, true)).toMatch(/^BACK TO /);
    }
    for (const w of words) {
      expect(w).not.toMatch(/[—–!]/);
      expect(w).not.toMatch(/\b(hurry|quick|fast|score|points|lose|lost a|fail)/i);
    }
  });
});

describe('game sound passthrough', () => {
  const engine = () => {
    const cues: AudioCue[] = [];
    return { cues, audio: { handle: (c: readonly AudioCue[]) => void cues.push(...c) } };
  };
  it('plays known slots, is silent for unknown slots and missing narration, and stops its loops when closed', () => {
    const e = engine();
    const missing: string[] = [];
    const sound = createGameSound({ audio: e.audio, now: () => 5, log: (_k, d) => void missing.push(String(d.slot)) });
    sound.play(SOUND_SLOTS[0]);
    sound.play('golfHitNotYetInProfile');
    sound.say('word.w01');
    expect(sound.canSay('word.w01')).toBe(false);
    sound.loop('travelLoop', true);
    sound.loop('travelLoop', true); // a loop starts once
    sound.stopAll();
    expect(e.cues).toEqual([
      { at: 5, action: 'play', slot: SOUND_SLOTS[0] },
      { at: 5, action: 'loopStart', slot: 'travelLoop' },
      { at: 5, action: 'loopStop', slot: 'travelLoop', fadeMs: 150 },
    ]);
    expect(missing).toEqual(['golfHitNotYetInProfile', 'say:word.w01']);
  });
  it('hands narration to the narration registry when it has the key', () => {
    const said: string[] = [];
    const sound = createGameSound({ audio: engine().audio, now: () => 0, narration: { has: (k) => k === 'word.w01', say: (k) => void said.push(k), hush: () => void said.push('hush') } });
    sound.say('word.w01');
    sound.say('word.w99');
    sound.stopAll();
    expect(said).toEqual(['word.w01', 'hush']);
    expect(() => (silentSound.play('x'), silentSound.say('y'))).not.toThrow();
  });
});

describe('mock session (for building games before their content)', () => {
  it('follows the real session: text case-insensitive, a right answer held for next(), help ladder, evidence, saves', async () => {
    const s = createMockSession({ gameId: 'word-golf', items: [{ concept: 'spelling', prompt: { wordId: 'w1', length: 5 }, answer: 'cable' }, { concept: 'spelling', answer: 'gear' }] });
    expect(s.challenge()!.answer).toEqual({ mode: 'text', maxLength: 12 });
    expect(s.check({ mode: 'value', value: 'CABLE' })).toEqual({ correct: true, misconception: null });
    expect(await s.submit({ mode: 'value', value: 'cabel' })).toMatchObject({ status: 'answered', correct: false, evidence: 'incorrect' });
    await s.help();
    expect(await s.submit({ mode: 'value', value: 'Cable' })).toMatchObject({ correct: true, evidence: 'clue', done: false });
    expect(s.progress().phase).toBe('solved');
    expect(s.solvedAnswer()).toEqual({ value: 'Cable', evidence: 'clue' });
    expect(s.challenge()).toBeNull();
    expect((await s.next())!.key).toMatch(/:1:/);
    await s.saveGame({ hole: 2 });
    expect(await s.loadGame()).toEqual({ hole: 2 });
    expect(await s.submit({ mode: 'value', value: 'gear' })).toMatchObject({ correct: true, done: true });
    expect(await s.next()).toBeNull();
    expect(s.progress()).toMatchObject({ phase: 'done', done: true });
    await s.finish();
    expect(s.recorded.map((r) => r.evidence)).toEqual(['clue', 'independent']);
    expect(s.calls.filter((c) => c.method === 'submit')).toHaveLength(3);
  });

  it('a resumed mock picks up at the item after the ones already solved', async () => {
    const s = createMockSession({ gameId: 'word-golf', items: [{ concept: 'spelling', answer: 'cab' }, { concept: 'spelling', answer: 'gear' }], resumed: { state: { hole: 2 }, answered: 1 } });
    // Like the real session: where it is comes from the step; `solved` counts this visit only.
    expect({ resumed: s.resumed, key: s.challenge()!.key, step: s.progress().step.index, solved: s.progress().solved, saved: await s.loadGame() }).toEqual({ resumed: true, key: 'mock:word-golf:1:gen0', step: 1, solved: 0, saved: { hole: 2 } });
    expect(await s.submit({ mode: 'value', value: 'gear' })).toMatchObject({ correct: true, done: true });
  });
});
