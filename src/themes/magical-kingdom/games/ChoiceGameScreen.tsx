// The four picture games and the Royal Quest: the screen. It renders the flow's view (choiceFlow.ts) with
// the pure layout (choiceLayout.ts) and calls the flow's actions; it decides nothing about right or wrong.
//
// The stage has two slots: what is asked (the word's picture, or the story's cover) and the answer's
// frame (the picture picked up, the chest, the bunny on her stones, the book). Under it three opaque
// choice tiles, in four states: live (pale blue), waiting while the game talks (cream, contents 60%),
// tried (stone, 35%) and, once answered, not chosen (paper, 30%). Rhymes and Stories pick a picture up
// and the gold star chooses it; Chests and Bunny answer on the tap. After the answer the frame is the toy
// and the words are printed in the reading typeface with their gold endings or first letters.
// Reduced Motion (`still`): nothing travels, bobs, shakes or pulses.
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import type { GameRuntime } from '../../../runtime/gameRuntime';
import { ActionButton, EAR_PAD, EarButton, HelpButton, TurnDots } from '../ui/GameControls';
import { MagicIcon, type IconKind } from '../ui/MagicArt';
import { Glow, MagicalPressable as Pressable } from '../ui/MagicalPressable';
import { magic as P } from '../ui/palette';
import { Princess } from '../ui/Princess';
import { useReadingFont, type ReadingFont } from '../ui/readingFont';
import { WordPicture } from '../ui/WordPicture';
import type { Look } from '../wardrobe';
import { CHOICE_GAMES, QUEST, label, lineText, type Kind, type PlayId, type Print } from './choiceContent';
import { BEAT_MS, MAX_PLAYS, createChoiceFlow, idleChoiceView, type ChoiceFlow, type ChoiceOption, type ChoiceView } from './choiceFlow';
import { choiceLayout, type ChoiceLayout, type Rect } from './choiceLayout';
import type { GameAudio } from './flow';

interface Props {
  runtime: GameRuntime;
  learnerId: string;
  play: PlayId;
  audio: GameAudio;
  still: boolean;
  width: number;
  height: number;
  /** Where the screen may start (under the kingdom header), and the safe-area inset at the foot. */
  top: number;
  bottom: number;
  /** The learner's look, for the princess who celebrates the end of a quest. */
  look: Look;
  /** Back to the games room. */
  onExit: () => void;
}

const noop = () => () => undefined;
const at = (r: Rect) => ({ left: r.x, top: r.y, width: r.w, height: r.h });
/** The picture a game (or the quest) carries on its card and on its stepping stone. */
export const playIcon = (play: PlayId): IconKind => (play === 'quest' ? QUEST.icon : CHOICE_GAMES.games[play].icon) as IconKind;
/** The toy in the answer's frame, and the empty frame of a pick-up game. */
const FRAME: Record<Kind, IconKind> = { rhyme: 'horse', sort: 'chest', hop: 'bunny', story: 'book' };

