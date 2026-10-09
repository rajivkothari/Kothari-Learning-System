import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, AppState, BackHandler, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { osPrefersReducedMotion } from '../../platform/osMotion';
import type { Adventure } from './appContent';
import { WORDS as W, line } from './copy';
import { createKingdomDirector, type KingdomDirector, type KingdomView } from './director/kingdom';
import { hush, speak } from './narration';
import { DEFAULT_KINGDOM_LEARNER, openKingdomServices } from './services';
import { DragToken, type DropZone } from './ui/DragToken';
import { MagicIcon, type IconKind } from './ui/MagicArt';
import { MagicalPressable as Pressable } from './ui/MagicalPressable';
import { magic as P } from './ui/palette';

const ART = {
  castle: require('../../../assets/themes/magical-kingdom/castle.png'),
  ice: require('../../../assets/themes/magical-kingdom/ice.png'),
  garden: require('../../../assets/themes/magical-kingdom/garden.png'),
  princess: require('../../../assets/themes/magical-kingdom/princess-concept.png'),
};
const noopSubscribe = () => () => {};
const WAITING: KingdomView = { ready: false, room: 'castle', busy: false, error: false, activity: null, solved: false, placements: [], letter: null, notice: null, hint: null, rewards: [], outfit: 'lavender', target: 5, word: 'sun' };

