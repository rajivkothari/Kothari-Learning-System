// Where a landing's touchable things are on screen. Pure: no React, no Skia. CabinScene draws its
// hotspots from this and ui/touchAreas.test.ts checks it at every window size, so the touch areas
// the tests hold are the ones the learner gets.
import { canvasBoxInDoor, type Rect } from '../art/fit';
import type { ArtEntry } from '../art/manifest';
import type { LandingObjectEntry, NormBox } from '../content/landings';
import type { TouchTarget } from '../director/landingTouch';
import { ENGINEER_WORLD } from '../../../presentation/design/tokens';
import type { CabinGeometry } from './cabinGeometry';
import type { Hero } from './landingArt';
import type { Box } from './layout';

/** Grow `hit` around its centre to at least the minimum touch target, kept inside `bounds`. */
export function hotspotTarget(hit: Box, bounds: Box, min = ENGINEER_WORLD.minTouchTarget): Box {
  const width = Math.min(bounds.width, Math.max(min, hit.width));
  const height = Math.min(bounds.height, Math.max(min, hit.height));
  const cx = hit.x + hit.width / 2;
  const cy = hit.y + hit.height / 2;
  const x = Math.min(bounds.x + bounds.width - width, Math.max(bounds.x, cx - width / 2));
  const y = Math.min(bounds.y + bounds.height - height, Math.max(bounds.y, cy - height / 2));
  return { x, y, width, height };
}

/** What the landing drawn now offers for placing things: the art's background and hit, or the vector hero. */
export interface LandingDrawn {
  door: Rect;
  /** The art's background while the art shows; undefined on the vector landing. */
  background: Pick<ArtEntry, 'width' | 'height'> | undefined;
  /** The art's own touch area (manifest `hit`), for a hero without a box of its own. */
  artHit: NormBox | undefined;
  hero: Hero | null;
}

/**
 * Where a landing object is, in door units, for this doorway: its box in the art while the art
 * shows (the hero without a box of its own uses the art's `hit`), else its place on the vector
 * landing (or the vector hero's touch area). Null when it has no place on the landing drawn now.
 */
export function objectArea(o: LandingObjectEntry, at: LandingDrawn): NormBox | null {
  if (at.background) {
    if (o.box) return canvasBoxInDoor(at.door, at.background, o.box);
    return o.vector === 'hero' && at.artHit ? canvasBoxInDoor(at.door, at.background, at.artHit) : null;
  }
  if (o.vector === 'hero') return at.hero?.hit ?? null;
  return o.vector ?? null;
}

/**
 * Whether an object can be touched on the landing drawn now: on the art it needs its box (or, as the
 * hero, the art's `hit`); on the vector landing, its vector place. A read-and-touch job whose options
 * are not all touchable here answers with choice cards instead (CabinScene `onLandingArt` says which).
 */
export function touchable(o: LandingObjectEntry, on: { art: boolean; artHit: boolean }): boolean {
  if (on.art) return Boolean(o.box) || (o.vector === 'hero' && on.artHit);
  return Boolean(o.vector);
}

/** A door-unit box in cabin coordinates. */
export const doorToCabin = (b: NormBox, door: Rect): Box => ({ x: door.x + b.x * door.w, y: door.y + b.y * door.h, width: b.w * door.w, height: b.h * door.h });

export const boxesOverlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Where landing touch areas may reach, in cabin coordinates: the doorway, its frame, and the cabin
 * floor below it (none of them a control), clear of the shaft map's column (`shaftWidth`: 64 pt as
 * a status strip, 96 as a map; its 10 pt margin and a 4 pt gap). A small doorway (split views)
 * still gets full-size touch areas this way; the ring stays on the thing itself.
 */
export function touchLimits(g: Pick<CabinGeometry, 'frame'>, cabin: { width: number; height: number }, shaftWidth = 64): Box {
  const right = Math.min(g.frame.x + g.frame.w, cabin.width - (shaftWidth + 10 + 4));
  return { x: g.frame.x, y: g.frame.y, width: Math.max(0, right - g.frame.x), height: Math.max(0, cabin.height - g.frame.y) };
}

