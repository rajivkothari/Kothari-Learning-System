// Landing artwork as data. Pure: no React, no Skia. A landing is a stack of flat cel shapes in
// "door units" (x and y from 0 to 1 across the doorway; circle radii and line widths in units of
// the door width). Each part of the vocabulary (pattern, window, doorway, silhouette, prop,
// sign, emblem) is a small table of shapes, so a new floor is a new catalog entry, never a new
// component. ui/LandingLayer.tsx draws the result with a handful of Skia primitives.
import { ENGINEER_WORLD, contrast, mix, type Hex, type ThemeTokens } from '../../../presentation/design/tokens';
import type { Doorway, Emblem, Landing, Pattern, Prop, Signage, Silhouette, WindowKind } from '../content/landings';
import type { ObjectVisual } from '../content/objectives';

export type Role = 'wall' | 'wallShade' | 'wallLight' | 'dark' | 'darker' | 'accent' | 'accentDim' | 'trim' | 'glass' | 'lamp' | 'floor' | 'floorEdge' | 'signPlate' | 'signInk';

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r?: number; role: Role; opacity?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; role: Role; opacity?: number }
  | { kind: 'poly'; points: number[]; role: Role; opacity?: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; width: number; role: Role; opacity?: number };

/** Compact authoring form, in the unit space of whatever box it is placed into. */
type U =
  | ['r', number, number, number, number, Role, number?]
  | ['R', number, number, number, number, number, Role, number?]
  | ['c', number, number, number, Role, number?]
  | ['p', number[], Role, number?]
  | ['l', number, number, number, number, number, Role, number?];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DOOR: Box = { x: 0, y: 0, w: 1, h: 1 };

function place(us: readonly U[], b: Box = DOOR): Shape[] {
  const X = (v: number) => b.x + v * b.w;
  const Y = (v: number) => b.y + v * b.h;
  return us.map((u): Shape => {
    switch (u[0]) {
      case 'r':
        return { kind: 'rect', x: X(u[1]), y: Y(u[2]), w: u[3] * b.w, h: u[4] * b.h, role: u[5], ...(u[6] !== undefined ? { opacity: u[6] } : {}) };
      case 'R':
        return { kind: 'rect', x: X(u[1]), y: Y(u[2]), w: u[3] * b.w, h: u[4] * b.h, r: u[5] * b.w, role: u[6], ...(u[7] !== undefined ? { opacity: u[7] } : {}) };
      case 'c':
        return { kind: 'circle', cx: X(u[1]), cy: Y(u[2]), r: u[3] * b.w, role: u[4], ...(u[5] !== undefined ? { opacity: u[5] } : {}) };
      case 'p':
        return { kind: 'poly', points: u[1].map((v, i) => (i % 2 === 0 ? X(v) : Y(v))), role: u[2], ...(u[3] !== undefined ? { opacity: u[3] } : {}) };
      case 'l':
        return { kind: 'line', x1: X(u[1]), y1: Y(u[2]), x2: X(u[3]), y2: Y(u[4]), width: u[5] * b.w, role: u[6], ...(u[7] !== undefined ? { opacity: u[7] } : {}) };
    }
  });
}

const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
};

// ---------- zones (door units) ----------

/** The painted floor number sits here. Only calm, high-contrast fills may lie under it. */
export const NUMBER_ZONE: Box = { x: 0.29, y: 0.24, w: 0.42, h: 0.37 };
export const SIGN_ZONE: Box = { x: 0.18, y: 0.085, w: 0.64, h: 0.11 };
const WALL_TOP = 0.08;
const FLOOR_Y = 0.8;
const PROP_SLOTS: Box[] = [
  { x: 0.04, y: 0.64, w: 0.17, h: 0.16 },
  { x: 0.79, y: 0.64, w: 0.17, h: 0.16 },
  { x: 0.22, y: 0.68, w: 0.12, h: 0.12 },
];

// ---------- wall patterns ----------

/** Clip a segment to 0 <= x <= 1 (diagonal patterns start outside the doorway). */
function clipX(x1: number, y1: number, x2: number, y2: number): [number, number, number, number] | null {
  const at = (x: number) => y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  const lo = Math.max(0, Math.min(x1, x2));
  const hi = Math.min(1, Math.max(x1, x2));
  if (lo >= hi) return null;
  return x1 < x2 ? [lo, at(lo), hi, at(hi)] : [hi, at(hi), lo, at(lo)];
}

const PATTERN: Record<Pattern, () => U[]> = {
  plain: () => [],
  tile: () => [...range(0.17, 0.71, 0.09).map((y): U => ['l', 0, y, 1, y, 0.004, 'wallShade', 0.6]), ...range(0.12, 0.88, 0.12).map((x): U => ['l', x, WALL_TOP, x, FLOOR_Y, 0.004, 'wallShade', 0.6])],
  stripe: () => [0.3, 0.5, 0.7].map((y): U => ['r', 0, y, 1, 0.025, 'wallShade', 0.7]),
  panel: () => [...[0.25, 0.5, 0.75].map((x): U => ['l', x, WALL_TOP, x, FLOOR_Y, 0.006, 'wallShade', 0.8]), ['l', 0, 0.45, 1, 0.45, 0.006, 'wallShade', 0.8]],
  brick: () =>
    range(0.14, 0.74, 0.1).flatMap((y, row): U[] => [
      ['l', 0, y, 1, y, 0.005, 'wallShade', 0.7],
      ...range(row % 2 ? 0.125 : 0, 1, 0.25)
        .filter((x) => x > 0 && x < 1)
        .map((x): U => ['l', x, y, x, Math.min(FLOOR_Y, y + 0.1), 0.005, 'wallShade', 0.7]),
    ]),
  mesh: () =>
    range(-0.6, 1, 0.16).flatMap((x) =>
      [clipX(x, FLOOR_Y, x + 0.6, WALL_TOP), clipX(x + 0.6, FLOOR_Y, x, WALL_TOP)].filter((seg) => seg !== null).map((seg): U => ['l', ...seg, 0.004, 'wallShade', 0.55]),
    ),
  grid: () => [...range(0.2, 0.68, 0.16).map((y): U => ['l', 0, y, 1, y, 0.005, 'accentDim', 0.35]), ...range(0.2, 0.8, 0.2).map((x): U => ['l', x, WALL_TOP, x, FLOOR_Y, 0.005, 'accentDim', 0.35])],
  chevron: () =>
    range(0.2, 0.68, 0.12).flatMap((y): U[] => [0, 0.25, 0.5, 0.75].map((x, i): U => ['l', x, i % 2 ? y : y + 0.04, x + 0.25, i % 2 ? y + 0.04 : y, 0.006, 'wallShade', 0.6])),
  louver: () => range(0.27, 0.72, 0.05).flatMap((y): U[] => [['r', 0.03, y, 0.22, 0.018, 'wallShade', 0.8], ['r', 0.75, y, 0.22, 0.018, 'wallShade', 0.8]]),
  dots: () => range(0.18, 0.66, 0.12).flatMap((y): U[] => range(0.08, 0.92, 0.14).map((x): U => ['c', x, y, 0.008, 'wallShade', 0.8])),
  rib: () => range(0.04, 0.96, 0.08).map((x): U => ['r', x, WALL_TOP, 0.02, FLOOR_Y - WALL_TOP, 'wallShade', 0.45]),
  wave: () =>
    [0.28, 0.44, 0.6].flatMap((y): U[] => range(0, 0.833, 1 / 6).map((x, i): U => ['l', x, i % 2 ? y + 0.025 : y, x + 1 / 6, i % 2 ? y : y + 0.025, 0.005, 'wallLight', 0.5])),
};

