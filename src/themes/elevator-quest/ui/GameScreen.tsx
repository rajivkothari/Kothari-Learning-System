// The Floor 15 gameplay screen. Thin: it draws the director's view and forwards touches.
// It computes no correctness, mastery, eligibility, or misconception meaning.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PLAYTEST_ENABLED } from '../../../config/flags';
import { environmentDescription } from '../../../platform/environment';
import { useViewport } from '../../../presentation/viewport';
import type { AudioOutput } from '../audio/mix';
import { FLOOR15, LINES } from '../content/floor15';
import { LANDINGS, engineerLog, exploreSpots, landingFor, spotDiscovered } from '../content/landings';
import type { Motion } from '../director/director';
import { buildReport } from '../director/playtestLog';
import { useDirectorView, useSessionSettings, type Floor15Session } from '../useFloor15';
import { ButtonPanel } from './ButtonPanel';
import { CabinScene } from './CabinScene';
import { CargoBay } from './CargoBay';
import { EngineerLog } from './EngineerLog';
import { ClipboardButton, HUD_FULL_HEIGHT, HelpButton, IconButton, MissionStatus, NextJobButton, TroubleCard } from './Hud';
import { helpUsesCorner, liftyContext, liftyPlacement, maintenanceReadoutBox, sceneBoxes } from './liftyPlacement';
import { computeLayout } from './layout';
import { Lifty } from './Lifty';
import { eq } from './palette';
import { ShaftMap } from './ShaftMap';
import { RescueBoard } from './RescueBoard';
import { PlaytestSheet, SettingsSheet } from './Sheets';

declare const HermesInternal: unknown;

/**
 * `reportRequest`: developer tools bump it to open the playtest report (PLAYTEST builds only).
 * `onExit`: back to the developer launcher, where one exists (never in a production child build).
 */