export interface PlacedHotspot {
  target: TouchTarget;
  /** The thing itself (the ring is drawn here). */
  hit: Box;
  /** The touch area: at least the minimum target where its limits have room. */
  area: Box;
}

/**
 * Where a full-size touch area for `hit` may go: centred on the thing first, else pushed to one
 * side of it (still on it, inside `bounds`), so two things close together in a small doorway can
 * each keep their own touch.
 */
function placementsFor(centred: Box, hit: Box, bounds: Box): Box[] {
  const fit = (b: Box): Box => ({
    ...b,
    x: Math.min(bounds.x + bounds.width - b.width, Math.max(bounds.x, b.x)),
    y: Math.min(bounds.y + bounds.height - b.height, Math.max(bounds.y, b.y)),
  });
  const shifted = [{ ...centred, x: hit.x }, { ...centred, x: hit.x + hit.width - centred.width }, { ...centred, y: hit.y }, { ...centred, y: hit.y + hit.height - centred.height }];
  return [centred, ...shifted.map(fit)].filter((p) => boxesOverlap(p, hit));
}

/**
 * One placement per thing with no two overlapping, as many things as possible (a thing may be left
 * out only when `canSkip`). Earlier things and earlier placements win ties. Null when every thing
 * must be placed and they cannot all be kept apart. A landing has a handful of things, so trying
 * every combination is cheap.
 */
function arrange(options: readonly Box[][], canSkip: boolean): (Box | null)[] | null {
  let best: (Box | null)[] | null = null;
  let bestCount = -1;
  const pick: (Box | null)[] = [];
  const walk = (i: number, count: number) => {
    if (count + (options.length - i) <= bestCount) return;
    if (i === options.length) {
      best = [...pick];
      bestCount = count;
      return;
    }
    for (const o of options[i]!) {
      if (pick.some((p) => p && boxesOverlap(p, o))) continue;
      pick.push(o);
      walk(i + 1, count + 1);
      pick.pop();
    }
    if (canSkip) {
      pick.push(null);
      walk(i + 1, count);
      pick.pop();
    }
  };
  walk(0, 0);
  return best;
}

/**
 * The touch areas for the targets a touch reaches now, larger things first so smaller ones sit in
 * front. A thing with no place on the landing drawn now gets none (never an invisible dead spot).
 * Each area is at least the minimum target where `limits` (touchLimits) has room, centred on the
 * thing or pushed to one side of it to keep clear of a neighbour. Exploring: a touch never lands on
 * a collectable mission object (those keep their own touch), and two things never share a touch:
 * in a doorway too small for both, the one not yet found is offered, the other waits for a larger
 * window. Answer targets are all kept (kept apart where they can be, else the smaller in front).
 */
export function placeHotspots(targets: readonly TouchTarget[], at: LandingDrawn, keepClear: readonly Box[] = [], limits?: Box): PlacedHotspot[] {
  const door: Box = { x: at.door.x, y: at.door.y, width: at.door.w, height: at.door.h };
  const bounds = limits ?? door;
  // Not yet found first: if only one fits, it is the one with something to discover.
  const ordered = [...targets].sort((a, b) => Number(a.inspected) - Number(b.inspected));
  const things = ordered.flatMap((target) => {
    const a = objectArea(target.object, at);
    if (!a) return [];
    const hit = doorToCabin(a, at.door);
    const centred = hotspotTarget(hit, bounds);
    // A thing out of reach (under the shaft map in a narrow window) gets no touch beside it.
    if (!boxesOverlap(centred, hit)) return [];
    const answer = target.mode === 'answer';
    const options = placementsFor(centred, hit, bounds).filter((p) => answer || !keepClear.some((c) => boxesOverlap(c, p)));
    return [{ target, hit, centred, options, answer }];
  });
  const answers = things.length > 0 && things.every((t) => t.answer);
  const chosen = arrange(things.map((t) => t.options), !answers) ?? things.map((t) => t.options[0] ?? t.centred);
  const out: PlacedHotspot[] = [];
  things.forEach((t, i) => {
    const area = chosen[i];
    if (area) out.push({ target: t.target, hit: t.hit, area });
  });
  return out.sort((p, q) => q.hit.width * q.hit.height - p.hit.width * p.hit.height);
}
