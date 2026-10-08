// The Floor 15 gameplay screen. Thin: it draws the director's view and forwards touches.
// It computes no correctness, mastery, eligibility, or misconception meaning.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PixelRatio, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PLAYTEST_ENABLED } from '../../../config/flags';
import { environmentDescription } from '../../../platform/environment';
import { useViewport } from '../../../presentation/viewport';
import type { AudioOutput } from '../audio/mix';
import { FLOOR15, LINES } from '../content/floor15';
import { isMoving } from '../sim/elevator';
import { LANDINGS, directoryRows, engineerLog, landingFor } from '../content/landings';
import { readingLine } from '../content/reading';
import type { Motion } from '../director/director';
import { touchTargets } from '../director/landingTouch';
import { buildReport } from '../director/playtestLog';
import { GameEntranceButton } from '../minigames/hostControls';
import { HOST_COPY, entranceLabel } from '../minigames/hostCopy';
import { gameEntrance } from '../minigames/hostEntrance';
import { entrancePlacement } from '../minigames/hostLayout';
import { useDirectorView, useSessionSettings, type Floor15Session } from '../useFloor15';
import { ButtonPanel } from './ButtonPanel';
import { CabinScene } from './CabinScene';
import { useArt } from './art/ArtContext';
import { CargoBay } from './CargoBay';
import { DirectoryButton, DirectorySheet } from './Directory';
import { givenMarks } from './emphasis';
import { EngineerLog } from './EngineerLog';
import { ClipboardButton, HelpButton, IconButton, MissionStatus, NextJobButton, TroubleCard } from './Hud';
import { bannerBox, cargoInView, liftyContext, liftyPlacement, maintenanceReadoutBox, sceneBoxes } from './liftyPlacement';
import { computeLayout, directorySheetBox } from './layout';
import { Lifty } from './Lifty';
import { eq } from './palette';
import { ShaftMap } from './ShaftMap';
import { ReadingCard } from './ReadingCard';
import { cardCoversPlate, noteButtonBox, readingCardBox } from './readingCardLayout';
import { NoteButton, ReadingChoices } from './ReadingNote';
import { readingOnScreen, readingSurface, readingTouch } from './readingSurface';
import { RescueBoard } from './RescueBoard';
import { TripMeter } from './TripMeter';
import { PlaytestSheet, SettingsSheet } from './Sheets';

declare const HermesInternal: unknown;

/**
 * `reportRequest`: developer tools bump it to open the playtest report (PLAYTEST builds only).
 * `onExit`: back to the developer launcher, where one exists (never in a production child build).
 * `onStartOver`: playtest builds only, the device's learner starts again with no progress (D143).
 */
