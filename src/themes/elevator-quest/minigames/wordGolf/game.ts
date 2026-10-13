// Rooftop Word Golf's game state (D197): a pure state machine. No React, no session, no clock.
//
//   intro -> (the turn's word arrives) target -> spell -> (a right word) flight -> result
//     result -> NEXT WORD -> target (the next turn), or, after the last turn's word, aim (putting)
//   aim -> PUTT -> rolling -> aim again from where it stopped, or sunk (the hole is done)
//
// Rules this file keeps:
// - The word is the shot. A word right from the session (session.submit, the only evidence path)
//   becomes a shot; its quality comes from the session's evidence, never from golf (fairway.ts). A word
//   not right yet stays on the card: no shot, no penalty.
// - Golf never reaches the evidence: the target, the flight, the lie, the putts, the strokes are play.
// - A missed putt never asks for a word again: putting goes on from where the ball stopped.
// - Every move that cannot happen now returns the same state, so rapid taps cannot double anything.
import { z } from 'zod';

import { carryFor, isGolden, lieAt, puttGreen, puttPoint, puttable, qualityOf, shotLanding, type Hole, type Landing, type Lie, type Quality, type Target } from './fairway';
import { CLOSER, PHYS, angleTo, canRest, clampPower, closerSpot, distance, normalizeAngle, simulateShot, type ShotResult, type Vec } from './physics';
import { attempt, clear, createTray, placeTile, removeSlot, undo, type Tray } from './tiles';

export type Phase = 'intro' | 'target' | 'spell' | 'flight' | 'result' | 'aim' | 'rolling' | 'sunk';

/** Help shown for the word (from session.help(); what it shows is the theme's). */
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
  attempt: string;
  cause: string | null;
}

/** What the last word did (the result card): never evidence, a picture of the shot. */
export interface ShotReport {
  word: string;
  /** How the shot played (the lie can lower it: fairway.ts playedQuality). */
  quality: Quality;
  /** What the spelling earned (from the evidence alone): the card names the shot by this. */
  earned: Quality;
  /** Where the shot was played from. */
  from: Lie;
  golden: boolean;
  /** The golden pattern the word had, or null. */
  sound: string | null;
  /** The word family's rime (a family hole), or null. */
  rime: string | null;
  carried: boolean | null;
  splash: boolean;
  lie: Lie;
  flight: number;
}

export interface Putting {
  /** The ball in putting units (fairway.ts puttGreen). */
  ball: Vec;
  aim: number;
  power: number;
  lastPower: number | null;
  /** Putts on this green (strokes, never a score). */
  shots: number;
  movedAt: number | null;
  shot: ShotResult | null;
  note: ShotNote | null;
}

export interface GolfState {
  hole: string;
  /** The word turn being played (0-based); turns.length once every word is spelled (putting). */
  turn: number;
  phase: Phase;
  /** Where the ball lies on the hole map (yards). */
  ball: Vec;
  lie: Lie;
  /** The target picked for this turn, or null. */
  target: string | null;
  /** The shot in flight (phase flight), else null. */
  flight: Landing | null;
  /** The last word's shot (the result card), else null. */
  report: ShotReport | null;
  /** Shots so far on this hole: one per word, one per putt (golf flavour, never a score). */
  strokes: number;
  /** Words spelled on this hole, in order (the result card and the hole card show them). */
  words: readonly string[];
  /** The spelling item on screen (session challenge key), its length (the shot's power) and its tray. */
  challengeKey: string | null;
  letters: number;
  tray: Tray | null;
  feedback: SpellFeedback | null;
  hints: readonly Hint[];
  /** A right answer needed SHOW ME (the shot is played all the same). */
  shown: boolean;
  putting: Putting | null;
  /** Came back to a saved game (a welcome-back line until the next move). */
  resumed: boolean;
}

export const AIM_STEP = (2 * Math.PI) / 180;
export const POWER_STEP = 0.05;
export const DEFAULT_POWER = 0.4;

