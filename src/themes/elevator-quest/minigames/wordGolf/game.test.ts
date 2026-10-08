// Word Golf's pure state machine (game.ts): the order of things, the rules that protect the learner,
// and save / resume.
import { HOLES, geometryOf } from './course';
import {
  aimBy,
  addHint,
  alreadyEarned,
  closerOffer,
  moveCloser,
  fromSave,
  holesDone,
  newGame,
  nextHole,
  noteFor,
  notYet,
  place,
  presentWord,
  rollDone,
  setAim,
  setPower,
  shoot,
  spelled,
  takeBack,
  takeShot,
  toSave,
  undoTile,
  word,
  type GolfState,
} from './game';
import { angleTo, canRest, clearLine, distance, simulateShot } from './physics';
import { goodPutt, tilesFor } from './testPlay';

const spellGear = (s: GolfState) => {
  let t = presentWord(s, { key: 'k1', tiles: 'rgeasb', length: 4 });
  for (const id of tilesFor('rgeasb', 'gear')) t = place(t, id);
  return t;
};
const toAim = (s: GolfState) => takeShot(spelled(spellGear(s), 'gear', 'independent'));
const sink = (s: GolfState): GolfState => {
  let t = s;
  for (let i = 0; i < 4 && t.phase === 'aim'; i++) {
    const p = goodPutt(HOLES[t.hole]!, t.ball);
    t = rollDone(shoot(setPower(setAim(t, p.angle), p.power), HOLES), HOLES);
  }
  return t;
};

