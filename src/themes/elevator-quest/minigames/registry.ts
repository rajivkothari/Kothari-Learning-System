// The mini-games with their screens (M9): the catalog (catalog.ts, pure) plus each game's screen
// (WG's Word Golf, CC's Cargo Commander). registryPlaceholder.tsx keeps a labelled placeholder per
// game for a build that needs one.
import { MINI_GAMES } from './catalog';
import { CargoCommanderScreen } from './cargo/CargoCommanderScreen';
import { WordGolfScreen } from './wordGolf/WordGolfScreen';
import type { MiniGameDefinition, MiniGameId, MiniGameScreenProps } from './types';
import type { ComponentType } from 'react';

const SCREENS: Record<MiniGameId, { Screen: ComponentType<MiniGameScreenProps>; preload?: MiniGameDefinition['preload'] }> = {
  'word-golf': { Screen: WordGolfScreen, preload: { art: ['minigame.wordgolf.backdrop'], sounds: ['golfHit', 'golfRoll', 'golfCup', 'holeComplete', 'tilePlace', 'tileUndo'] } },
  'cargo-commander': { Screen: CargoCommanderScreen, preload: { art: ['minigame.cargo.backdrop', 'minigame.cargo.freight', 'minigame.cargo.crate'], sounds: ['cratePick', 'cratePlace', 'gaugeTick', 'freightMove', 'deliveryComplete'] } },
};

export const MINI_GAME_REGISTRY: readonly MiniGameDefinition[] = MINI_GAMES.map((entry) => ({ ...entry, ...SCREENS[entry.id] }));

export function definitionFor(id: MiniGameId): MiniGameDefinition {
  const d = MINI_GAME_REGISTRY.find((g) => g.id === id);
  if (!d) throw new Error(`No mini-game "${id}"`);
  return d;
}
