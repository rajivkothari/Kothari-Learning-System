// Ice Bowling and Garden Golf: the screen. It renders the flow's view (flow.ts) with the pure layout
// (layout.ts) and calls the flow's actions; it decides nothing about right or wrong.
//
// The ask is a picture and a spoken word; the letters stand on pins or flags in the reading typeface.
// While the game is talking the letters and Help wait (they still show a press) and the ear glows. After
// a right letter the lane is the toy: tap it to aim, or tap a pin or flag. Print comes after sound: the
// word is printed only once its question is answered. Reduced Motion: nothing travels, shakes or pulses.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import type { GameRuntime } from '../../../runtime/gameRuntime';
import { BallArt, FLAG_SHAPE, FlagArt, PIN_SHAPE, PinArt } from '../ui/GameArt';
import { ActionButton, EarButton, HelpButton, TurnDots } from '../ui/GameControls';
import type { IconKind } from '../ui/MagicArt';
import { PRESS_MAX_MS, MagicalPressable as Pressable } from '../ui/MagicalPressable';
import { magic as P } from '../ui/palette';
import { useReadingFont, type ReadingFont } from '../ui/readingFont';
import { WordPicture } from '../ui/WordPicture';
import { GAMES, label, shownLine, type GameId } from './content';
import { ROLL_MS, createLetterGameFlow, idleGameView, type GameAudio, type LetterGameFlow } from './flow';
import { aimAt, letterLayout, type Rect } from './layout';
import { ListeningBadge, useHeldTaps } from './ListeningBadge';
import { SoundOffCard, useGameAudio, useSoundOff, whenSoundOn } from './SoundOff';

interface Props {
  runtime: GameRuntime;
  learnerId: string;
  game: GameId;
  audio: GameAudio;
  still: boolean;
  width: number;
  height: number;
  /** Where the screen may start (under the kingdom header), and the safe-area inset at the foot. */
  top: number;
  bottom: number;
  /** Back to the games room. */
  onExit: () => void;
}

const noop = () => () => undefined;

