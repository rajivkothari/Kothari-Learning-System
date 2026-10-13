// Word Golf's controller against the mock session (headless, fake timers): what reaches the session,
// when, and what the learner sees (D197). The word is the shot: evidence comes only from submit, the
// shot's quality only reads it, and golf (targets, flights, lies, putts, strokes) never reaches the session.
import type { MiniGameSound } from '../types';
import { holeFor } from './course';
import { WG_COPY } from './copy';
import type { WordClue } from './clues';
import { createWordGolf, hintFor, itemOf, type Timers, type WordGolfController } from './controller';
import { puttGreen } from './fairway';
import { toSave } from './game';
import { shotTiming } from './shotFeel';
import { TEST_WORDS, goodPutt, tilesFor, wordGolfMock } from './testPlay';

/** Timers the test advances by hand. */
function fakeTimers(): Timers & { advance(ms: number): void; pending(): number } {
  let now = 0;
  let id = 0;
  const q = new Map<number, { at: number; fn: () => void }>();
  return {
    set(fn, ms) {
      id += 1;
      q.set(id, { at: now + Math.max(0, ms), fn });
      return id;
    },
    clear(h) {
      q.delete(h as number);
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...q.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        q.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = until;
    },
    pending: () => q.size,
  };
}

function recordingSound(canSay = true): MiniGameSound & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    play: (slot) => void log.push(`play:${slot}`),
    loop: (slot, on) => void log.push(`loop:${slot}:${on ? 'on' : 'off'}`),
    say: (key) => void log.push(`say:${key}`),
    canSay: () => canSay,
    hush: () => void log.push('hush'),
  };
}

const CLUES: Record<string, WordClue> = {
  'w-gear': { blank: 'The ___ turns the belt.', meaning: 'A wheel with teeth.', phonics: 'g, then the ee sound, then r' },
};

/** Lets every pending promise settle (the session's saves and commits). */
const flush = () => new Promise<void>((r) => setImmediate(r));

function setup(opts: Parameters<typeof wordGolfMock>[0] & { reduced?: boolean } = {}) {
  const missionId = opts.missionId ?? 'word-golf';
  const hole = holeFor(missionId);
  const session = wordGolfMock({ words: hole.turns.length, ...opts, missionId });
  const sound = recordingSound();
  const timers = fakeTimers();
  const ctl = createWordGolf({ session, sound, hole, copy: WG_COPY, clues: (id) => CLUES[id] ?? null, timers, reducedMotion: Boolean(opts.reduced) });
  return { session, sound, timers, ctl, hole };
}

type Mock = ReturnType<typeof wordGolfMock>;
const submits = (s: Mock) => s.calls.filter((c) => c.method === 'submit');
/** Every call that could carry evidence or move the mission (saves are gameplay only). */
const learningCalls = (s: Mock) => s.calls.filter((c) => c.method === 'submit' || c.method === 'help' || c.method === 'next' || c.method === 'finish').length;
const wordOf = (ctl: WordGolfController) => TEST_WORDS.find((w) => w.wordId === ctl.getView().item?.wordId)!;

async function spell(ctl: WordGolfController, w: string) {
  const item = ctl.getView().item!;
  for (const id of tilesFor(item.tiles, w)) ctl.place(id);
  await ctl.check();
  await flush();
}

/** The flight plays out (its timers), and the result card opens. */
function fly(timers: ReturnType<typeof fakeTimers>) {
  timers.advance(10_000);
}

/** Putt until the ball drops (or `max` putts), running the playback timers. */
async function puttOut(ctl: WordGolfController, timers: ReturnType<typeof fakeTimers>, max = 6) {
  for (let i = 0; i < max && ctl.getView().state.phase === 'aim'; i++) {
    const v = ctl.getView();
    const p = goodPutt(puttGreen(v.hole, v.state.ball), v.state.putting!.ball);
    ctl.setAim(p.angle);
    ctl.setPower(p.power);
    ctl.shoot();
    timers.advance(10_000);
    await flush();
  }
}

