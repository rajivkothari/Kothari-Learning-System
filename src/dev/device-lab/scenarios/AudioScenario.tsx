// Scenario 6: local audio probe. Short effect (WAV vs AAC, single player vs pool),
// a narration placeholder, burst repeats, and volume/mute controls.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import {
  getLabMix,
  initLabAudio,
  playChime,
  playNarration,
  setLabMuted,
  setLabVolume,
  stopNarration,
  type ChimeFormat,
  type ChimeMode,
} from '../audio/labAudio';
import { LabButton } from '../components/LabButton';
import { useLab } from '../labStore';
import { lab } from '../theme';

const BURST_COUNT = 8;
const BURST_GAP_MS = 90;

export function AudioScenario() {
  const audio = useLab((s) => s.audio);
  const [mix, setMix] = useState(getLabMix());
  const [format, setFormat] = useState<ChimeFormat>('wav');
  const [mode, setMode] = useState<ChimeMode>('pool');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    void initLabAudio();
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const burst = () => {
    for (let i = 0; i < BURST_COUNT; i++) {
      timers.current.push(setTimeout(() => playChime(format, mode), i * BURST_GAP_MS));
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Short effect</Text>
      <View style={styles.row}>
        <LabButton label="Play chime" tone="success" size={96} onPress={() => playChime(format, mode)} />
        <LabButton label={`Burst x${BURST_COUNT}`} size={96} onPress={burst} />
        <LabButton label={`Format: ${format.toUpperCase()}`} onPress={() => setFormat((f) => (f === 'wav' ? 'aac' : 'wav'))} />
        <LabButton label={`Players: ${mode}`} onPress={() => setMode((m) => (m === 'pool' ? 'single' : 'pool'))} />
      </View>

      <Text style={styles.heading}>Narration (placeholder tone, not speech)</Text>
      <View style={styles.row}>
        <LabButton label="Play narration" tone="amber" size={96} onPress={playNarration} />
        <LabButton label="Stop" onPress={stopNarration} />
      </View>

      <Text style={styles.heading}>Mix</Text>
      <View style={styles.row}>
        <LabButton label="Vol -" onPress={() => setMix((m) => ({ ...m, volume: setLabVolume(m.volume - 0.1) }))} />
        <Text style={styles.value}>{Math.round(mix.volume * 100)}%</Text>
        <LabButton label="Vol +" onPress={() => setMix((m) => ({ ...m, volume: setLabVolume(m.volume + 0.1) }))} />
        <LabButton label={mix.muted ? 'Unmute' : 'Mute'} onPress={() => setMix((m) => ({ ...m, muted: setLabMuted(!m.muted) }))} />
      </View>

      <View style={styles.readout}>
        <Text style={styles.line}>Status: {audio.status}</Text>
        <Text style={styles.line}>
          Last seek+play call: {audio.lastPlayCallMs === null ? 'n/a' : `${audio.lastPlayCallMs.toFixed(1)} ms (JS call cost only)`}
        </Text>
        <Text style={styles.line}>
          Narration play() to status &quot;playing&quot;:{' '}
          {audio.narrationStatusMs === null ? 'n/a' : `${audio.narrationStatusMs.toFixed(0)} ms (upper bound)`}
        </Text>
        {audio.error ? <Text style={[styles.line, styles.error]}>Error: {audio.error}</Text> : null}
        <Text style={styles.note}>
          Audible delay cannot be measured in software here. Judge it by ear and with a slow-motion video of a tap and the sound (see docs/DEVICE_LAB.md).
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 14 },
  heading: { color: lab.textDim, fontSize: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  value: { color: lab.text, fontSize: 22, fontWeight: '700', minWidth: 64, textAlign: 'center' },
  readout: { backgroundColor: lab.panel, borderRadius: 12, padding: 14, gap: 6 },
  line: { color: lab.text, fontSize: 16 },
  error: { color: lab.danger },
  note: { color: lab.textDim, fontSize: 14, marginTop: 6 },
});
