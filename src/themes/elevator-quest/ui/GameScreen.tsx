// The Floor 15 gameplay screen. Thin: it draws the director's view and forwards touches.
// It computes no correctness, mastery, eligibility, or misconception meaning.
import { useCallback, useMemo, useState } from 'react';
import { PixelRatio, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PLAYTEST_ENABLED } from '../../../config/flags';
import type { AudioOutput } from '../audio/mix';
import { FLOOR15, LINES } from '../content/floor15';
import type { Motion } from '../director/director';
import { buildReport } from '../director/playtestLog';
import { useDirectorView, type Floor15Session } from '../useFloor15';
import { ButtonPanel } from './ButtonPanel';
import { CabinScene } from './CabinScene';
import { CargoBay } from './CargoBay';
import { CompletionCard, HelpButton, IconButton, MissionStatus } from './Hud';
import { computeLayout } from './layout';
import { Lifty } from './Lifty';
import { DISPLAY, eq } from './palette';
import { ShaftMap } from './ShaftMap';
import { RescueBoard } from './RescueBoard';
import { PlaytestSheet, SettingsSheet } from './Sheets';

declare const HermesInternal: unknown;

export function GameScreen({ session }: { session: Floor15Session }) {
  const { director, audio, log, runtime } = session;
  const view = useDirectorView(director);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = useMemo(() => computeLayout(window, insets), [window, insets]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [output, setOutput] = useState<AudioOutput>(session.settings.audio.output);
  const [effects, setEffects] = useState(session.settings.audio.effects);

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

  const setMotion = (m: Motion) => {
    director.setMotion(m);
    void runtime.putSetting(session.learnerId, 'motion', m);
  };
  const applyAudio = (o: AudioOutput, e: number) => {
    setOutput(o);
    setEffects(e);
    audio.setSettings({ output: o, effects: e });
    void runtime.putSetting(session.learnerId, 'output', o);
    void runtime.putSetting(session.learnerId, 'effects', String(e));
  };

  const openReport = async () => {
    setSettingsOpen(false);
    const evals = log.entries().filter((e) => e.kind === 'answer' && typeof e.data.evalMs === 'number');
    for (const e of evals) log.timing('evaluation', e.data.evalMs as number);
    const text = buildReport(log, {
      device: {
        os: `${Platform.OS} ${String(Platform.Version)}`,
        window: `${Math.round(window.width)}x${Math.round(window.height)} @${PixelRatio.get()}x`,
        orientation: layout.orientation,
        buttonSize: layout.button,
        build: __DEV__ ? 'debug (timings not representative)' : 'release',
        hermes: typeof HermesInternal !== 'undefined',
        fabric: Boolean((globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager),
        renderer: 'React Native views + Skia canvas (cabin)',
        rendererAcceptance: 'provisional: no physical Fire run recorded yet',
        motion: view.motion,
        audio: `${output}, effects ${Math.round(effects * 100)}%, ${audio.status().ready ? 'ready' : `error: ${audio.status().error}`}, ${audio.status().played} sounds played`,
      },
      skillsBefore: session.skillsBefore,
      skillsNow: await runtime.learnerState(session.learnerId),
      progression: await runtime.progressionEvents(session.learnerId),
      unlocks: (await runtime.unlocks(session.learnerId)).map((u) => u.unlockId),
    });
    setReport(text);
  };

  const mapWidth = view.shaftMode === 'status' ? 64 : 96;
  const cabin = layout.cabin;
  const shaftBox = {
    x: cabin.x + cabin.width - mapWidth - 10,
    y: cabin.y + 64,
    width: mapWidth,
    height: Math.max(120, cabin.height - 74),
  };
  // In the cargo bay the dock and car take the whole cabin view; the shaft map steps aside.
  const cargoBox = {
    x: cabin.x + 12,
    y: cabin.y + 64,
    width: Math.max(240, cabin.width - 24),
    height: Math.max(160, cabin.height - 76),
  };
  const cargoStage = view.stage === 'cargo' && view.task?.cargo;
  const rescue = view.stage === 'rescue' ? view.rescue : null;
  // The test run takes the stage over the dimmed cabin; the panel stays visible but locked.
  // Portrait: whichever of cabin and panel area is bigger (Lifty stays visible between them).
  const panel = layout.panel;
  const rescueBox =
    layout.orientation === 'landscape' || cabin.width * cabin.height >= panel.width * panel.height ? cabin : { x: cabin.x, y: panel.y, width: cabin.width, height: panel.height };
  const elevator = view.elevator;
  const helpDisabled = view.saving || (view.stage !== 'task' && view.stage !== 'cargo');

  return (
    <View style={styles.screen}>
      <CabinScene box={cabin} elevator={elevator} timing={view.timing} power={view.power} repairFloor={FLOOR15.repairFloor} reducedMotion={view.motion === 'reduced'} calm={Boolean(rescue)} />
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
          interactive={view.stage === 'task' && view.task?.kind === 'shaft'}
          onSelect={onShaft}
        />
      )}
      {view.stage === 'cargo' && view.task?.cargo ? (
        <CargoBay box={cargoBox} cargo={view.task.cargo} showMeter={view.shaftMode === 'numberLine'} onLoad={director.loadCrate} onUnload={director.unloadCrate} />
      ) : null}
      <View style={[styles.cabinHud, { left: cabin.x, top: cabin.y, width: cabin.width }]} pointerEvents="box-none">
        {cabin.width < 400 ? null : (
          <MissionStatus
            objective={view.objective}
            progress={view.progress}
            compact={cabin.height < 300 || cabin.width < 520 || Boolean(cargoStage)}
            onLongPress={PLAYTEST_ENABLED ? () => void openReport() : undefined}
          />
        )}
        <View style={styles.cabinIcons}>
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
        reducedMotion={view.motion === 'reduced'}
        onFloor={onFloor}
        onDoorOpen={onDoorOpen}
        onDoorClose={onDoorClose}
      />
      {rescue ? <RescueBoard box={rescueBox} rescue={rescue} disabled={view.saving} onTap={director.rescueTap} /> : null}
      <Lifty box={layout.lifty} mood={view.lifty.mood} line={view.lifty.line} reducedMotion={view.motion === 'reduced'}>
        {view.help ? <HelpButton label={view.help.label} offered={view.help.offered} disabled={helpDisabled} still={view.motion === 'reduced'} onPress={director.requestHelp} /> : null}
      </Lifty>
      {view.stage === 'complete' && view.power === 'on' ? (
        <View
          pointerEvents="none"
          style={[
            styles.online,
            {
              left: cabin.x,
              top: cabin.y + cabin.height * 0.34,
              width: cabin.width,
            },
          ]}
        >
          <Text allowFontScaling={false} style={styles.onlineText}>
            {LINES.powerOnline}
          </Text>
        </View>
      ) : null}
      {view.overlay ? <CompletionCard title={view.overlay.title} lines={view.overlay.lines} onFreeRide={director.freeRide} onPlayAgain={() => void director.playAgain()} /> : null}
      {view.maintenanceUnlocked && view.stage === 'freeRide' ? <MaintenanceReadout elevatorPhase={elevator.phase} direction={elevator.direction} floor={elevator.indicator} box={cabin} /> : null}
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
    <View style={[styles.maint, { left: box.x + 12, top: box.y + box.height - 104 }]} accessibilityLabel="Maintenance panel">
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
  online: { position: 'absolute', alignItems: 'center' },
  onlineText: {
    ...DISPLAY(0.7),
    color: eq.ok,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(3,12,8,0.8)',
  },
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