export function KingdomApp({ onExit, learnerId = DEFAULT_KINGDOM_LEARNER }: { onExit?: () => void; learnerId?: string }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [director, setDirector] = useState<KingdomDirector | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const [reduced, setReduced] = useState(true); // Safe until the system preference resolves.
  const [foreground, setForeground] = useState(true);
  const [dialog, setDialog] = useState<'comfort' | 'dress' | 'restart' | null>(null);
  const [sparkle, setSparkle] = useState(0);
  const v = useSyncExternalStore(director?.subscribe ?? noopSubscribe, director?.view ?? (() => WAITING), () => WAITING);
  const say = useCallback((text: string) => { if (!quiet && foreground) void speak(text); }, [quiet, foreground]);
  const still = reduced || !foreground;

  useEffect(() => {
    let stopped = false;
    let active: KingdomDirector | null = null;
    void openKingdomServices().then(async ({ runtime }) => {
      const d = createKingdomDirector(runtime, learnerId, () => Date.now()); active = d;
      if (stopped) { d.dispose(); return; }
      setDirector(d); await d.start();
      const current = (await runtime.settings(learnerId))['kingdom.current'] ?? learnerId;
      const settings = await runtime.settings(current);
      const os = await osPrefersReducedMotion();
      if (!stopped) { setReduced(settings['kingdom.motion'] ? settings['kingdom.motion'] === 'still' : os !== false); setQuiet(settings['kingdom.quiet'] === 'true'); }
    }).catch(() => { if (!stopped) setLoadError(true); });
    return () => { stopped = true; if (active) void active.flush().catch(() => undefined).finally(() => active?.dispose()); void hush(); };
  }, [learnerId, attempt]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state !== 'active') { void hush(); void director?.flush().catch(() => undefined); }
    });
    return () => subscription.remove();
  }, [director]);
  useEffect(() => {
    const s = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dialog) { setDialog(null); return true; }
      if (v.room !== 'castle') { void director?.home(); return true; }
      if (onExit) { void director?.flush().then(onExit).catch(() => undefined); return true; }
      return false;
    });
    return () => s.remove();
  }, [dialog, v.room, director, onExit]);
  useEffect(() => { void hush(); }, [v.room]);
  const settings = async (key: string, value: string) => {
    try {
      const { runtime } = await openKingdomServices();
      const id = (await runtime.settings(learnerId))['kingdom.current'] ?? learnerId;
      await runtime.putSetting(id, `kingdom.${key}`, value);
    } catch { setLoadError(true); }
  };
  const home = () => { void hush(); void director?.home(); };
  const enter = (room: Adventure) => { void director?.enter(room).then(() => say(room === 'ice' ? W.iceIntro : W.gardenIntro)); };
  const retry = () => { if (loadError) { setLoadError(false); setAttempt((n) => n + 1); } else void director?.retry(); };
  const portrait = height > width;
  const frozen = v.busy || v.error || loadError;

  return <View testID="kingdom-screen" nativeID="kingdom-v01-prototype-marker" style={s.root}>
    <Image source={ART[v.room]} style={{ position: 'absolute', left: 0, top: 0, width, height }} resizeMode="cover" blurRadius={v.room === 'castle' && portrait ? 9 : 0} accessible={false} />
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: v.room === 'castle' && portrait ? P.veil : P.transparent }]} />
    {v.ready && !loadError ? <>
      <View style={[s.header, { paddingTop: Math.max(12, insets.top), paddingHorizontal: Math.max(18, insets.left + 12) }]}>
        <IconButton label={v.room === 'castle' ? W.exit : W.home} kind="home" onPress={v.room === 'castle' ? () => { void director?.flush().then(() => onExit?.()).catch(() => undefined); } : home} disabled={frozen} />
        <View style={s.headerText}><Text style={s.overline}>{v.room === 'castle' ? W.title : W.subtitle}</Text><Text accessibilityRole="header" style={[s.heading, { fontSize: portrait ? 25 : 30 }]}>{v.room === 'castle' ? W.subtitle : W[v.room]}</Text></View>
        <IconButton label={W.settings} kind="crown" onPress={() => setDialog('comfort')} />
      </View>
      {v.room === 'castle' ? <>
        <Castle width={width} height={height} v={v} still={still} enter={enter} dress={() => { setDialog('dress'); say(W.hat); }} react={() => { setSparkle((n) => n + 1); say(W.guide); }} sparkle={sparkle} frozen={frozen} />
        <View style={[s.guide, { bottom: Math.max(24, insets.bottom + 14), width: Math.min(width - 32, 670) }]}>
          <MagicIcon kind="star" size={64} /><View style={{ flex: 1 }}><Text style={s.guideTitle}>{W.guide}</Text><Text style={s.guideSub}>{W.welcome}</Text></View>
          <IconButton small label={W.listen} kind={quiet ? 'mute' : 'sound'} onPress={() => say(W.guide)} />
        </View>
      </> : <AdventureScreen v={v} director={director!} width={width} height={height} still={still} quiet={quiet} say={say} home={home} frozen={frozen} inset={insets.bottom} />}
    </> : <View style={s.center}><MagicIcon kind="star" size={90} /><Text style={s.heading}>{W.loading}</Text></View>}
    {(v.error || loadError) ? <View style={s.scrim} accessibilityViewIsModal><View style={s.dialog}><Text style={s.guideTitle}>{W.saveError}</Text><Button text={W.retrySave} onPress={retry} /></View></View> : null}
    {dialog ? <View style={s.scrim} accessibilityViewIsModal><View style={s.dialog}>
      <MagicIcon kind="crown" size={66} />
      <Text style={s.heading}>{dialog === 'dress' ? W.wardrobe : dialog === 'restart' ? W.restart : W.settings}</Text>
      {dialog === 'dress' ? <><Princess still={still} celebration={false} size={180} outfit={v.outfit} /><Text style={s.guideSub}>{W.hat}</Text><View style={s.row}>{(['lavender', 'turquoise', 'gold'] as const).map((tone) => <Pressable key={tone} accessibilityRole="button" accessibilityLabel={W[tone]} accessibilityState={{ selected: v.outfit === tone }} onPress={() => void director?.outfit(tone)} style={[s.swatch, { backgroundColor: P[tone], borderColor: v.outfit === tone ? P.ink : P.white }]}><Text style={s.swatchText}>{v.outfit === tone ? '✓' : '✦'}</Text></Pressable>)}</View><Text style={s.concept}>{W.concept}</Text></> : null}
      {dialog === 'comfort' ? <>
        <Button text={quiet ? W.sound : W.quiet} icon={quiet ? 'sound' : 'mute'} onPress={() => { const next = !quiet; setQuiet(next); if (next) void hush(); void settings('quiet', String(next)); }} />
        <Button text={reduced ? W.motion : W.still} onPress={() => { const next = !reduced; setReduced(next); void settings('motion', next ? 'still' : 'gentle'); }} />
        <Button text={W.restart} secondary onPress={() => setDialog('restart')} />
      </> : null}
      {dialog === 'restart' ? <><Text style={s.guideSub}>{W.restartQuestion}</Text><Button text={W.confirmRestart} onPress={() => { void director?.restart().then(() => { setDialog(null); void hush(); }); }} disabled={frozen} /><Button text={W.cancel} secondary onPress={() => setDialog('comfort')} /></> : <Button text={W.close} secondary onPress={() => setDialog(null)} />}
    </View></View> : null}
  </View>;
}

