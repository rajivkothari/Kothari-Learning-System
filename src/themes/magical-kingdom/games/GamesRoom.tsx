// The games room: the Royal Quest across the top, the six games under it (three across in landscape, two
// in portrait). Pictures first: each card is its game's picture with its short name under it. The cards
// stay live while the castle's director is briefly busy; nothing here records anything.
import { StyleSheet, Text, View } from 'react-native';

import { MagicIcon, type IconKind } from '../ui/MagicArt';
import { MagicalPressable as Pressable } from '../ui/MagicalPressable';
import { magic as P } from '../ui/palette';
import { WordPicture } from '../ui/WordPicture';
import { CHOICE_GAMES, CHOICE_GAME_IDS, QUEST, type PlayId } from './choiceContent';
import { GAMES, GAME_IDS, label, type GameId } from './content';
import { SoundOffPicture, useSoundOff } from './SoundOff';
import { useReadingFont } from '../ui/readingFont';

export type RoomGame = GameId | PlayId;
/** The six cards, in order: the two letter games, then the four picture games. */
export const ROOM_GAMES: readonly RoomGame[] = [...GAME_IDS, ...CHOICE_GAME_IDS];
export const isLetterGame = (id: RoomGame): id is GameId => (GAME_IDS as readonly string[]).includes(id);
export const gameTitle = (id: RoomGame): string => (id === 'quest' ? QUEST.title : isLetterGame(id) ? GAMES.games[id].title : CHOICE_GAMES.games[id].title);
const door = (id: RoomGame): string => (id === 'quest' ? QUEST.door : isLetterGame(id) ? GAMES.games[id].door : CHOICE_GAMES.games[id].door);
const icon = (id: RoomGame): IconKind => (id === 'quest' ? QUEST.icon : isLetterGame(id) ? GAMES.games[id].icon : CHOICE_GAMES.games[id].icon) as IconKind;
/** The quest card's little path: one stone for each kind of picture game, then the castle. */
const PREVIEW: IconKind[] = ['horse', 'chest', 'bunny', 'book'];

const GAP = 14;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * `playable(id)`: the game can be followed by ear (games/playable.ts). A card that cannot is dimmed and does not start
 * its game: a child who cannot read could not follow it. The card stays solid; only its contents fade. With Sound off
 * in Comfort no royal game can be followed by ear, so every card is dimmed the same way and carries the picture that
 * says why (a speaker with a line through it); nothing starts and nothing is recorded.
 */
export function GamesRoom({ width, height, top, bottom, onPlay, playable }: { width: number; height: number; top: number; bottom: number; onPlay: (id: RoomGame) => void; playable: (id: RoomGame) => boolean }) {
  const m = width < 480 ? 12 : 18;
  const w = Math.min(width - 2 * m, 1000);
  const x = Math.round((width - w) / 2);
  const y = top + m;
  const h = height - Math.max(bottom, 0) - m - y;
  const cols = height > width ? 2 : 3;
  const rows = Math.ceil(ROOM_GAMES.length / cols);
  const questH = Math.round(clamp(h * 0.26, 110, 180));
  const cardW = Math.floor((w - (cols - 1) * GAP) / cols);
  const cardH = Math.floor(clamp((h - questH - GAP - (rows - 1) * GAP) / rows, 96, 230));
  const pic = Math.round(Math.min(cardW * 0.5, cardH - 64, 130));
  const questPic = Math.round(Math.min(questH - 28, 130));
  const stone = Math.round(clamp((w - questPic - 260) / 6 - 8, 0, 56));
  const narrow = w < 560;
  const soundOff = useSoundOff();
  const font = useReadingFont();
  const questReady = playable('quest') && !soundOff;
  const off = soundOff ? `. ${label('soundOff')}` : '';
  // A short window leaves the grid's rows less room than they ask for: it sits under the quest card all the same.
  return <View testID="games-room" style={[StyleSheet.absoluteFill]} pointerEvents="box-none">
    <Pressable testID="play-quest" accessibilityLabel={`${QUEST.title}${off}`} locked={!questReady} onPress={() => onPlay('quest')} style={[s.quest, { left: x, top: y, width: w, height: questH }, !questReady && s.resting]}>
      <View style={[s.questInside, !questReady && s.dim]}>
      <View style={[s.questArt, { width: questPic + 16, height: questPic + 16, borderRadius: (questPic + 16) / 2 }]}><MagicIcon kind="quest" size={questPic} /></View>
      <View style={s.questText}>
        <Text style={[s.questTitle, narrow && s.questTitleSmall, font.bold]} numberOfLines={2}>{QUEST.title}</Text>
        {stone >= 34 ? <View style={s.preview}>
          {PREVIEW.map((k, i) => <View key={i} style={[s.previewStone, { width: stone, height: stone, borderRadius: stone / 2 }]}><WordPicture kind={k} size={Math.round(stone * 0.62)} /></View>)}
          <MagicIcon kind="home" size={stone} color={P.gold} />
        </View> : null}
      </View>
      <View style={s.go}><MagicIcon kind="arrow" size={34} color={P.cream} /></View>
      </View>
      {soundOff ? <View testID="games-room-sound-off" style={s.why}><SoundOffPicture size={40} /></View> : null}
    </Pressable>
    {ROOM_GAMES.map((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const ready = playable(id) && !soundOff;
      return <Pressable key={id} testID={`play-${id}`} accessibilityLabel={`${gameTitle(id)}${off}`} locked={!ready} onPress={() => onPlay(id)}
        style={[s.card, { left: x + col * (cardW + GAP), top: y + questH + GAP + row * (cardH + GAP), width: cardW, height: cardH }, !ready && s.resting]}>
        <View style={[s.cardInside, !ready && s.dim]}>
          <View style={[s.cardArt, { width: pic + 20, height: pic + 20, borderRadius: (pic + 20) / 2 }]}><WordPicture kind={icon(id)} size={pic} /></View>
          <Text style={[s.cardText, narrow && s.cardTextSmall, font.bold]} numberOfLines={1}>{door(id)}</Text>
        </View>
        {soundOff ? <View style={s.why}><SoundOffPicture size={narrow ? 30 : 40} /></View> : null}
      </Pressable>;
    })}
  </View>;
}

const s = StyleSheet.create({
  quest: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 18, backgroundColor: P.paper, borderRadius: 34, borderWidth: 3, borderColor: P.gold, boxShadow: `0 6px 18px ${P.shadow}` },
  questArt: { backgroundColor: P.green, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: P.white },
  questText: { flex: 1, gap: 8, justifyContent: 'center' },
  questTitle: { color: P.ink, fontSize: 32, lineHeight: 38, fontWeight: '800' },
  questTitleSmall: { fontSize: 24, lineHeight: 29 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewStone: { backgroundColor: P.stone, borderWidth: 2, borderColor: P.stoneEdge, alignItems: 'center', justifyContent: 'center' },
  go: { width: 64, height: 64, borderRadius: 32, backgroundColor: P.deep, alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: P.paper, borderRadius: 30, borderWidth: 2, borderColor: P.edge, boxShadow: `0 5px 14px ${P.shadow}` },
  cardArt: { backgroundColor: P.ice, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: P.white },
  questInside: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 },
  cardInside: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  resting: { backgroundColor: P.cream, boxShadow: 'none' },
  dim: { opacity: 0.35 },
  why: { position: 'absolute', right: 10, top: 10, padding: 6, borderRadius: 30, backgroundColor: P.paper, borderWidth: 2, borderColor: P.edge },
  cardText: { color: P.ink, fontSize: 22, fontWeight: '800' },
  cardTextSmall: { fontSize: 18 },
});
