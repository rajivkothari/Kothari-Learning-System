// Rooftop Word Golf's game state: a pure state machine. No React, no session, no clock.
//
//   intro -> spell -> (right word) -> earned -> aim -> PUTT -> rolling -> the ball stops:
//     in the cup  -> sunk -> NEXT HOLE -> the next hole's intro
//     not in      -> aim again from where it rests (no new word on this hole)
//   a word not right yet stays on the card (marks, help), and is checked again
//   after the last hole: summary (holes played and words spelled; no score, no ranking)
//
// Rules this file keeps:
// - A putt is earned by a spelled word and kept: missing a putt never undoes the spelling, the next
//   putt starts where the ball stopped, and no new word is asked on the same hole.
// - Nothing here decides whether a word is right. The controller asks the session (session.submit,
//   the only evidence path) and passes the answer in. Golf never reaches the session.
// - Every move that cannot happen now returns the same state, so rapid taps cannot double-shoot,
//   double-place a tile or skip a hole.
import { z } from 'zod';

import { type HoleSpec, geometryOf } from './course';
import { CLOSER, PHYS, POWER, angleTo, canRest, clampPower, closerSpot, distance, normalizeAngle, simulateShot, type ShotResult, type Vec } from './physics';
import { attempt, clear, createTray, placeTile, removeSlot, undo, type Tray } from './tiles';

export type Phase = 'intro' | 'spell' | 'earned' | 'aim' | 'rolling' | 'sunk' | 'summary';

/** Help shown for the hole's word (from session.help(); what it shows is the theme's). */
export type Hint = (
  | { kind: 'replay' }
  | { kind: 'phonics'; text: string }
  | { kind: 'pattern'; pattern: string; at: number | null }
  | { kind: 'show'; word: string }
) & {
  /** Lifty's words for this help (the content's help line), when there are any. */
  line?: string;
};

/** Why the last putt did not drop (plain information for the next one, never a judgement), or the ball was moved closer. */
export type ShotNote = 'short' | 'tooFast' | 'wide' | 'out' | 'moved';

/** A word that is not right yet. Nothing here compares letters: whether a word is right is the session's. */
export interface SpellFeedback {
  /** The attempt checked: once a letter changes, the line goes. */
  attempt: string;
  /** The likely cause the session named (a misspelling's tag), or null. */
  cause: string | null;
}

export interface GolfState {
  hole: number;
  holeCount: number;
  phase: Phase;
  /** Where the ball rests: the next putt starts here. */
  ball: Vec;
  /** Aim, radians in course coordinates (-PI/2 is up the course). */
  aim: number;
  power: number;
  /** The last putt's power on this hole (a mark on the meter), or null. */
  lastPower: number | null;
  /** Putts on this hole (never shown as a score). */
  shots: number;
  /** The putt count when the ball was last moved closer on this hole, or null. */
  movedAt: number | null;
  /** The putt being played back, while rolling. */
  shot: ShotResult | null;
  note: ShotNote | null;
  /** Per hole: the word spelled (shown at the summary), or null. */
  words: readonly (string | null)[];
  /** The spelling item on screen (session challenge key) and its tray. */
  challengeKey: string | null;
  tray: Tray | null;
  feedback: SpellFeedback | null;
  hints: readonly Hint[];
  /** A right answer needed SHOW ME: the putt is earned all the same. */
  shown: boolean;
  /** Came back to a saved game (a welcome-back line until the next move). */
  resumed: boolean;
}

export const AIM_STEP = (2 * Math.PI) / 180;
export const POWER_STEP = 0.05;
export const DEFAULT_POWER = 0.5;
export const START_AIM = -Math.PI / 2;

export function newGame(holes: readonly HoleSpec[]): GolfState {
  return atHole(holes, 0, { words: holes.map(() => null), resumed: false });
}

