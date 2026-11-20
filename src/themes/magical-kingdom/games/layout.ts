// Where everything sits on the Ice Bowling and Garden Golf screen. Pure math: no React, no pixels read
// back from the screen. layout.test.ts runs it over every supported window.
//
// Two arrangements. Stacked (most windows): the ask (picture, ear, line) across the top, the lane under it,
// one action slot (Help, then Next) under the lane. Side (short landscape windows, a Fire HD 8 on its
// side): the ask in a column on the left with the action slot at its foot, the lane beside it.
import { spots } from './play';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LetterLayout {
  /** The ask sits beside the lane, not above it. */
  side: boolean;
  /** The ask: picture card, ear, the line, and after the answer the printed word. */
  panel: Rect;
  /** The picture card (square) and the ear button (square, without its glow ring), inside the panel. */
  picture: Rect;
  ear: Rect;
  /** The printed line and, under it, the hint letter or the printed word. */
  text: Rect;
  lane: Rect;
  /** Pins or flags, left to right: target i stands at spots(count)[i] across the lane. */
  targets: Rect[];
  /** Font size of the letter a target carries, and of the printed word. */
  letter: number;
  word: number;
  /** The ball: its diameter, where it rests, and the line across the lane where it meets the pins or holes. */
  ball: number;
  rest: { x: number; y: number };
  crossY: number;
  /** Turns x in lane units (-1 left edge, 1 right edge) into a window x. */
  laneX(x: number): number;
  /** The one action slot: Help while a question is open, Next after the ball. At least 64 tall. */
  action: Rect;
}

/** Every control a finger must hit is at least this big. */
export const MIN_TOUCH = 64;
/** The glow ring's space around the ear (ui/MagicalPressable GLOW_PAD), kept here so the layout stays pure. */
export const EAR_RING = 7;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v);

/**
 * `top` is where the screen may start (under the kingdom header); `bottom` is the safe-area inset at the
 * foot; `count` is how many letters stand up (3 or 4).
 */
export function letterLayout({ width, height, top, bottom, count }: { width: number; height: number; top: number; bottom: number; count: number }): LetterLayout {
  const m = width < 480 ? 12 : 16;
  const gap = 12;
  const x0 = m;
  const y0 = top + m;
  const w = width - 2 * m;
  const h = height - Math.max(bottom, 0) - m - y0;
  const side = width > height && h < 560 && w >= 640;
  const actionH = MIN_TOUCH;

  let panel: Rect, picture: Rect, ear: Rect, text: Rect, lane: Rect, action: Rect;
  if (side) {
    const pw = round(clamp(w * 0.3, 230, 300));
    panel = { x: x0, y: y0, w: pw, h };
    const earSide = 72;
    const earRow = earSide + 2 * EAR_RING;
    // Picture on top; the ear with the line beside it under the picture; the action slot at the foot.
    const pic = round(Math.min(pw - 2 * gap, h - earRow - actionH - 4 * gap, 220));
    picture = { x: x0 + round((pw - pic) / 2), y: y0 + gap, w: pic, h: pic };
    ear = { x: x0 + gap + EAR_RING, y: picture.y + pic + gap + EAR_RING, w: earSide, h: earSide };
    text = { x: ear.x + earSide + EAR_RING + gap, y: picture.y + pic + gap, w: pw - earRow - 3 * gap, h: earRow };
    action = { x: x0 + gap, y: y0 + h - actionH - gap, w: pw - 2 * gap, h: actionH };
    lane = { x: x0 + pw + gap, y: y0, w: w - pw - gap, h };
  } else {
    const pwMax = Math.min(w, 760);
    const earSide = 72;
    // A narrow window gives the picture less so the line keeps room to be read.
    const pic = round(Math.min(clamp(h * 0.24, 120, 176) - 2 * gap, pwMax - (earSide + 2 * EAR_RING) - 104 - 4 * gap));
    const ph = pic + 2 * gap;
    panel = { x: x0 + round((w - pwMax) / 2), y: y0, w: pwMax, h: ph };
    picture = { x: panel.x + gap, y: panel.y + gap, w: pic, h: pic };
    ear = { x: panel.x + panel.w - gap - EAR_RING - earSide, y: panel.y + round((ph - earSide) / 2), w: earSide, h: earSide };
    text = { x: picture.x + pic + gap, y: panel.y + gap, w: ear.x - EAR_RING - gap - (picture.x + pic + gap), h: pic };
    const aw = Math.min(w, 280);
    action = { x: x0 + round((w - aw) / 2), y: y0 + h - actionH, w: aw, h: actionH };
    const lw = Math.min(w, 860);
    const lh = Math.min(action.y - gap - (panel.y + ph + gap), 600);
    lane = { x: x0 + round((w - lw) / 2), y: panel.y + ph + gap, w: lw, h: lh };
    // A tall window: the lane keeps its height and the action slot follows it up.
    action.y = lane.y + lh + gap;
  }

  const half = lane.w / 2;
  const laneX = (x: number) => lane.x + half + x * half;
  // The outer spots stand a quarter of the half-lane from the edge, and four spots stand that far apart.
  const tw = round(clamp(lane.w / 4 - 8, MIN_TOUCH, 132));
  const th = round(clamp(Math.min(tw * 1.5, lane.h * 0.44), MIN_TOUCH, 198));
  const ty = lane.y + 12;
  const targets = spots(count).map((s) => ({ x: round(laneX(s) - tw / 2), y: ty, w: tw, h: th }));
  const ball = round(clamp(tw * 0.6, 44, 72));
  const rest = { x: round(lane.x + half), y: round(lane.y + lane.h - ball / 2 - 14) };
  return {
    side, panel, picture, ear, text, lane, targets,
    letter: round(clamp(th * 0.3, 30, 58)),
    word: round(clamp(text.h * 0.42, 28, 56)),
    ball, rest,
    crossY: round(ty + th - ball * 0.35),
    laneX,
    action,
  };
}

/** A tap at window x on the lane, as an aim in lane units (-1 left edge, 1 right edge). */
export function aimAt(layout: LetterLayout, x: number): number {
  const half = layout.lane.w / 2;
  return clamp((x - layout.lane.x - half) / half, -1, 1);
}
