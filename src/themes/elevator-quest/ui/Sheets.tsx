// Settings sheet (adult-friendly, also usable by the child) and the developer-only playtest
// report. The report stays on the device unless an adult shares it.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TEXT_EXPORT, saveTextFile, shareText } from '../../../platform/textExport';

import type { AudioOutput } from '../audio/mix';
import type { Motion } from '../director/director';
import { eq } from './palette';

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.choices}>
        {options.map((o) => (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: o.value === value }} style={[styles.choice, o.value === value && styles.choiceOn]}>
            <Text style={[styles.choiceText, o.value === value && styles.choiceTextOn]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export interface SettingsSheetProps {
  visible: boolean;
  motion: Motion;
  output: AudioOutput;
  effects: number;
  playtest: boolean;
  onMotion: (m: Motion) => void;
  onOutput: (o: AudioOutput) => void;
  onEffects: (v: number) => void;
  onPlaytest: () => void;
  /** Playtest builds only: start the game again with no progress (asks twice). */
  onStartOver?: () => Promise<void>;
  onClose: () => void;
}

const START_OVER_NOTE = "The jobs, the Engineer Log and Floor 15's repair start again. Motion and sound settings stay.";

export function SettingsSheet(p: SettingsSheetProps) {
  // Start over asks twice; the second press clears progress. Closing the sheet forgets the first.
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const [startingOver, setStartingOver] = useState(false);
  const close = () => (setConfirmStartOver(false), p.onClose());
  const startOver = () => {
    if (!p.onStartOver || startingOver) return;
    if (!confirmStartOver) return setConfirmStartOver(true);
    setStartingOver(true);
    void p.onStartOver().finally(() => setStartingOver(false));
  };
  // The button's words change with each press; the spoken label follows them.
  const startOverText = startingOver ? 'Starting over…' : confirmStartOver ? 'Press again to clear progress and start over' : 'Start over (clear progress)';
  return (
    <Modal visible={p.visible} transparent animationType="fade" onRequestClose={close} supportedOrientations={['landscape', 'portrait']}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title} accessibilityRole="header">
            Settings
          </Text>
          <Choice
            label="Motion"
            value={p.motion}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'reduced', label: 'Reduced' },
            ]}
            onChange={p.onMotion}
          />
          <Choice
            label="Sound"
            value={p.output}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'quiet', label: 'Quiet' },
              { value: 'muted', label: 'Mute' },
            ]}
            onChange={p.onOutput}
          />
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Effects volume</Text>
            <View style={styles.choices}>
              <Pressable onPress={() => p.onEffects(Math.max(0, Math.round((p.effects - 0.1) * 10) / 10))} accessibilityRole="button" accessibilityLabel="Lower effects volume" style={styles.choice}>
                <Text style={styles.choiceText}>−</Text>
              </Pressable>
              <Text style={styles.volume}>{Math.round(p.effects * 100)}%</Text>
              <Pressable onPress={() => p.onEffects(Math.min(1, Math.round((p.effects + 0.1) * 10) / 10))} accessibilityRole="button" accessibilityLabel="Raise effects volume" style={styles.choice}>
                <Text style={styles.choiceText}>+</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.note}>Sound is never needed to play. Everything the lift says also appears on screen.</Text>
          {p.onStartOver ? (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Testing (adults)</Text>
              <Pressable onPress={startOver} disabled={startingOver} style={[styles.secondary, confirmStartOver && styles.confirm]} accessibilityRole="button" accessibilityLabel={startOverText} accessibilityHint="Clears this device's progress so Floor 15 can be played again from the start">
                <Text style={styles.secondaryText}>{startOverText}</Text>
              </Pressable>
              {confirmStartOver ? <Text style={styles.note}>{START_OVER_NOTE}</Text> : null}
            </View>
          ) : null}
          <View style={styles.footer}>
            {p.playtest ? (
              <Pressable onPress={p.onPlaytest} style={styles.secondary} accessibilityRole="button">
                <Text style={styles.secondaryText}>Playtest report (adults)</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={close} style={styles.done} accessibilityRole="button" accessibilityLabel="Done" accessibilityHint="Closes settings">
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function PlaytestSheet({ visible, report, onClear, onClose }: { visible: boolean; report: string; onClear: () => void; onClose: () => void }) {
  const [note, setNote] = useState('');
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} supportedOrientations={['landscape', 'portrait']}>
      <View style={styles.report}>
        <View style={styles.reportBar}>
          <Text style={styles.title}>Playtest report (developer only, local)</Text>
          <Pressable onPress={() => void shareText(report).then(setNote, (e: unknown) => setNote(String(e)))} style={styles.secondary} accessibilityRole="button">
            <Text style={styles.secondaryText}>{TEXT_EXPORT.share}</Text>
          </Pressable>
          {TEXT_EXPORT.canSaveFile ? (
            <Pressable onPress={() => void saveTextFile(`floor15-playtest-${stamp()}.txt`, report).then(setNote)} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>Save .txt</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onClear} style={styles.secondary} accessibilityRole="button">
            <Text style={styles.secondaryText}>Clear log</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.done} accessibilityRole="button">
            <Text style={styles.doneText}>Close</Text>
          </Pressable>
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
        <ScrollView style={styles.reportScroll}>
          <Text selectable style={styles.reportText}>
            {report}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 520, borderRadius: 18, padding: 20, gap: 16, backgroundColor: eq.charcoalLight, borderWidth: 1, borderColor: eq.steel },
  title: { color: eq.text, fontSize: 22, fontWeight: '800' },
  group: { gap: 8 },
  groupLabel: { color: eq.textDim, fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  choices: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  choice: { minWidth: 64, minHeight: 56, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.steelDark, borderWidth: 1, borderColor: eq.steel },
  choiceOn: { backgroundColor: eq.deepBlueLight, borderColor: eq.clue },
  choiceText: { color: eq.textDim, fontSize: 18, fontWeight: '700' },
  choiceTextOn: { color: eq.text },
  volume: { color: eq.text, fontSize: 18, minWidth: 56, textAlign: 'center' },
  note: { color: eq.textDim, fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  secondary: { minHeight: 48, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: eq.steel },
  secondaryText: { color: eq.textDim, fontSize: 14, fontWeight: '700' },
  confirm: { borderColor: eq.amber, borderWidth: 2 },
  done: { minHeight: 48, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.deepBlueLight },
  doneText: { color: eq.text, fontSize: 16, fontWeight: '800' },
  report: { flex: 1, backgroundColor: eq.night, paddingTop: 40 },
  reportBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  reportScroll: { flex: 1, paddingHorizontal: 16 },
  reportText: { color: eq.text, fontFamily: 'Menlo', fontSize: 12, lineHeight: 17 },
});
