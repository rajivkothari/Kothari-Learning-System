// The hole from above (D197): the rooftop deck, the rough, the mown fairway, sand, the pool, the green
// and its flag, rooftop things beside the hole, the targets the turn offers, how far the word can
// carry, the golfer at the ball, and the shot: swing, flight on an arc, bounce, roll (or a splash and
// the drop). One Skia canvas.
//
// Art (D198): the owner-approved pieces draw over the same geometry. The deck is a screen-space tile
// over the box; rough, fairway, sand, pool and green are textures clipped to the hole's own polygons
// in course space (so the mown stripes turn with the quarter turn); the coping sits outside the hole's
// bounds (the canvas reaches past the box by its thickness); sprites mark the cup, flag, targets,
// decor, ball and golfer. Arcs, rings, shadows and the tee stay procedural. Each piece keeps its
// vector while it loads or if it is missing, so nothing here can change where a ball goes.
//
// The shot is decided before it plays (fairway.ts): this only draws it, on the UI thread, from one
// timeline (shotFeel.ts). Wind (D199) bends the flight: it is drawn as a curve through the apex
// fairway.ts gives (aimed into the wind, curving back), and the dashed route to the picked target
// curves the same way before the word is spelled, so the child sees what the wind will do. Under
// Reduced Motion the ball slides along that same curve with no arc and the golfer holds still.
//
// Beside the hole (D199): a rooftop garden (trees, flower beds, rocks, bushes), drawn here as flat
// cel shapes; the pack's industrial pieces (fan, tank, antenna, floodlights) are no longer drawn.
import { Canvas, Circle, DashPathEffect, Group, Image, ImageShader, Line, Oval, Path, Rect, RoundedRect, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import type { ArtSource } from '../../ui/art/ArtSlot';
import type { Box } from '../../ui/layout';
import { carryFor, flightApex, greenPolygon, type DecorKind, type Hole, type Landing, type Target } from './fairway';
import type { Phase } from './game';
import { CopingEdge, Sprite, Textured, useGolfPiece, type GolfPiece } from './golfArt';
import { BALL_FROM_FEET, CLUB_ANGLE, TILE_YARDS, clubAtAddress, handFromFeet, spriteRect } from './golfPlacement';
import { GOLF } from './look';
import { toScreen, type CourseView } from './layout';
import { shotTiming } from './shotFeel';
import type { Vec } from './physics';

export interface FairwayCanvasProps {
  box: Box;
  view: CourseView;
  hole: Hole;
  ball: Vec;
  phase: Phase;
  /** The targets the turn offers (shown while choosing and spelling). */
  targets: readonly Target[];
  /** The target picked, or null. */
  picked: string | null;
  /** Letters in the word on the card (its carry ring), or 0. */
  letters: number;
  flight: Landing | null;
  shotSeq: number;
  reducedMotion: boolean;
  suspended: boolean;
  /** The art set (D198); a piece that is missing draws its vector. */
  art: ArtSource;
  /** The wind on this turn (fairway.ts windOf), or null when calm. */
  wind: Vec | null;
}

function polyPath(points: readonly Vec[], v: CourseView): SkPath {
  const b = Skia.PathBuilder.Make();
  points.forEach((p, i) => {
    const s = toScreen(v, p);
    if (i === 0) b.moveTo(s.x, s.y);
    else b.lineTo(s.x, s.y);
  });
  b.close();
  return b.build();
}

/** The same polygon in course units, for drawing inside the course-space group. */
function rawPath(points: readonly Vec[]): SkPath {
  const b = Skia.PathBuilder.Make();
  points.forEach((p, i) => (i === 0 ? b.moveTo(p.x, p.y) : b.lineTo(p.x, p.y)));
  b.close();
  return b.build();
}

/** The coping's thickness on screen, and how far the canvas reaches past the course box to show it. */
export const copingThickness = (scale: number) => Math.max(10, Math.min(18, 3.5 * scale));
export const canvasPad = (scale: number) => Math.ceil(copingThickness(scale)) + 2;

export const FairwayCanvas = memo(function FairwayCanvas({ box, view, hole, ball, phase, targets, picked, letters, flight, shotSeq, reducedMotion, suspended, art, wind }: FairwayCanvasProps) {
  const pad = canvasPad(view.scale);
  const v = useMemo((): CourseView => ({ ...view, x: view.x - box.x + pad, y: view.y - box.y + pad }), [view, box.x, box.y, pad]);
  const s = v.scale;
  const at = (p: Vec) => toScreen(v, p);
  const A = useFairwayArt(art);
  const shapes = useMemo(
    () => ({
      bounds: polyPath(
        [
          { x: 0, y: 0 },
          { x: hole.size.w, y: 0 },
          { x: hole.size.w, y: hole.size.h },
          { x: 0, y: hole.size.h },
        ],
        v,
      ),
      fairway: hole.fairway.map((f) => polyPath(f, v)),
      bunkers: hole.bunkers.map((b) => polyPath(b, v)),
      water: hole.water.map((w) => polyPath(w, v)),
      green: polyPath(greenPolygon(hole.green), v),
      fringe: polyPath(greenPolygon({ ...hole.green, r: hole.green.r + 3 }), v),
    }),
    [hole, v],
  );
  // The same surfaces in course units, for the textures (the group below turns them with the view).
  const raw = useMemo(
    () => ({
      bounds: rawPath([
        { x: 0, y: 0 },
        { x: hole.size.w, y: 0 },
        { x: hole.size.w, y: hole.size.h },
        { x: 0, y: hole.size.h },
      ]),
      fairway: hole.fairway.map((f) => rawPath(f)),
      bunkers: hole.bunkers.map((b) => rawPath(b)),
      water: hole.water.map((w) => rawPath(w)),
      green: rawPath(greenPolygon(hole.green)),
      fringe: rawPath(greenPolygon({ ...hole.green, r: hole.green.r + 3 })),
    }),
    [hole],
  );
  const courseT = v.rotated ? [{ translateX: v.x + v.h * s }, { translateY: v.y }, { rotate: Math.PI / 2 }, { scale: s }] : [{ translateX: v.x }, { translateY: v.y }, { scale: s }];
  // The hole's bounds on screen (for the coping outside them).
  const c0 = at({ x: 0, y: 0 });
  const c1 = at({ x: hole.size.w, y: hole.size.h });
  const edge = { x: Math.min(c0.x, c1.x), y: Math.min(c0.y, c1.y), w: Math.abs(c1.x - c0.x), h: Math.abs(c1.y - c0.y) };
  const cope = copingThickness(s);
  const deckTile = Math.max(220, Math.min(400, Math.min(box.width, box.height) * 0.55));
  // Mown stripes across the fairway (every 14 yards), clipped to it.
  const stripes = useMemo(() => {
    const out: { a: Vec; b: Vec }[] = [];
    for (let y = 0; y < hole.size.h; y += 14) out.push({ a: at({ x: 0, y }), b: at({ x: hole.size.w, y }) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole, v]);
  const pin = at(hole.pin);
  const tee = at(hole.tee);
  const pole = Math.max(26, Math.min(60, 22 * s));
  const ballR = Math.max(5, 1.6 * s);
  const choosing = phase === 'target' || phase === 'spell';
  const flying = phase === 'flight' && flight !== null;

  // ---- the shot's playback: one clock from 0 to the end of the timeline ----
  const timing = useMemo(() => (flight ? shotTiming(flight, reducedMotion) : null), [flight, reducedMotion]);
  const clock = useSharedValue(flying ? 0 : 1e9);
  useEffect(() => {
    if (!flying || !timing) {
      clock.set(1e9);
      return;
    }
    clock.set(0);
    clock.set(withTiming(timing.totalMs, { duration: timing.totalMs, easing: Easing.linear }));
    // A new shot (shotSeq) replays from the start; nothing else restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotSeq, flying]);
  useEffect(() => {
    if (suspended && timing) clock.set(timing.totalMs);
  }, [suspended, timing, clock]);

  const from = at(ball);
  const land = flight ? at(flight.land) : from;
  const rest = flight ? at(flight.rest) : from;
  const splash = flight?.splash ? at(flight.splash) : null;
  const t = timing ?? { swingMs: 0, impactMs: 0, flightMs: 1, bounceMs: 0, rollMs: 0, settleMs: 0, totalMs: 1, arc: 0 };
  const arcPx = (flight?.flight ?? 0) * t.arc * s;
  const fx = from.x;
  const fy = from.y;
  const lx = (splash ?? land).x;
  const ly = (splash ?? land).y;
  const rx = rest.x;
  const ry = rest.y;
  const wet = splash !== null;
  const reduced = reducedMotion;
  // The wind's bend (D199): a quadratic curve from the ball to where it touches down, through the
  // apex fairway.ts gives; its control point is twice the apex's offset from the straight line.
  const apex = flight ? at(flightApex(ball, flight.splash ?? flight.land, wind)) : from;
  const cx = 2 * apex.x - (fx + lx) / 2;
  const cy = 2 * apex.y - (fy + ly) / 2;
  // Where the ball is (and how high) at the clock's time. A worklet: the UI thread runs it every frame.
  const place = useDerivedValue(() => {
    const ms = clock.get();
    if (!flying) return { x: fx, y: fy, h: 0, show: 1 };
    if (reduced) {
      // A plain slide along the same curve to where it lands, then the short roll (no arc, no hops).
      const k = Math.min(1, ms / Math.max(1, t.flightMs));
      const e = 1 - (1 - k) * (1 - k);
      if (wet && k >= 1) return { x: rx, y: ry, h: 0, show: 1 };
      if (e < 0.85 || wet) {
        const q = wet ? e : e / 0.85;
        const u = 1 - q;
        return { x: u * u * fx + 2 * u * q * cx + q * q * lx, y: u * u * fy + 2 * u * q * cy + q * q * ly, h: 0, show: 1 };
      }
      const q = (e - 0.85) / 0.15;
      return { x: lx + (rx - lx) * q, y: ly + (ry - ly) * q, h: 0, show: 1 };
    }
    const a = t.swingMs + t.impactMs;
    if (ms < a) return { x: fx, y: fy, h: 0, show: 1 };
    if (ms < a + t.flightMs) {
      const k = (ms - a) / t.flightMs;
      const u = 1 - k;
      return { x: u * u * fx + 2 * u * k * cx + k * k * lx, y: u * u * fy + 2 * u * k * cy + k * k * ly, h: arcPx * 4 * k * (1 - k), show: 1 };
    }
    const b = a + t.flightMs;
    if (wet) {
      // Into the pool, then set down beside it.
      const k = Math.min(1, (ms - b) / Math.max(1, t.rollMs));
      return k < 0.7 ? { x: lx, y: ly, h: 0, show: 0 } : { x: rx, y: ry, h: 0, show: (k - 0.7) / 0.3 };
    }
    const bx = lx + (rx - lx) * 0.35;
    const by = ly + (ry - ly) * 0.35;
    if (ms < b + t.bounceMs) {
      const k = (ms - b) / Math.max(1, t.bounceMs);
      const hop = k < 0.6 ? Math.sin((Math.PI * k) / 0.6) * arcPx * 0.14 : Math.sin((Math.PI * (k - 0.6)) / 0.4) * arcPx * 0.05;
      return { x: lx + (bx - lx) * k, y: ly + (by - ly) * k, h: hop, show: 1 };
    }
    const c = b + t.bounceMs;
    if (ms < c + t.rollMs) {
      const k = (ms - c) / Math.max(1, t.rollMs);
      const e = 1 - (1 - k) * (1 - k);
      return { x: bx + (rx - bx) * e, y: by + (ry - by) * e, h: 0, show: 1 };
    }
    return { x: rx, y: ry, h: 0, show: 1 };
  });
  const ballTransform = useDerivedValue(() => {
    const p = place.get();
    return [{ translateX: p.x }, { translateY: p.y - p.h }, { scale: 1 + Math.min(0.9, p.h / Math.max(1, 60)) }];
  });
  const shadowTransform = useDerivedValue(() => {
    const p = place.get();
    return [{ translateX: p.x }, { translateY: p.y + ballR * 0.5 }, { scaleY: 0.45 }, { scale: Math.max(0.5, 1 - p.h / 120) }];
  });
  const ballOpacity = useDerivedValue(() => place.get().show);
  // The splash: rings spread where it went in (never under Reduced Motion).
  const ring = useDerivedValue(() => {
    if (!flying || !wet || reduced) return 0;
    const b = t.swingMs + t.impactMs + t.flightMs;
    const k = (clock.get() - b) / Math.max(1, t.rollMs);
    return k < 0 || k > 1 ? 0 : k;
  });
  const ringR = useDerivedValue(() => ballR * (1.2 + 3 * ring.get()));
  const ringOpacity = useDerivedValue(() => (ring.get() > 0 ? 0.8 * (1 - ring.get()) : 0));

  // ---- the golfer: beside the ball, facing the shot; the club goes back, then through ----
  const aimAt = useMemo(() => {
    const target = targets.find((x) => x.id === picked) ?? (targets.length === 1 ? targets[0] : null);
    return target ? (target.kind === 'green' ? hole.pin : target.at) : hole.pin;
  }, [targets, picked, hole.pin]);
  const dir = useMemo(() => {
    const a = at(aimAt);
    const dx = a.x - from.x;
    const dy = a.y - from.y;
    const l = Math.max(1e-6, Math.hypot(dx, dy));
    return { x: dx / l, y: dy / l };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aimAt, from.x, from.y, v]);
  // The golfer: big enough to read at a glance on the smallest map (art replaces the circles).
  const g = Math.max(15, 5 * s);
  const golfer = { x: from.x - dir.y * g * 1.6, y: from.y + dir.x * g * 1.6 };
  const swingAngle = useDerivedValue(() => {
    if (!flying || reduced) return 0;
    const ms = clock.get();
    if (ms < t.swingMs) {
      const k = ms / Math.max(1, t.swingMs);
      return -1.9 * (1 - (1 - k) * (1 - k));
    }
    const k = Math.min(1, (ms - t.swingMs) / Math.max(1, t.impactMs + 160));
    return -1.9 + 2.6 * k;
  });
  const base = Math.atan2(from.y - golfer.y, from.x - golfer.x);
  const clubTip = useDerivedValue(() => {
    const a = base + swingAngle.get();
    return { x: golfer.x + Math.cos(a) * g * 1.5, y: golfer.y + Math.sin(a) * g * 1.5 };
  });
  const clubP1 = useDerivedValue(() => vec(golfer.x, golfer.y));
  const clubP2 = useDerivedValue(() => vec(clubTip.get().x, clubTip.get().y));
  const showGolfer = phase === 'intro' || phase === 'target' || phase === 'spell' || phase === 'flight' || phase === 'result';

  // ---- the carry ring and the line to the picked target ----
  const carryR = letters > 0 ? carryFor(letters) * s : 0;
  const pickedTarget = targets.find((x) => x.id === picked) ?? null;
  const routeEnd = pickedTarget ? (pickedTarget.kind === 'green' ? hole.pin : pickedTarget.at) : null;
  // The route the picked shot will take: curved by the wind exactly as the flight will be.
  const route = useMemo(() => {
    if (!routeEnd) return null;
    const a = toScreen(v, ball);
    const b = toScreen(v, routeEnd);
    const m = toScreen(v, flightApex(ball, routeEnd, wind));
    return Skia.PathBuilder.Make()
      .moveTo(a.x, a.y)
      .quadTo(2 * m.x - (a.x + b.x) / 2, 2 * m.y - (a.y + b.y) / 2, b.x, b.y)
      .build();
  }, [routeEnd, ball, wind, v]);

  // ---- the golfer art (D198): upright beside the ball, facing the shot's side; three poses switched
  // by the shot clock; the club turns about its grip at the pose's hands (Reduced Motion: ready only) ----
  const ready = A.golferReady;
  const club = A.club;
  const golferArt = ready !== null && club !== null;
  const gH = Math.max(44, Math.min(72, 13 * s));
  const gk = ready ? gH / ready.entry.height : 1;
  const face = dir.x < -0.35 ? -1 : 1;
  const feet = { x: from.x - face * BALL_FROM_FEET.x * gk, y: from.y - BALL_FROM_FEET.y * gk };
  const hr = ready ? handFromFeet(ready.entry) : { x: 0, y: 0 };
  const hb = A.golferBack ? handFromFeet(A.golferBack.entry) : hr;
  const hf = A.golferFollow ? handFromFeet(A.golferFollow.entry) : hr;
  // The club's head reaches the ball from the ready hands.
  const address = ready && club ? clubAtAddress(ready.entry, club.entry) : null;
  const aimClub = address?.angle ?? 0;
  const clubGrip = address?.grip ?? { x: 0.25, y: 0.5 };
  const clubW = address?.width ?? 0;
  const clubH = address?.height ?? 0;
  const swingMs = t.swingMs;
  const impactMs = t.impactMs;
  // 0 ready, 1 backswing, 2 follow-through, 3 ready while the club starts back.
  const pose = useDerivedValue(() => {
    if (!flying || reduced) return 0;
    const ms = clock.get();
    if (ms < swingMs * 0.4) return 3;
    if (ms < swingMs) return 1;
    if (ms < swingMs + impactMs) return 0;
    return 2;
  });
  const clubT = useDerivedValue(() => {
    const p = pose.get();
    if (p === 1) return [{ translateX: hb.x }, { translateY: hb.y }, { rotate: CLUB_ANGLE.backswing }];
    if (p === 2) return [{ translateX: hf.x }, { translateY: hf.y }, { rotate: CLUB_ANGLE.followthrough }];
    const k = p === 3 ? Math.min(1, clock.get() / Math.max(1, swingMs * 0.4)) : 0;
    return [{ translateX: hr.x }, { translateY: hr.y }, { rotate: aimClub + CLUB_ANGLE.takeaway * k }];
  });
  const readyOp = useDerivedValue(() => (pose.get() === 0 || pose.get() === 3 ? 1 : 0));
  const backOp = useDerivedValue(() => (pose.get() === 1 ? 1 : 0));
  const followOp = useDerivedValue(() => (pose.get() === 2 ? 1 : 0));
  // The club in front of the body at address and impact, behind it at the top and the finish.
  const clubBehind = useDerivedValue(() => 1 - readyOp.get());

  const ballArt = A.ball;
  const ballSize = ballR * 2.3;
  const golferBody = (piece: GolfPiece | null, op: typeof readyOp) =>
    piece ? (
      <Group opacity={op}>
        <Image image={piece.image} {...poseRect(piece)} fit="fill" />
      </Group>
    ) : null;
  const clubImage = club ? <Image image={club.image} x={-clubGrip.x * clubW} y={-clubGrip.y * clubH} width={clubW} height={clubH} fit="fill" /> : null;

  return (
    <Canvas style={{ position: 'absolute', left: box.x - pad, top: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} pointerEvents="none">
      {/* The rooftop deck in the box, then the hole: its coping outside the bounds, the rough inside. */}
      {A.deck ? (
        <Rect x={pad} y={pad} width={box.width} height={box.height}>
          <ImageShader image={A.deck.image} tx="repeat" ty="repeat" fit="fill" rect={{ x: pad, y: pad, width: deckTile, height: deckTile }} />
        </Rect>
      ) : (
        <Rect x={pad} y={pad} width={box.width} height={box.height} color={GOLF.deck.shadow} />
      )}
      {A.coping ? (
        <Group>
          <Rect x={edge.x - cope} y={edge.y - cope} width={edge.w + cope * 2} height={edge.h + cope * 2} color={GOLF.shadow} opacity={0.25} />
          <Group transform={[{ translateX: edge.x - cope }, { translateY: edge.y - cope }]} clip={{ x: 0, y: 0, width: edge.w + cope * 2, height: cope }}>
            <CopingEdge piece={A.coping} len={edge.w + cope * 2} t={cope} />
          </Group>
          <Group transform={[{ translateX: edge.x - cope }, { translateY: edge.y + edge.h }]} clip={{ x: 0, y: 0, width: edge.w + cope * 2, height: cope }}>
            <CopingEdge piece={A.coping} len={edge.w + cope * 2} t={cope} />
          </Group>
          <Group transform={[{ translateX: edge.x }, { translateY: edge.y }, { rotate: Math.PI / 2 }]} clip={{ x: 0, y: 0, width: edge.h, height: cope }}>
            <CopingEdge piece={A.coping} len={edge.h} t={cope} />
          </Group>
          <Group transform={[{ translateX: edge.x + edge.w + cope }, { translateY: edge.y }, { rotate: Math.PI / 2 }]} clip={{ x: 0, y: 0, width: edge.h, height: cope }}>
            <CopingEdge piece={A.coping} len={edge.h} t={cope} />
          </Group>
        </Group>
      ) : (
        <Path path={shapes.bounds} color={GOLF.deck.edge} style="stroke" strokeWidth={6} strokeJoin="round" />
      )}
      {A.rough ? (
        <Group transform={courseT}>
          <Textured path={raw.bounds} piece={A.rough} tile={TILE_YARDS.rough} />
        </Group>
      ) : (
        <Path path={shapes.bounds} color={GOLF.rough.base} />
      )}
      {/* The fairway with mown stripes. */}
      {shapes.fairway.map((f, i) => (
        <Group key={`f${i}`}>
          <Path path={f} color={GOLF.fairway.shadow} style="stroke" strokeWidth={Math.max(2, 1.2 * s)} strokeJoin="round" opacity={A.fairway ? 0.55 : 1} />
          {A.fairway ? (
            <Group transform={courseT}>
              <Textured path={raw.fairway[i]!} piece={A.fairway} tile={TILE_YARDS.fairway} />
            </Group>
          ) : (
            <>
              <Path path={f} color={GOLF.fairway.base} />
              <Group clip={f}>
                {stripes.map((st, k) => (k % 2 === 0 ? <Line key={k} p1={vec(st.a.x, st.a.y)} p2={vec(st.b.x, st.b.y)} color={GOLF.fairway.light} strokeWidth={7 * s} opacity={0.22} /> : null))}
              </Group>
            </>
          )}
        </Group>
      ))}
      {/* Sand and the pool. */}
      {shapes.bunkers.map((b, i) => (
        <Group key={`b${i}`}>
          <Path path={b} color={GOLF.sand.shadow} style="stroke" strokeWidth={Math.max(2, 1.4 * s)} strokeJoin="round" />
          {A.sand ? (
            <Group transform={courseT}>
              <Textured path={raw.bunkers[i]!} piece={A.sand} tile={TILE_YARDS.sand} />
            </Group>
          ) : (
            <Path path={b} color={GOLF.sand.base} />
          )}
        </Group>
      ))}
      {shapes.water.map((w, i) => (
        <Group key={`w${i}`}>
          <Path path={w} color={GOLF.deck.light} style="stroke" strokeWidth={Math.max(3, 2 * s)} strokeJoin="round" />
          {A.water ? (
            <Group transform={courseT}>
              <Textured path={raw.water[i]!} piece={A.water} tile={TILE_YARDS.water} />
            </Group>
          ) : (
            <>
              <Path path={w} color={GOLF.water.base} />
              <Group clip={w}>
                {stripes.map((st, k) => (k % 3 === 1 ? <Line key={k} p1={vec(st.a.x, st.a.y)} p2={vec(st.b.x, st.b.y)} color={GOLF.waterLight} strokeWidth={1.5} opacity={0.35} /> : null))}
              </Group>
            </>
          )}
        </Group>
      ))}
      {/* The green with its fringe, and the tee box. */}
      {A.fairway ? (
        <Group transform={courseT}>
          <Textured path={raw.fringe} piece={A.fairway} tile={TILE_YARDS.fairway} />
        </Group>
      ) : (
        <Path path={shapes.fringe} color={GOLF.fairway.base} />
      )}
      {A.green ? (
        <Group transform={courseT}>
          <Textured path={raw.green} piece={A.green} tile={hole.green.r * 2} origin={{ x: hole.green.x - hole.green.r, y: hole.green.y - hole.green.r }} />
        </Group>
      ) : (
        <Path path={shapes.green} color={GOLF.green.light} />
      )}
      <Path path={shapes.green} color={GOLF.green.shadow} style="stroke" strokeWidth={1.5} opacity={0.6} />
      <RoundedRect x={tee.x - 5 * s} y={tee.y - 3.5 * s} width={10 * s} height={7 * s} r={1.5 * s} color={GOLF.tee} opacity={A.fairway ? 0.16 : 0.35} />
      {/* Rooftop things beside the hole (never in play). */}
      {(hole.decor ?? []).map((d, i) => (
        <Garden key={`d${i}`} kind={d.kind} at={at(d)} s={s} />
      ))}
      {/* How far the word on the card can carry. */}
      {choosing && carryR > 0 ? (
        <Circle cx={from.x} cy={from.y} r={carryR} color={GOLF.carry} style="stroke" strokeWidth={2} opacity={0.45}>
          <DashPathEffect intervals={[8, 8]} />
        </Circle>
      ) : null}
      {/* The targets: a marker each (the names are native text over the canvas); the picked one bright, with a line to it. */}
      {choosing && route ? (
        <Path path={route} style="stroke" color={pickedTarget?.kind === 'bold' ? GOLF.bold : GOLF.safe} strokeWidth={3} strokeCap="round" opacity={0.85}>
          <DashPathEffect intervals={[10, 8]} />
        </Path>
      ) : null}
      {choosing
        ? targets
            .filter((x) => x.kind !== 'green')
            .map((x) => {
              const c = at(x.at);
              const on = x.id === picked;
              const col = x.kind === 'bold' ? GOLF.bold : GOLF.safe;
              const r = Math.max(12, 6 * s);
              const marker = x.kind === 'bold' ? A.targetBold : A.targetSafe;
              return marker ? (
                <Group key={x.id}>
                  {on ? <Circle cx={c.x} cy={c.y} r={r * 1.25} color={col} opacity={0.3} /> : null}
                  <Sprite piece={marker} x={c.x} y={c.y} height={r * 2} opacity={on ? 1 : 0.8} />
                </Group>
              ) : (
                <Group key={x.id}>
                  <Circle cx={c.x} cy={c.y} r={r} color={col} opacity={on ? 0.35 : 0.15} />
                  <Circle cx={c.x} cy={c.y} r={r} color={col} style="stroke" strokeWidth={on ? 4 : 2.5} />
                  <Circle cx={c.x} cy={c.y} r={3} color={col} />
                </Group>
              );
            })
        : null}
      {/* The cup and the flag. */}
      {A.cup ? <Sprite piece={A.cup} x={pin.x} y={pin.y} height={Math.max(10, 3.2 * s)} /> : <Circle cx={pin.x} cy={pin.y} r={Math.max(3, 1.3 * s)} color={GOLF.cup} />}
      {A.pinFlag ? (
        <Sprite piece={A.pinFlag} x={pin.x} y={pin.y} height={pole / 0.86} />
      ) : (
        <>
          <Line p1={vec(pin.x, pin.y)} p2={vec(pin.x, pin.y - pole)} color={GOLF.pole} strokeWidth={Math.max(2.5, s * 0.5)} strokeCap="round" />
          <Path path={flagCloth(pin, pole)} color={GOLF.flag} />
        </>
      )}
      {/* The splash rings. */}
      {splash ? <Circle cx={splash.x} cy={splash.y} r={ringR} color={GOLF.waterLight} style="stroke" strokeWidth={2.5} opacity={ringOpacity} /> : null}
      {/* The golfer at the ball. */}
      {showGolfer && golferArt ? (
        <Group>
          <Oval x={feet.x - gH * 0.22} y={feet.y - gH * 0.05} width={gH * 0.44} height={gH * 0.1} color={GOLF.shadow} opacity={0.3} />
          <Group transform={[{ translateX: feet.x }, { translateY: feet.y }, { scaleX: face }, { scale: gk }]}>
            <Group transform={clubT} opacity={clubBehind}>
              {clubImage}
            </Group>
            {golferBody(ready, readyOp)}
            {golferBody(A.golferBack ?? ready, backOp)}
            {golferBody(A.golferFollow ?? ready, followOp)}
            <Group transform={clubT} opacity={readyOp}>
              {clubImage}
            </Group>
          </Group>
        </Group>
      ) : showGolfer ? (
        <Group>
          <Oval x={golfer.x - g * 0.9} y={golfer.y - g * 0.45 + g * 0.6} width={g * 1.8} height={g * 0.9} color={GOLF.shadow} opacity={0.35} />
          <Line p1={clubP1} p2={clubP2} color={GOLF.golfer.club} strokeWidth={Math.max(2.5, g * 0.22)} strokeCap="round" />
          <Circle cx={golfer.x} cy={golfer.y} r={g * 0.75} color={GOLF.golfer.shirt} />
          <Circle cx={golfer.x} cy={golfer.y} r={g * 0.42} color={GOLF.golfer.skin} />
          <Circle cx={golfer.x + dir.x * g * 0.18} cy={golfer.y + dir.y * g * 0.18} r={g * 0.3} color={GOLF.golfer.cap} />
        </Group>
      ) : null}
      {/* The ball (and its shadow on the ground as it flies). */}
      <Group transform={shadowTransform} opacity={ballOpacity}>
        <Circle cx={0} cy={0} r={ballR} color={GOLF.shadow} opacity={0.4} />
      </Group>
      <Group transform={ballTransform} opacity={ballOpacity}>
        {ballArt ? (
          <Image image={ballArt.image} x={-ballSize / 2} y={-ballSize / 2} width={ballSize} height={ballSize} fit="fill" />
        ) : (
          <>
            <Circle cx={0} cy={0} r={ballR} color={GOLF.ball} />
            <Circle cx={0} cy={0} r={ballR} color={GOLF.ballEdge} style="stroke" strokeWidth={1.2} />
          </>
        )}
      </Group>
    </Canvas>
  );
});

/** A pose drawn with its feet (anchor) at the golfer group's origin, in image pixels. */
function poseRect(piece: GolfPiece) {
  const r = spriteRect(piece.entry, 0, 0, piece.entry.height);
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** Every Word Golf piece the hole map draws (null: that piece draws its vector). */
function useFairwayArt(art: ArtSource) {
  return {
    deck: useGolfPiece(art, 'deck'),
    coping: useGolfPiece(art, 'coping'),
    rough: useGolfPiece(art, 'rough'),
    fairway: useGolfPiece(art, 'fairway'),
    sand: useGolfPiece(art, 'sand'),
    water: useGolfPiece(art, 'water'),
    green: useGolfPiece(art, 'green'),
    cup: useGolfPiece(art, 'cup'),
    pinFlag: useGolfPiece(art, 'pin-flag'),
    ball: useGolfPiece(art, 'ball'),
    targetSafe: useGolfPiece(art, 'target-safe'),
    targetBold: useGolfPiece(art, 'target-bold'),
    golferReady: useGolfPiece(art, 'golfer-ready'),
    golferBack: useGolfPiece(art, 'golfer-backswing'),
    golferFollow: useGolfPiece(art, 'golfer-followthrough'),
    club: useGolfPiece(art, 'club'),
  };
}


function flagCloth(pin: Vec, pole: number): SkPath {
  const top = pin.y - pole;
  const w = Math.max(14, pole * 0.55);
  const h = Math.max(10, pole * 0.34);
  return Skia.PathBuilder.Make()
    .moveTo(pin.x + 1.5, top)
    .lineTo(pin.x + 1.5 + w, top + h * 0.5)
    .lineTo(pin.x + 1.5, top + h)
    .close()
    .build();
}

/**
 * A rooftop-garden thing beside the hole (D199), seen from above in flat cel bands: a tree (a round
 * canopy with a lit side and a shadow on the grass), a flower bed, a rock, a bush. Sized in yards so
 * it keeps its place on every map, never so small it reads as a speck. Never in play (checkHole).
 */
function Garden({ kind, at, s }: { kind: DecorKind; at: Vec; s: number }) {
  const y = (yards: number, min: number) => Math.max(min, yards * s);
  switch (kind) {
    case 'tree': {
      const r = y(7, 12);
      const lobes = [0, 1, 2, 3, 4, 5].map((k) => ({ x: at.x + Math.cos((k * Math.PI) / 3 - 0.4) * r * 0.48, y: at.y + Math.sin((k * Math.PI) / 3 - 0.4) * r * 0.48 }));
      return (
        <Group>
          <Oval x={at.x - r * 0.85} y={at.y + r * 0.2} width={r * 2.1} height={r * 1.05} color={GOLF.shadow} opacity={0.3} />
          {lobes.map((p, k) => (
            <Circle key={`e${k}`} cx={p.x} cy={p.y} r={r * 0.56 + 2} color={GOLF.tree.edge} />
          ))}
          {lobes.map((p, k) => (
            <Circle key={`b${k}`} cx={p.x} cy={p.y} r={r * 0.56} color={GOLF.tree.base} />
          ))}
          <Circle cx={at.x} cy={at.y} r={r * 0.6} color={GOLF.tree.base} />
          <Circle cx={at.x - r * 0.22} cy={at.y - r * 0.26} r={r * 0.4} color={GOLF.tree.light} />
          <Circle cx={at.x - r * 0.32} cy={at.y - r * 0.36} r={r * 0.14} color={GOLF.tree.light} opacity={0.9} />
        </Group>
      );
    }
    case 'bush': {
      const r = y(4.5, 9);
      return (
        <Group>
          <Oval x={at.x - r * 1.1} y={at.y + r * 0.2} width={r * 2.4} height={r} color={GOLF.shadow} opacity={0.28} />
          <Circle cx={at.x - r * 0.55} cy={at.y + r * 0.1} r={r * 0.7 + 1.5} color={GOLF.bush.edge} />
          <Circle cx={at.x + r * 0.55} cy={at.y + r * 0.1} r={r * 0.7 + 1.5} color={GOLF.bush.edge} />
          <Circle cx={at.x} cy={at.y - r * 0.3} r={r * 0.8 + 1.5} color={GOLF.bush.edge} />
          <Circle cx={at.x - r * 0.55} cy={at.y + r * 0.1} r={r * 0.7} color={GOLF.bush.base} />
          <Circle cx={at.x + r * 0.55} cy={at.y + r * 0.1} r={r * 0.7} color={GOLF.bush.base} />
          <Circle cx={at.x} cy={at.y - r * 0.3} r={r * 0.8} color={GOLF.bush.light} />
          {[-0.5, 0.1, 0.55].map((k, i) => (
            <Circle key={i} cx={at.x + k * r} cy={at.y + (i === 1 ? -0.55 : 0) * r} r={Math.max(2, r * 0.14)} color={GOLF.blooms[i]!} />
          ))}
        </Group>
      );
    }
    case 'rock': {
      const r = y(4.5, 9);
      return (
        <Group>
          <Oval x={at.x - r * 1.2} y={at.y + r * 0.1} width={r * 2.5} height={r * 1.1} color={GOLF.shadow} opacity={0.25} />
          <Oval x={at.x - r * 1.1 - 1.5} y={at.y - r * 0.8 - 1.5} width={r * 2.2 + 3} height={r * 1.6 + 3} color={GOLF.rock.edge} />
          <Oval x={at.x - r * 1.1} y={at.y - r * 0.8} width={r * 2.2} height={r * 1.6} color={GOLF.rock.base} />
          <Oval x={at.x - r * 0.7} y={at.y - r * 0.7} width={r * 1.1} height={r * 0.7} color={GOLF.rock.light} />
        </Group>
      );
    }
    case 'flowers': {
      const w = y(16, 32);
      const h = y(8, 16);
      const blooms = GOLF.blooms;
      return (
        <Group>
          <RoundedRect x={at.x - w / 2} y={at.y - h / 2} width={w} height={h} r={h * 0.45} color={GOLF.bed.shadow} />
          <RoundedRect x={at.x - w / 2 + 2} y={at.y - h / 2 + 2} width={w - 4} height={h - 4} r={h * 0.4} color={GOLF.bed.base} />
          {Array.from({ length: 8 }, (_, k) => (
            <Circle key={k} cx={at.x - w / 2 + w * (0.14 + 0.72 * ((k % 4) / 3))} cy={at.y + (k < 4 ? -h * 0.18 : h * 0.18)} r={Math.max(2.5, h * 0.17)} color={blooms[(k * 3) % blooms.length]!} />
          ))}
        </Group>
      );
    }
  }
}
