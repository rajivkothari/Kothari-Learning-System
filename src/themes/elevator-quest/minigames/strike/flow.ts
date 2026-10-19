// Strike Lab: arcade puzzle bowling (issue #3; V0.1 was D190). Pure (no React), clock passed in, so
// a whole round plays headless in tests over the real runtime.
//
// A round is one runtime mission (challenges.ts says which lane each step is played on):
//   intro     START (also after coming back: the round waits for the child)
//   practice  once per game session (one mission instance; saved, so a reload never gives another):
//             one free ball on the first step's lane, no question, nothing at stake
//   puzzle    the step's question. The committed answer is the ONLY evidence (session.submit); help is
//             the activity's ladder. A right answer earns the shot and lights the objective's pins.
//   aim       aim, power and spin (spin may be earned: Word Strike); BOWL
//   rolling   the screen plays the roll (lane.ts simulates it); settle() reads the result
//   result    an objective frame is up to two balls. Cleared: NEXT. Not cleared: the earned frame and
//             two free retries (TRY AGAIN); after them GUIDED SHOT (rails, and a guide line showing a
//             shot that works; the child still aims and bowls, nothing is awarded) and MOVE ON, which
//             goes on without the objective cleared and says nothing negative.
//   done      the mission is complete; PLAY AGAIN starts a new round.
//
// Never evidence: the practice ball, aim, power, spin, rolls, pins down, retries, GUIDED SHOT, MOVE
// ON, objectives cleared or not. A bowling miss never asks the question again: the answer stays
// answered, and the step's evidence is exactly what the child answered and how much help they used.
//
// Notes (session.saveNotes, per learner, outliving mission instances): a local developer playtest
// tally across rounds, and whether this visit's warm-up ball is spent; never evidence.
//
// A game session (D3) is one visit: from opening Strike Lab until BACK TO ELEVATOR. A reload, a
// crash, PLAY AGAIN or a new level stays in the same visit, so it never gives another warm-up.
//
// Levels (stage 2): Pin Pursuit, Word Strike and Physics Lab are missions of one game; the level map
// switches between them (host.play). A right answer whose shot has not been played yet is kept in the
// notes (`earned`, per level) until its frames are done (cleared, or MOVE ON): leaving the level,
// switching levels, a reload or reopening the level brings that shot back first, with no new question
// and nothing recorded again. The session's own held answer covers the same level and instance; the
// notes cover the rest (another level opened in between clears the session's note, and switching
// levels ends the other level's unfinished instance, D196).
import { fill } from '../../../content/missionCopy';
import type { Response } from '../../../../engine';
import { STRIKE, wordClues, wordNarrationKey, type StrikeCopy } from '../../content/minigames';
import type { ChallengeView, HelpOffer, MiniGameSession, MiniGameSound } from '../types';
import { attempt as trayWord, clear as clearTray, createTray, placeTile as trayPlace, removeSlot as trayRemove, undo as trayUndo, type Tray } from '../wordGolf/tiles';
import { LISTED, challengeFor, laneWith, stepLane, type ChallengeDef, type ChallengeId } from './challenges';
import { STRAIGHT, guideShot, rack, simulate, targetsDown, type LaneSetup, type Roll, type Shot, type SurfaceKind } from './lane';

export type Stage = 'loading' | 'intro' | 'puzzle' | 'aim' | 'rolling' | 'result' | 'done' | 'unsupported';
export type LineKey = keyof StrikeCopy['lines'];
/** What a ball is for: the free practice ball, an earned objective frame, or a guided one. */
export type ShotMode = 'practice' | 'objective' | 'guided';
export type Outcome = 'strike' | 'count' | 'gutter' | 'cleared' | 'targetOne' | 'targetMiss';
/** The buttons a finished frame offers. */
export type ResultAction = 'continue' | 'next' | 'retry' | 'guided' | 'moveOn';

/** Free tries after the earned frame, before GUIDED SHOT is offered (D2). */
export const FREE_RETRIES = 2;
/** GUIDED SHOT frames after the free tries; then only MOVE ON, so assisted play is never endless. */
export const GUIDED_TRIES = 2;
/** Frames one earned answer can ever give on a step: the earned one, the free tries, the guided ones. */
export const MAX_FRAMES = 1 + FREE_RETRIES + GUIDED_TRIES;

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
  /** The number on each pin of the five-pin formation, by rack position. */
  pins: number[];
  /** Every pair of pins is an option ("4+5", low first). */
  options: { id: string; value: string }[];
}
/** A spelling item (Word Strike): Word Golf's letter tiles; the word is never known here. */
export interface SpellTask {
  kind: 'spell';
  key: string;
  wordId: string | null;
  length: number;
  tiles: string;
  pattern: string | null;
  syllables: number | null;
  /** The theme's words around the item (a sentence with a gap, a meaning, a sound hint), never the word. */
  clue: { blank: string | null; meaning: string | null; phonics: string | null } | null;
}
export type Task = SmartTask | TargetTask | SpellTask;

/** A right answer whose shot is not played yet (notes, per level): its frames come back first. Never evidence. */
export interface EarnedShot {
  instanceId: string;
  step: number;
  kind: Task['kind'];
  targets: number[];
  attempt: number;
  guided: boolean;
  frame: FrameState;
  surface: SurfaceKind | null;
}