function Castle({ width, height, v, still, enter, dress, react, sparkle, frozen }: { width: number; height: number; v: KingdomView; still: boolean; enter: (room: Adventure) => void; dress: () => void; react: () => void; sparkle: number; frozen: boolean }) {
  const portrait = height > width;
  const artWidth = portrait ? width : Math.max(width, height * 1.5);
  const artHeight = artWidth / 1.5;
  const left = (width - artWidth) / 2;
  const top = portrait ? Math.max(165, (height - artHeight) / 2 - 15) : (height - artHeight) / 2;
  const doors = [{ kind: 'crystal', name: W.iceDoor, action: () => enter('ice'), room: 'ice' }, { kind: 'flower', name: W.gardenDoor, action: () => enter('garden'), room: 'garden' }, { kind: 'crown', name: W.wardrobeDoor, action: dress, room: 'dress' }] as const;
  return <>
    {portrait ? <Image source={ART.castle} style={{ position: 'absolute', left, top, width: artWidth, height: artHeight }} resizeMode="contain" accessible={false} /> : null}
    <Text style={[s.hallLabel, { top: portrait ? 124 : 108 }]}>{W.castle}</Text>
    {doors.map((door, i) => <Pressable key={door.room} testID={`door-${door.room}`} accessibilityRole="button" accessibilityLabel={door.name} disabled={frozen} onPress={door.action} style={({ pressed }) => [s.door, { left: left + artWidth * (0.19 + i * 0.247), top: top + artHeight * 0.24, width: artWidth * 0.164, height: artHeight * 0.35 }, pressed && s.pressed]}>
      <View style={s.doorSeal}><MagicIcon kind={door.kind} size={portrait ? 44 : 62} /></View>
      <View style={s.doorLabel}><Text style={[s.doorText, { fontSize: portrait ? 15 : 19 }]}>{door.name} {v.rewards.includes(door.room as Adventure) ? '✓' : '→'}</Text></View>
    </Pressable>)}
    <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(8, width * 0.07), top: top + artHeight * 0.60 }}><Princess size={Math.min(portrait ? 235 : 245, height * 0.32)} still={still} celebration={false} outfit={v.outfit} /></View>
    <View pointerEvents="none" style={[s.characterName, { left: width * 0.06, bottom: height > width ? 158 : 136 }]}><Text style={s.nameText}>{W.character}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={W.sparkle} onPress={react} style={[s.playObject, { right: width * 0.12, top: top + artHeight * 0.65 }]}><MagicIcon kind="star" color={sparkle % 2 ? P.turquoise : P.gold} size={sparkle % 2 ? 88 : 72} /></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={W.flowers} onPress={react} style={[s.playObject, { right: width * 0.26, top: top + artHeight * 0.76 }]}><MagicIcon kind="flower" size={sparkle % 2 ? 70 : 64} /></Pressable>
    <View style={s.rewardRibbon} accessibilityLabel={`${W.magic}: ${v.rewards.length}`}><MagicIcon kind="crystal" size={26} /><Text style={s.rewardText}>{v.rewards.includes('ice') ? '✓' : '○'}</Text><MagicIcon kind="flower" size={26} /><Text style={s.rewardText}>{v.rewards.includes('garden') ? '✓' : '○'}</Text></View>
  </>;
}

