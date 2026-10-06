// Representative Skia scene: layered environment, moving car with doors and
// counterweight, floor indicator text, gentle glows, and a few ambient animations.
// Placeholder shapes, not production art. All animation runs on the UI thread.
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Line,
  LinearGradient,
  Rect,
  RoundedRect,
  Text as SkText,
  vec,
  type SkFont,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { Size, StageFit } from '../../../presentation/layout/stageLayout';
import { CAR, CAR_X, FLOORS, FLOOR_HEIGHT, SHAFT, counterweightTop, floorForCarTop } from '../elevatorModel';
import { lab } from '../theme';

export interface ElevatorSceneProps {
  fit: StageFit;
  container: Size;
  carTop: SharedValue<number>;
  doorOpen: SharedValue<number>;
  arrivalRing: SharedValue<number>;
  calledFloor: SharedValue<number>;
  font: SkFont | null;
  smallFont: SkFont | null;
}

const SKYLINE = [
  { x: -900, w: 260, h: 120 },
  { x: -560, w: 180, h: 70 },
  { x: -300, w: 220, h: 140 },
  { x: 0, w: 160, h: 90 },
  { x: 240, w: 260, h: 130 },
  { x: 560, w: 140, h: 60 },
  { x: 1080, w: 240, h: 110 },
  { x: 1400, w: 200, h: 150 },
  { x: 1700, w: 260, h: 80 },
  { x: 2050, w: 180, h: 120 },
];

