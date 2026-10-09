// Where the landing's PLAY button goes (M9). Pure: no React, testable at every window size.
//
// The button belongs to the landing: it stands in the cabin beside the doorway (on the back wall
// left of the door frame, or right of it), or on the cabin floor below the door. It is at least
// 64 pt tall and wide enough for its words (one to three lines, the largest text role that fits).
// It never covers the floor panel and its door buttons, the DIRECTORY plate, the help slot (help,
// NEXT JOB, LET'S COUNT, the clipboard), Lifty's band (his figure and words), the floor indicator,
// the cabin's icon row, the shaft map (as a strip or a map), the maintenance readout, the note
// button, or any touch area of the landing's own things (as drawn in vectors or in art, so the golf
// ball, the hose reel and the bins keep working). Its words keep at least 10 pt from its edges and
// wrap a word to a line when they must. In a window with no room for the game's name (narrow split
// views) the button says only PLAY. Where even that does not fit (Split View 1/3 and Slide Over, whose
// doorways are a few dozen points wide), there is no button: the game waits for a larger window.
import { landingArtFits } from '../art/fit';
import { RUNTIME_ART } from '../art/production';
import { LANDINGS, exploreSpots, landingFor, landingObjects } from '../content/landings';
import type { TouchTarget } from '../director/landingTouch';
import { cabinGeometry } from '../ui/cabinGeometry';
import { heroFor } from '../ui/landingArt';
import type { Box, GameLayout } from '../ui/layout';
import { ICON_ROW, helpSlot, maintenanceReadoutBox, sceneBoxes } from '../ui/liftyPlacement';
import { noteButtonBox } from '../ui/readingCardLayout';
import { lineHeightFor } from '../ui/textRoles';
import { placeHotspots, touchLimits, type LandingDrawn } from '../ui/touchAreas';

export const ENTRANCE = {
  /** The minimum touch target (docs/ACCESSIBILITY.md): never shorter. */
  minHeight: 64,
  /** Narrower than this, even three lines of the smallest label do not fit "COMMANDER": the short label (PLAY) instead. */
  minWidth: 104,
  /** The short label's button: the minimum target, square. */
  minShortWidth: 64,
  maxWidth: 260,
  /** Around the words, with the button's border: at least 10 pt inside it (hostControls.tsx: 10 pt padding + 2 pt border a side; 4 pt + 2/6 pt border top and bottom). */
  padX: 12,
  padY: 8,
  /** Space kept between the button and anything it must not cover. */
  gap: 8,
  maxLines: 3,
} as const;

export interface EntrancePlacement {
  box: Box;
  /** The label's size (a text role: choice, else label) and how many lines it takes. */
  size: number;
  lines: number;
  /** Where it stands, for the tests and the screenshots. */
  side: 'left' | 'right' | 'below';
  /** The words shown: the first of the labels asked for that fits. */
  label: string;
  /** The short label (PLAY) in place of the game's name: no room for the name here. */
  short: boolean;
}

/** What else is on screen now that the button must leave room for. */
export interface EntranceContext {
  /** The free-ride maintenance readout (maintenanceReadoutBox) is shown. */
  readout: boolean;
  /** A reading job's folded-note button (noteButtonBox) is shown. */
  note: boolean;
  /** How the shaft map is drawn now: a strip (64 pt) or a map (96 pt). */
  shaft: 'status' | 'map';
}

/**
 * The label face (palette UI: weight 800, uppercase, 1 pt letter spacing) measured glyph by glyph:
 * heavy-sans capital widths in em (the classic bold grotesque metrics), plus the spacing, plus 3% to
 * spare. On the web build's system sans this gives COMMANDER at 18 pt as 133 pt; the page drew it
 * 130 pt wide. (A flat 0.7 em estimate let COMMANDER run edge to edge in its button.)
 */
const CAP_EM: Record<string, number> = { A: 0.72, B: 0.72, C: 0.72, D: 0.72, E: 0.67, F: 0.61, G: 0.78, H: 0.72, I: 0.28, J: 0.56, K: 0.72, L: 0.61, M: 0.83, N: 0.72, O: 0.78, P: 0.67, Q: 0.78, R: 0.72, S: 0.67, T: 0.61, U: 0.72, V: 0.67, W: 0.94, X: 0.67, Y: 0.67, Z: 0.61, ' ': 0.28 };
const CAPS_SPACING = 1;
const CAPS_SPARE = 1.03;
/** The width of `text` in the label face at `size` (pt). */
export const labelWidth = (text: string, size: number): number => [...text.toUpperCase()].reduce((w, ch) => w + (CAP_EM[ch] ?? 0.72) * size * CAPS_SPARE + CAPS_SPACING, 0);

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const grow = (b: Box, by: number): Box => ({ x: b.x - by, y: b.y - by, width: b.width + by * 2, height: b.height + by * 2 });

