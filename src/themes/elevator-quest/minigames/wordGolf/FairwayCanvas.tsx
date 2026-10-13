// The hole from above (D197): the rooftop deck, the rough, the mown fairway, sand, the pool, the green
// and its flag, rooftop things beside the hole, the targets the turn offers, how far the word can
// carry, the golfer at the ball, and the shot: swing, flight on an arc, bounce, roll (or a splash and
// the drop). Temporary vectors, one Skia canvas; every surface is its own small piece so production
// art can replace it (FW art pass) without touching the game.
//
// The shot is decided before it plays (fairway.ts): this only draws it, on the UI thread, from one
// timeline (shotFeel.ts). Under Reduced Motion the ball slides straight to where it rests and the
// golfer holds still.
import { Canvas, Circle, DashPathEffect, Group, Line, Oval, Path, Rect, RoundedRect, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Box } from '../../ui/layout';
import { carryFor, greenPolygon, type Hole, type Landing, type Target } from './fairway';
import type { Phase } from './game';
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

export const FairwayCanvas = memo(function FairwayCanvas({ box, view, hole, ball, phase, targets, picked, letters, flight, shotSeq, reducedMotion, suspended }: FairwayCanvasProps) {
  const v = useMemo((): CourseView => ({ ...view, x: view.x - box.x, y: view.y - box.y }), [view, box.x, box.y]);
  const s = v.scale;
  const at = (p: Vec) => toScreen(v, p);
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
  // Where the ball is (and how high) at the clock's time. A worklet: the UI thread runs it every frame.
  const place = useDerivedValue(() => {
    const ms = clock.get();
    if (!flying) return { x: fx, y: fy, h: 0, show: 1 };
    if (reduced) {
      const k = Math.min(1, ms / Math.max(1, t.flightMs));
      const e = 1 - (1 - k) * (1 - k);
      const tx = wet ? lx : rx;
      const ty = wet ? ly : ry;
      if (wet && k >= 1) return { x: rx, y: ry, h: 0, show: 1 };
      return { x: fx + (tx - fx) * e, y: fy + (ty - fy) * e, h: 0, show: 1 };
    }
    const a = t.swingMs + t.impactMs;
    if (ms < a) return { x: fx, y: fy, h: 0, show: 1 };
    if (ms < a + t.flightMs) {
      const k = (ms - a) / t.flightMs;
      return { x: fx + (lx - fx) * k, y: fy + (ly - fy) * k, h: arcPx * 4 * k * (1 - k), show: 1 };
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
  const club = useDerivedValue(() => {
    const a = base + swingAngle.get();
    return { x: golfer.x + Math.cos(a) * g * 1.5, y: golfer.y + Math.sin(a) * g * 1.5 };
  });
  const clubP1 = useDerivedValue(() => vec(golfer.x, golfer.y));
  const clubP2 = useDerivedValue(() => vec(club.get().x, club.get().y));
  const showGolfer = phase === 'intro' || phase === 'target' || phase === 'spell' || phase === 'flight' || phase === 'result';

  // ---- the carry ring and the line to the picked target ----
  const carryR = letters > 0 ? carryFor(letters) * s : 0;
  const pickedTarget = targets.find((x) => x.id === picked) ?? null;
  const lineTo = pickedTarget ? at(pickedTarget.kind === 'green' ? hole.pin : pickedTarget.at) : null;

  return (
    <Canvas style={{ position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height }} pointerEvents="none">
      {/* The rooftop deck around the hole, then the rough inside it. */}
      <Rect x={0} y={0} width={box.width} height={box.height} color={GOLF.deck.shadow} />
      <Path path={shapes.bounds} color={GOLF.deck.edge} style="stroke" strokeWidth={6} strokeJoin="round" />
      <Path path={shapes.bounds} color={GOLF.rough.base} />
      {/* Rooftop things beside the hole (never in play). */}
      {(hole.decor ?? []).map((d, i) => (
        <Decor key={`d${i}`} kind={d.kind} at={at(d)} s={s} />
      ))}
      {/* The fairway with mown stripes. */}
      {shapes.fairway.map((f, i) => (
        <Group key={`f${i}`}>
          <Path path={f} color={GOLF.fairway.shadow} style="stroke" strokeWidth={Math.max(2, 1.2 * s)} strokeJoin="round" />
          <Path path={f} color={GOLF.fairway.base} />
          <Group clip={f}>
            {stripes.map((st, k) => (k % 2 === 0 ? <Line key={k} p1={vec(st.a.x, st.a.y)} p2={vec(st.b.x, st.b.y)} color={GOLF.fairway.light} strokeWidth={7 * s} opacity={0.22} /> : null))}
          </Group>
        </Group>
      ))}
      {/* Sand and the pool. */}
      {shapes.bunkers.map((b, i) => (
        <Group key={`b${i}`}>
          <Path path={b} color={GOLF.sand.shadow} style="stroke" strokeWidth={Math.max(2, 1.4 * s)} strokeJoin="round" />
          <Path path={b} color={GOLF.sand.base} />
        </Group>
      ))}
      {shapes.water.map((w, i) => (
        <Group key={`w${i}`}>
          <Path path={w} color={GOLF.deck.light} style="stroke" strokeWidth={Math.max(3, 2 * s)} strokeJoin="round" />
          <Path path={w} color={GOLF.water.base} />
          <Group clip={w}>
            {stripes.map((st, k) => (k % 3 === 1 ? <Line key={k} p1={vec(st.a.x, st.a.y)} p2={vec(st.b.x, st.b.y)} color={GOLF.waterLight} strokeWidth={1.5} opacity={0.35} /> : null))}
          </Group>
        </Group>
      ))}
      {/* The green with its fringe, and the tee box. */}
      <Path path={shapes.fringe} color={GOLF.fairway.base} />
      <Path path={shapes.green} color={GOLF.green.light} />
      <Path path={shapes.green} color={GOLF.green.shadow} style="stroke" strokeWidth={1.5} opacity={0.6} />
      <RoundedRect x={tee.x - 5 * s} y={tee.y - 3.5 * s} width={10 * s} height={7 * s} r={1.5 * s} color={GOLF.tee} opacity={0.35} />
      {/* How far the word on the card can carry. */}
      {choosing && carryR > 0 ? (
        <Circle cx={from.x} cy={from.y} r={carryR} color={GOLF.carry} style="stroke" strokeWidth={2} opacity={0.45}>
          <DashPathEffect intervals={[8, 8]} />
        </Circle>
      ) : null}
      {/* The targets: a ring each (the names are native text over the canvas); the picked one bright, with a line to it. */}
      {choosing && lineTo ? (
        <Line p1={vec(from.x, from.y)} p2={vec(lineTo.x, lineTo.y)} color={pickedTarget?.kind === 'bold' ? GOLF.bold : GOLF.safe} strokeWidth={3} opacity={0.8}>
          <DashPathEffect intervals={[10, 8]} />
        </Line>
      ) : null}
      {choosing
        ? targets
            .filter((x) => x.kind !== 'green')
            .map((x) => {
              const c = at(x.at);
              const on = x.id === picked;
              const col = x.kind === 'bold' ? GOLF.bold : GOLF.safe;
              return (
                <Group key={x.id}>
                  <Circle cx={c.x} cy={c.y} r={Math.max(12, 6 * s)} color={col} opacity={on ? 0.35 : 0.15} />
                  <Circle cx={c.x} cy={c.y} r={Math.max(12, 6 * s)} color={col} style="stroke" strokeWidth={on ? 4 : 2.5} />
                  <Circle cx={c.x} cy={c.y} r={3} color={col} />
                </Group>
              );
            })
        : null}
      {/* The cup and the flag. */}
      <Circle cx={pin.x} cy={pin.y} r={Math.max(3, 1.3 * s)} color={GOLF.cup} />
      <Line p1={vec(pin.x, pin.y)} p2={vec(pin.x, pin.y - pole)} color={GOLF.pole} strokeWidth={Math.max(2.5, s * 0.5)} strokeCap="round" />
      <Path path={flagCloth(pin, pole)} color={GOLF.flag} />
      {/* The splash rings. */}
      {splash ? <Circle cx={splash.x} cy={splash.y} r={ringR} color={GOLF.waterLight} style="stroke" strokeWidth={2.5} opacity={ringOpacity} /> : null}
      {/* The golfer at the ball. */}
      {showGolfer ? (
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
        <Circle cx={0} cy={0} r={ballR} color={GOLF.ball} />
        <Circle cx={0} cy={0} r={ballR} color={GOLF.ballEdge} style="stroke" strokeWidth={1.2} />
      </Group>
    </Canvas>
  );
});

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

/** A rooftop thing: a vent, a water tank, an antenna or a light mast (flat shapes; art replaces them). */
function Decor({ kind, at, s }: { kind: 'vent' | 'tank' | 'antenna' | 'lights'; at: Vec; s: number }) {
  const u = Math.max(6, 4 * s);
  switch (kind) {
    case 'vent':
      return (
        <Group>
          <RoundedRect x={at.x - u * 1.4} y={at.y - u} width={u * 2.8} height={u * 2} r={u * 0.3} color={GOLF.decor.base} />
          {[0, 1, 2].map((i) => (
            <Line key={i} p1={vec(at.x - u, at.y - u * 0.5 + i * u * 0.5)} p2={vec(at.x + u, at.y - u * 0.5 + i * u * 0.5)} color={GOLF.decor.shadow} strokeWidth={2} />
          ))}
        </Group>
      );
    case 'tank':
      return (
        <Group>
          <Circle cx={at.x} cy={at.y} r={u * 1.6} color={GOLF.decor.shadow} />
          <Circle cx={at.x} cy={at.y} r={u * 1.3} color={GOLF.decor.base} />
          <Circle cx={at.x - u * 0.4} cy={at.y - u * 0.4} r={u * 0.4} color={GOLF.decor.light} opacity={0.6} />
        </Group>
      );
    case 'antenna':
      return (
        <Group>
          <Circle cx={at.x} cy={at.y} r={u * 0.5} color={GOLF.decor.base} />
          <Line p1={vec(at.x, at.y)} p2={vec(at.x, at.y - u * 3)} color={GOLF.decor.light} strokeWidth={2} />
          <Circle cx={at.x} cy={at.y - u * 3} r={u * 0.35} color={GOLF.lamp} />
        </Group>
      );
    case 'lights':
      return (
        <Group>
          <Rect x={at.x - 1.5} y={at.y - u * 2.4} width={3} height={u * 2.4} color={GOLF.decor.light} />
          <RoundedRect x={at.x - u} y={at.y - u * 2.8} width={u * 2} height={u * 0.8} r={2} color={GOLF.lamp} />
        </Group>
      );
  }
}
