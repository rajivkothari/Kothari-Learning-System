// Strike Lab's lane variation (issue #3): formations, surfaces, a post and rails change the roll in
// ways a child can see and learn, never at random; the plain lane rolls exactly as before.
import { LANE, guideShot, previewPath, rack, simulate, surfaceAt, targetsDown, type LaneSetup, type RackKind, type Shot } from './lane';

const SHOTS: Shot[] = [
  { aim: 0, power: 0.6, spin: 0 },
  { aim: 0.4, power: 0.9, spin: -0.7 },
  { aim: -0.8, power: 0.3, spin: 1 },
];
const POST: LaneSetup = { rack: 'ten', obstacle: { x: 0, y: 9, r: 0.16 } };
const OIL: LaneSetup = { rack: 'ten', surfaces: [{ kind: 'oil', x0: -LANE.width / 2, x1: LANE.width / 2, y0: 3, y1: 12 }] };
const GRIP: LaneSetup = { rack: 'ten', surfaces: [{ kind: 'grip', x0: -LANE.width / 2, x1: LANE.width / 2, y0: 6, y1: 12 }] };
/** The ball's x where it reaches the head pin's row (or its last place). */
const xAtHead = (setup: LaneSetup, shot: Shot) => {
  const r = simulate(shot, { ...setup, rack: 'five', surfaces: setup.surfaces, obstacle: setup.obstacle ?? null });
  const i = r.ballY.findIndex((y) => y >= LANE.head - 0.5);
  return r.ballX[i >= 0 ? i : r.ballX.length - 1]!;
};

describe('Strike Lab lane variation', () => {
  it('is deterministic on every setup, and a plain setup rolls exactly as the rack kind did', () => {
    for (const setup of [{ rack: 'ten' } as LaneSetup, POST, OIL, GRIP, { rack: 'vee', bumpers: true } as LaneSetup])
      for (const s of SHOTS) expect(simulate(s, setup)).toEqual(simulate(s, setup));
    for (const kind of ['ten', 'five'] as RackKind[]) for (const s of SHOTS) expect(simulate(s, { rack: kind })).toEqual(simulate(s, kind));
  });

  it('offers five-pin formations where every pair of pins can be cleared with one aimed ball', () => {
    for (const kind of ['five', 'wide', 'vee'] as RackKind[]) {
      expect(rack(kind)).toHaveLength(5);
      for (let a = 0; a < 5; a++)
        for (let b = a + 1; b < 5; b++) {
          const g = guideShot({ rack: kind }, [a, b]);
          expect(g).not.toBeNull();
          expect(targetsDown(simulate(g!, { rack: kind }), [a, b])).toBe(true);
        }
    }
    // The formations differ: the same straight ball does not knock the same pins.
    const downs = (['five', 'wide', 'vee'] as RackKind[]).map((k) => simulate(SHOTS[0]!, k).down.join());
    expect(new Set(downs).size).toBeGreaterThan(1);
  });

  it('a post in front of the head pin: no straight shot gets the head pin, a spun one does', () => {
    expect(guideShot(POST, [0], { spin: false })).toBeNull();
    const g = guideShot(POST, [0], { spin: true });
    expect(g).not.toBeNull();
    expect(g!.spin).not.toBe(0);
    // A straight ball at the post bounces back off it.
    const r = simulate({ aim: 0, power: 0.6, spin: 0 }, POST);
    expect(r.down[0]).toBe(false);
  });

  it('oil takes the bite out of spin, grip makes it bite harder (visibly, at the pins)', () => {
    const shot = { aim: 0, power: 0.6, spin: 1 };
    const plain = xAtHead({ rack: 'five' }, shot);
    expect(Math.abs(xAtHead(OIL, shot))).toBeLessThan(Math.abs(plain));
    expect(Math.abs(xAtHead(GRIP, shot))).toBeGreaterThan(Math.abs(plain));
    expect(surfaceAt(OIL, 0, 5)?.kind).toBe('oil');
    expect(surfaceAt(OIL, 0, 1)).toBeNull();
  });

  it('rails (GUIDED SHOT) keep every ball out of the gutter', () => {
    for (const aim of [-1, 1]) for (const spin of [-1, 1]) for (const power of [0, 1]) expect(simulate({ aim, power, spin }, { rack: 'ten', bumpers: true }).gutter).toBe(false);
    expect(simulate({ aim: -1, power: 0, spin: -1 }, 'ten').gutter).toBe(true);
  });

  it('the preview draws what the ball will do: surfaces, the post and the rails included', () => {
    for (const setup of [OIL, GRIP, { rack: 'ten', bumpers: true } as LaneSetup])
      for (const s of SHOTS) {
        const path = previewPath(s, 0.25, setup);
        const r = simulate(s, setup);
        const last = path.points[path.points.length - 1]!;
        if (path.gutter) {
          expect(r.gutter).toBe(true);
          continue;
        }
        // Where the preview ends, the rolled ball passed within a hair of it.
        const i = r.ballY.findIndex((y) => y >= last.y - 1e-9);
        expect(Math.abs(r.ballX[i]! - last.x)).toBeLessThan(0.12);
      }
    // The preview shows the bounce off the post (it turns back before the pins).
    const bounced = previewPath({ aim: 0, power: 0.6, spin: 0 }, 0.25, POST);
    expect(Math.max(...bounced.points.map((p) => p.y))).toBeLessThan(LANE.head);
  });
});
