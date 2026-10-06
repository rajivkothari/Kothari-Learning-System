import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DEVICE_LAB_ENABLED, DEV_TOOLS_ENABLED, LAUNCHER_ENABLED } from './src/config/flags';
import { launchParams } from './src/platform/launchParams';

type Mode = 'choose' | 'quest' | 'lab' | 'devtools';

function initialMode(): Mode {
  if (!LAUNCHER_ENABLED) return 'quest';
  const open = launchParams().open;
  if (open === 'quest') return 'quest';
  if (open === 'lab' && DEVICE_LAB_ENABLED) return 'lab';
  if (open === 'devtools' && DEV_TOOLS_ENABLED) return 'devtools';
  return 'choose';
}

// Production child builds open Elevator Quest directly. Development builds, the web playtest
// build, and release builds made with EXPO_PUBLIC_DEVICE_LAB=1 or EXPO_PUBLIC_DEV_TOOLS=1 first
// offer a developer launcher. Each choice is loaded lazily, and metro.config.js replaces the
// Device Lab and the developer tools with empty stubs in production bundles built without
// their flags. Removing the lab = delete src/dev/device-lab and the "lab" branch below.
function Root() {
  const [mode, setMode] = useState<Mode>(initialMode);
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
  if (mode === 'devtools' && DEV_TOOLS_ENABLED) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DevToolsShell } = require('./src/devtools/DevToolsShell') as typeof import('./src/devtools/DevToolsShell');
    return <DevToolsShell />;
  }
  return (
    <View style={styles.launcher}>
      <Text style={styles.heading}>Developer launcher</Text>
      <Pressable accessibilityRole="button" onPress={() => setMode('quest')} style={({ pressed }) => [styles.choice, styles.primary, pressed && styles.pressed]}>
        <Text style={styles.choiceTitle}>ELEVATOR QUEST</Text>
        <Text style={styles.choiceSub}>Floor 15 as a child plays it (default learner)</Text>
      </Pressable>
      {DEVICE_LAB_ENABLED ? (
        <Pressable accessibilityRole="button" onPress={() => setMode('lab')} style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
          <Text style={styles.choiceTitle}>DEVICE LAB</Text>
          <Text style={styles.choiceSub}>Rendering, touch, audio, and storage probes</Text>
        </Pressable>
      ) : null}
      {DEV_TOOLS_ENABLED ? (
        <Pressable accessibilityRole="button" onPress={() => setMode('devtools')} style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
          <Text style={styles.choiceTitle}>DEVELOPER TOOLS</Text>
          <Text style={styles.choiceSub}>Floor 15 with test learners, device sizes, jumps, and resets</Text>
        </Pressable>
      ) : null}
      <Text style={styles.note}>Restart the app (or reload the page) to switch.</Text>
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
