// Inside the car, facing the doors: front wall, sliding doors, the landing beyond, the floor
// indicator above the doorway, ceiling light. Prototype Skia shapes and gradients only.
// Door motion runs on the UI thread from the simulation's phase and timing; nothing here
// decides what the elevator does.
import { BlurMask, Canvas, Group, Line, LinearGradient, Path, Rect, RoundedRect, Skia, Text as SkText, matchFont, vec, type SkFont } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { doorOpenFraction, type ElevatorState, type ElevatorTiming } from '../sim/elevator';
import type { Box } from './layout';
import { eq } from './palette';

export interface CabinSceneProps {
  box: Box;
  elevator: ElevatorState;
  timing: ElevatorTiming;
  power: 'off' | 'on' | 'restoring';
  repairFloor: number;
  reducedMotion: boolean;
}

function landingFont(size: number): SkFont | null {
  try {
    return matchFont({ fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }), fontSize: size, fontWeight: 'bold' });
  } catch {
    return null;
  }
}

/** Landing wall colors cycle so each floor looks a little different (prototype art). */
const LANDING = ['#14304F', '#1D2B3C', '#173A3A', '#2B2440', '#1E3247'];

export const CabinScene = memo(function CabinScene({ box, elevator, timing, power, repairFloor, reducedMotion }: CabinSceneProps) {
  const { width: w, height: h } = box;
  // Initial value from the phase alone; the effect below aligns it with the clock.
  const door = useSharedValue(elevator.phase === 'idleOpen' || elevator.phase === 'doorsClosing' ? 1 : 0);
  const light = useSharedValue(power === 'off' ? 0.18 : 1);

  // Doors follow the simulation: start from where they are, run for the remaining time.
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
    // One slow, steady ramp. Never a flicker or flash.
    light.set(withTiming(target, { duration: power === 'restoring' ? (reducedMotion ? 400 : 1800) : reducedMotion ? 150 : 600, easing: Easing.out(Easing.cubic) }));
  }, [light, power, reducedMotion]);

  const g = useMemo(() => {
    // Top to bottom: indicator, door frame, doors, floor. Works from short portrait cabins to
    // tall landscape ones; nothing is ever placed above the top edge.
    const indH = Math.min(80, Math.max(40, h * 0.11));
    const indW = Math.max(116, Math.min(w * 0.3, indH * 2.6));
    const indY = Math.max(8, h * 0.07);
    const floorY = h * 0.9;
    const frameTop = indY + indH + Math.max(8, h * 0.04);
    const dy = frameTop + 14;
    const doorH = Math.max(40, floorY - dy);
    const doorW = Math.min(w * 0.5, doorH * 1.05);
    const dx = (w - doorW) / 2;
    return {
      door: { x: dx, y: dy, w: doorW, h: doorH },
      frame: { x: dx - 14, y: frameTop, w: doorW + 28, h: doorH + 14 },
      ind: { x: (w - indW) / 2, y: indY, w: indW, h: indH },
      floorY,
    };
  }, [w, h]);

  const font = useMemo(() => landingFont(Math.round(g.door.h * 0.34)), [g.door.h]);
  const clip = useMemo(() => Skia.XYWHRect(g.door.x, g.door.y, g.door.w, g.door.h), [g.door]);
  const leftWall = useMemo(() => {
    return Skia.PathBuilder.Make().moveTo(0, 0).lineTo(w * 0.1, h * 0.06).lineTo(w * 0.1, g.floorY + 10).lineTo(0, h).close().build();
  }, [w, h, g.floorY]);
  const rightWall = useMemo(() => {
    return Skia.PathBuilder.Make().moveTo(w, 0).lineTo(w * 0.9, h * 0.06).lineTo(w * 0.9, g.floorY + 10).lineTo(w, h).close().build();
  }, [w, h, g.floorY]);

  const leftDoorX = useDerivedValue(() => g.door.x - door.get() * (g.door.w / 2 - 6));
  const rightDoorX = useDerivedValue(() => g.door.x + g.door.w / 2 + door.get() * (g.door.w / 2 - 6));
  const dim = useDerivedValue(() => 0.82 * (1 - light.get()));
  const ceiling = useDerivedValue(() => 0.25 + 0.75 * light.get());

  const landingColor = LANDING[elevator.floor % LANDING.length]!;
  const landingLit = power !== 'off' && !(elevator.floor === repairFloor && power !== 'on');
  const label = String(elevator.floor);
  const labelWidth = font ? font.measureText(label).width : 0;
  const arrow = elevator.direction;
  const indicatorText = power === 'off' ? '' : String(elevator.indicator);

  return (
    <View style={[styles.box, { left: box.x, top: box.y, width: w, height: h }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Front wall and depth. */}
        <Rect x={0} y={0} width={w} height={h}>
          <LinearGradient start={vec(0, 0)} end={vec(0, h)} colors={[eq.charcoalLight, eq.charcoal, '#0B0F16']} />
        </Rect>
        <Path path={leftWall}>
          <LinearGradient start={vec(0, 0)} end={vec(w * 0.1, 0)} colors={[eq.brushedB, eq.steelDark]} />
        </Path>
        <Path path={rightWall}>
          <LinearGradient start={vec(w, 0)} end={vec(w * 0.9, 0)} colors={[eq.brushedB, eq.steelDark]} />
        </Path>
        <Line p1={vec(w * 0.1, h * 0.62)} p2={vec(0, h * 0.7)} color={eq.steelLight} strokeWidth={5} />
        <Line p1={vec(w * 0.9, h * 0.62)} p2={vec(w, h * 0.7)} color={eq.steelLight} strokeWidth={5} />

        {/* Ceiling light strip: cool white. */}
        <Group opacity={ceiling}>
          <RoundedRect x={w * 0.2} y={h * 0.02} width={w * 0.6} height={Math.max(6, h * 0.025)} r={4} color={eq.coolWhite}>
            <BlurMask blur={8} style="solid" />
          </RoundedRect>
        </Group>

        {/* Floor. */}
        <Rect x={0} y={g.floorY} width={w} height={h - g.floorY}>
          <LinearGradient start={vec(0, g.floorY)} end={vec(0, h)} colors={['#1A1F28', '#0D1117']} />
        </Rect>

        {/* Door frame (portal). */}
        <RoundedRect x={g.frame.x} y={g.frame.y} width={g.frame.w} height={g.frame.h} r={6}>
          <LinearGradient start={vec(g.frame.x, 0)} end={vec(g.frame.x + g.frame.w, 0)} colors={[eq.steel, eq.steelLight, eq.steel]} />
        </RoundedRect>

        {/* The landing beyond the doors. */}
        <Group clip={clip}>
          <Rect x={g.door.x} y={g.door.y} width={g.door.w} height={g.door.h} color={landingLit ? landingColor : '#06080C'} />
          <Rect x={g.door.x} y={g.door.y + g.door.h * 0.82} width={g.door.w} height={g.door.h * 0.18} color={landingLit ? '#2A2F38' : '#05070A'} />
          {landingLit ? (
            <>
              <Rect x={g.door.x + g.door.w * 0.08} y={g.door.y + g.door.h * 0.12} width={g.door.w * 0.12} height={g.door.h * 0.6} color="rgba(255,255,255,0.05)" />
              <Line p1={vec(g.door.x, g.door.y + g.door.h * 0.2)} p2={vec(g.door.x + g.door.w, g.door.y + g.door.h * 0.2)} color="rgba(255,255,255,0.08)" strokeWidth={6} />
              {font ? <SkText x={g.door.x + (g.door.w - labelWidth) / 2} y={g.door.y + g.door.h * 0.6} text={label} font={font} color="rgba(233,243,255,0.85)" /> : null}
            </>
          ) : null}
          {/* Doors. */}
          <Group>
            <Rect x={leftDoorX} y={g.door.y} width={g.door.w / 2} height={g.door.h}>
              <LinearGradient start={vec(g.door.x, 0)} end={vec(g.door.x + g.door.w / 2, 0)} colors={[eq.brushedB, eq.brushedA, eq.steelLight]} />
            </Rect>
            <Rect x={rightDoorX} y={g.door.y} width={g.door.w / 2} height={g.door.h}>
              <LinearGradient start={vec(g.door.x + g.door.w / 2, 0)} end={vec(g.door.x + g.door.w, 0)} colors={[eq.steelLight, eq.brushedA, eq.brushedB]} />
            </Rect>
          </Group>
        </Group>

        {/* Indicator housing. */}
        <RoundedRect x={g.ind.x} y={g.ind.y} width={g.ind.w} height={g.ind.h} r={10} color="#05070B" />
        <RoundedRect x={g.ind.x} y={g.ind.y} width={g.ind.w} height={g.ind.h} r={10} color={eq.steel} style="stroke" strokeWidth={2} />
        <IndicatorArrow x={g.ind.x + 16} y={g.ind.y + g.ind.h / 2} up active={power !== 'off' && arrow === 'up'} />
        <IndicatorArrow x={g.ind.x + g.ind.w - 16} y={g.ind.y + g.ind.h / 2} up={false} active={power !== 'off' && arrow === 'down'} />

        {/* Power: the whole cabin is dim until the lift wakes, and when the repair floor is dark. */}
        <Rect x={0} y={0} width={w} height={h} color="#000" opacity={dim} />
      </Canvas>
      {/* Indicator digits as native text: crisp, scalable, readable by screen readers. */}
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={power === 'off' ? 'Floor indicator off' : `Floor indicator: ${elevator.indicator}${arrow ? `, going ${arrow}` : ''}`}
        accessibilityLiveRegion="polite"
        style={[styles.indicator, { left: g.ind.x, top: g.ind.y, width: g.ind.w, height: g.ind.h }]}
      >
        <Text allowFontScaling={false} style={[styles.digits, { fontSize: Math.round(g.ind.h * 0.62) }]}>
          {indicatorText}
        </Text>
      </View>
    </View>
  );
});

function IndicatorArrow({ x, y, up, active }: { x: number; y: number; up: boolean; active: boolean }) {
  const path = useMemo(() => {
    const s = 8;
    const b = Skia.PathBuilder.Make();
    if (up) b.moveTo(x, y - s).lineTo(x + s, y + s * 0.6).lineTo(x - s, y + s * 0.6).close();
    else b.moveTo(x, y + s).lineTo(x + s, y - s * 0.6).lineTo(x - s, y - s * 0.6).close();
    return b.build();
  }, [x, y, up]);
  return (
    <Path path={path} color={active ? eq.amber : '#2A2116'}>
      {active ? <BlurMask blur={3} style="solid" /> : null}
    </Path>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', borderRadius: 16, overflow: 'hidden', backgroundColor: eq.night },
  indicator: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  digits: {
    color: eq.amber,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontWeight: '700',
    textShadowColor: 'rgba(255,178,63,0.8)',
    textShadowRadius: 8,
    letterSpacing: 2,
  },
});
