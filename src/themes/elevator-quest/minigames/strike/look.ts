// Strike Lab's colours (all from the design tokens: the Test Lab after hours, a maple lane, white
// pins with a cyan band, the navy Smart Ball that glows cyan when powered) and the lane's perspective.
// Pure. Red is never used, not even for a gutter ball.
import { ENGINEER_WORLD as T, celBands } from '../../../../presentation/design/tokens';
import { LANE } from './lane';

const S: Record<string, string> = T.places.swatches;
const sw = (name: string) => S[name] ?? T.palette.metal;

export const BOWL = {
  room: T.palette.void,
  approach: celBands(sw('graphite'), T),
  lane: celBands(sw('tan'), T),
  gutter: celBands(sw('charcoalBlue'), T),
  pit: T.palette.void,
  board: sw('brass'),
  arrow: sw('navy'),
  foul: T.palette.accentSecondary,
  pin: celBands(sw('chalk'), T),
  pinBand: T.palette.accentSecondary,
  pinDown: sw('fog'),
  ball: celBands(sw('navy'), T),
  ballDim: celBands(sw('slate'), T),
  glow: T.palette.accentSecondary,
  power: T.palette.accentPrimary,
  powerOff: sw('graphite'),
  target: T.palette.accentPrimary,
  path: T.palette.light,
  trail: T.palette.inkMuted,
  shadow: T.palette.void,
  lights: sw('violet'),
} as const;

export const INK = {
  text: T.palette.ink,
  dim: T.palette.inkMuted,
  card: T.palette.surface[2],
  cardEdge: T.palette.surface[3],
  panel: T.palette.surface[1],
  night: T.palette.void,
  accent: T.palette.accentPrimary,
  cool: T.palette.accentSecondary,
  ok: T.palette.success,
} as const;

/** The lane's camera: world (metres) to screen (points), a simple one-point perspective. */
export interface Proj {
  cx: number;
  top: number;
  bottom: number;
  /** Points per metre at the near edge. */
  ppm: number;
  depth: number;
  near: number;
  sFar: number;
}

const DEPTH = 10;
/** The camera's near edge, a little behind the foul line, so the ball starts above the bottom. */
const NEAR = -1.1;

/** A camera that fits the lane and its gutters into a box. */
export function makeProj(box: { x: number; y: number; width: number; height: number }): Proj {
  const sFar = DEPTH / (DEPTH + LANE.pit + 0.3 - NEAR);
  const sHead = DEPTH / (DEPTH + LANE.head - NEAR);
  // The pin deck spans 40% of the box, so the pins read; the near end of the lane may run off the sides.
  const ppm = Math.min((box.width * 0.4) / (LANE.width * sHead), (box.height * 1.4) / (LANE.width + LANE.gutter * 2));
  // Headroom above the pit for standing pins and their numbers.
  const top = box.y + box.height * 0.17;
  return { cx: box.x + box.width / 2, top, bottom: box.y + box.height, ppm, depth: DEPTH, near: NEAR, sFar };
}

/** Screen point and scale for a lane point. */
export function project(p: Proj, x: number, y: number): { x: number; y: number; s: number } {
  'worklet';
  const s = p.depth / (p.depth + y - p.near);
  const t = (s - p.sFar) / (1 - p.sFar);
  return { x: p.cx + x * p.ppm * s, y: p.top + (p.bottom - p.top) * t, s };
}

/** The lane x a screen x points at, on the line through the head pin (for aiming by touch). */
export function aimFromTouch(p: Proj, sx: number): number {
  const head = project(p, 0, LANE.head);
  const half = (LANE.width / 2) * p.ppm * head.s;
  return Math.max(-1, Math.min(1, (sx - p.cx) / (half * 2.2)));
}
