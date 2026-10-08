// The things on the dock and in the freight, as native views (each is its own touch target, with a
// label for screen readers): crates with their weight in big numbers, 10 kg sacks, 1 kg boxes, the
// pallets already aboard. Cel-shaded with flat bands (a light top, a darker lip), no gradients.
// Touch feedback is immediate (the pressed style), never waiting on the session.
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { UI } from '../../ui/palette';
import { CC, boxCard, brass, sackCloth, steel, wood, woodDark } from './cargoPalette';

/** A crate's weight: big numbers on its cream plate. */
export const crateNumberSize = (side: number) => Math.max(24, Math.round(side * 0.34));

export const CrateFace = memo(function CrateFace({ side, weight, unit, art }: { side: number; weight: number; unit: string; art: ImageSourcePropType | null }) {
  const n = crateNumberSize(side);
  return (
    <View style={{ width: side, height: side }}>
      {art ? (
        <Image source={art} resizeMode="contain" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.crate, { borderRadius: Math.max(4, side * 0.06) }]}>
          <View style={[styles.crateTop, { height: side * 0.16 }]} />
          <View style={[styles.slat, { left: side * 0.08 }]} />
          <View style={[styles.slat, { right: side * 0.08 }]} />
          <View style={[styles.bracket, styles.bracketTL]} />
          <View style={[styles.bracket, styles.bracketTR]} />
          <View style={[styles.bracket, styles.bracketBL]} />
          <View style={[styles.bracket, styles.bracketBR]} />
        </View>
      )}
      {/* The plate: in the middle of the front face (the sprite's blank plate sits there too). */}
      <View pointerEvents="none" style={[styles.plateWrap, { top: side * 0.16 }]}>
        <View style={[styles.plate, { minWidth: side * 0.62, paddingHorizontal: 4 }]}>
          <Text allowFontScaling={false} style={[styles.crateNumber, { fontSize: n, lineHeight: Math.round(n * 1.1) }]}>
            {weight}
          </Text>
          <Text allowFontScaling={false} style={[styles.unit, { fontSize: Math.max(12, Math.round(n * 0.42)) }]}>
            {unit}
          </Text>
        </View>
      </View>
    </View>
  );
});

/** A crate as a button: on the dock it loads, in the freight it unloads. */
export function CrateButton({ side, weight, unit, art, label, disabled, onPress, testID }: { side: number; weight: number; unit: string; art: ImageSourcePropType | null; label: string; disabled: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [{ width: side, height: side }, pressed && styles.pressed, disabled && styles.waiting]}
    >
      <CrateFace side={side} weight={weight} unit={unit} art={art} />
    </Pressable>
  );
}

/** An empty dock spot where a crate stood (it is in the freight now). */
export function CrateSpot({ side }: { side: number }) {
  return <View pointerEvents="none" style={[styles.spot, { width: side, height: side, borderRadius: Math.max(4, side * 0.06) }]} />;
}

/** A 10 kg sack: a cloth bag tied at the top, "10" stencilled on it. */
export const Sack = memo(function Sack({ w, label = true }: { w: number; label?: boolean }) {
  const h = Math.round(w * 0.78);
  return (
    <View style={{ width: w, height: h, alignItems: 'center' }}>
      <View style={[styles.sackNeck, { width: w * 0.34, height: h * 0.18 }]} />
      <View style={[styles.sackBody, { width: w, height: h * 0.84, borderRadius: w * 0.3 }]}>
        <View style={[styles.sackLight, { borderTopLeftRadius: w * 0.3, borderTopRightRadius: w * 0.3 }]} />
        {label && w >= 26 ? (
          <Text allowFontScaling={false} style={[styles.sackText, { fontSize: Math.max(10, Math.round(w * 0.3)) }]}>
            10
          </Text>
        ) : null}
      </View>
    </View>
  );
});

