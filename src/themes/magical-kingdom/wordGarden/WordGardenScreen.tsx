// Word Garden screen: renders the flow (flow.ts) over the garden art. Letters and pictures are big
// touch targets; tap feedback is the pressable's own UI-thread scale, never waiting on the runtime.
// Reduced Motion: no shake, no grow or melt; the world simply shows its new state.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { textClass, textSizes } from "../../elevator-quest/ui/textRoles";
import type { GameRuntime } from "../../../runtime/gameRuntime";
import { MagicIcon, type IconKind } from "../ui/MagicArt";
import { MagicalPressable as Pressable } from "../ui/MagicalPressable";
import { magic as P } from "../ui/palette";
import { WORD_GARDEN as C, fillCopy } from "./content";
import {
  createWordGardenFlow,
  type GardenAudio,
  type GardenView,
  type WordGardenFlow,
} from "./flow";

interface Props {
  runtime: GameRuntime;
  learnerId: string;
  audio: GardenAudio;
  still: boolean;
  width: number;
  height: number;
  top: number;
  bottom: number;
  onExit: () => void;
}

const IDLE: GardenView = {
  stage: "loading",
  magic: 1,
  magics: 3,
  task: null,
  tried: [],
  heard: [],
  placed: [],
  help: [],
  nextHelp: null,
  shown: null,
  reward: null,
  line: "sound",
  miss: 0,
  busy: false,
};
const noop = () => () => undefined;

export function WordGardenScreen({
  runtime,
  learnerId,
  audio,
  still,
  width,
  height,
  top,
  bottom,
  onExit,
}: Props) {
  const [flow, setFlow] = useState<WordGardenFlow | null>(null);
  useEffect(() => {
    let cancelled = false;
    const f = createWordGardenFlow({
      runtime,
      learnerId,
      now: () => Date.now(),
      audio,
    });
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setFlow(f);
      void f.start();
    });
    return () => {
      cancelled = true;
      void f.flush().finally(() => f.dispose());
    };
  }, [runtime, learnerId, audio]);
  const v = useSyncExternalStore(
    flow?.subscribe ?? noop,
    flow?.view ?? (() => IDLE),
    () => IDLE,
  );
  const sizes = textSizes(textClass({ width, height }));
  const portrait = height > width;
  // Fire HD 8 landscape (600 pt tall): the word's picture sits beside its spaces so the card fits.
  const short = !portrait && height < 720;
  // Big enough to hit (84 pt floor), and the spell card (picture, spaces, tray) must fit the height.
  const tile = Math.max(
    84,
    Math.min(
      portrait ? 124 : 118,
      Math.floor((Math.min(width, 900) - 80) / 5.4),
      Math.floor((height - top - 300) / 3.4),
    ),
  );

  // A wrong answer shakes the play card (not under Reduced Motion).
  const shake = useSharedValue(0);
  useEffect(() => {
    if (v.miss && !still)
      shake.set(
        withSequence(
          withTiming(-10, { duration: 60 }),
          withTiming(10, { duration: 80 }),
          withTiming(-6, { duration: 70 }),
          withTiming(0, { duration: 60 }),
        ),
      );
  }, [v.miss, still, shake]);
  const shaking = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.get() }],
  }));

  if (!flow) return null;
  const t = v.task;
  const leave = () => {
    void flow.flush().finally(onExit);
  };
  const helpLabel = v.nextHelp?.demonstrated
    ? C.labels.showMe!
    : C.labels.help!;

  return (
    <View testID="word-garden" style={[s.root, { top, bottom: 0 }]}>
      <View style={[s.bar, { width: Math.min(width - 24, 760) }]}>
        <View
          style={s.pips}
          accessibilityLabel={fillCopy(C.labels.stage!, {
            stage: v.magic,
            stages: v.magics,
          })}
        >
          {Array.from({ length: v.magics }, (_, i) => (
            <View
              key={i}
              style={[
                s.pip,
                i <
                  v.magic -
                    (v.stage === "play" || v.stage === "loading" ? 1 : 0) &&
                  s.pipOn,
              ]}
            >
              {i <
              v.magic -
                (v.stage === "play" || v.stage === "loading" ? 1 : 0) ? (
                <MagicIcon kind="flower" size={30} />
              ) : null}
            </View>
          ))}
        </View>
        <Text
          testID="wg-line"
          accessibilityLiveRegion="polite"
          style={[
            s.line,
            { fontSize: sizes.question, lineHeight: sizes.question * 1.25 },
          ]}
        >
          {v.stage === "play" || v.stage === "loading" ? C.lines[v.line] : ""}
        </Text>
        {v.stage === "play" ? (
          <Pressable
            testID="wg-hear"
            accessibilityLabel={C.labels.hear}
            onPress={() => flow.hear()}
            style={s.ear}
          >
            <MagicIcon kind="sound" size={40} />
          </Pressable>
        ) : null}
      </View>

      {v.stage === "play" && t ? (
        <Animated.View
          style={[s.card, { width: Math.min(width - 24, 860) }, shaking]}
        >
          {t.kind === "sound" ? (
            <SoundTask v={v} flow={flow} tile={tile} />
          ) : null}
          {t.kind === "blend" ? (
            <BlendTask v={v} flow={flow} tile={tile} />
          ) : null}
          {t.kind === "spell" ? (
            <SpellTask v={v} flow={flow} tile={tile} short={short} />
          ) : null}
        </Animated.View>
      ) : null}

      {v.stage === "reward" || v.stage === "done" ? (
        <Reward
          v={v}
          still={still}
          label={v.stage === "done" ? C.labels.castle! : C.labels.next!}
          onPress={() =>
            v.stage === "done" ? void flow.next().then(leave) : void flow.next()
          }
        />
      ) : null}
      {v.stage === "failed" ? (
        <View style={s.card}>
          <Button
            testID="wg-retry"
            text={C.labels.retry!}
            onPress={() => void flow.start()}
          />
        </View>
      ) : null}

      {v.stage === "play" ? (
        <View style={{ marginBottom: Math.max(18, bottom + 10) }}>
          <Button
            testID="wg-help"
            text={helpLabel}
            icon="help"
            secondary
            disabled={!v.nextHelp || v.busy}
            onPress={() => void flow.help()}
          />
        </View>
      ) : null}
    </View>
  );
}

