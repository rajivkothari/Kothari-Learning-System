// DEVELOPER TOOLS. Never in a production child build: src/config/flags.ts gates the launcher
// entry, and metro.config.js replaces this module with an empty stub unless the build sets
// EXPO_PUBLIC_DEV_TOOLS=1 (scripts/check-bundle.js verifies the marker below is absent).
//
// Layout: the real game on the left, inside a simulated device viewport (browser) or the real
// window (native dev builds), and the tool panel on the right. The game receives the simulated
// window size and runs its real responsive layout; nothing is scaled with CSS.
//
// Every action works on test learners only (src/runtime/devSeed.ts), and through the real
// runtime and director. Jumps and simulated misses write no learning records.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { wipeAppDatabase } from '../persistence/openAppDatabase';
import { IS_BROWSER } from '../platform/environment';
import { launchParams } from '../platform/launchParams';
import { CAN_RELOAD, reloadApp } from '../platform/reload';
import { ENGINEER_WORLD as T } from '../presentation/design/tokens';
import { ViewportProvider } from '../presentation/viewport';
import { TEST_LEARNER_BASES, activeTestLearner, resetTestLearner, type TestLearnerBase } from '../runtime/devSeed';
import { loadElevatorQuestContent } from '../themes/elevator-quest/appContent';
import { THEME_PACK_ID } from '../themes/elevator-quest/content/floor15';
import { JUMPS, inspectLearner, jumpTo, restartMission, simulateMisses, thresholds, type DevContext, type Inspection } from '../themes/elevator-quest/devtools/floor15Tools';
import { SCENARIOS, answerTestRun, countTestRun, settled, type DevDriver } from '../themes/elevator-quest/devtools/scenarios';
import { ElevatorQuestApp } from '../themes/elevator-quest/ElevatorQuestApp';
import { DB_NAME, openFloor15Services, type Floor15Services } from '../themes/elevator-quest/session';
import type { Floor15Session } from '../themes/elevator-quest/sessionCore';
import { useDirectorView } from '../themes/elevator-quest/useFloor15';
import { VIEWPORT_PRESETS, resolveViewport, type Orientation } from './viewportPresets';

/** Present only when the developer tools are in a bundle (scripts/check-bundle.js). */
export const DEV_TOOLS_BUNDLE_MARKER = 'kothari-devtools-bundle-marker';

const PANEL_WIDTH = 360;
const p = T.palette;

type Mount = { instanceId?: string; generation: number };