export function LetterGameScreen({ runtime, learnerId, game, audio, still, width, height, top, bottom, onExit }: Props) {
  const [flow, setFlow] = useState<LetterGameFlow | null>(null);
  const sound = useGameAudio(audio);
  const soundOff = useSoundOff();
  useEffect(() => {
    let cancelled = false;
    let unwait = () => undefined as void;
    const f = createLetterGameFlow({ runtime, learnerId, game, now: () => Date.now(), audio: sound });
    void Promise.resolve().then(() => {
      if (cancelled) return;
      // With Sound off the game is not opened: nothing is started or recorded until it can be heard.
      unwait = whenSoundOn(() => {
        if (cancelled) return;
        setFlow(f);
        void f.start();
      });
    });
    return () => {
      cancelled = true;
      unwait();
      void f.leave().finally(() => f.dispose());
    };
  }, [runtime, learnerId, game, sound]);
  const idle = useMemo(() => idleGameView(game), [game]);
  const v = useSyncExternalStore(flow?.subscribe ?? noop, flow?.view ?? (() => idle), () => idle);
  const copy = GAMES.games[game];
  const golf = copy.target === 'flag';
  const L = useMemo(() => letterLayout({ width, height, top, bottom, count: copy.choices }), [width, height, top, bottom, copy.choices]);
  const font = useReadingFont();
  // A tap on a held letter or Help is answered by the listening badge, at once.
  const { heard, onLocked } = useHeldTaps();

  // The ball travels once for each roll; pins fall, and Next arrives, when it gets there.
  const roll = v.roll;
  const rollKey = roll ? `${v.turn}:${roll.n}` : '';
  const [landed, setLanded] = useState('');
  useEffect(() => {
    if (!rollKey) return;
    const t = setTimeout(() => setLanded(rollKey), still ? 0 : ROLL_MS);
    return () => clearTimeout(t);
  }, [rollKey, still]);
  const rolling = roll !== null && landed !== rollKey;
  const down = rolling && roll ? v.down.filter((i) => !roll.hit.includes(i)) : v.down;

  const bx = useSharedValue(0);
  const by = useSharedValue(0);
  const sink = useSharedValue(1);
  const restX = L.rest.x;
  const restY = L.rest.y;
  const crossY = L.crossY;
  const toX = roll ? L.laneX(roll.x) : restX;
  const cleared = roll?.cleared ?? false;
  useEffect(() => {
    if (!rollKey) {
      bx.set(0);
      by.set(0);
      sink.set(1);
      return;
    }
    const ms = still ? 0 : ROLL_MS;
    const go = { duration: ms, easing: Easing.out(Easing.quad) };
    // A ball that did not finish the job comes back to its mark for the next try.
    const there = (to: number) => (cleared ? withTiming(to, go) : withSequence(withTiming(to, go), withDelay(550, withTiming(0, { duration: 0 }))));
    bx.set(there(toX - restX));
    by.set(there(crossY - restY));
    sink.set(cleared && golf ? withDelay(ms, withTiming(0.5, { duration: still ? 0 : 180 })) : 1);
  }, [rollKey, cleared, toX, restX, restY, crossY, golf, still, bx, by, sink]);
  const ballStyle = useAnimatedStyle(() => ({ transform: [{ translateX: bx.get() }, { translateY: by.get() }, { scale: sink.get() }] }));

  const playing = v.stage === 'play';
  const aim = (x: number) => flow?.roll(aimAt(L, L.lane.x + x));
  const laneTap = Gesture.Tap().enabled(playing).maxDuration(PRESS_MAX_MS).onEnd((e, ok) => {
    'worklet';
    if (ok) runOnJS(aim)(e.x);
  });

  // Sound is off: the game pauses to say why. Underneath, the flow holds its question and takes no answer.
  if (soundOff) return <View testID={`royal-game-${game}`} style={StyleSheet.absoluteFill} pointerEvents="box-none"><SoundOffCard width={width} top={top} bottom={bottom} onExit={() => { if (flow) void flow.leave().finally(onExit); else onExit(); }} /></View>;
  if (!flow) return null;
  const leave = () => {
    void flow.leave().finally(onExit);
  };
  const word = v.word;
  const asking = v.stage === 'ask';
  const answered = playing || v.stage === 'cleared';
  const line = shownLine(v.line, { word: word ?? '' }, game);
  const lastTried = v.tried[v.tried.length - 1];

  if (v.stage === 'done' || v.stage === 'failed') {
    const done = v.stage === 'done';
    return <View testID={`royal-game-${game}`} style={[s.root, { top, bottom: Math.max(bottom, 0) }]}>
      <View style={[s.endCard, { width: Math.min(width - 24, 540) }]}>
        <WordPicture kind={copy.icon as IconKind} size={Math.min(150, height * 0.2)} />
        {done ? <Text testID="game-line" accessibilityLiveRegion="polite" style={[s.endLine, font.bold]}>{line}</Text> : null}
        <View style={s.endRow}>
          {done ? <ActionButton testID="game-again" label={label('again')} icon="again" quiet locked={v.settling} onPress={() => void flow.again()} /> : null}
          {done ? <ActionButton testID="game-done" label={label('done')} icon="arrow" locked={v.settling} onPress={leave} /> : <ActionButton testID="game-castle" label={label('castle')} icon="home" onPress={leave} />}
        </View>
      </View>
    </View>;
  }

  return <View testID={`royal-game-${game}`} style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {/* The ask: the picture, the ear, the line, and what help or the answer adds. */}
    <View style={[s.panel, at(L.panel)]} />
    <Pressable testID={word ? `game-picture-${word}` : undefined} accessibilityLabel={label('picture')} onPress={() => flow.hear()} style={[s.picture, at(L.picture)]}>
      <WordPicture kind={(word ?? copy.icon) as IconKind} size={Math.round(L.picture.w * 0.78)} />
    </Pressable>
    <View style={[s.earSpot, { left: L.ear.x - 7, top: L.ear.y - 7 }]}>
      <EarButton testID="game-hear" label={label('hear')} onPress={() => flow.hear()} glow={v.listening || v.nudge} still={still} size={L.ear.w} />
    </View>
    <View style={[s.text, at(L.text)]}>
      <Text testID="game-line" accessibilityLiveRegion="polite" style={[s.line, { fontSize: L.text.w < 150 ? 16 : 20, lineHeight: L.text.w < 150 ? 20 : 25 }, font.bold]}>{line}</Text>
      {/* Shown while the ask is said, and while a rung of help is: both are "listen first". */}
      {asking && (v.listening || v.helping) ? <ListeningBadge testID="game-listening" label={label('listening')} heard={heard} still={still} font={font} /> : null}
      {asking && v.hint && !v.listening ? <View testID="game-revealed" accessibilityLabel={label('hint', { letter: v.hint })} style={s.hint}><Text style={[s.hintLetter, font.bold]}>{v.hint}</Text></View> : null}
      {answered && word ? <Text testID="game-word" style={[s.word, { fontSize: L.word, lineHeight: Math.round(L.word * 1.25) }, font.bold]}><Text style={s.gold}>{word[0]}</Text>{word.slice(1)}</Text> : null}
    </View>

    {/* The lane: ice for bowling, a green for golf. In play it is the toy: a tap is an aim. */}
    <GestureDetector gesture={laneTap}>
      <View testID="game-lane" accessible={playing} accessibilityRole="button" accessibilityLabel={label('lane')} accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => { if (playing && v.target !== null) flow.rollAt(v.target); }} style={[s.lane, golf ? s.green : s.ice, at(L.lane)]}>
        {golf ? <View style={s.fairway} /> : <><View style={[s.gutter, { left: 0 }]} /><View style={[s.gutter, { right: 0 }]} /></>}
        <View style={s.laneFoot}>
          <TurnDots turn={v.turn} turns={v.turns} done={false} label={label('turn', { turn: v.turn, turns: v.turns })} />
          {playing ? <View style={s.tries} accessibilityLabel={label('tries', { count: v.tries - v.used })}>
            {Array.from({ length: v.tries - v.used }, (_, i) => <BallArt key={i} size={22} golf={golf} />)}
          </View> : null}
        </View>
      </View>
    </GestureDetector>

    {v.options.map((o, i) => {
      const rect = L.targets[i];
      if (!rect) return null;
      const fallen = down.includes(i);
      const tried = v.tried.includes(o.id);
      const shine = (answered && v.target === i) || (asking && v.shown === o.id);
      // SHOW ME: only the shining letter can be chosen. The others wait.
      const aside = asking && v.shown !== null && v.shown !== o.id;
      return <Target key={o.id} rect={rect} golf={golf} letter={o.letter} letterSize={L.letter} font={font} still={still}
        fallen={fallen} tried={tried} shine={shine} waiting={asking && (v.listening || aside)}
        shake={o.id === lastTried ? v.miss : 0}
        bounce={asking && v.shown === o.id}
        locked={(asking && (v.listening || aside)) || (playing && v.settling)} onLocked={asking && v.listening ? onLocked : undefined} disabled={fallen || v.stage === 'cleared' || (asking && tried)}
        label={fallen ? label('fallen') : label(copy.target, { letter: o.letter })}
        onPress={() => { if (asking) void flow.choose(o.id); else if (playing) flow.rollAt(i); }} />;
    })}

    <Animated.View testID="game-ball" accessibilityLabel={label('ball')} pointerEvents="none" style={[s.ball, { left: L.rest.x - L.ball / 2, top: L.rest.y - L.ball / 2, width: L.ball, height: L.ball }, asking && s.ballWaiting, ballStyle]}>
      <BallArt size={L.ball} golf={golf} />
    </Animated.View>

    {/* One action at a time: Help while the question is open, Next once the ball has done its work. */}
    <View style={[s.action, at(L.action)]} pointerEvents="box-none">
      {asking ? <HelpButton testID="game-help" label={v.nextHelp?.demonstrated ? label('showMe') : label('help')} width={Math.min(L.action.w, width < 420 ? 76 : 220)} locked={v.listening || v.helping || v.settling} onLocked={v.listening || v.helping ? onLocked : undefined} speaking={v.helping} disabled={!v.nextHelp && !v.helping} onPress={() => void flow.help()} /> : null}
      {v.stage === 'cleared' && !rolling ? <ActionButton testID="game-next" label={label('next')} icon="arrow" width={Math.min(L.action.w, 240)} locked={v.settling} onPress={() => void flow.next()} /> : null}
    </View>
  </View>;
}

