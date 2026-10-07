import { createRegistry, type GeneratorRegistry } from './generator';
import { beginningSound } from './generators/beginningSound';
import { combineGroups } from './generators/combineGroups';
import { distanceBetween } from './generators/distanceBetween';
import { equalJumps } from './generators/equalJumps';
import { fillToCapacity } from './generators/fillToCapacity';
import { positionAfterMove } from './generators/positionAfterMove';
import { positionAfterTwoMoves } from './generators/positionAfterTwoMoves';
import { remainderAfterFullLoad } from './generators/remainderAfterFullLoad';
import { startBeforeMove } from './generators/startBeforeMove';

/** Generators shipped with the engine. Content refers to them by id and version. */
export const BUILT_IN_GENERATORS: GeneratorRegistry = createRegistry([
  positionAfterMove,
  remainderAfterFullLoad,
  fillToCapacity,
  beginningSound,
  positionAfterTwoMoves,
  startBeforeMove,
  equalJumps,
  distanceBetween,
  combineGroups,
]);