export function newHole(hole: Hole): GolfState {
  return {
    hole: hole.id,
    turn: 0,
    phase: 'intro',
    ball: { ...hole.tee },
    lie: 'tee',
    target: null,
    flight: null,
    report: null,
    strokes: 0,
    words: [],
    challengeKey: null,
    letters: 0,
    tray: null,
    feedback: null,
    hints: [],
    shown: false,
    putting: null,
    resumed: false,
  };
}

const turnOf = (hole: Hole, s: GolfState) => hole.turns[s.turn] ?? null;
/** The targets this turn offers. */
export const targetsOf = (hole: Hole, s: Pick<GolfState, 'turn'>): readonly Target[] => hole.turns[s.turn]?.targets ?? [];
/** The picked target (or the only one). */
export function targetOf(hole: Hole, s: GolfState): Target | null {
  const ts = targetsOf(hole, s);
  return ts.find((t) => t.id === s.target) ?? (ts.length === 1 ? ts[0]! : null);
}
/** Yards the word on the card can carry. */
export const wordCarry = (s: Pick<GolfState, 'letters'>) => carryFor(s.letters);

// ---------- the word ----------

/**
 * The turn's word arrived (a new key starts a fresh tray: a fresh word after misses). From intro it
 * opens the target choice, or the spelling when the turn has one target.
 */
export function presentWord(hole: Hole, s: GolfState, challenge: { key: string; tiles: string; length: number } | null): GolfState {
  if (s.phase !== 'intro' && s.phase !== 'target' && s.phase !== 'spell') return s;
  if (!challenge || !turnOf(hole, s)) return s;
  if (s.challengeKey === challenge.key && s.tray && s.phase !== 'intro') return s;
  const same = s.challengeKey === challenge.key;
  const single = targetsOf(hole, s).length === 1;
  const next: Phase = s.phase === 'spell' ? 'spell' : single ? 'spell' : s.target ? 'spell' : 'target';
  return { ...s, phase: next, target: single ? targetsOf(hole, s)[0]!.id : s.target, challengeKey: challenge.key, letters: challenge.length, tray: createTray(challenge.tiles, challenge.length), feedback: null, hints: same ? s.hints : [], shown: same ? s.shown : false, resumed: false };
}

/** Pick where this word's shot goes. */
export function chooseTarget(hole: Hole, s: GolfState, id: string): GolfState {
  if (s.phase !== 'target' || !targetsOf(hole, s).some((t) => t.id === id)) return s;
  return { ...s, phase: 'spell', target: id, resumed: false };
}

/** Back to the targets before the word is spelled (the letters stay where they are). */
export function changeTarget(hole: Hole, s: GolfState): GolfState {
  if (s.phase !== 'spell' || targetsOf(hole, s).length < 2) return s;
  return { ...s, phase: 'target', resumed: false };
}

const onTray = (s: GolfState, f: (t: Tray) => Tray): GolfState => {
  if (s.phase !== 'spell' || !s.tray) return s;
  const tray = f(s.tray);
  if (tray === s.tray) return s;
  const now = attempt(tray);
  return { ...s, tray, feedback: s.feedback && now === s.feedback.attempt ? s.feedback : null, resumed: false };
};

export const place = (s: GolfState, tileId: number) => onTray(s, (t) => placeTile(t, tileId));
export const takeBack = (s: GolfState, slot: number) => onTray(s, (t) => removeSlot(t, slot));
export const undoTile = (s: GolfState) => onTray(s, undo);
export const clearTiles = (s: GolfState) => onTray(s, clear);

/** The word to submit, or null (not spelling, or slots still empty). */
export const word = (s: GolfState) => (s.phase === 'spell' && s.tray ? attempt(s.tray) : null);

export function notYet(s: GolfState, w: string, cause: string | null = null): GolfState {
  if (s.phase !== 'spell' || !s.tray) return s;
  return { ...s, feedback: { attempt: w, cause } };
}

export function addHint(s: GolfState, hint: Hint): GolfState {
  if (s.phase !== 'spell') return s;
  return { ...s, hints: [...s.hints.filter((h) => h.kind !== hint.kind), hint], shown: s.shown || hint.kind === 'show' };
}