export function GameScreen({ session, reportRequest = 0, onExit }: { session: Floor15Session; reportRequest?: number; onExit?: (() => void) | undefined }) {
  const { director, audio, log, runtime } = session;
  const view = useDirectorView(director);
  const restored = view.floor15Restored;
  const landing = useMemo(() => landingFor(LANDINGS, view.elevator.floor, { restored: () => restored }), [view.elevator.floor, restored]);
  // The Engineer Log's rows, and the floors already inspected (a service dot on their buttons).
  const logRows = useMemo(() => engineerLog(LANDINGS, view.discoveries, { restored: (f) => f === FLOOR15.repairFloor && restored }), [view.discoveries, restored]);
  const serviced = useMemo(() => logRows.filter((r) => r.inspected).map((r) => r.floor), [logRows]);
  const window = useViewport();
  const insets = useSafeAreaInsets();
  const layout = useMemo(() => computeLayout({ width: window.width, height: window.height }, insets), [window.width, window.height, insets]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const { output, effects } = useSessionSettings(session).audio;

  /** Measure handler -> sound request for the playtest report (JS-side; not speaker latency). */
  const timed = useCallback(
    (fn: () => void) => {
      const t0 = performance.now();
      fn();
      const at = audio.status().lastRequestAt;
      if (at !== null && at >= t0) log.timing('handlerToSoundRequest', at - t0);
    },
    [audio, log],
  );

  const onFloor = useCallback((floor: number) => timed(() => director.pressFloor(floor, 'panel')), [director, timed]);
  const onShaft = useCallback((floor: number) => timed(() => director.pressFloor(floor, 'shaft')), [director, timed]);
  const onDoorOpen = useCallback(() => timed(() => director.pressDoorOpen()), [director, timed]);
  const onDoorClose = useCallback(() => timed(() => director.pressDoorClose()), [director, timed]);
  const onOpenLog = useCallback(() => director.openLog(), [director]);
  const onCloseLog = useCallback(() => director.closeLog(), [director]);
  const onReplay = useCallback(() => void director.playAgain(), [director]);

  const setMotion = (m: Motion) => session.setMotion(m);
  const applyAudio = (o: AudioOutput, e: number) => session.setAudio(o, e);

  const openReport = async () => {
    setSettingsOpen(false);
    const evals = log.entries().filter((e) => e.kind === 'answer' && typeof e.data.evalMs === 'number');
    for (const e of evals) log.timing('evaluation', e.data.evalMs as number);
    const text = buildReport(log, {
      device: {
        os: environmentDescription(),
        window: `${Math.round(window.width)}x${Math.round(window.height)} @${PixelRatio.get()}x${window.label ? ` (${window.label})` : ''}`,
        orientation: layout.orientation,
        buttonSize: layout.button,
        build: __DEV__ ? 'debug (timings not representative)' : 'release',
        hermes: typeof HermesInternal !== 'undefined',
        fabric: Boolean((globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager),
        renderer: 'React Native views + Skia canvas (cabin)',
        rendererAcceptance: 'provisional: no physical Fire run recorded yet',
        motion: view.motion,
        audio: `${output}, effects ${Math.round(effects * 100)}%, ${audio.status().ready ? 'ready' : `error: ${audio.status().error}`}${audio.status().waitingForGesture ? ', waiting for a first tap (browser autoplay rule)' : ''}, ${audio.status().played} sounds played`,
      },
      skillsBefore: session.skillsBefore,
      skillsNow: await runtime.learnerState(session.learnerId),
      progression: await runtime.progressionEvents(session.learnerId),
      unlocks: (await runtime.unlocks(session.learnerId)).map((u) => u.unlockId),
    });
    setReport(text);
  };

  const lastReportRequest = useRef(reportRequest);
  useEffect(() => {
    if (!PLAYTEST_ENABLED || reportRequest === lastReportRequest.current) return;
    lastReportRequest.current = reportRequest;
    void openReport();
    // openReport reads the latest state when it runs; re-running on its identity is not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportRequest]);

  const cabin = layout.cabin;
  // Lifty's place follows the job (liftyPlacement.ts). The crates and the test run take the cabin
  // view below Lifty; the shaft map keeps its column. None of them is ever under Lifty.
  const context = liftyContext(view);
  const scene = sceneBoxes(layout, view.shaftMode, context);
  // The help slot also holds NEXT JOB, so Lifty's words keep their place through a whole success.
  const placement = liftyPlacement(layout, context, { help: view.help !== null || view.stage === 'success' });
  const shaftBox = scene.shaft;
  const cargoBox = scene.cargo;
  // The bay stays through the success, so the accepted load (and its sum) stays in view.
  const cargoStage = (view.stage === 'cargo' || (view.stage === 'success' && view.task?.kind === 'cargo')) && view.task?.cargo;
  const rescue = view.stage === 'rescue' ? view.rescue : null;
  const rescueBox = scene.rescue;
  // The checklist gives its corner to the help button in narrow cabins, and steps back during cargo.
  const hudHidden = cabin.width < 400 || (view.help !== null && helpUsesCorner(layout)) || Boolean(cargoStage && cargoBox.hideStatus);
  const hudCompact = cabin.height < 300 || cabin.width < 520 || Boolean(cargoStage) || cabin.y + 10 + HUD_FULL_HEIGHT > layout.lifty.y;
  const elevator = view.elevator;
  const helpDisabled = view.saving || (view.stage !== 'task' && view.stage !== 'cargo');
  // Free ride with the doors open: the landing's thing can be touched (not through the log).
  const spot = view.stage === 'freeRide' && elevator.phase === 'idleOpen' && !view.logOpen && !(elevator.floor === FLOOR15.repairFloor && !restored) ? (exploreSpots(LANDINGS, elevator.floor)[0] ?? null) : null;
  const explore = useMemo(() => (spot ? { object: spot.object, inspected: spotDiscovered(spot, view.discoveries) } : null), [spot, view.discoveries]);
  const spotId = spot?.id ?? null;
  const onInspect = useCallback(() => {
    if (spotId) director.inspect(spotId);
  }, [director, spotId]);
  const reaction = view.reaction?.floor === elevator.floor ? view.reaction.seq : 0;
  // Mission objects on this landing; collectable only during the success that found them.
  const objects = useMemo(
    () => view.props.filter((p) => p.floor === elevator.floor).map((p) => ({ id: p.id, visual: p.visual, collected: p.state === 'collected', label: p.label, action: view.stage === 'success' && p.interactive ? p.action : null })),
    [view.props, view.stage, elevator.floor],
  );
  const onCollect = useCallback((id: string) => director.collect(id), [director]);
  const onNextJob = useCallback(() => director.nextJob(), [director]);
  const logAvailable = view.maintenanceUnlocked && view.stage === 'freeRide';
  // The readout never covers the door opening (narrow windows have no room for it).
  const readout = useMemo(() => maintenanceReadoutBox(layout), [layout]);

  return (
    <View style={styles.screen}>
      <CabinScene
        box={cabin}
        bandHeight={layout.bandHeight}
        confirmed={view.stage === 'success'}
        elevator={elevator}
        timing={view.timing}
        power={view.power}
        repairFloor={FLOOR15.repairFloor}
        reducedMotion={view.motion === 'reduced'}
        calm={Boolean(rescue)}
        landing={landing}
        reaction={reaction}
        explore={explore}
        onInspect={onInspect}
        objects={objects}
        onCollect={onCollect}
      />
      {cargoStage || rescue ? null : (
        <ShaftMap
          box={shaftBox}
          elevator={elevator}
          timing={view.timing}
          minFloor={FLOOR15.floors.min}
          maxFloor={FLOOR15.floors.max}
          mode={view.shaftMode}
          beacon={view.beacon}
          countAlong={view.countAlong}
          replay={view.replay?.representation === 'numberLine' ? view.replay : null}
          interactive={view.stage === 'task' && view.task?.kind === 'shaft'}
          onSelect={onShaft}
        />
      )}
      {cargoStage && view.task?.cargo ? (
        <CargoBay box={cargoBox} cargo={view.task.cargo} showMeter={view.shaftMode === 'numberLine'} sum={view.replay?.representation === 'loadMeter' ? view.replay.answerSummary : null} onLoad={director.loadCrate} onUnload={director.unloadCrate} />
      ) : null}
      <View style={[styles.cabinHud, { left: cabin.x, top: cabin.y, width: cabin.width }]} pointerEvents="box-none">
        {hudHidden ? null : (
          <MissionStatus
            objective={view.objective}
            progress={view.progress}
            compact={hudCompact}
            onLongPress={PLAYTEST_ENABLED ? () => void openReport() : undefined}
          />
        )}
        <View style={styles.cabinIcons}>
          {logAvailable ? <ClipboardButton label={LINES.log.open} onPress={onOpenLog} /> : null}
          <IconButton label="Settings" glyph="⚙" onPress={() => setSettingsOpen(true)} />
        </View>
      </View>
      <ButtonPanel
        box={layout.panel}
        button={layout.button}
        gap={layout.gap}
        columns={layout.columns}
        lit={elevator.lit}
        currentFloor={elevator.phase === 'idleOpen' || elevator.phase === 'idleClosed' ? elevator.floor : null}
        highlights={view.highlights}
        disabledFloors={elevator.disabledFloors}
        locked={view.power === 'off' || Boolean(rescue)}
        hallCall={view.hallCall}
        serviced={serviced}
        sweep={view.sweep}
        rank={view.rank}
        reducedMotion={view.motion === 'reduced'}
        onFloor={onFloor}
        onDoorOpen={onDoorOpen}
        onDoorClose={onDoorClose}
      />
      {rescue ? <RescueBoard box={rescueBox} rescue={rescue} disabled={view.saving} onTap={director.rescueTap} /> : null}
      <Lifty placement={placement} mood={view.lifty.mood} line={view.lifty.line} reducedMotion={view.motion === 'reduced'} />
      {view.help ? (
        <View style={[styles.help, { left: placement.help.x, top: placement.help.y, width: placement.help.width, height: placement.help.height }]}>
          <HelpButton label={view.help.label} offered={view.help.offered} disabled={helpDisabled} still={view.motion === 'reduced'} onPress={director.requestHelp} width={placement.help.width} />
        </View>
      ) : null}
      {view.stage === 'success' && view.success === 'review' ? (
        <View style={[styles.help, { left: placement.help.x, top: placement.help.y, width: placement.help.width, height: placement.help.height }]}>
          <NextJobButton label={LINES.nextJob} onPress={onNextJob} width={placement.help.width} />
        </View>
      ) : null}
      {view.stage === 'error' && view.trouble ? (
        <TroubleCard title={LINES.trouble.title} body={LINES.trouble.body} retry={LINES.trouble.retry} exit={LINES.trouble.exit} onRetry={() => void director.recover()} onExit={onExit} />
      ) : null}
      {logAvailable && !view.logOpen && readout ? <MaintenanceReadout elevatorPhase={elevator.phase} direction={elevator.direction} floor={elevator.indicator} box={readout} /> : null}
      {logAvailable && view.logOpen ? <EngineerLog box={cabin} rows={logRows} onClose={onCloseLog} onReplay={onReplay} /> : null}
      <SettingsSheet
        visible={settingsOpen}
        motion={view.motion}
        output={output}
        effects={effects}
        playtest={PLAYTEST_ENABLED}
        onMotion={setMotion}
        onOutput={(o) => applyAudio(o, effects)}
        onEffects={(e) => applyAudio(output, e)}
        onPlaytest={() => void openReport()}
        onClose={() => setSettingsOpen(false)}
      />
      {PLAYTEST_ENABLED ? <PlaytestSheet visible={report !== null} report={report ?? ''} onClear={() => (log.clear(), setReport(null))} onClose={() => setReport(null)} /> : null}

    </View>
  );
}

/** The unlocked maintenance panel: live machine readouts during free rides. */
function MaintenanceReadout({
  elevatorPhase,
  direction,
  floor,
  box,
}: {
  elevatorPhase: string;
  direction: string | null;
  floor: number;
  box: { x: number; y: number; width: number; height: number };
}) {
  const rows: [string, string][] = [
    ['STATE', elevatorPhase.replace(/([A-Z])/g, ' $1').toUpperCase()],
    ['DIRECTION', direction ? direction.toUpperCase() : 'IDLE'],
    ['POSITION', `FLOOR ${floor}`],
  ];
  return (
    <View pointerEvents="none" style={[styles.maint, { left: box.x, top: box.y, width: box.width, minHeight: box.height }]} accessibilityLabel="Maintenance panel">
      <Text allowFontScaling={false} style={styles.maintTitle}>
        MAINTENANCE PANEL
      </Text>
      {rows.map(([k, v]) => (
        <Text key={k} allowFontScaling={false} style={styles.maintRow}>
          {k.padEnd(10, ' ')} {v}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: eq.night },
  cabinHud: {
    position: 'absolute',
    height: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cabinIcons: {
    position: 'absolute',
    right: 8,
    top: 8,
    flexDirection: 'row',
    gap: 8,
  },
  help: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  maint: {
    position: 'absolute',
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(3,12,8,0.85)',
    borderWidth: 1,
    borderColor: eq.ok,
  },
  maintTitle: {
    color: eq.ok,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 2,
  },
  maintRow: {
    color: eq.ok,
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});