export function ChoiceGameScreen({ runtime, learnerId, play, audio, still, width, height, top, bottom, look, onExit }: Props) {
  const [flow, setFlow] = useState<ChoiceFlow | null>(null);
  useEffect(() => {
    let cancelled = false;
    const f = createChoiceFlow({ runtime, learnerId, play, now: () => Date.now(), audio });
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setFlow(f);
      void f.start();
    });
    return () => {
      cancelled = true;
      void f.flush().finally(() => f.dispose());
    };
  }, [runtime, learnerId, play, audio]);
  const idle = useMemo(() => idleChoiceView(play), [play]);
  const v = useSyncExternalStore(flow?.subscribe ?? noop, flow?.view ?? (() => idle), () => idle);
  const L = useMemo(() => choiceLayout({ width, height, top, bottom, quest: play === 'quest', turns: v.turns }), [width, height, top, bottom, play, v.turns]);
  const font = useReadingFont();

  if (!flow || v.stage === 'loading') return null;
  const leave = () => {
    void flow.flush().finally(onExit);
  };

  if (v.stage === 'done' || v.stage === 'failed') {
    const done = v.stage === 'done';
    const quest = play === 'quest';
    const pic = Math.round(Math.min(150, height * 0.2));
    return <View testID={`choice-game-${play}`} style={[s.root, { top, bottom: Math.max(bottom, 0) }]}>
      <View style={[s.endCard, { width: Math.min(width - 24, 560) }]}>
        <View style={s.endArt}>
          {done && quest ? <Princess size={Math.round(Math.min(220, height * 0.3))} still={still} celebration look={look} /> : null}
          <WordPicture kind={playIcon(play)} size={pic} />
        </View>
        {done && quest ? <WalkedPath path={v.path} size={Math.round(Math.min(52, (Math.min(width - 24, 560) - 48 - 5 * 8) / 6))} /> : null}
        {done ? <Text testID="choice-line" accessibilityLiveRegion="polite" style={s.endLine}>{lineText(v.line)}</Text> : null}
        <View style={s.endRow}>
          {done ? <ActionButton testID="choice-again" label={label('again')} icon="again" quiet onPress={() => void flow.again()} /> : null}
          {done ? <ActionButton testID="choice-done" label={label('done')} icon="arrow" onPress={leave} /> : <ActionButton testID="choice-castle" label={label('castle')} icon="home" onPress={leave} />}
        </View>
      </View>
    </View>;
  }

  const t = v.task;
  const asking = v.stage === 'ask';
  const answer = v.stage === 'reward' ? v.answer : null;
  const kind: Kind = t?.kind ?? answer?.kind ?? (play === 'quest' ? 'rhyme' : play);
  const lastTried = v.tried[v.tried.length - 1];
  const printA = answer ? (kind === 'story' ? [] : answer.print.slice(0, 1)) : [];
  const printB = answer ? (kind === 'rhyme' ? answer.print.slice(1, 2) : kind === 'story' ? answer.print.slice(0, 1) : []) : [];
  const held = t?.options.find((o) => o.id === v.held) ?? null;

  return <View testID={`choice-game-${play}`} style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {t ? <View testID={`choice-item-${t.itemId}`} pointerEvents="none" style={s.marker} /> : null}

    {/* The bar: the ear, the line, and the turns (dots, or the quest's path). */}
    <View style={[s.bar, at(L.bar)]} />
    <View style={[s.abs, { left: L.ear.x - EAR_PAD, top: L.ear.y - EAR_PAD }]}>
      <EarButton testID="choice-hear" label={label('hear')} onPress={() => flow.hear()} glow={v.listening || v.nudge} still={still} size={L.ear.w} />
    </View>
    <View style={[s.text, at(L.text)]}>
      <Text testID="choice-line" accessibilityLiveRegion="polite" numberOfLines={3} style={[s.line, L.text.w < 220 ? s.lineSmall : null]}>{lineText(v.line)}</Text>
      {asking && v.listening ? <View testID="choice-listening" style={s.listening}><MagicIcon kind="ear" size={20} /><Text style={s.listeningText}>{label('listening')}</Text></View> : null}
    </View>
    {L.dots ? <View testID="choice-path" style={[s.dots, at(L.dots)]}><TurnDots turn={v.turn} turns={v.turns} done={false} label={label('turn', { turn: v.turn, turns: v.turns })} /></View> : null}
    {L.path ? <QuestPath L={L} v={v} /> : null}

    {/* The stage: what is asked, and the answer's frame. */}
    {t ? <Slot rect={L.slots[0]} printH={L.printH} print={printA} size={L.print} font={font}
      testID={t.story ? `choice-story-${t.story}` : `choice-picture-${t.word ?? t.subject}`} label={t.story ? label('story') : label('picture')} onPress={() => flow.hear()}>
      <Bob pulse={kind === 'rhyme' && answer ? v.pulse : 0} still={still}><Pictures kinds={t.pictures} box={L.slots[0].w - 20} height={L.slots[0].h - (printA.length ? L.printH : 0) - 16} /></Bob>
      {kind === 'sort' && v.hint && asking ? <View style={s.hintSpot}><View testID="choice-revealed" accessibilityLabel={label('hint', { letter: v.hint })} style={s.hint}><Text style={[s.hintLetter, font.bold]}>{v.hint}</Text></View></View> : null}
    </Slot> : null}
    <Frame L={L} v={v} kind={kind} held={held} printB={printB} font={font} still={still} onToy={() => flow.toy()} />

    {/* The three choices. */}
    {t?.options.map((o, i) => {
      const rect = L.choices[i];
      if (!rect) return null;
      const tried = v.tried.includes(o.id);
      const chosen = answer?.optionId === o.id;
      const aside = asking && v.shown !== null && v.shown !== o.id;
      const state: TileState = answer ? (chosen ? 'chosen' : 'unchosen') : tried ? 'tried' : asking && (v.listening || aside) ? 'waiting' : 'live';
      return <Tile key={o.id} rect={rect} option={o} kind={kind} index={i} state={state} held={v.held === o.id} shine={asking && v.shown === o.id}
        shake={o.id === lastTried ? v.miss : 0} still={still} font={font}
        locked={asking && (v.listening || aside)} disabled={!asking || tried} onPress={() => void flow.tap(o.id)} />;
    })}

    {/* The action row: Help, and the star that chooses (or Next once answered). */}
    {asking ? <View style={[s.abs, s.centre, at(L.help)]} pointerEvents="box-none">
      <HelpButton testID="choice-help" label={v.nextHelp?.demonstrated ? label('showMe') : label('help')} width={L.help.w} locked={v.listening} disabled={!v.nextHelp} onPress={() => void flow.help()} />
    </View> : null}
    {asking && t?.pickUp ? <View style={[s.abs, s.centre, { left: L.star.x - EAR_PAD, top: L.star.y - EAR_PAD }]}>
      <Glow on={held !== null && !v.listening} still={still} radius={L.star.w / 2}>
        <Pressable testID="choice-star" accessibilityLabel={label('star')} locked={v.listening} onPress={() => void flow.star()} style={[s.star, { width: L.star.w, height: L.star.h, borderRadius: L.star.w / 2 }, held ? s.starReady : null]}>
          <View style={v.listening ? s.dim60 : null}><MagicIcon kind="star" size={Math.round(L.star.w * 0.78)} /></View>
        </Pressable>
      </Glow>
    </View> : null}
    {v.stage === 'reward' ? <View style={[s.abs, s.centre, at(L.next)]} pointerEvents="box-none">
      <ActionButton testID="choice-next" label={label('next')} icon="arrow" width={L.next.w} onPress={() => void flow.next()} />
    </View> : null}
  </View>;
}