function atHole(holes: readonly HoleSpec[], hole: number, keep: Pick<GolfState, 'words' | 'resumed'>): GolfState {
  const h = holes[hole]!;
  return {
    hole,
    holeCount: holes.length,
    phase: 'intro',
    ball: { ...h.tee },
    aim: START_AIM,
    power: DEFAULT_POWER,
    lastPower: null,
    shots: 0,
    movedAt: null,
    shot: null,
    note: null,
    words: keep.words,
    challengeKey: null,
    tray: null,
    feedback: null,
    hints: [],
    shown: false,
    resumed: keep.resumed,
  };
}

// ---------- spelling ----------

/** The spelling item the session shows now: a new key starts a fresh tray (a fresh item after misses). */
export function presentWord(s: GolfState, challenge: { key: string; tiles: string; length: number } | null): GolfState {
  if (s.phase !== 'intro' && s.phase !== 'spell') return s;
  if (!challenge) return s;
  if (s.phase === 'spell' && s.challengeKey === challenge.key && s.tray) return s;
  const sameItem = s.challengeKey === challenge.key;
  return { ...s, phase: 'spell', challengeKey: challenge.key, tray: createTray(challenge.tiles, challenge.length), feedback: null, hints: sameItem ? s.hints : [], shown: sameItem ? s.shown : false, resumed: false };
}

const onTray = (s: GolfState, f: (t: Tray) => Tray): GolfState => {
  if (s.phase !== 'spell' || !s.tray) return s;
  const tray = f(s.tray);
  if (tray === s.tray) return s;
  // Changing a letter retires the last check's line (it was about another attempt).
  const now = attempt(tray);
  return { ...s, tray, feedback: s.feedback && now === s.feedback.attempt ? s.feedback : null, resumed: false };
};

export const place = (s: GolfState, tileId: number) => onTray(s, (t) => placeTile(t, tileId));
export const takeBack = (s: GolfState, slot: number) => onTray(s, (t) => removeSlot(t, slot));
export const undoTile = (s: GolfState) => onTray(s, undo);
export const clearTiles = (s: GolfState) => onTray(s, clear);

/** The word to submit, or null (not spelling, or slots still empty). */
export const word = (s: GolfState) => (s.phase === 'spell' && s.tray ? attempt(s.tray) : null);

/** A right answer from the session: the putt is earned. The word is kept for the summary. */
export function spelled(s: GolfState, w: string, evidence: string): GolfState {
  if (s.phase !== 'spell') return s;
  const words = s.words.slice();
  words[s.hole] = w;
  return { ...s, phase: 'earned', words, feedback: null, shown: s.shown || evidence === 'demonstrated' };
}

/** Not yet: keep the letters where they are, with the likely cause the session named (if any). */
export function notYet(s: GolfState, w: string, cause: string | null = null): GolfState {
  if (s.phase !== 'spell' || !s.tray) return s;
  return { ...s, feedback: { attempt: w, cause } };
}

export function addHint(s: GolfState, hint: Hint): GolfState {
  if (s.phase !== 'spell') return s;
  return { ...s, hints: [...s.hints.filter((h) => h.kind !== hint.kind), hint], shown: s.shown || hint.kind === 'show' };
}

/** The putt was already earned (a restart after the answer was committed). */
export function alreadyEarned(s: GolfState, answered: { word: string; evidence: string } | null = null): GolfState {
  if (s.phase !== 'intro' && s.phase !== 'spell') return s;
  if (!answered) return { ...s, phase: 'earned', tray: null, feedback: null };
  // The session still holds the word it recorded: the summary shows it, as if the save had caught up.
  const words = s.words.slice();
  words[s.hole] = answered.word;
  return { ...s, phase: 'earned', tray: null, feedback: null, words, shown: s.shown || answered.evidence === 'demonstrated' };
}

// ---------- putting ----------

export const takeShot = (s: GolfState): GolfState => (s.phase === 'earned' ? { ...s, phase: 'aim', resumed: false } : s);

export const aimBy = (s: GolfState, delta: number): GolfState => (s.phase === 'aim' ? { ...s, aim: normalizeAngle(s.aim + delta), resumed: false } : s);
export const setAim = (s: GolfState, angle: number): GolfState => (s.phase === 'aim' && Number.isFinite(angle) ? { ...s, aim: normalizeAngle(angle), resumed: false } : s);
export const setPower = (s: GolfState, p: number): GolfState => (s.phase === 'aim' && Number.isFinite(p) ? { ...s, power: Math.round(clampPower(p) * 100) / 100, resumed: false } : s);
export const powerBy = (s: GolfState, delta: number): GolfState => setPower(s, s.power + delta);

