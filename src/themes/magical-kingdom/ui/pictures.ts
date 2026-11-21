import type { IconKind } from './MagicArt';

// The picture for a word a child hears, and the pictures of a told story: Microsoft Fluent Emoji, 3D style (MIT), the 256 px PNG as published.
// Source path, commit and hash of each: assets/themes/magical-kingdom/pictures/manifest.json (pictures.test.ts
// checks them against the files). `sun` and `bun` have no emoji that reads as the word and stay code-drawn
// (MagicArt), as do chests, the gem and every control. Every picture has a code-drawn icon of the same name to
// fall back on.
export const PICTURES = {
  fox: require('../../../../assets/themes/magical-kingdom/pictures/fox.png'),
  box: require('../../../../assets/themes/magical-kingdom/pictures/box.png'),
  bee: require('../../../../assets/themes/magical-kingdom/pictures/bee.png'),
  key: require('../../../../assets/themes/magical-kingdom/pictures/key.png'),
  moon: require('../../../../assets/themes/magical-kingdom/pictures/moon.png'),
  spoon: require('../../../../assets/themes/magical-kingdom/pictures/spoon.png'),
  fish: require('../../../../assets/themes/magical-kingdom/pictures/fish.png'),
  dish: require('../../../../assets/themes/magical-kingdom/pictures/dish.png'),
  star: require('../../../../assets/themes/magical-kingdom/pictures/star.png'),
  car: require('../../../../assets/themes/magical-kingdom/pictures/car.png'),
  duck: require('../../../../assets/themes/magical-kingdom/pictures/duck.png'),
  truck: require('../../../../assets/themes/magical-kingdom/pictures/truck.png'),
  bunny: require('../../../../assets/themes/magical-kingdom/pictures/bunny.png'),
  rainbow: require('../../../../assets/themes/magical-kingdom/pictures/rainbow.png'),
  apple: require('../../../../assets/themes/magical-kingdom/pictures/apple.png'),
  butterfly: require('../../../../assets/themes/magical-kingdom/pictures/butterfly.png'),
  banana: require('../../../../assets/themes/magical-kingdom/pictures/banana.png'),
  flower: require('../../../../assets/themes/magical-kingdom/pictures/flower.png'),
  umbrella: require('../../../../assets/themes/magical-kingdom/pictures/umbrella.png'),
  cat: require('../../../../assets/themes/magical-kingdom/pictures/cat.png'),
  hat: require('../../../../assets/themes/magical-kingdom/pictures/hat.png'),
  map: require('../../../../assets/themes/magical-kingdom/pictures/map.png'),
  pig: require('../../../../assets/themes/magical-kingdom/pictures/pig.png'),
  snow: require('../../../../assets/themes/magical-kingdom/pictures/snow.png'),
  horse: require('../../../../assets/themes/magical-kingdom/pictures/horse.png'),
  book: require('../../../../assets/themes/magical-kingdom/pictures/book.png'),
  pin: require('../../../../assets/themes/magical-kingdom/pictures/pin.png'),
  flag: require('../../../../assets/themes/magical-kingdom/pictures/flag.png'),
  // The props of the Story Corner picture book: one a sentence, beside the story's characters. None is a word of any game.
  gift: require('../../../../assets/themes/magical-kingdom/pictures/gift.png'),
  hearts: require('../../../../assets/themes/magical-kingdom/pictures/hearts.png'),
  worried: require('../../../../assets/themes/magical-kingdom/pictures/worried.png'),
  magnifier: require('../../../../assets/themes/magical-kingdom/pictures/magnifier.png'),
  party: require('../../../../assets/themes/magical-kingdom/pictures/party.png'),
  basket: require('../../../../assets/themes/magical-kingdom/pictures/basket.png'),
  yum: require('../../../../assets/themes/magical-kingdom/pictures/yum.png'),
  telescope: require('../../../../assets/themes/magical-kingdom/pictures/telescope.png'),
} as const satisfies Partial<Record<IconKind, number>>;
export type PictureKind = keyof typeof PICTURES;

/** The picture's image source, or undefined when the word is code-drawn. */
export function pictureOf(kind: string): number | undefined {
  return Object.hasOwn(PICTURES, kind) ? PICTURES[kind as PictureKind] : undefined;
}