/** The quest's path: five stepping stones, each carrying its turn's game picture (done gold, now ringed), to the castle. */
function QuestPath({ L, v }: { L: ChoiceLayout; v: ChoiceView }) {
  const finished = v.stage === 'done';
  return <View testID="quest-path" accessibilityLabel={label('path')} style={[s.abs, s.path, at(L.path!)]}>
    {L.stones.map((r, i) => {
      const n = i + 1;
      const done = finished || n < v.turn || (n === v.turn && v.stage === 'reward');
      const now = !done && n === v.turn;
      const k = v.path[i];
      return <View key={n} testID={`quest-stone-${n}${done ? '-done' : now ? '-now' : ''}`} accessibilityLabel={label('stone', { turn: n })}
        style={[s.stone, { left: r.x - L.path!.x, top: r.y - L.path!.y, width: r.w, height: r.h, borderRadius: r.w / 2 }, done && s.stoneDone, now && s.stoneNow]}>
        {k ? <WordPicture kind={CHOICE_GAMES.games[k].icon as IconKind} size={Math.round(r.w * 0.62)} /> : null}
      </View>;
    })}
    {L.castle ? <View testID={finished ? 'quest-castle-done' : 'quest-castle'} accessibilityLabel={label('questCastle')}
      style={[s.castle, { left: L.castle.x - L.path!.x, top: L.castle.y - L.path!.y, width: L.castle.w, height: L.castle.h }]}>
      <MagicIcon kind="home" size={Math.round(L.castle.w * 0.86)} color={finished ? P.gold : P.stoneEdge} />
    </View> : null}
  </View>;
}

