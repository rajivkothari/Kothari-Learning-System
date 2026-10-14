// Word Golf art placement (D198): sprites stand on their registered anchors, the coping covers an edge
// with no gap, the poses share their feet, and the club's head reaches the ball from the ready hands.
import { ART_MANIFEST } from '../../art/catalog';
import type { ArtEntry } from '../../art/manifest';
import { BALL_FROM_FEET, CLUB_HEAD_X, COPING_BAR, clubAtAddress, copingTiles, handFromFeet, spriteRect } from './golfPlacement';

const piece = (role: string): ArtEntry => {
  const e = ART_MANIFEST.assets.find((a) => a.id === `minigame.wordgolf.${role}`);
  if (!e) throw new Error(`no ${role}`);
  return e;
};

describe('Word Golf art placement (D198)', () => {
  it('puts a sprite\'s anchor on the point, at its own aspect, centred when it has none', () => {
    const flag = piece('pin-flag');
    const r = spriteRect(flag, 100, 200, 64);
    expect(r.x + flag.anchor!.x * r.width).toBeCloseTo(100);
    expect(r.y + flag.anchor!.y * r.height).toBeCloseTo(200);
    expect(r.width / r.height).toBeCloseTo(flag.width / flag.height);
    const cup = spriteRect(piece('cup'), 10, 10, 20);
    expect(cup.x + cup.width / 2).toBeCloseTo(10);
    expect(cup.y + cup.height / 2).toBeCloseTo(10);
  });

  it('repeats the coping\'s bar along an edge with no gap, its band exactly the thickness', () => {
    const e = piece('coping');
    for (const [len, t] of [[300, 12], [1000, 18], [5, 10]] as const) {
      const tiles = copingTiles(e, len, t);
      expect(tiles.length).toBeGreaterThan(0);
      // The bar band (rows top to bottom of the image) lands on 0 to t.
      for (const r of tiles) {
        expect(r.y + COPING_BAR.top * r.h).toBeCloseTo(0);
        expect(r.y + COPING_BAR.bottom * r.h).toBeCloseTo(t);
      }
      // Each bar's start meets the previous bar's end, and the bars reach the edge's end.
      expect(tiles[0]!.x + COPING_BAR.left * tiles[0]!.w).toBeCloseTo(0);
      for (let i = 1; i < tiles.length; i++) expect(tiles[i]!.x + COPING_BAR.left * tiles[i]!.w).toBeCloseTo(tiles[i - 1]!.x + COPING_BAR.right * tiles[i - 1]!.w);
      const last = tiles[tiles.length - 1]!;
      expect(last.x + COPING_BAR.right * last.w).toBeGreaterThanOrEqual(len);
    }
  });

  it('reads each pose\'s hands from its registered grip, relative to its feet', () => {
    const ready = handFromFeet(piece('golfer-ready'));
    const back = handFromFeet(piece('golfer-backswing'));
    const follow = handFromFeet(piece('golfer-followthrough'));
    // Ready: hands low and in front; backswing: high and behind; finish: high and in front.
    expect(ready.x).toBeGreaterThan(0);
    expect(ready.y).toBeLessThan(0);
    expect(back.x).toBeLessThan(0);
    expect(back.y).toBeLessThan(ready.y);
    expect(follow.x).toBeGreaterThan(0);
    expect(follow.y).toBeLessThan(ready.y);
  });

  it('sizes and turns the club so its head is on the ball at address', () => {
    const club = piece('club');
    const a = clubAtAddress(piece('golfer-ready'), club);
    const hand = handFromFeet(piece('golfer-ready'));
    const reach = (CLUB_HEAD_X - club.anchor!.x) * a.width;
    expect(hand.x + Math.cos(a.angle) * reach).toBeCloseTo(BALL_FROM_FEET.x);
    expect(hand.y + Math.sin(a.angle) * reach).toBeCloseTo(BALL_FROM_FEET.y);
    expect(a.height / a.width).toBeCloseTo(club.height / club.width);
  });
});