describe('Word Golf controller (D197)', () => {
  it('plays hole 1: one word is the drive onto the green, then the putt; finish once', async () => {
    const { session, ctl, timers, sound } = setup();
    await ctl.start();
    expect(ctl.getView().state.phase).toBe('intro');
    await ctl.begin();
    // One target (the green): straight to the spelling.
    expect(ctl.getView().state.phase).toBe('spell');
    expect(ctl.getView().state.letters).toBe(4);
    await spell(ctl, 'gear');
    expect(ctl.getView().state.phase).toBe('flight');
    expect(ctl.getView().state.report?.quality).toBe('power');
    fly(timers);
    expect(ctl.getView().state.phase).toBe('result');
    expect(ctl.getView().state.lie).toBe('green');
    await ctl.carryOn();
    expect(ctl.getView().state.phase).toBe('aim');
    await puttOut(ctl, timers);
    await flush();
    expect(ctl.getView().state.phase).toBe('sunk');
    expect(session.finished).toBe(true);
    expect(session.calls.filter((c) => c.method === 'finish')).toHaveLength(1);
    expect(submits(session)).toHaveLength(1);
    expect(session.recorded).toEqual([expect.objectContaining({ correct: true, evidence: 'independent' })]);
    expect(ctl.getView().done).toContain('word-golf');
    expect(ctl.getView().best['driving-range']).toBe(ctl.getView().state.strokes);
    expect(sound.log).toEqual(expect.arrayContaining(['play:answerRight', 'play:golfHit', 'loop:golfRoll:on', 'play:golfCup', 'play:holeComplete', 'loop:golfRoll:off']));
  });

  it('a hole with a choice: pick the bold shot, a word right first try carries it', async () => {
    const { session, ctl, timers } = setup({ missionId: 'word-golf-4' });
    await ctl.start();
    await ctl.begin();
    expect(ctl.getView().state.phase).toBe('target');
    // Choosing a target is play: nothing reaches the session.
    const before = learningCalls(session);
    ctl.chooseTarget('over-sand');
    expect(learningCalls(session)).toBe(before);
    expect(ctl.getView().state.phase).toBe('spell');
    // CHANGE SHOT goes back to the targets with the word still waiting.
    ctl.changeTarget();
    expect(ctl.getView().state.phase).toBe('target');
    ctl.chooseTarget('over-sand');
    await spell(ctl, wordOf(ctl).word);
    expect(ctl.getView().state.report).toEqual(expect.objectContaining({ quality: 'power', carried: true, lie: 'fairway' }));
    fly(timers);
    await ctl.carryOn();
    // NEXT WORD: the next turn's word arrives (the green, the only target).
    expect(ctl.getView().state.turn).toBe(1);
    expect(ctl.getView().state.phase).toBe('spell');
    await spell(ctl, wordOf(ctl).word);
    fly(timers);
    expect(ctl.getView().state.lie).toBe('green');
    expect(submits(session)).toHaveLength(2);
  });

  it('a word not right yet is not a shot: it stays on the card, then a retry is a good shot', async () => {
    const { session, ctl } = setup({ missionId: 'word-golf-4' });
    await ctl.start();
    await ctl.begin();
    ctl.chooseTarget('over-sand');
    const w = wordOf(ctl);
    await spell(ctl, w.miss);
    expect(ctl.getView().state.phase).toBe('spell');
    expect(ctl.getView().state.strokes).toBe(0);
    expect(ctl.getView().state.feedback?.attempt).toBe(w.miss);
    ctl.clear();
    await spell(ctl, w.word);
    expect(session.recorded.at(-1)).toEqual(expect.objectContaining({ correct: true, evidence: 'retry' }));
    expect(ctl.getView().state.report).toEqual(expect.objectContaining({ quality: 'good', carried: true }));
  });

  it('help never blocks the shot: SHOW ME, then the word flies as a steady shot (short of the bold target)', async () => {
    const { session, ctl, timers } = setup({ missionId: 'word-golf-4' });
    await ctl.start();
    await ctl.begin();
    ctl.chooseTarget('over-sand');
    for (let i = 0; i < 4 && !ctl.getView().state.shown; i++) await ctl.help();
    expect(ctl.getView().state.shown).toBe(true);
    await spell(ctl, wordOf(ctl).word);
    expect(session.recorded.at(-1)).toEqual(expect.objectContaining({ correct: true, evidence: 'demonstrated' }));
    expect(ctl.getView().state.phase).toBe('flight');
    expect(ctl.getView().state.report).toEqual(expect.objectContaining({ quality: 'steady', carried: false }));
    fly(timers);
    expect(ctl.getView().state.phase).toBe('result');
    // It came up short into the sand (the Bunker Lesson): the next word is a splash shot from there,
    // and it still reaches the green.
    expect(ctl.getView().state.lie).toBe('bunker');
    await ctl.carryOn();
    await spell(ctl, wordOf(ctl).word);
    expect(ctl.getView().state.report?.quality).toBe('steady');
    fly(timers);
    expect(ctl.getView().state.lie).toBe('green');
    await ctl.carryOn();
    expect(ctl.getView().state.phase).toBe('aim');
  });

  it('water: a short shot over the pool splashes and is set down beside it, no stroke taken away', async () => {
    const { ctl, timers } = setup({ missionId: 'word-golf-8' });
    await ctl.start();
    await ctl.begin();
    ctl.chooseTarget('over-the-pool');
    for (let i = 0; i < 4 && !ctl.getView().state.shown; i++) await ctl.help();
    await spell(ctl, wordOf(ctl).word);
    expect(ctl.getView().state.report?.splash).toBe(true);
    fly(timers);
    const s = ctl.getView().state;
    expect(s.lie).toBe('fairway');
    expect(s.strokes).toBe(1);
    expect(s.ball).toEqual(ctl.getView().hole.turns[0]!.targets.find((t) => t.id === 'over-the-pool')!.drop);
  });

  it('putting is never evidence: aims, putts, misses and MOVE CLOSER reach no submit, help or next', async () => {
    const { session, ctl, timers } = setup();
    await ctl.start();
    await ctl.begin();
    await spell(ctl, 'gear');
    fly(timers);
    await ctl.carryOn();
    const before = learningCalls(session);
    const recorded = session.recorded.length;
    ctl.aimLeft();
    ctl.aimRight();
    ctl.morePower();
    ctl.lessPower();
    // Three soft putts away from the cup: putting goes on from where it stops, never a word again.
    for (let i = 0; i < 3; i++) {
      ctl.setAim(ctl.getView().state.putting!.aim + Math.PI);
      ctl.setPower(0.1);
      ctl.shoot();
      timers.advance(10_000);
      await flush();
      expect(ctl.getView().state.phase).toBe('aim');
    }
    expect(ctl.getView().closer).toBe(true);
    ctl.moveCloser();
    expect(learningCalls(session)).toBe(before);
    expect(session.recorded.length).toBe(recorded);
    expect(ctl.getView().state.words).toEqual(['gear']);
  });

  it('tapping CHECK twice sends one word; a flight skipped lands at once', async () => {
    const { session, ctl, timers } = setup({ latencyMs: 30 });
    await ctl.start();
    await ctl.begin();
    for (const id of tilesFor(ctl.getView().item!.tiles, 'gear')) ctl.place(id);
    const a = ctl.check();
    const b = ctl.check();
    await new Promise((r) => setTimeout(r, 60));
    await Promise.all([a, b]);
    expect(submits(session)).toHaveLength(1);
    expect(ctl.getView().state.phase).toBe('flight');
    ctl.skip();
    expect(ctl.getView().state.phase).toBe('result');
    expect(timers.pending()).toBe(0);
  });

  it('Reduced Motion: the shot is shorter and plays the same sounds', () => {
    const l = { flight: 150, land: { x: 0, y: 0 }, rest: { x: 0, y: 6 }, splash: null };
    const normal = shotTiming(l, false);
    const reduced = shotTiming(l, true);
    expect(reduced.totalMs).toBeLessThan(normal.totalMs);
    expect(reduced.arc).toBe(0);
  });

  it('resumes mid-hole where the ball was (gameplay save), never replaying a word', async () => {
    const first = setup({ missionId: 'word-golf-4' });
    await first.ctl.start();
    await first.ctl.begin();
    first.ctl.chooseTarget('short-of-sand');
    await spell(first.ctl, wordOf(first.ctl).word);
    fly(first.timers);
    await flush();
    const ball = first.ctl.getView().state.ball;
    const saved = first.session.saved;
    first.ctl.dispose();

    const again = setup({ missionId: 'word-golf-4', resumed: { state: saved, answered: 1, held: true } });
    await again.ctl.start();
    const s = again.ctl.getView().state;
    expect(s.turn).toBe(1);
    expect(s.ball).toEqual(ball);
    expect(s.resumed).toBe(true);
    expect(submits(again.session)).toHaveLength(0);
  });

  it('an answer the save missed (closed between the word and the save) plays its owed shot from the session', async () => {
    const prep = setup({ missionId: 'word-golf-4' });
    await prep.ctl.start();
    await prep.ctl.begin();
    prep.ctl.chooseTarget('over-sand');
    const before = toSave(prep.hole, prep.ctl.getView().state);
    const r = setup({ missionId: 'word-golf-4', resumed: { state: before, answered: 1, held: true } });
    await r.ctl.start();
    const s = r.ctl.getView().state;
    expect(s.turn).toBe(1);
    expect(s.phase).toBe('result');
    // The session held an independent answer: the bold target is carried.
    expect(s.report).toEqual(expect.objectContaining({ word: TEST_WORDS[0].word, carried: true }));
    expect(submits(r.session)).toHaveLength(0);
  });

  it('a finished hole played again starts at the tee (an old sunk save is not reused)', async () => {
    const first = setup();
    await first.ctl.start();
    await first.ctl.begin();
    await spell(first.ctl, 'gear');
    fly(first.timers);
    await first.ctl.carryOn();
    await puttOut(first.ctl, first.timers);
    await flush();
    expect(first.ctl.getView().state.phase).toBe('sunk');
    const again = setup({ resumed: { state: first.session.saved, answered: 0 } });
    await again.ctl.start();
    expect(again.ctl.getView().state.phase).toBe('intro');
    expect(again.ctl.getView().state.turn).toBe(0);
    expect(again.session.finished).toBe(false);
  });

  it('reads the item from prompt fields only, and maps help kinds to hints', () => {
    const it = itemOf({ key: 'k', stepId: 's', activityId: 'a', concept: 'spelling', challenge: 'practice', prompt: { wordId: 'w-gear', length: 4, tiles: 'rgeasb', pattern: 'ea', patternAt: 1, syllables: 1 }, answer: { mode: 'text', maxLength: 12 } as never, options: [], item: { index: 0, count: 1 }, wrongTries: 0, help: null, helpShown: [], revealed: null });
    expect(it).toEqual(expect.objectContaining({ wordId: 'w-gear', length: 4, tiles: 'rgeasb', pattern: 'ea' }));
    expect(hintFor({ kind: 'showAnswer', revealed: 'gear', assistance: 'demonstrated' }, it, null, WG_COPY).kind).toBe('show');
    expect(hintFor({ kind: 'replayClue', revealed: null, assistance: 'clue' }, it, null, WG_COPY).kind).toBe('replay');
    expect(hintFor({ kind: 'revealPattern', revealed: null, assistance: 'guided' }, it, null, WG_COPY)).toEqual(expect.objectContaining({ kind: 'pattern', pattern: 'ea', at: 1 }));
    expect(hintFor({ kind: 'phonicsHint', revealed: null, assistance: 'verbalHint' }, it, CLUES['w-gear']!, WG_COPY)).toEqual(expect.objectContaining({ kind: 'phonics', text: CLUES['w-gear']!.phonics }));
  });
});