/** The quest's end: every stone walked (gold, with its game's picture) and the castle lit. */
function WalkedPath({ path, size }: { path: readonly Kind[]; size: number }) {
  return <View testID="quest-path" accessibilityLabel={label('path')} style={s.walked}>
    {path.map((k, i) => <View key={i} testID={`quest-stone-${i + 1}-done`} accessibilityLabel={label('stone', { turn: i + 1 })} style={[s.stone, s.stoneDone, s.walkedStone, { width: size, height: size, borderRadius: size / 2 }]}>
      <WordPicture kind={CHOICE_GAMES.games[k].icon as IconKind} size={Math.round(size * 0.62)} />
    </View>)}
    <View testID="quest-castle-done" accessibilityLabel={label('questCastle')}><MagicIcon kind="home" size={size} color={P.gold} /></View>
  </View>;
}

/** One or two pictures, side by side, as big as the slot allows. */
function Pictures({ kinds, box, height }: { kinds: readonly IconKind[]; box: number; height: number }) {
  const n = Math.max(1, kinds.length);
  const size = Math.round(Math.max(40, Math.min(height, (box - (n - 1) * 8) / n) * (n > 1 ? 0.95 : 0.82)));
  return <View style={s.pictures}>{kinds.map((k) => <WordPicture key={k} kind={k} size={size} />)}</View>;
}

/** A printed word in the reading typeface, its gold letters marked. Only ever after the answer. */
function PrintedWord({ p, size, font }: { p: Print; size: number; font: ReadingFont }) {
  const [a, b] = p.gold ?? [0, 0];
  return <Text testID={`choice-print-${p.word}`} style={[s.print, { fontSize: size, lineHeight: Math.round(size * 1.25) }, font.bold]}>
    {p.word.slice(0, a)}{p.gold ? <Text style={s.gold}>{p.word.slice(a, b)}</Text> : null}{p.word.slice(b)}
  </Text>;
}

/** A stage slot: a solid card with its pictures and, after the answer, a print band at its foot. */
function Slot({ rect, printH, print, size, font, testID, label: name, onPress, disabled = false, children, tone = 'ice' }: {
  rect: Rect; printH: number; print: Print[]; size: number; font: ReadingFont; testID?: string; label: string; onPress: () => void; disabled?: boolean; children: ReactNode; tone?: 'ice' | 'paper';
}) {
  return <Pressable testID={testID} accessibilityLabel={name} onPress={onPress} disabled={disabled} style={[s.slot, tone === 'paper' ? s.slotPaper : null, at(rect)]}>
    <View style={s.slotArt}>{children}</View>
    {print.length ? <View style={[s.printBand, { height: printH }]}>{print.map((p) => <PrintedWord key={p.word} p={p} size={size} font={font} />)}</View> : null}
  </Pressable>;
}

