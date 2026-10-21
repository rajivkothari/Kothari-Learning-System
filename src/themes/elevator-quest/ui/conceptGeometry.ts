// Concept D cabin geometry: one-point perspective inside the car, facing the doors. Pure math,
// no React or Skia, testable for every window size.
//
// The back wall is a flat plane (the gameplay plane: indicator, door frame, doors). The
// ceiling, floor and side walls are trapezoids that converge on one vanishing point behind
// the doors. Features on those planes (light rails, sconces, handrails, floor seams) are
// placed with `wallPoint`, `ceilingPoint` and `floorPoint` in plane coordinates
// (t = depth, 0 near the viewer and 1 at the back wall; u or v = position across the plane),
// so every element foreshortens the same way at every size.
//
// Attention order is unchanged from the cel scene: mission status (top left) -> indicator
// (top center) -> doors (center) -> panel (beside the cabin). The companion stands in
// `liftyZone`, the front-left foreground, which never overlaps the door frame.
import type { Box } from './layout';

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Four corners in drawing order (a top-left, b top-right, c bottom-right, d bottom-left). */
export interface Quad {
  a: Pt;
  b: Pt;
  c: Pt;
  d: Pt;
}

export interface ConceptGeometry {
  width: number;
  height: number;
  vp: Pt;
  /** The back wall plane. Its bottom edge is the cabin floor line. */
  back: Rect;
  floorY: number;
  ceiling: Quad;
  floor: Quad;
  leftWall: Quad;
  rightWall: Quad;
  /** Recessed warm light rails and a centre panel in the ceiling. */
  ceilingLights: Quad[];
  /** Tube sconces on the side walls, with brass caps at each end. */
  sconces: { body: Quad; capTop: Quad; capBottom: Quad }[];
  handrails: Quad[];
  /** Vertical brass trims on each side wall, near the back corner. */
  cornerTrims: Quad[];
  /** Floor seams: converging lines and depth lines, as point pairs. */
  floorSeams: [Pt, Pt][];
  /** Brass header plate that carries the indicator, above the door frame. */
  header: Rect;
  indicator: Rect;
  frame: Rect;
  /** Width of the frame band around the opening. */
  band: number;
  door: Rect;
  /** Door jambs seen inside the opening (the reveal), giving the frame depth. */
  reveal: { left: Quad; right: Quad; top: Quad };
  threshold: Rect;
  /** Back-wall panels either side of the frame. */
  panels: Rect[];
  /** Painted floor number on the landing wall, centred in the doorway. */
  landingNumber: { cx: number; y: number; height: number };
  /** Where a companion may stand without covering the doors or the indicator. */
  liftyZone: Rect;
  labels: { text: string; x: number; y: number; size: number }[];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function conceptGeometry(box: Pick<Box, 'width' | 'height'>): ConceptGeometry {
  const w = box.width;
  const h = box.height;
  const back: Rect = { x: w * 0.17, y: h * 0.09, w: w * 0.66, h: h * 0.73 };
  const floorY = back.y + back.h;
  const vp: Pt = { x: w / 2, y: back.y + back.h * 0.58 };

  const wallPoint = (side: 'left' | 'right', t: number, v: number): Pt => {
    const x = side === 'left' ? lerp(0, back.x, t) : lerp(w, back.x + back.w, t);
    const yTop = lerp(0, back.y, t);
    const yBot = lerp(h, floorY, t);
    return { x, y: lerp(yTop, yBot, v) };
  };
  const ceilingPoint = (u: number, t: number): Pt => ({ x: lerp(lerp(0, w, u), lerp(back.x, back.x + back.w, u), t), y: lerp(0, back.y, t) });
  const floorPoint = (u: number, t: number): Pt => ({ x: lerp(lerp(0, w, u), lerp(back.x, back.x + back.w, u), t), y: lerp(h, floorY, t) });

  const ceiling: Quad = { a: { x: 0, y: 0 }, b: { x: w, y: 0 }, c: { x: back.x + back.w, y: back.y }, d: { x: back.x, y: back.y } };
  const floor: Quad = { a: { x: back.x, y: floorY }, b: { x: back.x + back.w, y: floorY }, c: { x: w, y: h }, d: { x: 0, y: h } };
  const leftWall: Quad = { a: { x: 0, y: 0 }, b: { x: back.x, y: back.y }, c: { x: back.x, y: floorY }, d: { x: 0, y: h } };
  const rightWall: Quad = { a: { x: back.x + back.w, y: back.y }, b: { x: w, y: 0 }, c: { x: w, y: h }, d: { x: back.x + back.w, y: floorY } };

  // Ceiling: two long light rails near the walls and one centre panel, all recessed.
  const rail = (u0: number, u1: number, t0: number, t1: number): Quad => ({ a: ceilingPoint(u0, t0), b: ceilingPoint(u1, t0), c: ceilingPoint(u1, t1), d: ceilingPoint(u0, t1) });
  const ceilingLights = [rail(0.22, 0.28, 0.12, 0.9), rail(0.72, 0.78, 0.12, 0.9), rail(0.4, 0.6, 0.45, 0.6)];

  // Sconces: one vertical tube per wall, mid depth, with caps.
  const sconce = (side: 'left' | 'right') => {
    const t0 = 0.47;
    const t1 = 0.53;
    const q = (v0: number, v1: number): Quad => ({ a: wallPoint(side, t0, v0), b: wallPoint(side, t1, v0), c: wallPoint(side, t1, v1), d: wallPoint(side, t0, v1) });
    return { body: q(0.2, 0.58), capTop: q(0.17, 0.2), capBottom: q(0.58, 0.61) };
  };
  const sconces = [sconce('left'), sconce('right')];

  // Handrails: a tapered bar along each wall at hand height.
  const railQuad = (side: 'left' | 'right'): Quad => ({ a: wallPoint(side, 0.04, 0.6), b: wallPoint(side, 0.97, 0.6), c: wallPoint(side, 0.97, 0.63), d: wallPoint(side, 0.04, 0.63) });
  const handrails = [railQuad('left'), railQuad('right')];
  // Brass corner trims: a vertical strip on each wall just before the back-wall corner.
  const trim = (side: 'left' | 'right'): Quad => ({ a: wallPoint(side, 0.9, 0.02), b: wallPoint(side, 0.935, 0.02), c: wallPoint(side, 0.935, 0.98), d: wallPoint(side, 0.9, 0.98) });
  const cornerTrims = [trim('left'), trim('right')];

  // Floor seams: converging lines plus depth lines spaced closer toward the back.
  const floorSeams: [Pt, Pt][] = [];
  for (let i = 1; i < 8; i++) floorSeams.push([floorPoint(i / 8, 0), floorPoint(i / 8, 1)]);
  for (const t of [0.22, 0.42, 0.58, 0.72, 0.84, 0.93]) floorSeams.push([floorPoint(0, t), floorPoint(1, t)]);

  // Header plate and indicator on the back wall, above the frame.
  const indH = clamp(h * 0.1, 38, 76);
  const indW = Math.max(110, Math.min(back.w * 0.34, indH * 2.6));
  const header: Rect = { x: w / 2 - indW / 2 - 28, y: back.y + 4, w: indW + 56, h: indH + 12 };
  const indicator: Rect = { x: w / 2 - indW / 2, y: back.y + 10, w: indW, h: indH };

  // Door frame from under the header to the floor line.
  const band = clamp(w * 0.02, 10, 18);
  const frameTop = header.y + header.h + Math.max(6, h * 0.015);
  const doorH = Math.max(40, floorY - frameTop - band);
  const doorW = Math.min(back.w * 0.62, doorH * 0.98);
  const door: Rect = { x: w / 2 - doorW / 2, y: frameTop + band, w: doorW, h: doorH };
  const frame: Rect = { x: door.x - band, y: frameTop, w: doorW + band * 2, h: doorH + band };
  // Reveal: the jambs recede toward the vanishing point by a small depth.
  const depth = clamp(w * 0.012, 6, 12);
  const inward = (p: Pt, k: number): Pt => ({ x: lerp(p.x, vp.x, k), y: lerp(p.y, vp.y, k) });
  const k = depth / Math.max(1, Math.hypot(door.x - vp.x, door.y - vp.y));
  const tl = { x: door.x, y: door.y };
  const tr = { x: door.x + door.w, y: door.y };
  const bl = { x: door.x, y: door.y + door.h };
  const br = { x: door.x + door.w, y: door.y + door.h };
  const reveal = {
    left: { a: tl, b: inward(tl, k), c: inward(bl, k), d: bl },
    right: { a: inward(tr, k), b: tr, c: br, d: inward(br, k) },
    top: { a: tl, b: tr, c: inward(tr, k), d: inward(tl, k) },
  };
  const threshold: Rect = { x: frame.x, y: floorY - 3, w: frame.w, h: Math.max(6, h * 0.014) };

  // Back-wall panels beside the frame.
  const panels: Rect[] = [];
  const gap = 8;
  for (const [from, to] of [
    [back.x + gap, frame.x - gap],
    [frame.x + frame.w + gap, back.x + back.w - gap],
  ]) {
    const width = to! - from!;
    if (width < 18) continue;
    panels.push({ x: from!, y: frameTop, w: width, h: floorY - frameTop - 4 });
  }

  const numberH = Math.min(doorH * 0.3, doorW * 0.36);
  const landingNumber = { cx: door.x + door.w / 2, y: door.y + doorH * 0.16, height: numberH };

  // The companion stands front left, on the floor, never past the frame or above the rail.
  const liftyZone: Rect = { x: 0, y: wallPoint('left', 0.5, 0.63).y, w: Math.max(0, frame.x - 6), h: h - wallPoint('left', 0.5, 0.63).y };

  const labelSize = Math.max(9, Math.min(12, w * 0.016));
  const labels = panels.length && panels[0]!.w > 150 ? [{ text: 'SERVICE CAR 2 · INSPECTED', x: panels[0]!.x + 8, y: floorY - 22, size: labelSize }] : [];

  return { width: w, height: h, vp, back, floorY, ceiling, floor, leftWall, rightWall, ceilingLights, sconces, handrails, cornerTrims, floorSeams, header, indicator, frame, band, door, reveal, threshold, panels, landingNumber, liftyZone, labels };
}

/** Axis-aligned bounds of a quad. */
export function quadBounds(q: Quad): Rect {
  const xs = [q.a.x, q.b.x, q.c.x, q.d.x];
  const ys = [q.a.y, q.b.y, q.c.y, q.d.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Where the companion stands in landscape: on the cabin floor, front left, with its treads
 * dipping a little below the cabin's edge into the dialogue strip (the figure links the two).
 * Never past the door frame, never smaller than a readable figure, never larger than the zone.
 */
export function standingLifty(cabin: Box, g: ConceptGeometry): { x: number; y: number; size: number } {
  const size = Math.round(clamp(Math.min(g.liftyZone.w - 8, g.height * 0.4), 72, 176));
  return { x: cabin.x + 8, y: cabin.y + cabin.height - size * 0.82, size };
}