/** A 1 kg box: a small card box with a light lid band. */
export const OneBox = memo(function OneBox({ s, label = true }: { s: number; label?: boolean }) {
  return (
    <View style={[styles.box, { width: s, height: s, borderRadius: Math.max(2, s * 0.12) }]}>
      <View style={[styles.boxLid, { height: Math.max(3, s * 0.22) }]} />
      {label && s >= 22 ? (
        <Text allowFontScaling={false} style={[styles.boxText, { fontSize: Math.max(10, Math.round(s * 0.42)) }]}>
          1
        </Text>
      ) : null}
    </View>
  );
});

/** Cargo that is already aboard: a pallet stack with its weight (a given) in big numbers. */
export function Pallet({ width, height, weight, unit, label }: { width: number; height: number; weight: number; unit: string; label: string }) {
  const n = Math.max(22, Math.min(36, Math.round(height * 0.5)));
  return (
    <View accessible accessibilityLabel={label} style={[styles.pallet, { width, height }]}>
      <View style={styles.palletLoad}>
        <View style={styles.palletPlate}>
          <Text allowFontScaling={false} style={[styles.crateNumber, { fontSize: n, lineHeight: Math.round(n * 1.1) }]}>
            {weight}
          </Text>
          <Text allowFontScaling={false} style={[styles.unit, { fontSize: Math.max(12, Math.round(n * 0.45)) }]}>
            {unit}
          </Text>
        </View>
      </View>
      <View style={styles.palletBase} />
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.95 }, { translateY: 2 }] },
  waiting: { opacity: 0.9 },
  crate: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: wood.base, borderWidth: 2, borderColor: woodDark.edge, borderBottomWidth: 5, borderBottomColor: wood.shadow, overflow: 'hidden' },
  crateTop: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: wood.light, borderBottomWidth: 2, borderBottomColor: woodDark.shadow },
  slat: { position: 'absolute', top: '16%', bottom: 0, width: 5, backgroundColor: wood.shadow },
  bracket: { position: 'absolute', width: 12, height: 12, backgroundColor: steel.shadow, borderColor: brass.base, borderWidth: 1.5 },
  bracketTL: { left: 0, top: 0 },
  bracketTR: { right: 0, top: 0 },
  bracketBL: { left: 0, bottom: 0 },
  bracketBR: { right: 0, bottom: 0 },
  plateWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  plate: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2, paddingVertical: 2, borderRadius: 4, backgroundColor: CC.enamel, borderWidth: 2, borderColor: brass.base },
  crateNumber: { color: CC.ink, fontWeight: '900', fontVariant: ['tabular-nums'] },
  unit: { ...UI(), color: CC.ink, letterSpacing: 0.5, textTransform: 'none' },
  spot: { borderWidth: 2, borderStyle: 'dashed', borderColor: CC.textDim, opacity: 0.55 },
  sackNeck: { backgroundColor: sackCloth.shadow, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderWidth: 1.5, borderColor: sackCloth.edge, marginBottom: -2, zIndex: 1 },
  sackBody: { backgroundColor: sackCloth.base, borderWidth: 2, borderColor: sackCloth.edge, borderBottomWidth: 4, borderBottomColor: sackCloth.shadow, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sackLight: { position: 'absolute', left: 0, right: 0, top: 0, height: '30%', backgroundColor: sackCloth.light, opacity: 0.6 },
  sackText: { color: CC.ink, fontWeight: '900' },
  box: { backgroundColor: boxCard.base, borderWidth: 1.5, borderColor: boxCard.edge, borderBottomWidth: 3, borderBottomColor: boxCard.shadow, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  boxLid: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: boxCard.light },
  boxText: { color: CC.ink, fontWeight: '900' },
  pallet: { justifyContent: 'flex-end' },
  palletLoad: { flex: 1, marginHorizontal: 6, borderRadius: 4, backgroundColor: steel.base, borderWidth: 2, borderColor: steel.edge, borderTopColor: steel.light, alignItems: 'center', justifyContent: 'center' },
  palletPlate: { flexDirection: 'row', alignItems: 'baseline', gap: 3, paddingHorizontal: 8, borderRadius: 4, backgroundColor: CC.enamel, borderWidth: 2, borderColor: brass.base },
  palletBase: { height: 8, borderRadius: 2, backgroundColor: wood.shadow, borderWidth: 1, borderColor: woodDark.edge },
});
