// Rooftop Word Golf's ten holes and the game's words (D197), from
// content/themes/elevator-quest/minigames/golfCourses.json. Pure: zod, the course model and the shared
// template fill only.
//
// validateCourses checks the file: the shapes (fairway.ts checkHole: every outcome of every hole ends
// where it can be played on, inside the carry of the shortest word the turn can give), holes in order
// with unique missions (hole 1 is the original word-golf mission), and every word plain and short with
// only the placeholders its line allows. The carry check needs the words each turn can give (the
// missions and the spelling pack): the course test passes them; loading the file checks the rest.
import { z } from 'zod';

import { fill } from '../../../content/missionCopy';
import coursesJson from '../../../../../content/themes/elevator-quest/minigames/golfCourses.json';
import { checkHole, type FairwayIssue, type Hole } from './fairway';

const Point = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const Poly = z.array(Point).min(3).max(24);

const TargetSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    kind: z.enum(['safe', 'bold', 'green']),
    at: Point,
    short: Point.optional(),
    drop: Point.optional(),
  })
  .strict();

const HoleSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    number: z.number().int().min(1),
    mission: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().min(1).max(32),
    intro: z.string().min(1).max(120),
    par: z.number().int().min(2).max(6),
    size: z.object({ w: z.number().min(80).max(600), h: z.number().min(80).max(600) }).strict(),
    tee: Point,
    pin: Point,
    green: z.object({ x: z.number(), y: z.number(), r: z.number().min(12).max(30) }).strict(),
    fairway: z.array(Poly).min(1).max(6),
    bunkers: z.array(Poly).max(4),
    water: z.array(Poly).max(2),
    turns: z.array(z.object({ targets: z.array(TargetSchema).min(1).max(3), wind: Point.optional() }).strict()).min(1).max(4),
    golden: z.array(z.string().regex(/^[a-z]{1,3}$/)).min(1).max(8).optional(),
    family: z.literal(true).optional(),
    decor: z
      .array(z.object({ kind: z.enum(['tree', 'flowers', 'rock', 'bush']), x: z.number(), y: z.number() }).strict())
      .max(12)
      .optional(),
  })
  .strict();

/**
 * The golf words and the screen-reader words, and the placeholders each may use. The spelling's
 * words, the shared labels and Lifty's lines are EC's (content/minigames.ts, merged in copy.ts).
 */
export const COPY_VARS = {
  // The hole and the course.
  holeOf: ['n', 'count'],
  par: ['par'],
  toPin: ['yards'],
  courseTitle: [],
  holesLabel: [],
  holeTile: ['n'],
  locked: [],
  done: [],
  close: [],
  playHole: [],
  playAgain: [],
  teeOff: [],
  towerCup: [],
  // The lie.
  lieTee: [],
  lieFairway: [],
  lieRough: [],
  lieBunker: [],
  lieGreen: [],
  roughNote: [],
  bunkerNote: [],
  // The word's power and the shot to pick.
  wordPower: ['letters', 'yards'],
  pickShot: [],
  targetSafe: [],
  targetBold: [],
  targetGreen: [],
  safeNote: [],
  boldNote: [],
  greenNote: [],
  thenToPin: ['yards'],
  // The wind (D199).
  windLight: [],
  windBreeze: [],
  windStrong: [],
  windNote: [],
  windLabel: ['strength', 'way'],
  wayLeft: [],
  wayRight: [],
  wayUp: [],
  wayDown: [],
  spellToSwing: [],
  changeShot: [],
  yards: ['yards'],
  best: ['n'],
  // The shot.
  swing: [],
  shotPower: [],
  shotGood: [],
  shotSteady: [],
  shotGolden: [],
  powerWhy: [],
  goodWhy: [],
  steadyWhy: [],
  goldenWhy: ['sound'],
  familyWhy: ['rime'],
  carried: [],
  cameShort: [],
  splash: [],
  inSand: [],
  inRough: [],
  onGreen: [],
  nextShot: [],
  // Putting.
  aimPrompt: [],
  aimLabel: [],
  aimLeft: [],
  aimRight: [],
  aimDrag: [],
  aimValueOn: [],
  aimValueLittleLeft: [],
  aimValueLittleRight: [],
  aimValueLeft: [],
  aimValueRight: [],
  power: [],
  lessPower: [],
  morePower: [],
  powerValue: ['n'],
  putt: [],
  rolling: [],
  short: [],
  tooFast: [],
  wide: [],
  out: [],
  moved: [],
  moveCloser: [],
  moveCloserHint: [],
  // The hole done.
  eagle: [],
  birdie: [],
  parDone: [],
  holed: [],
  strokes: ['n'],
  // Spelling, for screen readers and the card.
  start: [],
  meaningLabel: [],
  blankSpoken: [],
  hearItHint: [],
  backHint: [],
  tilesLabel: [],
  slotsLabel: [],
  phonics: ['hint'],
  pattern: ['pattern'],
  syllables: ['syllables'],
  replayLine: [],
  wordsLabel: [],
  courseLabel: ['name'],
  greenLabel: [],
  tileLabel: ['letter'],
  slotLabel: ['n', 'letter'],
  slotEmpty: ['n'],
  modelLabel: [],
  patternLabel: [],
} as const satisfies Record<string, readonly string[]>;

