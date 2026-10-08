// Where everything goes on the Word Golf screen. Pure: no React, so the tests check every window.
//
// Landscape (iPad, Fire): the course on the left, the panel on the right (the spelling card, then the
// putting controls in the same place). Portrait (Fire HD 8, iPad) and narrow windows: the course on
// top, the putting controls below it; the spelling card rises over the course's near end and the
// controls, so the flag stays in view while the word is spelled.
//
// The course keeps its shape (it is never stretched). A course box much wider than tall turns the
// course a quarter turn (tee on the left, flag on the right) when that draws it clearly larger.
//
// Every control is at least 64 pt. Words never shrink to fit: a card too small for its words scrolls.
import { linesAt, type Box, type Insets } from '../../ui/layout';
import type { TextSizes } from '../../ui/textRoles';
import type { Vec } from './physics';

export const MIN_TARGET = 64;

/** How the course is drawn in its box: course units to screen points. */
export interface CourseView {
  x: number;
  y: number;
  scale: number;
  /** A quarter turn: the course's far end (the flag) to the right. */
  rotated: boolean;
  /** The course's size in its own units. */
  w: number;
  h: number;
}

export interface GolfLayout {
  orientation: 'landscape' | 'portrait';
  /** Narrow window: fewer things side by side. */
  narrow: boolean;
  margin: number;
  top: Box;
  back: Box;
  /** The hole's title and the three flags. */
  title: Box;
  /** Whether the flags fit beside the title. */
  flags: boolean;
  course: Box;
  view: CourseView;
  /** The putting controls, the hole intro and the in-the-cup card. */
  panel: Box;
  /** The spelling card's area: it fills it (landscape) or rises from its foot as tall as its words need (portrait). */
  card: Box;
  cardAnchor: 'fill' | 'bottom';
  summary: Box;
  /** Putting controls in one row (wide panel) or two. */
  controlRows: 1 | 2;
  /** Room for the aiming tip under the controls ("touch the green"). */
  tip: boolean;
  /** Letter tiles and answer slots (side, pt). */
  tile: number;
  gap: number;
  /** Aim arrows and power buttons (side, pt). */
  control: number;
}

/** Course units to the screen. */
export function toScreen(v: CourseView, p: Vec): Vec {
  return v.rotated ? { x: v.x + (v.h - p.y) * v.scale, y: v.y + p.x * v.scale } : { x: v.x + p.x * v.scale, y: v.y + p.y * v.scale };
}

/** A screen point to course units (the inverse of toScreen). */
export function toCourse(v: CourseView, s: Vec): Vec {
  return v.rotated ? { x: (s.y - v.y) / v.scale, y: v.h - (s.x - v.x) / v.scale } : { x: (s.x - v.x) / v.scale, y: (s.y - v.y) / v.scale };
}

/** Fit a course of w x h into a box, centred, turned a quarter when that is clearly larger. */
export function fitCourse(box: Box, course: { w: number; h: number }): CourseView {
  const upright = Math.min(box.width / course.w, box.height / course.h);
  const turned = Math.min(box.width / course.h, box.height / course.w);
  const rotated = turned > upright * 1.12;
  const scale = Math.max(0.01, rotated ? turned : upright);
  const dw = (rotated ? course.h : course.w) * scale;
  const dh = (rotated ? course.w : course.h) * scale;
  return { x: box.x + (box.width - dw) / 2, y: box.y + (box.height - dh) / 2, scale, rotated, w: course.w, h: course.h };
}

const PANEL = { min: 340, max: 720 } as const;

/** The answer slots' side for a word of `letters` in a card `inner` points wide: as big as a tile, never under 44. */
export function slotSize(inner: number, letters: number, tile: number, gap: number): number {
  const n = Math.max(1, letters);
  return Math.max(44, Math.min(tile + 8, Math.floor((inner - (n - 1) * gap) / n)));
}

