// Elevator Quest entry: sets up the session, then shows the gameplay screen.
import { StyleSheet, Text, View } from 'react-native';

import { GameScreen } from './ui/GameScreen';
import { eq } from './ui/palette';
import { DEFAULT_LEARNER_ID, useFloor15 } from './useFloor15';

/** `learnerId`: whose game this is. Every read and write below is scoped to it. */
export function ElevatorQuestApp({ learnerId = DEFAULT_LEARNER_ID }: { learnerId?: string }) {
  const { session, error } = useFloor15(learnerId);
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>The lift needs a moment.</Text>
        <Text style={styles.detail}>{error}</Text>
      </View>
    );
  }
  if (!session) {
    return (
      <View style={styles.center} accessibilityLabel="Loading Elevator Quest">
        <Text style={styles.title}>ELEVATOR QUEST</Text>
      </View>
    );
  }
  return <GameScreen session={session} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.night, gap: 10, padding: 24 },
  title: { color: eq.amber, fontSize: 28, fontWeight: '900', letterSpacing: 4 },
  detail: { color: eq.textDim, fontSize: 14, textAlign: 'center' },
});
