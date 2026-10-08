// What a touched landing thing does on screen: one renderer for every exploration spot, on the
// illustrated landing and on the vector one. The poses come from ui/landingReactions.ts (pure,
// tested); this file only places them.
//
// On the art, a reaction moves the spot's own transparent prop when it has one (art manifest,
// loaded with the landing); a round thing without a prop turns as a disc of the art itself, a
// spring stretches up from its base, a crane's rope pays out, a drawer slides out (its strip grows
// toward you), a golf flag flutters out from its pole: each of these covers the painted original,
// so nothing ghosts. A reaction that cannot be drawn (its prop is missing or failed to
// decode, the vector landing has no such part) glows instead: a touch always shows something.
// On the vector landing the hero part reacts in ui/LandingLayer.tsx; this draws the rest.
//
// Every reaction plays once per touch, runs on the UI thread, and stays still under Reduced Motion.
import { Circle, Group, Image, RoundedRect, Skia, vec, type SkImage, type SkRRect } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, type ReactNode } from 'react';
import { Easing, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { canvasToScreen, parallaxOffset, type Rect } from '../art/fit';
import { DEFAULT_DEPTH, type ArtEntry } from '../art/manifest';
import { OPEN_MS, reactionMs, type DiscEntry, type ExploreSpotEntry, type NormBox } from '../content/landings';
import { useArtImage, type ArtSource } from './art/ArtSlot';
import { SLIDE_GROW, bounceStretch, flagStretch, glowOpacity, lampLevel, lowerDrop, openPose, puttPoint, puttPose, slidePose, spinAngle, tiltAngle } from './landingReactions';
import { eq } from './palette';

/** One spot on the landing being drawn, placed for this doorway. */
export interface SpotView {
  spot: ExploreSpotEntry;
  /** The touched thing on screen (cabin coordinates): the glow and the lamps go here. */
  box: Rect;
  /** putt: where the cup is on screen. */
  cup: { x: number; y: number } | null;
  /** On the vector landing this thing is the hero part, which LandingLayer animates. */
  hero: boolean;
  open: boolean;
}

/** The art the spots can use: the landing's layers, where its canvas is drawn, and its parallax. Null: the vector landing. */
export interface SpotArt {
  layers: readonly ArtEntry[];
  placement: Rect;
  doorOpen: SharedValue<number>;
  doorW: number;
  /** Parallax off (Reduced Motion or the developer setting). */
  still: boolean;
}

const TILT = 0.18;
const STRETCH = 0.35;

export const LandingSpots = memo(function LandingSpots({ spots, art, source, reaction, reduced }: { spots: readonly SpotView[]; art: SpotArt | null; source: ArtSource; reaction: { spotId: string; seq: number } | null; reduced: boolean }) {
  return (
    <Group>
      {spots.map((s) => (
        <SpotLayer key={s.spot.id} view={s} art={art} source={source} seq={reaction?.spotId === s.spot.id ? reaction.seq : 0} reduced={reduced} />
      ))}
    </Group>
  );
});

/** The art layer a spot uses, if this landing has it. */
const layerOf = (art: SpotArt | null, id: string | undefined) => (art && id ? (art.layers.find((l) => l.id === id) ?? null) : null);
/** The scene's own picture: the top background (Floor 15 restored covers its base). */
const sceneOf = (art: SpotArt | null) => (art ? ([...art.layers].reverse().find((l) => l.layer === 'background') ?? null) : null);

function SpotLayer({ view, art, source, seq, reduced }: { view: SpotView; art: SpotArt | null; source: ArtSource; seq: number; reduced: boolean }) {
  const { spot } = view;
  const ms = reactionMs(spot.reaction, reduced ? 'reduced' : 'normal');
  // Reaction progress: 1 is rest. A new touch (seq) runs it from 0 once.
  const progress = useSharedValue(1);
  useEffect(() => {
    if (seq === 0) return;
    progress.set(0);
    progress.set(withTiming(1, { duration: ms, easing: Easing.linear }));
  }, [progress, seq, ms]);
  // Open state, eased (instant under Reduced Motion).
  const openness = useSharedValue(view.open ? 1 : 0);
  useEffect(() => {
    openness.set(reduced ? (view.open ? 1 : 0) : withTiming(view.open ? 1 : 0, { duration: OPEN_MS.normal, easing: Easing.inOut(Easing.quad) }));
  }, [openness, view.open, reduced]);

  const propEntry = layerOf(art, spot.prop);
  const openEntry = layerOf(art, spot.openProp);
  const scene = sceneOf(art);
  const prop = useArtImage(propEntry, source);
  const openImage = useArtImage(openEntry, source);
  const sceneImage = useArtImage(scene, source);
  const glow = <Glow box={view.box} progress={progress} reduced={reduced} />;
  // Under Reduced Motion a turning or springing thing holds still: a still glow says it reacted.
  const moving = (node: ReactNode) => (reduced ? <Group>{node}{glow}</Group> : node);

  switch (spot.reaction) {
    case 'spin':
      if (art && prop && propEntry) return moving(<Turning entry={propEntry} image={prop} art={art} progress={progress} reduced={reduced} kind="spin" amount={spot.turns ?? 1} />);
      if (art && spot.disc && sceneImage && scene) return moving(<Discs discs={[{ ...spot.disc, turns: spot.turns ?? 1 }, ...(spot.linked ?? [])]} image={sceneImage} scene={scene} art={art} progress={progress} reduced={reduced} />);
      return view.hero && !art ? moving(null) : glow;
    case 'tilt':
      if (art && prop && propEntry) return moving(<Turning entry={propEntry} image={prop} art={art} progress={progress} reduced={reduced} kind="tilt" amount={TILT} />);
      return view.hero && !art ? moving(null) : glow;
    case 'bounce':
      if (art && sceneImage && scene) return moving(<Stretch box={view.box} image={sceneImage} scene={scene} art={art} progress={progress} reduced={reduced} />);
      return view.hero && !art ? moving(null) : glow;
    case 'lower':
      if (art && spot.hoist && sceneImage && scene) return moving(<Hoist hoist={spot.hoist} image={sceneImage} scene={scene} art={art} progress={progress} reduced={reduced} />);
      return view.hero && !art ? moving(null) : glow;
    case 'glow':
      return view.hero && !art ? null : glow;
    case 'lights':
      return <Lamps box={view.box} progress={progress} reduced={reduced} />;
    case 'open':
      return (
        <Group>
          {art && propEntry && prop ? <Lid entry={propEntry} image={prop} art={art} openness={openness} reduced={reduced} which="closed" /> : null}
          {art && openEntry && openImage ? <Lid entry={openEntry} image={openImage} art={art} openness={openness} reduced={reduced} which="open" /> : null}
          {/* Without the open state's picture the change shows as light (the vector toolbox hops). */}
          {art && openEntry && openImage ? null : view.hero && !art ? moving(null) : glow}
        </Group>
      );
    case 'slide':
      if (art && spot.slide && sceneImage && scene) return moving(<Slide drawer={spot.slide} image={sceneImage} scene={scene} art={art} progress={progress} reduced={reduced} />);
      return view.hero && !art ? moving(null) : glow;
    case 'putt':
      return (
        <Group>
          {art && spot.flag && sceneImage && scene ? <Flag flag={spot.flag} image={sceneImage} scene={scene} art={art} progress={progress} reduced={reduced} /> : null}
          <Putt view={view} art={art} entry={propEntry} image={prop} progress={progress} reduced={reduced} />
        </Group>
      );
  }
}

// ---------- light ----------

/** A soft light over the thing, in two flat bands (cel, no blur), once per touch. */
function Glow({ box, progress, reduced }: { box: Rect; progress: SharedValue<number>; reduced: boolean }) {
  const outer = useDerivedValue(() => glowOpacity(progress.get(), reduced) * 0.55);
  const inner = useDerivedValue(() => glowOpacity(progress.get(), reduced));
  const pad = Math.min(box.w, box.h) * 0.08;
  const r = Math.min(box.w, box.h) * 0.25;
  return (
    <Group>
      <RoundedRect x={box.x - pad} y={box.y - pad} width={box.w + pad * 2} height={box.h + pad * 2} r={r + pad} color={eq.coolWhite} opacity={outer} blendMode="screen" />
      <RoundedRect x={box.x + pad} y={box.y + pad} width={Math.max(1, box.w - pad * 2)} height={Math.max(1, box.h - pad * 2)} r={Math.max(0, r - pad)} color={eq.cyan} opacity={inner} blendMode="screen" />
    </Group>
  );
}

const LAMPS = 5;

/** A row of lamps across the thing that come on one by one, then go out together. */
function Lamps({ box, progress, reduced }: { box: Rect; progress: SharedValue<number>; reduced: boolean }) {
  const r = Math.max(3, Math.min(9, box.w / (LAMPS * 3.2)));
  const y = box.y + box.h * 0.72;
  return (
    <Group>
      {Array.from({ length: LAMPS }, (_, i) => (
        <Lamp key={i} i={i} cx={box.x + (box.w * (i + 0.5)) / LAMPS} cy={y} r={r} progress={progress} reduced={reduced} />
      ))}
    </Group>
  );
}

function Lamp({ i, cx, cy, r, progress, reduced }: { i: number; cx: number; cy: number; r: number; progress: SharedValue<number>; reduced: boolean }) {
  const level = useDerivedValue(() => lampLevel(i, LAMPS, progress.get(), reduced));
  const halo = useDerivedValue(() => level.get() * 0.35);
  const base = useDerivedValue(() => (level.get() > 0 ? 0.85 : 0));
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={r * 1.35} color={eq.night} opacity={base} />
      <Circle cx={cx} cy={cy} r={r * 2} color={eq.cyan} opacity={halo} blendMode="screen" />
      <Circle cx={cx} cy={cy} r={r} color={eq.cyan} opacity={level} />
    </Group>
  );
}

