// Strike Lab's lane: one Skia canvas for the lane, the pins, the ball, the aim preview and the roll's
// replay. The roll was simulated already (lane.ts); this only plays its recorded frames on the UI
// thread (one shared progress value, no per-frame React work).
//
// Reduced Motion: no roll is played. The pins are shown where the roll left them at once, nothing
// falls or flies, and the Smart Ball's glow holds still.
//
// The lane setup (issue #3) is drawn as it plays: oil and grip patches, the post, GUIDED SHOT's rails
// and its guide line, so the variation is always visible before the ball rolls.
import {
  Canvas,
  Circle,
  Group,
  Line,
  Oval,
  Path,
  Rect,
  RoundedRect,
  Skia,
  vec,
  type SkPath,
} from "@shopify/react-native-skia";
import { memo, useEffect, useMemo } from "react";
import {
  Easing,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import {
  BALL_R,
  FPS,
  LANE,
  PIN_R,
  previewPath,
  rack,
  type LaneSetup,
  type Roll,
  type Shot,
} from "./lane";
import { BOWL, project, type Proj } from "./look";

export interface LaneCanvasProps {
  box: { x: number; y: number; width: number; height: number };
  proj: Proj;
  lane: LaneSetup;
  /** GUIDED SHOT: a shot that works, drawn as a guide line (never applied to the controls). */
  guide: Shot | null;
  /** Which pins are up before the next ball (static rack). */
  standing: readonly boolean[];
  /** The roll to play or show (null: the static rack). */
  roll: Roll | null;
  rollSeq: number;
  /** Play the roll (rolling), or show where it ended (result). */
  mode: "static" | "rolling" | "result";
  shot: Shot;
  /** Draw the aim preview (aiming). */
  aiming: boolean;
  /** The last roll's ball path, faint, to compare against (the Bowling Lab's memory). */
  trail: Roll | null;
  /** Frame 1: the Smart Ball's power ring: segments needed, lit; powered once solved. */
  smart: { needed: number; lit: number; powered: boolean } | null;
  /** Frame 2: pins lit as targets, or picked, or shown by SHOW ME. */
  lit: readonly number[];
  reducedMotion: boolean;
  suspended: boolean;
  /** The roll's replay is over (or skipped). */
  onRolled: () => void;
  /** The ball meets the first pin (the crash sound). */
  onImpact: () => void;
}

function poly(points: { x: number; y: number }[]): SkPath {
  const b = Skia.PathBuilder.Make();
  points.forEach((p, i) => (i === 0 ? b.moveTo(p.x, p.y) : b.lineTo(p.x, p.y)));
  b.close();
  return b.build();
}

export const LaneCanvas = memo(function LaneCanvas(props: LaneCanvasProps) {
  const {
    box,
    proj,
    lane,
    guide,
    standing,
    roll,
    rollSeq,
    mode,
    shot,
    aiming,
    trail,
    smart,
    lit,
    reducedMotion,
    suspended,
    onRolled,
    onImpact,
  } = props;
  // Drawn in the canvas's own space: shift the camera by the box's corner.
  const p = useMemo(
    (): Proj => ({
      ...proj,
      cx: proj.cx - box.x,
      top: proj.top - box.y,
      bottom: proj.bottom - box.y,
    }),
    [proj, box.x, box.y],
  );
  const edge = LANE.width / 2;
  const geo = useMemo(() => {
    const q = (x: number, y: number) => project(p, x, y);
    const far = LANE.pit;
    const near = p.near;
    const quad = (x0: number, x1: number, y0: number, y1: number) =>
      poly([q(x0, y0), q(x1, y0), q(x1, y1), q(x0, y1)]);
    const boards: {
      a: { x: number; y: number };
      b: { x: number; y: number };
    }[] = [];
    for (let k = -4; k <= 4; k++)
      boards.push({
        a: q((k * LANE.width) / 10, 0),
        b: q((k * LANE.width) / 10, LANE.head - 0.3),
      });
    // The aiming arrows (seven, in a shallow V), a third of the way down, as on a real lane.
    const arrows = [-3, -2, -1, 0, 1, 2, 3].map((k) => {
      const y = 4.4 + Math.abs(k) * 0.35;
      const x = (k * LANE.width) / 8;
      return poly([q(x, y + 0.45), q(x - 0.035, y), q(x + 0.035, y)]);
    });
    return {
      room: quad(
        -edge - LANE.gutter - 0.6,
        edge + LANE.gutter + 0.6,
        near,
        far + 0.3,
      ),
      approach: quad(-edge - LANE.gutter, edge + LANE.gutter, near, 0),
      lane: quad(-edge, edge, 0, LANE.head + 1.2),
      deck: quad(-edge, edge, LANE.head - 0.3, LANE.head + 1.2),
      gutterL: quad(-edge - LANE.gutter, -edge, 0, far),
      gutterR: quad(edge, edge + LANE.gutter, 0, far),
      pit: quad(
        -edge - LANE.gutter,
        edge + LANE.gutter,
        LANE.head + 1.2,
        far + 0.3,
      ),
      foul: { a: q(-edge, 0), b: q(edge, 0) },
      boards,
      arrows,
      surfaces: (lane.surfaces ?? []).map((s) => ({ kind: s.kind, path: quad(s.x0, s.x1, s.y0, s.y1) })),
      post: lane.obstacle ? { at: q(lane.obstacle.x, lane.obstacle.y), r: lane.obstacle.r } : null,
      rails: lane.bumpers ? [quad(-edge - 0.05, -edge, 0, LANE.head + 1.2), quad(edge, edge + 0.05, 0, LANE.head + 1.2)] : [],
    };
  }, [p, edge, lane]);

  // ---- the roll's replay ----
  const progress = useSharedValue(mode === "rolling" ? 0 : 1);
  const playing = mode === "rolling" && roll !== null;
  useEffect(() => {
    if (!playing || !roll) {
      progress.set(1);
      return;
    }
    if (reducedMotion) {
      progress.set(1);
      onImpact();
      const t = setTimeout(onRolled, 450);
      return () => clearTimeout(t);
    }
    progress.set(0);
    const ms = (roll.frames / FPS) * 1000;
    progress.set(
      withTiming(1, { duration: ms, easing: Easing.linear }, (finished) => {
        if (finished) runOnJS(onRolled)();
      }),
    );
    const hit =
      roll.firstHit >= 0
        ? setTimeout(onImpact, (roll.firstHit / FPS) * 1000)
        : null;
    return () => {
      if (hit) clearTimeout(hit);
    };
    // A new roll (rollSeq) replays from the start; nothing else restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollSeq, playing]);
  useEffect(() => {
    if (suspended && playing) progress.set(1);
  }, [suspended, playing, progress]);

  // ---- the camera: pushes in on the pin deck as the ball gets there (a cut under Reduced Motion) ----
  const deck = project(p, 0, LANE.head + 0.35);
  const deckW = LANE.width * p.ppm * deck.s;
  const zMax = Math.max(1.4, Math.min(3, (box.width * 0.82) / deckW));
  const focus = { x: box.width / 2, y: box.height * 0.36 };
  const ballYs = roll ? roll.ballY : null;
  const camera = useDerivedValue(() => {
    let z = 1;
    if (mode !== "static" && ballYs) {
      if (reducedMotion) z = zMax;
      else {
        const f =
          Math.min(1, Math.max(0, progress.get())) * (ballYs.length - 1);
        const by = ballYs[Math.floor(f)]!;
        const u = Math.min(1, Math.max(0, (by - 5) / (LANE.head - 5)));
        z = 1 + (zMax - 1) * u * u * (3 - 2 * u);
      }
    }
    const k = (z - 1) / Math.max(0.001, zMax - 1);
    return [
      { translateX: deck.x + (focus.x - deck.x) * k },
      { translateY: deck.y + (focus.y - deck.y) * k },
      { scale: z },
      { translateX: -deck.x },
      { translateY: -deck.y },
    ];
  });

  const spots = useMemo(() => rack(lane.rack), [lane.rack]);
  const showRoll = mode !== "static" && roll !== null;
  const ppm = p.ppm;
  const pinR = PIN_R * ppm;
  const ballR = BALL_R * ppm;

  // The aim preview: dots along the path the ball takes on its own.
  const preview = useMemo(() => {
    if (!aiming) return null;
    const path = previewPath(shot, 0.6, lane);
    return {
      dots: path.points.slice(1).map((pt) => project(p, pt.x, pt.y)),
      gutter: path.gutter,
    };
  }, [aiming, shot, p, lane]);
  const guideDots = useMemo(() => {
    if (!aiming || !guide) return [];
    return previewPath(guide, 0.45, lane).points.slice(1).map((pt) => project(p, pt.x, pt.y));
  }, [aiming, guide, p, lane]);
  const trailDots = useMemo(() => {
    if (!aiming || !trail) return [];
    const out: { x: number; y: number; s: number }[] = [];
    for (let i = 0; i < trail.frames; i += 5)
      if (trail.ballY[i]! <= LANE.head + 0.4)
        out.push(project(p, trail.ballX[i]!, trail.ballY[i]!));
    return out;
  }, [aiming, trail, p]);

  return (
    <Canvas
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
      }}
      pointerEvents="none"
    >
      <Rect
        x={0}
        y={0}
        width={box.width}
        height={box.height}
        color={BOWL.room}
      />
      <Group transform={camera}>
        <Path path={geo.room} color={BOWL.room} />
        <Path path={geo.approach} color={BOWL.approach.base} />
        <Path path={geo.gutterL} color={BOWL.gutter.base} />
        <Path path={geo.gutterR} color={BOWL.gutter.base} />
        <Path path={geo.lane} color={BOWL.lane.base} />
        <Path path={geo.deck} color={BOWL.lane.light} opacity={0.5} />
        {geo.surfaces.map((s, i) => (
          <Path key={`s${i}`} path={s.path} color={s.kind === "oil" ? BOWL.oil : BOWL.grip} opacity={s.kind === "oil" ? 0.45 : 0.6} />
        ))}
        {geo.rails.map((r, i) => (
          <Path key={`r${i}`} path={r} color={BOWL.rail} />
        ))}
        {geo.boards.map((b, i) => (
          <Line
            key={`b${i}`}
            p1={vec(b.a.x, b.a.y)}
            p2={vec(b.b.x, b.b.y)}
            color={BOWL.lane.shadow}
            strokeWidth={1}
            opacity={0.35}
          />
        ))}
        {geo.arrows.map((a, i) => (
          <Path key={`a${i}`} path={a} color={BOWL.arrow} opacity={0.8} />
        ))}
        <Line
          p1={vec(geo.foul.a.x, geo.foul.a.y)}
          p2={vec(geo.foul.b.x, geo.foul.b.y)}
          color={BOWL.foul}
          strokeWidth={3}
        />
        <Path path={geo.pit} color={BOWL.pit} />
        <Path
          path={geo.lane}
          color={BOWL.lane.edge}
          style="stroke"
          strokeWidth={2}
        />

        {/* GUIDED SHOT: a path that works, in the guide colour, under the child's own preview. */}
        {guideDots.map((d, i) => (
          <Circle key={`g${i}`} cx={d.x} cy={d.y} r={Math.max(3, 0.06 * ppm * d.s)} color={BOWL.guide} opacity={0.75} />
        ))}
        {geo.post ? (
          <Group>
            <Oval x={geo.post.at.x - geo.post.r * ppm * geo.post.at.s * 1.3} y={geo.post.at.y - geo.post.r * ppm * geo.post.at.s * 0.4} width={geo.post.r * ppm * geo.post.at.s * 2.6} height={geo.post.r * ppm * geo.post.at.s * 0.8} color={BOWL.shadow} opacity={0.4} />
            <RoundedRect x={geo.post.at.x - geo.post.r * ppm * geo.post.at.s} y={geo.post.at.y - geo.post.r * ppm * geo.post.at.s * 3.2} width={geo.post.r * ppm * geo.post.at.s * 2} height={geo.post.r * ppm * geo.post.at.s * 3.2} r={geo.post.r * ppm * geo.post.at.s * 0.6} color={BOWL.post.base} />
            <RoundedRect x={geo.post.at.x - geo.post.r * ppm * geo.post.at.s * 0.5} y={geo.post.at.y - geo.post.r * ppm * geo.post.at.s * 3} width={geo.post.r * ppm * geo.post.at.s * 0.5} height={geo.post.r * ppm * geo.post.at.s * 2.6} r={geo.post.r * ppm * geo.post.at.s * 0.25} color={BOWL.post.light} />
          </Group>
        ) : null}
        {/* The last roll, faint: what changed since? */}
        {trailDots.map((d, i) => (
          <Circle
            key={`t${i}`}
            cx={d.x}
            cy={d.y}
            r={Math.max(1.5, 0.03 * ppm * d.s)}
            color={BOWL.trail}
            opacity={0.35}
          />
        ))}
        {preview
          ? preview.dots.map((d, i) => (
              <Circle
                key={`p${i}`}
                cx={d.x}
                cy={d.y}
                r={Math.max(2, 0.045 * ppm * d.s)}
                color={BOWL.path}
                opacity={0.35 + (0.5 * (i + 1)) / preview.dots.length}
              />
            ))
          : null}
        {preview && preview.dots.length ? (
          <Circle
            cx={preview.dots[preview.dots.length - 1]!.x}
            cy={preview.dots[preview.dots.length - 1]!.y}
            r={Math.max(
              5,
              0.09 * ppm * preview.dots[preview.dots.length - 1]!.s,
            )}
            color={BOWL.path}
            style="stroke"
            strokeWidth={2.5}
            opacity={preview.gutter ? 0.4 : 0.9}
          />
        ) : null}

        {/* Pins, far row first. */}
        {spots
          .map((s, i) => ({ s, i }))
          .sort((a, b) => b.s.y - a.s.y)
          .map(({ s, i }) =>
            showRoll || standing[i] !== false ? (
              <PinSprite
                key={`${i}-${showRoll ? rollSeq : "s"}`}
                i={i}
                spot={s}
                proj={p}
                roll={showRoll ? roll : null}
                progress={progress}
                r={pinR}
                lit={lit.includes(i)}
                reducedMotion={reducedMotion}
              />
            ) : null,
          )}

        <BallSprite
          proj={p}
          roll={showRoll ? roll : null}
          progress={progress}
          r={ballR}
          smart={smart}
        />
      </Group>
    </Canvas>
  );
});

function PinSprite({
  i,
  spot,
  proj,
  roll,
  progress,
  r,
  lit,
  reducedMotion,
}: {
  i: number;
  spot: { x: number; y: number };
  proj: Proj;
  roll: Roll | null;
  progress: SharedValue<number>;
  r: number;
  lit: boolean;
  reducedMotion: boolean;
}) {
  const xs = roll ? roll.pinX[i]! : null;
  const ys = roll ? roll.pinY[i]! : null;
  const knocked = roll ? roll.knockedAt[i]! : -1;
  const sign = roll && Math.cos(roll.fallAngle[i]!) < 0 ? -1 : 1;
  const sx = spot.x;
  const sy = spot.y;
  const transform = useDerivedValue(() => {
    let x = sx;
    let y = sy;
    let fall = 0;
    if (xs && ys) {
      const f = Math.min(1, Math.max(0, progress.get())) * (xs.length - 1);
      const k = Math.floor(f);
      const a = Math.min(xs.length - 1, k + 1);
      x = xs[k]! + (xs[a]! - xs[k]!) * (f - k);
      y = ys[k]! + (ys[a]! - ys[k]!) * (f - k);
      if (knocked >= 0)
        fall = reducedMotion
          ? f >= knocked
            ? 1
            : 0
          : Math.min(1, Math.max(0, (f - knocked) / 10));
    }
    const pt = project(proj, x, y);
    return [
      { translateX: pt.x },
      { translateY: pt.y },
      { scale: pt.s },
      { rotate: sign * fall * 1.4 },
    ];
  });
  // A standing pin seen from behind the ball: a tall body, a neck, a head, a cyan band.
  const w = r * 1.5;
  const h = r * 4.6;
  return (
    <Group transform={transform}>
      {lit ? (
        <Oval
          x={-r * 2.2}
          y={-r * 0.9}
          width={r * 4.4}
          height={r * 1.8}
          color={BOWL.target}
          opacity={0.75}
        />
      ) : null}
      <Oval
        x={-r * 1.1}
        y={-r * 0.45}
        width={r * 2.2}
        height={r * 0.9}
        color={BOWL.shadow}
        opacity={0.35}
      />
      <RoundedRect
        x={-w / 2}
        y={-h * 0.62}
        width={w}
        height={h * 0.62}
        r={w * 0.45}
        color={BOWL.pin.base}
      />
      <RoundedRect
        x={-w * 0.28}
        y={-h * 0.82}
        width={w * 0.56}
        height={h * 0.26}
        r={w * 0.2}
        color={BOWL.pin.base}
      />
      <Circle cx={0} cy={-h * 0.86} r={w * 0.38} color={BOWL.pin.base} />
      <RoundedRect
        x={-w * 0.3}
        y={-h * 0.74}
        width={w * 0.6}
        height={h * 0.07}
        r={1}
        color={BOWL.pinBand}
      />
      <RoundedRect
        x={-w / 2}
        y={-h * 0.62}
        width={w * 0.3}
        height={h * 0.55}
        r={w * 0.15}
        color={BOWL.pin.light}
        opacity={0.6}
      />
      <RoundedRect
        x={-w / 2}
        y={-h * 0.62}
        width={w}
        height={h * 0.62}
        r={w * 0.45}
        color={BOWL.pin.edge}
        style="stroke"
        strokeWidth={1}
        opacity={0.5}
      />
      {lit ? (
        <Circle
          cx={0}
          cy={-h * 0.86}
          r={w * 0.38}
          color={BOWL.target}
          style="stroke"
          strokeWidth={2}
        />
      ) : null}
    </Group>
  );
}

function BallSprite({
  proj,
  roll,
  progress,
  r,
  smart,
}: {
  proj: Proj;
  roll: Roll | null;
  progress: SharedValue<number>;
  r: number;
  smart: LaneCanvasProps["smart"];
}) {
  const xs = roll ? roll.ballX : null;
  const ys = roll ? roll.ballY : null;
  const transform = useDerivedValue(() => {
    let x = 0;
    let y = 0;
    if (xs && ys) {
      const f = Math.min(1, Math.max(0, progress.get())) * (xs.length - 1);
      const k = Math.floor(f);
      const a = Math.min(xs.length - 1, k + 1);
      x = xs[k]! + (xs[a]! - xs[k]!) * (f - k);
      y = ys[k]! + (ys[a]! - ys[k]!) * (f - k);
    }
    const pt = project(proj, x, y);
    return [
      { translateX: pt.x },
      { translateY: pt.y - r * pt.s },
      { scale: pt.s },
    ];
  });
  const opacity = useDerivedValue(() => {
    if (!ys) return 1;
    const f = Math.min(1, Math.max(0, progress.get())) * (ys.length - 1);
    const y = ys[Math.floor(f)]!;
    return y > LANE.head + 0.9 ? 0 : 1;
  });
  const powered = !smart || smart.powered;
  const look = powered ? BOWL.ball : BOWL.ballDim;
  const ring = smart ? Array.from({ length: smart.needed }, (_, i) => i) : [];
  return (
    <Group transform={transform} opacity={opacity}>
      <Oval
        x={-r * 1.05}
        y={r * 0.6}
        width={r * 2.1}
        height={r * 0.7}
        color={BOWL.shadow}
        opacity={0.4}
      />
      {smart && powered ? (
        <Circle cx={0} cy={0} r={r * 1.35} color={BOWL.glow} opacity={0.3} />
      ) : null}
      {ring.map((k) => {
        const a = -Math.PI / 2 + (k / ring.length) * Math.PI * 2;
        const on = k < (smart?.lit ?? 0);
        return (
          <Circle
            key={k}
            cx={Math.cos(a) * r * 1.45}
            cy={Math.sin(a) * r * 1.45}
            r={Math.max(2, r * 0.11)}
            color={on ? BOWL.power : BOWL.powerOff}
          />
        );
      })}
      <Circle cx={0} cy={0} r={r} color={look.base} />
      <Circle
        cx={-r * 0.32}
        cy={-r * 0.36}
        r={r * 0.32}
        color={look.light}
        opacity={0.55}
      />
      <Circle cx={r * 0.18} cy={-r * 0.2} r={r * 0.09} color={BOWL.room} />
      <Circle cx={r * 0.38} cy={-r * 0.02} r={r * 0.09} color={BOWL.room} />
      <Circle cx={r * 0.12} cy={r * 0.16} r={r * 0.1} color={BOWL.room} />
      {smart && powered ? (
        <Circle
          cx={0}
          cy={0}
          r={r * 1.02}
          color={BOWL.glow}
          style="stroke"
          strokeWidth={Math.max(2, r * 0.08)}
        />
      ) : null}
      <Circle
        cx={0}
        cy={0}
        r={r}
        color={look.edge}
        style="stroke"
        strokeWidth={1.2}
        opacity={0.6}
      />
    </Group>
  );
}
