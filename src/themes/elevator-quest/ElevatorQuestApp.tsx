// Elevator Quest entry: picks the device's learner, sets up the session, then shows the gameplay screen.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PLAYTEST_ENABLED } from '../../config/flags';
import { LINES, THEME_PACK_ID } from './content/floor15';
import { openFloor15Services } from './session';
import { currentLearnerFor, startOverLearner } from './sessionCore';
import { GameScreen } from './ui/GameScreen';
import { eq } from './ui/palette';

import { DEFAULT_LEARNER_ID, useFloor15, type Floor15Session } from './useFloor15';

export interface ElevatorQuestAppProps {
  /** Whose game this is (developer tools: a test learner). Absent: the device's learner. */
  learnerId?: string;
  /** Developer tools only: resume this mission instance, restart on a new generation, see the session. */
  instanceId?: string;
  generation?: number;
  reportRequest?: number;
  onSession?: (session: Floor15Session | null) => void;
  /** Back to the developer launcher. Absent in production child builds (there is no launcher). */
  onExit?: () => void;
}

export function ElevatorQuestApp({ learnerId, ...rest }: ElevatorQuestAppProps) {
  // The device's learner is the newest start-over generation of the default id (D143). The
  // developer tools pass their own test learner and have their own resets.
  const [device, setDevice] = useState<string | null>(null);
  useEffect(() => {
    if (learnerId) return;
    let cancelled = false;
    openFloor15Services()
      .then((svc) => currentLearnerFor(svc.runtime, DEFAULT_LEARNER_ID))
      // If storage cannot even open, the game's own start reports it (with TRY AGAIN).
      .catch(() => DEFAULT_LEARNER_ID)
      .then((id) => {
        if (!cancelled) setDevice(id);
      });
    return () => {
      cancelled = true;
    };
  }, [learnerId]);
  const startOver = useCallback(async () => {
    const svc = await openFloor15Services();
    setDevice(await startOverLearner(svc.runtime, DEFAULT_LEARNER_ID, THEME_PACK_ID));
  }, []);
  const active = learnerId ?? device;
  if (!active) return <Loading />;
  // A new learner id remounts the game: the old session stops, the new one starts empty.
  return <ElevatorQuestGame key={active} learnerId={active} {...rest} {...(!learnerId && PLAYTEST_ENABLED ? { onStartOver: startOver } : {})} />;
}

function ElevatorQuestGame({ learnerId, instanceId, generation = 0, reportRequest, onSession, onExit, onStartOver }: ElevatorQuestAppProps & { learnerId: string; onStartOver?: () => Promise<void> }) {
  // TRY AGAIN after a failed start opens the session afresh (a new generation of the hook).
  const [retries, setRetries] = useState(0);
  const { session, error } = useFloor15(learnerId, { ...(instanceId ? { instanceId } : {}), generation: generation * 1000 + retries });
  useEffect(() => {
    onSession?.(session);
  }, [onSession, session]);
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{LINES.trouble.title}</Text>
        <Text style={styles.detail}>{error}</Text>
        <View style={styles.buttons}>
          <Pressable accessibilityRole="button" onPress={() => setRetries((n) => n + 1)} style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>{LINES.trouble.retry}</Text>
          </Pressable>
          {onExit ? (
            <Pressable accessibilityRole="button" onPress={onExit} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>{LINES.trouble.exit}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }
  if (!session) return <Loading />;
  return <GameScreen session={session} onExit={onExit} {...(reportRequest !== undefined ? { reportRequest } : {})} {...(onStartOver ? { onStartOver } : {})} />;
}

function Loading() {
  return (
    <View style={styles.center} accessibilityLabel="Loading Elevator Quest">
      <Text style={styles.title}>ELEVATOR QUEST</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: eq.night, gap: 10, padding: 24 },
  title: { color: eq.amber, fontSize: 28, fontWeight: '900', letterSpacing: 4 },
  detail: { color: eq.textDim, fontSize: 14, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 12 },
  button: { minWidth: 160, minHeight: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: eq.steelDark, borderWidth: 1, borderColor: eq.steelLight },
  primary: { backgroundColor: eq.deepBlueLight, borderColor: eq.clue },
  pressed: { opacity: 0.7 },
  buttonText: { color: eq.text, fontSize: 18, fontWeight: '800' },
});