/** The landing's touch areas on `floor` in this layout, as vectors and (where the floor has art that fits) as art, with the shaft map drawn as given. */
export function landingTouchAreas(layout: GameLayout, floor: number, shafts: readonly ('status' | 'map')[] = ['status', 'map']): Box[] {
  const { cabin } = layout;
  const g = cabinGeometry(cabin, layout.bandHeight);
  const landing = landingFor(LANDINGS, floor, { restored: () => true });
  const objects = landingObjects(LANDINGS, floor);
  const targets: TouchTarget[] = exploreSpots(LANDINGS, floor).flatMap((spot) => {
    const object = objects.find((o) => o.id === spot.target);
    return object ? [{ object, spot, mode: 'quiet' as const, inspected: false, open: false, label: spot.object }] : [];
  });
  if (targets.length === 0) return [];
  const vector: LandingDrawn = { door: g.door, background: undefined, artHit: undefined, hero: heroFor(landing, g.door.w / Math.max(1, g.door.h)) };
  const drawings = [vector];
  const background = RUNTIME_ART.manifest.assets.find((a) => a.kind === 'landing' && a.layer === 'background' && a.floor === floor && a.state === 'any');
  if (background && landingArtFits(g.door)) drawings.push({ ...vector, background, artHit: RUNTIME_ART.manifest.assets.find((a) => a.kind === 'landing' && a.floor === floor && a.hit)?.hit });
  const out: Box[] = [];
  for (const shaftMode of shafts) {
    const limits = touchLimits(g, cabin, sceneBoxes(layout, shaftMode).shaft.width);
    for (const at of drawings) for (const p of placeHotspots(targets, at, [], limits)) out.push({ x: cabin.x + p.area.x, y: cabin.y + p.area.y, width: p.area.width, height: p.area.height });
  }
  return out;
}

/** Everything the button must leave clear in this layout (screen coordinates), named for the tests. */
export function entranceKeepClear(layout: GameLayout, floor: number, on: EntranceContext): [string, Box][] {
  const { cabin } = layout;
  const scene = sceneBoxes(layout, 'status');
  const out: [string, Box][] = [
    ['panel', layout.panel],
    ['directory', layout.directory],
    ['help slot', helpSlot(layout)],
    ["Lifty's band", layout.lifty],
    ['indicator', scene.indicator],
    ['icon row', { x: cabin.x, y: cabin.y, width: cabin.width, height: ICON_ROW }],
    [`shaft map (${on.shaft})`, sceneBoxes(layout, on.shaft).shaft],
  ];
  if (on.note) out.push(['note button', noteButtonBox(layout)]);
  if (layout.placard) out.push(['directory placard', layout.placard]);
  const readout = on.readout ? maintenanceReadoutBox(layout) : null;
  if (readout) out.push(['maintenance readout', readout]);
  landingTouchAreas(layout, floor, [on.shaft]).forEach((b, i) => out.push([`landing touch ${i}`, b]));
  return out;
}


/**
 * The PLAY button for `floor`'s game in this layout, with the first of `labels` that fits (say BACK TO
 * CARGO COMMANDER, then PLAY CARGO COMMANDER), else the short label (PLAY); null where no place clears
 * everything (entranceKeepClear). Preference: the back wall left of the
 * door frame, then right of it, then the cabin floor below the door; within a place, level with the
 * doorway's middle.
 */
export function entrancePlacement(layout: GameLayout, floor: number, labels: { full: readonly string[]; short: string }, on: EntranceContext): EntrancePlacement | null {
  const keep = entranceKeepClear(layout, floor, on).map(([, b]) => grow(b, ENTRANCE.gap - 0.5));
  for (const label of labels.full) {
    const placed = placeLabel(layout, label, ENTRANCE.minWidth, keep, on.shaft, false);
    if (placed) return placed;
  }
  return placeLabel(layout, labels.short, ENTRANCE.minShortWidth, keep, on.shaft, true);
}