/**
 * The word is right (the session said so): it is the shot. Its quality is the session's evidence; the
 * golden sound and the family are read from the spelled word, after it is spelled.
 */
export function swing(hole: Hole, s: GolfState, w: string, evidence: string, rime: string | null = null): GolfState {
  if (s.phase !== 'spell' && s.phase !== 'target' && s.phase !== 'intro') return s;
  const target = targetOf(hole, s) ?? targetsOf(hole, s).find((t) => t.kind !== 'bold') ?? null;
  if (!target) return s;
  const quality = qualityOf(evidence === 'demonstrated' || s.shown ? 'demonstrated' : evidence);
  const golden = isGolden(hole, w);
  const flight = shotLanding(hole, s.ball, s.lie, target, quality, golden);
  const report: ShotReport = {
    word: w,
    quality: flight.quality,
    earned: quality,
    from: s.lie,
    golden,
    sound: golden ? (hole.golden?.find((p) => w.includes(p)) ?? null) : null,
    rime: hole.family ? rime : null,
    carried: flight.carried,
    splash: flight.splash !== null,
    lie: flight.lie,
    flight: Math.round(flight.flight),
  };
  return { ...s, phase: 'flight', target: target.id, flight, report, strokes: s.strokes + 1, words: [...s.words, w], tray: null, feedback: null, hints: [], shown: false, resumed: false };
}

/** The flight has played (or was skipped): the ball rests; the result card shows the shot. */
export function landed(hole: Hole, s: GolfState): GolfState {
  if (s.phase !== 'flight' || !s.flight) return s;
  return { ...s, phase: 'result', ball: { ...s.flight.rest }, lie: s.flight.lie, flight: null, turn: s.turn + 1, target: null, challengeKey: null, letters: 0 };
}

/** NEXT WORD (or onto the green): the next turn's target choice waits for its word; after the last word, putting. */
export function carryOn(hole: Hole, s: GolfState): GolfState {
  if (s.phase !== 'result') return s;
  if (s.turn < hole.turns.length) return { ...s, phase: 'intro', report: null };
  return { ...s, phase: 'aim', report: s.report, putting: startPutting(hole, s.ball) };
}

// ---------- putting (physics.ts on the green) ----------

function startPutting(hole: Hole, ball: Vec): Putting {
  const g = puttGreen(hole, ball);
  const at = puttable(hole, ball) ? g.tee : nearestPuttable(hole, ball);
  return { ball: at, aim: angleTo(at, g.cup), power: DEFAULT_POWER, lastPower: null, shots: 0, movedAt: null, shot: null, note: null };
}

/** A ball that cannot be putted where it lies (never expected: the course is checked) goes to the green's near side. */
function nearestPuttable(hole: Hole, ball: Vec): Vec {
  const g = puttGreen(hole, ball);
  for (let r = 0.85; r > 0.2; r -= 0.05) {
    const a = angleTo(g.cup, g.tee);
    const p = { x: g.cup.x + Math.cos(a) * hole.green.r * 3 * r, y: g.cup.y + Math.sin(a) * hole.green.r * 3 * r };
    if (canRest(p, g)) return p;
  }
  return puttPoint(hole, hole.pin);
}

const onPutt = (s: GolfState, f: (p: Putting) => Putting): GolfState => (s.phase === 'aim' && s.putting ? { ...s, putting: f(s.putting), resumed: false, report: null } : s);
export const aimBy = (s: GolfState, delta: number) => onPutt(s, (p) => ({ ...p, aim: normalizeAngle(p.aim + delta) }));
export const setAim = (s: GolfState, angle: number) => (Number.isFinite(angle) ? onPutt(s, (p) => ({ ...p, aim: normalizeAngle(angle) })) : s);
export const powerOf = (p: number) => Math.round(clampPower(p) * 100) / 100;
export const setPower = (s: GolfState, power: number) => (Number.isFinite(power) ? onPutt(s, (p) => ({ ...p, power: powerOf(power) })) : s);
export const powerBy = (s: GolfState, delta: number) => (s.putting ? setPower(s, s.putting.power + delta) : s);