/** A level on the map. */
export interface LevelView {
  missionId: string;
  id: ChallengeId;
  done: boolean;
  current: boolean;
}

export interface Notes {
  v: 1;
  /** Rounds started fresh, and come back to. */
  rounds: number;
  resumes: number;
  completed: number;
  /** PLAY AGAIN taps: does the child want another round? */
  again: number;
  exits: number;
  bowls: number;
  practice: number;
  /** TRY AGAIN, GUIDED SHOT and MOVE ON taps, and objectives cleared. */
  retries: number;
  guided: number;
  movedOn: number;
  cleared: number;
  strikes: number;
  help: number;
  attempts: number;
  wrong: number;
  ms: number;
  /** This visit's warm-up ball is spent (cleared by BACK TO ELEVATOR). Not a tally. */
  warmup: boolean;
  /** Earned shots not played yet, by level (mission id). Not a tally. */
  earned: Record<string, EarnedShot>;
  /** Level switches on the level map. */
  switches: number;
}
const NO_NOTES: Notes = { v: 1, rounds: 0, resumes: 0, completed: 0, again: 0, exits: 0, bowls: 0, practice: 0, retries: 0, guided: 0, movedOn: 0, cleared: 0, strikes: 0, help: 0, attempts: 0, wrong: 0, ms: 0, warmup: false, earned: {}, switches: 0 };

export interface StrikeView {
  stage: Stage;
  challenge: ChallengeId | null;
  /** The mission step being played (0-based), of how many. */
  step: number;
  steps: number;
  task: Task | null;
  /** The step's question is answered right (the shot is earned). */
  solved: boolean;
  tried: string[];
  help: HelpOffer | null;
  hint: { kind: string; revealed: number | string | null } | null;
  /** Pins picked so far on a target puzzle (rack positions). */
  picked: number[];
  /** The lane this ball rolls on (the step's, plus GUIDED SHOT's rails). */
  lane: LaneSetup;
  /** The objective's pins (lit on the lane). */
  targets: number[];
  mode: ShotMode;
  /** Frames started on this step since the right answer: the earned one, retries, then guided (at most MAX_FRAMES). */
  attempt: number;
  /** GUIDED SHOT's guide: a shot that works on this lane (drawn; never applied to the controls). */
  guide: Shot | null;
  /** Spin can be used (Word Strike earns it with the word). */
  spinOpen: boolean;
  /** This visit's warm-up ball is spent (from the notes, not the mission's save). */
  practiceUsed: boolean;
  /** Word Strike: the letter tiles and answer slots (null for other puzzles). */
  tray: Tray | null;
  /** The word can be heard (its recording exists). */
  canHear: boolean;
  /** Physics Lab: the test strip's surface now (null: this lane has no strip). */
  surface: SurfaceKind | null;
  /** GUIDED SHOT's guide works on this strip surface (may differ from `surface`: then the line says to switch). */
  guideSurface: SurfaceKind | null;
  /** The lane the guide was found on (the screen draws the guide's path on it). */
  guideLane: LaneSetup | null;
  /** This frame plays a shot earned before (another visit, level or instance): no question first. */
  carried: boolean;
  /** The level map. */
  levels: LevelView[];
  shot: Shot;
  /** 1 or 2: which ball of the frame. */
  ball: 1 | 2;
  standing: boolean[];
  roll: Roll | null;
  /** The last roll played, kept so the screen can draw its path faintly to compare. */
  trail: Roll | null;
  /** Bumped on every BOWL, so the screen replays from the start. */
  rollSeq: number;
  outcome: Outcome | null;
  /** Pins down on the last ball. */
  lastDown: number;
  frameOver: boolean;
  totals: { pins: number; strikes: number; cleared: number; movedOn: number };
  line: { key: LineKey; vars: Record<string, string | number> };
  busy: boolean;
  notes: Notes;
}

interface SavedV1 {
  v: 1;
  frame: 1 | 2 | 3;
  task: Task | null;
  tried: string[];
  totals?: { pins?: number; strikes?: number };
}
interface Saved {
  v: 2;
  challenge: ChallengeId;
  step: number;
  task: Task | null;
  tried: string[];
  attempt: number;
  guided: boolean;
  /** The frame's state: a ball has rolled ("used"), or the objective is down ("cleared"). A restart shows that result, never a fresh frame. */
  frame?: FrameState;
  /** Physics Lab's strip surface. */
  surface?: SurfaceKind | null;
  totals: StrikeView['totals'];
}
type FrameState = 'open' | 'used' | 'cleared';
const NO_TOTALS: StrikeView['totals'] = { pins: 0, strikes: 0, cleared: 0, movedOn: 0 };

/**
 * A save from Strike Lab V0.1 (frames 1 to 3) as a v2 save: the same step and puzzle, the round's
 * totals kept. Whether the warm-up is spent belongs to the visit (the notes), not the save. Pure (tested).
 */
export function migrateSave(raw: unknown): Saved | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<Saved> & Partial<SavedV1>;
  if (s.v === 2 && typeof s.step === 'number' && typeof s.challenge === 'string') return { ...(s as Saved), totals: { ...NO_TOTALS, ...s.totals } };
  if (s.v === 1 && (s.frame === 1 || s.frame === 2 || s.frame === 3)) {
    return {
      v: 2,
      challenge: 'classic',
      step: s.frame - 1,
      task: s.task ?? null,
      tried: Array.isArray(s.tried) ? s.tried : [],
      attempt: 0,
      guided: false,
      totals: { ...NO_TOTALS, pins: s.totals?.pins ?? 0, strikes: s.totals?.strikes ?? 0 },
    };
  }
  return null;
}

