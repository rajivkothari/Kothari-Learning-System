// The bundled production art: asset id -> the module Metro bundles for it. One static require per
// file, so Metro packs exactly these images and nothing else (no dynamic paths, no folder scans).
//
// Only approved art (rights.json approval "approved") is listed here: the cabin and Lifty's neutral
// pose, approved by the project owner after reviewing them (D145); Lifty's five other poses (D147),
// the landing backgrounds for floors 1, 2, 5, 6, 7, 9, 11, 13, 15 (dormant base and restored scene),
// 17, 18 and 20 (D150, D157) and the moving props (the Floor 2 toolbox closed and open, the Floor 18
// telescope with its background, the Floor 20 golf ball), approved by the owner's instruction for
// M8.1 after an agent audit; the last eight landing backgrounds (floors 3, 4, 8, 10, 12, 14, 16 and
// 19), approved the same way for M8.2, so every floor is illustrated. Adding an image: put the file under assets/themes/elevator-quest/art/,
// add its entry to content/themes/elevator-quest/art/manifest.json and its record to rights.json,
// review it in the developer tools (src/devtools/artReviewSources.ts), and move its line here once
// approved. `npm run validate:content` and the art tests check that the three agree.
import type { ArtSource } from './manifest';

export const ART_SOURCES: Readonly<Record<string, ArtSource>> = {
  'cabin.backing': require('../../../../assets/themes/elevator-quest/art/cabin/backing.png'),
  'cabin.ceiling': require('../../../../assets/themes/elevator-quest/art/cabin/ceiling.png'),
  'cabin.frame-top': require('../../../../assets/themes/elevator-quest/art/cabin/frame-top.png'),
  'cabin.frame-left': require('../../../../assets/themes/elevator-quest/art/cabin/frame-left.png'),
  'cabin.frame-right': require('../../../../assets/themes/elevator-quest/art/cabin/frame-right.png'),
  'cabin.door-left': require('../../../../assets/themes/elevator-quest/art/cabin/door-left.png'),
  'cabin.door-right': require('../../../../assets/themes/elevator-quest/art/cabin/door-right.png'),
  'cabin.floor': require('../../../../assets/themes/elevator-quest/art/cabin/floor.png'),
  'cabin.wall-left': require('../../../../assets/themes/elevator-quest/art/cabin/wall-left.png'),
  'cabin.wall-right': require('../../../../assets/themes/elevator-quest/art/cabin/wall-right.png'),
  'lifty.neutral': require('../../../../assets/themes/elevator-quest/art/lifty/neutral.png'),
  'lifty.quiet': require('../../../../assets/themes/elevator-quest/art/lifty/quiet.png'),
  'lifty.success': require('../../../../assets/themes/elevator-quest/art/lifty/success.png'),
  'lifty.help': require('../../../../assets/themes/elevator-quest/art/lifty/help.png'),
  'lifty.concerned': require('../../../../assets/themes/elevator-quest/art/lifty/concerned.png'),
  'lifty.thinking': require('../../../../assets/themes/elevator-quest/art/lifty/thinking.png'),
  'landing.1.background': require('../../../../assets/themes/elevator-quest/art/landings/1/background.webp'),
  'landing.2.background': require('../../../../assets/themes/elevator-quest/art/landings/2/background.webp'),
  'landing.2.toolbox': require('../../../../assets/themes/elevator-quest/art/landings/2/toolbox.webp'),
  'landing.2.toolbox-open': require('../../../../assets/themes/elevator-quest/art/landings/2/toolbox-open.webp'),
  'landing.5.background': require('../../../../assets/themes/elevator-quest/art/landings/5/background.webp'),
  'landing.6.background': require('../../../../assets/themes/elevator-quest/art/landings/6/background.webp'),
  'landing.7.background': require('../../../../assets/themes/elevator-quest/art/landings/7/background.webp'),
  'landing.9.background': require('../../../../assets/themes/elevator-quest/art/landings/9/background.webp'),
  'landing.11.background': require('../../../../assets/themes/elevator-quest/art/landings/11/background.webp'),
  'landing.13.background': require('../../../../assets/themes/elevator-quest/art/landings/13/background.webp'),
  'landing.15.background': require('../../../../assets/themes/elevator-quest/art/landings/15/background.webp'),
  'landing.15.background-restored': require('../../../../assets/themes/elevator-quest/art/landings/15/background-restored.webp'),
  'landing.17.background': require('../../../../assets/themes/elevator-quest/art/landings/17/background.webp'),
  'landing.18.background': require('../../../../assets/themes/elevator-quest/art/landings/18/background.webp'),
  'landing.18.telescope': require('../../../../assets/themes/elevator-quest/art/landings/18/telescope.webp'),
  'landing.20.background': require('../../../../assets/themes/elevator-quest/art/landings/20/background.webp'),
  'landing.20.ball': require('../../../../assets/themes/elevator-quest/art/landings/20/ball.webp'),
  'landing.3.background': require('../../../../assets/themes/elevator-quest/art/landings/3/background.webp'),
  'landing.4.background': require('../../../../assets/themes/elevator-quest/art/landings/4/background.webp'),
  'landing.8.background': require('../../../../assets/themes/elevator-quest/art/landings/8/background.webp'),
  'landing.10.background': require('../../../../assets/themes/elevator-quest/art/landings/10/background.webp'),
  'landing.12.background': require('../../../../assets/themes/elevator-quest/art/landings/12/background.webp'),
  'landing.14.background': require('../../../../assets/themes/elevator-quest/art/landings/14/background.webp'),
  'landing.14.lamp': require('../../../../assets/themes/elevator-quest/art/landings/14/lamp.webp'),
  'landing.16.background': require('../../../../assets/themes/elevator-quest/art/landings/16/background.webp'),
  'landing.19.background': require('../../../../assets/themes/elevator-quest/art/landings/19/background.webp'),
  'landing.19.rotor': require('../../../../assets/themes/elevator-quest/art/landings/19/rotor.webp'),
};