function SoundTask({
  v,
  flow,
  tile,
}: {
  v: GardenView;
  flow: WordGardenFlow;
  tile: number;
}) {
  const t = v.task!;
  const stretched = v.help.includes("highlightGiven");
  const keyword = v.help.includes("guidedSteps")
    ? (C.keywords[t.target] as IconKind | undefined)
    : undefined;
  return (
    <>
      <View style={s.prompt}>
        <Pressable
          accessibilityLabel={C.labels.hear}
          onPress={() => flow.hear()}
          style={[s.soundBubble, stretched && s.glow]}
        >
          <MagicIcon kind="sound" size={64} />
        </Pressable>
        {keyword ? (
          <View
            testID="wg-keyword"
            style={s.picture}
            accessibilityLabel={fillCopy(C.labels.picture!, { name: keyword })}
          >
            <MagicIcon kind={keyword} size={84} />
          </View>
        ) : null}
      </View>
      <View style={s.row}>
        {t.options.map((o) => (
          <LetterTile
            key={o.id}
            testID={`wg-letter-${o.value}`}
            letter={o.value}
            size={tile}
            label={fillCopy(C.labels.letter!, { letter: o.value })}
            tried={v.tried.includes(o.id)}
            shining={v.shown?.optionId === o.id}
            disabled={v.busy}
            onPress={() => void flow.choose(o.id)}
          />
        ))}
      </View>
    </>
  );
}

function BlendTask({
  v,
  flow,
  tile,
}: {
  v: GardenView;
  flow: WordGardenFlow;
  tile: number;
}) {
  const t = v.task!;
  const ready = v.heard.length === t.target.length;
  const guided = v.help.includes("guidedSteps");
  return (
    <>
      <View style={[s.row, guided && s.close]}>
        {[...t.target].map((ch, i) => (
          <View key={i} style={s.col}>
            <LetterTile
              testID={`wg-sound-${i}`}
              letter={ch}
              size={tile}
              label={fillCopy(C.labels.sound!, { letter: ch })}
              heard={v.heard.includes(i)}
              shining={v.help.includes("highlightGiven")}
              disabled={false}
              onPress={() => flow.tapLetter(i)}
            />
            <View style={[s.dot, v.heard.includes(i) && s.dotOn]} />
          </View>
        ))}
      </View>
      <View style={[s.slide, ready && s.slideOn]} />
      <View style={s.row}>
        {t.options.map((o) => (
          <Pressable
            key={o.id}
            testID={`wg-picture-${o.value}`}
            accessibilityLabel={fillCopy(C.labels.picture!, { name: o.value })}
            disabled={v.busy || v.tried.includes(o.id)}
            onPress={() => void flow.choose(o.id)}
            style={[
              s.picture,
              { width: tile * 1.25, height: tile * 1.25 },
              v.tried.includes(o.id) && s.tried,
              v.shown?.optionId === o.id && s.glow,
            ]}
          >
            <MagicIcon kind={o.value as IconKind} size={tile * 0.95} />
          </Pressable>
        ))}
      </View>
    </>
  );
}