/** PUTT: plays the whole putt now (deterministic); the screen then shows its path. */
export function shoot(s: GolfState, holes: readonly HoleSpec[]): GolfState {
  if (s.phase !== 'aim') return s;
  const h = holes[s.hole]!;
  const shot = simulateShot(geometryOf(h), s.ball, { angle: s.aim, power: s.power });
  return { ...s, phase: 'rolling', shot, shots: s.shots + 1, lastPower: s.power, note: null, resumed: false };
}

/** Why a putt that did not drop missed (information for the next one). */
export function noteFor(shot: ShotResult, from: Vec, cup: Vec, aim: number): ShotNote {
  if (shot.outcome === 'out' || shot.outcome === 'stuck') return 'out';
  if (shot.events.some((e) => e.kind === 'lipOut')) return 'tooFast';
  // Short: it stopped before the cup along the line it was hit, and not far off that line.
  const dir = { x: Math.cos(aim), y: Math.sin(aim) };
  const toCup = { x: cup.x - from.x, y: cup.y - from.y };
  const along = toCup.x * dir.x + toCup.y * dir.y;
  const side = Math.abs(toCup.x * dir.y - toCup.y * dir.x);
  const went = (shot.rest.x - from.x) * dir.x + (shot.rest.y - from.y) * dir.y;
  const bounced = shot.events.some((e) => e.kind === 'wall' || e.kind === 'bumper');
  if (!bounced && along > 0 && side <= PHYS.cupR * 2 && went < along) return 'short';
  return 'wide';
}

/** The ball has stopped (the playback ended, or was skipped): in the cup, or aim again from its rest. */
export function rollDone(s: GolfState, holes: readonly HoleSpec[]): GolfState {
  if (s.phase !== 'rolling' || !s.shot) return s;
  const shot = s.shot;
  if (shot.outcome === 'cup') {
    const last = s.hole + 1 >= s.holeCount;
    return { ...s, phase: last ? 'summary' : 'sunk', ball: { ...shot.rest }, shot: null, note: null };
  }
  const h = holes[s.hole]!;
  return { ...s, phase: 'aim', ball: { ...shot.rest }, shot: null, note: noteFor(shot, s.ball, h.cup, s.aim) };
}

/**
 * MOVE CLOSER: offered after CLOSER.after putts on one hole without the ball dropping (and again after
 * as many more): the spot it would move to, else null. Play only: never help, never evidence.
 */
export function closerOffer(s: GolfState, holes: readonly HoleSpec[]): Vec | null {
  if (s.phase !== 'aim' || s.shots - (s.movedAt ?? 0) < CLOSER.after) return null;
  return closerSpot(geometryOf(holes[s.hole]!), s.ball);
}

/** The ball goes to the offered spot; the aim and power stay the learner's. */
export function moveCloser(s: GolfState, holes: readonly HoleSpec[]): GolfState {
  const spot = closerOffer(s, holes);
  return spot ? { ...s, ball: spot, movedAt: s.shots, note: 'moved', resumed: false } : s;
}

/** NEXT HOLE: the next hole's intro (its word comes from the session). */
export function nextHole(s: GolfState, holes: readonly HoleSpec[]): GolfState {
  if (s.phase !== 'sunk') return s;
  if (s.hole + 1 >= holes.length) return { ...s, phase: 'summary' };
  return atHole(holes, s.hole + 1, { words: s.words, resumed: false });
}

/** How far the aim is from the flag, in degrees: negative to the left, positive to the right (as the ball looks at it). */
export function aimOffset(s: Pick<GolfState, 'aim' | 'ball'>, cup: Vec): number {
  return (normalizeAngle(s.aim - angleTo(s.ball, cup)) * 180) / Math.PI;
}

/** Holes finished so far (for the flags at the top and the summary). */
export function holesDone(s: GolfState): number {
  if (s.phase === 'summary') return s.holeCount;
  return s.hole + (s.phase === 'sunk' ? 1 : 0);
}

