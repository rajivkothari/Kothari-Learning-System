// Concept D cabin: inside the car in one-point perspective, facing the doors. Same props and
// animation plumbing as CabinScene.tsx (the M5 cel scene, kept until acceptance). Layers,
// back to front:
//   landing      the floor beyond the doors, chosen by FloorLook (Floor 15: the repair deck)
//   doors        two brushed leaves sliding on UI-thread transforms, vision slots onto the shaft
//   frame        brass frame with a reveal, threshold plate
//   shell        back wall, ceiling light rails, side walls, sconces, handrails, floor
//   indicator    brass header, dark glass, amber glow, direction arrows (digits are native text)
// Door motion and travel run on the UI thread from the simulation's phase, timing and trip.
// Nothing here decides what the elevator does. Reduced motion: no parallax at all.
import { Canvas, Group, Rect, Skia } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Easing, useDerivedValue, useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';

import { accomplishment, parallaxPeriod } from '../../../presentation/design/tokens';
import { doorOpenFraction, profile } from '../sim/elevator';
import type { CabinSceneProps } from './CabinScene';
import { conceptGeometry, type Rect as R } from './conceptGeometry';
import { floorLook } from './floorLooks';
import { FONT_MONO, TOKENS as T, UI, eq } from './palette';
import { CabinShell } from './scene/CabinShell';
import { DoorFrame, DoorLeaves, type DoorSlots } from './scene/DoorAssembly';
import { IndicatorHousing } from './scene/IndicatorHousing';
import { Landing } from './scene/landings/Landing';

export interface ConceptCabinSceneProps extends CabinSceneProps {
  /** The repair deck is lit only once the mission has restored it (presentation state). */
  repairDeckLit: boolean;
  /** Where the shaft map sits, relative to the cabin box, so the shell can back it with a placard. */
  gauge?: R;
}

export const ConceptCabinScene = memo(function ConceptCabinScene({ box, elevator, timing, power, repairFloor, reducedMotion, calm = false, repairDeckLit, gauge }: ConceptCabinSceneProps) {
  const { width: w, height: h } = box;
  const g = useMemo(() => conceptGeometry({ width: w, height: h }), [w, h]);
  const motion = reducedMotion ? 'reduced' : 'normal';

  // ---- animation plumbing: identical to CabinScene ----
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
    const duration = power === 'restoring' ? accomplishment(T, 'large', motion).ms : accomplishment(T, 'small', motion).ms;
    light.set(withTiming(target, { duration, easing: Easing.out(Easing.cubic) }));
  }, [light, power, motion]);

  useEffect(() => {
    calmDim.set(withTiming(calm ? 1 : 0, { duration: reducedMotion ? 120 : 450 }));
  }, [calmDim, calm, reducedMotion]);

  const trip = useSharedValue({ moving: 0, from: elevator.floor, to: elevator.floor, startAt: 0, duration: 1, accel: 0, decel: 0 });
  const position = useSharedValue(elevator.floor);
  useEffect(() => {
    const t = elevator.trip;
    const moving = (elevator.phase === 'traveling' || elevator.phase === 'decelerating') && t ? 1 : 0;
    trip.set({ moving, from: t?.from ?? elevator.floor, to: t?.to ?? elevator.floor, startAt: t?.startAt ?? 0, duration: t?.durationMs ?? 1, accel: timing.accelMs, decel: timing.decelMs });
    if (!moving) position.set(elevator.floor);
  }, [elevator, timing, trip, position]);
  useFrameCallback(() => {
    const t = trip.get();
    if (!t.moving) return;
    const u = (Date.now() - t.startAt) / t.duration;
    position.set(t.from + (t.to - t.from) * profile(u, t.accel / t.duration, t.decel / t.duration));
  });

  const farPeriod = parallaxPeriod(T, motion, 1);
  const shaftShift = useDerivedValue(() => (farPeriod === 0 ? 0 : farPeriod * (position.get() - Math.floor(position.get()))));
  const shaftTransform = useDerivedValue(() => [{ translateY: shaftShift.get() }]);
  const leftDoorTransform = useDerivedValue(() => [{ translateX: -door.get() * (g.door.w / 2 - 4) }]);
  const rightDoorTransform = useDerivedValue(() => [{ translateX: door.get() * (g.door.w / 2 - 4) }]);
  const dim = useDerivedValue(() => Math.max(0.82 * (1 - light.get()), 0.45 * calmDim.get()));
  const glow = useDerivedValue(() => light.get());

  // ---- static geometry ----
  const doorClip = useMemo(() => Skia.XYWHRect(g.door.x, g.door.y, g.door.w, g.door.h), [g.door]);
  const slots: DoorSlots = useMemo(() => {
    const d = g.door;
    const slotW = Math.max(6, d.w * 0.045);
    const slotH = d.h * 0.3;
    const slotY = d.y + d.h * 0.12;
    const left = { x: d.x + d.w / 2 - slotW - d.w * 0.08, y: slotY, w: slotW, h: slotH };
    const right = { x: d.x + d.w / 2 + d.w * 0.08, y: slotY, w: slotW, h: slotH };
    const period = farPeriod || 48;
    const n = Math.ceil(slotH / period) + 2;
    return { left, right, leftClip: Skia.XYWHRect(left.x, left.y, left.w, left.h), rightClip: Skia.XYWHRect(right.x, right.y, right.w, right.h), beams: Array.from({ length: n }, (_, i) => slotY - period + i * period) };
  }, [g.door, farPeriod]);

  const look = floorLook(elevator.floor, repairFloor);
  const landingLit = power !== 'off';
  const arrow = elevator.direction;
  const indicatorText = power === 'off' ? '' : String(elevator.indicator);

  return (
    <View style={[styles.box, { left: box.x, top: box.y, width: w, height: h }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <CabinShell g={g} gauge={gauge} />
        <Group clip={doorClip}>
          {landingLit ? <Landing g={g} look={look} repairDeckLit={repairDeckLit} /> : <Rect x={g.door.x} y={g.door.y} width={g.door.w} height={g.door.h} color="#05070B" />}
          <DoorLeaves g={g} leftTransform={leftDoorTransform} rightTransform={rightDoorTransform} shaftTransform={shaftTransform} slots={slots} />
        </Group>
        <DoorFrame g={g} />
        <IndicatorHousing g={g} direction={arrow} powered={power !== 'off'} glow={glow} />
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
        <View
          accessible
          accessibilityLabel={look.landing === 'repairDeck' ? `Landing sign: floor ${elevator.floor}, the repair deck${repairDeckLit ? '' : ', unpowered'}` : `Landing sign: floor ${elevator.floor}`}
          style={[styles.landingA11y, { left: g.door.x, top: g.door.y, width: g.door.w, height: g.door.h * 0.6 }]}
        />
      ) : null}
      {g.labels.map((l) => (
        <Text key={l.text} allowFontScaling={false} style={[styles.label, { left: l.x, top: l.y, fontSize: l.size }]} importantForAccessibility="no">
          {l.text}
        </Text>
      ))}
    </View>
  );
});

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
  label: { ...UI(0.7), position: 'absolute', color: eq.textDim, opacity: 0.6 },
});
