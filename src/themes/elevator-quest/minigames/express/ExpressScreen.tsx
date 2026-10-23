// Elevator Express V0.1: the screen draws flow.ts. A street of buildings scrolls on the UI thread (one
// Reanimated transform, no per-frame React work); only the stretch near the cart is mounted. Plain
// views, no canvas; vectors only; approved sounds only (registry.ts).
//
// Reduced Motion: the street still moves (it is the game) but nothing bounces, jumps, flies or
// spins: bumps and pickups show as a still change, a thrown kit appears at its door, the elevator
// appears at its floor.
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useFrameCallback, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { PLAYTEST_ENABLED } from '../../../../config/flags';
import { fill } from '../../../content/missionCopy';
import { EXPRESS as C } from '../../content/minigames';
import { GIVEN, eq, labelAt, readingAt } from '../../ui/palette';
import { BackToElevatorButton } from '../hostControls';
import type { MiniGameScreenProps } from '../types';
import { createExpressFlow, lineText, reachable, taskLine, type ExpressFlow, type ExpressView, type Notes, type Task } from './flow';
import { END, LANES, ROUTE, SPEED, type Building, type Thing } from './route';

const noop = () => () => undefined;
/** Mounted stretch around the cart (world points): behind, ahead. */
const WINDOW = { behind: 700, ahead: 2_600 };
const HUES = [eq.charcoalLight, eq.surfaceHigh, eq.steelDark, eq.deepBlueLight, eq.steel] as const;

function useFlow({ session, sound }: Pick<MiniGameScreenProps, 'session' | 'sound'>): [ExpressFlow | null, ExpressView | null] {
  const [flow, setFlow] = useState<ExpressFlow | null>(null);
  useEffect(() => {
    let cancelled = false;
    const f = createExpressFlow({ session, sound });
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setFlow(f);
      void f.start(Date.now());
    });
    return () => {
      cancelled = true;
      f.dispose();
    };
  }, [session, sound]);
  const view = useSyncExternalStore(flow ? flow.subscribe : noop, flow ? flow.view : () => null, flow ? flow.view : () => null);
  return [flow, view];
}

export function ExpressScreen({ session, size, insets, text, reducedMotion, suspended, sound, onExit }: MiniGameScreenProps) {
  const [flow, v] = useFlow({ session, sound });
  const { width, height } = size;
  const portrait = height > width;
  const label = text.label;
  const cartX = Math.round(width * (portrait ? 0.16 : 0.18));
  const road = { top: Math.round(height * (portrait ? 0.62 : 0.6)), lane: Math.round(height * (portrait ? 0.075 : 0.085)) };
  const floorH = Math.max(14, Math.round(height * 0.032));

  // The scroll: the flow's position, advanced on the UI thread while the cart runs.
  const segX = useSharedValue(0);
  const segAt = useSharedValue(0);
  const running = useSharedValue(false);
  const cam = useSharedValue(0);
  const frame = useFrameCallback(() => {
    const x = running.get() ? Math.min(END, segX.get() + ((Date.now() - segAt.get()) * SPEED) / 1000) : segX.get();
    cam.set(x - cartX);
  }, false);
  useEffect(() => {
    if (!v) return;
    segX.set(v.x);
    segAt.set(v.at);
    running.set(v.running);
    cam.set(v.x - cartX);
    frame.setActive(v.running);
  }, [v, v?.x, v?.at, v?.running, segX, segAt, running, cam, cartX, frame]);
  const worldStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -cam.get() }] }));
  const skylineStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -((cam.get() * 0.3) % 400) }] }));

  // JS ticker: events (stops, bumps, tow) and the mounted stretch. Never per-frame.
  // The chunk belongs to one driving segment (its start time): a new segment starts from the flow's x.
  const [chunk, setChunk] = useState({ n: 0, at: -1 });
  const [reach, setReach] = useState<'kit' | 'parcel' | null>(null);
  useEffect(() => {
    if (!flow || !v || v.stage !== 'driving' || suspended) return;
    const id = setInterval(() => {
      const now = Date.now();
      flow.tick(now);
      const x = flow.xAt(now);
      const n = Math.floor(x / 500);
      const at = flow.view().at;
      setChunk((c) => (c.n === n && c.at === at ? c : { n, at }));
      setReach(reachable(flow.view(), x));
    }, 50);
    return () => clearInterval(id);
  }, [flow, v, v?.stage, suspended]);
  useEffect(() => {
    if (suspended) flow?.pause(Date.now());
  }, [suspended, flow]);

  const leave = () => {
    if (!flow) return onExit();
    void flow.leave(Date.now()).finally(onExit);
  };

  if (!flow || !v) return <View style={[styles.root, { width, height }]} testID="express" />;
  const near = (chunk.at === v.at ? chunk.n : Math.floor(v.x / 500)) * 500;
  const buildings = ROUTE.buildings.filter((b) => b.x + b.width > near - WINDOW.behind && b.x < near + WINDOW.ahead);
  const things = ROUTE.things.filter((t) => t.x > near - WINDOW.behind && t.x < near + WINDOW.ahead);

  return (
    <View style={[styles.root, { width, height }]} testID="express">
      <View style={[styles.sky, { height: road.top }]} />
      <Animated.View style={[styles.skyline, { top: road.top * 0.3, height: road.top * 0.7 }, skylineStyle]} pointerEvents="none">
        {Array.from({ length: 12 }, (_, i) => (
          <View key={i} style={[styles.far, { left: i * 100, height: 40 + ((i * 37) % 90), width: 70 }]} />
        ))}
      </Animated.View>
      <View style={[styles.road, { top: road.top, height: height - road.top }]} />
      {Array.from({ length: LANES - 1 }, (_, i) => (
        <View key={i} style={[styles.laneLine, { top: road.top + road.lane * (i + 1.5) }]} />
      ))}
      <Animated.View style={[styles.world, { top: 0, height }, worldStyle]} pointerEvents="box-none">
        {buildings.map((b) => (
          <BuildingView key={b.id} b={b} v={v} base={road.top} floorH={floorH} label={label} reduced={reducedMotion} />
        ))}
        {things.map((t) => (
          <ThingView key={t.id} t={t} touched={v.touched.includes(t.id)} top={road.top + road.lane * (t.lane + 0.6)} size={road.lane} reduced={reducedMotion} />
        ))}
        <Flight v={v} top={road.top + road.lane * (v.lane + 0.4)} base={road.top} reduced={reducedMotion} />
      </Animated.View>
      <Cart v={v} left={cartX} top={road.top + road.lane * (v.lane + 0.35)} size={road.lane} reduced={reducedMotion} />

      <Hud v={v} label={label} insets={insets} portrait={portrait} onExit={leave} />
      {v.stage === 'driving' ? <Controls flow={flow} v={v} reach={reach} label={label} insets={insets} width={width} /> : null}
      {v.stage === 'task' && v.task ? <TaskCard flow={flow} v={v} task={v.task} text={text} width={width} height={height} insets={insets} /> : null}
      {v.stage === 'intro' || v.stage === 'done' || v.stage === 'unsupported' ? <StartCard flow={flow} v={v} text={text} onExit={leave} /> : null}
    </View>
  );
}

