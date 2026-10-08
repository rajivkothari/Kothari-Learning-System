// Word Golf's controller against the mock session (headless, fake timers): what reaches the session,
// when, and what the learner sees. Evidence comes only from submit; golf never reaches the session.
import type { MiniGameSound } from '../types';
import { HOLES } from './course';
import { WG_COPY } from './copy';
import type { WordClue } from './clues';
import { SETTLE_MS, createWordGolf, hintFor, itemOf, type Timers, type WordGolfController } from './controller';
import { pathSeconds } from './physics';
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
  const session = wordGolfMock(opts);
  const sound = recordingSound();
  const timers = fakeTimers();
  const ctl = createWordGolf({ session, sound, holes: HOLES, copy: WG_COPY, clues: (id) => CLUES[id] ?? null, timers, reducedMotion: Boolean(opts.reduced) });
  return { session, sound, timers, ctl };
}

const submits = (s: ReturnType<typeof wordGolfMock>) => s.calls.filter((c) => c.method === 'submit');

async function spell(ctl: WordGolfController, w: string) {
  const item = ctl.getView().item!;
  for (const id of tilesFor(item.tiles, w)) ctl.place(id);
  await ctl.check();
  await flush();
}

/** Putt until the ball drops (or `max` putts), running the playback timers. */
async function putt(ctl: WordGolfController, timers: ReturnType<typeof fakeTimers>, max = 4) {
  for (let i = 0; i < max && ctl.getView().state.phase === 'aim'; i++) {
    const s = ctl.getView().state;
    const p = goodPutt(HOLES[s.hole]!, s.ball);
    ctl.setAim(p.angle);
    ctl.setPower(p.power);
    ctl.shoot();
    timers.advance(10_000);
    await flush();
  }
}

