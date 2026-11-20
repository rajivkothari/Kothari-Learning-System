import { useState } from 'react';
import { Image } from 'react-native';
import { MagicIcon, type IconKind } from './MagicArt';
import { pictureOf } from './pictures';

/**
 * The picture for a word: the 3D picture when the word has one (ui/pictures.ts), otherwise the code-drawn icon,
 * and the icon too if the image cannot load. Decorative: the caller names it for a screen reader. `color` only
 * reaches the icon.
 */
export function WordPicture({ kind, size, color }: { kind: IconKind; size: number; color?: string }) {
  const [failed, setFailed] = useState<IconKind | null>(null);
  const source = pictureOf(kind);
  if (source === undefined || failed === kind) return <MagicIcon kind={kind} size={size} color={color} />;
  return <Image source={source} onError={() => setFailed(kind)} style={{ width: size, height: size }} resizeMode="contain" fadeDuration={0} accessible={false} aria-hidden />;
}