// ---------- windows ----------

const SKYLINE = [0.12, 0.2, 0.08, 0.16, 0.22, 0.1, 0.18, 0.13];

const WINDOW: Record<WindowKind, U[]> = {
  none: [],
  strip: [['r', 0.04, 0.665, 0.92, 0.055, 'glass'], ...[0.27, 0.5, 0.73].map((x): U => ['l', x, 0.665, x, 0.72, 0.006, 'trim'])],
  porthole: [
    ['c', 0.14, 0.38, 0.085, 'trim'],
    ['c', 0.14, 0.38, 0.068, 'glass'],
    ['c', 0.86, 0.38, 0.085, 'trim'],
    ['c', 0.86, 0.38, 0.068, 'glass'],
  ],
  panorama: [
    ['r', 0.02, 0.22, 0.96, 0.4, 'glass'],
    // A distant skyline either side. Nothing crosses the floor number (no mullions, no towers there).
    ...SKYLINE.map((h, i): U => ['r', i < 4 ? 0.02 + i * 0.065 : 0.72 + (i - 4) * 0.065, 0.62 - h, 0.055, h, 'darker', 0.8]),
    ...[0.27, 0.73].map((x): U => ['l', x, 0.22, x, 0.62, 0.008, 'trim']),
    ['l', 0.02, 0.62, 0.98, 0.62, 0.012, 'trim'],
  ],
  skylight: [['r', 0.18, 0.005, 0.64, 0.06, 'glass'], ...[0.34, 0.5, 0.66].map((x): U => ['l', x, 0.005, x, 0.065, 0.006, 'trim'])],
};

// ---------- back doorway (a door in the landing wall) ----------

const DOORWAY: Record<Doorway, U[]> = {
  none: [],
  plain: [['r', 0.39, 0.46, 0.22, 0.34, 'darker'], ['l', 0.39, 0.46, 0.61, 0.46, 0.01, 'darker'], ['l', 0.39, 0.46, 0.39, FLOOR_Y, 0.01, 'darker'], ['l', 0.61, 0.46, 0.61, FLOOR_Y, 0.01, 'darker']],
  arch: [['r', 0.38, 0.52, 0.24, 0.28, 'darker'], ['c', 0.5, 0.52, 0.12, 'darker'], ['r', 0.36, 0.52, 0.02, 0.28, 'darker'], ['r', 0.62, 0.52, 0.02, 0.28, 'darker']],
  double: [['r', 0.36, 0.44, 0.28, 0.36, 'darker'], ['l', 0.5, 0.44, 0.5, FLOOR_Y, 0.008, 'darker'], ['r', 0.4, 0.5, 0.06, 0.08, 'glass', 0.7], ['r', 0.54, 0.5, 0.06, 0.08, 'glass', 0.7]],
  hatch: [['R', 0.41, 0.5, 0.18, 0.3, 0.03, 'darker'], ['c', 0.5, 0.63, 0.035, 'darker'], ['l', 0.465, 0.63, 0.535, 0.63, 0.006, 'darker']],
  glass: [['r', 0.37, 0.44, 0.26, 0.36, 'glass', 0.75], ['l', 0.5, 0.44, 0.5, FLOOR_Y, 0.006, 'darker'], ['l', 0.37, 0.44, 0.63, 0.44, 0.01, 'darker']],
  bulkhead: [['R', 0.38, 0.45, 0.24, 0.35, 0.04, 'dark'], ['R', 0.4, 0.475, 0.2, 0.31, 0.03, 'darker'], ...[0.41, 0.59].map((x): U => ['c', x, 0.46, 0.006, 'wallShade'])],
};

// ---------- silhouettes (the room's big shape, in the side zones) ----------