// ---------- props (transparent layers that move) ----------

/** A prop that spins or rocks about its pivot (the manifest's, else its centre). */
function Turning({ entry, image, art, progress, reduced, kind, amount }: { entry: ArtEntry; image: SkImage; art: SpotArt; progress: SharedValue<number>; reduced: boolean; kind: 'spin' | 'tilt'; amount: number }) {
  const rect = canvasToScreen(art.placement, entry.rect ?? FULL);
  const pivot = entry.motion?.pivot ?? CENTER;
  const origin = vec(rect.x + pivot.x * rect.w, rect.y + pivot.y * rect.h);
  const depth = entry.depth ?? DEFAULT_DEPTH.moving;
  const { doorOpen, doorW, still } = art;
  const transform = useDerivedValue(() => {
    const p = progress.get();
    const angle = kind === 'spin' ? spinAngle(p, amount, reduced) : tiltAngle(p, amount, reduced);
    return [{ translateX: parallaxOffset(depth, doorOpen.get(), doorW, still) }, { rotate: angle }];
  });
  return (
    <Group origin={origin} transform={transform}>
      <Image image={image} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fit="cover" />
    </Group>
  );
}

/** One state of a two-state thing: the closed picture fades as the open one rises into place. */
function Lid({ entry, image, art, openness, reduced, which }: { entry: ArtEntry; image: SkImage; art: SpotArt; openness: SharedValue<number>; reduced: boolean; which: 'closed' | 'open' }) {
  const rect = canvasToScreen(art.placement, entry.rect ?? FULL);
  const depth = entry.depth ?? DEFAULT_DEPTH.moving;
  const { doorOpen, doorW, still } = art;
  const opacity = useDerivedValue(() => {
    const pose = openPose(openness.get(), reduced);
    return which === 'open' ? pose.opened : pose.closed;
  });
  const transform = useDerivedValue(() => [{ translateX: parallaxOffset(depth, doorOpen.get(), doorW, still) }, { translateY: openPose(openness.get(), reduced).lift * rect.h }]);
  return (
    <Group transform={transform} opacity={opacity}>
      <Image image={image} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fit="cover" />
    </Group>
  );
}