function BuildingView({ b, v, base, floorH, label, reduced }: { b: Building; v: ExpressView; base: number; floorH: number; label: number; reduced: boolean }) {
  const h = b.floors * floorH + floorH;
  const fixed = v.delivered.includes(b.id);
  const kitHere = v.carrying?.buildingId === b.id;
  const wants = b.role === 'parcel' && !fixed;
  const dark = b.role === 'target' && !fixed;
  const lastFix = v.fixed?.buildingId === b.id ? v.fixed : null;
  // The elevator: rides to its floor (the answer's floor when the kit was a floor) when the kit lands.
  const target = lastFix?.floor != null ? Math.min(b.floors, Math.max(1, lastFix.floor - (lastFix.floor > b.floors ? lastFix.floor - b.floors : 0))) : fixed ? b.floors : 1;
  const car = useSharedValue(fixed ? target : 1);
  useEffect(() => {
    car.set(reduced || !lastFix ? target : withTiming(target, { duration: 1400, easing: Easing.inOut(Easing.cubic) }));
  }, [target, reduced, lastFix, car]);
  const carStyle = useAnimatedStyle(() => ({ bottom: (car.get() - 1) * floorH + floorH * 0.15 }));
  const shown = lastFix?.floor ?? null;
  return (
    <View
      testID={`ex-building-${b.place ?? b.id}`}
      accessibilityLabel={b.place ? C.buildings[b.place]!.sign : undefined}
      style={[styles.building, { left: b.x, top: base - h, width: b.width, height: h, backgroundColor: HUES[b.hue % HUES.length] }]}
    >
      <View style={styles.windows}>
        {Array.from({ length: Math.min(b.floors, 12) * 2 }, (_, i) => (
          <View key={i} style={[styles.window, { height: floorH * 0.5 }, dark ? styles.windowDark : fixed ? styles.windowLit : styles.windowDim]} />
        ))}
      </View>
      <View style={[styles.shaft, { height: h - floorH }]}>
        <Animated.View style={[styles.car, { height: floorH * 0.8 }, dark ? styles.carDark : styles.carLit, carStyle]}>
          {shown != null ? (
            <Text allowFontScaling={false} style={[labelAt(Math.min(16, Math.max(12, Math.round(floorH * 0.6)))), styles.carText]}>
              {shown}
            </Text>
          ) : null}
        </Animated.View>
      </View>
      {b.place ? (
        <View style={styles.sign}>
          <Text allowFontScaling={false} numberOfLines={1} style={[labelAt(label), styles.signText]}>
            {C.buildings[b.place]!.sign}
          </Text>
        </View>
      ) : null}
      <View style={[styles.door, { height: floorH * 1.4, width: Math.max(28, b.width * 0.18) }, (kitHere || wants) && styles.doorGlow, fixed && styles.doorDone]} />
      {wants ? <View style={styles.parcelFlag} /> : null}
      {fixed ? (
        <View style={styles.check}>
          <Text allowFontScaling={false} style={[labelAt(label), styles.checkText]}>
            ✓
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ThingView({ t, touched, top, size, reduced }: { t: Thing; touched: boolean; top: number; size: number; reduced: boolean }) {
  const s = Math.round(size * 0.7);
  const knock = useSharedValue(0);
  useEffect(() => {
    if (touched && !reduced) knock.set(withTiming(1, { duration: 450 }));
    else knock.set(touched ? 1 : 0);
  }, [touched, reduced, knock]);
  const style = useAnimatedStyle(() => {
    const k = knock.get();
    if (t.kind === 'cone') return { transform: [{ translateY: reduced ? 0 : -k * s }, { rotate: `${k * 80}deg` }] };
    if (t.kind === 'robot') return { transform: [{ rotate: `${reduced ? 0 : k * 360}deg` }] };
    if (t.kind === 'bolt') return { opacity: 1 - k, transform: [{ translateY: reduced ? 0 : -k * s }] };
    if (t.kind === 'puddle') return { transform: [{ scaleX: 1 + k * 0.6 }] };
    return {};
  });
  const body =
    t.kind === 'cone' ? styles.cone : t.kind === 'puddle' ? styles.puddle : t.kind === 'ramp' ? styles.ramp : t.kind === 'robot' ? styles.robot : styles.bolt;
  const w = t.kind === 'puddle' || t.kind === 'ramp' ? s * 1.8 : t.kind === 'bolt' ? s * 0.6 : s;
  const hgt = t.kind === 'puddle' ? s * 0.35 : t.kind === 'ramp' ? s * 0.55 : t.kind === 'bolt' ? s * 0.6 : s;
  return <Animated.View testID={`ex-thing-${t.kind}`} pointerEvents="none" style={[styles.thing, body, { left: t.x - w / 2, top: top + (s - hgt), width: w, height: hgt }, style]} />;
}

function Cart({ v, left, top, size, reduced }: { v: ExpressView; left: number; top: number; size: number; reduced: boolean }) {
  const y = useSharedValue(top);
  const hop = useSharedValue(0);
  const bump = useSharedValue(0);
  useEffect(() => {
    y.set(reduced ? top : withTiming(top, { duration: 160 }));
  }, [top, reduced, y]);
  const lastTouched = v.touched[v.touched.length - 1];
  const ramp = lastTouched?.startsWith('t') ? ROUTE.things.find((t) => t.id === lastTouched) : undefined;
  useEffect(() => {
    if (!ramp || reduced) return;
    if (ramp.kind === 'ramp') hop.set(withSequence(withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 650, easing: Easing.in(Easing.quad) })));
    else bump.set(withSequence(withTiming(1, { duration: 90 }), withTiming(-1, { duration: 120 }), withTiming(0, { duration: 120 })));
  }, [lastTouched, ramp, reduced, hop, bump]);
  const s = Math.round(size * 1.1);
  const style = useAnimatedStyle(() => ({ top: y.get() - hop.get() * s * 1.2, transform: [{ rotate: `${bump.get() * 6 - hop.get() * 8}deg` }] }));
  return (
    <Animated.View testID="ex-cart" accessibilityLabel={v.carrying ? C.labels.carrying : undefined} pointerEvents="none" style={[styles.cart, { left, width: s * 1.5, height: s }, style]}>
      <View style={styles.cartBody} />
      <View style={styles.cartCab} />
      {v.carrying ? <View testID="ex-kit" style={styles.kit} /> : null}
      <View style={[styles.wheel, { left: s * 0.15 }]} />
      <View style={[styles.wheel, { right: s * 0.15 }]} />
      {v.towUntil > 0 || v.line.key === 'missed' ? <View testID="ex-robot" style={styles.helper} /> : null}
    </Animated.View>
  );
}

function Flight({ v, top, base, reduced }: { v: ExpressView; top: number; base: number; reduced: boolean }) {
  const t = v.lastThrow;
  const p = useSharedValue(1);
  useEffect(() => {
    if (!t) return;
    p.set(0);
    p.set(withTiming(1, { duration: reduced ? 0 : 420, easing: Easing.out(Easing.quad) }));
  }, [t, t?.n, reduced, p]);
  const style = useAnimatedStyle(() => {
    if (!t) return { opacity: 0 };
    const k = p.get();
    const endY = t.hit ? base - 30 : top + 20;
    const x = t.from + (t.to - t.from) * k;
    const y = top + (endY - top) * k - Math.sin(k * Math.PI) * 120;
    return { opacity: k >= 1 ? 0 : 1, left: x, top: y };
  });
  return <Animated.View pointerEvents="none" style={[styles.flying, t?.kit ? styles.kitFlying : styles.parcelFlying, style]} />;
}

function Hud({ v, label, insets, portrait, onExit }: { v: ExpressView; label: number; insets: MiniGameScreenProps['insets']; portrait: boolean; onExit: () => void }) {
  return (
    <View style={[styles.hud, { top: insets.top + 8, left: insets.left + 8, right: insets.right + 8 }]} pointerEvents="box-none">
      <BackToElevatorButton onPress={onExit} size={label} />
      <View style={styles.stats} accessibilityLabel={`${C.labels.deliveries} ${v.delivered.length}. ${C.labels.bolts} ${v.bolts}`}>
        {ROUTE.stops.map((s) => (
          <View key={s.index} style={[styles.dot, s.index < v.stop && styles.dotDone, s.index === v.stop && v.carrying && styles.dotCarry]} />
        ))}
        <Text allowFontScaling={false} style={[labelAt(label), styles.statText]}>
          {C.labels.deliveries} {v.delivered.length}
        </Text>
        <Text allowFontScaling={false} style={[labelAt(label), styles.statText]}>
          {C.labels.bolts} {v.bolts}
        </Text>
      </View>
      <View style={[styles.banner, portrait && styles.bannerRow]} pointerEvents="none">
        <Text testID="ex-line" allowFontScaling={false} numberOfLines={3} style={[labelAt(label + 2), styles.bannerText]}>
          {v.stage === 'driving' ? lineText(v) : ''}
        </Text>
      </View>
    </View>
  );
}

/**
 * An arcade control: it acts the moment a finger lands (Gesture.Tap onBegin, as FloorButton does),
 * never on release and never after a press delay, so a quick tap is never lost.
 */
function ArcadeButton({ testID, label, onDown, disabled = false, selected, style, children }: { testID: string; label: string; onDown: () => void; disabled?: boolean; selected?: boolean; style: StyleProp<ViewStyle>; children: ReactNode }) {
  const tap = Gesture.Tap()
    .maxDuration(60_000)
    .hitSlop(6)
    .enabled(!disabled)
    .onBegin(() => {
      'worklet';
      runOnJS(onDown)();
    });
  return (
    <GestureDetector gesture={tap}>
      <View
        testID={testID}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        aria-disabled={disabled}
        aria-selected={selected}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => {
          if (!disabled) onDown();
        }}
        style={style}
      >
        {children}
      </View>
    </GestureDetector>
  );
}

function Controls({ flow, v, reach, label, insets, width }: { flow: ExpressFlow; v: ExpressView; reach: 'kit' | 'parcel' | null; label: number; insets: MiniGameScreenProps['insets']; width: number }) {
  const big = Math.max(76, Math.min(110, Math.round(width * 0.1)));
  return (
    <>
      <View style={[styles.steer, { left: insets.left + 12, bottom: insets.bottom + 12 }]}>
        <ArcadeButton testID="ex-up" label={C.labels.up} onDown={() => flow.steer(-1, Date.now())} disabled={v.lane === 0} style={[styles.steerBtn, { width: big, height: big * 0.8 }, v.lane === 0 && styles.faded]}>
          <View style={styles.arrowUp} />
        </ArcadeButton>
        <ArcadeButton testID="ex-down" label={C.labels.down} onDown={() => flow.steer(1, Date.now())} disabled={v.lane === LANES - 1} style={[styles.steerBtn, { width: big, height: big * 0.8 }, v.lane === LANES - 1 && styles.faded]}>
          <View style={styles.arrowDown} />
        </ArcadeButton>
      </View>
      <ArcadeButton
        testID="ex-throw"
        label={C.labels.throw}
        selected={reach !== null}
        onDown={() => void flow.throwIt(Date.now())}
        style={[styles.throwBtn, { right: insets.right + 16, bottom: insets.bottom + 16, width: big * 1.35, height: big * 1.35, borderRadius: big }, reach && styles.throwReady]}
      >
        <View style={v.carrying ? styles.kitIcon : styles.parcelIcon} />
        <Text allowFontScaling={false} style={[labelAt(label + 2), styles.throwText]}>
          {C.labels.throw}
        </Text>
      </ArcadeButton>
    </>
  );
}

function TaskCard({ flow, v, task, text, width, height, insets }: { flow: ExpressFlow; v: ExpressView; task: Task; text: MiniGameScreenProps['text']; width: number; height: number; insets: MiniGameScreenProps['insets'] }) {
  const shown = v.hint?.kind === 'showAnswer' ? v.hint.revealed : null;
  const ladder = v.hint?.kind === 'numberLine';
  const givens = v.hint != null;
  const portrait = height > width;
  const btn = Math.max(72, Math.min(120, Math.round((Math.min(width, 900) - 120) / 4.6)));
  const cardW = Math.min(width - 24, portrait ? 600 : 860);
  const note = task.kind === 'place' ? C.notes[task.note] : null;
  // The question stays on the card; a wrong try or a hint speaks underneath it, never over it.
  const ask = taskLine(task);
  const status = v.line.key !== ask.key ? lineText(v) : null;
  return (
    <View style={[styles.cardWrap, { paddingTop: insets.top + 70, paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
      <View testID="ex-task" style={[styles.card, { width: cardW }]}>
        {note ? (
          <Text testID="ex-note" allowFontScaling={false} style={[readingAt(text.question, 'question'), styles.cardText]}>
            {givens ? splitKey(note.text, note.key) : note.text}
          </Text>
        ) : null}
        <Text testID="ex-question" allowFontScaling={false} style={[readingAt(note ? text.passage : text.question, 'question'), styles.cardText]}>
          {lineText({ line: ask })}
        </Text>
        {status ? (
          <Text testID="ex-status" accessibilityLiveRegion="polite" allowFontScaling={false} style={[readingAt(text.passage), styles.status]}>
            {status}
          </Text>
        ) : null}
        {task.kind === 'floor' && ladder ? <Ladder task={task} label={text.label} /> : null}
        {task.kind === 'power' ? <PowerMeter task={task} label={text.label} ladder={ladder} givens={givens} /> : null}
        <View style={[styles.options, task.kind === 'place' && styles.street]}>
          {task.kind === 'place'
            ? C.street.map((place) => {
                const opt = task.options.find((o) => o.value === place);
                const ref = givens && note?.ref.includes(place);
                return (
                  <Pressable
                    key={place}
                    testID={`ex-place-${place}`}
                    accessibilityRole="button"
                    accessibilityLabel={C.buildings[place]!.sign}
                    disabled={!opt || v.tried.includes(opt.id) || v.busy}
                    onPress={() => opt && void flow.choose(opt.id, Date.now())}
                    style={[styles.placeBtn, { width: Math.floor(Math.min(btn * 1.1, (cardW - 36 - 6 - 4 * 6) / 5)), minHeight: btn }, !opt && styles.placeFixed, opt && v.tried.includes(opt.id) && styles.faded, ref && styles.refGlow, shown === place && styles.shine]}
                  >
                    <View style={styles.placeRoof} />
                    <Text allowFontScaling={false} numberOfLines={2} style={[labelAt(Math.max(14, text.label - 2)), styles.placeText]}>
                      {C.buildings[place]!.sign}
                    </Text>
                  </Pressable>
                );
              })
            : task.options.map((o) => (
                <Pressable
                  key={o.id}
                  testID={`ex-option-${o.value}`}
                  accessibilityRole="button"
                  accessibilityLabel={fill(task.kind === 'floor' ? C.labels.floor : C.labels.cell, { value: o.value })}
                  disabled={v.tried.includes(o.id) || v.busy}
                  onPress={() => void flow.choose(o.id, Date.now())}
                  style={[styles.option, { width: btn, height: btn }, v.tried.includes(o.id) && styles.faded, shown === o.value && styles.shine]}
                >
                  <Text allowFontScaling={false} style={[labelAt(Math.round(btn * 0.36)), styles.optionText]}>
                    {task.kind === 'power' ? `+${o.value}` : o.value}
                  </Text>
                </Pressable>
              ))}
        </View>
        {v.help ? (
          <Pressable testID="ex-hint" accessibilityRole="button" accessibilityLabel={v.help.kind === 'showAnswer' ? C.labels.showMe : C.labels.hint} disabled={v.busy} onPress={() => void flow.hint()} style={styles.hintBtn}>
            <Text allowFontScaling={false} style={[labelAt(text.label), styles.hintText]}>
              {v.help.kind === 'showAnswer' ? C.labels.showMe : C.labels.hint}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** The note with its key words bold (the CLUE). */
function splitKey(textLine: string, key: string) {
  const i = textLine.indexOf(key);
  if (i < 0) return textLine;
  return (
    <>
      {textLine.slice(0, i)}
      <Text style={GIVEN}>{key}</Text>
      {textLine.slice(i + key.length)}
    </>
  );
}

function Ladder({ task, label }: { task: Task; label: number }) {
  const steps = Array.from({ length: task.change }, (_, i) => task.start + (task.direction === 'up' ? i + 1 : -(i + 1)));
  return (
    <View testID="ex-ladder" style={styles.ladder} accessibilityLabel={C.lines.ladderFloor}>
      <View style={[styles.rung, styles.rungStart]}>
        <Text allowFontScaling={false} style={[labelAt(label), styles.rungText]}>
          {task.start}
        </Text>
      </View>
      {steps.map((s, i) => (
        <View key={s} style={styles.rung}>
          <Text allowFontScaling={false} style={[labelAt(label), styles.rungText]}>
            {i + 1}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PowerMeter({ task, label, ladder, givens }: { task: Task; label: number; ladder: boolean; givens: boolean }) {
  const max = Math.max(task.needed, 1);
  return (
    <View testID="ex-meter" style={styles.meter} accessibilityLabel={`${C.labels.needs} ${task.needed}, ${C.labels.has} ${task.present}`}>
      <View style={styles.meterTrack}>
        <View style={[styles.meterHas, { width: `${(task.present / max) * 100}%` }, givens && styles.refGlow]} />
        {ladder
          ? Array.from({ length: task.needed - task.present }, (_, i) => <View key={i} style={[styles.tick, { left: `${((task.present + i + 0.5) / max) * 100}%` }]} />)
          : null}
      </View>
      <View style={styles.meterLabels}>
        <Text allowFontScaling={false} style={[labelAt(label), styles.meterText, givens && GIVEN]}>
          {C.labels.has} {task.present}
        </Text>
        <Text allowFontScaling={false} style={[labelAt(label), styles.meterText, givens && GIVEN]}>
          {C.labels.needs} {task.needed}
        </Text>
      </View>
    </View>
  );
}

function StartCard({ flow, v, text, onExit }: { flow: ExpressFlow; v: ExpressView; text: MiniGameScreenProps['text']; onExit: () => void }) {
  const done = v.stage === 'done';
  return (
    <View style={styles.cardWrap} pointerEvents="box-none">
      <View testID={done ? 'ex-done' : 'ex-intro'} style={[styles.card, styles.startCard]}>
        <Text accessibilityRole="header" allowFontScaling={false} style={[labelAt(text.question + 6), styles.title]}>
          {done ? C.labels.done : C.labels.title}
        </Text>
        <Text testID="ex-start-line" allowFontScaling={false} style={[readingAt(text.passage, 'question'), styles.cardText]}>
          {lineText(v)}
        </Text>
        {done ? (
          <BackToElevatorButton onPress={onExit} size={text.label + 2} />
        ) : v.stage === 'intro' ? (
          <Pressable testID="ex-go" accessibilityRole="button" accessibilityLabel={C.labels.go} onPress={() => flow.go(Date.now())} style={styles.goBtn}>
            <Text allowFontScaling={false} style={[labelAt(text.question + 8), styles.goText]}>
              {C.labels.go}
            </Text>
          </Pressable>
        ) : null}
        {PLAYTEST_ENABLED && done ? <PlaytestSummary notes={v.notes} label={text.label} /> : null}
      </View>
    </View>
  );
}

/** Playtest builds only, adults: this device's tally for this game. Local; never evidence. */
function PlaytestSummary({ notes, label }: { notes: Notes; label: number }) {
  const minutes = Math.round(notes.ms / 6_000) / 10;
  const rows = useMemo(
    () => [
      ['Route starts', notes.starts],
      ['Completed', notes.completions],
      ['Left early', notes.exits],
      ['Came back', notes.resumes],
      ['Kit retries', notes.deliveryRetries],
      ['Help used', notes.help],
      ['Answers (wrong)', `${notes.attempts} (${notes.wrong})`],
      ['Minutes in game', minutes],
    ],
    [notes, minutes],
  );
  return (
    <View testID="ex-playtest" style={styles.playtest}>
      <Text allowFontScaling={false} style={[labelAt(Math.max(14, label - 2)), styles.playtestTitle]}>
        {C.labels.playtest}
      </Text>
      {rows.map(([k, val]) => (
        <Text key={String(k)} allowFontScaling={false} style={[labelAt(Math.max(14, label - 2)), styles.playtestRow]}>
          {k}: {val}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', backgroundColor: eq.deepBlue },
  sky: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: eq.deepBlue },
  skyline: { position: 'absolute', left: 0, width: 1600 },
  far: { position: 'absolute', bottom: 0, backgroundColor: eq.navyLight, opacity: 0.35, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  road: { position: 'absolute', left: 0, right: 0, backgroundColor: eq.recess, borderTopWidth: 6, borderTopColor: eq.steelEdge },
  laneLine: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: eq.steelDark, opacity: 0.8 },
  world: { position: 'absolute', left: 0, width: END + 1_200 },
  building: { position: 'absolute', borderTopLeftRadius: 6, borderTopRightRadius: 6, borderWidth: 2, borderColor: eq.steelEdge, overflow: 'visible' },
  windows: { position: 'absolute', left: 8, right: 42, top: 10, bottom: 34, flexDirection: 'row', flexWrap: 'wrap', gap: 6, overflow: 'hidden' },
  window: { width: '42%', borderRadius: 2 },
  windowLit: { backgroundColor: eq.amber },
  windowDim: { backgroundColor: eq.amberDim },
  windowDark: { backgroundColor: eq.recess },
  shaft: { position: 'absolute', right: 6, bottom: 0, width: 30, backgroundColor: eq.night, borderLeftWidth: 1, borderRightWidth: 1, borderColor: eq.steelEdge },
  car: { position: 'absolute', left: 2, right: 2, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  carLit: { backgroundColor: eq.cyan },
  carDark: { backgroundColor: eq.steelDark },
  carText: { color: eq.night, fontWeight: '900' },
  sign: { position: 'absolute', left: -6, right: -6, top: -34, backgroundColor: eq.coolWhite, borderRadius: 8, paddingVertical: 4, alignItems: 'center', borderWidth: 2, borderColor: eq.amber },
  signText: { color: eq.night, fontWeight: '900' },
  door: { position: 'absolute', alignSelf: 'center', bottom: 0, backgroundColor: eq.night, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderWidth: 2, borderColor: eq.steelEdge },
  doorGlow: { borderColor: eq.clue, borderWidth: 4, backgroundColor: eq.amberDim },
  doorDone: { borderColor: eq.ok, backgroundColor: eq.ok },
  parcelFlag: { position: 'absolute', alignSelf: 'center', bottom: 48, width: 26, height: 22, borderRadius: 4, backgroundColor: eq.amber, borderWidth: 2, borderColor: eq.night },
  check: { position: 'absolute', top: 6, left: 6, backgroundColor: eq.ok, borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: eq.night, fontWeight: '900' },
  thing: { position: 'absolute' },
  cone: { backgroundColor: eq.amber, borderTopLeftRadius: 40, borderTopRightRadius: 40, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  puddle: { backgroundColor: eq.cyan, opacity: 0.6, borderRadius: 40 },
  ramp: { backgroundColor: eq.steelLight, borderTopRightRadius: 60, borderWidth: 2, borderColor: eq.steelEdge },
  robot: { backgroundColor: eq.steelLight, borderRadius: 10, borderWidth: 3, borderColor: eq.cyan },
  bolt: { backgroundColor: eq.amberSoft, borderRadius: 40, borderWidth: 3, borderColor: eq.amber },
  cart: { position: 'absolute' },
  cartBody: { position: 'absolute', left: 0, right: 0, bottom: '20%', height: '50%', backgroundColor: eq.amber, borderRadius: 10, borderWidth: 3, borderColor: eq.night },
  cartCab: { position: 'absolute', left: '8%', width: '38%', bottom: '60%', height: '40%', backgroundColor: eq.glass, borderTopLeftRadius: 10, borderTopRightRadius: 6, borderWidth: 3, borderColor: eq.night },
  kit: { position: 'absolute', right: '10%', bottom: '66%', width: '34%', height: '32%', backgroundColor: eq.ok, borderRadius: 4, borderWidth: 3, borderColor: eq.night },
  wheel: { position: 'absolute', bottom: 0, width: '26%', aspectRatio: 1, borderRadius: 40, backgroundColor: eq.night, borderWidth: 4, borderColor: eq.steel },
  helper: { position: 'absolute', left: '-50%', bottom: '10%', width: '40%', height: '70%', backgroundColor: eq.steelLight, borderRadius: 10, borderWidth: 3, borderColor: eq.cyan },
  flying: { position: 'absolute', width: 30, height: 26, borderRadius: 5, borderWidth: 3, borderColor: eq.night },
  kitFlying: { backgroundColor: eq.ok },
  parcelFlying: { backgroundColor: eq.amber },
  hud: { position: 'absolute', flexDirection: 'row', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: eq.charcoal, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 2, borderColor: eq.steelEdge },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: eq.steelLight },
  dotDone: { backgroundColor: eq.ok, borderColor: eq.ok },
  dotCarry: { backgroundColor: eq.amber, borderColor: eq.amber },
  statText: { color: eq.text, fontWeight: '800' },
  banner: { flex: 1, minWidth: 220, alignItems: 'center' },
  bannerRow: { flexBasis: '100%' },
  bannerText: { color: eq.text, fontWeight: '800', textAlign: 'center', backgroundColor: eq.charcoal, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: 'hidden' },
  steer: { position: 'absolute', gap: 10 },
  steerBtn: { borderRadius: 20, backgroundColor: eq.charcoal, borderWidth: 3, borderColor: eq.steelLight, alignItems: 'center', justifyContent: 'center' },
  arrowUp: { width: 0, height: 0, borderLeftWidth: 18, borderRightWidth: 18, borderBottomWidth: 22, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: eq.text },
  arrowDown: { width: 0, height: 0, borderLeftWidth: 18, borderRightWidth: 18, borderTopWidth: 22, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: eq.text },
  faded: { opacity: 0.35 },
  throwBtn: { position: 'absolute', backgroundColor: eq.charcoal, borderWidth: 4, borderColor: eq.steelLight, alignItems: 'center', justifyContent: 'center', gap: 6 },
  throwReady: { borderColor: eq.clue, backgroundColor: eq.amberDim, borderWidth: 6 },
  throwText: { color: eq.text, fontWeight: '900' },
  kitIcon: { width: 34, height: 28, borderRadius: 5, backgroundColor: eq.ok, borderWidth: 3, borderColor: eq.night },
  parcelIcon: { width: 34, height: 28, borderRadius: 5, backgroundColor: eq.amber, borderWidth: 3, borderColor: eq.night },
  cardWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: eq.charcoal, borderRadius: 24, borderWidth: 3, borderColor: eq.steelLight, padding: 18, gap: 14, alignItems: 'center' },
  startCard: { maxWidth: 620, marginHorizontal: 16 },
  cardText: { color: eq.text, textAlign: 'center' },
  status: { color: GIVEN.color, fontWeight: '800', textAlign: 'center' },
  title: { color: eq.amber, fontWeight: '900', textAlign: 'center' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  street: { gap: 6, flexWrap: 'nowrap' },
  option: { borderRadius: 20, backgroundColor: eq.surfaceHigh, borderWidth: 3, borderColor: eq.steelLight, alignItems: 'center', justifyContent: 'center' },
  optionText: { color: eq.text, fontWeight: '900' },
  placeBtn: { borderRadius: 14, backgroundColor: eq.surfaceHigh, borderWidth: 3, borderColor: eq.steelLight, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 2, paddingVertical: 6, gap: 6 },
  placeFixed: { opacity: 0.8, borderStyle: 'dashed' },
  placeRoof: { width: '70%', height: 14, backgroundColor: eq.steelEdge, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  placeText: { color: eq.text, fontWeight: '900', textAlign: 'center' },
  refGlow: { borderColor: eq.clue, borderWidth: 5 },
  shine: { borderColor: eq.amber, borderWidth: 6, backgroundColor: eq.amberDim },
  hintBtn: { minWidth: 150, minHeight: 56, borderRadius: 16, borderWidth: 3, borderColor: eq.cyan, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  hintText: { color: eq.cyan, fontWeight: '900' },
  goBtn: { minWidth: 220, minHeight: 84, borderRadius: 24, backgroundColor: eq.amber, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: eq.night },
  goText: { color: eq.night, fontWeight: '900' },
  ladder: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  rung: { minWidth: 44, minHeight: 44, borderRadius: 10, backgroundColor: eq.surfaceHigh, borderWidth: 2, borderColor: eq.clue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  rungStart: { backgroundColor: eq.amberDim },
  rungText: { color: eq.text, fontWeight: '900' },
  meter: { width: '100%', maxWidth: 520, gap: 6 },
  meterTrack: { height: 34, borderRadius: 10, backgroundColor: eq.recess, borderWidth: 2, borderColor: eq.steelLight, overflow: 'hidden' },
  meterHas: { height: '100%', backgroundColor: eq.ok },
  tick: { position: 'absolute', top: 6, bottom: 6, width: 4, marginLeft: -2, backgroundColor: eq.clue, borderRadius: 2 },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  meterText: { color: eq.text, fontWeight: '800' },
  playtest: { alignSelf: 'stretch', borderTopWidth: 1, borderColor: eq.steelEdge, paddingTop: 8, gap: 2 },
  playtestTitle: { color: eq.textDim, fontWeight: '800' },
  playtestRow: { color: eq.textDim },
});

