// Inside the car, facing the doors. Cel-shaded 2.5D: flat value bands (shadow, base, light),
// selective dark edges, graphic highlights, no textures. Layers back to front:
//   background  the landing (painted stencil floor number, hall light) and the shaft wall seen
//               through the door vision panels, which scrolls past while the car travels
//   midground   segmented back-wall panels, side light columns, ceiling light panels
//   gameplay    door frame, doors, floor indicator (fixed)
//   foreground  angled side walls with sliding reflections, handrail, maintenance labels
// Door motion and travel run on the UI thread from the simulation's phase, timing, and trip.
// Nothing here decides what the elevator does. Reduced motion: no parallax at all.
import { Canvas, Circle, Group, Line, Path, Rect, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { stencilText } from '../../../presentation/design/stencilDigits';
import { accomplishment, celBands, parallaxPeriod } from '../../../presentation/design/tokens';
import { doorOpenFraction, type ElevatorState, type ElevatorTiming } from '../sim/elevator';
import { landingLabel, type Landing } from '../content/landings';
import { cabinGeometry, type Rect as R } from './cabinGeometry';
import { landingArt } from './landingArt';
import { LandingLayer } from './LandingLayer';
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
  /** Height of Lifty's eye-level band between the indicator and the door frame (layout.bandHeight). */
  bandHeight?: number;
  /**
   * A correct answer was confirmed: the indicator gets a steady green rim and a check. Clear and
   * calm: no flashing, no confetti. Red is never used for a wrong answer, and nothing appears then.
   */
  confirmed?: boolean;
}

const metal = celBands(T.palette.metal, T);
const panel = celBands(T.palette.paint, T);
const floorBands = celBands(T.palette.floor, T);

export const CabinScene = memo(function CabinScene({ box, elevator, timing, power, reducedMotion, calm = false, landing, bandHeight = 0, confirmed = false }: CabinSceneProps) {
  const { width: w, height: h } = box;
  const g = useMemo(() => cabinGeometry({ width: w, height: h }, bandHeight), [w, h, bandHeight]);
  const motion = reducedMotion ? 'reduced' : 'normal';

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
  // Fit the whole name on the sign (adjustsFontSizeToFit is native-only, so size it up front).
  const nameSize = Math.max(7, Math.min(signBox.h * g.door.h * 0.5, (signBox.w * g.door.w) / (landing.name.length * 0.92)));
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
        {/* ---- midground: back wall ---- */}
        <Rect x={0} y={0} width={w} height={h} color={eq.charcoal} />
        {g.panels.map((p, i) => (
          <PanelShape key={i} r={p} />
        ))}
        {g.sideLights.map((r, i) => (
          <RoundedRect key={i} x={r.x} y={r.y} width={r.w} height={r.h} r={r.w / 2} color={eq.cyan} opacity={0.55} />
        ))}

        {/* Ceiling and its light panels (cool white, flat). */}
        <Rect x={g.ceiling.x} y={g.ceiling.y} width={g.ceiling.w} height={g.ceiling.h} color={eq.recess} />
        <Group opacity={ceilingGlow}>
          {g.lights.map((r, i) => (
            <RoundedRect key={i} x={r.x} y={r.y} width={r.w} height={r.h} r={3} color={eq.coolWhite} />
          ))}
          {/* Light spill on the back wall: one flat, pale band (cel highlight, not a gradient). */}
          <Rect x={g.lights[0]!.x} y={g.ceiling.h} width={g.lights[g.lights.length - 1]!.x + g.lights[g.lights.length - 1]!.w - g.lights[0]!.x} height={Math.max(6, h * 0.02)} color={eq.coolWhite} opacity={0.07} />
        </Group>

        {/* ---- background: the landing beyond the doors, and the shaft wall ---- */}
        <Group clip={doorClip}>
          {landingLit ? <LandingLayer landing={landing} door={doorBox} /> : <Rect x={g.door.x} y={g.door.y} width={g.door.w} height={g.door.h} color="#05070B" />}
          {landingLit ? (
            <>
              {/* Painted stencil floor number: vector shapes, no font needed. */}
              {number.rects.map((r, i) => (
                <Rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} color={eq.coolWhite} opacity={0.88} />
              ))}
            </>
          ) : null}

          {/* ---- gameplay: doors (fixed plane), with vision panels onto the shaft ---- */}
          <Group transform={leftDoorTransform}>
            <DoorLeaf x={g.door.x} y={g.door.y} w={g.door.w / 2} h={g.door.h} side="left" />
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
            <DoorLeaf x={g.door.x + g.door.w / 2} y={g.door.y} w={g.door.w / 2} h={g.door.h} side="right" />
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
        <FrameShape r={g.frame} inner={g.door} />

        {/* Floor and threshold plate, with the landing's light spilling in. */}
        <Path path={paths.floorPlane} color={floorBands.base} />
        {landingLit ? <Path path={spillPath} color={art.spill.color} opacity={spillOpacity} /> : null}
        <Rect x={g.frame.x} y={g.floorY} width={g.frame.w} height={Math.max(4, (h - g.floorY) * 0.25)} color={metal.light} />
        <Line p1={vec(g.sideInset, g.floorY)} p2={vec(w - g.sideInset, g.floorY)} color={metal.edge} strokeWidth={2} />

        {/* ---- foreground: side walls, reflections, handrail ---- */}
        <Path path={paths.leftWall} color={metal.shadow} />
        <Path path={paths.rightWall} color={metal.shadow} />
        <Path path={paths.leftShade} color={metal.edge} opacity={0.6} />
        <Path path={paths.rightShade} color={metal.edge} opacity={0.6} />
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
            style={[styles.placeName, { left: g.door.x + signBox.x * g.door.w, top: signBox.y * g.door.h, width: signBox.w * g.door.w, height: signBox.h * g.door.h, fontSize: nameSize, letterSpacing: nameSize * 0.08, lineHeight: Math.round(signBox.h * g.door.h), color: art.sign.color }]}
          >
            {landing.name}
            </Text>
          </Animated.View>
        </Animated.View>
      ) : null}
      {landingLit ? <View accessible accessibilityLabel={landingLabel(landing)} style={[styles.landingA11y, { left: g.door.x, top: g.door.y, width: g.door.w, height: g.door.h * 0.6 }]} /> : null}
      {g.labels.map((l) => (
        <Text key={l.text} allowFontScaling={false} style={[styles.label, { left: l.x, top: l.y, fontSize: l.size }]} importantForAccessibility="no">
          {l.text}
        </Text>
      ))}
    </View>
  );
});

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
  const band = 14;
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