describe('Word Golf game', () => {
  it('runs intro, spell, earned, aim, rolling, sunk, in that order', () => {
    let s = newGame(HOLES);
    expect(s.phase).toBe('intro');
    expect(shoot(s, HOLES)).toBe(s);
    s = presentWord(s, { key: 'k1', tiles: 'rgeasb', length: 4 });
    expect(s.phase).toBe('spell');
    expect(word(s)).toBeNull();
    for (const id of tilesFor('rgeasb', 'gear')) s = place(s, id);
    expect(word(s)).toBe('gear');
    // A putt is earned only by a right answer, which the session gives.
    expect(takeShot(s)).toBe(s);
    s = spelled(s, 'gear', 'independent');
    expect(s.phase).toBe('earned');
    s = takeShot(s);
    expect(s.phase).toBe('aim');
    const p = goodPutt(HOLES[0]!, s.ball);
    s = shoot(setPower(setAim(s, p.angle), p.power), HOLES);
    expect(s.phase).toBe('rolling');
    expect(s.shot?.outcome).toBe('cup');
    s = rollDone(s, HOLES);
    expect(s.phase).toBe('sunk');
    expect(holesDone(s)).toBe(1);
  });

  it('a missed putt keeps the spelling: aim again from where the ball stopped, no new word', () => {
    let s = toAim(newGame(HOLES));
    s = setPower(setAim(s, -Math.PI / 2), 0.35); // straight up, soft: short and wide of hole 1
    s = shoot(s, HOLES);
    const rest = s.shot!.rest;
    expect(s.shot!.outcome).toBe('rest');
    s = rollDone(s, HOLES);
    expect(s.phase).toBe('aim');
    expect(s.ball).toEqual(rest);
    expect(s.shots).toBe(1);
    expect(s.words[0]).toBe('gear');
    expect(s.note).not.toBeNull();
    // Still no word to spell on this hole.
    expect(presentWord(s, { key: 'k2', tiles: 'abc', length: 3 })).toBe(s);
  });

  it('PUTT twice in a row plays one putt (rapid taps)', () => {
    const s = shoot(toAim(newGame(HOLES)), HOLES);
    expect(shoot(s, HOLES)).toBe(s);
    expect(s.shots).toBe(1);
  });

  it('aim and power only move while aiming, and stay in range', () => {
    let s = newGame(HOLES);
    expect(aimBy(s, 0.1)).toBe(s);
    s = toAim(s);
    s = setPower(s, 4);
    expect(s.power).toBe(1);
    s = setPower(s, -2);
    expect(s.power).toBeGreaterThan(0);
    s = aimBy(setAim(s, Math.PI), 0.2);
    expect(s.aim).toBeGreaterThan(-Math.PI);
    expect(s.aim).toBeLessThanOrEqual(Math.PI);
  });

  it('plays three holes, then a summary with the words spelled and no score', () => {
    let s = newGame(HOLES);
    for (let hole = 0; hole < 3; hole++) {
      expect(s.hole).toBe(hole);
      s = sink(toAim(s));
      if (hole < 2) {
        expect(s.phase).toBe('sunk');
        s = nextHole(s, HOLES);
        expect(s.phase).toBe('intro');
        expect(s.ball).toEqual(HOLES[hole + 1]!.tee);
      }
    }
    expect(s.phase).toBe('summary');
    expect(holesDone(s)).toBe(3);
    expect(s.words).toEqual(['gear', 'gear', 'gear']);
    expect(Object.keys(s)).not.toContain('score');
  });

  it('a misspelling keeps the letters and the cause the session named, until a letter changes', () => {
    let s = presentWord(newGame(HOLES), { key: 'k1', tiles: 'rgeasb', length: 4 });
    for (const id of tilesFor('rgeasb', 'gaer')) s = place(s, id);
    s = notYet(s, 'gaer', 'spelling.vowelTeam');
    expect(s.phase).toBe('spell');
    expect(s.feedback).toEqual({ attempt: 'gaer', cause: 'spelling.vowelTeam' });
    expect(word(s)).toBe('gaer');
    s = takeBack(s, 1);
    expect(s.feedback).toBeNull();
    expect(undoTile(newGame(HOLES)).phase).toBe('intro');
  });

  describe('MOVE CLOSER', () => {
    const missShort = (s: GolfState) => rollDone(shoot(setPower(setAim(s, angleTo(s.ball, HOLES[s.hole]!.cup)), 0.2), HOLES), HOLES);

    it('is offered only after three putts on the hole without the ball dropping', () => {
      let s = toAim(newGame(HOLES));
      expect(closerOffer(s, HOLES)).toBeNull();
      s = missShort(missShort(s));
      expect(s.shots).toBe(2);
      expect(closerOffer(s, HOLES)).toBeNull();
      expect(moveCloser(s, HOLES)).toBe(s);
      s = missShort(s);
      expect(s.phase).toBe('aim');
      expect(closerOffer(s, HOLES)).not.toBeNull();
    });

    it('puts the ball about a third of its distance from the cup, on a clear straight line; aim and power stay the learner\'s', () => {
      let s = toAim(newGame(HOLES));
      s = missShort(missShort(missShort(s)));
      const h = HOLES[0]!;
      const before = distance(s.ball, h.cup);
      const moved = moveCloser(s, HOLES);
      const after = distance(moved.ball, h.cup);
      expect(after).toBeCloseTo(Math.min(35, Math.max(12, before / 3)), 6);
      expect(canRest(moved.ball, geometryOf(h))).toBe(true);
      expect(clearLine(geometryOf(h), moved.ball, h.cup)).toBe(true);
      expect(moved.aim).toBe(s.aim);
      expect(moved.power).toBe(s.power);
      expect(moved.shots).toBe(s.shots);
      expect(moved.note).toBe('moved');
      // Not again until three more putts.
      expect(closerOffer(moved, HOLES)).toBeNull();
    });

    it('on hole 3 the spot is on the cup\'s side of the wall', () => {
      let s = toAim(newGame(HOLES));
      s = { ...s, hole: 2, ball: { ...HOLES[2]!.tee }, shots: 3, movedAt: null };
      const moved = moveCloser(s, HOLES);
      const g = geometryOf(HOLES[2]!);
      expect(moved.ball).not.toEqual(s.ball);
      expect(moved.ball.y).toBeLessThan(86);
      expect(clearLine(g, moved.ball, g.cup)).toBe(true);
    });

    it('is saved with the game', () => {
      let s = toAim(newGame(HOLES));
      s = moveCloser(missShort(missShort(missShort(s))), HOLES);
      const back = fromSave(JSON.parse(JSON.stringify(toSave(s, HOLES))), HOLES)!;
      expect(back.movedAt).toBe(3);
      expect(back.ball).toEqual(s.ball);
    });
  });

  it('SHOW ME marks the word as shown, and the putt is earned all the same', () => {
    let s = presentWord(newGame(HOLES), { key: 'k1', tiles: 'rgeasb', length: 4 });
    s = addHint(s, { kind: 'show', word: 'gear' });
    expect(s.shown).toBe(true);
    for (const id of tilesFor('rgeasb', 'gear')) s = place(s, id);
    s = spelled(s, 'gear', 'demonstrated');
    expect(s.phase).toBe('earned');
  });

  it('a fresh word (new key) starts a fresh tray; the same key keeps its hints', () => {
    let s = presentWord(newGame(HOLES), { key: 'k1', tiles: 'rgeasb', length: 4 });
    s = addHint(s, { kind: 'phonics', text: 'x' });
    s = place(s, 0);
    expect(presentWord(s, { key: 'k1', tiles: 'rgeasb', length: 4 })).toBe(s);
    const fresh = presentWord(s, { key: 'k2', tiles: 'tlobmk', length: 4 });
    expect(fresh.hints).toEqual([]);
    expect(fresh.tray?.slots.every((x) => x === null)).toBe(true);
  });

  it('describes a miss as short, too fast, or wide, never as a failure', () => {
    const h = HOLES[0]!;
    const g = geometryOf(h);
    const at = angleTo(h.tee, h.cup);
    expect(noteFor(simulateShot(g, h.tee, { angle: at, power: 0.3 }), h.tee, h.cup, at)).toBe('short');
    expect(noteFor(simulateShot(g, h.tee, { angle: at, power: 0.9 }), h.tee, h.cup, at)).toBe('tooFast');
    expect(noteFor(simulateShot(g, h.tee, { angle: at + 0.4, power: 0.55 }), h.tee, h.cup, at + 0.4)).toBe('wide');
  });

  describe('save and resume', () => {
    it('saves a putt in flight where it will stop, and resumes there', () => {
      let s = toAim(newGame(HOLES));
      s = shoot(setPower(setAim(s, -Math.PI / 2), 0.35), HOLES);
      const saved = toSave(s, HOLES);
      expect(saved.phase).toBe('aim');
      expect(saved.ball).toEqual(s.shot!.rest);
      const back = fromSave(JSON.parse(JSON.stringify(saved)), HOLES)!;
      expect(back.phase).toBe('aim');
      expect(back.ball).toEqual(s.shot!.rest);
      expect(back.shots).toBe(1);
      expect(back.words[0]).toBe('gear');
      expect(back.resumed).toBe(true);
    });

    it('a saved spelling restarts the word at the hole intro (letters placed are not an answer)', () => {
      const s = place(presentWord(newGame(HOLES), { key: 'k1', tiles: 'rgeasb', length: 4 }), 1);
      const back = fromSave(toSave(s, HOLES), HOLES)!;
      expect(back.phase).toBe('intro');
      expect(back.challengeKey).toBe('k1');
    });

    it('an unreadable or foreign save starts a new game; a ball that cannot rest goes back to the tee', () => {
      expect(fromSave(null, HOLES)).toBeNull();
      expect(fromSave({ v: 9 }, HOLES)).toBeNull();
      expect(fromSave({ ...toSave(newGame(HOLES), HOLES), hole: 7 }, HOLES)).toBeNull();
      const s = toSave(toAim(newGame(HOLES)), HOLES);
      const back = fromSave({ ...s, ball: { x: -40, y: 900 }, shots: 2 }, HOLES)!;
      expect(back.ball).toEqual(HOLES[0]!.tee);
      expect(back.shots).toBe(0);
      expect(canRest(back.ball, geometryOf(HOLES[0]!))).toBe(true);
    });

    it('a word already answered is never asked again', () => {
      const s = alreadyEarned(newGame(HOLES));
      expect(s.phase).toBe('earned');
      expect(alreadyEarned(toAim(newGame(HOLES))).phase).toBe('aim');
    });
  });
});
