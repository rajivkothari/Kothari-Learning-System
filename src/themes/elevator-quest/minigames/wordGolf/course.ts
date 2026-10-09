// Rooftop Word Golf's three holes and the game's words, from
// content/themes/elevator-quest/minigames/golfCourses.json. Pure: zod, the physics and the shared template fill only.
//
// validateCourses checks what can be checked without playing: the green is a simple polygon inside
// the hole, the tee and the cup sit on it clear of every rail, wall and post, walls and posts stand
// on the green, ids and numbers are in order, and every word is short, plain (no em dashes) and uses
// only the placeholders its line allows. Whether each hole can be played (a solution exists, a sloppy
// shot misses) is proved by course.test.ts, which plays them.
import { z } from 'zod';

import { fill } from '../../../content/missionCopy';
import coursesJson from '../../../../../content/themes/elevator-quest/minigames/golfCourses.json';
import { PHYS, canRest, clearance, distance, insidePolygon, type HoleGeometry, type Vec } from './physics';

const Point = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();

const HoleSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    number: z.number().int().min(1),
    name: z.string().min(1).max(40),
    intro: z.string().min(1).max(120),
    size: z.object({ w: z.number().min(40).max(400), h: z.number().min(40).max(400) }).strict(),
    green: z.array(Point).min(3).max(24),
    walls: z.array(z.object({ a: Point, b: Point }).strict()).max(8),
    bumpers: z.array(z.object({ x: z.number(), y: z.number(), r: z.number().min(2).max(12) }).strict()).max(4),
    tee: Point,
    cup: Point,
    /** Good shots the hole is designed for (1 to 3). Never shown as a target: there is no score. */
    shots: z.number().int().min(1).max(3),
  })
  .strict();

/**
 * The putting words and the screen-reader words, and the placeholders each may use. The spelling's
 * words, the shared labels and Lifty's lines are EC's (content/minigames.ts, merged in copy.ts).
 */
export const COPY_VARS = {
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
  takeShot: [],
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
  wordsLabel: [],
  holesDone: ['done', 'count'],
  courseLabel: ['name'],
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
    schemaVersion: z.literal(1),
    theme: z.literal('elevator-quest'),
    game: z.literal('word-golf'),
    note: z.string().optional(),
    holes: z.array(HoleSchema).min(1).max(9),
    copy: CopySchema,
  })
  .strict();

export type HoleSpec = z.infer<typeof HoleSchema>;
export type GolfCourses = z.infer<typeof CoursesSchema>;

export interface CourseIssue {
  code: string;
  path: string;
  message: string;
}

const segmentsCross = (a: Vec, b: Vec, c: Vec, d: Vec) => {
  const o = (p: Vec, q: Vec, r: Vec) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};

/** The geometry the physics plays. */
export const geometryOf = (h: HoleSpec): HoleGeometry => ({ green: h.green, walls: h.walls, bumpers: h.bumpers, tee: h.tee, cup: h.cup });

/** Placeholders a line uses. */
const placeholders = (t: string) => [...t.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]!);

export function validateCourses(raw: unknown): { ok: boolean; issues: CourseIssue[]; courses: GolfCourses | null } {
  const parsed = CoursesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ code: `schema.${i.code}`, path: i.path.join('.'), message: i.message })), courses: null };
  const c = parsed.data;
  const issues: CourseIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ code, path, message });

  const ids = new Set<string>();
  c.holes.forEach((h, i) => {
    const at = `holes.${i}`;
    if (ids.has(h.id)) err('dup.id', at, `Two holes are called "${h.id}"`);
    ids.add(h.id);
    if (h.number !== i + 1) err('ref.number', `${at}.number`, `Hole ${i + 1} is numbered ${h.number}`);
    const g = geometryOf(h);
    const within = (p: Vec) => p.x >= 0 && p.y >= 0 && p.x <= h.size.w && p.y <= h.size.h;
    h.green.forEach((p, k) => {
      if (!within(p)) err('ref.green', `${at}.green.${k}`, 'A corner of the green is outside the hole');
    });
    // A simple polygon: no two edges that are not neighbours cross.
    const n = h.green.length;
    for (let a = 0; a < n; a++)
      for (let b = a + 2; b < n; b++) {
        if (a === 0 && b === n - 1) continue;
        if (segmentsCross(h.green[a]!, h.green[(a + 1) % n]!, h.green[b]!, h.green[(b + 1) % n]!)) err('ref.green', `${at}.green`, `Edges ${a} and ${b} of the green cross`);
      }
    if (!canRest(h.tee, g)) err('ref.tee', `${at}.tee`, 'The tee must be on the green, clear of every rail, wall and post');
    if (!insidePolygon(h.cup, h.green) || clearance(h.cup, g) < PHYS.cupR + PHYS.ballR) err('ref.cup', `${at}.cup`, 'The cup must be on the green with room for the ball all round it');
    if (distance(h.tee, h.cup) < 40) err('ref.cup', `${at}.cup`, 'The cup is too close to the tee to be a putt');
    h.walls.forEach((w, k) => {
      if (!within(w.a) || !within(w.b)) err('ref.wall', `${at}.walls.${k}`, 'A wall reaches outside the hole');
      if (distance(w.a, w.b) < 4) err('ref.wall', `${at}.walls.${k}`, 'A wall is too short to see');
    });
    h.bumpers.forEach((b, k) => {
      if (!insidePolygon(b, h.green)) err('ref.bumper', `${at}.bumpers.${k}`, 'A post stands off the green');
      if (distance(b, h.cup) < b.r + PHYS.cupR + PHYS.ballR * 2) err('ref.bumper', `${at}.bumpers.${k}`, 'A post crowds the cup');
    });
  });

  for (const [key, line] of Object.entries(c.copy) as [CopyKey, string][]) {
    const path = `copy.${key}`;
    for (const p of placeholders(line)) if (!(COPY_VARS[key] as readonly string[]).includes(p)) err('copy.placeholder', path, `"{${p}}" is not available here`);
    if (/[\u2013\u2014]/.test(line)) err('copy.dash', path, 'No em or en dashes in child-facing words (house style)');
    if (/\b(wrong|fail|failed|lose|lost|score|points?)\b/i.test(line)) err('copy.tone', path, 'No score or failure words: a miss is information, not a loss');
  }
  return { ok: issues.length === 0, issues, courses: issues.length === 0 ? c : null };
}

const checked = validateCourses(coursesJson);
if (!checked.courses) throw new Error(`golfCourses.json is invalid: ${checked.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);

export const GOLF_COURSES: GolfCourses = checked.courses;
export const HOLES: readonly HoleSpec[] = GOLF_COURSES.holes;
export const GOLF_COPY: GolfCopy = GOLF_COURSES.copy;

/** Fill a line's placeholders. */
export const say = (line: string, vars: Record<string, string | number> = {}): string => fill(line, vars);