// ---------- save and resume (gameplay only: never evidence) ----------

const Point = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const Line = { line: z.string().max(200).optional() };
const HintSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('replay'), ...Line }).strict(),
  z.object({ kind: z.literal('phonics'), text: z.string().max(200), ...Line }).strict(),
  z.object({ kind: z.literal('pattern'), pattern: z.string().max(12), at: z.number().int().nullable(), ...Line }).strict(),
  z.object({ kind: z.literal('show'), word: z.string().max(24), ...Line }).strict(),
]);

export const SAVE_VERSION = 1;
export const SaveSchema = z
  .object({
    v: z.literal(SAVE_VERSION),
    game: z.literal('word-golf'),
    hole: z.number().int().min(0),
    phase: z.enum(['intro', 'spell', 'earned', 'aim', 'sunk', 'summary']),
    ball: Point,
    aim: z.number().finite(),
    power: z.number().finite(),
    lastPower: z.number().finite().nullable(),
    shots: z.number().int().min(0).max(999),
    movedAt: z.number().int().min(0).max(999).nullable(),
    note: z.enum(['short', 'tooFast', 'wide', 'out', 'moved']).nullable(),
    words: z.array(z.string().max(24).nullable()).max(9),
    challengeKey: z.string().max(200).nullable(),
    hints: z.array(HintSchema).max(8),
    shown: z.boolean(),
  })
  .strict();
export type GolfSave = z.infer<typeof SaveSchema>;

/**
 * What is saved: the state as it will be when the current putt ends (a putt in flight is saved
 * where it stops), so a restart never replays or loses a putt. The tray is not saved: letters
 * placed but not checked are not an answer, and a restart starts the word's tiles afresh.
 */
export function toSave(s: GolfState, holes: readonly HoleSpec[]): GolfSave {
  const t = s.phase === 'rolling' ? rollDone(s, holes) : s;
  return {
    v: SAVE_VERSION,
    game: 'word-golf',
    hole: t.hole,
    phase: t.phase === 'rolling' ? 'aim' : t.phase,
    ball: { ...t.ball },
    aim: t.aim,
    power: t.power,
    lastPower: t.lastPower,
    shots: t.shots,
    movedAt: t.movedAt,
    note: t.note,
    words: [...t.words],
    challengeKey: t.challengeKey,
    hints: [...t.hints],
    shown: t.shown,
  };
}

/**
 * A saved game back, made safe: an unreadable save, another course, or a ball that cannot rest
 * where it was saved restarts that hole from its tee (never a lost word: whether the hole's word
 * was spelled is the session's to say, and the controller asks it). Null: start a new game.
 */
export function fromSave(raw: unknown, holes: readonly HoleSpec[]): GolfState | null {
  const parsed = SaveSchema.safeParse(raw);
  if (!parsed.success) return null;
  const v = parsed.data;
  if (v.hole >= holes.length || v.words.length !== holes.length) return null;
  const h = holes[v.hole]!;
  const base = atHole(holes, v.hole, { words: v.words, resumed: true });
  const ballOk = canRest(v.ball, geometryOf(h)) || (v.phase === 'sunk' && distance(v.ball, h.cup) < 0.01) || v.phase === 'summary';
  const putting = v.phase === 'aim' || v.phase === 'earned';
  return {
    ...base,
    phase: v.phase === 'spell' ? 'intro' : v.phase,
    ball: putting && ballOk ? { ...v.ball } : v.phase === 'sunk' || v.phase === 'summary' ? { ...h.cup } : { ...h.tee },
    aim: normalizeAngle(v.aim),
    power: clampPower(v.power),
    lastPower: v.lastPower === null ? null : clampPower(v.lastPower),
    shots: putting && ballOk ? v.shots : 0,
    movedAt: putting && ballOk ? v.movedAt : null,
    note: putting && ballOk ? v.note : null,
    challengeKey: v.challengeKey,
    hints: v.hints,
    shown: v.shown,
  };
}

export const POWER_RANGE = POWER;
