// Word Golf's pure state machine (game.ts, D197): the order of things, the rules that protect the
// learner (a word not right is no shot, help still flies, golf never judges), and save / resume.
import { holeFor } from './course';
import { puttGreen, puttable } from './fairway';
import {
  SAVE_VERSION,
  carryOn,
  changeTarget,
  chooseTarget,
  closerOffer,
  fromSave,
  landed,
  moveCloser,
  newHole,
  notYet,
  place,
  presentWord,
  putt,
  puttDone,
  setAim,
  setPower,
  swing,
  toSave,
  word,
  type GolfState,
} from './game';
import { CLOSER, angleTo } from './physics';
import { goodPutt, tilesFor } from './testPlay';

const H1 = holeFor('word-golf');
const H4 = holeFor('word-golf-4');
const H5 = holeFor('word-golf-5');
const H7 = holeFor('word-golf-7');

const gear = { key: 'k1', tiles: 'rgeasb', length: 4 };
const spellIn = (s: GolfState, tiles: string, w: string) => tilesFor(tiles, w).reduce((t, id) => place(t, id), s);

/** Begin a hole's turn with a word on the card, the target picked when there is a choice. */
function ready(hole = H1, target?: string, s = newHole(hole)): GolfState {
  let t = presentWord(hole, s, { ...gear, key: `k${s.turn}` });
  if (target) t = chooseTarget(hole, t, target);
  return spellIn(t, gear.tiles, 'gear');
}

/** A whole turn: the word right with this evidence, the flight played, the result shown. */
const turn = (hole: typeof H1, s: GolfState, evidence = 'independent', target?: string, w = 'gear') => landed(hole, swing(hole, ready(hole, target, s), w, evidence));

