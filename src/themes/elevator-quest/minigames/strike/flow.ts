// Strike Lab V0.1: one bowling round of three short frames. Pure (no React), clock passed in, so a
// whole round plays headless in tests over the real runtime.
//
//   intro    START (also after coming back: the round waits for the child)
//   puzzle   frame 1: the Smart Ball needs N power and has P; pick the module that fills the gap.
//            frame 2: make T with two numbered pins; tap two pins. The committed choice is the ONLY
//            evidence (session.submit). A right answer powers the ball (frame 1) or lights the two
//            target pins (frame 2) and unlocks the controls.
//   aim      aim, power and spin; BOWL
//   rolling  the screen plays the roll (lane.ts simulates it); settle() reads the result
//   result   strike, spare, pins down, target pins hit or still up. A first ball that leaves pins
//            goes straight back to aim for the second; a finished frame offers BOWL AGAIN (a fresh
//            rack, nothing asked again) and NEXT FRAME.
//   done     the round is over; the mission closes. PLAY AGAIN starts a new round.
//
// Frame 3 is the Bowling Lab: no question, bowl as often as you like, FINISH ends the round.
//
// Never evidence: aim, power, spin, the roll, pins down, strikes and spares, retries, BOWL AGAIN.
// A target pin missed after a right answer is a bowling miss, not a math miss: the frame offers
// another ball and the answer stays answered.
//
// Notes (session.saveNotes): a local developer playtest tally across rounds; never evidence.
import { fill } from '../../../content/missionCopy';
import { STRIKE, type StrikeCopy } from '../../content/minigames';
import type { ChallengeView, HelpOffer, MiniGameSession, MiniGameSound } from '../types';
import { STRAIGHT, rack, simulate, type RackKind, type Roll, type Shot } from './lane';

export type Stage = 'loading' | 'intro' | 'puzzle' | 'aim' | 'rolling' | 'result' | 'done' | 'unsupported';
export type LineKey = keyof StrikeCopy['lines'];
export type Frame = 1 | 2 | 3;
export type Outcome = 'strike' | 'spare' | 'count' | 'gutter' | 'targetHit' | 'targetOne' | 'targetMiss';

export interface SmartTask {
  kind: 'smart';
  key: string;
  needed: number;
  present: number;
  options: { id: string; value: number }[];
}
export interface TargetTask {
  kind: 'target';
  key: string;
  target: number;
  /** The number on each pin of the five-pin rack, by rack position. */
  pins: number[];
  /** Every pair of pins is an option ("4+5", low first). */
  options: { id: string; value: string }[];
}
export type Task = SmartTask | TargetTask;

export interface Notes {
  v: 1;
  /** Rounds started fresh, and come back to. */
  rounds: number;
  resumes: number;
  completed: number;
  /** PLAY AGAIN taps: the round's main question (does the child want another one?). */
  again: number;
  exits: number;
  bowls: number;
  labBowls: number;
  /** BOWL AGAIN on a finished frame (a fresh rack, nothing asked again). */
  frameRetries: number;
  strikes: number;
  help: number;
  attempts: number;
  wrong: number;
  ms: number;
}
const NO_NOTES: Notes = { v: 1, rounds: 0, resumes: 0, completed: 0, again: 0, exits: 0, bowls: 0, labBowls: 0, frameRetries: 0, strikes: 0, help: 0, attempts: 0, wrong: 0, ms: 0 };

export interface StrikeView {
  stage: Stage;
  frame: Frame;
  task: Task | null;
  /** The frame's puzzle is answered (frame 1: the ball is powered; frame 2: the targets are lit). */
  solved: boolean;
  tried: string[];
  help: HelpOffer | null;
  hint: { kind: string; revealed: number | string | null } | null;
  /** Frame 2: pins picked so far (rack positions), and the lit target pins once solved. */
  picked: number[];
  targets: number[];
  shot: Shot;
  /** 1 or 2: which ball of the frame. */
  ball: 1 | 2;
  standing: boolean[];
  roll: Roll | null;
  /** The last roll played, kept across BOWL AGAIN so the screen can draw its path faintly to compare. */
  trail: Roll | null;
  /** Bumped on every BOWL, so the screen replays from the start. */
  rollSeq: number;
  outcome: Outcome | null;
  /** Pins down on the last ball. */
  lastDown: number;
  frameOver: boolean;
  totals: { pins: number; strikes: number; spares: number };
  line: { key: LineKey; vars: Record<string, string | number> };
  busy: boolean;
  notes: Notes;
}