/** The answer's frame: the picture picked up (or the empty horse or book), the chest, the bunny on her stones; after the answer, the toy. */
function Frame({ L, v, kind, held, printB, font, still, onToy }: { L: ChoiceLayout; v: ChoiceView; kind: Kind; held: ChoiceOption | null; printB: Print[]; font: ReadingFont; still: boolean; onToy: () => void }) {
  const rect = L.slots[1];
  const answer = v.stage === 'reward' ? v.answer : null;
  const art = rect.h - (printB.length ? L.printH : 0) - 16;
  const box = rect.w - 20;
  if (answer) {
    // The toy: tap it, three plays at most. NEXT is there from the start.
    return <Slot rect={rect} printH={L.printH} print={printB} size={L.print} font={font} testID="choice-payoff" label={label('toy')} onPress={onToy} disabled={v.plays >= MAX_PLAYS} tone="paper">
      {kind === 'rhyme' ? <Bob pulse={v.pulse} still={still}><WordPicture kind={answer.value as IconKind} size={Math.round(Math.min(art, box) * 0.72)} /><MagicIcon kind="horse" size={Math.round(Math.min(art, box) * 0.3)} /></Bob> : null}
      {kind === 'sort' ? <Chest open size={Math.min(art, box)} letter={answer.value} font={font} gems={v.plays} pulse={v.pulse} still={still} /> : null}
      {kind === 'hop' ? <Bunny size={Math.min(art, box)} beat={v.beat} still={still} /> : null}
      {kind === 'story' ? <Book size={Math.min(art, box)} stars={v.plays} pulse={v.pulse} still={still} /> : null}
    </Slot>;
  }
  if (kind === 'sort') return <View style={[s.slot, s.slotPaper, at(rect)]} pointerEvents="none"><Chest open={false} size={Math.min(art, box)} letter={null} font={font} gems={0} pulse={0} still={still} /></View>;
  if (kind === 'hop') return <View style={[s.slot, s.slotPaper, at(rect)]} pointerEvents="none"><Bunny size={Math.min(art, box)} beat={v.beat} still={still} /></View>;
  // Rhymes and Stories: the frame holds the picture picked up, or shows the horse or the book. Always solid.
  return <View testID={held ? `choice-held-${held.value}` : 'choice-held'} accessibilityLabel={held ? label('held') : label('empty')} style={[s.slot, s.slotPaper, held ? s.slotHeld : null, at(rect)]}>
    <View style={s.slotArt}>
      {held ? <WordPicture kind={held.value as IconKind} size={Math.round(Math.min(art, box) * 0.82)} /> : <View style={s.dim60}><WordPicture kind={FRAME[kind]} size={Math.round(Math.min(art, box) * 0.62)} /></View>}
    </View>
  </View>;
}

/** Rides up and down on each play. */
function Bob({ pulse, still, children }: { pulse: number; still: boolean; children: ReactNode }) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (!pulse || still) return;
    const go = { duration: 280, easing: Easing.inOut(Easing.quad) };
    y.set(withSequence(withTiming(-22, go), withTiming(0, go), withTiming(-14, go), withTiming(0, go)));
  }, [pulse, still, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return <Animated.View style={[s.bob, style]}>{children}</Animated.View>;
}

/** The chest: closed while asking; open with its letter after the answer, a gem popping out on each play. */
function Chest({ open, size, letter, font, gems, pulse, still }: { open: boolean; size: number; letter: string | null; font: ReadingFont; gems: number; pulse: number; still: boolean }) {
  const pop = useSharedValue(1);
  useEffect(() => {
    if (!pulse) return;
    if (still) { pop.set(1); return; }
    pop.set(0);
    pop.set(withTiming(1, { duration: 420, easing: Easing.out(Easing.back(2)) }));
  }, [pulse, still, pop]);
  const gem = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - pop.get()) * size * 0.25 }, { scale: 0.4 + 0.6 * pop.get() }] }));
  const chest = Math.round(size * 0.66);
  return <View style={[s.chestWrap, { width: size, height: size }]}>
    <View style={[s.gems, { height: size * 0.3 }]}>
      {Array.from({ length: gems }, (_, i) => i === gems - 1
        ? <Animated.View key={i} style={gem}><MagicIcon kind="gem" size={Math.round(size * 0.24)} /></Animated.View>
        : <MagicIcon key={i} kind="gem" size={Math.round(size * 0.2)} />)}
    </View>
    <View>
      <MagicIcon kind={open ? 'chestOpen' : 'chest'} size={chest} />
      {letter ? <View style={[s.chestLetter, { top: chest * 0.5, width: chest, height: chest * 0.4 }]}><View style={[s.chestPlate, { height: chest * 0.36, minWidth: chest * 0.32, borderRadius: chest * 0.09 }]}><Text style={[s.chestText, { fontSize: Math.round(chest * 0.27), lineHeight: Math.round(chest * 0.34) }, font.bold]}>{letter}</Text></View></View> : null}
    </View>
  </View>;
}