const SILHOUETTE: Record<Silhouette, U[]> = {
  desk: [['r', 0.03, 0.58, 0.26, 0.22, 'dark'], ['r', 0.03, 0.56, 0.26, 0.03, 'accentDim'], ['r', 0.77, 0.6, 0.2, 0.2, 'dark'], ['c', 0.87, 0.52, 0.06, 'dark']],
  workbench: [['r', 0.02, 0.6, 0.27, 0.03, 'accentDim'], ['r', 0.04, 0.63, 0.02, 0.17, 'dark'], ['r', 0.25, 0.63, 0.02, 0.17, 'dark'], ['r', 0.76, 0.34, 0.2, 0.3, 'dark'], ['l', 0.8, 0.4, 0.92, 0.4, 0.01, 'accentDim']],
  pipes: [['r', 0.05, 0.1, 0.05, 0.7, 'dark'], ['r', 0.14, 0.1, 0.04, 0.7, 'dark'], ['r', 0.05, 0.36, 0.13, 0.03, 'accentDim'], ['r', 0.84, 0.1, 0.06, 0.7, 'dark'], ['r', 0.72, 0.3, 0.18, 0.04, 'dark']],
  shelves: [['r', 0.03, 0.3, 0.24, 0.5, 'dark'], ...[0.42, 0.56, 0.7].map((y): U => ['r', 0.03, y, 0.24, 0.015, 'accentDim']), ['r', 0.75, 0.3, 0.22, 0.5, 'dark'], ...[0.42, 0.56, 0.7].map((y): U => ['r', 0.75, y, 0.22, 0.015, 'accentDim'])],
  // The left fan's blades are its hero part (HERO.fan): they can spin.
  fan: [['c', 0.15, 0.48, 0.11, 'dark'], ['c', 0.85, 0.48, 0.11, 'dark'], ['c', 0.85, 0.48, 0.02, 'accentDim']],
  corridor: [['p', [0, WALL_TOP, 0.24, 0.3, 0.24, 0.66, 0, FLOOR_Y], 'dark'], ['p', [1, WALL_TOP, 0.76, 0.3, 0.76, 0.66, 1, FLOOR_Y], 'dark'], ['l', 0.24, 0.3, 0.24, 0.66, 0.006, 'accentDim'], ['l', 0.76, 0.3, 0.76, 0.66, 0.006, 'accentDim']],
  // The motor wheel's spokes are the hero part (HERO.machine): the sheave can turn.
  machine: [['R', 0.02, 0.4, 0.26, 0.4, 0.02, 'dark'], ['c', 0.15, 0.52, 0.07, 'darker'], ['R', 0.74, 0.46, 0.23, 0.34, 0.02, 'dark'], ['r', 0.78, 0.52, 0.15, 0.02, 'accentDim']],
  flasks: [['r', 0.03, 0.62, 0.26, 0.02, 'accentDim'], ['c', 0.09, 0.57, 0.035, 'dark'], ['r', 0.08, 0.48, 0.02, 0.06, 'dark'], ['c', 0.2, 0.58, 0.028, 'dark'], ['r', 0.19, 0.5, 0.018, 0.06, 'dark'], ['r', 0.76, 0.34, 0.2, 0.28, 'dark'], ['r', 0.78, 0.37, 0.16, 0.1, 'glass', 0.6]],
  railing: [['l', 0.02, 0.62, 0.98, 0.62, 0.012, 'dark'], ...range(0.06, 0.94, 0.11).map((x): U => ['l', x, 0.62, x, FLOOR_Y, 0.008, 'dark'])],
  racks: [['r', 0.03, 0.26, 0.11, 0.54, 'dark'], ['r', 0.16, 0.26, 0.11, 0.54, 'dark'], ['r', 0.73, 0.26, 0.11, 0.54, 'dark'], ['r', 0.86, 0.26, 0.11, 0.54, 'dark'], ...[0.34, 0.46, 0.58].map((y): U => ['r', 0.05, y, 0.07, 0.012, 'accentDim'])],
  dish: [['c', 0.16, 0.42, 0.1, 'dark'], ['c', 0.19, 0.39, 0.075, 'wall'], ['l', 0.16, 0.5, 0.16, FLOOR_Y, 0.02, 'dark'], ['l', 0.84, 0.3, 0.84, FLOOR_Y, 0.012, 'dark'], ['l', 0.78, 0.4, 0.9, 0.4, 0.008, 'dark']],
  gantry: [['r', 0.02, 0.18, 0.96, 0.03, 'dark'], ['r', 0.06, 0.21, 0.025, 0.59, 'dark'], ['r', 0.915, 0.21, 0.025, 0.59, 'dark'], ['l', 0.8, 0.21, 0.8, 0.4, 0.006, 'dark'], ['r', 0.77, 0.4, 0.06, 0.04, 'accentDim']],
  switchgear: [['r', 0.03, 0.3, 0.24, 0.5, 'dark'], ...[0.36, 0.46, 0.56].map((y): U => ['r', 0.06, y, 0.06, 0.05, 'accentDim']), ['r', 0.74, 0.3, 0.23, 0.5, 'dark'], ['l', 0.74, 0.36, 0.97, 0.36, 0.006, 'accentDim']],
  ladder: [['l', 0.1, WALL_TOP, 0.1, FLOOR_Y, 0.012, 'dark'], ['l', 0.22, WALL_TOP, 0.22, FLOOR_Y, 0.012, 'dark'], ...range(0.16, 0.76, 0.08).map((y): U => ['l', 0.1, y, 0.22, y, 0.01, 'dark']), ['r', 0.8, 0.5, 0.14, 0.3, 'dark']],
  // The glowing cells are the hero part (HERO.core): they can pulse.
  core: [['R', 0.03, 0.22, 0.2, 0.58, 0.08, 'dark'], ['R', 0.77, 0.22, 0.2, 0.58, 0.08, 'dark']],
  planters: [['r', 0.03, 0.66, 0.25, 0.14, 'dark'], ...[0.07, 0.15, 0.23].map((x): U => ['c', x, 0.6, 0.04, 'accentDim']), ['r', 0.74, 0.66, 0.23, 0.14, 'dark'], ...[0.8, 0.9].map((x): U => ['c', x, 0.6, 0.045, 'accentDim'])],
  cabinets: [...[0.03, 0.15].map((x): U => ['r', x, 0.36, 0.11, 0.44, 'dark']), ...[0.75, 0.87].map((x): U => ['r', x, 0.36, 0.11, 0.44, 'dark']), ...[0.48, 0.62].map((y): U => ['l', 0.03, y, 0.27, y, 0.006, 'accentDim'])],
  // The tube is the hero part (HERO.telescope): it can tilt.
  telescope: [['l', 0.15, 0.48, 0.1, FLOOR_Y, 0.01, 'dark'], ['l', 0.15, 0.48, 0.2, FLOOR_Y, 0.01, 'dark'], ['c', 0.86, 0.32, 0.01, 'lamp'], ['c', 0.78, 0.4, 0.008, 'lamp']],
  bridge: [['r', 0, 0.62, 1, 0.04, 'dark'], ['p', [0, 0.62, 0.16, 0.5, 0.32, 0.62], 'dark', 0.8], ['p', [0.68, 0.62, 0.84, 0.5, 1, 0.62], 'dark', 0.8], ['l', 0.16, 0.5, 0.16, 0.62, 0.008, 'dark'], ['l', 0.84, 0.5, 0.84, 0.62, 0.008, 'dark']],
  mast: [['l', 0.14, 0.12, 0.14, FLOOR_Y, 0.014, 'dark'], ['l', 0.14, 0.2, 0.04, FLOOR_Y, 0.006, 'dark'], ['l', 0.14, 0.2, 0.24, FLOOR_Y, 0.006, 'dark'], ['c', 0.14, 0.12, 0.012, 'lamp'], ['p', [0.86, 0.16, 0.86, 0.3, 0.96, 0.23], 'accentDim'], ['l', 0.86, 0.16, 0.86, FLOOR_Y, 0.01, 'dark']],
  // Themed destinations (D130). Broad genre only: no borrowed characters, blocks, pipes or logos.
  // Floating ledges climbing on the left, a stepped stack on the right.
  platforms: [['R', 0.03, 0.62, 0.2, 0.05, 0.01, 'dark'], ['R', 0.08, 0.47, 0.17, 0.05, 0.01, 'dark'], ['R', 0.02, 0.32, 0.15, 0.05, 0.01, 'dark'], ...[0.62, 0.47, 0.32].map((y, i): U => ['r', [0.03, 0.08, 0.02][i]!, y, [0.2, 0.17, 0.15][i]!, 0.012, 'accentDim']), ['r', 0.74, 0.68, 0.23, 0.12, 'dark'], ['r', 0.8, 0.56, 0.17, 0.12, 'dark'], ['r', 0.86, 0.44, 0.11, 0.12, 'dark']],
  // A ruined column and a hanging banner on the left, a wind turbine on the right (blades can be art moving parts).
  turbine: [['r', 0.03, 0.26, 0.14, 0.04, 'dark'], ['r', 0.05, 0.3, 0.1, 0.5, 'dark'], ['r', 0.19, 0.56, 0.07, 0.24, 'dark'], ['p', [0.19, 0.12, 0.27, 0.12, 0.27, 0.4, 0.23, 0.35, 0.19, 0.4], 'accentDim'], ['l', 0.86, 0.38, 0.86, FLOOR_Y, 0.014, 'dark'], ['l', 0.86, 0.38, 0.86, 0.16, 0.012, 'dark'], ['l', 0.86, 0.38, 0.74, 0.46, 0.012, 'dark'], ['l', 0.86, 0.38, 0.98, 0.46, 0.012, 'dark'], ['c', 0.86, 0.38, 0.022, 'accentDim']],
  // Stacked cubes on the left, a small crane on the right (its jib stays above the number).
  blocks: [['r', 0.02, 0.62, 0.12, 0.18, 'dark'], ['r', 0.14, 0.68, 0.12, 0.12, 'darker'], ['r', 0.02, 0.5, 0.12, 0.12, 'accentDim'], ['l', 0.02, 0.62, 0.14, 0.62, 0.006, 'wallShade'], ['r', 0.86, 0.2, 0.04, 0.6, 'dark'], ['l', 0.73, 0.2, 0.98, 0.2, 0.014, 'dark'], ['l', 0.76, 0.2, 0.76, 0.36, 0.004, 'dark'], ['r', 0.745, 0.36, 0.03, 0.035, 'accentDim']],
  // A rooftop putting green across the floor, a flag and hole on the right, a low parapet on the left.
  green: [['p', [0.06, FLOOR_Y, 0.16, 0.66, 0.84, 0.66, 0.94, FLOOR_Y], 'accentDim'], ['r', 0.02, 0.56, 0.2, 0.04, 'dark'], ['l', 0.8, 0.34, 0.8, 0.72, 0.008, 'dark'], ['p', [0.8, 0.34, 0.94, 0.38, 0.8, 0.43], 'accent'], ['c', 0.8, 0.725, 0.014, 'darker'], ['c', 0.36, 0.73, 0.01, 'wallLight']],
};

