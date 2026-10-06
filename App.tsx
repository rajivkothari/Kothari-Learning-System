import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DEVICE_LAB_ENABLED } from './src/config/flags';

// The Device Lab is loaded lazily so a production bundle built without the flag
// never evaluates it. Removing the lab = delete src/dev/device-lab and this branch.
function Root() {
  if (DEVICE_LAB_ENABLED) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DeviceLabScreen } = require('./src/dev/device-lab/DeviceLabScreen') as typeof import('./src/dev/device-lab/DeviceLabScreen');
    return <DeviceLabScreen />;
  }
  return (
    <View style={styles.placeholder}>
      <Text style={styles.text}>Kothari Learning</Text>
      <Text style={styles.sub}>No gameplay yet.</Text>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Root />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1220', gap: 8 },
  text: { color: '#E8EEF7', fontSize: 28, fontWeight: '800' },
  sub: { color: '#9AA8BD', fontSize: 16 },
});