/** The bunny and her three stones: `beat` stones are lit and she sits on the last lit one. */
function Bunny({ size, beat, still }: { size: number; beat: number; still: boolean }) {
  const stone = Math.round(size * 0.26);
  const gap = Math.round((size - 3 * stone) / 4);
  const bunny = Math.round(size * 0.44);
  // Stone n's centre; the start is at the left edge, before stone 1.
  const cx = (n: number) => (n <= 0 ? Math.max(bunny / 2, gap) : gap + (n - 1) * (stone + gap) + stone / 2);
  const to = cx(beat);
  const x = useSharedValue(to);
  const y = useSharedValue(0);
  useEffect(() => {
    if (still) { x.set(to); y.set(0); return; }
    const half = { duration: Math.round(BEAT_MS * 0.4), easing: Easing.out(Easing.quad) };
    x.set(withTiming(to, { duration: Math.round(BEAT_MS * 0.8) }));
    y.set(withSequence(withTiming(-size * 0.16, half), withTiming(0, { ...half, easing: Easing.in(Easing.quad) })));
  }, [to, beat, still, size, x, y]);
  const hopper = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() - bunny / 2 }, { translateY: y.get() }] }));
  const base = size * 0.78;
  return <View style={{ width: size, height: size }} accessibilityLabel={label('stones', { count: beat })}>
    {[1, 2, 3].map((n) => <View key={n} testID={n <= beat ? `choice-stone-lit-${n}` : `choice-stone-${n}`} style={[s.hopStone, { left: cx(n) - stone / 2, top: base, width: stone, height: stone * 0.62, borderRadius: stone }, n <= beat && s.hopStoneLit]} />)}
    <Animated.View pointerEvents="none" style={[s.hopper, { top: base - bunny * 0.86 }, hopper]}><WordPicture kind="bunny" size={bunny} /></Animated.View>
  </View>;
}

/** The book, and a gold star on it for each play (the 3D star picture). */
function Book({ size, stars, pulse, still }: { size: number; stars: number; pulse: number; still: boolean }) {
  const pop = useSharedValue(1);
  useEffect(() => {
    if (!pulse) return;
    if (still) { pop.set(1); return; }
    pop.set(0);
    pop.set(withTiming(1, { duration: 480, easing: Easing.out(Easing.back(2.2)) }));
  }, [pulse, still, pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.3 + 0.7 * pop.get() }, { rotate: `${(1 - pop.get()) * -40}deg` }] }));
  const star = Math.round(size * 0.34);
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
    <WordPicture kind="book" size={Math.round(size * 0.72)} />
    {stars > 0 ? <Animated.View style={[s.bookStar, { top: size * 0.04 }, style]}><WordPicture kind="star" size={star} /></Animated.View> : null}
    {stars > 1 ? <View style={[s.bookStar, { top: size * 0.12, left: size * 0.06 }]}><WordPicture kind="star" size={Math.round(star * 0.6)} /></View> : null}
    {stars > 2 ? <View style={[s.bookStar, { top: size * 0.12, right: size * 0.06 }]}><WordPicture kind="star" size={Math.round(star * 0.6)} /></View> : null}
  </View>;
}

