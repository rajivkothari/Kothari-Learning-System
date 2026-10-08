import { createRegistry, type GeneratorRegistry } from './generator';
import { authoredItem } from './generators/authoredItem';
import { beginningSound } from './generators/beginningSound';
import { combineGroups, combineGroupsV2 } from './generators/combineGroups';
import { distanceBetween } from './generators/distanceBetween';
import { equalJumps } from './generators/equalJumps';
import { fillToCapacity } from './generators/fillToCapacity';
import { missingInSequence } from './generators/missingInSequence';
import { orderPositions } from './generators/orderPositions';
import { positionAfterMove } from './generators/positionAfterMove';
import { positionAfterTwoMoves, positionAfterTwoMovesV2 } from './generators/positionAfterTwoMoves';
import { remainderAfterFullLoad } from './generators/remainderAfterFullLoad';
import { startBeforeMove } from './generators/startBeforeMove';
import { tensAndOnes } from './generators/tensAndOnes';

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
  authoredItem,
  // M8 math: skip counting from any start, place value, comparing and ordering; v2 of two
  // generators (v1 stays for the activities and evidence that use it).
  missingInSequence,
  tensAndOnes,
  orderPositions,
  positionAfterTwoMovesV2,
  combineGroupsV2,
]);