// ---------- the art itself, moved where it covers its original ----------

/** The background's own pixels, placed exactly where the background draws them (with its parallax). */
function useSceneShift(scene: ArtEntry, art: SpotArt) {
  const depth = scene.depth ?? DEFAULT_DEPTH.background;
  const { doorOpen, doorW, still } = art;
  return useDerivedValue(() => parallaxOffset(depth, doorOpen.get(), doorW, still));
}

/** Round parts of the art (a gear, a gear train) turning about their centres, each clipped to its disc. */
function Discs({ discs, image, scene, art, progress, reduced }: { discs: readonly (DiscEntry & { turns: number })[]; image: SkImage; scene: ArtEntry; art: SpotArt; progress: SharedValue<number>; reduced: boolean }) {
  const shift = useSceneShift(scene, art);
  const shiftTransform = useDerivedValue(() => [{ translateX: shift.get() }]);
  const full = canvasToScreen(art.placement, FULL);
  return (
    <Group transform={shiftTransform}>
      {discs.map((d, i) => (
        <Disc key={i} disc={d} full={full} image={image} placement={art.placement} progress={progress} reduced={reduced} />
      ))}
    </Group>
  );
}

function Disc({ disc, full, image, placement, progress, reduced }: { disc: DiscEntry & { turns: number }; full: Rect; image: SkImage; placement: Rect; progress: SharedValue<number>; reduced: boolean }) {
  const cx = placement.x + disc.x * placement.w;
  const cy = placement.y + disc.y * placement.h;
  const r = disc.r * placement.w;
  // A rounded rectangle as round as it is wide: the disc.
  const clip = useMemo((): SkRRect => ({ rect: Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2), rx: r, ry: r }), [cx, cy, r]);
  const transform = useDerivedValue(() => [{ rotate: spinAngle(progress.get(), disc.turns, reduced) }]);
  return (
    <Group clip={clip}>
      <Group origin={vec(cx, cy)} transform={transform}>
        <Image image={image} x={full.x} y={full.y} width={full.w} height={full.h} fit="cover" />
      </Group>
    </Group>
  );
}

