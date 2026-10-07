// Where art goes on screen. Pure math, no React or Skia: tested for every window size.
//
// Images are never stretched unevenly. A layer either covers its box (uniform scale, cropped) or
// is contained in it (uniform scale, standing on a baseline). The landing covers the doorway plus a
// small overscan, so a gentle parallax never shows an edge, and a square canvas keeps its safe core
// in view at every doorway shape the layouts produce.
import type { CabinGeometry } from '../ui/cabinGeometry';
import { LANDING_CANVAS, PARALLAX_MAX, type CabinLayer, type NormBox } from './manifest';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}

const CENTER: Point = { x: 0.5, y: 0.5 };

/**
 * Cover `box` with an image, uniformly scaled. The image point `focus` lands on the same relative
 * point of the box when the crop allows; otherwise the image is shifted only as far as it can go
 * while still covering the box.
 */
export function cover(box: Rect, img: Size, focus: Point = CENTER): Rect {
  const s = Math.max(box.w / img.width, box.h / img.height);
  const w = img.width * s;
  const h = img.height * s;
  const x = clamp(box.x + focus.x * box.w - focus.x * w, box.x + box.w - w, box.x);
  const y = clamp(box.y + focus.y * box.h - focus.y * h, box.y + box.h - h, box.y);
  return { x, y, w, h };
}

