import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, AppState, BackHandler, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { osPrefersReducedMotion } from '../../platform/osMotion';
import type { Adventure } from './appContent';
import { WORDS as W, line } from './copy';
import { createKingdomDirector, type KingdomDirector, type KingdomPlace, type KingdomView } from './director/kingdom';
import { createKingdomAudio } from './narration';
import { DEFAULT_KINGDOM_LEARNER, openKingdomServices } from './services';
import { DragToken, type DropZone } from './ui/DragToken';
import { EarButton, HelpButton } from './ui/GameControls';
import { sayOrAtFirstTouch } from './director/gift';
import { restoreComfort } from './director/restore';
import { bridgeGoal, createAdventureVoice, type AdventureVoice, type AdventureVoiceView } from './director/bridge';
import { MagicIcon, type IconKind } from './ui/MagicArt';
import { MagicalPressable as Pressable } from './ui/MagicalPressable';
import { magic as P } from './ui/palette';
import { Princess } from './ui/Princess';
import { WardrobeScreen } from './ui/WardrobeScreen';
import type { GameRuntime } from '../../runtime/gameRuntime';
import { WORD_GARDEN } from './wordGarden/content';
import { SLOW_VOICE } from './audio/recorded';
import { ChoiceGameScreen } from './games/ChoiceGameScreen';
import { CHOICE_GAMES, QUEST, label as choiceLabel, type PlayId } from './games/choiceContent';
import { GAMES, type GameId } from './games/content';
import type { GameAudio } from './games/flow';
import { GamesRoom, ROOM_GAMES, gameTitle, isLetterGame, type RoomGame } from './games/GamesRoom';
import { LetterGameScreen } from './games/LetterGameScreen';
import { CrownGate } from './ui/CrownGate';
import { useHeldTaps } from './games/ListeningBadge';
import { playableByEar } from './games/playable';
import { launchParams } from '../../platform/launchParams';
import { GiftDialog } from './ui/GiftDialog';
import { WordGardenScreen } from './wordGarden/WordGardenScreen';
import { DEFAULT_LOOK, EMPTY_PROGRESS, WARDROBE, readRoyalCompletions, unlockedItems } from './wardrobe';

const ART = {
  castle: require('../../../assets/themes/magical-kingdom/castle.png'),
  ice: require('../../../assets/themes/magical-kingdom/ice.png'),
  garden: require('../../../assets/themes/magical-kingdom/garden.png'),
  princess: require('../../../assets/themes/magical-kingdom/princess-concept.png'),
};
const noopSubscribe = () => () => {};
/** Where the child is outside the director's rooms: the castle hall, the games room ('games') or a game. The director keeps it in `kingdom.place`. */
type Place = KingdomPlace;
/** Every game the room offers, the quest included. */
const PLAYS: readonly RoomGame[] = ['quest', ...ROOM_GAMES];
/** Browser development only (?ear=off, read through the platform's launch parameters; native has none): offer every game even without its narration. */
const EAR_CHECK = launchParams().ear !== 'off';
const backdropOf = (p: RoomGame): keyof typeof ART => (p === 'quest' ? QUEST.backdrop : isLetterGame(p) ? GAMES.games[p].backdrop : CHOICE_GAMES.games[p].backdrop);
const WAITING: KingdomView = { ready: false, room: 'castle', busy: false, error: false, activity: null, solved: false, placements: [], letter: null, notice: null, hint: null, rewards: [], outfit: 'lavender', target: 5, word: 'sun', initial: 0, stage: 1, stages: 1, canContinue: false, look: DEFAULT_LOOK, progress: EMPTY_PROGRESS, unlocked: unlockedItems(EMPTY_PROGRESS), newGifts: [] };

