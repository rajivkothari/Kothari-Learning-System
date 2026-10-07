// Inside the car, facing the doors. Cel-shaded 2.5D: flat value bands (shadow, base, light),
// selective dark edges, graphic highlights, no textures. Layers back to front:
//   background  the landing (painted stencil floor number, hall light) and the shaft wall seen
//               through the door vision panels, which scrolls past while the car travels
//   midground   segmented back-wall panels, side light columns, ceiling light panels
//   gameplay    door frame, doors, floor indicator (fixed)
//   foreground  angled side walls with sliding reflections, handrail, maintenance labels
// Door motion and travel run on the UI thread from the simulation's phase, timing, and trip.
// Nothing here decides what the elevator does. Reduced motion: no parallax at all.
//
// Production art (D131): each cabin part and the landing can be an illustrated layer from the art
// manifest (art/manifest.ts). Every part keeps its vector drawing as the fallback while its image
// loads or if it is missing, and the native overlays (indicator digits, floor number, place sign,
// touch areas) stay on top in the same places, so art never changes what can be read or tapped.
import { Canvas, Circle, Group, Image, Line, Path, Rect, RoundedRect, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { stencilText } from '../../../presentation/design/stencilDigits';
import { LINES } from '../content/floor15';
import { cabinArtBoxes, canvasToScreen, contain, cover, landingArtFits, landingPlacement, toDoorUnits, type CabinPlacement } from '../art/fit';
import { CABIN_CANVAS, LANDING_CANVAS, cabinLayers, landingLayers, type ArtEntry } from '../art/manifest';
import { accomplishment, celBands, parallaxPeriod } from '../../../presentation/design/tokens';
import { doorOpenFraction, type ElevatorState, type ElevatorTiming } from '../sim/elevator';
import { landingLabel, type Landing } from '../content/landings';
import { FRAME_BAND, cabinGeometry, type Rect as R } from './cabinGeometry';
import { Hotspot, hotspotTarget } from './Hotspot';
import { useArt } from './art/ArtContext';
import { ArtOverlayLayer } from './art/ArtOverlays';
import { ArtPrefetch, ArtSlot, useArtImage, type ArtSource } from './art/ArtSlot';
import { LandingArt } from './art/LandingArt';
import { NUMBER_ZONE, SIGN_ZONE, heroFor, landingArt, objectSlot } from './landingArt';
import { LandingLayer, type LandingObject } from './LandingLayer';
import type { Box } from './layout';
import { FONT_MONO, TOKENS as T, UI, eq } from './palette';
import { useTripPosition } from './useTripPosition';

export interface CabinSceneProps {
  box: Box;
  elevator: ElevatorState;
  timing: ElevatorTiming;
  power: 'off' | 'on' | 'restoring';
  repairFloor: number;
  reducedMotion: boolean;
  /** Concept Rescue: the cabin steps back (dimmer, quieter) so the practice board leads. */
  calm?: boolean;
  /** The place beyond the doors at the car's floor (content/themes/elevator-quest/landings.json). */
  landing: Landing;
  /** Where the car is going, if anywhere: its landing art is loaded during the ride (no draw). */
  nextLanding?: Landing | null;
  /** Height of Lifty's eye-level band between the indicator and the door frame (layout.bandHeight). */
  bandHeight?: number;
  /**
   * A correct answer was confirmed: the indicator gets a steady green rim and a check. Clear and
   * calm: no flashing, no confetti. Red is never used for a wrong answer, and nothing appears then.
   */
  confirmed?: boolean;
  /** The landing's current reaction (a new number replays it). 0: none. */
  reaction?: number;
  /** Free ride, doors open: the landing's touchable thing, if it has one. */
  explore?: { object: string; inspected: boolean } | null;
  onInspect?: () => void;
  /** Mission objects on this landing (D123): drawn on the landing, labelled, collectable where allowed. */
  objects?: readonly (LandingObject & { label: string; action: string | null })[];
  onCollect?: (id: string) => void;
}

const NONE: readonly (LandingObject & { label: string; action: string | null })[] = [];
const metal = celBands(T.palette.metal, T);
const panel = celBands(T.palette.paint, T);
const floorBands = celBands(T.palette.floor, T);

export const CabinScene = memo(function CabinScene({ box, elevator, timing, power, reducedMotion, calm = false, landing, nextLanding = null, bandHeight = 0, confirmed = false, reaction = 0, explore = null, onInspect, objects = NONE, onCollect }: CabinSceneProps) {
  const { width: w, height: h } = box;
  const g = useMemo(() => cabinGeometry({ width: w, height: h }, bandHeight), [w, h, bandHeight]);
  const motion = reducedMotion ? 'reduced' : 'normal';
  // Read here, outside the Canvas, and passed down: context does not reach Skia's renderer (ArtSlot).
  const artSettings = useArt();
  // Landing art: only for doorway shapes whose safe core is guaranteed (art/fit.ts), else vectors.
  const fitsArt = landingArtFits(g.door);
  const landingLayersArt = useMemo(() => (fitsArt ? landingLayers(artSettings.set, landing.floor, landing.state) : null), [artSettings.set, fitsArt, landing.floor, landing.state]);
  const layersKey = landingLayersArt ? landingLayersArt.map((l) => l.id).join('|') : null;
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const onLandingReady = useCallback((ready: boolean) => setReadyKey(ready ? layersKey : null), [layersKey]);
  const landingArtShown = layersKey !== null && readyKey === layersKey;
  const cabinArt = useMemo(() => (artSettings.cabin ? cabinLayers(artSettings.set, artSettings.inspectCabin) : null), [artSettings.cabin, artSettings.set, artSettings.inspectCabin]);
  // The current floor and the likely next one (ART_BUDGET.landingWindow): the destination loads while the car travels.
  const prefetch = useMemo(() => (fitsArt && nextLanding && nextLanding.floor !== landing.floor ? (landingLayers(artSettings.set, nextLanding.floor, nextLanding.state) ?? []) : []), [fitsArt, nextLanding, landing.floor, artSettings.set]);
  // The backing's painted door area is pinned to the real doorway (its manifest anchor, else the spec's).
  const backingAnchor = cabinArt?.backing?.anchor;
  const cabinBoxes = useMemo(() => cabinArtBoxes(g, { width: w, height: h }, backingAnchor ?? CABIN_CANVAS.backing.doorCenter), [g, w, h, backingAnchor]);

  // Initial value from the phase alone; the effect below aligns it with the clock.
  const door = useSharedValue(elevator.phase === 'idleOpen' || elevator.phase === 'doorsClosing' ? 1 : 0);
  const light = useSharedValue(power === 'off' ? 0.18 : 1);
  const calmDim = useSharedValue(calm ? 1 : 0);

  useEffect(() => {
    const now = Date.now();
    const from = doorOpenFraction(elevator, timing, now);
    const easing = Easing.inOut(Easing.quad);
    door.set(from);
    if (elevator.phase === 'doorsClosing') door.set(withTiming(0, { duration: Math.max(0, from * timing.doorCloseMs), easing }));
    else if (elevator.phase === 'doorsOpening') door.set(withTiming(1, { duration: Math.max(0, (1 - from) * timing.doorOpenMs), easing }));
  }, [door, elevator, timing]);

  useEffect(() => {
    const target = power === 'off' ? 0.18 : 1;
    // One slow, steady ramp (the large accomplishment). Never a flicker or flash.
    const duration = power === 'restoring' ? accomplishment(T, 'large', motion).ms : accomplishment(T, 'small', motion).ms;
    light.set(withTiming(target, { duration, easing: Easing.out(Easing.cubic) }));
  }, [light, power, motion]);

  useEffect(() => {
    calmDim.set(withTiming(calm ? 1 : 0, { duration: reducedMotion ? 120 : 450 }));
  }, [calmDim, calm, reducedMotion]);

  // Travel position in floors, per frame on the UI thread while travelling (same profile as the indicator).
  const position = useTripPosition(elevator, timing);

  // Parallax: the far shaft wall (depth 1) through the vision panels, reflections (depth 0.35).
  const farPeriod = parallaxPeriod(T, motion, 1);
  const nearPeriod = parallaxPeriod(T, motion, 0.35);
  const shaftShift = useDerivedValue(() => (farPeriod === 0 ? 0 : farPeriod * (position.get() - Math.floor(position.get()))));
  const reflectShift = useDerivedValue(() => (nearPeriod === 0 ? 0 : nearPeriod * (position.get() - Math.floor(position.get()))));
  const shaftTransform = useDerivedValue(() => [{ translateY: shaftShift.get() }]);
  const reflectTransform = useDerivedValue(() => [{ translateY: reflectShift.get() }]);

  const leftDoorX = useDerivedValue(() => g.door.x - door.get() * (g.door.w / 2 - 6));
  const rightDoorX = useDerivedValue(() => g.door.x + g.door.w / 2 + door.get() * (g.door.w / 2 - 6));
  const leftDoorTransform = useDerivedValue(() => [{ translateX: leftDoorX.get() - g.door.x }]);
  const rightDoorTransform = useDerivedValue(() => [{ translateX: rightDoorX.get() - (g.door.x + g.door.w / 2) }]);
  const dim = useDerivedValue(() => Math.max(0.82 * (1 - light.get()), 0.45 * calmDim.get()));
  const ceilingGlow = useDerivedValue(() => 0.25 + 0.75 * light.get());

  const paths = useMemo(() => {
    const top = g.ceiling.h;
    const leftWall = Skia.PathBuilder.Make().moveTo(0, 0).lineTo(g.sideInset, top).lineTo(g.sideInset, g.floorY).lineTo(0, h).close().build();
    const rightWall = Skia.PathBuilder.Make().moveTo(w, 0).lineTo(w - g.sideInset, top).lineTo(w - g.sideInset, g.floorY).lineTo(w, h).close().build();
    // Cel shadow band along the floor edge of each side wall.
    const leftShade = Skia.PathBuilder.Make().moveTo(0, h * 0.78).lineTo(g.sideInset, g.floorY - (g.floorY - top) * 0.18).lineTo(g.sideInset, g.floorY).lineTo(0, h).close().build();
    const rightShade = Skia.PathBuilder.Make().moveTo(w, h * 0.78).lineTo(w - g.sideInset, g.floorY - (g.floorY - top) * 0.18).lineTo(w - g.sideInset, g.floorY).lineTo(w, h).close().build();
    const floorPlane = Skia.PathBuilder.Make().moveTo(g.sideInset, g.floorY).lineTo(w - g.sideInset, g.floorY).lineTo(w, h).lineTo(0, h).close().build();
    return { leftWall, rightWall, leftShade, rightShade, floorPlane };
  }, [g, w, h]);
  const doorClip = useMemo(() => Skia.XYWHRect(g.door.x, g.door.y, g.door.w, g.door.h), [g.door]);
  const leftWallClip = paths.leftWall;
  const rightWallClip = paths.rightWall;

  // The whole building is dark until the lift wakes. After that each floor shows its own place
  // (Floor 15 stays dormant until its power is restored: that is the landing's state, not a blackout).
  const landingLit = power !== 'off';
  const doorBox = useMemo(() => ({ x: g.door.x, y: g.door.y, w: g.door.w, h: g.door.h }), [g.door]);
  const art = useMemo(() => landingArt(landing, g.door.w / Math.max(1, g.door.h)), [landing, g.door.w, g.door.h]);
  // The touch area for the landing's hero, in cabin coordinates (at least the minimum target).
  // With landing art showing, the touch area is the art's own (manifest "hit"), so it covers what is drawn.
  const hotspot = useMemo(() => {
    if (!explore) return null;
    const background = landingArtShown ? landingLayersArt?.find((l) => l.layer === 'background') : undefined;
    const withHit = landingArtShown ? landingLayersArt?.find((l) => l.hit) : undefined;
    const artHit = background && withHit?.hit ? toDoorUnits(canvasToScreen(landingPlacement(g.door, background), withHit.hit), g.door) : null;
    const area = artHit ?? heroFor(landing, g.door.w / Math.max(1, g.door.h))?.hit ?? null;
    if (!area) return null;
    const hit = { x: g.door.x + area.x * g.door.w, y: g.door.y + area.y * g.door.h, width: area.w * g.door.w, height: area.h * g.door.h };
    return { hit, target: hotspotTarget(hit, { x: g.door.x, y: g.door.y, width: g.door.w, height: g.door.h }) };
  }, [explore, landing, g.door, landingArtShown, landingLayersArt]);
  // Light from the landing spills onto the cabin floor as the doors open (follows the doors, so
  // reduced motion gets it with no extra animation).
  const spillOpacity = useDerivedValue(() => door.get() * art.spill.strength);
  const spillPath = useMemo(
    () =>
      Skia.PathBuilder.Make()
        .moveTo(g.door.x, g.floorY)
        .lineTo(g.door.x + g.door.w, g.floorY)
        .lineTo(g.door.x + g.door.w * 1.3, h)
        .lineTo(g.door.x - g.door.w * 0.3, h)
        .close()
        .build(),
    [g.door, g.floorY, h],
  );
  // The threshold plate under the doors. With cabin art it reuses the frame's lintel strip (the
  // same brass profile), so no flat grey bar sits between illustrated doors and floor (D144).
  const sill = useMemo((): CabinPlacement => ({ box: { x: g.frame.x, y: g.floorY, w: g.frame.w, h: Math.max(4, (h - g.floorY) * 0.25) }, fit: 'cover', focus: { x: 0.5, y: 0.5 }, clip: 'none' }), [g.frame, g.floorY, h]);
  // The place name is native text, shown only through the gap between the door leaves.
  const gapStyle = useAnimatedStyle(() => {
    const gap = 2 * door.get() * (g.door.w / 2 - 6);
    return { left: g.door.x + g.door.w / 2 - gap / 2, width: gap };
  });
  // Counter-shift, so the text inside stays put in cabin coordinates while the gap opens.
  const gapContentStyle = useAnimatedStyle(() => {
    const gap = 2 * door.get() * (g.door.w / 2 - 6);
    return { left: -(g.door.x + g.door.w / 2 - gap / 2) };
  });
  const signBox = art.sign.box;
  // With landing art, the art paints the sign plate and says which ink reads on it (manifest signInk).
  const artBackground = landingArtShown ? landingLayersArt?.find((l) => l.layer === 'background') : undefined;
  const signColor = artBackground ? (artBackground.signInk === 'dark' ? eq.night : eq.coolWhite) : art.sign.color;
  // An illustrated landing keeps its middle for the scene: the floor number moves onto the sign,
  // beside the name, as live text (D136). The indicator above the doors still shows the floor.
  const signText = artBackground ? LINES.signNumbered(landing.floor, landing.name) : landing.name;
  // Fit the whole sign (adjustsFontSizeToFit is native-only, so size it up front).
  const nameSize = Math.max(7, Math.min(signBox.h * g.door.h * 0.5, (signBox.w * g.door.w) / (signText.length * 0.92)));
  const number = useMemo(() => {
    const s = stencilText(String(elevator.floor), 0, 0, g.landingNumber.height);
    return { rects: s.rects.map((r) => ({ ...r, x: r.x + g.landingNumber.cx - s.width / 2, y: r.y + g.landingNumber.y })), width: s.width };
  }, [elevator.floor, g.landingNumber]);
  const arrow = elevator.direction;
  const indicatorText = power === 'off' ? '' : String(elevator.indicator);

  // Vision panels: a narrow glass slot in each door leaf.
  const slotW = Math.max(6, g.door.w * 0.05);
  const slotH = g.door.h * 0.42;
  const slotY = g.door.y + g.door.h * 0.2;
  const leftSlotX = g.door.x + g.door.w / 2 - slotW - g.door.w * 0.07;
  const rightSlotX = g.door.x + g.door.w / 2 + g.door.w * 0.07;
  const leftSlotClip = useMemo(() => Skia.XYWHRect(leftSlotX, slotY, slotW, slotH), [leftSlotX, slotY, slotW, slotH]);
  const rightSlotClip = useMemo(() => Skia.XYWHRect(rightSlotX, slotY, slotW, slotH), [rightSlotX, slotY, slotW, slotH]);
  const beams = useMemo(() => {
    const period = farPeriod || 48;
    const n = Math.ceil(slotH / period) + 2;
    return Array.from({ length: n }, (_, i) => slotY - period + i * period);
  }, [farPeriod, slotH, slotY]);
  const streaks = useMemo(() => {
    const period = nearPeriod || 24;
    const n = Math.ceil((g.floorY - g.ceiling.h) / (period * 3)) + 2;
    return Array.from({ length: n }, (_, i) => g.ceiling.h - period * 3 + i * period * 3);
  }, [nearPeriod, g.floorY, g.ceiling.h]);

  return (
    <View style={[styles.box, { left: box.x, top: box.y, width: w, height: h }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <ArtPrefetch entries={prefetch} art={artSettings} />
        {/* ---- midground: back wall ---- */}
        <CabinArt art={artSettings} entry={cabinArt?.backing} place={cabinBoxes.backing}>
          <Rect x={0} y={0} width={w} height={h} color={eq.charcoal} />
          {g.panels.map((p, i) => (
            <PanelShape key={i} r={p} />
          ))}
          {g.sideLights.map((r, i) => (
            <RoundedRect key={i} x={r.x} y={r.y} width={r.w} height={r.h} r={r.w / 2} color={eq.cyan} opacity={0.55} />
          ))}
        </CabinArt>

        {/* Ceiling and its light panels (cool white, flat). */}
        <CabinArt art={artSettings} entry={cabinArt?.ceiling} place={cabinBoxes.ceiling}>
          <Rect x={g.ceiling.x} y={g.ceiling.y} width={g.ceiling.w} height={g.ceiling.h} color={eq.recess} />
          <Group opacity={ceilingGlow}>
            {g.lights.map((r, i) => (
              <RoundedRect key={i} x={r.x} y={r.y} width={r.w} height={r.h} r={3} color={eq.coolWhite} />
            ))}
            {/* Light spill on the back wall: one flat, pale band (cel highlight, not a gradient). */}
            <Rect x={g.lights[0]!.x} y={g.ceiling.h} width={g.lights[g.lights.length - 1]!.x + g.lights[g.lights.length - 1]!.w - g.lights[0]!.x} height={Math.max(6, h * 0.02)} color={eq.coolWhite} opacity={0.07} />
          </Group>
        </CabinArt>

        {/* ---- background: the landing beyond the doors, and the shaft wall ---- */}
        <Group clip={doorClip}>
          {landingLit ? (
            landingLayersArt ? (
              <LandingArt
                art={artSettings}
                layers={landingLayersArt}
                landing={landing}
                door={doorBox}
                doorOpen={door}
                reaction={reaction}
                reducedMotion={reducedMotion}
                objects={objects}
                onReady={onLandingReady}
                fallback={<LandingLayer landing={landing} door={doorBox} reaction={reaction} reducedMotion={reducedMotion} objects={objects} artSource={artSettings} />}
              />
            ) : (
              <LandingLayer landing={landing} door={doorBox} reaction={reaction} reducedMotion={reducedMotion} objects={objects} artSource={artSettings} />
            )
          ) : (
            <Rect x={g.door.x} y={g.door.y} width={g.door.w} height={g.door.h} color="#05070B" />
          )}
          {landingLit && !landingArtShown ? (
            <>
              {/* Painted stencil floor number on a vector landing: vector shapes, no font needed. */}
              {number.rects.map((r, i) => (
                <Rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} color={eq.coolWhite} opacity={0.88} />
              ))}
            </>
          ) : null}

          {/* ---- gameplay: doors (fixed plane), with vision panels onto the shaft ---- */}
          <Group transform={leftDoorTransform}>
            <CabinArt art={artSettings} entry={cabinArt?.['door-left']} place={cabinBoxes['door-left']}>
              <DoorLeaf x={g.door.x} y={g.door.y} w={g.door.w / 2} h={g.door.h} side="left" />
            </CabinArt>
            <Group clip={leftSlotClip}>
              <Rect x={leftSlotX} y={slotY} width={slotW} height={slotH} color={eq.recess} />
              <Group transform={shaftTransform}>
                {beams.map((y) => (
                  <Rect key={y} x={leftSlotX} y={y} width={slotW} height={4} color={eq.steel} />
                ))}
              </Group>
            </Group>
            <Rect x={leftSlotX} y={slotY} width={slotW} height={slotH} color={eq.steelEdge} style="stroke" strokeWidth={1.5} />
          </Group>
          <Group transform={rightDoorTransform}>
            <CabinArt art={artSettings} entry={cabinArt?.['door-right']} place={cabinBoxes['door-right']}>
              <DoorLeaf x={g.door.x + g.door.w / 2} y={g.door.y} w={g.door.w / 2} h={g.door.h} side="right" />
            </CabinArt>
            <Group clip={rightSlotClip}>
              <Rect x={rightSlotX} y={slotY} width={slotW} height={slotH} color={eq.recess} />
              <Group transform={shaftTransform}>
                {beams.map((y) => (
                  <Rect key={y} x={rightSlotX} y={y} width={slotW} height={4} color={eq.steel} />
                ))}
              </Group>
            </Group>
            <Rect x={rightSlotX} y={slotY} width={slotW} height={slotH} color={eq.steelEdge} style="stroke" strokeWidth={1.5} />
          </Group>
        </Group>

        {/* Door frame: light band on the key-light side, shadow on the other, dark outline. */}
        <FrameArt art={artSettings} top={cabinArt?.['frame-top']} left={cabinArt?.['frame-left']} right={cabinArt?.['frame-right']} boxes={cabinBoxes}>
          <FrameShape r={g.frame} inner={g.door} />
        </FrameArt>

        {/* Floor and threshold plate, with the landing's light spilling in. */}
        <CabinArt art={artSettings} entry={cabinArt?.floor} place={cabinBoxes.floor} clip={paths.floorPlane}>
          <Path path={paths.floorPlane} color={floorBands.base} />
        </CabinArt>
        {cabinArt?.inlay ? <CabinArt art={artSettings} entry={cabinArt.inlay} place={cabinBoxes.inlay} clip={paths.floorPlane} /> : null}
        {landingLit ? <Path path={spillPath} color={art.spill.color} opacity={spillOpacity} /> : null}
        <CabinArt art={artSettings} entry={cabinArt?.['frame-top']} place={sill}>
          <Rect x={sill.box.x} y={sill.box.y} width={sill.box.w} height={sill.box.h} color={metal.light} />
        </CabinArt>
        <Line p1={vec(g.sideInset, g.floorY)} p2={vec(w - g.sideInset, g.floorY)} color={metal.edge} strokeWidth={2} />

        {/* ---- foreground: side walls, reflections, handrail ---- */}
        <CabinArt art={artSettings} entry={cabinArt?.['wall-left']} place={cabinBoxes['wall-left']} clip={paths.leftWall}>
          <Path path={paths.leftWall} color={metal.shadow} />
          <Path path={paths.leftShade} color={metal.edge} opacity={0.6} />
        </CabinArt>
        <CabinArt art={artSettings} entry={cabinArt?.['wall-right']} place={cabinBoxes['wall-right']} clip={paths.rightWall}>
          <Path path={paths.rightWall} color={metal.shadow} />
          <Path path={paths.rightShade} color={metal.edge} opacity={0.6} />
        </CabinArt>
        <Group clip={leftWallClip}>
          <Group transform={reflectTransform}>
            {streaks.map((y) => (
              <Rect key={y} x={0} y={y} width={g.sideInset} height={3} color={eq.coolWhite} opacity={0.08} />
            ))}
          </Group>
        </Group>
        <Group clip={rightWallClip}>
          <Group transform={reflectTransform}>
            {streaks.map((y) => (
              <Rect key={y} x={w - g.sideInset} y={y} width={g.sideInset} height={3} color={eq.coolWhite} opacity={0.08} />
            ))}
          </Group>
        </Group>
        <Line p1={vec(g.sideInset, g.ceiling.h)} p2={vec(g.sideInset, g.floorY)} color={metal.edge} strokeWidth={2} />
        <Line p1={vec(w - g.sideInset, g.ceiling.h)} p2={vec(w - g.sideInset, g.floorY)} color={metal.edge} strokeWidth={2} />
        <Line p1={vec(g.sideInset, g.handrailY)} p2={vec(0, g.handrailY + h * 0.08)} color={metal.light} strokeWidth={6} />
        <Line p1={vec(g.sideInset, g.handrailY + 3)} p2={vec(0, g.handrailY + h * 0.08 + 3)} color={metal.edge} strokeWidth={2} />
        <Line p1={vec(w - g.sideInset, g.handrailY)} p2={vec(w, g.handrailY + h * 0.08)} color={metal.light} strokeWidth={6} />
        <Line p1={vec(w - g.sideInset, g.handrailY + 3)} p2={vec(w, g.handrailY + h * 0.08 + 3)} color={metal.edge} strokeWidth={2} />

        {/* Cabin lighting overlay (art only): follows the power, one flat layer, no shader. */}
        {cabinArt?.light ? (
          <Group opacity={ceilingGlow}>
            <CabinArt art={artSettings} entry={cabinArt.light} place={cabinBoxes.light} />
          </Group>
        ) : null}

        {/* Indicator housing: recessed display in a steel bezel. */}
        <RoundedRect x={g.indicator.x - 4} y={g.indicator.y - 4} width={g.indicator.w + 8} height={g.indicator.h + 8} r={12} color={metal.base} />
        <RoundedRect x={g.indicator.x - 4} y={g.indicator.y - 4} width={g.indicator.w + 8} height={3} r={2} color={metal.light} />
        <RoundedRect x={g.indicator.x} y={g.indicator.y} width={g.indicator.w} height={g.indicator.h} r={9} color="#04060A" />
        <RoundedRect x={g.indicator.x - 4} y={g.indicator.y - 4} width={g.indicator.w + 8} height={g.indicator.h + 8} r={12} color={metal.edge} style="stroke" strokeWidth={2} />
        {confirmed ? <ConfirmMark r={g.indicator} /> : null}
        <IndicatorArrow x={g.indicator.x + 18} y={g.indicator.y + g.indicator.h / 2} up active={power !== 'off' && arrow === 'up'} />
        <IndicatorArrow x={g.indicator.x + g.indicator.w - 18} y={g.indicator.y + g.indicator.h / 2} up={false} active={power !== 'off' && arrow === 'down'} />

        {/* Power and calm mode: one flat dimming layer. */}
        <Rect x={0} y={0} width={w} height={h} color="#000" opacity={dim} />

        {/* Development overlays (developer tools only; production never turns them on). */}
        {artSettings.overlays.doorway || artSettings.overlays.safe || artSettings.overlays.hitboxes ? (
          <ArtOverlayLayer
            overlays={artSettings.overlays}
            door={g.door}
            placement={landingArtShown && landingLayersArt ? landingPlacement(g.door, landingLayersArt[0]!) : landingPlacement(g.door)}
            artShown={landingArtShown}
            fits={fitsArt}
            zones={[...(landingArtShown ? [] : [NUMBER_ZONE]), SIGN_ZONE, ...objects.map((o) => objectSlot(o.visual))]}
            hits={[...(hotspot && explore ? [hotspot.target] : []), ...objects.filter((o) => !o.collected).map((o) => doorToCabin(objectSlot(o.visual), g.door))]}
            safe={LANDING_CANVAS.safe}
          />
        ) : null}
      </Canvas>
      {/* Indicator digits as native text: crisp, scalable, readable by screen readers. */}
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={power === 'off' ? 'Floor indicator off' : `Floor indicator: ${elevator.indicator}${arrow ? `, going ${arrow}` : ''}`}
        accessibilityLiveRegion="polite"
        style={[styles.indicator, { left: g.indicator.x, top: g.indicator.y, width: g.indicator.w, height: g.indicator.h }]}
      >
        <Text allowFontScaling={false} style={[styles.digits, { fontSize: Math.round(g.indicator.h * 0.62) }]}>
          {indicatorText}
        </Text>
      </View>
      {landingLit ? (
        <Animated.View pointerEvents="none" style={[styles.gap, { top: g.door.y, height: g.door.h }, gapStyle]}>
          <Animated.View style={[styles.gapContent, { width: w, height: g.door.h }, gapContentStyle]}>
            <Text
            allowFontScaling={false}
            numberOfLines={1}
            importantForAccessibility="no"
            style={[styles.placeName, { left: g.door.x + signBox.x * g.door.w, top: signBox.y * g.door.h, width: signBox.w * g.door.w, height: signBox.h * g.door.h, fontSize: nameSize, letterSpacing: nameSize * 0.08, lineHeight: Math.round(signBox.h * g.door.h), color: signColor }]}
          >
            {signText}
            </Text>
          </Animated.View>
        </Animated.View>
      ) : null}
      {landingLit ? <View accessible accessibilityLabel={landingLabel(landing)} style={[styles.landingA11y, { left: g.door.x, top: g.door.y, width: g.door.w, height: g.door.h * 0.6 }]} /> : null}
      {landingLit && explore && hotspot && onInspect ? <Hotspot hit={hotspot.hit} target={hotspot.target} object={explore.object} inspected={explore.inspected} onPress={onInspect} /> : null}
      {landingLit && elevator.phase === 'idleOpen'
        ? objects
            .filter((o) => !o.collected)
            .map((o) => {
              const slot = objectSlot(o.visual);
              const hit = { x: g.door.x + slot.x * g.door.w, y: g.door.y + slot.y * g.door.h, width: slot.w * g.door.w, height: slot.h * g.door.h };
              return o.action && onCollect ? (
                <Hotspot key={o.id} hit={hit} target={hotspotTarget(hit, { x: g.door.x, y: g.door.y, width: g.door.w, height: g.door.h })} object={o.label} inspected={false} label={o.action} onPress={() => onCollect(o.id)} />
              ) : (
                <View key={o.id} accessible accessibilityLabel={o.label} style={[styles.landingA11y, { left: hit.x, top: hit.y, width: hit.width, height: hit.height }]} />
              );
            })
        : null}
      {g.labels.map((l) => (
        <Text key={l.text} allowFontScaling={false} style={[styles.label, { left: l.x, top: l.y, fontSize: l.size }]} importantForAccessibility="no">
          {l.text}
        </Text>
      ))}
    </View>
  );
});

const doorToCabin = (b: { x: number; y: number; w: number; h: number }, door: R) => ({ x: door.x + b.x * door.w, y: door.y + b.y * door.h, width: b.w * door.w, height: b.h * door.h });

/**
 * One cabin part as art, or its vector drawing (children) while the image loads or if it has none.
 * The art is uniformly scaled into the part's box and clipped to the part's shape.
 */
function CabinArt({ art, entry, place, clip, children = null }: { art: ArtSource; entry: ArtEntry | undefined; place: CabinPlacement; clip?: SkPath; children?: ReactNode }) {
  const rect = useMemo(() => (entry ? (place.fit === 'cover' ? cover(place.box, entry, place.focus, place.target) : contain(place.box, entry, { x: 0.5, y: 0 })) : null), [entry, place]);
  const box = useMemo(() => Skia.XYWHRect(place.box.x, place.box.y, place.box.w, place.box.h), [place.box]);
  if (!entry || !rect) return <>{children}</>;
  return (
    <Group clip={clip ?? box}>
      <ArtSlot entry={entry} rect={rect} art={art} fallback={children} />
    </Group>
  );
}

/** The door frame as three art pieces, drawn only when all three have loaded; else the vector frame. */
function FrameArt({ art, top, left, right, boxes, children }: { art: ArtSource; top: ArtEntry | undefined; left: ArtEntry | undefined; right: ArtEntry | undefined; boxes: Record<string, CabinPlacement>; children: ReactNode }) {
  const images = [useArtImage(top ?? null, art), useArtImage(left ?? null, art), useArtImage(right ?? null, art)];
  const entries = [top, left, right];
  const places = [boxes['frame-top']!, boxes['frame-left']!, boxes['frame-right']!];
  if (images.some((i) => !i) || entries.some((e) => !e)) return <>{children}</>;
  return (
    <Group>
      {places.map((p, i) => {
        const r = cover(p.box, entries[i]!, p.focus);
        return (
          <Group key={i} clip={Skia.XYWHRect(p.box.x, p.box.y, p.box.w, p.box.h)}>
            <Image image={images[i]!} x={r.x} y={r.y} width={r.w} height={r.h} fit="cover" />
          </Group>
        );
      })}
    </Group>
  );
}

function PanelShape({ r }: { r: R }) {
  // Back-wall panel: three flat value bands and a dark edge on two sides only (selective edges).
  return (
    <Group>
      <RoundedRect x={r.x} y={r.y} width={r.w} height={r.h} r={6} color={panel.base} />
      <Rect x={r.x} y={r.y + r.h * 0.72} width={r.w} height={r.h * 0.28 - 6} color={panel.shadow} />
      <Rect x={r.x + 6} y={r.y + 6} width={Math.max(2, r.w * 0.06)} height={r.h * 0.6} color={panel.light} opacity={0.5} />
      <Line p1={vec(r.x + r.w, r.y + 6)} p2={vec(r.x + r.w, r.y + r.h - 6)} color={panel.edge} strokeWidth={2} />
      <Line p1={vec(r.x + 6, r.y + r.h)} p2={vec(r.x + r.w - 6, r.y + r.h)} color={panel.edge} strokeWidth={2} />
    </Group>
  );
}

function FrameShape({ r, inner }: { r: R; inner: R }) {
  const band = FRAME_BAND;
  return (
    <Group>
      <Rect x={r.x} y={r.y} width={band} height={r.h} color={metal.light} />
      <Rect x={r.x + r.w - band} y={r.y} width={band} height={r.h} color={metal.shadow} />
      <Rect x={r.x} y={r.y} width={r.w} height={band} color={metal.base} />
      <Rect x={r.x} y={r.y} width={r.w} height={3} color={metal.light} />
      <Rect x={inner.x - 1} y={inner.y - 1} width={inner.w + 2} height={inner.h + 1} color={metal.edge} style="stroke" strokeWidth={2} />
      <Rect x={r.x} y={r.y} width={r.w} height={r.h} color={metal.edge} style="stroke" strokeWidth={2} />
    </Group>
  );
}

function DoorLeaf({ x, y, w, h, side }: { x: number; y: number; w: number; h: number; side: 'left' | 'right' }) {
  // Brushed door leaf as flat bands: base, a light band toward the key light, a shadow seam.
  const seamX = side === 'left' ? x + w - 3 : x;
  return (
    <Group>
      <Rect x={x} y={y} width={w} height={h} color={metal.base} />
      <Rect x={side === 'left' ? x + w * 0.12 : x + w * 0.2} y={y} width={w * 0.14} height={h} color={metal.light} opacity={0.55} />
      <Rect x={x} y={y + h * 0.86} width={w} height={h * 0.14} color={metal.shadow} />
      <Rect x={seamX} y={y} width={3} height={h} color={metal.edge} />
    </Group>
  );
}

function ConfirmMark({ r }: { r: R }) {
  const s = Math.max(12, r.h * 0.32);
  const cx = r.x + r.w + 4;
  const cy = r.y - 4;
  const check = useMemo(() => Skia.PathBuilder.Make().moveTo(cx - s * 0.32, cy).lineTo(cx - s * 0.08, cy + s * 0.24).lineTo(cx + s * 0.34, cy - s * 0.22).build(), [cx, cy, s]);
  return (
    <Group>
      <RoundedRect x={r.x - 4} y={r.y - 4} width={r.w + 8} height={r.h + 8} r={12} color={eq.ok} style="stroke" strokeWidth={3} />
      <Circle cx={cx} cy={cy} r={s * 0.62} color={eq.ok} />
      <Path path={check} color={eq.night} style="stroke" strokeWidth={Math.max(2.5, s * 0.16)} strokeCap="round" strokeJoin="round" />
    </Group>
  );
}

function IndicatorArrow({ x, y, up, active }: { x: number; y: number; up: boolean; active: boolean }) {
  const path = useMemo(() => {
    const s = 9;
    const b = Skia.PathBuilder.Make();
    if (up) b.moveTo(x, y - s).lineTo(x + s, y + s * 0.6).lineTo(x - s, y + s * 0.6).close();
    else b.moveTo(x, y + s).lineTo(x + s, y - s * 0.6).lineTo(x - s, y - s * 0.6).close();
    return b.build();
  }, [x, y, up]);
  return <Path path={path} color={active ? eq.amber : '#2A2116'} />;
}

const styles = StyleSheet.create({
  box: { position: 'absolute', borderRadius: 16, overflow: 'hidden', backgroundColor: eq.night },
  indicator: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  digits: {
    color: eq.amber,
    fontFamily: FONT_MONO,
    fontWeight: '700',
    textShadowColor: 'rgba(255,178,63,0.7)',
    textShadowRadius: 6,
    letterSpacing: 2,
  },
  landingA11y: { position: 'absolute' },
  gap: { position: 'absolute', overflow: 'hidden' },
  gapContent: { position: 'absolute', top: 0 },
  placeName: { position: 'absolute', fontWeight: '900', textAlign: 'center' },
  label: { ...UI(0.7), position: 'absolute', color: eq.textDim, opacity: 0.7 },
});