function AdventureScreen({ v, director, width, height, still, quiet, say, home, frozen, inset }: { v: KingdomView; director: KingdomDirector; width: number; height: number; still: boolean; quiet: boolean; say: (text: string) => void; home: () => void; frozen: boolean; inset: number }) {
  const ice = v.room === 'ice';
  const count = v.target;
  const word = v.word;
  const option = v.activity?.options.find((o) => o.id === v.letter);
  const zoneRef = useRef<View>(null);
  const zone = useRef<DropZone | null>(null);
  const measure = () => zoneRef.current?.measureInWindow((x, y, width, height) => { zone.current = { x, y, width, height }; });
  const gestureLine = ice ? W.iceGesture : W.gardenGesture;
  const goal = ice ? line(W.iceInstruction, { count }) : line(W.gardenInstruction, { word });
  const hint = v.hint ? (ice ? { clue: W.iceClue, guided: W.iceGuided, show: W.iceShown } : { clue: W.gardenClue, guided: W.gardenGuided, show: W.gardenShown })[v.hint] : null;
  const wide = width >= 850;
  useEffect(() => { if (v.solved) say(ice ? W.iceSuccess : W.gardenSuccess); }, [v.solved, ice, say]);
  useEffect(() => { const t = setTimeout(measure, 80); return () => clearTimeout(t); }, [width, height, ice]);
  return <>
    <View style={[s.objective, { top: height > width ? 119 : 106, width: Math.min(width - 32, 650) }]}>
      {ice ? <View style={s.numberSeal}><Text testID="bridge-goal" style={s.number}>{count}</Text></View> : <MagicIcon kind={word as IconKind} size={62} />}
      <View style={{ flex: 1 }}><Text style={s.objectiveTitle}>{v.solved ? (ice ? W.iceSuccess : W.gardenSuccess) : (ice ? W.iceIntro : W.gardenIntro)}</Text><Text testID="activity-instruction" style={s.objectiveText}>{v.solved ? (ice ? W.iceSuccessSub : W.gardenSuccessSub) : goal}</Text></View>
      <IconButton small label={W.listen} kind={quiet ? 'mute' : 'sound'} onPress={() => say(goal)} />
    </View>
    {ice ? <>
      <View ref={zoneRef} onLayout={measure} testID="bridge-dropzone" accessibilityLabel={line(W.loaded, { count: v.placements.length })} style={[s.bridge, { top: height * 0.44, width: Math.min(width - 36, wide ? 800 : 404) }]}>
        <View style={s.sockets}>{Array.from({ length: 10 }, (_, i) => {
          const token = v.placements[i];
          const lit = token !== undefined || v.solved;
          return <Pressable key={i} testID={`socket-${i}`} accessibilityRole="button" accessibilityLabel={token !== undefined ? line(W.remove, { index: i + 1 }) : line(W.socket, { index: i + 1 })} disabled={frozen || v.solved || token === undefined} onPress={() => token !== undefined && director.remove(token)} style={[s.socket, lit && s.litSocket]}>
            {lit && i < (v.solved ? count : v.placements.length) ? <MagicIcon kind="crystal" size={44} /> : <View style={[s.socketLight, v.hint === 'guided' && i < count && s.guideLight]} />}
          </Pressable>;
        })}</View>
      </View>
      <FoxCrossing solved={v.solved} still={still} width={width} height={height} />
    </> : <View ref={zoneRef} onLayout={measure} testID="flower-dropzone" style={[s.flowerZone, { top: height * 0.36, height: height < 700 ? 150 : 205, width: Math.min(width - 36, 650) }]}>
      <View style={s.picture}><MagicIcon kind={word as IconKind} size={96} /><Text style={s.word}>{word.toUpperCase()}</Text></View>
      <Bloom solved={v.solved} still={still} />
      <Pressable accessibilityRole="button" accessibilityLabel={W.removeLetter} disabled={v.solved || frozen || !v.letter} onPress={() => v.letter && director.plant(v.letter)} style={s.seed}><Text testID="planted-letter" style={s.seedLetter}>{v.solved ? '✓' : String(option?.value ?? W.emptyLetter).toUpperCase()}</Text></Pressable>
      {v.hint === 'guided' || v.hint === 'show' ? <View style={s.letterHint}><Text style={s.seedLetter}>{String(v.activity?.scaffolds.revealedValue ?? word[0]).toUpperCase()}</Text></View> : null}
    </View>}
    {!v.solved ? <>
      <View style={[s.tray, { bottom: 142 + inset, width: Math.min(width - 24, wide || !ice ? 820 : 408), minHeight: wide || !ice ? 92 : 174 }]}>
        <View style={s.tokens}>{ice ? Array.from({ length: 10 }, (_, i) => <DragToken key={i} testID={`crystal-${i}`} label={line(W.load, { index: i + 1 })} disabled={frozen || v.placements.includes(i)} target={() => zone.current} onPlace={() => director.place(i)}><MagicIcon kind="crystal" size={48} /></DragToken>) : v.activity?.options.map((o) => <DragToken key={o.id} testID={`letter-${String(o.value)}`} label={line(W.letter, { letter: String(o.value).toUpperCase() })} disabled={frozen} selected={v.letter === o.id} target={() => zone.current} onPlace={() => director.plant(o.id)}><Text style={s.tileLetter}>{String(o.value).toUpperCase()}</Text></DragToken>)}</View>
      </View>
      <View style={[s.feedback, { bottom: 102 + inset }]}><Text accessibilityLiveRegion="polite" style={s.feedbackText}>{v.notice ?? hint ?? gestureLine}</Text></View>
      <View style={[s.footer, { bottom: Math.max(24, inset + 12) }]}><Button text={v.activity?.scaffolds.available[0]?.assistance === 'demonstrated' ? W.showMe : W.help} icon="help" secondary disabled={frozen || !v.activity?.scaffolds.available.length} onPress={() => { void director.help().then(() => say(ice ? W.iceClue : W.gardenClue)); }} /><Button testID="make-magic" text={W.check} icon="star" disabled={frozen || (!ice && !v.letter)} onPress={() => void director.submit()} /></View>
    </> : <>
      <View style={[s.successPrincess, { right: width * 0.08, bottom: 130 }]}><Princess still={still} celebration outfit={v.outfit} size={Math.min(220, height * 0.27)} /></View>
      <View style={[s.footer, { bottom: Math.max(24, inset + 12) }]}><Button text={W.return} icon="home" onPress={home} disabled={frozen} /></View>
    </>}
  </>;
}

