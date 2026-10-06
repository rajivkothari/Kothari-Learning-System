// Landing artwork as data. Pure: no React, no Skia. A landing is a stack of flat cel shapes in
// "door units" (x and y from 0 to 1 across the doorway; circle radii and line widths in units of
// the door width). Each part of the vocabulary (pattern, window, doorway, silhouette, prop,
// sign, emblem) is a small table of shapes, so a new floor is a new catalog entry, never a new
// component. ui/LandingLayer.tsx draws the result with a handful of Skia primitives.
import { ENGINEER_WORLD, contrast, mix, type Hex, type ThemeTokens } from '../../../presentation/design/tokens';
import type { Doorway, Emblem, Landing, Pattern, Prop, Signage, Silhouette, WindowKind } from '../content/landings';

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
  fan: [['c', 0.15, 0.48, 0.11, 'dark'], ['c', 0.15, 0.48, 0.02, 'accentDim'], ['l', 0.15, 0.38, 0.15, 0.58, 0.012, 'accentDim'], ['l', 0.05, 0.48, 0.25, 0.48, 0.012, 'accentDim'], ['c', 0.85, 0.48, 0.11, 'dark'], ['c', 0.85, 0.48, 0.02, 'accentDim']],
  corridor: [['p', [0, WALL_TOP, 0.24, 0.3, 0.24, 0.66, 0, FLOOR_Y], 'dark'], ['p', [1, WALL_TOP, 0.76, 0.3, 0.76, 0.66, 1, FLOOR_Y], 'dark'], ['l', 0.24, 0.3, 0.24, 0.66, 0.006, 'accentDim'], ['l', 0.76, 0.3, 0.76, 0.66, 0.006, 'accentDim']],
  machine: [['R', 0.02, 0.4, 0.26, 0.4, 0.02, 'dark'], ['c', 0.15, 0.52, 0.07, 'darker'], ['c', 0.15, 0.52, 0.025, 'accentDim'], ['R', 0.74, 0.46, 0.23, 0.34, 0.02, 'dark'], ['r', 0.78, 0.52, 0.15, 0.02, 'accentDim']],
  flasks: [['r', 0.03, 0.62, 0.26, 0.02, 'accentDim'], ['c', 0.09, 0.57, 0.035, 'dark'], ['r', 0.08, 0.48, 0.02, 0.06, 'dark'], ['c', 0.2, 0.58, 0.028, 'dark'], ['r', 0.19, 0.5, 0.018, 0.06, 'dark'], ['r', 0.76, 0.34, 0.2, 0.28, 'dark'], ['r', 0.78, 0.37, 0.16, 0.1, 'glass', 0.6]],
  railing: [['l', 0.02, 0.62, 0.98, 0.62, 0.012, 'dark'], ...range(0.06, 0.94, 0.11).map((x): U => ['l', x, 0.62, x, FLOOR_Y, 0.008, 'dark'])],
  racks: [['r', 0.03, 0.26, 0.11, 0.54, 'dark'], ['r', 0.16, 0.26, 0.11, 0.54, 'dark'], ['r', 0.73, 0.26, 0.11, 0.54, 'dark'], ['r', 0.86, 0.26, 0.11, 0.54, 'dark'], ...[0.34, 0.46, 0.58].map((y): U => ['r', 0.05, y, 0.07, 0.012, 'accentDim'])],
  dish: [['c', 0.16, 0.42, 0.1, 'dark'], ['c', 0.19, 0.39, 0.075, 'wall'], ['l', 0.16, 0.5, 0.16, FLOOR_Y, 0.02, 'dark'], ['l', 0.84, 0.3, 0.84, FLOOR_Y, 0.012, 'dark'], ['l', 0.78, 0.4, 0.9, 0.4, 0.008, 'dark']],
  gantry: [['r', 0.02, 0.18, 0.96, 0.03, 'dark'], ['r', 0.06, 0.21, 0.025, 0.59, 'dark'], ['r', 0.915, 0.21, 0.025, 0.59, 'dark'], ['l', 0.8, 0.21, 0.8, 0.4, 0.006, 'dark'], ['r', 0.77, 0.4, 0.06, 0.04, 'accentDim']],
  switchgear: [['r', 0.03, 0.3, 0.24, 0.5, 'dark'], ...[0.36, 0.46, 0.56].map((y): U => ['r', 0.06, y, 0.06, 0.05, 'accentDim']), ['r', 0.74, 0.3, 0.23, 0.5, 'dark'], ['l', 0.74, 0.36, 0.97, 0.36, 0.006, 'accentDim']],
  ladder: [['l', 0.1, WALL_TOP, 0.1, FLOOR_Y, 0.012, 'dark'], ['l', 0.22, WALL_TOP, 0.22, FLOOR_Y, 0.012, 'dark'], ...range(0.16, 0.76, 0.08).map((y): U => ['l', 0.1, y, 0.22, y, 0.01, 'dark']), ['r', 0.8, 0.5, 0.14, 0.3, 'dark']],
  core: [['R', 0.03, 0.22, 0.2, 0.58, 0.08, 'dark'], ['R', 0.07, 0.3, 0.12, 0.42, 0.05, 'lamp', 0.6], ['R', 0.77, 0.22, 0.2, 0.58, 0.08, 'dark'], ['R', 0.81, 0.3, 0.12, 0.42, 0.05, 'lamp', 0.6]],
  planters: [['r', 0.03, 0.66, 0.25, 0.14, 'dark'], ...[0.07, 0.15, 0.23].map((x): U => ['c', x, 0.6, 0.04, 'accentDim']), ['r', 0.74, 0.66, 0.23, 0.14, 'dark'], ...[0.8, 0.9].map((x): U => ['c', x, 0.6, 0.045, 'accentDim'])],
  cabinets: [...[0.03, 0.15].map((x): U => ['r', x, 0.36, 0.11, 0.44, 'dark']), ...[0.75, 0.87].map((x): U => ['r', x, 0.36, 0.11, 0.44, 'dark']), ...[0.48, 0.62].map((y): U => ['l', 0.03, y, 0.27, y, 0.006, 'accentDim'])],
  telescope: [['p', [0.06, 0.5, 0.24, 0.3, 0.27, 0.34, 0.09, 0.54], 'dark'], ['l', 0.15, 0.48, 0.1, FLOOR_Y, 0.01, 'dark'], ['l', 0.15, 0.48, 0.2, FLOOR_Y, 0.01, 'dark'], ['c', 0.86, 0.32, 0.01, 'lamp'], ['c', 0.78, 0.4, 0.008, 'lamp']],
  bridge: [['r', 0, 0.62, 1, 0.04, 'dark'], ['p', [0, 0.62, 0.16, 0.5, 0.32, 0.62], 'dark', 0.8], ['p', [0.68, 0.62, 0.84, 0.5, 1, 0.62], 'dark', 0.8], ['l', 0.16, 0.5, 0.16, 0.62, 0.008, 'dark'], ['l', 0.84, 0.5, 0.84, 0.62, 0.008, 'dark']],
  mast: [['l', 0.14, 0.12, 0.14, FLOOR_Y, 0.014, 'dark'], ['l', 0.14, 0.2, 0.04, FLOOR_Y, 0.006, 'dark'], ['l', 0.14, 0.2, 0.24, FLOOR_Y, 0.006, 'dark'], ['c', 0.14, 0.12, 0.012, 'lamp'], ['p', [0.86, 0.16, 0.86, 0.3, 0.96, 0.23], 'accentDim'], ['l', 0.86, 0.16, 0.86, FLOOR_Y, 0.01, 'dark']],
};

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
};

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
  const shapes: Shape[] = [
    ...place([
      ['r', 0, 0, 1, 1, 'wall'],
      ['r', 0, 0, 1, WALL_TOP, 'wallShade'],
      ['r', 0, WALL_TOP, 0.12, FLOOR_Y - WALL_TOP, 'wallLight'],
    ]),
    ...place(PATTERN[look.pattern]()),
    ...place(WINDOW[look.window]),
    ...place(DOORWAY[look.doorway]),
    ...place(SILHOUETTE[look.silhouette]),
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