export interface StrikeFlow {
  view(): StrikeView;
  subscribe(l: () => void): () => void;
  start(now: number): Promise<void>;
  begin(): void;
  /** A power puzzle: install a module (the committed answer). */
  choose(optionId: string): Promise<void>;
  /** A target puzzle: tap a pin (rack position). The second pin commits the pair. */
  pickPin(position: number): Promise<void>;
  hint(): Promise<void>;
  /** Word Strike's tiles: place a tile, take a slot's letter back, UNDO, CLEAR. */
  placeTile(tileId: number): void;
  removeTile(slot: number): void;
  undoTile(): void;
  clearTiles(): void;
  /** TRY IT: the spelled word (the committed answer). */
  spell(): Promise<void>;
  /** HEAR IT: the word's recording (never needed to answer: the clue is on the card). */
  hear(): void;
  /** Physics Lab: set the test strip (while aiming, the warm-up included). Play, never evidence. */
  setSurface(kind: SurfaceKind): void;
  setShot(patch: Partial<Shot>): void;
  bowl(): void;
  /** The roll has played (or Reduced Motion skipped it): read the pins and show the result. */
  settle(): void;
  /** After a first ball's result has been seen: the frame's second ball. */
  ready(): void;
  /** After the practice ball: on to the first puzzle. */
  proceed(): void;
  /** TRY AGAIN: a fresh rack for another free frame (while free tries are left). */
  retry(): void;
  /** GUIDED SHOT: rails and the guide line, for another frame (after the free tries, at most GUIDED_TRIES). */
  guided(): void;
  /** MOVE ON: on without the objective (after the free tries). Says nothing negative, records nothing. */
  moveOn(now: number): Promise<void>;
  /** NEXT after a cleared objective. */
  next(now: number): Promise<void>;
  /** PLAY AGAIN on the done card: tallied; the screen then asks the host for a new round. */
  again(): Promise<void>;
  pause(): void;
  leave(now: number): Promise<void>;
  /** Before the level map opens another level: saved and timed; the visit goes on (no new warm-up). */
  switchLevel(now: number): Promise<void>;
  dispose(): void;
}

const TASK_OF: Record<string, Task['kind']> = { 'power-cells.fill': 'smart', 'pairs.make-target': 'target' };
const kindOf = (activityId: string): Task['kind'] | null => TASK_OF[activityId] ?? (activityId.startsWith('spelling.') ? 'spell' : null);

/** A fresh rack for a lane. */
const fullRack = (lane: LaneSetup) => rack(lane.rack).map(() => true);

export function lineText(line: StrikeView['line'], copy: StrikeCopy = STRIKE): string {
  return fill(copy.lines[line.key], line.vars);
}

/** The buttons a finished frame offers (the screen draws exactly these). */
export function resultActions(v: Pick<StrikeView, 'stage' | 'frameOver' | 'mode' | 'outcome' | 'attempt'>): ResultAction[] {
  if (v.stage !== 'result' || !v.frameOver) return [];
  if (v.mode === 'practice') return ['continue'];
  if (v.outcome === 'cleared') return ['next'];
  if (v.mode === 'objective' && v.attempt <= FREE_RETRIES) return ['retry'];
  if (v.attempt < MAX_FRAMES) return ['guided', 'moveOn'];
  return ['moveOn'];
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
  const kind = kindOf(c.activityId);
  const p = c.prompt;
  if (kind === 'spell') {
    if (c.answer.mode !== 'text') return null;
    const tiles = typeof p.tiles === 'string' ? p.tiles : '';
    const length = typeof p.length === 'number' && p.length > 0 ? p.length : tiles.length;
    if (!tiles || length < 1) return null;
    const wordId = typeof p.wordId === 'string' ? p.wordId : null;
    const clue = wordId ? wordClues(wordId) : null;
    return {
      kind: 'spell',
      key: c.key,
      wordId,
      length,
      tiles,
      pattern: typeof p.pattern === 'string' && p.pattern.length > 0 ? p.pattern : null,
      syllables: typeof p.syllables === 'number' ? p.syllables : null,
      clue: clue ? { blank: clue.blank ?? null, meaning: clue.meaning ?? null, phonics: clue.phonics ?? null } : null,
    };
  }
  if (!kind || c.answer.mode !== 'choice' || c.options.length < 2) return null;
  const num = (x: unknown) => (typeof x === 'number' ? x : 0);
  if (kind === 'smart') return { kind: 'smart', key: c.key, needed: num(p.capacity), present: num(p.aboard), options: c.options.map((o) => ({ id: o.id, value: Number(o.value) })) };
  const count = num(p.count);
  const nums = Array.from({ length: count }, (_, i) => num(p[`n${i + 1}`]));
  if (count !== 5) return null;
  return { kind: 'target', key: c.key, target: num(p.target), pins: placePins(nums, c.key), options: c.options.map((o) => ({ id: o.id, value: String(o.value) })) };
}