interface Saved {
  v: 1;
  frame: Frame;
  task: Task | null;
  tried: string[];
  totals: StrikeView['totals'];
}

export interface StrikeFlow {
  view(): StrikeView;
  subscribe(l: () => void): () => void;
  start(now: number): Promise<void>;
  begin(): void;
  /** Frame 1: install a module (the committed answer). */
  choose(optionId: string): Promise<void>;
  /** Frame 2: tap a pin (rack position). The second pin commits the pair. */
  pickPin(position: number): Promise<void>;
  hint(): Promise<void>;
  setShot(patch: Partial<Shot>): void;
  bowl(): void;
  /** The roll has played (or Reduced Motion skipped it): read the pins and show the result. */
  settle(): void;
  /** After a first ball's result has been seen: on to the second ball (the screen calls it after a beat). */
  ready(): void;
  bowlAgain(): void;
  nextFrame(now: number): Promise<void>;
  /** PLAY AGAIN on the done card: tallied; the screen then asks the host for a new round. */
  again(): Promise<void>;
  pause(): void;
  leave(now: number): Promise<void>;
  dispose(): void;
}

const FRAME_OF: Record<string, 1 | 2> = { 'power-cells.fill': 1, 'pairs.make-target': 2 };

export const rackKind = (frame: Frame): RackKind => (frame === 2 ? 'five' : 'ten');
const fullRack = (frame: Frame) => rack(rackKind(frame)).map(() => true);

export function lineText(line: StrikeView['line'], copy: StrikeCopy = STRIKE): string {
  return fill(copy.lines[line.key], line.vars);
}