// ---------- hero parts (the touchable thing in a landing, and how it reacts) ----------

/**
 * A landing's hero: the part of its silhouette a learner can touch, and how it moves. Each part
 * animates on its own: spin and tilt rotate about a pivot, slide moves sideways, pulse and reveal
 * change opacity. `hit` is the touch area in door units (the UI widens it to at least 64 pt).
 */
export type HeroMotion = 'spin' | 'tilt' | 'slide' | 'pulse' | 'reveal';
export interface HeroPart {
  shapes: Shape[];
  motion: HeroMotion;
  /** Door units. */
  pivot: { x: number; y: number };
  /** spin: turns; tilt: radians; slide: door widths; pulse: added opacity; reveal: peak opacity. */
  amount: number;
  /** Opacity at rest (reveal parts are hidden at rest). */
  base: number;
}
export interface Hero {
  parts: HeroPart[];
  hit: Box;
}

/** Spokes or blades around a centre, kept round in pixels (`aspect` = door width / height). */
function spokes(cx: number, cy: number, r: number, n: number, width: number, aspect: number, role: Role): U[] {
  return Array.from({ length: n }, (_, i): U => {
    const a = (i / n) * Math.PI * 2 + Math.PI / 4;
    return ['l', cx - Math.cos(a) * r * 0.15, cy - Math.sin(a) * r * 0.15 * aspect, cx + Math.cos(a) * r, cy + Math.sin(a) * r * aspect, width, role];
  });
}

const part = (us: U[], motion: HeroMotion, pivot: { x: number; y: number }, amount: number, base = 1): HeroPart => ({ shapes: place(us), motion, pivot, amount, base });

const HERO: Partial<Record<Silhouette, (aspect: number) => Hero>> = {
  fan: (aspect) => ({
    parts: [part([...spokes(0.15, 0.48, 0.095, 4, 0.03, aspect, 'accentDim'), ['c', 0.15, 0.48, 0.022, 'accent']], 'spin', { x: 0.15, y: 0.48 }, 2)],
    hit: { x: 0.03, y: 0.33, w: 0.24, h: 0.3 },
  }),
  machine: (aspect) => ({
    parts: [part([...spokes(0.15, 0.52, 0.062, 3, 0.016, aspect, 'accentDim'), ['c', 0.15, 0.52, 0.025, 'accentDim']], 'spin', { x: 0.15, y: 0.52 }, 1)],
    hit: { x: 0.02, y: 0.4, w: 0.26, h: 0.4 },
  }),
  core: () => ({
    parts: [part([['R', 0.07, 0.3, 0.12, 0.42, 0.05, 'lamp'], ['R', 0.81, 0.3, 0.12, 0.42, 0.05, 'lamp']], 'pulse', { x: 0.13, y: 0.51 }, 0.4, 0.6)],
    hit: { x: 0.03, y: 0.22, w: 0.2, h: 0.58 },
  }),
  cabinets: () => ({
    parts: [
      part([['r', 0.04, 0.5, 0.09, 0.07, 'accentDim'], ['l', 0.07, 0.535, 0.1, 0.535, 0.008, 'dark']], 'slide', { x: 0.085, y: 0.535 }, 0.07),
      part([['r', 0.05, 0.25, 0.17, 0.11, 'glass'], ['l', 0.05, 0.305, 0.22, 0.305, 0.004, 'trim'], ['l', 0.135, 0.25, 0.135, 0.36, 0.004, 'trim'], ['l', 0.08, 0.27, 0.11, 0.33, 0.004, 'trim']], 'reveal', { x: 0.135, y: 0.305 }, 1, 0),
    ],
    hit: { x: 0.03, y: 0.36, w: 0.24, h: 0.44 },
  }),
  telescope: () => ({
    parts: [
      part([['p', [0.06, 0.5, 0.24, 0.3, 0.27, 0.34, 0.09, 0.54], 'dark']], 'tilt', { x: 0.15, y: 0.48 }, -0.26),
      part([['c', 0.3, 0.2, 0.014, 'lamp']], 'reveal', { x: 0.3, y: 0.2 }, 1, 0.25),
    ],
    hit: { x: 0.03, y: 0.28, w: 0.27, h: 0.52 },
  }),
};

/** The hero of a landing (drawn on every visit, touchable where the catalog says so). Null if none. */
export function heroFor(l: Landing, aspect: number): Hero | null {
  return HERO[l.look.silhouette]?.(aspect) ?? null;
}

/**
 * Where each hero part is at reaction progress `p` (0 to 1). Pure, so tests and the renderer
 * agree. Under reduced motion nothing moves: reveal and pulse parts show their peak, still.
 */
