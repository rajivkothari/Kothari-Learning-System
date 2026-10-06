// Elevator Quest entry: sets up the session, then shows the gameplay screen.
import { StyleSheet, Text, View } from 'react-native';

import { GameScreen } from './ui/GameScreen';
import { eq } from './ui/palette';
import { useEffect } from 'react';

import { DEFAULT_LEARNER_ID, useFloor15, type Floor15Session } from './useFloor15';

export interface ElevatorQuestAppProps {
  /** Whose game this is. Every read and write below is scoped to it. */
  learnerId?: string;
  /** Developer tools only: resume this mission instance, restart on a new generation, see the session. */
  instanceId?: string;
  generation?: number;
  reportRequest?: number;
  onSession?: (session: Floor15Session | null) => void;
}

export function ElevatorQuestApp({ learnerId = DEFAULT_LEARNER_ID, instanceId, generation, reportRequest, onSession }: ElevatorQuestAppProps) {
  const { session, error } = useFloor15(learnerId, { ...(instanceId ? { instanceId } : {}), ...(generation !== undefined ? { generation } : {}) });
  useEffect(() => {
    onSession?.(session);
  }, [onSession, session]);
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
  return <GameScreen session={session} {...(reportRequest !== undefined ? { reportRequest } : {})} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.night, gap: 10, padding: 24 },
  title: { color: eq.amber, fontSize: 28, fontWeight: '900', letterSpacing: 4 },
  detail: { color: eq.textDim, fontSize: 14, textAlign: 'center' },
});