/** The pair's two numbers from "4+5". */
export function pairParts(value: string): [number, number] | null {
  const m = /^(\d+)\+(\d+)$/.exec(value);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** A stable order of the pins on the rack for an item (so the right pair is not always in front). */
function placePins(nums: number[], key: string): number[] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const order = [...nums];
  for (let i = order.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export function taskOf(c: ChallengeView): Task | null {
  const frame = FRAME_OF[c.activityId];
  if (!frame || c.answer.mode !== 'choice' || c.options.length < 2) return null;
  const p = c.prompt;
  const num = (x: unknown) => (typeof x === 'number' ? x : 0);
  if (frame === 1) return { kind: 'smart', key: c.key, needed: num(p.capacity), present: num(p.aboard), options: c.options.map((o) => ({ id: o.id, value: Number(o.value) })) };
  const count = num(p.count);
  const nums = Array.from({ length: count }, (_, i) => num(p[`n${i + 1}`]));
  if (count !== 5) return null;
  return { kind: 'target', key: c.key, target: num(p.target), pins: placePins(nums, c.key), options: c.options.map((o) => ({ id: o.id, value: String(o.value) })) };
}

export const taskLine = (t: Task): StrikeView['line'] => (t.kind === 'smart' ? { key: 'smartAsk', vars: { needed: t.needed, present: t.present } } : { key: 'targetAsk', vars: { target: t.target } });

/** The rack positions of a pair's two pins. */
export function pinsOfPair(t: TargetTask, value: string): number[] {
  const parts = pairParts(value);
  if (!parts) return [];
  const a = t.pins.indexOf(parts[0]);
  const b = t.pins.indexOf(parts[1]);
  return a >= 0 && b >= 0 ? [a, b] : [];
}

export function createStrikeFlow(opts: { session: MiniGameSession; sound: MiniGameSound; log?: (event: string, data?: Record<string, unknown>) => void }): StrikeFlow {
  const { session, sound } = opts;
  const log = opts.log ?? (() => undefined);
  const listeners = new Set<() => void>();
  let disposed = false;
  let enteredAt = 0;
  /** A right answer held from before a restart: played as ready-to-bowl at START. */
  let pending: { frame: Frame; task: Task | null; answer: number | string | null } | null = null;
  let v: StrikeView = {
    stage: 'loading',
    frame: 1,
    task: null,
    solved: false,
    tried: [],
    help: null,
    hint: null,
    picked: [],
    targets: [],
    shot: { ...STRAIGHT },
    ball: 1,
    standing: fullRack(1),
    roll: null,
    trail: null,
    rollSeq: 0,
    outcome: null,
    lastDown: 0,
    frameOver: false,
    totals: { pins: 0, strikes: 0, spares: 0 },
    line: { key: 'intro', vars: {} },
    busy: false,
    notes: { ...NO_NOTES },
  };
  const set = (patch: Partial<StrikeView>) => {
    v = { ...v, ...patch };
    if (!disposed) for (const l of [...listeners]) l();
  };

  const persist = async () => {
    if (disposed) return;
    const saved: Saved = { v: 1, frame: v.frame, task: v.task, tried: v.tried, totals: v.totals };
    try {
      await session.saveGame(saved);
    } catch (e) {
      log('strike.saveFailed', { message: String(e) });
    }
  };
  const tally = async (patch: Partial<Notes>) => {
    const notes = { ...v.notes, ...patch };
    v = { ...v, notes };
    try {
      await session.saveNotes(notes);
    } catch (e) {
      log('strike.notesFailed', { message: String(e) });
    }
  };
  const clock = (now: number) => {
    if (enteredAt > 0 && now > enteredAt) {
      const ms = v.notes.ms + (now - enteredAt);
      enteredAt = now;
      return ms;
    }
    return v.notes.ms;
  };

  /** The frame's puzzle (frames 1 and 2), or unsupported content. */
  const showPuzzle = (c: ChallengeView | null) => {
    const task = c ? taskOf(c) : null;
    if (!c || !task) {
      log('strike.unsupported', { activityId: c?.activityId ?? null });
      set({ stage: 'unsupported', task: null });
      return;
    }
    const last = c.helpShown[c.helpShown.length - 1];
    const tried = v.task?.key === task.key ? v.tried : [];
    set({ stage: 'puzzle', task, solved: false, tried: tried.slice(0, c.wrongTries), picked: [], targets: [], help: c.help, hint: last ? { kind: last.kind, revealed: c.revealed as number | string | null } : null, line: taskLine(task), standing: fullRack(v.frame), ball: 1, outcome: null, frameOver: false, roll: null });
  };

  /** Ready to bowl: the frame's puzzle answered (or the lab). */
  const readyToBowl = (frame: Frame, task: Task | null, answer: number | string | null) => {
    const targets = frame === 2 && task?.kind === 'target' && answer !== null ? pinsOfPair(task, String(answer)) : [];
    const key: LineKey = frame === 1 ? 'smartReady' : frame === 2 ? 'targetReady' : 'labAsk';
    set({ stage: 'aim', frame, task, solved: frame !== 3, picked: [], targets, hint: null, tried: [], standing: fullRack(frame), ball: 1, outcome: null, frameOver: false, roll: null, line: { key, vars: {} } });
  };

  const commit = async (optionId: string) => {
    const t = v.task;
    if (!t) return;
    set({ busy: true });
    const res = await session.submit({ mode: 'choice', optionId });
    if (disposed) return;
    if (res.status === 'refused') {
      log('strike.refused', { reason: res.reason });
      set({ busy: false, picked: [] });
      return;
    }
    await tally({ attempts: v.notes.attempts + 1, wrong: v.notes.wrong + (res.correct ? 0 : 1) });
    const option = t.options.find((o) => o.id === optionId)!;
    if (res.correct) {
      sound.play('answerRight');
      set({ busy: false });
      readyToBowl(v.frame, t, option.value);
    } else if (res.fresh) {
      sound.play('answerWrong');
      set({ tried: [], hint: null, picked: [], busy: false });
      showPuzzle(session.challenge());
      set({ line: { key: 'fresh', vars: {} } });
    } else {
      sound.play('answerWrong');
      const c = session.challenge();
      let line: StrikeView['line'];
      if (t.kind === 'smart') line = { key: 'smartWrong', vars: { total: t.present + Number(option.value), needed: t.needed } };
      else {
        const [a, b] = pairParts(String(option.value)) ?? [0, 0];
        line = { key: 'targetWrong', vars: { a, b, sum: a + b, target: t.target } };
      }
      set({ tried: [...v.tried, optionId], help: c?.help ?? v.help, busy: false, picked: [], line });
    }
    await persist();
  };

  const flow: StrikeFlow = {
    view: () => v,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    async start(now) {
      set({ busy: true });
      enteredAt = now;
      let saved: Saved | null = null;
      try {
        const raw = (await session.loadGame()) as Partial<Saved> | null;
        if (raw && raw.v === 1 && (raw.frame === 1 || raw.frame === 2 || raw.frame === 3)) saved = raw as Saved;
      } catch {
        saved = null;
      }
      let notes: Notes = { ...NO_NOTES };
      try {
        const raw = (await session.loadNotes()) as Partial<Notes> | null;
        if (raw && raw.v === 1) notes = { ...NO_NOTES, ...raw };
      } catch {
        // Unreadable notes start a fresh tally.
      }
      v = { ...v, notes, totals: saved?.totals ?? v.totals };
      const p = session.progress();
      const resumed = saved !== null || session.resumed;
      await tally(resumed ? { resumes: notes.resumes + 1 } : { rounds: notes.rounds + 1 });
      set({ busy: false, stage: 'intro', line: { key: resumed ? 'resume' : 'intro', vars: {} } });
      // Where the round stands is the runtime's (durable); the save only adds the pins' numbers.
      if (p.done) {
        v = { ...v, frame: 3, task: null };
      } else if (p.phase === 'solved') {
        const frame: Frame = p.complete ? 2 : 1;
        const held = session.solvedAnswer();
        const task = saved?.frame === frame ? saved.task : null;
        v = { ...v, frame, task, tried: [] };
        pending = { frame, task, answer: held ? (held.value as number | string) : null };
      } else {
        const c = session.challenge();
        const frame: Frame = c ? (FRAME_OF[c.activityId] ?? 1) : 1;
        v = { ...v, frame, task: saved?.frame === frame ? saved.task : null, tried: saved?.frame === frame ? saved.tried : [] };
      }
    },

    begin() {
      if (v.stage !== 'intro') return;
      if (pending) {
        const { frame, task, answer } = pending;
        pending = null;
        readyToBowl(frame, task, answer);
        return;
      }
      if (v.frame === 3) {
        readyToBowl(3, null, null);
        return;
      }
      showPuzzle(session.challenge());
      void persist();
    },

    async choose(optionId) {
      const t = v.task;
      if (v.stage !== 'puzzle' || t?.kind !== 'smart' || v.busy || v.tried.includes(optionId)) return;
      sound.play('cratePlace');
      await commit(optionId);
    },

    async pickPin(position) {
      const t = v.task;
      if (v.stage !== 'puzzle' || t?.kind !== 'target' || v.busy || position < 0 || position >= t.pins.length) return;
      if (v.picked.includes(position)) {
        set({ picked: v.picked.filter((p) => p !== position) });
        return;
      }
      sound.play('tilePlace');
      const picked = [...v.picked, position];
      if (picked.length < 2) {
        set({ picked });
        return;
      }
      const value = `${Math.min(t.pins[picked[0]!]!, t.pins[picked[1]!]!)}+${Math.max(t.pins[picked[0]!]!, t.pins[picked[1]!]!)}`;
      const option = t.options.find((o) => o.value === value);
      if (!option) {
        set({ picked: [] });
        return;
      }
      if (v.tried.includes(option.id)) {
        // Already tried: say the sum again, nothing is sent twice.
        const [a, b] = pairParts(value)!;
        set({ picked: [], line: { key: 'targetWrong', vars: { a, b, sum: a + b, target: t.target } } });
        return;
      }
      set({ picked });
      await commit(option.id);
    },

    async hint() {
      const t = v.task;
      if (v.stage !== 'puzzle' || !t || v.busy || !v.help) return;
      set({ busy: true });
      const h = await session.help();
      if (disposed) return;
      if (!h) {
        set({ busy: false });
        return;
      }
      await tally({ help: v.notes.help + 1 });
      const smart = t.kind === 'smart';
      const key: LineKey = h.kind === 'showAnswer' ? (smart ? 'showMe' : 'showPins') : h.kind === 'numberLine' ? (smart ? 'ladderSmart' : 'dotsTarget') : smart ? 'givensSmart' : 'givensTarget';
      const vars: Record<string, number> = smart ? { needed: t.needed, present: t.present } : { target: t.target };
      set({ busy: false, help: h.next, hint: { kind: h.kind, revealed: h.revealed as number | string | null }, line: { key, vars } });
    },

    setShot(patch) {
      if (v.stage !== 'aim') return;
      set({ shot: { ...v.shot, ...patch } });
    },

    bowl() {
      if (v.stage !== 'aim' || v.busy) return;
      const roll = simulate(v.shot, rackKind(v.frame), v.standing);
      sound.play('golfHit');
      sound.loop('golfRoll', true);
      set({ stage: 'rolling', roll, rollSeq: v.rollSeq + 1, outcome: null, line: { key: 'rolling', vars: {} } });
      void tally({ bowls: v.notes.bowls + 1, ...(v.frame === 3 ? { labBowls: v.notes.labBowls + 1 } : {}) });
    },

    settle() {
      if (v.stage !== 'rolling' || !v.roll) return;
      sound.loop('golfRoll', false);
      const roll = v.roll;
      const standing = v.standing.map((up, i) => up && !roll.down[i]);
      const down = roll.down.filter(Boolean).length;
      const left = standing.filter(Boolean).length;
      const totals = { ...v.totals, pins: v.totals.pins + down };
      let outcome: Outcome;
      let frameOver: boolean;
      if (v.frame === 2 && v.targets.length === 2) {
        const hit = v.targets.length > 0 && v.targets.every((i) => !standing[i]);
        const some = v.targets.some((i) => !standing[i]);
        outcome = hit ? 'targetHit' : some ? 'targetOne' : 'targetMiss';
        frameOver = hit || v.ball === 2 || left === 0;
      } else if (v.ball === 1) {
        outcome = left === 0 ? 'strike' : roll.gutter ? 'gutter' : 'count';
        frameOver = left === 0;
      } else {
        outcome = left === 0 ? 'spare' : 'count';
        frameOver = true;
      }
      if (outcome === 'strike') totals.strikes++;
      if (outcome === 'spare') totals.spares++;
      // The pins' crash plays at impact (the screen); here only the payoff.
      if (outcome === 'strike' || outcome === 'spare') sound.play('holeComplete');
      else if (outcome === 'targetHit') sound.play('deliveryComplete');
      else if (down === 0) sound.play('tileUndo');
      const key: LineKey = frameOver ? 'frameDone' : v.frame === 2 ? 'secondTarget' : 'secondBall';
      set({ stage: 'result', standing, outcome, lastDown: down, frameOver, totals, trail: roll, line: { key, vars: {} } });
      if (outcome === 'strike') void tally({ strikes: v.notes.strikes + 1 });
      void persist();
    },

    ready() {
      if (v.stage !== 'result' || v.frameOver) return;
      set({ stage: 'aim', ball: 2 });
    },

    bowlAgain() {
      if (v.stage !== 'result' || !v.frameOver) return;
      void tally({ frameRetries: v.notes.frameRetries + 1 });
      const key: LineKey = v.frame === 1 ? 'smartReady' : v.frame === 2 ? 'targetReady' : 'labAsk';
      set({ stage: 'aim', standing: fullRack(v.frame), ball: 1, outcome: null, frameOver: false, roll: null, line: { key, vars: {} } });
    },

    async nextFrame(now) {
      if (v.stage !== 'result' || !v.frameOver || v.busy) return;
      if (v.frame === 3) {
        set({ stage: 'done', busy: true, line: { key: 'done', vars: { pins: v.totals.pins } } });
        sound.play('deliveryComplete');
        const complete = session.progress().complete;
        await tally({ completed: v.notes.completed + 1, ms: clock(now) });
        if (complete) await session.finish();
        set({ busy: false });
        return;
      }
      set({ busy: true });
      if (session.progress().phase === 'solved') await session.next();
      if (disposed) return;
      const frame: Frame = v.frame === 1 ? 2 : 3;
      v = { ...v, frame, task: null, tried: [], busy: false };
      if (frame === 3) readyToBowl(3, null, null);
      else showPuzzle(session.challenge());
      await persist();
    },

    async again() {
      await tally({ again: v.notes.again + 1 });
    },

    pause() {
      if (v.stage === 'rolling') flow.settle();
      sound.loop('golfRoll', false);
    },

    async leave(now) {
      flow.pause();
      await tally(v.stage === 'done' ? { ms: clock(now) } : { exits: v.notes.exits + 1, ms: clock(now) });
      enteredAt = 0;
      if (v.stage !== 'done') await persist();
    },

    dispose() {
      disposed = true;
      sound.loop('golfRoll', false);
      listeners.clear();
    },
  };

  return flow;
}