export type CopyKey = keyof typeof COPY_VARS;
export type GolfCopy = Record<CopyKey, string>;

const CopySchema = z.object(Object.fromEntries(Object.keys(COPY_VARS).map((k) => [k, z.string().min(1).max(90)])) as Record<CopyKey, z.ZodString>).strict();

const CoursesSchema = z
  .object({
    schemaVersion: z.literal(2),
    theme: z.literal('elevator-quest'),
    game: z.literal('word-golf'),
    note: z.string().optional(),
    holes: z.array(HoleSchema).min(1).max(12),
    copy: CopySchema,
  })
  .strict();

export type GolfCourses = z.infer<typeof CoursesSchema>;
export type CourseIssue = FairwayIssue;

/** Placeholders a line uses. */
const placeholders = (t: string) => [...t.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]!);

/**
 * The course file checked. `shortestWord(mission, turn)` gives the fewest letters a turn's word can
 * have (from the missions and the pack); without it the carry check is left to the course test.
 */
export function validateCourses(raw: unknown, shortestWord?: (mission: string, turn: number) => number | null): { ok: boolean; issues: CourseIssue[]; courses: GolfCourses | null } {
  const parsed = CoursesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ code: `schema.${i.code}`, path: i.path.join('.'), message: i.message })), courses: null };
  const c = parsed.data;
  const issues: CourseIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ code, path, message });

  const ids = new Set<string>();
  const missions = new Set<string>();
  c.holes.forEach((h, i) => {
    const at = `holes.${i}`;
    if (ids.has(h.id)) err('dup.id', at, `Two holes are called "${h.id}"`);
    if (missions.has(h.mission)) err('dup.mission', at, `Two holes play mission "${h.mission}"`);
    ids.add(h.id);
    missions.add(h.mission);
    if (h.number !== i + 1) err('ref.number', `${at}.number`, `Hole ${i + 1} is numbered ${h.number}`);
    if (i === 0 && h.mission !== 'word-golf') err('ref.mission', `${at}.mission`, 'Hole 1 plays the original word-golf mission');
    if (h.par < h.turns.length + 1) err('ref.par', `${at}.par`, 'Par allows at least one putt after the words');
    issues.push(...checkHole(h as Hole, at, (turn) => (shortestWord ? shortestWord(h.mission, turn) : 3)).filter((x) => shortestWord || x.code !== 'carry.short'));
  });

  for (const [key, line] of Object.entries(c.copy) as [CopyKey, string][]) {
    const path = `copy.${key}`;
    for (const p of placeholders(line)) if (!(COPY_VARS[key] as readonly string[]).includes(p)) err('copy.placeholder', path, `"{${p}}" is not available here`);
    if (/[–—]/.test(line)) err('copy.dash', path, 'No em or en dashes in child-facing words (house style)');
    if (/\b(wrong|fail|failed|lose|lost|score|points?|bogey|penalty)\b/i.test(line)) err('copy.tone', path, 'No score or failure words: a miss is information, not a loss');
  }
  for (const [i, h] of c.holes.entries())
    for (const [field, line] of [
      ['name', h.name],
      ['intro', h.intro],
    ] as const)
      if (/[–—]/.test(line) || /\b(wrong|fail|failed|lose|lost|score|points?|bogey|penalty)\b/i.test(line)) err('copy.tone', `holes.${i}.${field}`, 'Plain, kind words only');
  return { ok: issues.length === 0, issues, courses: issues.length === 0 ? c : null };
}

const checked = validateCourses(coursesJson);
if (!checked.courses) throw new Error(`golfCourses.json is invalid: ${checked.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);

export const GOLF_COURSES: GolfCourses = checked.courses;
export const HOLES: readonly Hole[] = GOLF_COURSES.holes as Hole[];
export const GOLF_COPY: GolfCopy = GOLF_COURSES.copy;

/** The hole a mission plays (hole 1 for an unknown mission). */
export const holeFor = (missionId: string, holes: readonly Hole[] = HOLES): Hole => holes.find((h) => h.mission === missionId) ?? holes[0]!;
/** Every hole's mission, in course order (the catalog's list). */
export const HOLE_MISSIONS: readonly string[] = HOLES.map((h) => h.mission);

/**
 * Which holes can be played: every finished one (to replay it) and the first one not finished. Holes
 * open in order; nothing is ever taken away.
 */
export function openHoles(finished: readonly string[], holes: readonly Hole[] = HOLES): Set<string> {
  const open = new Set<string>();
  for (const h of holes) {
    open.add(h.mission);
    if (!finished.includes(h.mission)) break;
  }
  for (const m of finished) if (holes.some((h) => h.mission === m)) open.add(m);
  return open;
}

/** A new play session's hole: the first one not finished, or the last once every hole is. */
export const nextHoleFor = (finished: readonly string[], holes: readonly Hole[] = HOLES): Hole => holes.find((h) => !finished.includes(h.mission)) ?? holes[holes.length - 1]!;

/** The hole after this one, or null after the last. */
export function holeAfter(missionId: string, holes: readonly Hole[] = HOLES): Hole | null {
  const i = holes.findIndex((h) => h.mission === missionId);
  return i >= 0 && i + 1 < holes.length ? holes[i + 1]! : null;
}

/** Fill a line's placeholders. */
export const say = (line: string, vars: Record<string, string | number> = {}): string => fill(line, vars);
