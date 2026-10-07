// Concept Rescue board: the calm test-run screen. The job is paused, the cabin steps back, and
// a different example is counted cell by cell. It draws the director's RescueStageView and
// forwards taps. It never decides what counts as right; the director and runtime do.
// Calm visual mode: one surface, one accent (cyan, the help color), no failure language, no red.
import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RescueStageView } from "../director/director";
import type { Box } from "./layout";
import { READING, TOKENS as T, UI, eq } from "./palette";
import { rescueLayout } from "./rescueLayout";

export interface RescueBoardProps {
  box: Box;
  rescue: RescueStageView;
  disabled: boolean;
  onTap: (n: number) => void;
}

export const RescueBoard = memo(function RescueBoard({
  box,
  rescue,
  disabled,
  onTap,
}: RescueBoardProps) {
  const L = useMemo(
    () => rescueLayout(box, rescue.cells.length, T.minTouchTarget, rescue.kind),
    [box, rescue.cells.length, rescue.kind],
  );
  // Floors read top-down from high to low when stacked; spaces always run low to high.
  const cells =
    L.orientation === "vertical" ? [...rescue.cells].reverse() : rescue.cells;
  const askingCount =
    rescue.phase === "ask" && rescue.asks === "count" && rescue.choices !== null;
  const stop =
    rescue.origin +
    (rescue.direction === "down" ? -1 : 1) * rescue.stride * rescue.steps;
  const tapCells =
    rescue.phase === "counting" ||
    (rescue.phase === "ask" && rescue.asks === "cell");
  // Express stops are counted as stops; other floors as moves.
  const unit = rescue.stride > 1 ? "STOP" : "MOVE";

  return (
    <View
      style={[
        styles.board,
        { left: box.x, top: box.y, width: box.width, height: box.height },
      ]}
      accessibilityViewIsModal
      accessibilityLabel="Test run"
    >
      <Text style={styles.tag} allowFontScaling={false}>
        TEST RUN
      </Text>
      <Text
        style={styles.caption}
        accessibilityLiveRegion="polite"
        numberOfLines={3}
      >
        {rescue.caption}
      </Text>
      {rescue.focus ? (
        <Text style={styles.focus} numberOfLines={2}>
          {rescue.focus}
        </Text>
      ) : null}
      <View style={styles.stage}>
        <View
          style={[
            styles.strip,
            L.orientation === "vertical" ? styles.vertical : styles.horizontal,
            { gap: L.gap, maxWidth: L.perLine * (L.cell + L.gap) },
          ]}
        >
          {cells.map((n) => {
            const isOrigin = rescue.kind === "move" && n === rescue.origin;
            const aboard =
              rescue.kind === "fill" &&
              rescue.aboard !== null &&
              n <= rescue.aboard;
            const order = rescue.counted.indexOf(n);
            const counted = order >= 0;
            const right =
              rescue.phase === "right" && rescue.kind === "move" && n === stop;
            const label =
              rescue.kind === "move" ? String(n) : aboard ? "■" : "";
            return (
              <Pressable
                key={n}
                disabled={disabled || !tapCells || aboard}
                onPress={() => onTap(n)}
                accessibilityRole="button"
                accessibilityLabel={
                  rescue.kind === "move"
                    ? `Floor ${n}${isOrigin ? ", start" : ""}${counted ? `, ${unit.toLowerCase()} ${order + 1}` : ""}`
                    : `Space ${n}${aboard ? ", already full" : counted ? `, counted ${rescue.countFrom + order + 1}` : ", empty"}`
                }
                style={({ pressed }) => [
                  styles.cell,
                  { width: L.cell, height: L.cell },
                  isOrigin && styles.origin,
                  aboard && styles.aboard,
                  counted && styles.counted,
                  right && styles.right,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.cellText,
                    { fontSize: Math.round(L.cell * 0.36) },
                    counted && styles.countedText,
                  ]}
                >
                  {label}
                </Text>
                {isOrigin ? (
                  <Text allowFontScaling={false} style={styles.badge}>
                    START
                  </Text>
                ) : counted ? (
                  <Text
                    allowFontScaling={false}
                    style={[styles.badge, styles.badgeCount]}
                  >
                    {rescue.kind === "move"
                      ? `${unit} ${order + 1}`
                      : rescue.countFrom + order + 1}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
      {askingCount ? (
        <View style={[styles.choices, { gap: L.gap }]}>
          {rescue.choices!.map((c) => (
            <Pressable
              key={c}
              disabled={disabled}
              onPress={() => onTap(c)}
              accessibilityRole="button"
              accessibilityLabel={
                rescue.kind === "fill" && rescue.countFrom === 0
                  ? `${c} more`
                  : String(c)
              }
              style={({ pressed }) => [
                styles.choice,
                { minWidth: T.minTouchTarget, minHeight: T.minTouchTarget },
                pressed && styles.pressed,
              ]}
            >
              <Text allowFontScaling={false} style={styles.choiceText}>
                {c}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  board: {
    position: "absolute",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderRadius: 18,
    backgroundColor: eq.surfaceHigh,
    borderWidth: 2,
    borderColor: eq.cyan,
  },
  tag: { ...UI(0.75), color: eq.cyan },
  caption: { ...READING(), color: eq.text, textAlign: "center", maxWidth: 640 },
  focus: {
    ...READING(0.8),
    color: eq.textDim,
    textAlign: "center",
    maxWidth: 640,
  },
  stage: {
    flex: 1,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  strip: {},
  vertical: { flexDirection: "column", alignItems: "center" },
  horizontal: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  cell: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: eq.charcoalLight,
    borderWidth: 2,
    borderColor: eq.steel,
  },
  origin: { borderColor: eq.coolWhite, borderStyle: "dashed" },
  aboard: { backgroundColor: eq.steelDark, borderColor: eq.steelDark },
  counted: { backgroundColor: eq.deepBlueLight, borderColor: eq.cyan },
  right: { borderColor: eq.ok, borderWidth: 3 },
  pressed: { transform: [{ scale: 0.95 }] },
  cellText: { color: eq.text, fontWeight: "800" },
  countedText: { color: eq.coolWhite },
  badge: { ...UI(0.55), position: "absolute", bottom: 3, color: eq.textDim },
  badgeCount: { color: eq.cyan },
  choices: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 6,
  },
  choice: {
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: eq.charcoalLight,
    borderWidth: 2,
    borderColor: eq.cyan,
  },
  choiceText: { color: eq.text, fontSize: 24, fontWeight: "800" },
});