export function heroPose(partOf: Pick<HeroPart, 'motion' | 'amount' | 'base'>, p: number, reduced: boolean): { rotate: number; dx: number; opacity: number } {
  'worklet';
  const hump = Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
  const active = p > 0 && p < 1;
  if (reduced) {
    const peak = active ? 1 : 0;
    if (partOf.motion === 'pulse') return { rotate: 0, dx: 0, opacity: Math.min(1, partOf.base + partOf.amount * peak) };
    if (partOf.motion === 'reveal') return { rotate: 0, dx: 0, opacity: active ? partOf.amount : partOf.base };
    return { rotate: 0, dx: 0, opacity: partOf.base };
  }
  switch (partOf.motion) {
    case 'spin':
      // Ease out: quick start, gentle stop.
      return { rotate: (1 - (1 - p) * (1 - p)) * partOf.amount * Math.PI * 2, dx: 0, opacity: partOf.base };
    case 'tilt':
      return { rotate: hump * partOf.amount, dx: 0, opacity: partOf.base };
    case 'slide':
      return { rotate: 0, dx: hump * partOf.amount, opacity: partOf.base };
    case 'pulse':
      // Two soft breaths over the reaction (well under 3 Hz), never below the resting glow.
      return { rotate: 0, dx: 0, opacity: Math.min(1, partOf.base + partOf.amount * Math.abs(Math.sin(Math.PI * 2 * p))) };
    case 'reveal':
      return { rotate: 0, dx: 0, opacity: partOf.base + (partOf.amount - partOf.base) * hump };
  }
}

export { REACTION_MS } from '../content/landings';

// ---------- mission objects (layered onto any landing; D123) ----------

/**
 * Where a mission object stands: front and centre on the landing floor, below the painted floor
 * number and clear of the prop slots. Wide objects (the crew, the dock) take a wider slot.
 */
export const OBJECT_SLOT: Box = { x: 0.34, y: 0.6, w: 0.32, h: 0.2 };
export const OBJECT_SLOT_WIDE: Box = { x: 0.26, y: 0.6, w: 0.48, h: 0.2 };

const person = (cx: number): U[] => [
  ['r', cx - 0.07, 0.38, 0.14, 0.38, 'dark'],
  ['r', cx - 0.07, 0.5, 0.14, 0.05, 'glass'],
  ['r', cx - 0.06, 0.76, 0.05, 0.24, 'dark'],
  ['r', cx + 0.01, 0.76, 0.05, 0.24, 'dark'],
  ['c', cx, 0.27, 0.055, 'darker'],
  ['p', [cx - 0.075, 0.25, cx + 0.075, 0.25, cx + 0.055, 0.15, cx - 0.055, 0.15], 'accent'],
];

/** Shapes in object-slot units (0..1 across the slot), back to front. Roles map to `objectColors`. */
const OBJECT: Record<ObjectVisual, U[]> = {
  // A hard-shell technician case: orange shell, dark handle, steel latches, a wrench mark.
  repairKit: [
    ['r', 0.08, 0.95, 0.84, 0.05, 'darker', 0.35],
    ['r', 0.36, 0.22, 0.05, 0.2, 'dark'],
    ['r', 0.59, 0.22, 0.05, 0.2, 'dark'],
    ['r', 0.36, 0.22, 0.28, 0.06, 'dark'],
    ['R', 0.1, 0.4, 0.8, 0.56, 0.06, 'accent'],
    ['r', 0.1, 0.4, 0.8, 0.12, 'accentDim'],
    ['r', 0.2, 0.47, 0.09, 0.1, 'trim'],
    ['r', 0.71, 0.47, 0.09, 0.1, 'trim'],
    ['l', 0.4, 0.86, 0.58, 0.64, 0.06, 'signInk'],
    ['c', 0.6, 0.62, 0.05, 'signInk'],
  ],
  // A steel toolbox with an orange lid and handles of tools showing.
  toolbox: [
    ['r', 0.06, 0.95, 0.88, 0.05, 'darker', 0.35],
    ['l', 0.3, 0.42, 0.24, 0.12, 0.05, 'accentDim'],
    ['l', 0.7, 0.42, 0.78, 0.14, 0.04, 'dark'],
    ['r', 0.3, 0.2, 0.05, 0.22, 'dark'],
    ['r', 0.65, 0.2, 0.05, 0.22, 'dark'],
    ['r', 0.3, 0.2, 0.4, 0.06, 'dark'],
    ['p', [0.06, 0.52, 0.94, 0.52, 0.86, 0.4, 0.14, 0.4], 'accent'],
    ['R', 0.08, 0.52, 0.84, 0.44, 0.03, 'trim'],
    ['l', 0.08, 0.74, 0.92, 0.74, 0.015, 'dark'],
    ['r', 0.44, 0.6, 0.12, 0.05, 'dark'],
  ],
  // A parts bin with gears on top and a labelled band.
  spareParts: [
    ['r', 0.1, 0.95, 0.8, 0.05, 'darker', 0.35],
    ['c', 0.38, 0.42, 0.16, 'accent'],
    ['c', 0.38, 0.42, 0.06, 'dark'],
    ['c', 0.66, 0.4, 0.12, 'accentDim'],
    ['c', 0.66, 0.4, 0.045, 'dark'],
    ['p', [0.1, 0.5, 0.9, 0.5, 0.82, 0.97, 0.18, 0.97], 'trim'],
    ['r', 0.28, 0.66, 0.44, 0.1, 'signInk'],
    ['l', 0.1, 0.5, 0.9, 0.5, 0.02, 'dark'],
  ],
  // Two crew members in helmets and hi-vis, and their work cart with a radio.
  crew: [
    ['r', 0.08, 0.96, 0.86, 0.04, 'darker', 0.35],
    ...person(0.2),
    ...person(0.42),
    ['r', 0.62, 0.55, 0.32, 0.28, 'trim'],
    ['r', 0.62, 0.55, 0.32, 0.05, 'dark'],
    ['c', 0.67, 0.9, 0.05, 'dark'],
    ['c', 0.89, 0.9, 0.05, 'dark'],
    ['r', 0.7, 0.38, 0.1, 0.17, 'dark'],
    ['l', 0.78, 0.38, 0.82, 0.12, 0.012, 'dark'],
    ['c', 0.82, 0.12, 0.025, 'lamp'],
  ],
  // The crew's beacon: a short mast with the amber diamond lamp, the same mark as on the shaft map.
  beacon: [
    ['r', 0.3, 0.92, 0.4, 0.08, 'dark'],
    ['l', 0.5, 0.92, 0.5, 0.3, 0.05, 'trim'],
    ['c', 0.5, 0.2, 0.24, 'lamp', 0.18],
    ['p', [0.5, 0.0, 0.64, 0.2, 0.5, 0.4, 0.36, 0.2], 'lamp'],
  ],
  // The loading dock: a hazard-striped edge and a pallet of strapped crates waiting.
  loadingDock: [
    ['r', 0, 0.9, 1, 0.1, 'dark'],
    ...[0.04, 0.2, 0.36, 0.52, 0.68, 0.84].map((x): U => ['p', [x, 1, x + 0.08, 1, x + 0.14, 0.9, x + 0.06, 0.9], 'accent']),
    ['r', 0.2, 0.8, 0.6, 0.07, 'trim'],
    ['r', 0.22, 0.48, 0.27, 0.32, 'accentDim'],
    ['r', 0.51, 0.48, 0.27, 0.32, 'accentDim'],
    ['r', 0.36, 0.2, 0.27, 0.28, 'accentDim'],
    ['l', 0.355, 0.48, 0.355, 0.8, 0.02, 'dark'],
    ['l', 0.645, 0.48, 0.645, 0.8, 0.02, 'dark'],
    ['l', 0.495, 0.2, 0.495, 0.48, 0.02, 'dark'],
  ],
};