export const taskLine = (t: Task): StrikeView['line'] =>
  t.kind === 'smart' ? { key: 'smartAsk', vars: { needed: t.needed, present: t.present } } : t.kind === 'target' ? { key: 'targetAsk', vars: { target: t.target } } : { key: 'spellAsk', vars: {} };

/** The challenge's intro line. */
const introKey = (id: ChallengeId | undefined): LineKey => (id === 'pin-pursuit' ? 'introPursuit' : id === 'word-strike' ? 'introWord' : id === 'physics-lab' ? 'introPhysics' : 'intro');
const surfaceWord = (k: SurfaceKind) => (k === 'oil' ? STRIKE.labels.slick : STRIKE.labels.grippy);
const parseEarned = (raw: unknown): Record<string, EarnedShot> => {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, EarnedShot> = {};
  for (const [k, e] of Object.entries(raw as Record<string, Partial<EarnedShot>>)) {
    if (e && typeof e.instanceId === 'string' && typeof e.step === 'number' && Array.isArray(e.targets) && typeof e.attempt === 'number') out[k] = e as EarnedShot;
  }
  return out;
};

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
  const def: ChallengeDef | null = challengeFor(session.missionId);
  const steps = def?.steps.length ?? 0;
  /** The strip's first surface on a step (null: no strip). */
  const startSurface = (step: number): SurfaceKind | null => (def ? (stepLane(def, step).strip?.start ?? null) : null);
  /** A step's lane with the strip on a surface. */
  const laneAt = (step: number, surface: SurfaceKind | null): LaneSetup => (def ? laneWith(stepLane(def, step), surface) : { rack: 'ten' });
  const laneOf = (step: number): LaneSetup => laneAt(step, startSurface(step));
  /** A right answer held from before a restart: played as ready-to-bowl at START. */
  let pending: { task: Task | null; answer: number | string | null; attempt: number; guided: boolean; frame: FrameState; surface: SurfaceKind | null; targets: number[] | null } | null = null;
  /** An earned shot from the notes (no held answer for it here): played first at START. */
  let carried: EarnedShot | null = null;
  /** Show the done card at START (the mission completed before the round's end was seen). */
  let doneAtStart = false;
  let v: StrikeView = {
    stage: 'loading',
    challenge: def?.id ?? null,
    step: 0,
    steps,
    task: null,
    solved: false,
    tried: [],
    help: null,
    hint: null,
    picked: [],
    lane: laneOf(0),
    targets: [],
    mode: 'objective',
    attempt: 0,
    guide: null,
    spinOpen: !def?.spinEarned,
    practiceUsed: false,
    tray: null,
    canHear: false,
    surface: startSurface(0),
    guideSurface: null,
    guideLane: null,
    carried: false,
    levels: LISTED.map((c) => ({ missionId: c.missionId, id: c.id, done: session.completedMissions.includes(c.missionId), current: c.missionId === session.missionId })),
    shot: { ...STRAIGHT },
    ball: 1,
    standing: fullRack(laneOf(0)),
    roll: null,
    trail: null,
    rollSeq: 0,
    outcome: null,
    lastDown: 0,
    frameOver: false,
    totals: { ...NO_TOTALS },
    line: { key: 'intro', vars: {} },
    busy: false,
    notes: { ...NO_NOTES },
  };
  const set = (patch: Partial<StrikeView>) => {
    v = { ...v, ...patch };
    if (!disposed) for (const l of [...listeners]) l();
  };

  const persist = async () => {
    if (disposed || !def) return;
    const saved: Saved = { v: 2, challenge: def.id, step: v.step, task: v.task, tried: v.tried, attempt: v.attempt, guided: v.mode === 'guided', frame: frameState(), surface: v.surface, totals: v.totals };
    // The earned shot, kept per level until its frames are done (see the header). Taken now, before
    // any wait, so a later NEXT or MOVE ON (which drops it) always lands after it.
    const kept =
      v.solved && v.mode !== 'practice'
        ? tally({ earned: { ...v.notes.earned, [session.missionId]: { instanceId: carried?.instanceId ?? session.instanceId, step: v.step, kind: v.task?.kind ?? carried?.kind ?? 'smart', targets: v.targets, attempt: v.attempt, guided: v.mode === 'guided', frame: frameState(), surface: v.surface } } })
        : null;
    try {
      await session.saveGame(saved);
    } catch (e) {
      log('strike.saveFailed', { message: String(e) });
    }
    await kept;
  };
  /** The earned shot is played out (cleared, or MOVE ON): off the notes. */
  const dropEarned = async () => {
    if (!(session.missionId in v.notes.earned)) return;
    const earned = { ...v.notes.earned };
    delete earned[session.missionId];
    await tally({ earned });
  };
  /** Whether the current frame has been bowled: a restart then shows its result instead of a fresh rack. */
  const frameState = (): FrameState => {
    if (!v.solved || v.mode === 'practice' || v.attempt < 1) return 'open';
    if (v.outcome === 'cleared' || (v.stage === 'rolling' && v.roll && targetsDown(v.roll, v.targets, v.standing))) return 'cleared';
    return v.stage === 'rolling' || v.stage === 'result' || v.ball === 2 ? 'used' : 'open';
  };
  /**
   * GUIDED SHOT's guide on the lane as it is; on a Physics Lab step whose strip makes that impossible,
   * the guide on the other surface, and the line says to switch the strip (the child does it).
   */
  const guideNow = (standing?: readonly boolean[]): Pick<StrikeView, 'guide' | 'guideSurface' | 'guideLane'> => {
    const opts = { spin: v.spinOpen, preferSpin: def?.spinEarned === true, ...(standing ? { standing } : {}) };
    const surfaces: (SurfaceKind | null)[] = v.surface ? [v.surface, v.surface === 'oil' ? 'grip' : 'oil'] : [null];
    const railed = (k: SurfaceKind | null): LaneSetup => ({ ...laneAt(v.step, k), bumpers: true });
    // The challenge's own lesson first: a surface where the shot works without the rails, shown with them.
    for (const k of surfaces) {
      if (!guideShot(laneAt(v.step, k), v.targets, opts)) continue;
      const shot = guideShot(railed(k), v.targets, opts);
      if (shot) return { guide: shot, guideSurface: k, guideLane: railed(k) };
    }
    for (const k of surfaces) {
      const shot = guideShot(railed(k), v.targets, opts);
      if (shot) return { guide: shot, guideSurface: k, guideLane: railed(k) };
    }
    return { guide: null, guideSurface: v.surface, guideLane: null };
  };
  const guidedLine = (): StrikeView['line'] => (v.guideSurface && v.surface && v.guideSurface !== v.surface ? { key: 'guidedSurface', vars: { surface: surfaceWord(v.guideSurface) } } : { key: 'guidedAsk', vars: {} });
  /** The line for a finished frame that missed: tries left, GUIDED SHOT, or (all used) MOVE ON. */
  const missLine = (mode: ShotMode, attempt: number): StrikeView['line'] => {
    if (mode === 'objective' && attempt <= FREE_RETRIES) return { key: 'tryLeft', vars: { left: FREE_RETRIES - attempt + 1 } };
    if (attempt >= MAX_FRAMES) return { key: 'guidedDone', vars: {} };
    return { key: mode === 'guided' ? 'guidedMiss' : 'guidedOffer', vars: {} };
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

  /** The objective's pins for a step: a right pair's two pins, or the step's fixed targets. */
  const objectiveOf = (step: number, task: Task | null, answer: number | string | null): number[] => {
    if (task?.kind === 'target' && answer !== null) return pinsOfPair(task, String(answer));
    return def ? [...(stepLane(def, step).targets ?? [])] : [];
  };
  const readyLine = (task: Task | null): StrikeView['line'] => {
    if (v.carried) return { key: 'carried', vars: {} };
    if (v.surface) return { key: 'surfaceReady', vars: {} };
    return { key: task?.kind === 'smart' ? 'smartReady' : task?.kind === 'spell' ? 'spellReady' : 'targetReady', vars: {} };
  };

  /** The step's question, or unsupported content. */
  const showPuzzle = (c: ChallengeView | null) => {
    const task = c ? taskOf(c) : null;
    if (!c || !task || !def) {
      log('strike.unsupported', { activityId: c?.activityId ?? null, missionId: session.missionId });
      set({ stage: 'unsupported', task: null });
      return;
    }
    const last = c.helpShown[c.helpShown.length - 1];
    const tried = v.task?.key === task.key ? v.tried : [];
    const surface = startSurface(v.step);
    const lane = laneAt(v.step, surface);
    const tray = task.kind === 'spell' ? (v.task?.key === task.key && v.tray ? v.tray : createTray(task.tiles, task.length)) : null;
    const canHear = task.kind === 'spell' && task.wordId !== null && sound.canSay(wordNarrationKey(task.wordId));
    set({ stage: 'puzzle', task, solved: false, tried: tried.slice(0, c.wrongTries), picked: [], targets: [], help: c.help, hint: last ? { kind: last.kind, revealed: c.revealed as number | string | null } : null, line: taskLine(task), lane, surface, standing: fullRack(lane), ball: 1, outcome: null, frameOver: false, roll: null, guide: null, guideSurface: null, guideLane: null, spinOpen: !def.spinEarned, mode: 'objective', attempt: 0, tray, canHear, carried: false });
  };

  /** A frame on the step's lane: the objective (a new attempt), or a guided one (rails and the guide). */
  const startFrame = (mode: 'objective' | 'guided', attempt: number) => {
    const base = laneAt(v.step, v.surface);
    const lane: LaneSetup = mode === 'guided' ? { ...base, bumpers: true } : base;
    set({ stage: 'aim', mode, attempt, lane, standing: fullRack(lane), ball: 1, outcome: null, frameOver: false, roll: null, guide: null, guideSurface: null, guideLane: null });
    if (mode === 'guided') set(guideNow());
    set({ line: mode === 'guided' ? guidedLine() : readyLine(v.task) });
  };

  /** The answer is right: the shot is earned. */
  const earned = (task: Task | null, answer: number | string | null, attempt = 0, guided = false, frame: FrameState = 'open', surface: SurfaceKind | null = v.surface, known: number[] | null = null) => {
    const targets = known ?? objectiveOf(v.step, task, answer);
    set({ task, solved: true, picked: [], targets, hint: null, tried: [], spinOpen: true, tray: null, surface });
    playFrame(guided, attempt, frame);
  };
  /** The earned frame (or the one a restart left off at): a frame already bowled is spent, so its result shows again, never a fresh rack. */
  const playFrame = (guided: boolean, attempt: number, frame: FrameState) => {
    const mode = guided ? 'guided' : 'objective';
    const n = Math.max(1, attempt);
    startFrame(mode, n);
    const targets = v.targets;
    if (frame === 'cleared') set({ stage: 'result', frameOver: true, outcome: 'cleared', standing: v.standing.map((up, i) => up && !targets.includes(i)), line: { key: 'cleared', vars: {} } });
    else if (frame === 'used') set({ stage: 'result', frameOver: true, outcome: 'targetMiss', line: missLine(mode, n) });
  };
  /** A shot earned before (from the notes): its lane, its pins, where its frames stood. No question. */
  const playCarried = (c: EarnedShot) => {
    set({ step: c.step, task: null, solved: true, picked: [], targets: [...c.targets], hint: null, tried: [], spinOpen: true, tray: null, surface: c.surface ?? startSurface(c.step), carried: true });
    playFrame(c.guided, c.attempt, c.frame);
  };

  /** The free practice ball: the first step's lane, no question, no objective. */
  const practice = () => {
    const surface = startSurface(v.step);
    const lane = laneAt(v.step, surface);
    set({ stage: 'aim', mode: 'practice', lane, surface, targets: [], guide: null, guideSurface: null, guideLane: null, standing: fullRack(lane), ball: 1, outcome: null, frameOver: false, roll: null, line: { key: def?.spinEarned ? 'practiceLocked' : 'practiceAsk', vars: {} } });
  };

  const commit = async (optionId: string) => commitResponse({ mode: 'choice', optionId }, optionId);
  /** The committed answer (a choice, or a spelled word): the only evidence path. */
  const commitResponse = async (response: Response, optionId: string | null) => {
    const t = v.task;
    if (!t) return;
    set({ busy: true });
    const res = await session.submit(response);
    if (disposed) return;
    if (res.status === 'refused') {
      log('strike.refused', { reason: res.reason });
      set({ busy: false, picked: [] });
      return;
    }
    await tally({ attempts: v.notes.attempts + 1, wrong: v.notes.wrong + (res.correct ? 0 : 1) });
    const option = t.kind === 'spell' ? null : (t.options as { id: string; value: number | string }[]).find((o) => o.id === optionId)!;
    if (res.correct) {
      sound.play('answerRight');
      set({ busy: false });
      earned(t, option ? option.value : null);
    } else if (res.fresh) {
      sound.play('answerWrong');
      set({ tried: [], hint: null, picked: [], busy: false });
      showPuzzle(session.challenge());
      set({ line: { key: 'fresh', vars: {} } });
    } else {
      sound.play('answerWrong');
      const c = session.challenge();
      if (t.kind === 'spell' || !option || optionId === null) {
        // A word that is not right yet: the letters go back to the tiles; nothing here compares letters.
        set({ tray: v.tray ? clearTray(v.tray) : null, help: c?.help ?? v.help, busy: false, line: { key: 'spellWrong', vars: {} } });
        await persist();
        return;
      }
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

  /** The round is over: the done card, and the mission closes. */
  const finishRound = async (now: number) => {
    set({ stage: 'done', busy: true, line: { key: 'done', vars: {} } });
    sound.play('deliveryComplete');
    const complete = session.progress().complete;
    // The level map marks this challenge finished now (the session read the list when it opened).
    if (complete) set({ levels: v.levels.map((l) => (l.current ? { ...l, done: true } : l)) });
    await tally({ completed: v.notes.completed + 1, ms: clock(now) });
    if (complete) await session.finish();
    set({ busy: false });
  };

  /** On from a step (cleared or moved on): the next step's question, or the done card. */
  const onward = async (now: number) => {
    set({ busy: true });
    await dropEarned();
    if (v.carried) {
      // A shot carried from before is played out: on to where this session stands (no next(): it holds nothing).
      carried = null;
      const p = session.progress();
      set({ carried: false });
      if (p.phase === 'done' || (p.phase !== 'solved' && session.challenge() === null)) {
        await finishRound(now);
        return;
      }
      v = { ...v, step: Math.min(p.step.index, Math.max(0, steps - 1)), task: null, tried: [], busy: false };
      showPuzzle(session.challenge());
      await persist();
      return;
    }
    if (session.progress().phase === 'solved') await session.next();
    if (disposed) return;
    if (session.progress().done || session.challenge() === null) {
      await finishRound(now);
      return;
    }
    v = { ...v, step: Math.min(v.step + 1, Math.max(0, steps - 1)), task: null, tried: [], busy: false };
    showPuzzle(session.challenge());
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
        saved = migrateSave(await session.loadGame());
      } catch {
        saved = null;
      }
      if (saved && saved.challenge !== def?.id) saved = null;
      let notes: Notes = { ...NO_NOTES };
      try {
        const raw = (await session.loadNotes()) as Partial<Notes> | null;
        if (raw && raw.v === 1) notes = { ...NO_NOTES, ...raw, earned: parseEarned(raw.earned) };
      } catch {
        // Unreadable notes start a fresh tally.
      }
      v = { ...v, notes, totals: saved?.totals ?? v.totals, practiceUsed: notes.warmup };
      const p = session.progress();
      const resumed = saved !== null || session.resumed;
      await tally(resumed ? { resumes: notes.resumes + 1 } : { rounds: notes.rounds + 1 });
      set({ busy: false, stage: 'intro', line: { key: resumed ? 'resume' : introKey(def?.id), vars: {} } });
      const kept = notes.earned[session.missionId] ?? null;
      // Where the round stands is the runtime's (durable); the save only adds the puzzle's layout and the bowling.
      if (p.done) {
        doneAtStart = true;
      } else if (p.phase === 'solved') {
        // The held right answer belongs to the step before the one the runtime names (the last, once complete).
        const step = p.complete ? (saved?.step ?? Math.max(0, steps - 1)) : Math.max(0, p.step.index - 1);
        const held = session.solvedAnswer();
        const same = saved?.step === step;
        v = { ...v, step, task: same ? saved!.task : null, tried: [] };
        // Where its frames stood: this instance's save, else the notes' copy of the same shot (another level's save may have replaced this one).
        const mine = kept && kept.instanceId === session.instanceId && kept.step === step ? kept : null;
        pending = same
          ? { task: v.task, answer: held ? (held.value as number | string) : null, attempt: saved!.attempt, guided: saved!.guided, frame: saved!.frame ?? 'open', surface: saved!.surface ?? startSurface(step), targets: null }
          : { task: v.task, answer: held ? (held.value as number | string) : null, attempt: mine?.attempt ?? 0, guided: mine?.guided ?? false, frame: mine?.frame ?? 'open', surface: mine?.surface ?? startSurface(step), targets: mine ? [...mine.targets] : null };
        if (!same && mine && mine.kind === 'target' && held === null) pending = null;
      } else {
        const step = Math.min(p.step.index, Math.max(0, steps - 1));
        const same = saved?.step === step;
        v = { ...v, step, task: same ? saved!.task : null, tried: same ? saved!.tried : [] };
        // A shot earned before and not played (another instance, or this one's held answer was lost): first.
        if (kept && !(kept.instanceId === session.instanceId && kept.step >= step)) carried = kept;
      }
      if (p.done && kept) carried = kept;
    },

    begin() {
      if (v.stage !== 'intro') return;
      if (carried) {
        const c = carried;
        doneAtStart = false;
        playCarried(c);
        void persist();
        return;
      }
      if (doneAtStart) {
        doneAtStart = false;
        set({ stage: 'done', line: { key: 'done', vars: {} } });
        return;
      }
      if (!v.practiceUsed && !pending && def) {
        practice();
        return;
      }
      if (pending) {
        const { task, answer, attempt, guided, frame, surface, targets } = pending;
        pending = null;
        earned(task, answer, attempt, guided, frame, surface, targets);
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
      if (t.kind === 'spell') {
        const kind = h.kind.toLowerCase();
        let line: StrikeView['line'];
        if (h.revealed !== null && h.revealed !== undefined) line = { key: 'spellShow', vars: { word: String(h.revealed).toLowerCase() } };
        else if (/replay|hear|listen|repeat/.test(kind)) {
          flow.hear();
          line = { key: 'spellListen', vars: {} };
        } else if (/reveal|pattern|letter|chunk|part/.test(kind) && t.pattern) line = { key: 'spellPattern', vars: { pattern: t.pattern } };
        else if (t.clue?.phonics) line = { key: 'spellHint', vars: { hint: t.clue.phonics } };
        else if (t.pattern) line = { key: 'spellPattern', vars: { pattern: t.pattern } };
        else line = { key: 'spellListen', vars: {} };
        set({ busy: false, help: h.next, hint: { kind: h.kind, revealed: h.revealed as number | string | null }, line });
        return;
      }
      const smart = t.kind === 'smart';
      const key: LineKey = h.kind === 'showAnswer' ? (smart ? 'showMe' : 'showPins') : h.kind === 'numberLine' ? (smart ? 'ladderSmart' : 'dotsTarget') : smart ? 'givensSmart' : 'givensTarget';
      const vars: Record<string, number> = smart ? { needed: t.needed, present: t.present } : { target: t.target };
      set({ busy: false, help: h.next, hint: { kind: h.kind, revealed: h.revealed as number | string | null }, line: { key, vars } });
    },

    placeTile(tileId) {
      if (v.stage !== 'puzzle' || v.task?.kind !== 'spell' || !v.tray || v.busy) return;
      const tray = trayPlace(v.tray, tileId);
      if (tray === v.tray) return;
      sound.play('tilePlace');
      set({ tray });
    },
    removeTile(slot) {
      if (v.stage !== 'puzzle' || !v.tray || v.busy) return;
      const tray = trayRemove(v.tray, slot);
      if (tray !== v.tray) set({ tray });
    },
    undoTile() {
      if (v.stage !== 'puzzle' || !v.tray || v.busy) return;
      const tray = trayUndo(v.tray);
      if (tray !== v.tray) set({ tray });
    },
    clearTiles() {
      if (v.stage !== 'puzzle' || !v.tray || v.busy) return;
      set({ tray: clearTray(v.tray) });
    },
    async spell() {
      const word = v.tray ? trayWord(v.tray) : null;
      if (v.stage !== 'puzzle' || v.task?.kind !== 'spell' || v.busy || word === null) return;
      await commitResponse({ mode: 'value', value: word }, null);
    },
    hear() {
      const t = v.task;
      if (t?.kind === 'spell' && t.wordId && sound.canSay(wordNarrationKey(t.wordId))) sound.say(wordNarrationKey(t.wordId));
    },

    setSurface(kind) {
      if (v.stage !== 'aim' || !v.surface || v.surface === kind) return;
      const base = laneAt(v.step, kind);
      const lane: LaneSetup = v.mode === 'guided' ? { ...base, bumpers: true } : base;
      set({ surface: kind, lane });
      if (v.mode === 'guided') {
        set(guideNow(v.ball === 2 ? v.standing : undefined));
        set({ line: guidedLine() });
      }
      if (v.solved) void persist();
    },

    setShot(patch) {
      if (v.stage !== 'aim') return;
      const next = { ...v.shot, ...patch };
      if (!v.spinOpen) next.spin = 0;
      set({ shot: next });
    },

    bowl() {
      if (v.stage !== 'aim' || v.busy) return;
      const shot = v.spinOpen ? v.shot : { ...v.shot, spin: 0 };
      const roll = simulate(shot, v.lane, v.standing);
      sound.play('golfHit');
      sound.loop('golfRoll', true);
      const practiceBall = v.mode === 'practice';
      set({ stage: 'rolling', roll, rollSeq: v.rollSeq + 1, outcome: null, line: { key: 'rolling', vars: {} }, ...(practiceBall ? { practiceUsed: true } : {}) });
      // The warm-up is spent for this visit the moment it rolls: a reload never gives another (D3).
      void tally({ bowls: v.notes.bowls + 1, ...(practiceBall ? { practice: v.notes.practice + 1, warmup: true } : {}) });
      // A frame is spent the moment its first ball rolls: a reload shows its result, not a fresh rack.
      void persist();
    },

    settle() {
      if (v.stage !== 'rolling' || !v.roll) return;
      sound.loop('golfRoll', false);
      const roll = v.roll;
      const before = v.standing;
      const standing = before.map((up, i) => up && !roll.down[i]);
      const down = roll.down.filter(Boolean).length;
      const left = standing.filter(Boolean).length;
      const totals = { ...v.totals, pins: v.totals.pins + down };
      let outcome: Outcome;
      let frameOver: boolean;
      let line: StrikeView['line'];
      if (v.mode === 'practice') {
        outcome = left === 0 ? 'strike' : roll.gutter ? 'gutter' : 'count';
        frameOver = true;
        line = { key: 'practiceDone', vars: {} };
      } else {
        const cleared = targetsDown(roll, v.targets, before);
        const some = v.targets.some((i) => !standing[i]);
        outcome = cleared ? 'cleared' : some ? 'targetOne' : 'targetMiss';
        frameOver = cleared || v.ball === 2 || left === 0;
        if (cleared) {
          totals.cleared++;
          line = { key: 'cleared', vars: {} };
        } else if (!frameOver) line = { key: 'secondBall', vars: {} };
        else line = missLine(v.mode, v.attempt);
      }
      if (left === 0 && v.ball === 1 && before.every(Boolean)) totals.strikes++;
      // The pins' crash plays at impact (the screen); here only the payoff.
      if (outcome === 'cleared' || outcome === 'strike') sound.play('holeComplete');
      else if (down === 0) sound.play('tileUndo');
      set({ stage: 'result', standing, outcome, lastDown: down, frameOver, totals, trail: roll, line });
      if (outcome === 'cleared') void tally({ cleared: v.notes.cleared + 1 });
      if (left === 0 && before.every(Boolean)) void tally({ strikes: v.notes.strikes + 1 });
      void persist();
    },

    ready() {
      if (v.stage !== 'result' || v.frameOver) return;
      set({ stage: 'aim', ball: 2 });
      if (v.mode === 'guided') set({ ...guideNow(v.standing) });
      set({ line: v.mode === 'guided' ? guidedLine() : { key: 'secondBall', vars: {} } });
    },

    proceed() {
      if (v.stage !== 'result' || v.mode !== 'practice') return;
      if (session.progress().phase === 'solved') {
        // A held answer (a restart during the practice ball): straight to its earned shot.
        earned(v.task, session.solvedAnswer()?.value as number | string | null);
        return;
      }
      showPuzzle(session.challenge());
      void persist();
    },

    retry() {
      if (!resultActions(v).includes('retry')) return;
      void tally({ retries: v.notes.retries + 1 });
      startFrame('objective', v.attempt + 1);
      void persist();
    },

    guided() {
      if (!resultActions(v).includes('guided')) return;
      void tally({ guided: v.notes.guided + 1 });
      startFrame('guided', v.attempt + 1);
      void persist();
    },

    async moveOn(now) {
      if (!resultActions(v).includes('moveOn') || v.busy) return;
      await tally({ movedOn: v.notes.movedOn + 1 });
      set({ totals: { ...v.totals, movedOn: v.totals.movedOn + 1 }, line: { key: 'movedOn', vars: {} } });
      await onward(now);
    },

    async next(now) {
      if (!resultActions(v).includes('next') || v.busy) return;
      await onward(now);
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
      // BACK TO ELEVATOR ends the visit: the next one starts with a warm-up ball again (D3).
      await tally(v.stage === 'done' ? { ms: clock(now), warmup: false } : { exits: v.notes.exits + 1, ms: clock(now), warmup: false });
      enteredAt = 0;
      if (v.stage !== 'done') await persist();
    },

    async switchLevel(now) {
      flow.pause();
      await tally({ switches: v.notes.switches + 1, ms: clock(now) });
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