export function KingdomApp({ onExit, learnerId = DEFAULT_KINGDOM_LEARNER }: { onExit?: () => void; learnerId?: string }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [director, setDirector] = useState<KingdomDirector | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const [reduced, setReduced] = useState(true); // Safe until the system preference resolves.
  // The learner's Comfort settings and saved place are applied (director/restore.ts). Until then nothing shows or sounds.
  const [restored, setRestored] = useState(false);
  const [foreground, setForeground] = useState(true);
  const [dialog, setDialog] = useState<'comfort' | 'dress' | 'restart' | null>(null);
  const [sparkle, setSparkle] = useState(0);
  // The garden door opens the Word Garden (wordGarden/): its own mission, over the director's castle.
  const [words, setWords] = useState(false);
  const [runtime, setRuntime] = useState<GameRuntime | null>(null);
  // The games room and the royal games: outside the director, over the castle hall.
  const [place, setPlace] = useState<Place>('castle');
  const [slowVoice, setSlowVoice] = useState(true);
  const [guideH, setGuideH] = useState(92);
  const v = useSyncExternalStore(director?.subscribe ?? noopSubscribe, director?.view ?? (() => WAITING), () => WAITING);
  const effects = useRef<ReturnType<typeof createKingdomAudio> | null>(null);
  const hush = useCallback(() => effects.current?.hush(), []);
  // With Sound off a tap on a dimmed game makes the crown answer: it is the grown-up's door, and only they can turn sound on.
  const crownCall = useHeldTaps();
  const say = useCallback((text: string) => { if (!quiet && foreground) effects.current?.speak(text); }, [quiet, foreground]);
  const still = reduced || !foreground;
  const previous = useRef(v);
  // Which royal games a pre-reader can follow by ear (every essential clip recorded); the games room dims the rest.
  const [byEar, setByEar] = useState<ReadonlySet<RoomGame> | null>(null);
  useEffect(() => {
    const audio=createKingdomAudio(); effects.current=audio; let live=true;
    void Promise.resolve().then(() => { if (live) setByEar(new Set(PLAYS.filter((id) => playableByEar(id, audio)))); });
    return()=>{live=false;audio.release();effects.current=null;};
  }, []);
  // What a royal game, and the Word Garden, needs from the castle's audio (the shape games/flow.ts gameAudioFrom gives). `say` passes the
  // player's end report straight through; with no audio yet it reports at once that nothing played.
  const gameAudio = useMemo<GameAudio>(() => ({
    say: (keys, gapMs, onEnd) => { const a = effects.current; if (a) a.sequence(keys, gapMs, onEnd); else onEnd?.(false); },
    effect: (name) => { effects.current?.play(name); },
    hush: () => { effects.current?.hush(); },
    busy: () => effects.current?.busy() ?? false,
    has: (key) => effects.current?.has(key) ?? false,
    whenReady: (fn) => effects.current?.whenReady(fn),
    // Whether sound can play now (the switch and the first touch): a game played by ear takes no answer while it cannot (D212).
    canSound: () => effects.current?.canSound() ?? false,
  }), []);
  const live = v.ready && restored;
  useEffect(() => { effects.current?.setEnabled(live && !quiet && foreground); }, [live,quiet,foreground]);
  useEffect(() => { effects.current?.setVoiceRate(slowVoice ? SLOW_VOICE : 1); }, [slowVoice]);
  useEffect(() => {
    const old=previous.current;
    // Back in the hall: quiet. An adventure room speaks for itself (AdventureScreen, director/bridge.ts).
    if(v.room!==old.room && v.room==='castle') effects.current?.hush();
    previous.current=v;
  },[v]);

  useEffect(() => {
    let stopped = false;
    let active: KingdomDirector | null = null;
    void openKingdomServices().then(async ({ runtime, db }) => {
      const d = createKingdomDirector(runtime, learnerId, () => Date.now(), (base) => readRoyalCompletions(db, base)); active = d; setRuntime(runtime);
      if (stopped) { d.dispose(); return; }
      setDirector(d); await d.start();
      const current = (await runtime.settings(learnerId))['kingdom.current'] ?? learnerId;
      const settings = await runtime.settings(current);
      const os = await osPrefersReducedMotion();
      if (!stopped) {
        const comfort = restoreComfort(settings, os);
        setReduced(comfort.still); setQuiet(comfort.quiet); setSlowVoice(comfort.slowVoice);
        // Back to the games room or the game the child was in, unless the director reopened one of its own rooms.
        if (d.view().room === 'castle') setPlace(d.where());
        // Only now does anything show or sound: Quiet, motion, the voice and the place are applied together.
        setRestored(true);
      }
    }).catch(() => { if (!stopped) setLoadError(true); });
    return () => { stopped = true; if (active) void active.flush().catch(() => undefined).finally(() => active?.dispose()); void hush(); };
  }, [learnerId, attempt, hush]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state !== 'active') { effects.current?.setEnabled(false); void director?.flush().catch(() => undefined); }
    });
    return () => subscription.remove();
  }, [director]);
  // Moving between the hall, the games room and a game. The director remembers the place (never evidence); leaving a game reads the gifts again.
  const go = useCallback((next: Place) => {
    setPlace(next);
    director?.go(next);
    if (next === 'games' || next === 'castle') void director?.refreshGifts();
  }, [director]);
  useEffect(() => {
    const s = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dialog) { setDialog(null); return true; }
      if (place !== 'castle') { go(place === 'games' ? 'castle' : 'games'); return true; }
      if (words) { setWords(false); void director?.home(); return true; }
      if (v.room !== 'castle') { void director?.home(); return true; }
      if (onExit) { void director?.flush().then(onExit).catch(() => undefined); return true; }
      return false;
    });
    return () => s.remove();
  }, [dialog, words, v.room, director, onExit, place, go]);
  const settings = async (key: string, value: string) => {
    try {
      const { runtime } = await openKingdomServices();
      const id = (await runtime.settings(learnerId))['kingdom.current'] ?? learnerId;
      await runtime.putSetting(id, `kingdom.${key}`, value);
    } catch { setLoadError(true); }
  };
  const home = () => { void hush(); void director?.home(); };
  const inGame = place !== 'castle' && place !== 'games';
  const enter = (room: Adventure) => { if (room === 'garden') setWords(true); else void director?.enter(room); };
  const leaveWords = () => { setWords(false); void hush(); void director?.home(); };
  const room = words ? 'garden' : v.room;
  const backdrop: keyof typeof ART = words ? 'garden' : inGame ? backdropOf(place) : place === 'games' ? 'castle' : v.room;
  const giftOpen = live && v.newGifts.length > 0 && !dialog && !inGame && !words && v.room === 'castle';
  const gifts = v.newGifts.join(' ');
  const sayGift = useCallback(() => { if (!quiet && foreground) effects.current?.sequence(['effect:gift', `voice:${WARDROBE.copy.newGift}`], 250); }, [quiet, foreground]);
  // "A royal gift for you!" is said when the dialog appears, and never over a game (the dialog waits for the room).
  // After a reload with the dialog open the browser's sound waits for a first touch: the line is said at that touch if the dialog is still open (director/gift.ts).
  useEffect(() => {
    const a = effects.current;
    if (!giftOpen || !gifts || quiet || !foreground || !a) return;
    let open = true;
    const cancel = sayOrAtFirstTouch(a, ['effect:gift', `voice:${WARDROBE.copy.newGift}`], 250, () => open);
    return () => { open = false; cancel(); };
  }, [giftOpen, gifts, quiet, foreground]);
  const retry = () => { if (loadError) { setLoadError(false); setAttempt((n) => n + 1); } else void director?.retry(); };
  const portrait = height > width;
  const frozen = v.busy || v.error || loadError;
  const modalOpen = !!dialog || giftOpen || v.error || loadError;
  const headerTop = Math.max(12, insets.top) + 84;
  const title = words ? WORD_GARDEN.labels.title : inGame ? gameTitle(place) : place === 'games' ? W.games : v.room === 'castle' ? W.subtitle : W[v.room];
  const castleHall = !words && v.room === 'castle' && place === 'castle';

  return <View testID="kingdom-screen" nativeID="kingdom-v01-prototype-marker" style={s.root}>
    <Image source={ART[backdrop]} style={{ position: 'absolute', left: 0, top: 0, width, height }} resizeMode="cover" blurRadius={castleHall && portrait ? 9 : !castleHall && room === 'castle' ? 4 : 0} accessible={false} />
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: castleHall && portrait ? P.veil : P.transparent }]} />
    {live && !loadError ? <View style={StyleSheet.absoluteFill} aria-hidden={modalOpen} accessibilityElementsHidden={modalOpen} importantForAccessibility={modalOpen ? 'no-hide-descendants' : 'auto'}>
      <View style={[s.header, { paddingTop: Math.max(12, insets.top), paddingHorizontal: Math.max(18, insets.left + 12) }]}>
        {inGame ? <IconButton testID="game-room" label={choiceLabel('done')} kind="arrow" flip onPress={() => go('games')} />
          : place === 'games' ? <IconButton testID="games-home" label={W.home} kind="home" onPress={() => go('castle')} />
            : <IconButton label={room === 'castle' ? W.exit : W.home} kind="home" onPress={words ? leaveWords : v.room === 'castle' ? () => { void director?.flush().then(() => onExit?.()).catch(() => undefined); } : home} disabled={frozen} />}
        <View style={s.headerText}><Text style={s.overline} numberOfLines={1}>{castleHall ? W.title : W.subtitle}</Text><Text accessibilityRole="header" numberOfLines={1} style={[s.heading, { fontSize: width < 480 ? 22 : portrait ? 25 : 30 }]}>{title}</Text></View>
        <CrownGate label={W.crownHold} still={still} called={crownCall.heard} onOpen={() => setDialog('comfort')} />
      </View>
      {inGame && runtime && director ? (isLetterGame(place)
        ? <LetterGameScreen key={place} runtime={runtime} learnerId={director.learner()} game={place as GameId} audio={gameAudio} still={still} width={width} height={height} top={headerTop} bottom={insets.bottom} onExit={() => go('games')} />
        : <ChoiceGameScreen key={place} runtime={runtime} learnerId={director.learner()} play={place as PlayId} audio={gameAudio} still={still} width={width} height={height} top={headerTop} bottom={insets.bottom} look={v.look} onExit={() => go('games')} />)
      : place === 'games' && !words ? <GamesRoom playable={(id) => !EAR_CHECK || (byEar?.has(id) ?? false)} width={width} height={height} top={headerTop} bottom={insets.bottom} onPlay={(id) => { void hush(); go(id); }} onBlocked={crownCall.onLocked} />
      : words && runtime ? <WordGardenScreen runtime={runtime} learnerId={director?.learner() ?? learnerId} audio={gameAudio} still={still} width={width} height={height} top={headerTop} bottom={insets.bottom} onExit={leaveWords} /> : v.room === 'castle' ? <>
        <Castle width={width} height={height} v={v} still={still} enter={enter} dress={() => { setDialog('dress'); say(W.hat); }} react={() => { setSparkle((n) => n + 1); say(W.guide); }} sparkle={sparkle} frozen={frozen} floor={height - (Math.max(24, insets.bottom + 14) + guideH + 14) - GAMES_H - 10} />
        <RoyalGamesButton label={W.games} bottom={Math.max(24, insets.bottom + 14) + guideH + 14} disabled={v.error || loadError} onPress={() => { void hush(); go('games'); }} />
        <View onLayout={(e) => setGuideH(Math.round(e.nativeEvent.layout.height))} style={[s.guide, { bottom: Math.max(24, insets.bottom + 14), width: Math.min(width - 32, 670) }]}>
          <MagicIcon kind="star" size={64} /><View style={{ flex: 1 }}><Text style={s.guideTitle}>{W.guide}</Text><Text style={s.guideSub}>{W.welcome}</Text></View>
          <IconButton small label={W.listen} kind={quiet ? 'mute' : 'sound'} onPress={() => say(W.guide)} />
        </View>
      </> : <AdventureScreen v={v} director={director!} audio={gameAudio} width={width} height={height} still={still} home={home} frozen={frozen} inset={insets.bottom} />}
    </View> : <View style={s.center}><MagicIcon kind="star" size={90} /><Text style={s.heading}>{W.loading}</Text></View>}
    {(v.error || loadError) ? <View style={[s.scrim,{zIndex:100}]} accessibilityViewIsModal><View style={s.dialog}><Text style={s.guideTitle}>{W.saveError}</Text><Button text={W.retrySave} onPress={retry} /></View></View> : null}
    {dialog === 'dress' && director ? <WardrobeScreen v={v} director={director} width={width} height={height} still={still} close={() => setDialog(null)} say={say}/> : null}
    {giftOpen ? <GiftDialog gifts={v.newGifts} still={still} width={width} hearLabel={W.hearGift} onHear={sayGift} onOpen={() => { void hush(); director?.dismissGifts(); setDialog('dress'); }} onKeep={() => { void hush(); director?.dismissGifts(); }} /> : null}
    {dialog && dialog !== 'dress' ? <View style={s.scrim} accessibilityViewIsModal><View style={s.dialog}>
      <MagicIcon kind="crown" size={66} />
      <Text style={s.heading}>{dialog === 'restart' ? W.restart : W.settings}</Text>
      {dialog === 'comfort' ? <>
        <Button text={quiet ? W.sound : W.quiet} icon={quiet ? 'sound' : 'mute'} onPress={() => { const next = !quiet; if(next)effects.current?.setEnabled(false); setQuiet(next); void settings('quiet', String(next)); }} />
        <Button text={reduced ? W.motion : W.still} onPress={() => { const next = !reduced; setReduced(next); void settings('motion', next ? 'still' : 'gentle'); }} />
        <Button testID="comfort-voice" text={slowVoice ? W.voiceUsual : W.voiceSlow} icon="ear" onPress={() => { const next = !slowVoice; setSlowVoice(next); void settings('voice', next ? 'slow' : 'usual'); }} />
        <Button text={W.restart} secondary onPress={() => setDialog('restart')} />
      </> : null}
      {dialog === 'restart' ? <><Text style={s.guideSub}>{W.restartQuestion}</Text><Button text={W.confirmRestart} onPress={() => { void director?.restart().then(() => { setDialog(null); void hush(); }); }} disabled={frozen} /><Button text={W.cancel} secondary onPress={() => setDialog('comfort')} /></> : <Button text={W.close} secondary onPress={() => setDialog(null)} />}
    </View></View> : null}
  </View>;
}