const at = (r: Rect) => ({ left: r.x, top: r.y, width: r.w, height: r.h });

function Target({ rect, golf, letter, letterSize, font, still, fallen, tried, shine, bounce, waiting, shake, locked, onLocked, disabled, label: name, onPress }: {
  rect: Rect; golf: boolean; letter: string; letterSize: number; font: ReadingFont; still: boolean;
  fallen: boolean; tried: boolean; shine: boolean; bounce: boolean; waiting: boolean; shake: number; locked: boolean; onLocked?: () => void; disabled: boolean; label: string; onPress: () => void;
}) {
  const shape = golf ? FLAG_SHAPE : PIN_SHAPE;
  const artH = Math.round(Math.min(rect.h - 6, (rect.w - 4) / shape.aspect));
  const artW = artH * shape.aspect;
  const left = (rect.w - artW) / 2;
  const topGap = rect.h - artH - 2;
  const x = useSharedValue(0);
  const fall = useSharedValue(0);
  useEffect(() => {
    if (shake && !still) x.set(withSequence(withTiming(-9, { duration: 60 }), withTiming(9, { duration: 80 }), withTiming(-5, { duration: 70 }), withTiming(0, { duration: 60 })));
  }, [shake, still, x]);
  useEffect(() => {
    fall.set(still ? (fallen ? 1 : 0) : withTiming(fallen ? 1 : 0, { duration: fallen ? 240 : 0 }));
  }, [fallen, still, fall]);
  // SHOW ME: the shown letter hops once, so the help is seen to do something. Still pictures: the gold halo alone.
  const hop = useSharedValue(0);
  useEffect(() => {
    if (bounce && !still) hop.set(withSequence(withTiming(-14, { duration: 160 }), withTiming(0, { duration: 180 }), withTiming(-7, { duration: 130 }), withTiming(0, { duration: 150 })));
    else hop.set(0);
  }, [bounce, still, hop]);
  const drop = rect.h * 0.28;
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: fall.get() * drop + hop.get() }, { rotate: `${fall.get() * 80}deg` }] }));
  const lineHeight = Math.round(letterSize * 1.3);
  return <Pressable testID={fallen ? undefined : `game-target-${letter}`} accessibilityLabel={name} accessibilityState={{ selected: bounce }} onPress={onPress} locked={locked} onLocked={onLocked} disabled={disabled} style={[s.target, at(rect)]}>
    <Animated.View style={[StyleSheet.absoluteFill, moving]}>
      {shine ? <View style={[s.halo, { left: left - 8, top: topGap + artH * (golf ? 0.02 : 0.42), width: artW + 16, height: artH * (golf ? 0.56 : 0.56), borderRadius: artW }]} /> : null}
      <View style={[{ position: 'absolute', left, top: topGap }, waiting && s.waiting, fallen && s.fallen]}>
        {golf ? <FlagArt height={artH} dull={tried} /> : <PinArt height={artH} dull={tried} />}
      </View>
      {fallen ? null : <Text style={[s.letter, { left, width: artW * (golf ? shape.letterX * 2 - 0.08 : 1), top: topGap + artH * shape.letterY - lineHeight / 2, fontSize: letterSize, lineHeight }, font.bold, tried && s.triedLetter, waiting && s.waiting]}>{letter}</Text>}
    </Animated.View>
  </Pressable>;
}