export function ElevatorScene({ fit, container, carTop, doorOpen, arrivalRing, calledFloor, font, smallFont }: ElevatorSceneProps) {
  const drift = useSharedValue(0);
  const fan = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    drift.set(withRepeat(withTiming(1, { duration: 40_000, easing: Easing.linear }), -1, false));
    fan.set(withRepeat(withTiming(Math.PI * 2, { duration: 3000, easing: Easing.linear }), -1, false));
    // 1 Hz breathing glow: well under the 3 Hz flash limit.
    pulse.set(withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => {
      cancelAnimation(drift);
      cancelAnimation(fan);
      cancelAnimation(pulse);
    };
  }, [drift, fan, pulse]);

  const stageTransform = useMemo(
    () => [{ translateX: fit.stage.x }, { translateY: fit.stage.y }, { scale: fit.scale }],
    [fit.stage.x, fit.stage.y, fit.scale],
  );

  const skylineTransform = useDerivedValue(() => [{ translateX: -drift.get() * 400 }]);
  const carTransform = useDerivedValue(() => [{ translateY: carTop.get() }]);
  const weightTransform = useDerivedValue(() => [{ translateY: counterweightTop(carTop.get()) }]);
  const leftDoorWidth = useDerivedValue(() => (CAR.width / 2 - 10) * (1 - 0.85 * doorOpen.get()));
  const rightDoorX = useDerivedValue(() => CAR_X + CAR.width - 10 - leftDoorWidth.get());
  const cableEnd = useDerivedValue(() => vec(CAR_X + CAR.width / 2, carTop.get()));
  const weightCableEnd = useDerivedValue(() => vec(SHAFT.x + SHAFT.width + 40, counterweightTop(carTop.get())));
  const floorText = useDerivedValue(() => String(floorForCarTop(carTop.get())));
  const fanTransform = useDerivedValue(() => [{ rotate: fan.get() }]);
  const ringRadius = useDerivedValue(() => 60 + arrivalRing.get() * 160);
  const ringOpacity = useDerivedValue(() => (arrivalRing.get() > 0 && arrivalRing.get() < 1 ? 1 - arrivalRing.get() : 0));
  const ringCenterY = useDerivedValue(() => carTop.get() + CAR.height / 2);
  const ledOpacity = useDerivedValue(() => 0.35 + 0.65 * pulse.get());

  return (
    <Canvas style={[StyleSheet.absoluteFill, { width: container.width, height: container.height }]}>
      {/* Environment fill for the whole canvas, including letterbox areas. */}
      <Rect x={0} y={0} width={container.width} height={container.height}>
        <LinearGradient start={vec(0, 0)} end={vec(0, container.height)} colors={['#0A1426', '#13243F', '#1A2233']} />
      </Rect>

      <Group transform={stageTransform}>
        {/* Distant skyline, slow parallax drift. Extends past the stage on purpose. */}
        <Group transform={skylineTransform}>
          {SKYLINE.map((b) => (
            <Rect key={b.x} x={b.x} y={160 - b.h} width={b.w} height={b.h + 40} color="#1C2C47" />
          ))}
          {SKYLINE.map((b) => (
            <Rect key={`r${b.x}`} x={b.x + 400} y={170 - b.h * 0.7} width={b.w * 0.8} height={b.h} color="#223555" />
          ))}
        </Group>

        {/* Building facade, wider than the stage so resized windows still show building. */}
        <Rect x={-1400} y={120} width={4400} height={900} color={lab.concrete} />
        {Array.from({ length: FLOORS + 1 }, (_, i) => (
          <Rect key={`slab${i}`} x={-1400} y={SHAFT.bottom - i * FLOOR_HEIGHT - 6} width={4400} height={10} color="#3A4559" />
        ))}

        {/* Control room window with status LEDs (left). */}
        <RoundedRect x={150} y={300} width={340} height={220} r={18} color="#0F1A2C" />
        <RoundedRect x={170} y={320} width={300} height={140} r={10}>
          <LinearGradient start={vec(170, 320)} end={vec(470, 460)} colors={['#1B3A5C', '#0F2238']} />
        </RoundedRect>
        {[0, 1, 2].map((i) => (
          <Group key={`led${i}`} opacity={ledOpacity}>
            <Circle cx={210 + i * 50} cy={490} r={10} color={i === 1 ? lab.success : lab.amber}>
              <BlurMask blur={6} style="solid" />
            </Circle>
          </Group>
        ))}

        {/* Machine room fan (top right). */}
        <RoundedRect x={1230} y={170} width={240} height={200} r={18} color="#18233A" />
        <Group transform={fanTransform} origin={vec(1350, 270)}>
          {[0, 1, 2].map((i) => (
            <Group key={`blade${i}`} transform={[{ rotate: (i * Math.PI * 2) / 3 }]} origin={vec(1350, 270)}>
              <RoundedRect x={1340} y={190} width={20} height={80} r={8} color={lab.steelLight} />
            </Group>
          ))}
        </Group>
        <Circle cx={1350} cy={270} r={16} color={lab.steel} />

        {/* Shaft glass and rails. */}
        <Rect x={SHAFT.x} y={SHAFT.y} width={SHAFT.width} height={SHAFT.bottom - SHAFT.y}>
          <LinearGradient start={vec(SHAFT.x, 0)} end={vec(SHAFT.x + SHAFT.width, 0)} colors={['#0C1626', '#162944', '#0C1626']} />
        </Rect>
        <Line p1={vec(SHAFT.x + 24, SHAFT.y)} p2={vec(SHAFT.x + 24, SHAFT.bottom)} color={lab.steel} strokeWidth={6} />
        <Line p1={vec(SHAFT.x + SHAFT.width - 24, SHAFT.y)} p2={vec(SHAFT.x + SHAFT.width - 24, SHAFT.bottom)} color={lab.steel} strokeWidth={6} />

        {/* Floor labels and call lamps. */}
        {Array.from({ length: FLOORS }, (_, i) => {
          const floor = i + 1;
          const y = SHAFT.bottom - i * FLOOR_HEIGHT - FLOOR_HEIGHT / 2;
          return (
            <Group key={`floor${floor}`}>
              {smallFont ? <SkText x={SHAFT.x - 70} y={y + 14} text={String(floor)} font={smallFont} color={lab.textDim} /> : null}
              <CallLamp cx={SHAFT.x + SHAFT.width + 50} cy={y} floor={floor} calledFloor={calledFloor} pulse={pulse} />
            </Group>
          );
        })}

        {/* Cables. */}
        <Line p1={vec(CAR_X + CAR.width / 2, SHAFT.y)} p2={cableEnd} color="#8896AB" strokeWidth={3} />
        <Line p1={vec(SHAFT.x + SHAFT.width + 40, SHAFT.y)} p2={weightCableEnd} color="#8896AB" strokeWidth={3} />

        {/* Counterweight. */}
        <Group transform={weightTransform}>
          <Rect x={SHAFT.x + SHAFT.width + 22} y={0} width={36} height={90} color="#5A6578" />
        </Group>

        {/* Car with amber interior and sliding doors. */}
        <Group transform={carTransform}>
          <RoundedRect x={CAR_X} y={0} width={CAR.width} height={CAR.height} r={10}>
            <LinearGradient start={vec(CAR_X, 0)} end={vec(CAR_X, CAR.height)} colors={['#FFD58A', '#E39A2E']} />
          </RoundedRect>
          <Rect x={CAR_X + 10} y={8} width={leftDoorWidth} height={CAR.height - 16} color="#9AA5B8" />
          <Rect x={rightDoorX} y={8} width={leftDoorWidth} height={CAR.height - 16} color="#9AA5B8" />
          <RoundedRect x={CAR_X} y={0} width={CAR.width} height={CAR.height} r={10} color="#2B3546" style="stroke" strokeWidth={6} />
        </Group>

        {/* Arrival ring. */}
        <Group opacity={ringOpacity}>
          <Circle cx={CAR_X + CAR.width / 2} cy={ringCenterY} r={ringRadius} color={lab.amber} style="stroke" strokeWidth={6}>
            <BlurMask blur={4} style="solid" />
          </Circle>
        </Group>

        {/* Floor indicator panel above the shaft. */}
        <RoundedRect x={SHAFT.x + 60} y={30} width={200} height={90} r={14} color="#0B0F17" />
        <RoundedRect x={SHAFT.x + 60} y={30} width={200} height={90} r={14} color={lab.amberDim} style="stroke" strokeWidth={3} />
        {font ? (
          <SkText x={SHAFT.x + 135} y={98} text={floorText} font={font} color={lab.amber}>
            <BlurMask blur={2} style="solid" />
          </SkText>
        ) : null}
      </Group>
    </Canvas>
  );
}

function CallLamp({
  cx,
  cy,
  floor,
  calledFloor,
  pulse,
}: {
  cx: number;
  cy: number;
  floor: number;
  calledFloor: SharedValue<number>;
  pulse: SharedValue<number>;
}) {
  const opacity = useDerivedValue(() => (calledFloor.get() === floor ? 0.5 + 0.5 * pulse.get() : 0.15));
  return (
    <Group opacity={opacity}>
      <Circle cx={cx} cy={cy} r={14} color={lab.amber}>
        <BlurMask blur={8} style="solid" />
      </Circle>
    </Group>
  );
}