export function golfLayout(size: { width: number; height: number }, insets: Insets, text: TextSizes, course: { w: number; h: number } = { w: 100, h: 150 }): GolfLayout {
  const W = Math.max(280, size.width);
  const H = Math.max(320, size.height);
  const roomy = W >= 1000 && H >= 760;
  const margin = roomy ? 16 : 12;
  const narrow = W < 460;
  const landscape = W > H * 1.1 && W >= 700;
  const left = insets.left + margin;
  const right = W - insets.right - margin;
  const topY = insets.top + 8;
  const barH = MIN_TARGET + 8;
  const top: Box = { x: left, y: topY, width: right - left, height: barH };
  // BACK TO ELEVATOR: an arrow and the words, on two lines where the bar is narrow.
  const backW = narrow ? 160 : Math.min(260, Math.max(190, Math.round(text.label * 0.68 * 16) + 64));
  const back: Box = { x: left, y: topY + 4, width: backW, height: MIN_TARGET };
  const title: Box = { x: back.x + back.width + margin, y: topY, width: Math.max(0, right - (back.x + back.width + margin)), height: barH };
  const flags = title.width >= 260;
  const below = top.y + top.height + margin;
  const bottom = H - insets.bottom - margin;
  const tile = roomy ? 72 : MIN_TARGET;
  const gap = roomy ? 10 : 8;
  const control = roomy ? 72 : MIN_TARGET;

  if (landscape) {
    // The upright course needs only so much width at this height; the panel (the spelling card's
    // words, tiles and buttons) gets the rest, so it scrolls as little as possible.
    const courseW = Math.ceil(((bottom - below) * course.w) / course.h) + 8;
    const panelW = Math.round(Math.min(PANEL.max, Math.max(PANEL.min, right - left - margin - Math.max(courseW, (right - left) * 0.3))));
    const panel: Box = { x: right - panelW, y: below, width: panelW, height: bottom - below };
    const courseBox: Box = { x: left, y: below, width: panel.x - margin - left, height: bottom - below };
    const summaryW = Math.min(600, right - left);
    return {
      orientation: 'landscape',
      narrow,
      margin,
      top,
      back,
      title,
      flags,
      course: courseBox,
      view: fitCourse(courseBox, course),
      panel,
      card: panel,
      cardAnchor: 'fill',
      summary: { x: (W - summaryW) / 2, y: below, width: summaryW, height: bottom - below },
      controlRows: 2,
      tip: true,
      tile,
      gap,
      control,
    };
  }

  // Portrait and narrow: the controls below the course, in one row when it fits.
  const inner = right - left - 32;
  const oneRow = inner >= control * 4 + 3 * 8 + 160 + 140 + 2 * 16;
  const instruction = linesAt('Aim at the flag. Pick a power. Then PUTT.', inner, text.question) * Math.round(text.question * 1.25);
  const note = 2 * Math.round(text.passage * 1.35);
  // The aiming tip only where there is room for it (a narrow window keeps the course big instead).
  const tip = narrow ? 0 : linesAt('Or touch the green where the ball should go.', inner, text.label) * Math.round(text.label * 1.25);
  const rows = oneRow ? 1 : 2;
  // padding, the instruction, a note after a miss, each row of controls under its caption, the aiming tip.
  const panelH = Math.round(24 + instruction + 12 + note + 12 + rows * (control + 8 + 24) + tip + 24);
  const panel: Box = { x: left, y: bottom - panelH, width: right - left, height: panelH };
  const courseBox: Box = { x: left, y: below, width: right - left, height: Math.max(120, panel.y - margin - below) };
  return {
    orientation: 'portrait',
    narrow,
    margin,
    top,
    back,
    title,
    flags,
    course: courseBox,
    view: fitCourse(courseBox, course),
    panel,
    card: { x: left, y: below, width: right - left, height: bottom - below },
    cardAnchor: 'bottom',
    summary: { x: left, y: below, width: right - left, height: bottom - below },
    controlRows: rows,
    tip: !narrow,
    tile,
    gap,
    control,
  };
}