describe('Word Golf controller', () => {
  it('plays a whole course: three words, three holes, a summary, then finish', async () => {
    const { session, ctl, timers, sound } = setup();
    await ctl.start();
    for (let hole = 0; hole < 3; hole++) {
      if (hole === 0) {
        expect(ctl.getView().state.phase).toBe('intro');
        await ctl.begin();
      }
      expect(ctl.getView().state.phase).toBe('spell');
      expect(ctl.getView().item?.wordId).toBe(TEST_WORDS[hole]!.wordId);
      await spell(ctl, TEST_WORDS[hole]!.word);
      expect(ctl.getView().state.phase).toBe('earned');
      ctl.takeShot();
      await putt(ctl, timers);
      if (hole < 2) {
        expect(ctl.getView().state.phase).toBe('sunk');
        // NEXT HOLE leads straight to the next word: no card to tap through between holes.
        await ctl.nextHole();
        expect(ctl.getView().state.phase).toBe('spell');
      }
    }
    await flush();
    expect(ctl.getView().state.phase).toBe('summary');
    expect(ctl.getView().state.words).toEqual(['gear', 'bolt', 'cable']);
    expect(session.finished).toBe(true);
    expect(ctl.getView().finished).toBe(true);
    // Exactly one submit per word and three right answers recorded, all independent.
    expect(submits(session)).toHaveLength(3);
    expect(session.recorded.map((r) => r.evidence)).toEqual(['independent', 'independent', 'independent']);
    expect(sound.log).toEqual(expect.arrayContaining(['play:tilePlace', 'play:golfHit', 'loop:golfRoll:on', 'play:golfCup', 'play:holeComplete', 'loop:golfRoll:off']));
  });

  it('golf never reaches the session: putts, misses and aiming add no submit, help or record', async () => {
    const { session, ctl, timers } = setup();
    await ctl.start();
    await ctl.begin();
    await spell(ctl, 'gear');
    ctl.takeShot();
    const before = session.calls.filter((c) => c.method !== 'saveGame').length;
    ctl.aimLeft();
    ctl.aimRight();
    ctl.morePower();
    ctl.lessPower();
    ctl.setAim(-Math.PI / 2);
    ctl.setPower(0.3);
    ctl.shoot(); // straight and soft: misses hole 1
    timers.advance(10_000);
    await flush();
    expect(ctl.getView().state.phase).toBe('aim');
    ctl.shoot();
    timers.advance(10_000);
    await flush();
    expect(session.calls.filter((c) => c.method !== 'saveGame')).toHaveLength(before);
    expect(session.recorded).toHaveLength(1);
  });

  it('a missed putt never undoes the spelling: the next putt is from where the ball stopped', async () => {
    const { ctl, timers } = setup();
    await ctl.start();
    await ctl.begin();
    await spell(ctl, 'gear');
    ctl.takeShot();
    ctl.setAim(-Math.PI / 2);
    ctl.setPower(0.35);
    ctl.shoot();
    const rest = ctl.getView().state.shot!.rest;
    timers.advance(10_000);
    await flush();
    const s = ctl.getView().state;
    expect(s.phase).toBe('aim');
    expect(s.ball).toEqual(rest);
    expect(s.words[0]).toBe('gear');
    expect(ctl.getView().item).toBeNull();
  });

  it('a misspelling stays on the word, says so gently, and is recorded as one miss', async () => {
    const { session, ctl, sound } = setup();
    await ctl.start();
    await ctl.begin();
    await spell(ctl, 'gaer');
    const v = ctl.getView();
    expect(v.state.phase).toBe('spell');
    expect(v.state.feedback?.attempt).toBe('gaer');
    expect(sound.log).toContain('play:answerWrong');
    expect(sound.log).not.toContain('play:answerRight');
    expect(session.recorded).toHaveLength(0); // the mock records a miss only when the item is replaced
    expect(submits(session)).toHaveLength(1);
    // Put it right: take two letters back and place them in order.
    ctl.clear();
    await spell(ctl, 'gear');
    expect(ctl.getView().state.phase).toBe('earned');
    expect(session.recorded[0]!.evidence).toBe('retry');
  });

  it('after a miss, the cause the session named is kept for the card (the content line); nothing compares letters', async () => {
    const { session, ctl } = setup();
    await ctl.start();
    await ctl.begin();
    // 'gaer' is the mock's tagged misspelling of 'gear'.
    await spell(ctl, 'gaer');
    const f = ctl.getView().state.feedback!;
    expect(f).toEqual({ attempt: 'gaer', cause: 'spelling.letterOrder' });
    expect(WG_COPY.causeLine(f.cause)).not.toBeNull();
    expect(session.recorded).toHaveLength(0);
    ctl.takeBack(1);
    expect(ctl.getView().state.feedback).toBeNull();
  });

  it('MOVE CLOSER after three putts: the ball is placed, nothing reaches the session, the next putt is the learner\'s', async () => {
    const { session, ctl, timers } = setup();
    await ctl.start();
    await ctl.begin();
    await spell(ctl, 'gear');
    ctl.takeShot();
    for (let i = 0; i < 3; i++) {
      expect(ctl.getView().closer).toBe(false);
      ctl.setAim(-Math.PI / 2);
      ctl.setPower(0.2);
      ctl.shoot();
      timers.advance(10_000);
      await flush();
    }
    expect(ctl.getView().state.phase).toBe('aim');
    expect(ctl.getView().closer).toBe(true);
    const calls = session.calls.filter((c) => c.method !== 'saveGame').length;
    const before = ctl.getView().state.ball;
    ctl.moveCloser();
    ctl.moveCloser();
    await flush();
    const s = ctl.getView().state;
    expect(s.ball).not.toEqual(before);
    expect(s.note).toBe('moved');
    expect(s.shots).toBe(3);
    expect(s.phase).toBe('aim');
    expect(ctl.getView().closer).toBe(false);
    expect(session.calls.filter((c) => c.method !== 'saveGame')).toHaveLength(calls);
    expect(session.recorded.map((r) => r.evidence)).toEqual(['independent']);
    expect((session.saved as { ball: unknown; movedAt: number }).movedAt).toBe(3);
  });

  it('after several misses a fresh word replaces the old one, with a fresh tray', async () => {
    const { ctl } = setup({ freshAfter: 2 });
    await ctl.start();
    await ctl.begin();
    const key = ctl.getView().item!.key;
    await spell(ctl, 'gaer');
    ctl.clear();
    await spell(ctl, 'rgae');
    const v = ctl.getView();
    expect(v.state.phase).toBe('spell');
    expect(v.item!.key).not.toBe(key);
    expect(v.freshWord).toBe(true);
    expect(v.state.tray!.slots.every((x) => x === null)).toBe(true);
  });

  it('the help ladder: replay (narration), a sound hint, the pattern, then SHOW ME, still earning the putt', async () => {
    const { session, ctl, sound } = setup();
    await ctl.start();
    await ctl.begin();
    expect(ctl.getView().item?.help?.kind).toBe('help');
    const said = sound.log.filter((l) => l === 'say:word.w-gear').length;
    await ctl.help();
    expect(sound.log.filter((l) => l === 'say:word.w-gear')).toHaveLength(said + 1);
    expect(ctl.getView().state.hints.map((h) => h.kind)).toEqual(['replay']);
    await ctl.help();
    expect(ctl.getView().state.hints.find((h) => h.kind === 'phonics')).toMatchObject({ kind: 'phonics', text: 'g, then the ee sound, then r' });
    await ctl.help();
    expect(ctl.getView().state.hints.find((h) => h.kind === 'pattern')).toMatchObject({ kind: 'pattern', pattern: 'ea', at: 1 });
    expect(ctl.getView().item?.help?.kind).toBe('show');
    await ctl.help();
    expect(ctl.getView().state.hints.find((h) => h.kind === 'show')).toMatchObject({ kind: 'show', word: 'gear' });
    expect(ctl.getView().item?.help).toBeNull();
    await spell(ctl, 'gear');
    expect(ctl.getView().state.phase).toBe('earned');
    expect(ctl.getView().state.shown).toBe(true);
    expect(session.recorded[0]!.evidence).toBe('demonstrated');
    expect(session.calls.filter((c) => c.method === 'help')).toHaveLength(4);
  });

  it('a right answer after a sound hint is recorded with that help, never as independent', async () => {
    const { session, ctl } = setup();
    await ctl.start();
    await ctl.begin();
    await ctl.help();
    await ctl.help();
    await spell(ctl, 'gear');
    expect(session.recorded[0]!.evidence).not.toBe('independent');
  });

  it('HEAR IT says the word and nothing reaches the session', async () => {
    const { session, ctl, sound } = setup();
    await ctl.start();
    await ctl.begin();
    // The word is said once as it appears, then again at each HEAR IT.
    expect(sound.log.filter((l) => l === 'say:word.w-gear')).toHaveLength(1);
    const calls = session.calls.length;
    ctl.hear();
    ctl.hear();
    expect(sound.log.filter((l) => l === 'say:word.w-gear')).toHaveLength(3);
    expect(session.calls).toHaveLength(calls);
    expect(ctl.getView().canHear).toBe(true);
  });

  it('rapid taps: CHECK twice sends one answer; PUTT twice plays one putt; a used tile places once', async () => {
    const { session, ctl, timers, sound } = setup({ latencyMs: 30 });
    await ctl.start();
    await ctl.begin();
    ctl.place(0);
    ctl.place(0);
    expect(sound.log.filter((l) => l === 'play:tilePlace')).toHaveLength(1);
    ctl.clear();
    for (const id of tilesFor(ctl.getView().item!.tiles, 'gear')) ctl.place(id);
    jest.useFakeTimers();
    const a = ctl.check();
    const b = ctl.check();
    expect(ctl.getView().busy).toBe(true);
    // Tiles and help wait while the answer is in flight.
    ctl.undo();
    expect(ctl.getView().state.tray!.slots.every((x) => x !== null)).toBe(true);
    jest.advanceTimersByTime(50);
    await Promise.all([a, b]);
    jest.useRealTimers();
    expect(submits(session)).toHaveLength(1);
    ctl.takeShot();
    ctl.shoot();
    ctl.shoot();
    expect(ctl.getView().rollSeq).toBe(1);
    expect(ctl.getView().state.shots).toBe(1);
    timers.advance(10_000);
  });

  it('times the playback by the path: the scene settles a moment later, none under Reduced Motion', async () => {
    for (const reduced of [false, true]) {
      const { ctl, timers } = setup({ reduced });
      await ctl.start();
      await ctl.begin();
      await spell(ctl, 'gear');
      ctl.takeShot();
      ctl.setAim(-Math.PI / 2);
      ctl.setPower(0.35);
      ctl.shoot();
      const ms = pathSeconds(ctl.getView().state.shot!) * 1000;
      timers.advance(ms - 1);
      expect(ctl.getView().state.phase).toBe('rolling');
      timers.advance(1 + (reduced ? SETTLE_MS.reduced : SETTLE_MS.normal));
      expect(ctl.getView().state.phase).toBe('aim');
    }
  });

  it('saves every step that matters, and resumes mid-hole where the ball stopped', async () => {
    const first = setup();
    await first.ctl.start();
    await first.ctl.begin();
    await spell(first.ctl, 'gear');
    first.ctl.takeShot();
    first.ctl.setAim(-Math.PI / 2);
    first.ctl.setPower(0.35);
    first.ctl.shoot();
    const rest = first.ctl.getView().state.shot!.rest;
    await flush();
    // The app stops mid-roll: the save already has the ball where it stops.
    const saved = first.session.saved as { phase: string; ball: unknown; hole: number };
    expect(saved.phase).toBe('aim');
    expect(saved.ball).toEqual(rest);

    const again = setup({ resumed: { state: saved, solved: 1 } });
    await again.ctl.start();
    const s = again.ctl.getView().state;
    expect(s.phase).toBe('aim');
    expect(s.ball).toEqual(rest);
    expect(s.resumed).toBe(true);
    expect(s.words[0]).toBe('gear');
    expect(submits(again.session)).toHaveLength(0);
  });

  it('a word the session already holds as answered is not asked again after a restart', async () => {
    // The answer was committed but the save still says "spelling" (the app stopped in between).
    const { ctl, session } = setup({ resumed: { state: { v: 1, game: 'word-golf', hole: 0, phase: 'spell', ball: HOLES[0]!.tee, aim: -1.57, power: 0.5, lastPower: null, shots: 0, note: null, words: [null, null, null], challengeKey: null, hints: [], shown: false }, solved: 1 } });
    await ctl.start();
    expect(ctl.getView().state.phase).toBe('earned');
    expect(submits(session)).toHaveLength(0);
  });

  it('suspend mid-roll ends the putt quietly and saves; exit saves before leaving', async () => {
    const { ctl, sound, session } = setup();
    await ctl.start();
    await ctl.begin();
    await spell(ctl, 'gear');
    ctl.takeShot();
    ctl.setAim(-Math.PI / 2);
    ctl.setPower(0.35);
    ctl.shoot();
    ctl.suspend();
    expect(ctl.getView().state.phase).toBe('aim');
    expect(sound.log).toContain('loop:golfRoll:off');
    const onExit = jest.fn();
    await ctl.exit(onExit);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect((session.saved as { phase: string }).phase).toBe('aim');
  });

  it('reads the item from the prompt only, and maps help kinds to what the game shows', () => {
    const it = itemOf({ key: 'k', stepId: 's', activityId: 'a', concept: 'spelling', challenge: 'practice', prompt: { wordId: 'w1', length: 4, tiles: 'abcdxy', pattern: 'sh', patternAt: 0, syllables: 1 }, answer: { mode: 'choice' }, options: [], item: { index: 0, count: 1 }, wrongTries: 0, help: { stepId: 'x', kind: 'showAnswer', assistance: 'demonstrated', offered: false }, helpShown: [], revealed: null })!;
    expect(it).toMatchObject({ wordId: 'w1', length: 4, pattern: 'sh', patternAt: 0, help: { kind: 'show', offered: false } });
    expect(hintFor({ kind: 'showAnswer', assistance: 'demonstrated', revealed: 'Ship' }, it, null, WG_COPY)).toEqual({ kind: 'show', word: 'ship', line: WG_COPY.helpLine('showAnswer') });
    expect(hintFor({ kind: 'replayClue', assistance: 'clue', revealed: null }, it, null, WG_COPY)).toEqual({ kind: 'replay' });
    expect(hintFor({ kind: 'syllableHint', assistance: 'verbalHint', revealed: null }, it, null, WG_COPY)).toEqual({ kind: 'phonics', text: 'Beats in this word: 1.' });
    expect(hintFor({ kind: 'revealPattern', assistance: 'guided', revealed: null }, it, null, WG_COPY)).toEqual({ kind: 'pattern', pattern: 'sh', at: 0, line: WG_COPY.helpLine('revealPattern') });
    expect(hintFor({ kind: 'mystery', assistance: 'clue', revealed: null }, null, null, WG_COPY).kind).toBe('phonics');
  });
});
