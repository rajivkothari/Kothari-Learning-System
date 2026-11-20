// "A royal gift for you!": the gifts as pictures, an ear to hear it again, and two buttons whose pictures
// say where they go (the hanger opens the wardrobe, the castle goes back to the castle). The castle says the
// line when the dialog appears (KingdomApp), never over a game.
import { StyleSheet, Text, View } from 'react-native';

import { WARDROBE } from '../wardrobe';
import { EarButton } from './GameControls';
import { MagicIcon, type IconKind } from './MagicArt';
import { MagicalPressable as Pressable } from './MagicalPressable';
import { magic as P } from './palette';
import { WardrobeArt } from './WardrobeArt';

export function GiftDialog({ gifts, still, width, hearLabel, onHear, onOpen, onKeep }: { gifts: readonly string[]; still: boolean; width: number; hearLabel: string; onHear: () => void; onOpen: () => void; onKeep: () => void }) {
  const art = gifts.length > 2 || width < 480 ? 84 : 112;
  return <View testID="gift-dialog" style={s.scrim} accessibilityViewIsModal>
    <View style={[s.dialog, { width: Math.min(width - 32, 520) }]}>
      <View style={s.head}>
        <MagicIcon kind="star" size={64} />
        <Text accessibilityRole="header" style={s.title}>{WARDROBE.copy.newGift}</Text>
        <EarButton label={hearLabel} onPress={onHear} glow={false} still={still} size={64} />
      </View>
      <View style={s.gifts}>
        {gifts.map((id) => {
          const item = WARDROBE.items.find((i) => i.id === id);
          return <View key={id} testID={`gift-item-${id}`} accessibilityLabel={item?.label ?? id} style={s.gift}>
            <View style={[s.giftArt, { width: art + 20, height: art + 20 }]}><WardrobeArt id={id} size={art} /></View>
            <Text style={s.giftLabel} numberOfLines={2}>{item?.label ?? ''}</Text>
          </View>;
        })}
      </View>
      <GiftButton testID="gift-open" text={WARDROBE.copy.open} icon="hanger" onPress={onOpen} />
      <GiftButton testID="gift-keep" text={WARDROBE.copy.keepPlaying} icon="home" quiet onPress={onKeep} />
    </View>
  </View>;
}

function GiftButton({ text, icon, onPress, quiet = false, testID }: { text: string; icon: IconKind; onPress: () => void; quiet?: boolean; testID: string }) {
  return <Pressable testID={testID} accessibilityLabel={text} onPress={onPress} style={[s.button, quiet && s.quiet]}>
    <MagicIcon kind={icon} size={40} color={quiet ? P.deep : P.cream} />
    <Text style={[s.buttonText, quiet && s.quietText]} numberOfLines={1}>{text}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: P.scrim, alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 55 },
  dialog: { backgroundColor: P.paper, borderColor: P.gold, borderWidth: 3, borderRadius: 34, padding: 22, gap: 14, alignItems: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, color: P.ink, fontSize: 26, lineHeight: 31, fontWeight: '800', fontFamily: 'Georgia', textAlign: 'center' },
  gifts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  gift: { alignItems: 'center', gap: 6, maxWidth: 150 },
  giftArt: { borderRadius: 28, backgroundColor: P.ice, borderWidth: 3, borderColor: P.white, alignItems: 'center', justifyContent: 'center' },
  giftLabel: { color: P.ink, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  button: { minHeight: 68, borderRadius: 26, backgroundColor: P.deep, borderWidth: 2, borderColor: P.edge, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 18, boxShadow: `0 4px 0 ${P.shadow}` },
  quiet: { backgroundColor: P.cream },
  buttonText: { color: P.paper, fontSize: 21, fontWeight: '800' },
  quietText: { color: P.ink },
});