function Princess({ size, still, celebration, outfit = 'lavender' }: { size: number; still: boolean; celebration: boolean; outfit?: KingdomView['outfit'] }) {
  const [float] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) { float.setValue(0); return; }
    const a = Animated.loop(Animated.sequence([Animated.timing(float, { toValue: celebration ? -8 : -3, duration: 1800, useNativeDriver: true }), Animated.timing(float, { toValue: 0, duration: 1800, useNativeDriver: true })]));
    a.start(); return () => { a.stop(); float.setValue(0); };
  }, [still, celebration, float]);
  return <Animated.View style={{ transform: [{ translateY: float }] }}><Image source={ART.princess} accessibilityLabel={W.character} style={{ height: size, width: size * 0.67 }} resizeMode="contain" /><View pointerEvents="none" style={{ position: 'absolute', left: size * 0.30, top: size * 0.43 }}><MagicIcon kind="star" size={size * 0.1} color={P[outfit]} /></View></Animated.View>;
}
function FoxCrossing({ solved, still, width, height }: { solved: boolean; still: boolean; width: number; height: number }) {
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => { const a = Animated.timing(x, { toValue: solved ? Math.min(width - 140, 690) : 0, duration: still ? 0 : 2100, useNativeDriver: true }); a.start(); return () => a.stop(); }, [solved, still, width, x]);
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', left: width > 850 ? (width - 800) / 2 : 24, top: height * 0.44 - 67, transform: [{ translateX: x }] }}><MagicIcon kind="fox" size={72} /></Animated.View>;
}
function Bloom({ solved, still }: { solved: boolean; still: boolean }) {
  const [scale] = useState(() => new Animated.Value(0.65));
  useEffect(() => { const a = Animated.timing(scale, { toValue: solved ? 1.45 : 0.65, duration: still ? 0 : 1300, useNativeDriver: true }); a.start(); return () => a.stop(); }, [solved, still, scale]);
  return <Animated.View pointerEvents="none" style={{ transform: [{ scale }] }}><MagicIcon kind="flower" size={145} /></Animated.View>;
}
function IconButton({ label, kind, onPress, disabled = false, small = false }: { label: string; kind: IconKind; onPress: () => void; disabled?: boolean; small?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={({ pressed }) => [s.iconButton, small && s.smallIcon, pressed && s.pressed, disabled && s.disabled]}><MagicIcon kind={kind} size={small ? 30 : 36} /></Pressable>;
}
function Button({ text, onPress, secondary = false, icon, disabled = false, testID }: { text: string; onPress: () => void; secondary?: boolean; icon?: IconKind; disabled?: boolean; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={text} testID={testID} onPress={onPress} disabled={disabled} style={({ pressed }) => [s.button, secondary && s.secondary, pressed && s.pressed, disabled && s.disabled]}>{icon ? <MagicIcon kind={icon} size={30} color={secondary ? P.gold : P.gold} /> : null}<Text style={[s.buttonText, secondary && s.secondaryText]}>{text}</Text></Pressable>;
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
  footer: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', gap: 14 }, button: { minWidth: 160, minHeight: 64, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', gap: 9, justifyContent: 'center', alignItems: 'center', borderRadius: 24, backgroundColor: P.deep, borderWidth: 2, borderColor: P.edge, boxShadow: `0 4px 0 ${P.shadow}` }, secondary: { backgroundColor: P.cream }, buttonText: { fontSize: 18, color: P.paper, fontWeight: '800' }, secondaryText: { color: P.ink },
  pressed: { transform: [{ scale: 0.96 }] }, disabled: { opacity: 0.45 }, successPrincess: { position: 'absolute' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: P.scrim, alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 50 }, dialog: { backgroundColor: P.paper, borderColor: P.gold, borderWidth: 3, borderRadius: 32, padding: 24, gap: 14, alignItems: 'center', maxWidth: 480, width: '100%' }, row: { flexDirection: 'row', gap: 16 }, swatch: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, alignItems: 'center', justifyContent: 'center' }, swatchText: { fontSize: 30, color: P.ink }, concept: { color: P.dim, fontSize: 12 },
});