/** The Royal Games button's height (styles.games minHeight): the castle keeps the princess clear of it. */
const GAMES_H = 80;
/** The widest the Royal Games button gets (art, the words, the star): half of it either side of the middle. */
const GAMES_HALF = 160;

/**
 * The castle hall. `floor` is the top of the Royal Games button: where the princess and her name would sit
 * under it (a narrow window), she is made smaller and lifted so it never covers her.
 */
function Castle({ width, height, v, still, enter, dress, react, sparkle, frozen, floor }: { width: number; height: number; v: KingdomView; still: boolean; enter: (room: Adventure) => void; dress: () => void; react: () => void; sparkle: number; frozen: boolean; floor: number }) {
  const portrait = height > width;
  const artWidth = portrait ? width : Math.max(width, height * 1.5);
  const artHeight = artWidth / 1.5;
  const left = (width - artWidth) / 2;
  const top = portrait ? Math.max(165, (height - artHeight) / 2 - 15) : (height - artHeight) / 2;
  const narrow = width < 560;
  // The princess, and whether the games button would cover her: then she stands above it with her name under her feet.
  const pLeft = Math.max(8, width * 0.07);
  const base = Math.min(portrait ? 235 : 245, height * 0.32);
  const NAME_H = 34;
  const clash = pLeft + base * 0.76 > width / 2 - GAMES_HALF;
  // Never over the door labels (they end about 0.59 of the art down, plus the label's overhang).
  const labelsEnd = top + artHeight * 0.59 + 24;
  // No room for her name under her (the header already names her): it is left out, and she gets that space.
  const named = !clash || floor - Math.max(labelsEnd, top + artHeight * 0.6) >= 110 + NAME_H;
  const room = named ? NAME_H : 0;
  const pSize = clash ? Math.max(96, Math.min(base, floor - room - Math.max(labelsEnd, top + artHeight * 0.6))) : base;
  const pTop = clash ? Math.max(labelsEnd, Math.min(top + artHeight * 0.6, floor - room - pSize)) : top + artHeight * 0.6;
  // Door labels stay on one line: as wide as the words need, centred under the door, never wider than the gap to the next door.
  const doorW = artWidth * 0.164;
  const labelW = Math.min(artWidth * 0.247 - 6, Math.max(doorW, portrait ? 120 : 196));
  // A phone-narrow portrait window has no room for one line: the label may take two, never cut short.
  const doorLines = narrow ? 2 : 1;
  const doorFont = narrow ? 14 : portrait ? 15 : width < 1100 ? 17 : 19;
  const doors = [{ kind: 'crystal', name: W.iceDoor, action: () => enter('ice'), room: 'ice' }, { kind: 'flower', name: W.gardenDoor, action: () => enter('garden'), room: 'garden' }, { kind: 'crown', name: W.wardrobeDoor, action: dress, room: 'dress' }] as const;
  return <>
    {portrait ? <Image source={ART.castle} style={{ position: 'absolute', left, top, width: artWidth, height: artHeight }} resizeMode="contain" accessible={false} /> : null}
    {/* In a narrow window the hall's name sits under the reward ribbon, not beside it. */}
    <Text testID="hall-label" style={[s.hallLabel, { top: narrow ? 152 : portrait ? 124 : 108 }]} numberOfLines={1}>{W.castle}</Text>
    {doors.map((door, i) => <Pressable key={door.room} testID={`door-${door.room}`} accessibilityRole="button" accessibilityLabel={door.name} disabled={frozen} onPress={door.action} style={({ pressed }) => [s.door, { left: left + artWidth * (0.19 + i * 0.247), top: top + artHeight * 0.24, width: artWidth * 0.164, height: artHeight * 0.35 }, pressed && s.pressed]}>
      <View style={s.doorSeal}><MagicIcon kind={door.kind} size={portrait ? 44 : 62} /></View>
      <View style={[s.doorLabel, { width: labelW, left: (doorW - labelW) / 2 }, narrow && { paddingHorizontal: 4 }]}><Text testID={`door-label-${door.room}`} numberOfLines={doorLines} style={[s.doorText, { fontSize: doorFont }]}>{door.name}{narrow ? (v.rewards.includes(door.room as Adventure) ? ' ✓' : '') : v.rewards.includes(door.room as Adventure) ? ' ✓' : ' →'}</Text></View>
    </Pressable>)}
    <View testID="hall-princess" pointerEvents="none" style={{ position: 'absolute', left: pLeft, top: pTop }}><Princess size={pSize} still={still} celebration={false} look={v.look} /></View>
    {named ? <View pointerEvents="none" style={[s.characterName, clash ? { left: pLeft, top: pTop + pSize + 2 } : { left: width * 0.06, bottom: portrait ? 158 : 136 }]}><Text style={s.nameText}>{W.character}</Text></View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={W.sparkle} onPress={react} style={[s.playObject, { right: width * 0.12, top: top + artHeight * 0.65 }]}><MagicIcon kind="star" color={sparkle % 2 ? P.turquoise : P.gold} size={sparkle % 2 ? 88 : 72} /></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={W.flowers} onPress={react} style={[s.playObject, { right: width * 0.26, top: top + artHeight * 0.76 }]}><MagicIcon kind="flower" size={sparkle % 2 ? 70 : 64} /></Pressable>
    <View testID="hall-ribbon" style={[s.rewardRibbon, narrow && { right: 12 }]} accessibilityLabel={`${W.magic}: ${v.rewards.length}`}><MagicIcon kind="crystal" size={26} /><Text style={s.rewardText}>{v.rewards.includes('ice') ? '✓' : '○'}</Text><MagicIcon kind="flower" size={26} /><Text style={s.rewardText}>{v.rewards.includes('garden') ? '✓' : '○'}</Text></View>
  </>;
}

/**
 * The castle's adventure rooms (the Ice Palace bridge, and the old letter garden). The director keeps the
 * evidence; the room speaks through the royal games' voice (director/bridge.ts): the first ask holds the
 * crystals, Help and MAKE MAGIC; the ear and a reminder in the quiet say the instruction again; each crystal
 * placed is counted aloud once the numbers are recorded.
 */
function AdventureScreen({ v, director, audio, width, height, still, home, frozen, inset }: { v: KingdomView; director: KingdomDirector; audio: GameAudio; width: number; height: number; still: boolean; home: () => void; frozen: boolean; inset: number }) {
  const ice = v.room === 'ice';
  const count = v.target - v.initial;
  const word = v.word;
  const option = v.activity?.options.find((o) => o.id === v.letter);
  const zoneRef = useRef<View>(null);
  const zone = useRef<DropZone | null>(null);
  const measure = () => zoneRef.current?.measureInWindow((x, y, width, height) => { zone.current = { x, y, width, height }; });
  const goal = ice ? bridgeGoal(v.target, v.initial) : line(W.gardenInstruction, { word });
  const intro = ice ? W.iceIntro : W.gardenIntro;
  const success = ice ? W.iceSuccess : W.gardenSuccess;
  const hint = v.hint ? (ice ? { clue: W.iceClue, guided: W.iceGuided, show: W.iceShown } : { clue: W.gardenClue, guided: W.gardenGuided, show: W.gardenShown })[v.hint] : null;
  const wide = width >= 850;
  // The bridge sits above the tray: in a narrow window it wraps onto two rows and is lifted so the tray never covers a socket.
  const bridgeW = Math.min(width - 36, wide ? v.target * 72 + 24 : Math.min(404, v.target * 72 + 24));
  const perRow = Math.max(1, Math.floor((bridgeW - 24 + 8) / 72));
  const bridgeH = Math.ceil(v.target / perRow) * 72 - 8 + 30;
  const trayW = Math.min(width - 24, wide || !ice ? 820 : 408);
  const trayH = ice ? Math.ceil(count / Math.max(1, Math.floor((trayW - 20 + 8) / 76))) * 84 + 8 : 92;
  const bridgeTop = Math.max(height > width ? 270 : 230, Math.min(height * 0.44, height - (142 + inset) - trayH - bridgeH - 14));
  useEffect(() => { const t = setTimeout(measure, 80); return () => clearTimeout(t); }, [width, height, ice]);
  const [voice, setVoice] = useState<AdventureVoice | null>(null);
  useEffect(() => {
    const room = createAdventureVoice({ audio, open: () => { const x = director.view(); return x.room !== 'castle' && !!x.activity && !x.solved && !x.error; } });
    let live = true;
    void Promise.resolve().then(() => { if (live) setVoice(room); });
    return () => { live = false; room.dispose(); };
  }, [audio, director]);
  const heard = useSyncExternalStore(voice?.subscribe ?? noopSubscribe, voice?.view ?? quietVoice, quietVoice);
  const listening = heard.listening;
  // What the room says as the view changes: the ask of a new bridge, success, try again, and each crystal's number.
  const before = useRef<KingdomView | null>(null);
  useEffect(() => {
    if (!voice) return;
    const old = before.current;
    before.current = v;
    const item = v.activity?.itemSignature ?? null;
    if (!v.solved && item && item !== (old?.activity?.itemSignature ?? null)) { voice.ask(item, old ? [goal] : [intro, goal]); return; }
    if (!old) return;
    if (v.solved && !old.solved) { voice.say([success]); return; }
    if (v.notice && v.notice !== old.notice) { voice.retry([v.notice, goal]); return; }
    if (ice) {
      const change = v.placements.length - old.placements.length;
      if (change === 1) voice.placed(v.placements.length);
      else if (change === -1) voice.removed(v.placements.length);
    } else if (v.letter !== old.letter) voice.chime(v.letter ? 'place' : 'remove');
  }, [v, voice, goal, intro, success, ice]);
    const helpText = (h: KingdomView['hint']) => (ice ? (h === 'show' ? W.iceShown : h === 'guided' ? W.iceGuided : W.iceClue) : (h === 'show' ? W.gardenShown : h === 'guided' ? W.gardenGuided : W.gardenClue));
  return <>
    <View style={[s.objective, { top: height > width ? 119 : 106, width: Math.min(width - 32, 650) }]}>
      {ice ? <View style={s.numberSeal}><Text testID="bridge-goal" style={s.number}>{count}</Text></View> : <MagicIcon kind={word as IconKind} size={62} />}
      <View style={{ flex: 1 }}>
        <Text style={s.objectiveTitle}>{v.stages > 1 ? line(W.stage, { stage: v.stage, stages: v.stages }) : v.solved ? success : intro}</Text>
        <Text testID="activity-instruction" style={s.objectiveText}>{v.solved ? (ice ? W.iceSuccessSub : W.gardenSuccessSub) : goal}</Text>
        {listening && !v.solved ? <View testID="bridge-listening" style={s.listening}><MagicIcon kind="ear" size={18} />{width >= 480 ? <Text style={s.listeningText}>{W.listening}</Text> : null}</View> : null}
      </View>
      <EarButton testID="bridge-hear" glowTestID="bridge-ear-glow" label={W.listen} glow={(listening || heard.nudge) && !v.solved} still={still} size={64} onPress={() => { if (v.solved) voice?.say([success]); else voice?.hear(); }} />
    </View>
    {ice ? <>
      <View ref={zoneRef} onLayout={measure} testID="bridge-dropzone" accessibilityLabel={line(W.loaded, { count: v.placements.length })} style={[s.bridge, { top: bridgeTop, width: bridgeW }]}>
        <View style={s.sockets}>{Array.from({ length: v.target }, (_, i) => {
          const token = v.placements[i - v.initial];
          const lit = i < v.initial || token !== undefined || v.solved;
          return <Pressable key={i} testID={`socket-${i}`} accessibilityRole="button" accessibilityLabel={token !== undefined ? line(W.remove, { index: i + 1 }) : line(W.socket, { index: i + 1 })} locked={listening} disabled={frozen || v.solved || token === undefined} onPress={() => token !== undefined && director.remove(token)} style={[s.socket, lit && s.litSocket]}>
            {lit ? <MagicIcon kind="crystal" size={44} /> : <View style={[s.socketLight, v.hint === 'guided' && i < count && s.guideLight]} />}
          </Pressable>;
        })}</View>
      </View>
      <FoxCrossing solved={v.solved} still={still} width={width} top={bridgeTop} />
    </> : <View ref={zoneRef} onLayout={measure} testID="flower-dropzone" style={[s.flowerZone, { top: height * 0.36, height: height < 700 ? 150 : 205, width: Math.min(width - 36, 650) }]}>
      <View style={s.picture}><MagicIcon kind={word as IconKind} size={96} /><Text style={s.word}>{word.toUpperCase()}</Text></View>
      <Bloom solved={v.solved} still={still} />
      <Pressable accessibilityRole="button" accessibilityLabel={W.removeLetter} locked={listening} disabled={v.solved || frozen || !v.letter} onPress={() => v.letter && director.plant(v.letter)} style={s.seed}><Text testID="planted-letter" style={s.seedLetter}>{v.solved ? '✓' : String(option?.value ?? W.emptyLetter).toUpperCase()}</Text></Pressable>
      {v.hint === 'guided' || v.hint === 'show' ? <View style={s.letterHint}><Text style={s.seedLetter}>{String(v.activity?.scaffolds.revealedValue ?? word[0]).toUpperCase()}</Text></View> : null}
    </View>}
    {!v.solved ? <>
      <View style={[s.tray, { bottom: 142 + inset, width: trayW, minHeight: trayH }]}>
        {/* While the room is saying the ask the pieces wait: a tap or a drop does nothing, and only their pictures fade. */}
        <View style={s.tokens}>{ice ? Array.from({ length: count }, (_, i) => <DragToken key={i} testID={`crystal-${i}`} label={line(W.load, { index: i + 1 })} disabled={frozen || v.placements.includes(i)} target={() => zone.current} onPlace={() => { if (!listening) director.place(i); }}><View style={listening ? s.waiting : null}><MagicIcon kind="crystal" size={48} /></View></DragToken>) : v.activity?.options.map((o) => <DragToken key={o.id} testID={`letter-${String(o.value)}`} label={line(W.letter, { letter: String(o.value).toUpperCase() })} disabled={frozen} selected={v.letter === o.id} target={() => zone.current} onPlace={() => { if (!listening) director.plant(o.id); }}><Text style={[s.tileLetter, listening && s.waiting]}>{String(o.value).toUpperCase()}</Text></DragToken>)}</View>
      </View>
      <View style={[s.feedback, { bottom: 98 + inset }]}>{v.notice ?? hint ? <Text accessibilityLiveRegion="polite" style={s.feedbackText}>{v.notice ?? hint}</Text> : ice ? <GestureHint /> : <Text accessibilityLiveRegion="polite" style={s.feedbackText}>{W.gardenGesture}</Text>}</View>
      <View style={[s.footer, { bottom: Math.max(24, inset + 12) }]}>
        <HelpButton testID="adventure-help" label={v.activity?.scaffolds.available[0]?.assistance === 'demonstrated' ? W.showMe : W.help} width={width < 420 ? 76 : 200} locked={listening} disabled={frozen || !v.activity?.scaffolds.available.length} onPress={() => { voice?.touch(); void director.help().then(() => { const h = director.view().hint; if (h) voice?.say([helpText(h)]); }); }} />
        {/* MAKE MAGIC: the check, "this is my answer". The smiling star means "choose" in the royal games. */}
        <Button testID="make-magic" text={W.check} icon="check" locked={listening} disabled={frozen || (!ice && !v.letter)} onPress={() => { voice?.touch(); void director.submit(); }} />
      </View>
    </> : <>
      <View style={[s.successPrincess, { right: width * 0.08, bottom: 130 }]}><Princess still={still} celebration look={v.look} size={Math.min(220, height * 0.27)} /></View>
      <View style={[s.footer, { bottom: Math.max(24, inset + 12) }]}><Button testID="adventure-next" text={v.canContinue ? (ice ? W.nextIce : W.nextGarden) : W.return} icon={v.canContinue ? 'arrow' : 'home'} onPress={v.canContinue ? () => void director.next() : home} disabled={frozen} /></View>
    </>}
  </>;
}

/** How to play the bridge, as pictures: a crystal goes up onto the bridge; a crystal on the bridge comes back down. */
function GestureHint() {
  return <View testID="bridge-gesture" accessible accessibilityLabel={W.iceGesture} style={s.gesture}>
    <View style={s.gestureStep} accessibilityLabel={W.iceTapHint}>
      <View style={s.gestureToken}><MagicIcon kind="crystal" size={30} /></View>
      <View style={s.up}><MagicIcon kind="arrow" size={26} color={P.deep} /></View>
      <View style={[s.gestureSocket, s.litSocket]}><MagicIcon kind="crystal" size={26} /></View>
    </View>
    <View style={s.gestureRule} />
    <View style={s.gestureStep} accessibilityLabel={W.iceBackHint}>
      <View style={[s.gestureSocket, s.litSocket]}><MagicIcon kind="crystal" size={26} /></View>
      <View style={s.down}><MagicIcon kind="arrow" size={26} color={P.deep} /></View>
      <View style={s.gestureToken}><MagicIcon kind="crystal" size={30} /></View>
    </View>
  </View>;
}
const quietVoice = (): AdventureVoiceView => QUIET_VOICE;
const QUIET_VOICE: AdventureVoiceView = { listening: false, nudge: false };

function FoxCrossing({ solved, still, width, top }: { solved: boolean; still: boolean; width: number; top: number }) {
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => { const a = Animated.timing(x, { toValue: solved ? Math.min(width - 140, 690) : 0, duration: still ? 0 : 2100, useNativeDriver: true }); a.start(); return () => a.stop(); }, [solved, still, width, x]);
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', left: width > 850 ? (width - 800) / 2 : 24, top: top - 67, transform: [{ translateX: x }] }}><MagicIcon kind="fox" size={72} /></Animated.View>;
}
function Bloom({ solved, still }: { solved: boolean; still: boolean }) {
  const [scale] = useState(() => new Animated.Value(0.65));
  useEffect(() => { const a = Animated.timing(scale, { toValue: solved ? 1.45 : 0.65, duration: still ? 0 : 1300, useNativeDriver: true }); a.start(); return () => a.stop(); }, [solved, still, scale]);
  return <Animated.View pointerEvents="none" style={{ transform: [{ scale }] }}><MagicIcon kind="flower" size={145} /></Animated.View>;
}
function IconButton({ label, kind, onPress, disabled = false, small = false, flip = false, testID }: { label: string; kind: IconKind; onPress: () => void; disabled?: boolean; small?: boolean; flip?: boolean; testID?: string }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={({ pressed }) => [s.iconButton, small && s.smallIcon, pressed && s.pressed, disabled && s.disabled]}><View style={flip ? s.flip : null}><MagicIcon kind={kind} size={small ? 30 : 36} color={kind === 'arrow' ? P.deep : undefined} /></View></Pressable>;
}
/** The castle hall's door to the games room, sitting just above the guide (placed from the guide's measured height). */
function RoyalGamesButton({ label, bottom, disabled, onPress }: { label: string; bottom: number; disabled: boolean; onPress: () => void }) {
  return <Pressable testID="open-games" accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[s.games, { bottom }, disabled && s.disabled]}>
    <View style={s.gamesArt}><MagicIcon kind="quest" size={50} /></View>
    <Text style={s.gamesText} numberOfLines={1}>{label}</Text>
    <MagicIcon kind="star" size={40} />
  </Pressable>;
}
/** A big button: the picture leads, the word follows. `locked`: the room is talking (it shows its press and waits). Only its contents fade. */
function Button({ text, onPress, secondary = false, icon, disabled = false, locked = false, testID }: { text: string; onPress: () => void; secondary?: boolean; icon?: IconKind; disabled?: boolean; locked?: boolean; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={text} testID={testID} onPress={onPress} disabled={disabled} locked={locked} style={({ pressed }) => [s.button, secondary && s.secondary, pressed && s.pressed]}><View style={[s.buttonInside, disabled ? s.disabled : locked ? s.waiting : null]}>{icon ? <MagicIcon kind={icon} size={icon === 'check' || icon === 'arrow' ? 34 : 30} color={icon === 'check' || icon === 'arrow' ? (secondary ? P.deep : P.cream) : P.gold} /> : null}<Text style={[s.buttonText, secondary && s.secondaryText]}>{text}</Text></View></Pressable>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: P.lavender, overflow: 'hidden' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12, backgroundColor: P.cream, borderBottomWidth: 2, borderBottomColor: P.edge, zIndex: 20 },
  headerText: { flex: 1, alignItems: 'center' }, overline: { color: P.dim, fontSize: 13, fontWeight: '600', letterSpacing: 1.5 },
  heading: { color: P.ink, fontSize: 28, fontWeight: '700', fontFamily: 'Georgia', textAlign: 'center' },
  iconButton: { width: 64, height: 64, borderRadius: 24, borderWidth: 2, borderColor: P.edge, backgroundColor: P.paper, alignItems: 'center', justifyContent: 'center' }, smallIcon: { width: 64, height: 64 },
  hallLabel: { position: 'absolute', alignSelf: 'center', color: P.ink, fontSize: 16, fontWeight: '600', backgroundColor: P.cream, paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20 },
  door: { position: 'absolute', alignItems: 'center', justifyContent: 'flex-end', borderRadius: 60, borderWidth: 2, borderColor: P.cream },
  doorSeal: { position: 'absolute', top: '31%', backgroundColor: P.cream, borderRadius: 60, padding: 6, borderWidth: 2, borderColor: P.gold }, doorLabel: { position: 'absolute', bottom: -20, backgroundColor: P.paper, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 12, borderWidth: 2, borderColor: P.gold, minHeight: 48, justifyContent: 'center' }, doorText: { color: P.ink, textAlign: 'center', fontWeight: '800' },
  guide: { position: 'absolute', alignSelf: 'center', borderRadius: 30, backgroundColor: P.cream, borderWidth: 2, borderColor: P.gold, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, boxShadow: `0 6px 16px ${P.shadow}` }, guideTitle: { color: P.ink, fontSize: 20, fontWeight: '700' }, guideSub: { color: P.dim, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  playObject: { position: 'absolute', width: 90, height: 90, alignItems: 'center', justifyContent: 'center' },
  characterName: { position: 'absolute', backgroundColor: P.cream, borderWidth: 1, borderColor: P.gold, padding: 9, borderRadius: 15 }, nameText: { fontSize: 13, fontWeight: '700', color: P.ink },
  rewardRibbon: { position: 'absolute', top: 108, right: 20, backgroundColor: P.cream, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 5 }, rewardText: { fontSize: 17, color: P.deep, fontWeight: '800' },
  objective: { position: 'absolute', alignSelf: 'center', backgroundColor: P.paper, borderWidth: 2, borderColor: P.edge, borderRadius: 28, padding: 13, gap: 12, flexDirection: 'row', alignItems: 'center', boxShadow: `0 5px 16px ${P.shadow}` }, objectiveTitle: { fontSize: 22, lineHeight: 28, color: P.ink, fontWeight: '800' }, objectiveText: { fontSize: 18, lineHeight: 25, color: P.dim },
  numberSeal: { width: 62, height: 62, borderRadius: 24, backgroundColor: P.ice, alignItems: 'center', justifyContent: 'center' }, number: { fontSize: 46, fontWeight: '800', color: P.deep },
  bridge: { position: 'absolute', alignSelf: 'center', padding: 12, borderTopLeftRadius: 38, borderTopRightRadius: 38, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, borderWidth: 3, borderColor: P.white, backgroundColor: P.ice, boxShadow: `0 12px 0 ${P.crystal}` },
  sockets: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }, socket: { width: 64, height: 64, backgroundColor: P.white, borderWidth: 2, borderStyle: 'dashed', borderColor: P.crystal, borderRadius: 18, justifyContent: 'center', alignItems: 'center' }, litSocket: { backgroundColor: P.ice, borderStyle: 'solid', borderColor: P.deep }, socketLight: { width: 12, height: 12, borderRadius: 6, backgroundColor: P.edge }, guideLight: { width: 35, height: 35, backgroundColor: P.gold },
  tray: { position: 'absolute', alignSelf: 'center', backgroundColor: P.cream, borderColor: P.edge, borderWidth: 2, borderRadius: 28, padding: 8, boxShadow: `0 5px 14px ${P.shadow}` }, tokens: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  flowerZone: { position: 'absolute', alignSelf: 'center', borderRadius: 70, paddingHorizontal: 30, height: 205, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: P.veil }, picture: { width: 126, height: 145, borderRadius: 35, backgroundColor: P.paper, borderWidth: 2, borderColor: P.gold, alignItems: 'center', justifyContent: 'center' }, word: { color: P.ink, fontSize: 22, fontWeight: '800', letterSpacing: 3 },
  seed: { position: 'absolute', right: 70, top: 34, width: 80, height: 80, borderRadius: 40, backgroundColor: P.cream, borderWidth: 3, borderColor: P.gold, justifyContent: 'center', alignItems: 'center' }, seedLetter: { color: P.deep, fontSize: 42, fontWeight: '800' }, tileLetter: { color: P.ink, fontSize: 39, fontWeight: '800' }, letterHint: { position: 'absolute', top: -15, right: 15, padding: 10, borderRadius: 15, backgroundColor: P.cream },
  feedback: { position: 'absolute', left: 20, right: 20, alignItems: 'center' }, feedbackText: { color: P.ink, fontSize: 16, lineHeight: 21, backgroundColor: P.cream, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12, textAlign: 'center', maxWidth: 800 },
  footer: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 14 }, buttonInside: { flexDirection: 'row', gap: 9, alignItems: 'center' }, waiting: { opacity: 0.6 },
  listening: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 4, backgroundColor: P.cream, borderRadius: 14, borderWidth: 2, borderColor: P.gold, paddingHorizontal: 8, paddingVertical: 2 }, listeningText: { color: P.dim, fontSize: 14, fontWeight: '700' },
  gesture: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: P.cream, borderRadius: 18, borderWidth: 2, borderColor: P.edge, paddingHorizontal: 12, paddingVertical: 4 }, gestureStep: { flexDirection: 'row', alignItems: 'center', gap: 4 }, gestureRule: { width: 2, height: 30, backgroundColor: P.edge },
  gestureToken: { width: 40, height: 40, borderRadius: 12, backgroundColor: P.paper, borderWidth: 2, borderColor: P.edge, alignItems: 'center', justifyContent: 'center' }, gestureSocket: { width: 38, height: 38, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  up: { transform: [{ rotate: '-90deg' }] }, down: { transform: [{ rotate: '90deg' }] }, button: { minWidth: 160, minHeight: 64, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', gap: 9, justifyContent: 'center', alignItems: 'center', borderRadius: 24, backgroundColor: P.deep, borderWidth: 2, borderColor: P.edge, boxShadow: `0 4px 0 ${P.shadow}` }, secondary: { backgroundColor: P.cream }, buttonText: { fontSize: 18, color: P.paper, fontWeight: '800' }, secondaryText: { color: P.ink },
  games: { position: 'absolute', alignSelf: 'center', minHeight: GAMES_H, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 10, paddingRight: 16, borderRadius: 40, backgroundColor: P.deep, borderWidth: 3, borderColor: P.gold, boxShadow: `0 6px 16px ${P.shadow}` },
  gamesArt: { width: 62, height: 62, borderRadius: 31, backgroundColor: P.green, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: P.white },
  gamesText: { color: P.paper, fontSize: 24, fontWeight: '800', fontFamily: 'Georgia' },
  flip: { transform: [{ scaleX: -1 }] },
  pressed: { transform: [{ scale: 0.96 }] }, disabled: { opacity: 0.45 }, successPrincess: { position: 'absolute' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: P.scrim, alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 50 }, dialog: { backgroundColor: P.paper, borderColor: P.gold, borderWidth: 3, borderRadius: 32, padding: 24, gap: 14, alignItems: 'center', maxWidth: 480, width: '100%' }, row: { flexDirection: 'row', gap: 16 }, swatch: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, alignItems: 'center', justifyContent: 'center' }, swatchText: { fontSize: 30, color: P.ink }, concept: { color: P.dim, fontSize: 12 },
});