const WIDE: readonly ObjectVisual[] = ['crew', 'loadingDock'];

/** Where an object's slot is, in door units. */
export const objectSlot = (visual: ObjectVisual): Box => (WIDE.includes(visual) ? OBJECT_SLOT_WIDE : OBJECT_SLOT);

/** A mission object's shapes, in door units. */
export function objectShapes(visual: ObjectVisual): Shape[] {
  return place(OBJECT[visual], objectSlot(visual));
}

/** One fixed look for mission objects on every landing (token roles; see `objects` in the tokens). */
export function objectColors(t: ThemeTokens = ENGINEER_WORLD): LandingColors {
  const o = t.objects;
  return { wall: o.ink, wallShade: o.ink, wallLight: o.ink, dark: o.ink, darker: t.shadow.color, accent: o.body, accentDim: o.bodyShade, trim: o.metal, glass: o.hiVis, lamp: t.palette.accentPrimary, floor: o.ink, floorEdge: o.ink, signPlate: o.mark, signInk: o.mark };
}

// ---------- props (small, on the floor line; placed in a slot box) ----------

const PROP: Record<Prop, U[]> = {
  bench: [['r', 0, 0.55, 1, 0.15, 'dark'], ['r', 0.08, 0.7, 0.1, 0.3, 'dark'], ['r', 0.82, 0.7, 0.1, 0.3, 'dark']],
  pot: [['p', [0.3, 0.6, 0.7, 0.6, 0.62, 1, 0.38, 1], 'accentDim'], ['c', 0.5, 0.4, 0.2, 'dark'], ['c', 0.35, 0.3, 0.12, 'dark']],
  toolboard: [['r', 0.05, 0, 0.9, 0.7, 'dark'], ['l', 0.25, 0.15, 0.25, 0.5, 0.05, 'accentDim'], ['l', 0.5, 0.15, 0.5, 0.45, 0.05, 'accentDim'], ['c', 0.75, 0.3, 0.1, 'accentDim']],
  crate: [['r', 0.1, 0.35, 0.8, 0.65, 'dark'], ['l', 0.1, 0.35, 0.9, 1, 0.05, 'accentDim'], ['l', 0.9, 0.35, 0.1, 1, 0.05, 'accentDim']],
  cone: [['p', [0.5, 0.2, 0.75, 0.95, 0.25, 0.95], 'accent'], ['r', 0.15, 0.92, 0.7, 0.08, 'dark'], ['r', 0.38, 0.55, 0.24, 0.08, 'wall']],
  barrel: [['R', 0.2, 0.25, 0.6, 0.75, 0.12, 'dark'], ['l', 0.2, 0.45, 0.8, 0.45, 0.05, 'accentDim'], ['l', 0.2, 0.78, 0.8, 0.78, 0.05, 'accentDim']],
  gauge: [['l', 0.5, 0.55, 0.5, 1, 0.06, 'dark'], ['c', 0.5, 0.35, 0.28, 'trim'], ['c', 0.5, 0.35, 0.22, 'darker'], ['l', 0.5, 0.35, 0.65, 0.22, 0.05, 'accent']],
  lamp: [['l', 0.5, 0.2, 0.5, 1, 0.06, 'dark'], ['p', [0.3, 0.25, 0.7, 0.25, 0.6, 0.05, 0.4, 0.05], 'dark'], ['c', 0.5, 0.28, 0.08, 'lamp', 0.9]],
  pipe: [['r', 0, 0.55, 1, 0.16, 'dark'], ['r', 0.3, 0.5, 0.08, 0.26, 'accentDim'], ['r', 0.7, 0.5, 0.08, 0.26, 'accentDim']],
  monitor: [['r', 0.1, 0.2, 0.8, 0.5, 'dark'], ['r', 0.16, 0.26, 0.68, 0.38, 'glass', 0.8], ['r', 0.4, 0.7, 0.2, 0.3, 'dark']],
  clipboard: [['r', 0.25, 0.15, 0.5, 0.75, 'trim'], ['r', 0.38, 0.1, 0.24, 0.1, 'dark'], ...[0.35, 0.5, 0.65].map((y): U => ['l', 0.33, y, 0.67, y, 0.04, 'darker'])],
  cable: [['l', 0, 1, 0.3, 0.6, 0.06, 'dark'], ['l', 0.3, 0.6, 0.7, 0.75, 0.06, 'dark'], ['l', 0.7, 0.75, 1, 0.45, 0.06, 'dark'], ['c', 1, 0.45, 0.06, 'accentDim']],
  bin: [['p', [0.2, 0.3, 0.8, 0.3, 0.72, 1, 0.28, 1], 'dark'], ['r', 0.15, 0.25, 0.7, 0.08, 'accentDim']],
  trolley: [['r', 0.05, 0.45, 0.9, 0.35, 'dark'], ['l', 0.05, 0.45, 0, 0.1, 0.05, 'dark'], ['c', 0.22, 0.92, 0.08, 'darker'], ['c', 0.78, 0.92, 0.08, 'darker']],
};

// ---------- emblems (on the sign, in a square box) ----------