const s = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', padding: 12 },
  panel: { position: 'absolute', backgroundColor: P.paper, borderRadius: 28, borderWidth: 2, borderColor: P.edge, boxShadow: `0 5px 16px ${P.shadow}` },
  picture: { position: 'absolute', backgroundColor: P.ice, borderRadius: 24, borderWidth: 3, borderColor: P.white, alignItems: 'center', justifyContent: 'center', boxShadow: `0 3px 0 ${P.shadow}` },
  earSpot: { position: 'absolute' },
  text: { position: 'absolute', justifyContent: 'center', gap: 6 },
  line: { color: P.ink, fontWeight: '800' },
  hint: { alignSelf: 'flex-start', minWidth: 54, height: 54, paddingHorizontal: 10, borderRadius: 16, backgroundColor: P.cream, borderWidth: 3, borderColor: P.gold, alignItems: 'center', justifyContent: 'center' },
  hintLetter: { color: P.deep, fontSize: 34, lineHeight: 44, fontWeight: '800' },
  word: { color: P.ink, fontWeight: '800', letterSpacing: 1 },
  gold: { color: P.gold },
  lane: { position: 'absolute', borderRadius: 34, borderWidth: 3, overflow: 'hidden' },
  ice: { backgroundColor: P.ice, borderColor: P.white },
  green: { backgroundColor: P.green, borderColor: P.leaf },
  gutter: { position: 'absolute', top: 0, bottom: 0, width: 14, backgroundColor: P.crystal, opacity: 0.25 },
  fairway: { position: 'absolute', left: '12%', right: '12%', top: 0, bottom: 0, backgroundColor: P.white, opacity: 0.35 },
  laneFoot: { position: 'absolute', left: 22, right: 22, bottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tries: { flexDirection: 'row', gap: 4 },
  target: { position: 'absolute' },
  halo: { position: 'absolute', backgroundColor: P.paper, borderWidth: 4, borderColor: P.gold, boxShadow: `0 0 20px ${P.gold}` },
  letter: { position: 'absolute', textAlign: 'center', color: P.ink, fontWeight: '800', includeFontPadding: false },
  triedLetter: { opacity: 0.35 },
  waiting: { opacity: 0.6 },
  fallen: { opacity: 0.85 },
  ball: { position: 'absolute', zIndex: 4 },
  ballWaiting: { opacity: 0.55 },
  action: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  endCard: { alignItems: 'center', gap: 16, backgroundColor: P.paper, borderRadius: 40, borderWidth: 3, borderColor: P.gold, padding: 24, boxShadow: `0 8px 22px ${P.shadow}` },
  endLine: { color: P.ink, fontSize: 28, lineHeight: 35, fontWeight: '800', textAlign: 'center' },
  endRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center' },
});
