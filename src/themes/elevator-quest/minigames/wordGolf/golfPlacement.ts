// Where Word Golf's art goes (D198). Pure: no React, no Skia; tested in golfPlacement.test.ts.
//
// Sprites stand on their registered anchor; the coping repeats its bar along an edge; the golfer's
// poses share one feet point, and the club turns about its grip at each pose's hands.
import type { ArtEntry } from '../../art/manifest';

/** Image units per world unit for tiled textures: one 256 px tile spans this many course yards. */
export const TILE_YARDS = { fairway: 84, rough: 56, sand: 48, water: 56 } as const;

/** The rectangle that puts a piece's anchor (default: its centre) at (x, y), drawn this tall. */
export function spriteRect(entry: Pick<ArtEntry, 'width' | 'height' | 'anchor'>, x: number, y: number, height: number) {
  const width = (height * entry.width) / entry.height;
  const a = entry.anchor ?? { x: 0.5, y: 0.5 };
  return { x: x - a.x * width, y: y - a.y * height, width, height };
}

/**
 * The outer coping: the border piece's bar (rows 0.34 to 0.66 of the image, columns 0.034 to
 * 0.968) repeated along an edge of `len`, `t` thick, in the edge's own space (x along the edge,
 * y from 0 to t). Clipped to the bar so a repeat never runs past the corner.
 */
export const COPING_BAR = { top: 0.34, bottom: 0.66, left: 0.034, right: 0.968 } as const;

export function copingTiles(entry: Pick<ArtEntry, 'width' | 'height'>, len: number, t: number) {
  const h = t / (COPING_BAR.bottom - COPING_BAR.top);
  const w = (h * entry.width) / entry.height;
  const step = w * (COPING_BAR.right - COPING_BAR.left);
  const y = -COPING_BAR.top * h;
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let x = -COPING_BAR.left * w; x < len; x += step) out.push({ x, y, w, h });
  return out;
}

/**
 * The golfer's hands for a pose, in image pixels from the feet (the pose's anchor). Every pose is
 * drawn with its feet at the same spot, so the club's grip follows the hands from pose to pose.
 */
export function handFromFeet(entry: Pick<ArtEntry, 'width' | 'height' | 'anchor' | 'grip'>): { x: number; y: number } {
  const a = entry.anchor ?? { x: 0.5, y: 1 };
  const g = entry.grip ?? a;
  return { x: (g.x - a.x) * entry.width, y: (g.y - a.y) * entry.height };
}

/** Where the ball sits from the golfer's feet, in the poses' image pixels (in front and to the right). */
export const BALL_FROM_FEET = { x: 96, y: -6 } as const;
/**
 * The club's angle (radians; 0 points the head right, toward the shot): how far it turns back from
 * address in the takeaway, then fixed at the top of the backswing (up and back, behind the head) and
 * at the finish (behind the shoulders). Rehearsed against the pose art (D198).
 */
export const CLUB_ANGLE = { takeaway: 0.7, backswing: -2.3, followthrough: 3.5 } as const;
/** Where the club's head ends, as a fraction of the club image's width (its grip is the anchor). */
export const CLUB_HEAD_X = 0.97;

/**
 * The club at address, in the poses' image pixels: its angle from the ready hands to the ball, and
 * the size that puts its head on the ball when its grip is in the hands.
 */
export function clubAtAddress(ready: Pick<ArtEntry, 'width' | 'height' | 'anchor' | 'grip'>, club: Pick<ArtEntry, 'width' | 'height' | 'anchor'>) {
  const hand = handFromFeet(ready);
  const grip = club.anchor ?? { x: 0.25, y: 0.5 };
  const dx = BALL_FROM_FEET.x - hand.x;
  const dy = BALL_FROM_FEET.y - hand.y;
  const width = Math.hypot(dx, dy) / Math.max(0.1, CLUB_HEAD_X - grip.x);
  return { angle: Math.atan2(dy, dx), width, height: (width * club.height) / club.width, grip };
}