const EMBLEM: Record<Emblem, U[]> = {
  star: [['p', [0.5, 0.05, 0.62, 0.38, 0.95, 0.38, 0.68, 0.6, 0.78, 0.95, 0.5, 0.74, 0.22, 0.95, 0.32, 0.6, 0.05, 0.38, 0.38, 0.38], 'signInk']],
  wrench: [['l', 0.25, 0.75, 0.68, 0.32, 0.14, 'signInk'], ['c', 0.72, 0.28, 0.2, 'signInk'], ['c', 0.8, 0.2, 0.09, 'signPlate']],
  drop: [['p', [0.5, 0.05, 0.8, 0.55, 0.5, 0.95, 0.2, 0.55], 'signInk'], ['c', 0.5, 0.62, 0.3, 'signInk']],
  box: [['r', 0.15, 0.3, 0.7, 0.6, 'signInk'], ['p', [0.15, 0.3, 0.35, 0.1, 0.95, 0.1, 0.85, 0.3], 'signInk', 0.7]],
  fan: [['c', 0.5, 0.5, 0.45, 'signInk'], ['c', 0.5, 0.5, 0.3, 'signPlate'], ['l', 0.5, 0.2, 0.5, 0.8, 0.1, 'signInk'], ['l', 0.2, 0.5, 0.8, 0.5, 0.1, 'signInk']],
  hex: [['p', [0.5, 0.05, 0.9, 0.28, 0.9, 0.72, 0.5, 0.95, 0.1, 0.72, 0.1, 0.28], 'signInk'], ['c', 0.5, 0.5, 0.15, 'signPlate']],
  gear: [['c', 0.5, 0.5, 0.36, 'signInk'], ['r', 0.42, 0.02, 0.16, 0.96, 'signInk'], ['r', 0.02, 0.42, 0.96, 0.16, 'signInk'], ['c', 0.5, 0.5, 0.14, 'signPlate']],
  flask: [['r', 0.4, 0.05, 0.2, 0.35, 'signInk'], ['p', [0.4, 0.38, 0.6, 0.38, 0.9, 0.95, 0.1, 0.95], 'signInk']],
  eye: [['p', [0.03, 0.5, 0.5, 0.18, 0.97, 0.5, 0.5, 0.82], 'signInk'], ['c', 0.5, 0.5, 0.16, 'signPlate'], ['c', 0.5, 0.5, 0.08, 'signInk']],
  dial: [['c', 0.5, 0.55, 0.42, 'signInk'], ['c', 0.5, 0.55, 0.32, 'signPlate'], ['l', 0.5, 0.55, 0.75, 0.3, 0.1, 'signInk']],
  wave: [0.3, 0.6].flatMap((y): U[] => [['l', 0.05, y + 0.1, 0.35, y - 0.05, 0.1, 'signInk'], ['l', 0.35, y - 0.05, 0.65, y + 0.1, 0.1, 'signInk'], ['l', 0.65, y + 0.1, 0.95, y - 0.05, 0.1, 'signInk']]),
  compass: [['c', 0.5, 0.5, 0.45, 'signInk'], ['c', 0.5, 0.5, 0.35, 'signPlate'], ['p', [0.5, 0.15, 0.6, 0.5, 0.5, 0.85, 0.4, 0.5], 'signInk']],
  plug: [['R', 0.2, 0.35, 0.6, 0.45, 0.1, 'signInk'], ['r', 0.32, 0.08, 0.1, 0.3, 'signInk'], ['r', 0.58, 0.08, 0.1, 0.3, 'signInk'], ['r', 0.45, 0.78, 0.1, 0.2, 'signInk']],
  arrow: [['p', [0.5, 0.05, 0.92, 0.5, 0.65, 0.5, 0.65, 0.95, 0.35, 0.95, 0.35, 0.5, 0.08, 0.5], 'signInk']],
  bolt: [['p', [0.6, 0.02, 0.2, 0.55, 0.47, 0.55, 0.38, 0.98, 0.8, 0.42, 0.53, 0.42], 'signInk']],
  leaf: [['p', [0.15, 0.85, 0.2, 0.35, 0.55, 0.1, 0.9, 0.12, 0.85, 0.5, 0.55, 0.82], 'signInk'], ['l', 0.15, 0.85, 0.7, 0.3, 0.06, 'signPlate']],
  book: [['p', [0.05, 0.2, 0.48, 0.28, 0.48, 0.9, 0.05, 0.82], 'signInk'], ['p', [0.52, 0.28, 0.95, 0.2, 0.95, 0.82, 0.52, 0.9], 'signInk']],
  ring: [['c', 0.5, 0.5, 0.42, 'signInk'], ['c', 0.5, 0.5, 0.26, 'signPlate'], ['c', 0.82, 0.18, 0.1, 'signInk']],
  globe: [['c', 0.5, 0.5, 0.45, 'signInk'], ['l', 0.05, 0.5, 0.95, 0.5, 0.06, 'signPlate'], ['l', 0.5, 0.05, 0.5, 0.95, 0.06, 'signPlate'], ['l', 0.18, 0.25, 0.82, 0.25, 0.05, 'signPlate'], ['l', 0.18, 0.75, 0.82, 0.75, 0.05, 'signPlate']],
  flag: [['l', 0.15, 0.05, 0.15, 0.98, 0.08, 'signInk'], ['p', [0.18, 0.08, 0.92, 0.25, 0.18, 0.5], 'signInk']],
  stairs: [['p', [0.05, 0.95, 0.05, 0.7, 0.35, 0.7, 0.35, 0.4, 0.65, 0.4, 0.65, 0.1, 0.95, 0.1, 0.95, 0.95], 'signInk']],
  swirl: [['c', 0.5, 0.5, 0.44, 'signInk'], ['c', 0.58, 0.46, 0.3, 'signPlate'], ['c', 0.48, 0.52, 0.17, 'signInk'], ['c', 0.53, 0.49, 0.08, 'signPlate']],
  cube: [['p', [0.5, 0.05, 0.92, 0.27, 0.5, 0.49, 0.08, 0.27], 'signInk'], ['p', [0.08, 0.33, 0.47, 0.54, 0.47, 0.96, 0.08, 0.75], 'signInk'], ['p', [0.53, 0.54, 0.92, 0.33, 0.92, 0.75, 0.53, 0.96], 'signInk', 0.75]],
};

/** An emblem on its own, in a unit square (the Engineer Log draws them beside each place). */
export function emblemShapes(emblem: Emblem): Shape[] {
  return place(EMBLEM[emblem]);
}

/** Colors for an emblem drawn on its own: ink on a plate (only those two roles appear in emblems). */
export function emblemColors(ink: Hex, plate: Hex): LandingColors {
  return { wall: plate, wallShade: plate, wallLight: plate, dark: ink, darker: ink, accent: ink, accentDim: ink, trim: ink, glass: plate, lamp: ink, floor: plate, floorEdge: ink, signPlate: plate, signInk: ink };
}

// ---------- signs ----------