type TileState = 'live' | 'waiting' | 'tried' | 'chosen' | 'unchosen';
/** A choice tile: always opaque; only its contents fade. */
function Tile({ rect, option, kind, index, state, held, shine, shake, still, font, locked, disabled, onPress }: {
  rect: Rect; option: ChoiceOption; kind: Kind; index: number; state: TileState; held: boolean; shine: boolean; shake: number; still: boolean; font: ReadingFont; locked: boolean; disabled: boolean; onPress: () => void;
}) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (shake && !still) x.set(withSequence(withTiming(-9, { duration: 60 }), withTiming(9, { duration: 80 }), withTiming(-5, { duration: 70 }), withTiming(0, { duration: 60 })));
  }, [shake, still, x]);
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const art = Math.min(rect.w, rect.h) - 18;
  const name = kind === 'sort' ? label('chest', { letter: option.value }) : kind === 'hop' ? label('claps', { count: option.value }) : label('option', { number: index + 1 });
  return <Pressable testID={`choice-option-${option.value}`} accessibilityLabel={name} accessibilityState={{ selected: held }} onPress={onPress} locked={locked} disabled={disabled}
    style={[s.tile, TILE[state], held && s.tileHeld, shine && s.tileShine, at(rect)]}>
    <Animated.View style={[s.tileArt, { opacity: FADE[state] }, moving]}>
      {kind === 'sort' ? <ChestTile size={art} letter={option.value} font={font} />
        : kind === 'hop' ? <Claps size={art} count={Number(option.value)} font={font} />
          : <WordPicture kind={option.value as IconKind} size={Math.round(art * 0.8)} />}
    </Animated.View>
  </Pressable>;
}
const FADE: Record<TileState, number> = { live: 1, waiting: 0.6, tried: 0.35, chosen: 1, unchosen: 0.3 };

/** A chest choice: the chest with its letter on the front, in the reading typeface. */
function ChestTile({ size, letter, font }: { size: number; letter: string; font: ReadingFont }) {
  const c = Math.round(size * 0.9);
  return <View style={{ width: c, height: c }}>
    <MagicIcon kind="chest" size={c} />
    <View style={[s.chestLetter, { top: c * 0.46, width: c, height: c * 0.44 }]}>
      <View style={[s.chestPlate, { height: c * 0.4, minWidth: c * 0.36, borderRadius: c * 0.1 }]}><Text style={[s.chestText, { fontSize: Math.round(c * 0.3), lineHeight: Math.round(c * 0.38) }, font.bold]}>{letter}</Text></View>
    </View>
  </View>;
}

/** A clap choice: its number, and that many stones under it, like the bunny's. */
function Claps({ size, count, font }: { size: number; count: number; font: ReadingFont }) {
  const dot = Math.round(Math.min(size * 0.26, (size - 16) / 3));
  return <View style={s.claps}>
    <Text style={[s.clapNumber, { fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.52) }, font.bold]}>{count}</Text>
    <View style={s.clapRow}>{Array.from({ length: count }, (_, i) => <MagicIcon key={i} kind="stone" size={dot} />)}</View>
  </View>;
}

const TILE = StyleSheet.create({
  live: { backgroundColor: P.ice, borderColor: P.white },
  waiting: { backgroundColor: P.cream, borderColor: P.edge },
  tried: { backgroundColor: P.stone, borderColor: P.stoneEdge },
  chosen: { backgroundColor: P.ice, borderColor: P.gold, borderWidth: 4 },
  unchosen: { backgroundColor: P.paper, borderColor: P.edge },
});