/** A spring: its box of the art stretches up from its base and settles (never below rest, so it always covers the original). */
function Stretch({ box, image, scene, art, progress, reduced }: { box: Rect; image: SkImage; scene: ArtEntry; art: SpotArt; progress: SharedValue<number>; reduced: boolean }) {
  const shift = useSceneShift(scene, art);
  const full = canvasToScreen(art.placement, FULL);
  const clip = useMemo(() => Skia.XYWHRect(box.x, box.y, box.w, box.h), [box]);
  const base = box.y + box.h;
  const transform = useDerivedValue(() => [{ translateX: shift.get() }, { translateY: base }, { scaleY: bounceStretch(progress.get(), STRETCH, reduced) }, { translateY: -base }]);
  return (
    <Group transform={transform}>
      <Group clip={clip}>
        <Image image={image} x={full.x} y={full.y} width={full.w} height={full.h} fit="cover" />
      </Group>
    </Group>
  );
}

/** A crane's load: the rope's strip of the art stretches down while the load's strip moves down under it. */
function Hoist({ hoist, image, scene, art, progress, reduced }: { hoist: { rope: NormBox; load: NormBox; drop: number }; image: SkImage; scene: ArtEntry; art: SpotArt; progress: SharedValue<number>; reduced: boolean }) {
  const shift = useSceneShift(scene, art);
  const full = canvasToScreen(art.placement, FULL);
  const rope = canvasToScreen(art.placement, hoist.rope);
  const load = canvasToScreen(art.placement, hoist.load);
  const dropPx = hoist.drop * art.placement.h;
  const ropeClip = useMemo(() => Skia.XYWHRect(rope.x, rope.y, rope.w, rope.h), [rope.x, rope.y, rope.w, rope.h]);
  const loadClip = useMemo(() => Skia.XYWHRect(load.x, load.y, load.w, load.h), [load.x, load.y, load.w, load.h]);
  const ropeTransform = useDerivedValue(() => [{ translateX: shift.get() }, { translateY: rope.y }, { scaleY: (rope.h + lowerDrop(progress.get(), dropPx, reduced)) / rope.h }, { translateY: -rope.y }]);
  const loadTransform = useDerivedValue(() => [{ translateX: shift.get() }, { translateY: lowerDrop(progress.get(), dropPx, reduced) }]);
  return (
    <Group>
      <Group transform={ropeTransform}>
        <Group clip={ropeClip}>
          <Image image={image} x={full.x} y={full.y} width={full.w} height={full.h} fit="cover" />
        </Group>
      </Group>
      <Group transform={loadTransform}>
        <Group clip={loadClip}>
          <Image image={image} x={full.x} y={full.y} width={full.w} height={full.h} fit="cover" />
        </Group>
      </Group>
    </Group>
  );
}