export function GameScreen({ session, reportRequest = 0, onExit, onStartOver }: { session: Floor15Session; reportRequest?: number; onExit?: (() => void) | undefined; onStartOver?: (() => Promise<void>) | undefined }) {
  const { director, audio, log, runtime } = session;
  const view = useDirectorView(director);
  const restored = view.floor15Restored;
  // The developer tools can show Floor 15's landing in either state; the mission itself is unchanged.
  const artFloor15 = useArt().floor15;
  const shownRestored = artFloor15 === 'auto' ? restored : artFloor15 === 'restored';
  const landing = useMemo(() => landingFor(LANDINGS, view.elevator.floor, { restored: () => shownRestored }), [view.elevator.floor, shownRestored]);
  const destination = view.elevator.destination;
  const nextLanding = useMemo(() => (destination === null ? null : landingFor(LANDINGS, destination, { restored: () => shownRestored })), [destination, shownRestored]);
  const directory = useMemo(() => directoryRows(LANDINGS, FLOOR15.floors.min, FLOOR15.floors.max, { restored: () => restored }), [restored]);
  // The Engineer Log's rows, and the floors already inspected (a service dot on their buttons).
  const logRows = useMemo(() => engineerLog(LANDINGS, view.discoveries, { restored: (f) => f === FLOOR15.repairFloor && restored }), [view.discoveries, restored]);
  const serviced = useMemo(() => logRows.filter((r) => r.inspected).map((r) => r.floor), [logRows]);
  const window = useViewport();
  const insets = useSafeAreaInsets();
  const layout = useMemo(() => computeLayout({ width: window.width, height: window.height }, insets), [window.width, window.height, insets]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
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

  // The building directory (M8.1): information, never a ride. Opening it changes no job state (the note
  // stays as it was); the director only logs it and marks the learner's introduction seen.
  const directoryShown = useRef(false);
  const openDirectory = useCallback(() => {
    if (directoryShown.current) return;
    directoryShown.current = true;
    setDirectoryOpen(true);
    director.directoryOpened();
  }, [director]);
  const closeDirectory = useCallback(() => {
    if (!directoryShown.current) return;
    directoryShown.current = false;
    setDirectoryOpen(false);
    director.directoryClosed();
  }, [director]);
  // Riding or working the doors puts the directory away (it is for reading, between choices).
  const onFloor = useCallback(
    (floor: number) => {
      closeDirectory();
      timed(() => director.pressFloor(floor, 'panel'));
    },
    [director, timed, closeDirectory],
  );
  const onShaft = useCallback((floor: number) => timed(() => director.pressFloor(floor, 'shaft')), [director, timed]);
  const onDoorOpen = useCallback(() => {
    closeDirectory();
    timed(() => director.pressDoorOpen());
  }, [director, timed, closeDirectory]);
  const onDoorClose = useCallback(() => {
    closeDirectory();
    timed(() => director.pressDoorClose());
  }, [director, timed, closeDirectory]);
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
  const placement = liftyPlacement(layout, context, { help: view.help !== null || view.stage === 'success' || view.rescueReady });
  const shaftBox = scene.shaft;
  const cargoBox = scene.cargo;
  // The bay stays through the success and a correction's pause, so the load (its sum, or the room left) stays in view.
  const cargoStage = cargoInView(view) && view.task?.cargo;
  const rescue = view.stage === 'rescue' ? view.rescue : null;
  const rescueBox = scene.rescue;
  // The mission banner keeps to the corner left of the indicator and above Lifty (bannerBox: null where
  // the help button takes that corner), and steps back during cargo.
  const banner = bannerBox(layout);
  const hudHidden = !banner || Boolean(cargoStage && cargoBox.hideStatus);
  const elevator = view.elevator;
  const helpDisabled = view.saving || (view.stage !== 'task' && view.stage !== 'cargo');
  // A reading job (M8): its note opens first (read), then folds to answer: on the panel (a ride), the
  // cards (a card job), or the landing (a touch job, when every one of its things can be touched on
  // the landing as drawn now; else the same options as cards). ui/readingSurface.ts decides.
  const reading = readingOnScreen(view);
  // Whether a touch job's things can all be touched on the landing as drawn now (CabinScene says).
  const [reach, setReach] = useState<boolean | null>(null);
  const surface = reading ? readingSurface(reading, reach) : null;
  const readingBox = readingCardBox(layout, context);
  // In the shortest split views a card may take the cabin's foot, over the corner DIRECTORY plate: the
  // plate waits under it until the card is put away (readingCardLayout.readingCardBox).
  const plateUnderCard = cardCoversPlate(layout, readingBox);
  const shownThing = reading?.options.find((o) => o.shown)?.value ?? null;
  const onChoose = useCallback((value: string) => director.chooseReading(value), [director]);
  const onOpenNote = useCallback(() => director.openNote(), [director]);
  const onCloseNote = useCallback(() => director.closeNote(), [director]);
  // A touch job's options on its own landing: CabinScene says whether all of them can be touched there.
  const answerKey = reading && reading.mode === 'touch' && reading.floor === elevator.floor ? reading.options.map((o) => o.value).join(' ') : null;
  const answerSet = useMemo(() => (answerKey ? answerKey.split(' ') : null), [answerKey]);
  // What a touch on the open landing reaches now (director/landingTouch.ts: the director checks the same).
  const touch = useMemo(() => readingTouch(touchTargets(view), readingOnScreen(view)), [view]);
  const onTouch = useCallback((objectId: string) => director.touchObject(objectId), [director]);
  const reaction = view.reaction?.floor === elevator.floor ? view.reaction : null;
  const onCloseCard = useCallback(() => director.closeCard(), [director]);
  const card = view.card?.floor === elevator.floor ? view.card : null;
  // Mission objects on this landing; collectable only during the success that found them.
  const objects = useMemo(
    () => view.props.filter((p) => p.floor === elevator.floor).map((p) => ({ id: p.id, visual: p.visual, collected: p.state === 'collected', label: p.label, action: view.stage === 'success' && p.interactive ? p.action : null })),
    [view.props, view.stage, elevator.floor],
  );
  const onCollect = useCallback((id: string) => director.collect(id), [director]);
  const onNextJob = useCallback(() => director.nextJob(), [director]);
  const onCountIt = useCallback(() => director.beginRescue(), [director]);
  const onMeterStep = useCallback((delta: 1 | -1) => director.meterStep(delta), [director]);
  const onMeterGo = useCallback(() => director.meterGo(), [director]);
  // The trip meter takes the panel's place for its job. A hall call before the job still needs the panel.
  const meter = view.task?.meter && view.stage !== 'call' && !rescue ? view.task.meter : null;
  const logAvailable = view.maintenanceUnlocked && view.stage === 'freeRide';
  // The DIRECTORY control is on screen once the lift is awake. It opens for moments of choice (a job,
  // with its note open or folded; a hall call; a free ride; the finale; a success), never over a ride
  // under way, a rescue, the crates or the log.
  const directoryShownNow = view.power !== 'off' && view.stage !== 'loading' && view.stage !== 'intro' && view.stage !== 'error';
  const directoryAvailable = directoryShownNow && (view.stage === 'task' || view.stage === 'call' || view.stage === 'freeRide' || view.stage === 'finale' || view.stage === 'success') && !view.logOpen;
  useEffect(() => {
    if (!directoryAvailable) closeDirectory();
  }, [directoryAvailable, closeDirectory]);
  // A math job's line marks its givens (numbers, up and down); never while a floor is ringed (a shown
  // step can name the answer), never a reading job's line (its note marks its own words).
  const marks = useMemo(() => {
    const mathJob = view.task !== null && view.task.kind !== 'read' && (view.stage === 'task' || view.stage === 'cargo' || view.stage === 'pause');
    return mathJob && view.highlights.length === 0 ? givenMarks(view.lifty.line) : undefined;
  }, [view.task, view.stage, view.highlights.length, view.lifty.line]);
  // The help slot is free in a free ride: the Engineer Log's clipboard hangs there.
  const helpSlotBusy = view.help !== null || (view.stage === 'success' && view.success === 'review') || view.rescueReady;
  // The readout never covers the door opening (narrow windows have no room for it).
  const readout = useMemo(() => maintenanceReadoutBox(layout), [layout]);
  // M9: the landing's PLAY button (Floor 20: Word Golf, Floor 4: Cargo Commander) when the learner is
  // free to go and play (minigames/hostEntrance.ts; the director checks the same on open). It stands
  // beside the doorway, clear of every control, Lifty and the landing's own things (hostLayout.ts).
  const games = session.games;
  const unfinished = useSyncExternalStore(games.subscribe, games.unfinished, games.unfinished);
  const offered = gameEntrance(view);
  const readoutShown = Boolean(logAvailable && !view.logOpen && readout);
  const noteShown = Boolean(reading && !reading.open && surface !== 'cards');
  const shaftShape = view.shaftMode === 'status' ? 'status' : 'map';
  const entrance = useMemo(() => {
    if (!offered) return null;
    // Back to an unfinished game where the words fit, else the game's PLAY words, else PLAY.
    const name = entranceLabel(offered.titleKey, unfinished.includes(offered.id));
    const placed = entrancePlacement(layout, offered.floor, { full: [...new Set([name, entranceLabel(offered.titleKey, false)])], short: HOST_COPY.play }, { readout: readoutShown, note: noteShown, shaft: shaftShape });
    return placed ? { game: offered.id, placed, label: placed.label, name } : null;
  }, [offered, unfinished, layout, readoutShown, noteShown, shaftShape]);
  const onPlay = useCallback(() => {
    if (!entrance) return;
    closeDirectory();
    setSettingsOpen(false);
    void games.open(entrance.game);
  }, [entrance, games, closeDirectory]);

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
        nextLanding={nextLanding}
        reaction={reaction}
        opened={view.opened}
        touch={touch}
        onTouch={onTouch}
        answerSet={answerSet}
        onAnswerReach={setReach}
        shown={shownThing}
        shaftWidth={cargoStage || rescue ? 0 : shaftBox.width}
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
          mismatch={view.mismatch}
          replay={view.replay?.representation === 'numberLine' ? view.replay : null}
          interactive={view.stage === 'task' && view.task?.kind === 'shaft'}
          onSelect={onShaft}
        />
      )}
      {cargoStage && view.task?.cargo ? (
        <CargoBay box={cargoBox} cargo={view.task.cargo} showMeter={view.shaftMode === 'numberLine'} sum={view.replay?.representation === 'loadMeter' ? view.replay.answerSummary : null} onLoad={director.loadCrate} onUnload={director.unloadCrate} />
      ) : null}
      {hudHidden || !banner ? null : <MissionStatus box={banner} objective={view.objective} progress={view.progress} text={layout.text} onLongPress={PLAYTEST_ENABLED ? () => void openReport() : undefined} />}
      <View style={[styles.cabinIcons, { top: cabin.y + 8, left: cabin.x + cabin.width - 8 - 48 }]} pointerEvents="box-none">
        <IconButton label="Settings" glyph="⚙" onPress={() => setSettingsOpen(true)} />
      </View>
      {logAvailable && !helpSlotBusy ? (
        <View style={[styles.help, { left: placement.help.x, top: placement.help.y, width: placement.help.width, height: placement.help.height }]}>
          <ClipboardButton label={LINES.log.open} onPress={onOpenLog} />
        </View>
      ) : null}
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
      {meter ? <TripMeter box={layout.panel} meter={meter} enabled={view.stage === 'task' && !view.saving} onStep={onMeterStep} onGo={onMeterGo} /> : null}
      {rescue ? <RescueBoard box={rescueBox} rescue={rescue} disabled={view.saving} onTap={director.rescueTap} /> : null}
      {entrance && !directoryOpen ? <GameEntranceButton box={entrance.placed.box} label={entrance.label} accessibilityLabel={entrance.name} size={entrance.placed.size} game={entrance.game} onPress={onPlay} /> : null}
      <Lifty placement={placement} mood={view.lifty.mood} line={view.lifty.line} reducedMotion={view.motion === 'reduced'} traveling={isMoving(elevator)} sizes={layout.text.dialogue} {...(marks ? { marks } : {})} />
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
      {view.rescueReady ? (
        <View style={[styles.help, { left: placement.help.x, top: placement.help.y, width: placement.help.width, height: placement.help.height }]}>
          <NextJobButton label={LINES.countIt} onPress={onCountIt} width={placement.help.width} hint="Count the job through together" />
        </View>
      ) : null}
      {view.stage === 'error' && view.trouble ? (
        <TroubleCard title={LINES.trouble.title} body={LINES.trouble.body} retry={LINES.trouble.retry} exit={LINES.trouble.exit} onRetry={() => void director.recover()} onExit={onExit} />
      ) : null}
      {logAvailable && !view.logOpen && readout ? <MaintenanceReadout elevatorPhase={elevator.phase} direction={elevator.direction} floor={elevator.indicator} box={readout} /> : null}
      {card ? <ReadingCard box={readingBox} title={card.title} lines={card.lines} closeLabel={card.close} onClose={onCloseCard} text={layout.text} /> : null}
      {reading && surface === 'note' ? (
        <ReadingCard
          testID="reading-note"
          box={readingBox}
          title={reading.title}
          lines={reading.lines}
          lineMarks={reading.lineMarks}
          highlight={reading.highlight}
          ask={reading.ask}
          askMarks={reading.askMarks}
          text={layout.text}
          closeLabel={readingLine('noteClose')}
          onClose={onCloseNote}
        />
      ) : null}
      {reading && surface === 'cards' ? (
        <ReadingChoices
          box={readingBox}
          ask={reading.ask}
          askMarks={reading.askMarks}
          text={layout.text}
          groupLabel={readingLine('cards')}
          options={reading.options}
          accepting={reading.accepting && !view.saving}
          onChoose={onChoose}
          noteLabel={readingLine('noteOpen')}
          onOpenNote={onOpenNote}
        />
      ) : null}
      {reading && !reading.open && surface !== 'cards' ? <NoteButton box={noteButtonBox(layout, context)} label={readingLine('noteOpen')} onPress={onOpenNote} /> : null}
      {logAvailable && view.logOpen ? <EngineerLog box={cabin} rows={logRows} onClose={onCloseLog} onReplay={onReplay} /> : null}
      {directoryShownNow && !(plateUnderCard && (card || (reading && (surface === 'note' || surface === 'cards')))) ? (
        <DirectoryButton
          box={layout.directory}
          floor={elevator.floor}
          name={landing.name}
          hint={view.directoryHint}
          still={view.motion === 'reduced'}
          open={directoryOpen}
          disabled={!directoryAvailable}
          text={layout.text}
          onPress={directoryOpen ? closeDirectory : openDirectory}
        />
      ) : null}
      {directoryAvailable && directoryOpen ? <DirectorySheet box={directorySheetBox(layout)} rows={directory} current={elevator.floor} text={layout.text} onClose={closeDirectory} /> : null}
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
        {...(onStartOver ? { onStartOver } : {})}
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
  cabinIcons: {
    position: 'absolute',
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