const s = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', padding: 12 },
  abs: { position: 'absolute' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  marker: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  bar: { position: 'absolute', backgroundColor: P.paper, borderRadius: 28, borderWidth: 2, borderColor: P.edge, boxShadow: `0 5px 16px ${P.shadow}` },
  text: { position: 'absolute', justifyContent: 'center', gap: 4 },
  line: { color: P.ink, fontSize: 21, lineHeight: 26, fontWeight: '800' },
  lineSmall: { fontSize: 16, lineHeight: 20 },
  listening: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: P.cream, borderRadius: 14, borderWidth: 2, borderColor: P.gold, paddingHorizontal: 8, paddingVertical: 2 },
  listeningText: { color: P.dim, fontSize: 14, fontWeight: '700' },
  dots: { position: 'absolute', alignItems: 'flex-end', justifyContent: 'center' },
  path: { backgroundColor: P.cream, borderRadius: 40, borderWidth: 2, borderColor: P.edge },
  stone: { position: 'absolute', backgroundColor: P.stone, borderWidth: 3, borderColor: P.stoneEdge, alignItems: 'center', justifyContent: 'center' },
  stoneDone: { backgroundColor: P.gold, borderColor: P.gold },
  stoneNow: { backgroundColor: P.paper, borderColor: P.deep, borderWidth: 4 },
  castle: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  slot: { position: 'absolute', backgroundColor: P.ice, borderRadius: 30, borderWidth: 3, borderColor: P.white, overflow: 'hidden', boxShadow: `0 4px 0 ${P.shadow}` },
  slotPaper: { backgroundColor: P.paper, borderColor: P.edge },
  slotHeld: { borderColor: P.gold, borderWidth: 4, backgroundColor: P.ice },
  slotArt: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  printBand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: P.cream, borderTopWidth: 2, borderTopColor: P.edge },
  print: { color: P.ink, fontWeight: '800', letterSpacing: 1 },
  gold: { color: P.gold, textShadowColor: P.bark, textShadowRadius: 1, textShadowOffset: { width: 0, height: 1 } },
  pictures: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  hintSpot: { position: 'absolute', right: 10, top: 10 },
  hint: { minWidth: 58, height: 58, paddingHorizontal: 10, borderRadius: 18, backgroundColor: P.cream, borderWidth: 3, borderColor: P.gold, alignItems: 'center', justifyContent: 'center' },
  hintLetter: { color: P.deep, fontSize: 36, lineHeight: 46, fontWeight: '800' },
  bob: { alignItems: 'center' },
  chestWrap: { alignItems: 'center', justifyContent: 'flex-end' },
  gems: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
  chestLetter: { position: 'absolute', left: 0, alignItems: 'center', justifyContent: 'center' },
  chestPlate: { backgroundColor: P.cream, borderWidth: 2, borderColor: P.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  chestText: { color: P.ink, fontWeight: '800', textAlign: 'center', includeFontPadding: false },
  hopStone: { position: 'absolute', backgroundColor: P.stone, borderWidth: 3, borderColor: P.stoneEdge },
  hopStoneLit: { backgroundColor: P.gold, borderColor: P.bark },
  hopper: { position: 'absolute', left: 0 },
  bookStar: { position: 'absolute' },
  tile: { position: 'absolute', borderRadius: 26, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: `0 4px 0 ${P.shadow}` },
  tileHeld: { borderColor: P.gold, borderWidth: 5 },
  tileShine: { borderColor: P.gold, borderWidth: 5, boxShadow: `0 0 22px ${P.gold}` },
  tileArt: { alignItems: 'center', justifyContent: 'center' },
  claps: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  clapNumber: { color: P.deep, fontWeight: '800', includeFontPadding: false },
  clapRow: { flexDirection: 'row', gap: 4 },
  star: { backgroundColor: P.cream, borderWidth: 3, borderColor: P.gold, alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 0 ${P.shadow}` },
  starReady: { backgroundColor: P.paper },
  dim60: { opacity: 0.6 },
  endCard: { alignItems: 'center', gap: 16, backgroundColor: P.paper, borderRadius: 40, borderWidth: 3, borderColor: P.gold, padding: 24, boxShadow: `0 8px 22px ${P.shadow}` },
  endArt: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 12 },
  walked: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  walkedStone: { position: 'relative' },
  endLine: { color: P.ink, fontSize: 28, lineHeight: 35, fontWeight: '800', textAlign: 'center' },
  endRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center' },
});
