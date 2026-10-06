// Scenario 5: drawing surface spike. Finger or stylus strokes rendered with Skia,
// captured on the UI thread by Gesture Handler. Includes one dashed trace guide.
// No scoring or recognition: this only answers "does tracing feel viable?".
import { Canvas, DashPathEffect, Group, Circle, LinearGradient, Path, Rect, Skia, usePathValue, vec, type SkPath } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import type { Size, StageFit } from '../../../presentation/layout/stageLayout';
import { LabButton } from '../components/LabButton';
import { StageView } from '../components/StageView';
import { shouldAppendPoint, toSvgPath, traceGuidePoints, type Point } from '../geometry';
import { lab } from '../theme';

const GUIDE_CENTER = { x: 800, y: 500 };
const GUIDE_RADIUS = 300;
const STROKE_WIDTH = 26; // logical units
const MIN_POINT_DISTANCE = 3; // logical units

interface Stroke {
  path: SkPath;
  points: number;
}

export function DrawScenario() {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [showGuide, setShowGuide] = useState(true);

  const commitStroke = useCallback((points: Point[]) => {
    if (points.length === 0) return;
    const pts = points.length === 1 ? [points[0]!, { x: points[0]!.x + 0.5, y: points[0]!.y + 0.5 }] : points;
    const path = Skia.Path.MakeFromSVGString(toSvgPath(pts));
    if (path) setStrokes((prev) => [...prev, { path, points: points.length }]);
  }, []);

  const totalPoints = strokes.reduce((n, s) => n + s.points, 0);

  return (
    <View style={styles.root}>
      <View style={styles.stage}>
        <StageView>
          {({ fit, container }) => (
            <DrawingSurface fit={fit} container={container} strokes={strokes} showGuide={showGuide} onStroke={commitStroke} />
          )}
        </StageView>
      </View>
      <View style={styles.bar}>
        <Text style={styles.status}>
          {strokes.length} strokes, {totalPoints} points
        </Text>
        <View style={styles.row}>
          <LabButton label={showGuide ? 'Guide: on' : 'Guide: off'} onPress={() => setShowGuide((v) => !v)} size={64} />
          <LabButton label="Undo" onPress={() => setStrokes((prev) => prev.slice(0, -1))} size={64} disabled={strokes.length === 0} />
          <LabButton label="Clear" onPress={() => setStrokes([])} size={64} disabled={strokes.length === 0} />
        </View>
      </View>
    </View>
  );
}

function DrawingSurface({
  fit,
  container,
  strokes,
  showGuide,
  onStroke,
}: {
  fit: StageFit;
  container: Size;
  strokes: Stroke[];
  showGuide: boolean;
  onStroke: (points: Point[]) => void;
}) {
  const scale = useSharedValue(fit.scale);
  const offX = useSharedValue(fit.stage.x);
  const offY = useSharedValue(fit.stage.y);
  useEffect(() => {
    scale.set(fit.scale);
    offX.set(fit.stage.x);
    offY.set(fit.stage.y);
  }, [fit.scale, fit.stage.x, fit.stage.y, offX, offY, scale]);

  const points = useSharedValue<Point[]>([]);

  const current = usePathValue((builder) => {
    'worklet';
    const pts = points.get();
    if (pts.length === 0) return;
    builder.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) builder.lineTo(pts[i]!.x, pts[i]!.y);
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .onBegin((e) => {
          'worklet';
          if (scale.get() === 0) return;
          points.set([{ x: (e.x - offX.get()) / scale.get(), y: (e.y - offY.get()) / scale.get() }]);
        })
        .onUpdate((e) => {
          'worklet';
          if (scale.get() === 0) return;
          const p = { x: (e.x - offX.get()) / scale.get(), y: (e.y - offY.get()) / scale.get() };
          const last = points.get()[points.get().length - 1];
          if (!shouldAppendPoint(last, p, MIN_POINT_DISTANCE)) return;
          points.modify((arr) => {
            'worklet';
            arr.push(p);
            return arr;
          });
        })
        .onFinalize(() => {
          'worklet';
          const done = points.get().slice();
          points.set([]);
          runOnJS(onStroke)(done);
        }),
    [offX, offY, onStroke, points, scale],
  );

  const guide = useMemo(() => {
    const pts = traceGuidePoints(GUIDE_CENTER, GUIDE_RADIUS);
    return { path: Skia.Path.MakeFromSVGString(toSvgPath(pts)), start: pts[0]!, end: pts[pts.length - 1]! };
  }, []);

  const stageTransform = [{ translateX: fit.stage.x }, { translateY: fit.stage.y }, { scale: fit.scale }];

  return (
    <GestureDetector gesture={pan}>
      <View style={StyleSheet.absoluteFill} accessibilityLabel="Drawing surface">
        <Canvas style={{ width: container.width, height: container.height }}>
          <Rect x={0} y={0} width={container.width} height={container.height}>
            <LinearGradient start={vec(0, 0)} end={vec(0, container.height)} colors={['#14213A', '#0E1828']} />
          </Rect>
          <Group transform={stageTransform}>
            <Rect x={40} y={40} width={1520} height={920} color="#101B2E" />
            {showGuide && guide.path ? (
              <Group>
                <Path path={guide.path} style="stroke" strokeWidth={STROKE_WIDTH + 30} color="#1E3150" strokeCap="round" />
                <Path path={guide.path} style="stroke" strokeWidth={6} color={lab.textDim} strokeCap="round">
                  <DashPathEffect intervals={[18, 18]} />
                </Path>
                <Circle cx={guide.start.x} cy={guide.start.y} r={20} color={lab.success} />
                <Circle cx={guide.end.x} cy={guide.end.y} r={14} color={lab.danger} />
              </Group>
            ) : null}
            {strokes.map((s, i) => (
              <Path key={i} path={s.path} style="stroke" strokeWidth={STROKE_WIDTH} color={lab.glass} strokeCap="round" strokeJoin="round" />
            ))}
            <Path path={current} style="stroke" strokeWidth={STROKE_WIDTH} color={lab.amber} strokeCap="round" strokeJoin="round" />
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stage: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    padding: 12,
    backgroundColor: lab.panel,
    borderTopWidth: 1,
    borderTopColor: lab.panelBorder,
  },
  row: { flexDirection: 'row', gap: 12 },
  status: { color: lab.text, fontSize: 18 },
});