/** Fit an image inside `box`, uniformly scaled, aligned (default: centred, standing on the bottom). */
export function contain(box: Rect, img: Size, align: Point = { x: 0.5, y: 1 }): Rect {
  const s = Math.min(box.w / img.width, box.h / img.height);
  const w = img.width * s;
  const h = img.height * s;
  return { x: box.x + (box.w - w) * align.x, y: box.y + (box.h - h) * align.y, w, h };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The doorway grown by the landing overscan on every side. */
export function overscanBox(door: Rect, overscan: number = LANDING_CANVAS.overscan): Rect {
  const m = door.w * overscan;
  return { x: door.x - m, y: door.y - m, w: door.w + 2 * m, h: door.h + 2 * m };
}

/** Landing art is drawn only for doorway shapes whose safe core is guaranteed; others get vectors. */
export function landingArtFits(door: Pick<Rect, 'w' | 'h'>, aspects: { min: number; max: number } = LANDING_CANVAS.aspects): boolean {
  const a = door.w / Math.max(1, door.h);
  return a >= aspects.min && a <= aspects.max;
}

/** Where the landing canvas is drawn for a doorway. */
export function landingPlacement(door: Rect, canvas: Size = LANDING_CANVAS.runtime): Rect {
  return cover(overscanBox(door), canvas);
}

/** A canvas-normalized box, in screen coordinates under a placement. */
export function canvasToScreen(placement: Rect, b: NormBox): Rect {
  return { x: placement.x + b.x * placement.w, y: placement.y + b.y * placement.h, w: b.w * placement.w, h: b.h * placement.h };
}

/** A screen rectangle in door units (0 to 1 across the doorway). */
export function toDoorUnits(r: Rect, door: Rect): NormBox {
  return { x: (r.x - door.x) / door.w, y: (r.y - door.y) / door.h, w: r.w / door.w, h: r.h / door.h };
}

/** The part of the canvas the doorway shows (canvas-normalized). */
export function visibleCanvas(door: Rect, placement: Rect): NormBox {
  return { x: (door.x - placement.x) / placement.w, y: (door.y - placement.y) / placement.h, w: door.w / placement.w, h: door.h / placement.h };
}

/** A doorway of a given aspect, for sweeping the supported range. */
export const doorOfAspect = (aspect: number, height = 400): Rect => ({ x: 0, y: 0, w: aspect * height, h: height });

const sweep = (min: number, max: number, steps = 24) => Array.from({ length: steps + 1 }, (_, i) => min + ((max - min) * i) / steps);

/**
 * The canvas region a door-unit zone (the floor number, the sign, the object slot) can land on,
 * over every supported doorway shape. Art keeps this region calm so the native overlay reads.
 */
export function reservedZone(zone: NormBox, aspects: { min: number; max: number } = LANDING_CANVAS.aspects): NormBox {
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const a of sweep(aspects.min, aspects.max)) {
    const door = doorOfAspect(a);
    const p = landingPlacement(door);
    const r = { x: door.x + zone.x * door.w, y: door.y + zone.y * door.h, w: zone.w * door.w, h: zone.h * door.h };
    x0 = Math.min(x0, (r.x - p.x) / p.w);
    y0 = Math.min(y0, (r.y - p.y) / p.h);
    x1 = Math.max(x1, (r.x + r.w - p.x) / p.w);
    y1 = Math.max(y1, (r.y + r.h - p.y) / p.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The canvas region every supported doorway shows (the largest safe core the canvas allows). */
export function alwaysVisible(aspects: { min: number; max: number } = LANDING_CANVAS.aspects): NormBox {
  let x0 = 0;
  let y0 = 0;
  let x1 = 1;
  let y1 = 1;
  for (const a of sweep(aspects.min, aspects.max)) {
    const door = doorOfAspect(a);
    const v = visibleCanvas(door, landingPlacement(door));
    x0 = Math.max(x0, v.x);
    y0 = Math.max(y0, v.y);
    x1 = Math.min(x1, v.x + v.w);
    y1 = Math.min(y1, v.y + v.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Parallax as the doors open: a layer starts a little to the side and settles as the doorway opens,
 * further for nearer layers. One settle per arrival, tied to the doors (no loop). Reduced Motion: none.
 */
export function parallaxOffset(depth: number, doorOpen: number, doorWidth: number, reduced: boolean): number {
  'worklet';
  if (reduced) return 0;
  const open = Math.min(1, Math.max(0, doorOpen));
  return (1 - open) * depth * PARALLAX_MAX * doorWidth;
}

/** How each cabin layer is placed: its box, the fit, the image point to keep in view, and its clip. */
export interface CabinPlacement {
  box: Rect;
  fit: 'cover' | 'contain';
  focus: Point;
  clip: 'none' | 'wallLeft' | 'wallRight' | 'floor';
}

/**
 * Cabin layer boxes from the cabin geometry. The backing covers the whole cabin, centred on the
 * doorway; the frame pieces wrap the doorway; each door leaf covers its half of the doorway,
 * anchored at the meeting edge (the leaf's leading trim always shows); the walls, ceiling and floor
 * cover their own regions and are clipped to the cabin's shapes.
 */
export function cabinArtBoxes(g: CabinGeometry, size: Size, backingDoorCenter: Point): Record<CabinLayer, CabinPlacement> {
  const { width: w, height: h } = size;
  const doorCx = (g.door.x + g.door.w / 2) / w;
  const doorCy = (g.door.y + g.door.h / 2) / h;
  const band = g.door.x - g.frame.x;
  const half = g.door.w / 2;
  const c = (box: Rect, focus: Point = CENTER, clip: CabinPlacement['clip'] = 'none'): CabinPlacement => ({ box, fit: 'cover', focus, clip });
  return {
    // The backing's own door centre is pinned to the cabin's door centre as far as the crop allows.
    backing: { box: { x: 0, y: 0, w, h }, fit: 'cover', focus: { x: clamp(backingDoorCenter.x + (doorCx - 0.5), 0, 1), y: clamp(backingDoorCenter.y + (doorCy - 0.5), 0, 1) }, clip: 'none' },
    ceiling: c({ x: 0, y: 0, w, h: g.ceiling.h }),
    floor: c({ x: 0, y: g.floorY, w, h: h - g.floorY }, { x: 0.5, y: 0 }, 'floor'),
    inlay: { box: { x: g.door.x - g.door.w * 0.1, y: g.floorY, w: g.door.w * 1.2, h: h - g.floorY }, fit: 'contain', focus: { x: 0.5, y: 0 }, clip: 'floor' },
    'wall-left': c({ x: 0, y: 0, w: g.sideInset, h }, { x: 1, y: 0.5 }, 'wallLeft'),
    'wall-right': c({ x: w - g.sideInset, y: 0, w: g.sideInset, h }, { x: 0, y: 0.5 }, 'wallRight'),
    'frame-top': c({ x: g.frame.x, y: g.frame.y, w: g.frame.w, h: g.door.y - g.frame.y }),
    'frame-left': c({ x: g.frame.x, y: g.door.y, w: band, h: g.door.h }, { x: 1, y: 0.5 }),
    'frame-right': c({ x: g.door.x + g.door.w, y: g.door.y, w: band, h: g.door.h }, { x: 0, y: 0.5 }),
    'door-left': c({ x: g.door.x, y: g.door.y, w: half, h: g.door.h }, { x: 1, y: 0.5 }),
    'door-right': c({ x: g.door.x + half, y: g.door.y, w: half, h: g.door.h }, { x: 0, y: 0.5 }),
    light: c({ x: 0, y: 0, w, h }, { x: doorCx, y: doorCy }),
  };
}
