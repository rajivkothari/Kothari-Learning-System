/// <reference types="node" />
// A clip the browser refuses to play (no user activation yet, a file that will not load) was not heard:
// over the real player and the real browser clip, a refused telling ends at once, opens nothing it should
// not, and never counts a story as told or the how-to line as taught.
import { createRecordedClip } from '../audio/clip.web';
import { createKingdomPlayback } from '../audio/playback';
import { clip } from './choiceContent';
import { createChoiceFlow } from './choiceFlow';
import { gameAudioFrom } from './flow';
import { LEARNER, testClock, testWorld } from './testing';

jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ uri: '/local.mp3' }) } }));

/** A browser whose play() is refused while `refuse` is on, and otherwise plays until the test ends the clip. */
function browser() {
  const original = globalThis.Audio;
  const played: string[] = [];
  const ends: (() => void)[] = [];
  let refuse = true;
  globalThis.Audio = jest.fn((uri: string) => {
    const on: Record<string, () => void> = {};
    return {
      volume: 0,
      addEventListener: (name: string, fn: () => void) => {
        on[name] = fn;
      },
      removeEventListener: jest.fn(),
      play: () => {
        played.push(uri);
        if (refuse) return Promise.reject(new Error('NotAllowedError'));
        ends.push(() => on.ended?.());
        return Promise.resolve();
      },
      pause: jest.fn(),
      removeAttribute: jest.fn(),
      load: jest.fn(),
    };
  }) as unknown as typeof Audio;
  return { played, allow: () => { refuse = false; }, end: () => ends.shift()?.(), restore: () => { globalThis.Audio = original; } };
}
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('a clip that could not play is not heard', () => {
  it('a sequence whose clip is refused reports false at once and plays nothing more', async () => {
    const b = browser();
    try {
      const clock = testClock();
      const audio = createKingdomPlayback({ isOpen: () => true, hasSource: () => true, now: () => 0, wait: (ms, fn) => { clock.wait(ms, fn); }, start: (key, finished) => createRecordedClip({ uri: key }, 0.65, finished) });
      audio.setEnabled(true);
      const ends: boolean[] = [];
      expect(audio.sequence(['game:a', 'game:b'], 400, (ok) => ends.push(ok))).toBe(true);
      await settle();
      expect(ends).toEqual([false]);
      clock.advance(400);
      await settle();
      expect(b.played).toEqual(['game:a']);
      expect(audio.busy()).toBe(false);
    } finally {
      b.restore();
    }
  });

  it('Story Corner over that player: the story is not counted as told nor the how-to as taught, nothing stays locked, and the ear tells it again', async () => {
    const b = browser();
    const w = await testWorld();
    try {
      const clock = testClock();
      const player = createKingdomPlayback({ isOpen: () => true, hasSource: () => true, now: () => 0, wait: (ms, fn) => { clock.wait(ms, fn); }, start: (key, finished) => createRecordedClip({ uri: key }, 0.65, finished) });
      player.setEnabled(true);
      const f = createChoiceFlow({ runtime: w.runtime(), learnerId: LEARNER, play: 'story', now: w.now, audio: gameAudioFrom(player), wait: clock.wait });
      await f.start();
      const t = f.view().task!;
      const [one, two, three] = t.sentences.map(clip);
      // The first sentence is refused: the telling ends there, promptly. Nothing was heard, and nothing is locked.
      await settle();
      expect(b.played).toEqual([one]);
      expect(f.view().listening).toBe(false);
      clock.advance(5000);
      await settle();
      expect(b.played).toEqual([one]);
      // The ear: the story was never heard, so it is told again (announced), and so is how to play after it.
      b.allow();
      b.played.length = 0;
      f.hear();
      for (let part = 0; part < 6; part++) {
        await settle();
        b.end();
        await settle();
        clock.advance(450);
      }
      expect(b.played).toEqual([clip('line.story.intro'), one, two, three, clip(t.question!), clip('line.shared.hearThenStar')]);
      // Heard to their ends this time: the ear now asks only the question.
      b.played.length = 0;
      f.hear();
      await settle();
      expect(b.played).toEqual([clip(t.question!)]);
      f.dispose();
    } finally {
      b.restore();
      await w.done();
    }
  });
});
