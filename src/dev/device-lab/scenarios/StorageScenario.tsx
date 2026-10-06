// Scenario 7: SQLite durability probe. The launch counter increments once per app
// process start, so a force-quit and relaunch must show it one higher with all
// events intact.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { LabButton } from '../components/LabButton';
import { pushSample } from '../diagnostics/frameStats';
import { labStore, useLab } from '../labStore';
import { openLabDb } from '../storage/labDb';
import { clearEvents, readSummary, recordEvent, recordLaunch } from '../storage/labRepository';
import { lab } from '../theme';

let launchRecorded = false; // module scope: once per JS process, not per screen visit

export async function recordLaunchOnce(): Promise<void> {
  if (launchRecorded) return;
  launchRecorded = true;
  try {
    labStore.set((s) => ({ storage: { ...s.storage, status: 'opening' } }));
    const db = await openLabDb();
    await recordLaunch(db);
    const summary = await readSummary(db);
    labStore.set({ storage: { status: 'ok', summary, error: null } });
  } catch (e) {
    launchRecorded = false;
    labStore.set({ storage: { status: 'error', summary: null, error: e instanceof Error ? e.message : String(e) } });
  }
}

export function StorageScenario() {
  const storage = useLab((s) => s.storage);
  const dbWriteMs = useLab((s) => s.dbWriteMs);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void recordLaunchOnce();
  }, []);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      const db = await openLabDb();
      const summary = await readSummary(db);
      labStore.set((s) => ({ storage: { ...s.storage, status: 'ok', summary, error: null } }));
    } catch (e) {
      labStore.set((s) => ({ storage: { ...s.storage, status: 'error', error: e instanceof Error ? e.message : String(e) } }));
    } finally {
      setBusy(false);
    }
  }, []);

  const addEvents = (count: number) =>
    run(async () => {
      const db = await openLabDb();
      for (let i = 0; i < count; i++) {
        const t0 = performance.now();
        await recordEvent(db, 'manual', Date.now());
        const ms = performance.now() - t0;
        labStore.set((s) => ({ dbWriteMs: pushSample(s.dbWriteMs, ms) }));
      }
    });

  const s = storage.summary;
  const lastWrite = dbWriteMs[dbWriteMs.length - 1];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.big}>Launches: {s?.launches ?? '...'}</Text>
        <Text style={styles.line}>Events stored: {s?.events ?? '...'} (taps: {s?.tapEvents ?? '...'})</Text>
        <Text style={styles.line}>Journal mode: {s?.journalMode ?? '...'}</Text>
        <Text style={styles.line}>
          Last event: {s?.lastEventAt ? new Date(s.lastEventAt).toLocaleTimeString() : 'none'}
        </Text>
        <Text style={styles.line}>Last write: {lastWrite === undefined ? 'n/a' : `${lastWrite.toFixed(1)} ms`}</Text>
        <Text style={styles.line}>Status: {storage.status}</Text>
        {storage.error ? <Text style={[styles.line, styles.error]}>Error: {storage.error}</Text> : null}
      </View>

      <View style={styles.row}>
        <LabButton label="+1 event" tone="success" disabled={busy} onPress={() => void addEvents(1)} />
        <LabButton label="+100 events" disabled={busy} onPress={() => void addEvents(100)} />
        <LabButton label="Clear events" disabled={busy} onPress={() => void run(async () => clearEvents(await openLabDb()))} />
      </View>

      <Text style={styles.note}>
        Durability test: add events, note the counts, force-quit the app from the app switcher, relaunch. Launches should be one higher and the
        event count unchanged. Writes are async and never block button feedback.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 16 },
  card: { backgroundColor: lab.panel, borderRadius: 12, padding: 16, gap: 6 },
  big: { color: lab.text, fontSize: 28, fontWeight: '800' },
  line: { color: lab.text, fontSize: 16 },
  error: { color: lab.danger },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  note: { color: lab.textDim, fontSize: 14 },
});