/** PUTT: plays the whole putt now (deterministic); the screen then shows its path. */
export function putt(hole: Hole, s: GolfState): GolfState {
  if (s.phase !== 'aim' || !s.putting) return s;
  const p = s.putting;
  const shot = simulateShot(puttGreen(hole, s.ball), p.ball, { angle: p.aim, power: p.power });
  return { ...s, phase: 'rolling', strokes: s.strokes + 1, report: null, putting: { ...p, shot, shots: p.shots + 1, lastPower: p.power, note: null }, resumed: false };
}

/** Why a putt that did not drop missed (information for the next one). */
export function noteFor(shot: ShotResult, from: Vec, cup: Vec, aim: number): ShotNote {
  if (shot.outcome === 'out' || shot.outcome === 'stuck') return 'out';
  if (shot.events.some((e) => e.kind === 'lipOut')) return 'tooFast';
  const dir = { x: Math.cos(aim), y: Math.sin(aim) };
  const toCup = { x: cup.x - from.x, y: cup.y - from.y };
  const along = toCup.x * dir.x + toCup.y * dir.y;
  const side = Math.abs(toCup.x * dir.y - toCup.y * dir.x);
  const went = (shot.rest.x - from.x) * dir.x + (shot.rest.y - from.y) * dir.y;
  const bounced = shot.events.some((e) => e.kind === 'wall' || e.kind === 'bumper');
  if (!bounced && along > 0 && side <= PHYS.cupR * 2 && went < along) return 'short';
  return 'wide';
}

/** The putt has stopped: in the cup (the hole is done), or aim again from where it rests. */
export function puttDone(hole: Hole, s: GolfState): GolfState {
  if (s.phase !== 'rolling' || !s.putting?.shot) return s;
  const p = s.putting;
  const shot = p.shot!;
  if (shot.outcome === 'cup') return { ...s, phase: 'sunk', putting: { ...p, ball: { ...shot.rest }, shot: null } };
  const cup = puttGreen(hole, s.ball).cup;
  const aim = angleTo(shot.rest, cup);
  return { ...s, phase: 'aim', putting: { ...p, ball: { ...shot.rest }, aim, shot: null, note: noteFor(shot, p.ball, cup, p.aim) } };
}

/** MOVE CLOSER: offered after a few putts without the ball dropping (play only: never help, never evidence). */
export function closerOffer(hole: Hole, s: GolfState): Vec | null {
  if (s.phase !== 'aim' || !s.putting || s.putting.shots - (s.putting.movedAt ?? 0) < CLOSER.after) return null;
  return closerSpot(puttGreen(hole, s.ball), s.putting.ball);
}

export function moveCloser(hole: Hole, s: GolfState): GolfState {
  const spot = closerOffer(hole, s);
  if (!spot || !s.putting) return s;
  const cup = puttGreen(hole, s.ball).cup;
  return { ...s, putting: { ...s.putting, ball: spot, aim: angleTo(spot, cup), movedAt: s.putting.shots, note: 'moved' }, resumed: false };
}