/** A drawer: its strip of the art slides out toward you (grows about its centre, a little lower) and back. */
function Slide({ drawer, image, scene, art, progress, reduced }: { drawer: NormBox; image: SkImage; scene: ArtEntry; art: SpotArt; progress: SharedValue<number>; reduced: boolean }) {
  const shift = useSceneShift(scene, art);
  const full = canvasToScreen(art.placement, FULL);
  const r = canvasToScreen(art.placement, drawer);
  const clip = useMemo(() => Skia.XYWHRect(r.x, r.y, r.w, r.h), [r.x, r.y, r.w, r.h]);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const h = r.h;
  const transform = useDerivedValue(() => {
    const pose = slidePose(progress.get(), reduced);
    return [{ translateX: shift.get() + cx }, { translateY: cy + pose.dy * h }, { scale: pose.scale }, { translateX: -cx }, { translateY: -cy }];
  });
  // The drawer's shadow on the cabinet under it, deeper the further out it is (flat, cel: one band).
  const shadow = useDerivedValue(() => (slidePose(progress.get(), reduced).scale - 1) / SLIDE_GROW * 0.45);
  const shadowTransform = useDerivedValue(() => [{ translateX: shift.get() }]);
  return (
    <Group>
      <Group transform={shadowTransform} opacity={shadow}>
        <RoundedRect x={r.x + r.w * 0.04} y={r.y + r.h} width={r.w * 0.92} height={r.h * 0.55} r={r.h * 0.2} color={eq.night} />
      </Group>
      <Group transform={transform}>
        <Group clip={clip}>
          <Image image={image} x={full.x} y={full.y} width={full.w} height={full.h} fit="cover" />
        </Group>
      </Group>
    </Group>
  );
}

// ---------- the putt ----------

/**
 * The golf flag as the ball drops in: its strip of the art (from the pole to just past its tip)
 * stretches out from the pole and settles. Only ever wider than at rest, so it covers the painted
 * flag; the box ends short enough that the stretch never reaches the next painted thing (landings.json
 * `flag`: its right edge times 1 + FLAG_STRETCH stays clear of the rooftop loop). Still under Reduced Motion.
 */