function placeLabel(layout: GameLayout, label: string, minWidth: number, keep: readonly Box[], shaft: EntranceContext['shaft'], short: boolean): EntrancePlacement | null {
  const { cabin } = layout;
  const g = cabinGeometry(cabin, layout.bandHeight);
  const frame = { x: cabin.x + g.frame.x, y: cabin.y + g.frame.y, width: g.frame.w, height: g.frame.h };
  const door = { x: cabin.x + g.door.x, y: cabin.y + g.door.y, width: g.door.w, height: g.door.h };
  const sizes = [layout.text.choice, layout.text.label];
  const top = layout.lifty.y + layout.lifty.height + ENTRANCE.gap;
  const bottom = cabin.y + cabin.height - ENTRANCE.gap;
  // The cabin floor under the door runs to the cabin's edge (the panel keeps its own margin below).
  const floorEdge = cabin.y + cabin.height - 2;
  const shaftX = sceneBoxes(layout, shaft).shaft.x;
  const regions: { side: EntrancePlacement['side']; x0: number; x1: number; y0: number; y1: number; centreX: boolean }[] = [
    // The cabin's own edge needs no gap (the window's margin is outside it).
    { side: 'left', x0: cabin.x + 4, x1: frame.x - ENTRANCE.gap, y0: top, y1: bottom, centreX: false },
    { side: 'right', x0: frame.x + frame.width + ENTRANCE.gap, x1: shaftX - ENTRANCE.gap, y0: top, y1: bottom, centreX: false },
    { side: 'below', x0: Math.max(cabin.x + ENTRANCE.gap, door.x - 40), x1: Math.min(shaftX - ENTRANCE.gap, door.x + door.width + 40), y0: door.y + door.height + 2, y1: floorEdge, centreX: true },
  ];
  const middle = door.y + door.height / 2;
  // The largest text role first; within it, the fewest lines; then every place in the region.
  for (const size of sizes) {
    for (const r of regions) {
      const room = Math.min(ENTRANCE.maxWidth, r.x1 - r.x0);
      if (room < minWidth) continue;
      for (const lines of wraps(label, room - ENTRANCE.padX * 2, size)) {
        const height = Math.max(ENTRANCE.minHeight, lines.length * lineHeightFor(size, 'label') + ENTRANCE.padY * 2);
        if (r.y1 - r.y0 < height) continue;
        // The button is as wide as its words, 4 pt to spare (never under the minimum).
        const used = Math.max(minWidth, Math.ceil(Math.max(...lines.map((l) => labelWidth(l, size)))) + ENTRANCE.padX * 2 + 4);
        if (used > room) continue;
        // Beside the door it stands next to the frame; on the floor below it, centred, else to either side.
        const xs = r.centreX ? [r.x0 + (r.x1 - r.x0 - used) / 2, r.x1 - used, r.x0] : [r.side === 'left' ? r.x1 - used : r.x0];
        // Level with the doorway's middle first, then step away from it until clear.
        const prefer = Math.min(r.y1 - height, Math.max(r.y0, middle - height / 2));
        const ys = [prefer];
        for (let d = 4; d <= r.y1 - r.y0; d += 4) ys.push(prefer + d, prefer - d);
        for (const x of xs) {
          for (const y of ys) {
            if (y < r.y0 || y + height > r.y1) continue;
            const box = { x, y, width: used, height };
            if (!keep.some((k) => overlaps(box, k))) return { box, size, lines: lines.length, side: r.side, label, short };
          }
        }
      }
    }
  }
  return null;
}

/** Greedy word wrap at the label face's measured width (labelWidth): one word per line when needed. */
export function labelLines(text: string, width: number, size: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && labelWidth(`${last} ${word}`, size) <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** The distinct ways `text` wraps at `size` in at most `width` (one to three lines), fewest lines first. */
function wraps(text: string, width: number, size: number): string[][] {
  const out: string[][] = [];
  const seen = new Set<string>();
  const longest = Math.max(...text.split(/\s+/).map((w) => labelWidth(w, size)));
  for (let w = width; w >= longest - 0.01; w -= 4) {
    const lines = labelLines(text, w, size);
    if (lines.length > ENTRANCE.maxLines || lines.some((l) => labelWidth(l, size) > width)) continue;
    const key = lines.join('|');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(lines);
    }
  }
  return out.sort((a, b) => a.length - b.length);
}