/** How far the putt's aim is from the flag, in degrees: negative to the left (as the ball looks at it). */
export function aimOffset(p: Pick<Putting, 'aim' | 'ball'>, cup: Vec): number {
  return (normalizeAngle(p.aim - angleTo(p.ball, cup)) * 180) / Math.PI;
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
const LieSchema = z.enum(['tee', 'fairway', 'rough', 'bunker', 'water', 'green', 'out']);

export const SAVE_VERSION = 2;
export const SaveSchema = z
  .object({
    v: z.literal(SAVE_VERSION),
    game: z.literal('word-golf'),
    hole: z.string().max(40),
    turn: z.number().int().min(0).max(8),
    phase: z.enum(['intro', 'target', 'spell', 'result', 'aim', 'sunk']),
    ball: Point,
    lie: LieSchema,
    target: z.string().max(40).nullable(),
    strokes: z.number().int().min(0).max(99),
    words: z.array(z.string().max(24)).max(8),
    report: z
      .object({ word: z.string().max(24), quality: z.enum(['power', 'good', 'steady']), earned: z.enum(['power', 'good', 'steady']), from: LieSchema, golden: z.boolean(), sound: z.string().max(4).nullable(), rime: z.string().max(4).nullable(), carried: z.boolean().nullable(), splash: z.boolean(), lie: LieSchema, flight: z.number().finite() })
      .strict()
      .nullable(),
    challengeKey: z.string().max(200).nullable(),
    hints: z.array(HintSchema).max(8),
    shown: z.boolean(),
    putting: z
      .object({ ball: Point, aim: z.number().finite(), power: z.number().finite(), lastPower: z.number().finite().nullable(), shots: z.number().int().min(0).max(99), movedAt: z.number().int().min(0).max(99).nullable(), note: z.enum(['short', 'tooFast', 'wide', 'out', 'moved']).nullable() })
      .strict()
      .nullable(),
  })
  .strict();
export type GolfSave = z.infer<typeof SaveSchema>;

/**
 * What is saved: the state as it will be when the current shot or putt ends (a flight or a roll in
 * progress is saved where it stops), so a restart never replays or loses a shot. The tray is not
 * saved: letters placed but not checked are not an answer.
 */
export function toSave(hole: Hole, s: GolfState): GolfSave {
  const t = s.phase === 'flight' ? landed(hole, s) : s.phase === 'rolling' ? puttDone(hole, s) : s;
  const phase = t.phase === 'spell' ? 'spell' : t.phase === 'flight' || t.phase === 'rolling' ? 'aim' : t.phase;
  const p = t.putting;
  return {
    v: SAVE_VERSION,
    game: 'word-golf',
    hole: t.hole,
    turn: t.turn,
    phase,
    ball: { ...t.ball },
    lie: t.lie,
    target: t.target,
    strokes: t.strokes,
    words: [...t.words],
    report: t.report ? { ...t.report } : null,
    challengeKey: t.challengeKey,
    hints: [...t.hints],
    shown: t.shown,
    putting: p ? { ball: { ...p.ball }, aim: p.aim, power: p.power, lastPower: p.lastPower, shots: p.shots, movedAt: p.movedAt, note: p.note } : null,
  };
}

/**
 * A saved game back, made safe. Null (start the hole afresh) for an unreadable save, another hole, a
 * V0 save (the three-hole course, D167), or a ball that cannot be where it was saved. A word turn
 * comes back at its intro (the session decides what the turn's word is); putting comes back as it was.
 */
export function fromSave(raw: unknown, hole: Hole): GolfState | null {
  const parsed = SaveSchema.safeParse(raw);
  if (!parsed.success) return null;
  const v = parsed.data;
  if (v.hole !== hole.id || v.turn > hole.turns.length || v.words.length > hole.turns.length) return null;
  const lie = lieAt(hole, v.ball);
  if (lie === 'out' || lie === 'water') return null;
  const base = newHole(hole);
  const putting = v.putting && (v.phase === 'aim' || v.phase === 'sunk') ? { ...v.putting, ball: { ...v.putting.ball }, shot: null } : null;
  if ((v.phase === 'aim' || v.phase === 'sunk') && (!putting || v.turn < hole.turns.length)) return null;
  if (putting && v.phase === 'aim' && !canRest(putting.ball, puttGreen(hole, v.ball))) return null;
  const wordPhase = v.phase === 'target' || v.phase === 'spell';
  return {
    ...base,
    turn: v.turn,
    phase: wordPhase ? 'intro' : v.phase,
    ball: { ...v.ball },
    lie: v.lie === 'tee' && distance(v.ball, hole.tee) > 0.01 ? lie : v.lie,
    target: wordPhase ? v.target : null,
    strokes: v.strokes,
    words: [...v.words],
    report: v.phase === 'result' ? v.report : null,
    challengeKey: v.challengeKey,
    hints: v.hints,
    shown: v.shown,
    putting,
    resumed: true,
  };
}