function SpellTask({
  v,
  flow,
  tile,
  short,
}: {
  v: GardenView;
  flow: WordGardenFlow;
  tile: number;
  short: boolean;
}) {
  const t = v.task!;
  const ghost = (i: number) =>
    v.shown?.value
      ? v.shown.value[i]
      : v.help.includes("guidedSteps") &&
          i >= t.patternAt &&
          i < t.patternAt + t.pattern.length
        ? t.pattern[i - t.patternAt]
        : undefined;
  return (
    <>
      <View style={[s.prompt, !short && s.stack]}>
        <Pressable
          testID={`wg-target-${t.target}`}
          accessibilityLabel={C.labels.hear}
          onPress={() => flow.hear()}
          style={s.picture}
        >
          <MagicIcon kind={t.target as IconKind} size={84} />
        </Pressable>
        <View style={s.row}>
          {[...t.target].map((_, i) => {
            const placed = v.placed[i];
            const letter = placed === undefined ? undefined : t.tiles[placed];
            return (
              <Pressable
                key={i}
                testID={`wg-slot-${i}`}
                accessibilityLabel={
                  letter
                    ? fillCopy(C.labels.placed!, { letter, index: i + 1 })
                    : fillCopy(C.labels.slot!, { index: i + 1 })
                }
                disabled={letter === undefined || v.busy}
                onPress={() => flow.unplace(i)}
                style={[
                  s.slot,
                  { width: tile, height: tile * 1.1 },
                  v.help.includes("highlightGiven") && s.slotLit,
                ]}
              >
                {letter ? (
                  <Text style={[s.letter, { fontSize: tile * 0.62 }]}>
                    {letter}
                  </Text>
                ) : ghost(i) ? (
                  <Text style={[s.letter, s.ghost, { fontSize: tile * 0.62 }]}>
                    {ghost(i)}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={[s.row, s.tray]}>
        {t.tiles.map((ch, i) => (
          <LetterTile
            key={i}
            testID={`wg-tile-${i}`}
            letter={ch}
            size={tile * 0.9}
            label={fillCopy(C.labels.tile!, { letter: ch })}
            used={v.placed.includes(i)}
            disabled={v.busy || v.placed.includes(i)}
            onPress={() => void flow.place(i)}
          />
        ))}
      </View>
    </>
  );
}

function LetterTile({
  letter,
  size,
  label,
  onPress,
  disabled,
  tried,
  used,
  heard,
  shining,
  testID,
}: {
  letter: string;
  size: number;
  label: string;
  onPress: () => void;
  disabled: boolean;
  tried?: boolean;
  used?: boolean;
  heard?: boolean;
  shining?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityLabel={label}
      disabled={disabled || tried}
      onPress={onPress}
      style={[
        s.tile,
        { width: size, height: size },
        heard && s.heard,
        shining && s.glow,
        (tried || used) && s.tried,
      ]}
    >
      <Text style={[s.letter, { fontSize: size * 0.62 }]}>
        {used ? "" : letter}
      </Text>
    </Pressable>
  );
}

/** The world answers: a flower wakes, the sun melts the ice, a cat jumps out, the map unrolls, a pig rolls. */
function Reward({
  v,
  still,
  label,
  onPress,
}: {
  v: GardenView;
  still: boolean;
  label: string;
  onPress: () => void;
}) {
  const value = v.reward?.value ?? "sun";
  const word = C.words[value];
  const grow = useSharedValue(still ? 1 : 0.2);
  const melt = useSharedValue(still ? 0 : 1);
  useEffect(() => {
    if (still) return;
    grow.set(withSpring(1, { damping: 9 }));
    melt.set(withTiming(0, { duration: 1400 }));
  }, [still, grow, melt, value]);
  const growing = useAnimatedStyle(() => ({
    transform: [
      value === "map" ? { scaleX: grow.get() } : { scale: grow.get() },
    ],
  }));
  const ice = useAnimatedStyle(() => ({
    opacity: melt.get() * 0.85,
    transform: [{ scaleY: 0.4 + melt.get() * 0.6 }],
  }));
  const text =
    v.stage === "done"
      ? C.lines.done
      : v.reward?.kind === "sound" || !word
        ? C.lines.bloom
        : word.reaction;
  const flowers = useMemo(
    () => Array.from({ length: v.stage === "done" ? 3 : v.magic }),
    [v.stage, v.magic],
  );
  return (
    <View
      testID={v.stage === "done" ? "wg-done" : "wg-reward"}
      style={s.rewardCard}
    >
      <View style={s.stageArt}>
        <Animated.View style={growing}>
          <MagicIcon
            kind={v.reward?.kind === "sound" ? "flower" : (value as IconKind)}
            size={150}
          />
        </Animated.View>
        {value === "sun" && v.reward?.kind !== "sound" ? (
          <Animated.View pointerEvents="none" style={[s.ice, ice]} />
        ) : null}
      </View>
      <View style={s.flowerRow}>
        {flowers.map((_, i) => (
          <MagicIcon key={i} kind="flower" size={44} />
        ))}
      </View>
      <Text testID="wg-reaction" style={s.reaction}>
        {text}
      </Text>
      <Button
        testID={v.stage === "done" ? "wg-castle" : "wg-next"}
        text={label}
        icon="star"
        onPress={onPress}
      />
    </View>
  );
}

function Button({
  text,
  onPress,
  secondary = false,
  icon,
  disabled = false,
  testID,
}: {
  text: string;
  onPress: () => void;
  secondary?: boolean;
  icon?: IconKind;
  disabled?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityLabel={text}
      onPress={onPress}
      disabled={disabled}
      style={[s.button, secondary && s.secondary, disabled && s.disabled]}
    >
      {icon ? <MagicIcon kind={icon} size={34} /> : null}
      <Text style={[s.buttonText, secondary && s.secondaryText]}>{text}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 14,
    paddingTop: 12,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: P.paper,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: P.edge,
    padding: 10,
    boxShadow: `0 5px 16px ${P.shadow}`,
  },
  pips: { flexDirection: "row", gap: 6 },
  pip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: P.edge,
    backgroundColor: P.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  pipOn: { borderColor: P.gold },
  line: { flex: 1, color: P.ink, fontWeight: "800" },
  ear: {
    width: 72,
    height: 72,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: P.edge,
    backgroundColor: P.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    alignItems: "center",
    gap: 18,
    backgroundColor: P.veil,
    borderRadius: 40,
    padding: 18,
  },
  prompt: { flexDirection: "row", alignItems: "center", gap: 18 },
  stack: { flexDirection: "column" },
  soundBubble: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: P.paper,
    borderWidth: 3,
    borderColor: P.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  picture: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: P.paper,
    borderWidth: 3,
    borderColor: P.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    gap: 14,
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
  },
  close: { gap: 2 },
  col: { alignItems: "center", gap: 6 },
  tile: {
    borderRadius: 26,
    backgroundColor: P.paper,
    borderWidth: 3,
    borderColor: P.edge,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: `0 5px 0 ${P.edge}`,
  },
  letter: { color: P.ink, fontWeight: "800", includeFontPadding: false },
  heard: { borderColor: P.turquoise },
  glow: {
    borderColor: P.gold,
    borderWidth: 5,
    backgroundColor: P.cream,
    boxShadow: `0 0 18px ${P.gold}`,
  },
  tried: { opacity: 0.35 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: P.edge },
  dotOn: { backgroundColor: P.turquoise },
  slide: { width: 260, height: 10, borderRadius: 5, backgroundColor: P.edge },
  slideOn: { backgroundColor: P.turquoise },
  slot: {
    borderRadius: 22,
    borderWidth: 3,
    borderStyle: "dashed",
    borderColor: P.crystal,
    backgroundColor: P.white,
    alignItems: "center",
    justifyContent: "center",
  },
  slotLit: { borderColor: P.gold, borderStyle: "solid" },
  ghost: { color: P.edge },
  tray: { backgroundColor: P.cream, borderRadius: 28, padding: 10 },
  rewardCard: {
    alignItems: "center",
    gap: 14,
    backgroundColor: P.paper,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: P.gold,
    padding: 22,
    minWidth: 320,
  },
  stageArt: {
    width: 190,
    height: 170,
    alignItems: "center",
    justifyContent: "center",
  },
  ice: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 0,
    height: 120,
    borderRadius: 24,
    backgroundColor: P.ice,
    borderWidth: 3,
    borderColor: P.white,
  },
  flowerRow: { flexDirection: "row", gap: 8 },
  reaction: {
    color: P.ink,
    fontSize: 26,
    lineHeight: 33,
    fontWeight: "800",
    textAlign: "center",
    maxWidth: 560,
  },
  button: {
    minWidth: 180,
    minHeight: 72,
    paddingHorizontal: 22,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 26,
    backgroundColor: P.deep,
    borderWidth: 2,
    borderColor: P.edge,
    boxShadow: `0 4px 0 ${P.shadow}`,
  },
  secondary: { backgroundColor: P.cream },
  disabled: { opacity: 0.45 },
  buttonText: { fontSize: 22, color: P.paper, fontWeight: "800" },
  secondaryText: { color: P.ink },
});