describe('Word Golf game (D197)', () => {
  it('a new hole starts at the tee with nothing spelled', () => {
    const s = newHole(H4);
    expect(s).toEqual(expect.objectContaining({ phase: 'intro', turn: 0, lie: 'tee', strokes: 0, words: [] }));
    expect(s.ball).toEqual(H4.tee);
  });

  it('a turn with one target opens the spelling; a choice opens PICK YOUR SHOT, and CHANGE SHOT goes back', () => {
    expect(presentWord(H1, newHole(H1), gear)).toEqual(expect.objectContaining({ phase: 'spell', target: 'green', letters: 4 }));
    const t = presentWord(H4, newHole(H4), gear);
    expect(t.phase).toBe('target');
    expect(chooseTarget(H4, t, 'nowhere')).toBe(t);
    const picked = chooseTarget(H4, t, 'over-sand');
    expect(picked).toEqual(expect.objectContaining({ phase: 'spell', target: 'over-sand' }));
    expect(changeTarget(H4, picked).phase).toBe('target');
    // One target: nothing to change.
    const single = presentWord(H1, newHole(H1), gear);
    expect(changeTarget(H1, single)).toBe(single);
  });

  it('a word not right yet is no shot and no penalty: it stays on the card', () => {
    const s = ready();
    expect(word(s)).toBe('gear');
    const n = notYet(s, 'gaer', 'spelling.letterOrder');
    expect(n).toEqual(expect.objectContaining({ phase: 'spell', strokes: 0, words: [] }));
    expect(n.feedback).toEqual({ attempt: 'gaer', cause: 'spelling.letterOrder' });
  });

  it('the evidence sets the quality: first try power, retries good, any help steady (and SHOW ME is steady)', () => {
    expect(swing(H1, ready(), 'gear', 'independent').report?.quality).toBe('power');
    expect(swing(H1, ready(), 'gear', 'retry').report?.quality).toBe('good');
    for (const e of ['clue', 'verbalHint', 'guided', 'demonstrated']) expect(swing(H1, ready(), 'gear', e).report?.quality).toBe('steady');
    const shown = { ...ready(), shown: true };
    expect(swing(H1, shown, 'gear', 'independent').report?.quality).toBe('steady');
  });

  it('every right word is a shot that flies (assisted too); one stroke per word', () => {
    for (const e of ['independent', 'retry', 'demonstrated']) {
      const s = swing(H1, ready(), 'gear', e);
      expect(s.phase).toBe('flight');
      expect(s.strokes).toBe(1);
      expect(s.words).toEqual(['gear']);
      // A second swing for the same word does nothing.
      expect(swing(H1, s, 'gear', e)).toBe(s);
    }
  });

  it('the bold target: carried by power and good shots, short (into the sand) on a steady one', () => {
    expect(turn(H4, newHole(H4), 'independent', 'over-sand').report).toEqual(expect.objectContaining({ carried: true, lie: 'fairway' }));
    expect(turn(H4, newHole(H4), 'retry', 'over-sand').report).toEqual(expect.objectContaining({ carried: true, lie: 'fairway' }));
    const sand = turn(H4, newHole(H4), 'guided', 'over-sand');
    expect(sand.report).toEqual(expect.objectContaining({ carried: false, lie: 'bunker' }));
    // From the sand a word spelled first try still earned power: it plays as a splash shot, and the
    // report keeps both (the card names the shot by the spelling, never as helped).
    const out = swing(H4, ready(H4, undefined, carryOn(H4, sand)), 'gear', 'independent');
    expect(out.report).toEqual(expect.objectContaining({ earned: 'power', quality: 'steady', from: 'bunker' }));
    // The safe target is always reached.
    for (const e of ['independent', 'retry', 'guided']) expect(turn(H4, newHole(H4), e, 'short-of-sand').lie).toBe('fairway');
  });

  it('a golden word (the hole\'s sound) rolls nearer and names the sound; family holes name the family', () => {
    const golden = H5.golden![0]!;
    const w = `${golden}ip`;
    const s = swing(H5, ready(H5), w, 'retry');
    expect(s.report).toEqual(expect.objectContaining({ golden: true, sound: golden }));
    expect(swing(H5, ready(H5), 'gear', 'retry').report?.golden).toBe(false);
    expect(swing(H7, ready(H7), 'cat', 'independent', 'at').report?.rime).toBe('at');
    // Not a family hole: no family line.
    expect(swing(H1, ready(), 'gear', 'independent', 'ea').report?.rime).toBeNull();
  });

  it('after the last word the ball is on the green, puttable, and putting starts at it', () => {
    let s = turn(H4, newHole(H4), 'independent', 'over-sand');
    expect(s.phase).toBe('result');
    s = carryOn(H4, s);
    expect(s.phase).toBe('intro');
    s = turn(H4, s, 'demonstrated');
    expect(s.lie).toBe('green');
    expect(puttable(H4, s.ball)).toBe(true);
    s = carryOn(H4, s);
    expect(s.phase).toBe('aim');
    expect(s.putting?.ball).toEqual(puttGreen(H4, s.ball).tee);
  });

  it('a putt is deterministic; a miss aims again from where it stopped (no word); a drop sinks the hole', () => {
    const on = carryOn(H1, turn(H1, newHole(H1)));
    const g = puttGreen(H1, on.ball);
    const away = setPower(setAim(on, angleTo(g.cup, on.putting!.ball)), 0.15);
    const a = putt(H1, away);
    const b = putt(H1, away);
    expect(a.putting?.shot).toEqual(b.putting?.shot);
    expect(a.strokes).toBe(2);
    const missed = puttDone(H1, a);
    expect(missed.phase).toBe('aim');
    expect(missed.putting?.note).not.toBeNull();
    expect(missed.words).toEqual(['gear']);
    const good = goodPutt(g, missed.putting!.ball);
    const sunk = puttDone(H1, putt(H1, setPower(setAim(missed, good.angle), good.power)));
    expect(['sunk', 'aim']).toContain(sunk.phase);
  });

  it('MOVE CLOSER is offered after a few putts, and moves the ball without a stroke', () => {
    let s = carryOn(H1, turn(H1, newHole(H1)));
    expect(closerOffer(H1, s)).toBeNull();
    for (let i = 0; i < CLOSER.after; i++) {
      const g = puttGreen(H1, s.ball);
      s = puttDone(H1, putt(H1, setPower(setAim(s, angleTo(g.cup, s.putting!.ball)), 0.12)));
    }
    expect(closerOffer(H1, s)).not.toBeNull();
    const strokes = s.strokes;
    const moved = moveCloser(H1, s);
    expect(moved.putting?.note).toBe('moved');
    expect(moved.strokes).toBe(strokes);
  });

  describe('save and resume (gameplay only)', () => {
    it('a turn in progress comes back at its intro with its target; the tray is never saved', () => {
      const s = ready(H4, 'over-sand');
      const back = fromSave(JSON.parse(JSON.stringify(toSave(H4, s))), H4)!;
      expect(back).toEqual(expect.objectContaining({ phase: 'intro', turn: 0, target: 'over-sand', tray: null, resumed: true }));
    });

    it('a flight in progress is saved where it lands; a putt in progress where it stops', () => {
      const flying = swing(H4, ready(H4, 'over-sand'), 'gear', 'independent');
      const saved = toSave(H4, flying);
      expect(saved.phase).toBe('result');
      expect(saved.turn).toBe(1);
      expect(saved.ball).toEqual(flying.flight!.rest);
      const on = carryOn(H1, turn(H1, newHole(H1)));
      const rolling = putt(H1, setPower(on, 0.2));
      const p = toSave(H1, rolling);
      expect(['aim', 'sunk']).toContain(p.phase);
      expect(p.putting?.shots).toBe(1);
    });

    it('putting comes back as it was', () => {
      const on = carryOn(H1, turn(H1, newHole(H1)));
      const back = fromSave(toSave(H1, on), H1)!;
      expect(back.phase).toBe('aim');
      expect(back.putting?.ball).toEqual(on.putting?.ball);
    });

    it('refuses an unreadable save, another hole\'s, and the old three-hole course (v1)', () => {
      const s = toSave(H4, ready(H4, 'over-sand'));
      expect(SAVE_VERSION).toBe(2);
      expect(fromSave(s, H1)).toBeNull();
      expect(fromSave({ ...s, v: 1 }, H4)).toBeNull();
      expect(fromSave({ v: 1, game: 'word-golf', hole: 0, phase: 'aim' }, H1)).toBeNull();
      expect(fromSave('garbage', H4)).toBeNull();
      expect(fromSave({ ...s, ball: { x: -50, y: -50 } }, H4)).toBeNull();
    });
  });
});
