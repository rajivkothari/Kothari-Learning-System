import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DEVICE_LAB_ENABLED } from './src/config/flags';

// Production builds open Elevator Quest directly. Development builds (and release builds made
// with EXPO_PUBLIC_DEVICE_LAB=1 for measurement) first offer a developer launcher so the same
// install can run both the Device Lab and Floor 15.
// Both are loaded lazily: a production bundle never evaluates the Device Lab, and choosing the
// lab never loads the game's audio and storage. Removing the lab = delete src/dev/device-lab and
// the "lab" branch below.
function Root() {
  const [mode, setMode] = useState<'choose' | 'quest' | 'lab'>(DEVICE_LAB_ENABLED ? 'choose' : 'quest');
  if (mode === 'quest') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ElevatorQuestApp } = require('./src/themes/elevator-quest/ElevatorQuestApp') as typeof import('./src/themes/elevator-quest/ElevatorQuestApp');
    return <ElevatorQuestApp />;
  }
  if (mode === 'lab' && DEVICE_LAB_ENABLED) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DeviceLabScreen } = require('./src/dev/device-lab/DeviceLabScreen') as typeof import('./src/dev/device-lab/DeviceLabScreen');
    return <DeviceLabScreen />;
  }
  return (
    <View style={styles.launcher}>
      <Text style={styles.heading}>Developer launcher</Text>
      <Pressable accessibilityRole="button" onPress={() => setMode('quest')} style={({ pressed }) => [styles.choice, styles.primary, pressed && styles.pressed]}>
        <Text style={styles.choiceTitle}>Elevator Quest</Text>
        <Text style={styles.choiceSub}>Floor 15 vertical slice</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setMode('lab')} style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
        <Text style={styles.choiceTitle}>Device Lab</Text>
        <Text style={styles.choiceSub}>Rendering, touch, audio, and storage probes</Text>
      </Pressable>
      <Text style={styles.note}>Restart the app to switch.</Text>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <StatusBar style="light" hidden />
        <Root />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  launcher: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1220', gap: 16, padding: 24 },
  heading: { color: '#9AA8BD', fontSize: 16, fontWeight: '700', letterSpacing: 2 },
  choice: { width: '100%', maxWidth: 420, minHeight: 88, borderRadius: 16, padding: 16, justifyContent: 'center', backgroundColor: '#1B2230', borderWidth: 1, borderColor: '#4B5565' },
  primary: { borderColor: '#FFB23F' },
  pressed: { opacity: 0.7 },
  choiceTitle: { color: '#E8EEF7', fontSize: 22, fontWeight: '800' },
  choiceSub: { color: '#9AA8BD', fontSize: 14, marginTop: 4 },
  note: { color: '#6B778A', fontSize: 12 },
});