function Flag({ flag, image, scene, art, progress, reduced }: { flag: NormBox; image: SkImage; scene: ArtEntry; art: SpotArt; progress: SharedValue<number>; reduced: boolean }) {
  const shift = useSceneShift(scene, art);
  const full = canvasToScreen(art.placement, FULL);
  const r = canvasToScreen(art.placement, flag);
  const clip = useMemo(() => Skia.XYWHRect(r.x, r.y, r.w, r.h), [r.x, r.y, r.w, r.h]);
  const pole = r.x;
  const transform = useDerivedValue(() => [{ translateX: shift.get() + pole }, { scaleX: flagStretch(progress.get(), reduced) }, { translateX: -pole }]);
  return (
    <Group transform={transform}>
      <Group clip={clip}>
        <Image image={image} x={full.x} y={full.y} width={full.w} height={full.h} fit="cover" />
      </Group>
    </Group>
  );
}

/** The smallest ball drawn (radius, pt) where the doorway has room: a small doorway still shows a ball a child can follow. */
const MIN_BALL_R = 6;

/**
 * The golf ball: at rest until touched, then it rolls to the cup, drops in, the cup answers with a
 * soft ring, and the ball settles back at rest after a calm pause. The ball is the prop when it has
 * loaded, else a drawn ball (the vector landing, or a prop that is missing or broken).
 */
function Putt({ view, art, entry, image, progress, reduced }: { view: SpotView; art: SpotArt | null; entry: ArtEntry | null; image: SkImage | null; progress: SharedValue<number>; reduced: boolean }) {
  const rect = art && entry && image ? canvasToScreen(art.placement, entry.rect ?? FULL) : null;
  const start = rect ? { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 } : { x: view.box.x + view.box.w / 2, y: view.box.y + view.box.h / 2 };
  const cup = view.cup ?? start;
  // The drawn ball fills most of its box on the art (a measured ball), a little of it on the vector
  // landing; never smaller than MIN_BALL_R where the doorway has room for it (a small doorway, Fire portrait).
  const room = art ? art.placement.w * 0.03 : Math.max(view.box.w, view.box.h) * 0.5;
  const radius = Math.max(rect ? rect.w / 2 : Math.max(4, Math.min(view.box.w, view.box.h) * (art ? 0.42 : 0.22)), Math.min(MIN_BALL_R, room));
  const transform = useDerivedValue(() => {
    const pose = puttPose(progress.get(), reduced);
    const at = puttPoint(start, cup, pose.along);
    return [{ translateX: at.x }, { translateY: at.y }, { scale: pose.scale }];
  });
  const opacity = useDerivedValue(() => puttPose(progress.get(), reduced).opacity);
  const ringOpacity = useDerivedValue(() => puttPose(progress.get(), reduced).ring);
  const ringTransform = useDerivedValue(() => [{ translateX: cup.x }, { translateY: cup.y }, { scale: puttPose(progress.get(), reduced).ringScale }]);
  const ringW = radius * 5;
  return (
    <Group>
      <Group transform={ringTransform} opacity={ringOpacity}>
        {/* A ring lying on the green: a circle flattened by the view. */}
        <Group transform={FLAT}>
          <Circle cx={0} cy={0} r={ringW / 2} color={eq.coolWhite} style="stroke" strokeWidth={Math.max(2, radius * 0.6)} />
        </Group>
      </Group>
      <Group transform={transform} opacity={opacity}>
        {rect && image ? (
          <Image image={image} x={-radius} y={-radius} width={radius * 2} height={radius * 2} fit="contain" />
        ) : (
          <Group>
            <Group transform={[{ translateY: radius * 0.8 }, { scaleY: 0.35 }]}>
              <Circle cx={0} cy={0} r={radius} color={eq.night} opacity={0.35} />
            </Group>
            <Circle cx={0} cy={0} r={radius} color={eq.coolWhite} />
            <Circle cx={0} cy={0} r={radius} color={eq.steelEdge} style="stroke" strokeWidth={1} />
          </Group>
        )}
      </Group>
    </Group>
  );
}

const FULL = { x: 0, y: 0, w: 1, h: 1 };
const CENTER = { x: 0.5, y: 0.5 };
const FLAT = [{ scaleY: 0.36 }];