/** The plate behind the name, per sign style. The name itself is native text (crisp, accessible). */
const SIGN: Record<Signage, U[]> = {
  plaque: [['R', 0, 0, 1, 1, 0.03, 'signPlate'], ['R', 0.01, 0.08, 0.98, 0.84, 0.025, 'signPlate'], ['l', 0.02, 0.92, 0.98, 0.92, 0.012, 'accent']],
  stencil: [['l', 0.12, 1, 0.88, 1, 0.01, 'accent', 0.8]],
  lightbox: [['r', 0, 0, 1, 1, 'darker'], ['r', 0.012, 0.1, 0.976, 0.8, 'signPlate']],
  enamel: [['R', 0, 0, 1, 1, 0.05, 'signPlate'], ['R', 0.015, 0.1, 0.97, 0.8, 0.04, 'signPlate'], ['l', 0.03, 0.12, 0.97, 0.12, 0.006, 'signInk', 0.35]],
  hanging: [['l', 0.15, -0.7, 0.15, 0, 0.008, 'darker'], ['l', 0.85, -0.7, 0.85, 0, 0.008, 'darker'], ['R', 0, 0, 1, 1, 0.02, 'signPlate']],
};

// ---------- colors ----------

export type LandingColors = Record<Role, Hex>;

/** The plate color a sign style uses, before the unlit treatment. */
function plateFor(signage: Signage, wall: Hex, accent: Hex, trim: Hex, lamp: Hex): Hex {
  switch (signage) {
    case 'stencil':
      return wall; // lettering straight on the wall
    case 'lightbox':
      return mix(lamp, wall, 0.15);
    case 'enamel':
      return mix(accent, '#000000', 0.25);
    default:
      return trim;
  }
}

/** Readable ink for a plate: the token ink or the deepest void, whichever contrasts more. */
function inkFor(plate: Hex, t: ThemeTokens): Hex {
  return contrast(t.palette.ink, plate) >= contrast(t.palette.void, plate) ? t.palette.ink : t.palette.void;
}

export function landingColors(l: Landing, t: ThemeTokens = ENGINEER_WORLD): LandingColors {
  const sw = t.places.swatches;
  const look = l.look;
  const wall = sw[look.wall] ?? t.palette.paint;
  const accent = sw[look.accent] ?? t.palette.inkMuted;
  const trim = sw[look.trim] ?? t.palette.surface[2];
  const tint = t.places.light[look.light] ?? t.palette.light;
  const dormant = l.state === 'dormant';
  const lamp = dormant ? mix(tint, t.palette.void, 0.7) : tint;
  let plate = plateFor(look.signage, wall, accent, trim, lamp);
  let ink = inkFor(plate, t);
  if (!look.signLit) {
    plate = mix(plate, t.palette.void, 0.55);
    ink = mix(inkFor(plate, t), plate, 0.55);
  }
  const floor = mix(t.palette.floor, wall, 0.25);
  return {
    wall,
    wallShade: mix(wall, t.palette.void, 0.35),
    wallLight: mix(wall, tint, 0.16),
    dark: mix(wall, t.palette.void, 0.55),
    darker: mix(wall, t.palette.void, 0.78),
    accent,
    accentDim: mix(accent, wall, 0.45),
    trim,
    // Glass shows the light beyond, kept mid-dark so the white floor number stays readable.
    glass: mix(mix(tint, t.palette.paint, 0.5), wall, 0.45),
    lamp,
    floor,
    floorEdge: mix(floor, t.palette.light, 0.2),
    signPlate: plate,
    signInk: ink,
  };
}

// ---------- the whole landing ----------

export interface LandingArt {
  /** Back to front. */
  shapes: Shape[];
  /** The hero (heroFor) is drawn between shapes[heroIndex - 1] and shapes[heroIndex]: in the silhouette's layer. */
  heroIndex: number;
  /** Where the place name goes (native text), in door units, and its color. */
  sign: { box: Box; color: Hex };
  /** Light that spills into the cabin when the doors open: color and strength (0..1). */
  spill: { color: Hex; strength: number };
  /** A flat wash over the whole landing for its light (after everything else). */
  wash: { color: Hex; opacity: number };
}

const EMBLEM_BOX = (sign: Box): Box => ({ x: sign.x + sign.w * 0.03, y: sign.y + sign.h * 0.15, w: sign.h * 0.7, h: sign.h * 0.7 });

export function landingArt(l: Landing, aspect: number, t: ThemeTokens = ENGINEER_WORLD): LandingArt {
  const c = landingColors(l, t);
  const look = l.look;
  // Emblems are drawn square: their box is as tall in pixels as it is wide.
  const emblemBox = EMBLEM_BOX(SIGN_ZONE);
  const square = { ...emblemBox, w: emblemBox.h / aspect };
  const back: Shape[] = [
    ...place([
      ['r', 0, 0, 1, 1, 'wall'],
      ['r', 0, 0, 1, WALL_TOP, 'wallShade'],
      ['r', 0, WALL_TOP, 0.12, FLOOR_Y - WALL_TOP, 'wallLight'],
    ]),
    ...place(PATTERN[look.pattern]()),
    ...place(WINDOW[look.window]),
    ...place(DOORWAY[look.doorway]),
    ...place(SILHOUETTE[look.silhouette]),
  ];
  const shapes: Shape[] = [
    ...back,
    ...place([
      ['r', 0, 0.755, 1, 0.025, 'accent', 0.85],
      ['r', 0, FLOOR_Y, 1, 1 - FLOOR_Y, 'floor'],
      ['l', 0, FLOOR_Y, 1, FLOOR_Y, 0.006, 'floorEdge'],
    ]),
    ...look.props.flatMap((p, i) => place(PROP[p], PROP_SLOTS[i]!)),
    ...place(SIGN[look.signage], SIGN_ZONE),
    ...place(EMBLEM[look.emblem], square),
  ];
  const textX = square.x + square.w + 0.015;
  const dim = l.state === 'dormant';
  return {
    shapes,
    heroIndex: back.length,
    sign: { box: { x: textX, y: SIGN_ZONE.y, w: SIGN_ZONE.x + SIGN_ZONE.w - textX - 0.01, h: SIGN_ZONE.h }, color: c.signInk },
    spill: { color: c.lamp, strength: dim ? 0.05 : look.light === 'dim' ? 0.08 : 0.16 },
    wash: dim ? { color: t.palette.void, opacity: 0.35 } : { color: c.lamp, opacity: look.light === 'dim' ? 0.04 : 0.07 },
  };
}

/** Effective color of a shape over the wall (flat alpha blend), for contrast checks. */
export function effectiveColor(s: Shape, colors: LandingColors): Hex {
  return mix(colors.wall, colors[s.role], s.opacity ?? 1);
}

/** Axis-aligned bounds of a shape in door units. */
export function bounds(s: Shape): Box {
  switch (s.kind) {
    case 'rect':
      return { x: s.x, y: s.y, w: s.w, h: s.h };
    case 'circle':
      return { x: s.cx - s.r, y: s.cy - s.r, w: s.r * 2, h: s.r * 2 };
    case 'poly': {
      const xs = s.points.filter((_, i) => i % 2 === 0);
      const ys = s.points.filter((_, i) => i % 2 === 1);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    case 'line':
      return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
  }
}