export function DevToolsShell() {
  const params = useMemo(() => launchParams(), []);
  const [svc, setSvc] = useState<Floor15Services | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [base, setBase] = useState<TestLearnerBase>((TEST_LEARNER_BASES as readonly string[]).includes(params.learner ?? '') ? (params.learner as TestLearnerBase) : 'learner-test-a');
  const [learnerId, setLearnerId] = useState<string | null>(null);
  const [mount, setMount] = useState<Mount | null>({ generation: 0 });
  const [session, setSession] = useState<Floor15Session | null>(null);
  const [presetId, setPresetId] = useState(IS_BROWSER ? (params.preset ?? 'fire-hd8') : 'free');
  const [orientation, setOrientation] = useState<Orientation>(params.orientation === 'portrait' ? 'portrait' : 'landscape');
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [panelOpen, setPanelOpen] = useState(params.panel !== 'hidden');
  const [status, setStatus] = useState('starting');
  const [busy, setBusy] = useState(false);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [reportRequest, setReportRequest] = useState(0);
  const [confirmWipe, setConfirmWipe] = useState(false);

  // Latest values for the async driver.
  const sessionRef = useRef<Floor15Session | null>(null);
  const learnerRef = useRef<string | null>(null);
  const waiters = useRef<((s: Floor15Session | null) => void)[]>([]);
  sessionRef.current = session;
  learnerRef.current = learnerId;

  useEffect(() => {
    openFloor15Services().then(setSvc, (e: unknown) => setFatal(e instanceof Error ? e.message : String(e)));
  }, []);

  const ctx: DevContext | null = useMemo(() => (svc ? { db: svc.db, runtime: svc.runtime, content: loadElevatorQuestContent(), now: () => Date.now() } : null), [svc]);

  // Resolve the selected profile to its current generation id.
  useEffect(() => {
    if (!svc) return;
    let live = true;
    void activeTestLearner(svc.runtime, base, THEME_PACK_ID).then((id) => live && (setLearnerId(id), setMount((m) => ({ generation: (m?.generation ?? 0) + 1 }))));
    return () => void (live = false);
  }, [svc, base]);

  const onSession = useCallback((s: Floor15Session | null) => {
    setSession(s);
    for (const w of waiters.current.splice(0)) w(s);
  }, []);

  const refresh = useCallback(async () => {
    if (ctx && learnerRef.current) setInspection(await inspectLearner(ctx, learnerRef.current));
  }, [ctx]);

  const driver: DevDriver | null = useMemo(() => {
    if (!ctx) return null;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const d: DevDriver = {
      ctx,
      learnerId: () => {
        if (!learnerRef.current) throw new Error('No test learner yet');
        return learnerRef.current;
      },
      freshLearner: async () => {
        const id = await resetTestLearner(ctx.runtime, 'fresh-learner', THEME_PACK_ID);
        learnerRef.current = id;
        setBase('fresh-learner');
        setLearnerId(id);
        return id;
      },
      mount: (instanceId) =>
        new Promise<Floor15Session>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('The game did not start in 20 s')), 20_000);
          waiters.current.push(function wait(s) {
            if (!s) return void waiters.current.push(wait);
            clearTimeout(timer);
            resolve(s);
          });
          setMount((m) => ({ ...(instanceId ? { instanceId } : {}), generation: (m?.generation ?? 0) + 1 }));
        }),
      unmount: async () => {
        const s = sessionRef.current;
        if (s) await s.director.idle();
        setMount(null);
        setSession(null);
        await sleep(50);
      },
      waitFor: async (pred, label, timeoutMs = 20_000) => {
        const end = Date.now() + timeoutMs;
        while (!pred()) {
          if (Date.now() > end) throw new Error(`Timed out waiting for: ${label}`);
          await sleep(50);
        }
      },
      sleep,
    };
    return d;
  }, [ctx]);

  /** Run a tool action with a visible status line. READY/FAILED lines are what automation waits for. */
  const run = useCallback(
    async (label: string, action: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setStatus(`RUNNING ${label}`);
      try {
        await action();
        setStatus(`READY ${label}`);
      } catch (e) {
        setStatus(`FAILED ${label}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
        void refresh();
      }
    },
    [busy, refresh],
  );

  // A scenario from the URL (?scenario=id) runs once, after the first session is up.
  // Other URL parameters: preset, orientation, learner, panel=hidden, motion, audio.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !driver || !session || !params.scenario) return;
    const scenario = SCENARIOS.find((s) => s.id === params.scenario);
    if (!scenario) return setStatus(`FAILED unknown scenario ${params.scenario}`);
    autoRan.current = true;
    // ?motion=reduced and ?audio=quiet|muted go through the real settings path first.
    if (params.motion === 'reduced' || params.motion === 'normal') session.setMotion(params.motion);
    if (params.audio === 'quiet' || params.audio === 'muted' || params.audio === 'normal') session.setAudio(params.audio, session.settings.get().audio.effects);
    void run(`scenario:${scenario.id}`, () => scenario.run(driver));
  }, [driver, session, params.scenario, params.motion, params.audio, run]);

  useEffect(() => {
    if (session && status === 'starting') setStatus('READY game');
    void refresh();
  }, [session, status, refresh]);

  const viewport = resolveViewport(presetId, orientation, stageSize);
  const misses = async (to: 'visual' | 'rescue', kind: Parameters<typeof simulateMisses>[4] = 'untagged') => {
    const s = sessionRef.current;
    if (!s || !ctx || !driver) throw new Error('No game running');
    const id = s.director.instanceId();
    const done = s.director.getView().task?.wrongTries ?? 0;
    const target = thresholds(ctx.content)[to] ?? 5;
    await driver.unmount();
    await simulateMisses(ctx, driver.learnerId(), id, Math.max(0, target - done), kind);
    const next = await driver.mount(id);
    await driver.waitFor(settled(next), 'settled', 30_000);
  };

  if (fatal) {
    return (
      <View style={styles.center}>
        <Text style={styles.h1}>Developer tools could not open the save</Text>
        <Text style={styles.text}>{fatal}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.stageWrap} onLayout={(e) => setStageSize({ width: e.nativeEvent.layout.width - 24, height: e.nativeEvent.layout.height - 48 })}>
        <Text style={styles.dims} testID="viewport-label">
          {viewport.label}
          {IS_BROWSER ? '  ·  layout only: not a performance, touch-latency, or audio check' : ''}
        </Text>
        <ScrollView horizontal contentContainerStyle={styles.scrollInner}>
          <ScrollView contentContainerStyle={styles.scrollInner}>
            <View testID="device-frame" style={[styles.frame, { width: viewport.width, height: viewport.height }]}>
              {learnerId && mount ? (
                <ViewportProvider viewport={{ width: viewport.width, height: viewport.height, label: viewport.label }}>
                  <ElevatorQuestApp key={`${learnerId}:${mount.instanceId ?? 'latest'}:${mount.generation}`} learnerId={learnerId} {...(mount.instanceId ? { instanceId: mount.instanceId } : {})} generation={mount.generation} reportRequest={reportRequest} onSession={onSession} />
                </ViewportProvider>
              ) : (
                <View style={styles.center}>
                  <Text style={styles.text}>…</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </ScrollView>
      </View>

      {panelOpen ? (
        <ScrollView style={styles.panel} contentContainerStyle={styles.panelInner}>
          <View style={styles.row}>
            <Text style={styles.h1}>DEVELOPER TOOLS</Text>
            <Btn label="Hide" onPress={() => setPanelOpen(false)} />
          </View>
          <Text style={styles.status} testID="devtools-status" accessibilityLiveRegion="polite">
            {status}
          </Text>
          <Text style={styles.small}>{DEV_TOOLS_BUNDLE_MARKER.replace(/-/g, ' ')} · storage: {svc?.storage ?? '…'}</Text>

          {IS_BROWSER ? (
            <Section title="Device viewport (simulated)">
              <View style={styles.wrap}>
                {VIEWPORT_PRESETS.map((v) => (
                  <Btn key={v.id} label={v.label} on={presetId === v.id} onPress={() => setPresetId(v.id)} />
                ))}
              </View>
              <View style={styles.wrap}>
                <Btn label="LANDSCAPE" on={orientation === 'landscape'} onPress={() => setOrientation('landscape')} />
                <Btn label="PORTRAIT" on={orientation === 'portrait'} onPress={() => setOrientation('portrait')} />
              </View>
              <Text style={styles.small}>{VIEWPORT_PRESETS.find((v) => v.id === presetId)?.note}. Approximate sizes: confirm on the device with the Device Lab Diag screen.</Text>
            </Section>
          ) : null}

          <Section title="Learner (test profiles only)">
            <View style={styles.wrap}>
              {TEST_LEARNER_BASES.map((b) => (
                <Btn key={b} label={b} on={base === b} onPress={() => setBase(b)} />
              ))}
            </View>
            <Text style={styles.text}>Current id: {learnerId ?? '…'}</Text>
            <View style={styles.wrap}>
              <Btn
                label="Reset this learner"
                disabled={busy || !ctx}
                onPress={() =>
                  void run('reset learner', async () => {
                    const id = await resetTestLearner(ctx!.runtime, base, THEME_PACK_ID);
                    learnerRef.current = id;
                    setLearnerId(id);
                    await driver!.mount();
                  })
                }
              />
              <Btn label="Fresh learner" disabled={busy || !driver} onPress={() => void run('fresh learner', async () => void (await driver!.freshLearner(), await driver!.mount()))} />
            </View>
            <Text style={styles.small}>{"A reset never deletes history (it is append-only): the profile moves to a new empty id. The child's default learner is never touched here."}</Text>
          </Section>

          <Section title="Mission">
            <View style={styles.wrap}>
              <Btn label="Start / resume" disabled={busy || !driver} onPress={() => void run('resume', async () => void (await driver!.mount()))} />
              <Btn label="Reset current mission" disabled={busy || !driver} onPress={() => void run('reset mission', async () => void (await driver!.mount(await restartMission(ctx!, driver!.learnerId()))))} />
            </View>
            <View style={styles.wrap}>
              {JUMPS.map((j) => (
                <Btn key={j.id} label={j.label} disabled={busy || !driver} onPress={() => void run(`jump:${j.id}`, async () => void (await driver!.mount(await jumpTo(ctx!, driver!.learnerId(), j.id))))} />
              ))}
              <Btn label="Completion state" disabled={busy || !driver} onPress={() => void run('scenario:completion', () => SCENARIOS.find((s) => s.id === 'completion')!.run(driver!))} />
            </View>
            <Text style={styles.small}>Jumps write a checkpoint only. Completion switches to a fresh learner and really finishes the finale (one completion record and the rank unlock, on that test learner).</Text>
          </Section>

          <Section title="Help">
            <View style={styles.wrap}>
              <Btn label="Next help" disabled={busy || !session} onPress={() => session?.director.requestHelp()} />
              <Btn label={`Misses to visual tool (${ctx ? thresholds(ctx.content).visual : '?'})`} disabled={busy || !session} onPress={() => void run('misses:visual', () => misses('visual'))} />
              <Btn label={`Misses to Concept Rescue (${ctx ? thresholds(ctx.content).rescue : '?'})`} disabled={busy || !session} onPress={() => void run('misses:rescue', () => misses('rescue'))} />
            </View>
            <Text style={styles.small}>Simulated misses go through the runtime like taps. A miss is recorded only when the item is resolved, by whoever resolves it.</Text>
          </Section>

          <Section title="Concept Rescue">
            <View style={styles.wrap}>
              <Btn label="Enter rescue (general)" disabled={busy || !driver} onPress={() => void run('scenario:rescue-generic', () => SCENARIOS.find((s) => s.id === 'rescue-generic')!.run(driver!))} />
              <Btn label="Enter rescue (misconception)" disabled={busy || !driver} onPress={() => void run('scenario:rescue-misconception', () => SCENARIOS.find((s) => s.id === 'rescue-misconception')!.run(driver!))} />
              <Btn label="Count the test run" disabled={busy || !session} onPress={() => void run('count test run', () => countTestRun(driver!, session!))} />
              <Btn label="Answer the test run" disabled={busy || !session} onPress={() => void run('answer test run', () => answerTestRun(driver!, session!))} />
            </View>
            {session ? <RescueReadout session={session} /> : null}
            <Text style={styles.note}>{'Open question (do not tune yet): the final "where does it stop?" may be too easy, because the learner has just counted to that floor. Watch whether the real job is then solved.'}</Text>
          </Section>

          <Section title="Access and sound (real settings)">
            {session ? <SettingsControls session={session} /> : <Text style={styles.small}>No game running.</Text>}
          </Section>

          <Section title="Visual review">
            <View style={styles.wrap}>
              {SCENARIOS.map((s) => (
                <Btn key={s.id} label={s.label} disabled={busy || !driver} onPress={() => void run(`scenario:${s.id}`, () => s.run(driver!))} />
              ))}
            </View>
          </Section>

          <Section title="Inspect (developer only)">
            <Btn label="Refresh" onPress={() => void refresh()} />
            {inspection ? <InspectionView i={inspection} /> : null}
            <Btn label="Open playtest report" disabled={!session} onPress={() => setReportRequest((n) => n + 1)} />
          </Section>

          {IS_BROWSER ? (
            <Section title="Browser save">
              <Text style={styles.small}>Everything is stored in this browser profile only (IndexedDB). Wiping removes every learner in this browser, including the default one.</Text>
              <Btn
                label={confirmWipe ? 'Press again to wipe and reload' : 'Wipe this browser save'}
                danger
                disabled={busy || !svc}
                onPress={() => {
                  if (!confirmWipe) return setConfirmWipe(true);
                  void run('wipe browser save', async () => {
                    await driver?.unmount();
                    await svc!.db.close();
                    await wipeAppDatabase(DB_NAME);
                    if (CAN_RELOAD) reloadApp();
                  });
                }}
              />
            </Section>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.collapsed}>
          <Btn label="Tools" onPress={() => setPanelOpen(true)} />
        </View>
      )}
    </View>
  );
}

function RescueReadout({ session }: { session: Floor15Session }) {
  const v = useDirectorView(session.director);
  const r = v.rescue;
  if (v.stage !== 'rescue' || !r) return <Text style={styles.small}>No rescue on screen. Stage: {v.stage}, misses on this job: {v.task?.wrongTries ?? 0}.</Text>;
  const stop = r.kind === 'fill' ? `${r.steps} more` : `floor ${r.origin + (r.direction === 'down' ? -1 : 1) * r.steps}`;
  return (
    <View>
      <Text style={styles.text}>
        Parallel example: {r.kind === 'fill' ? `capacity ${r.capacity}, ${r.aboard} aboard` : `start ${r.origin}, ${r.steps} floors ${r.direction}`} · answer {stop} (shown to you only)
      </Text>
      <Text style={styles.text}>Focus: {r.focus ?? 'none (general explanation)'} · phase: {r.phase} · counted: {r.counted.join(', ') || 'none'}</Text>
    </View>
  );
}

function SettingsControls({ session }: { session: Floor15Session }) {
  const [s, setS] = useState(session.settings.get());
  useEffect(() => session.settings.subscribe(() => setS(session.settings.get())), [session]);
  return (
    <View>
      <View style={styles.wrap}>
        <Btn label="Normal motion" on={s.motion === 'normal'} onPress={() => session.setMotion('normal')} />
        <Btn label="Reduced motion" on={s.motion === 'reduced'} onPress={() => session.setMotion('reduced')} />
      </View>
      <View style={styles.wrap}>
        <Btn label="Normal audio" on={s.audio.output === 'normal'} onPress={() => session.setAudio('normal', s.audio.effects)} />
        <Btn label="Quiet" on={s.audio.output === 'quiet'} onPress={() => session.setAudio('quiet', s.audio.effects)} />
        <Btn label="Mute" on={s.audio.output === 'muted'} onPress={() => session.setAudio('muted', s.audio.effects)} />
      </View>
      <Text style={styles.small}>{session.audio.status().waitingForGesture ? 'Browser audio is waiting for a first click or key press in the page.' : 'Audio allowed.'}</Text>
    </View>
  );
}

function InspectionView({ i }: { i: Inspection }) {
  return (
    <View style={styles.inspect}>
      <Text style={styles.mono}>learner   {i.learnerId}</Text>
      <Text style={styles.mono}>attempts  {i.attempts} · mission completions {i.completions}</Text>
      <Text style={styles.mono}>last      {i.lastAttempt ? `${i.lastAttempt.outcome}, ${i.lastAttempt.assistance}, ${i.lastAttempt.wrongTries} misses${i.lastAttempt.conceptRescue ? ', after Concept Rescue' : ''}` : 'none'}</Text>
      <Text style={styles.mono}>unlocks   {i.unlocks.join(', ') || 'none'}</Text>
      <Text style={styles.mono}>settings  {JSON.stringify(i.settings)}</Text>
      <Text style={styles.mono}>placement {i.placement ? `${i.placement.id} (${i.placement.source}): ${i.placement.unlockedSkills.join(', ')}` : 'none'}</Text>
      {i.skills.map((s) => (
        <Text key={s.id} style={styles.mono}>
          {s.id.padEnd(22)} {s.level} (peak {s.peak}){s.unlocked ? '' : ' locked'}
        </Text>
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}

function Btn({ label, onPress, on = false, disabled = false, danger = false }: { label: string; onPress: () => void; on?: boolean; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.btn, on && styles.btnOn, danger && styles.btnDanger, disabled && styles.btnDisabled, pressed && styles.btnPressed]}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#05070B' },
  stageWrap: { flex: 1, padding: 12, gap: 8 },
  scrollInner: { flexGrow: 1, alignItems: 'flex-start' },
  dims: { color: p.inkMuted, fontSize: 12, fontFamily: 'monospace' },
  frame: { overflow: 'hidden', borderWidth: 1, borderColor: p.surface[3], backgroundColor: p.void, position: 'relative' },
  panel: { width: PANEL_WIDTH, flexGrow: 0, backgroundColor: p.surface[1], borderLeftWidth: 1, borderLeftColor: p.surface[3] },
  panelInner: { padding: 12, gap: 12 },
  collapsed: { padding: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  section: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: p.surface[3] },
  h1: { color: p.accentPrimary, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  h2: { color: p.ink, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  text: { color: p.ink, fontSize: 12 },
  small: { color: p.inkMuted, fontSize: 11 },
  note: { color: p.warning, fontSize: 11 },
  status: { color: p.success, fontSize: 12, fontFamily: 'monospace' },
  mono: { color: p.ink, fontSize: 11, fontFamily: 'monospace' },
  inspect: { gap: 2, padding: 6, backgroundColor: p.surface[0], borderRadius: 6 },
  btn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: p.surface[2], borderWidth: 1, borderColor: p.surface[3] },
  btnOn: { borderColor: p.accentSecondary, backgroundColor: p.paint },
  btnDanger: { borderColor: p.danger },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { opacity: 0.7 },
  btnText: { color: p.ink, fontSize: 12, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8, backgroundColor: p.void },
});
