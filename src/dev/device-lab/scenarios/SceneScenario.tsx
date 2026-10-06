// Scenario 1-3: responsive Skia scene + large touch controls.
// Floor buttons move the car. The rapid-tap pad counts taps and can write each tap
// to SQLite asynchronously, proving persistence never delays visual feedback.
import { matchFont } from '@shopify/react-native-skia';
import { useCallback, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Easing, runOnJS, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { pushSample, tapsPerSecond } from '../diagnostics/frameStats';
import { FLOORS, carTopForFloor, travelMs } from '../elevatorModel';
import { playChime } from '../audio/labAudio';
import { LabButton } from '../components/LabButton';
import { StageView } from '../components/StageView';
import { labStore, useLab } from '../labStore';
import { openLabDb } from '../storage/labDb';
import { readSummary, recordEvent } from '../storage/labRepository';
import { lab } from '../theme';
import { ElevatorScene } from './ElevatorScene';

function loadSceneFonts() {
  const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
  try {
    return {
      font: matchFont({ fontFamily, fontSize: 64, fontWeight: 'bold' }),
      smallFont: matchFont({ fontFamily, fontSize: 36, fontWeight: 'bold' }),
    };
  } catch {
    return { font: null, smallFont: null };
  }
}

export function SceneScenario({ controlsArrangement }: { controlsArrangement: 'row' | 'column' }) {
  const [{ font, smallFont }] = useState(loadSceneFonts);
  const carTop = useSharedValue(carTopForFloor(1));
  const doorOpen = useSharedValue(0);
  const arrivalRing = useSharedValue(0);
  const calledFloor = useSharedValue(0);
  const currentFloor = useSharedValue(1);

  const [locked, setLocked] = useState(false);
  const [persistTaps, setPersistTaps] = useState(true);
  const [arrivalSound, setArrivalSound] = useState(false);
  const [lastArrived, setLastArrived] = useState(1);
  const tapCount = useLab((s) => s.taps.length);
  const [tps, setTps] = useState(0);

  const onArrive = useCallback(
    (floor: number) => {
      setLastArrived(floor);
      if (arrivalSound) playChime('wav', 'pool');
    },
    [arrivalSound],
  );

  const goTo = useCallback(
    (floor: number) => {
      const from = currentFloor.get();
      calledFloor.set(floor);
      doorOpen.set(withTiming(0, { duration: 180 }));
      const duration = Math.max(250, travelMs(from, floor));
      carTop.set(
        withTiming(carTopForFloor(floor), { duration, easing: Easing.inOut(Easing.cubic) }, (finished) => {
          'worklet';
          if (!finished) return;
          currentFloor.set(floor);
          calledFloor.set(0);
          doorOpen.set(withSequence(withTiming(1, { duration: 350 }), withDelay(900, withTiming(0, { duration: 350 }))));
          arrivalRing.set(0);
          arrivalRing.set(withTiming(1, { duration: 700 }));
          runOnJS(onArrive)(floor);
        }),
      );
    },
    [arrivalRing, calledFloor, carTop, currentFloor, doorOpen, onArrive],
  );

  const onRapidTap = useCallback(() => {
    const now = Date.now();
    labStore.set((s) => ({ taps: [...s.taps.filter((t) => now - t < 10_000), now] }));
    setTps(tapsPerSecond(labStore.get().taps, now));
    if (!persistTaps) return;
    // Fire and forget. Visual feedback already happened on the UI thread.
    const t0 = performance.now();
    void openLabDb()
      .then(async (db) => {
        await recordEvent(db, 'tap', now);
        const ms = performance.now() - t0;
        const summary = await readSummary(db);
        labStore.set((s) => ({
          dbWriteMs: pushSample(s.dbWriteMs, ms),
          storage: { status: 'ok', summary, error: null },
        }));
      })
      .catch((e: unknown) => {
        labStore.set((s) => ({ storage: { ...s.storage, status: 'error', error: e instanceof Error ? e.message : String(e) } }));
      });
  }, [persistTaps]);

  return (
    <View style={[styles.root, { flexDirection: controlsArrangement }]}>
      <View style={styles.stage} accessibilityLabel={`Elevator scene. Car at floor ${lastArrived}.`}>
        <StageView>
          {({ fit, container }) => (
            <ElevatorScene
              fit={fit}
              container={container}
              carTop={carTop}
              doorOpen={doorOpen}
              arrivalRing={arrivalRing}
              calledFloor={calledFloor}
              font={font}
              smallFont={smallFont}
            />
          )}
        </StageView>
      </View>

      <ScrollView
        style={[styles.controlsBox, controlsArrangement === 'row' ? styles.controlsSide : styles.controlsBottom]}
        contentContainerStyle={styles.controls}
      >
        <Text style={styles.heading}>Floor panel</Text>
        <View style={styles.grid}>
          {Array.from({ length: FLOORS }, (_, i) => FLOORS - i).map((f) => (
            <LabButton key={f} label={String(f)} tone="amber" disabled={locked} onPress={() => goTo(f)} accessibilityHint={`Send the car to floor ${f}`} />
          ))}
        </View>
        <View style={styles.row}>
          <LabButton label={locked ? 'Unlock panel' : 'Lock panel'} onPress={() => setLocked((v) => !v)} size={64} />
          <LabButton label={arrivalSound ? 'Ding: on' : 'Ding: off'} onPress={() => setArrivalSound((v) => !v)} size={64} />
        </View>

        <Text style={styles.heading}>Rapid tap</Text>
        <View style={styles.row}>
          <LabButton label="TAP" tone="success" size={96} onPress={onRapidTap} accessibilityHint="Counts taps and optionally saves each one" />
          <View style={styles.readout}>
            <Text style={styles.big}>{tapCount}</Text>
            <Text style={styles.dim}>taps (10 s)</Text>
            <Text style={styles.dim}>{tps.toFixed(0)} / s</Text>
          </View>
        </View>
        <LabButton label={persistTaps ? 'Save taps: SQLite' : 'Save taps: off'} onPress={() => setPersistTaps((v) => !v)} size={64} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stage: { flex: 1, minHeight: 200, minWidth: 200 },
  controlsBox: { backgroundColor: lab.panel, flexGrow: 0 },
  controls: { padding: 16, gap: 12 },
  controlsSide: { width: 320, borderLeftWidth: 1, borderLeftColor: lab.panelBorder },
  controlsBottom: { maxHeight: '48%', borderTopWidth: 1, borderTopColor: lab.panelBorder },
  heading: { color: lab.textDim, fontSize: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  readout: { alignItems: 'flex-start' },
  big: { color: lab.text, fontSize: 32, fontWeight: '800' },
  dim: { color: lab.textDim, fontSize: 14 },
});
