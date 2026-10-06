// Developer-only Device Lab. Not gameplay. Answers: can this stack deliver the
// interaction quality we need on a Fire HD 8 and an iPad?
// Must not import the learning engine (enforced by ESLint and a Jest test).
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { availableArea, chooseArrangement, isCompact } from '../../presentation/layout/stageLayout';
import { initLabAudio, releaseLabAudio } from './audio/labAudio';
import { LabButton } from './components/LabButton';
import { DiagnosticsPanel } from './diagnostics/DiagnosticsPanel';
import { useFrameStats } from './diagnostics/useFrameStats';
import { labStore, useLab, type ScenarioId } from './labStore';
import { AudioScenario } from './scenarios/AudioScenario';
import { DragScenario } from './scenarios/DragScenario';
import { DrawScenario } from './scenarios/DrawScenario';
import { SceneScenario } from './scenarios/SceneScenario';
import { StorageScenario, recordLaunchOnce } from './scenarios/StorageScenario';
import { lab } from './theme';

const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: 'scene', label: 'Scene + Touch' },
  { id: 'drag', label: 'Drag' },
  { id: 'draw', label: 'Draw' },
  { id: 'audio', label: 'Audio' },
  { id: 'storage', label: 'SQLite' },
];

export function DeviceLabScreen() {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scenario = useLab((s) => s.scenario);
  const uiFps = useLab((s) => s.uiFrames?.fps ?? null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [measuring, setMeasuring] = useState(true);

  useFrameStats(measuring);

  useEffect(() => {
    void recordLaunchOnce();
    void initLabAudio();
    return () => releaseLabAudio();
  }, []);

  const area = availableArea(window, insets);
  const arrangement = chooseArrangement(area);
  const compact = isCompact(area);

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      <View style={styles.topBar}>
        <ScrollView horizontal contentContainerStyle={styles.tabs} showsHorizontalScrollIndicator={false}>
          {SCENARIOS.map((s) => (
            <LabButton
              key={s.id}
              label={s.label}
              tone={s.id === scenario ? 'amber' : 'default'}
              size={64}
              onPress={() => labStore.set({ scenario: s.id })}
            />
          ))}
        </ScrollView>
        <Text style={styles.fps} accessibilityLabel="UI thread frames per second">
          {measuring ? (uiFps === null ? 'UI -- fps' : `UI ${uiFps.toFixed(0)} fps`) : 'meter off'}
        </Text>
        <LabButton label={measuring ? 'Meter' : 'Meter off'} size={64} onPress={() => setMeasuring((v) => !v)} />
        <LabButton label="Diag" size={64} onPress={() => setShowDiagnostics((v) => !v)} />
      </View>

      {compact ? (
        <View style={styles.compactBanner}>
          <Text style={styles.compactText}>Small window. Layout stays usable, but this works best larger and in landscape.</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        {scenario === 'scene' ? <SceneScenario controlsArrangement={arrangement} /> : null}
        {scenario === 'drag' ? <DragScenario /> : null}
        {scenario === 'draw' ? <DrawScenario /> : null}
        {scenario === 'audio' ? <AudioScenario /> : null}
        {scenario === 'storage' ? <StorageScenario /> : null}
      </View>

      {showDiagnostics ? <DiagnosticsPanel window={window} onClose={() => setShowDiagnostics(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: lab.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: lab.panelBorder,
    backgroundColor: lab.panel,
  },
  tabs: { gap: 10, paddingRight: 10 },
  fps: { color: lab.textDim, fontSize: 14, fontVariant: ['tabular-nums'], minWidth: 84, textAlign: 'right' },
  compactBanner: { backgroundColor: lab.amberDim, paddingHorizontal: 12, paddingVertical: 6 },
  compactText: { color: lab.text, fontSize: 14 },
  body: { flex: 1 },
});
