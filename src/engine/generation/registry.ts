import { createRegistry, type GeneratorRegistry } from './generator';
import { beginningSound } from './generators/beginningSound';
import { fillToCapacity } from './generators/fillToCapacity';
import { positionAfterMove } from './generators/positionAfterMove';
import { remainderAfterFullLoad } from './generators/remainderAfterFullLoad';

/** Generators shipped with the engine. Content refers to them by id and version. */
export const BUILT_IN_GENERATORS: GeneratorRegistry = createRegistry([positionAfterMove, remainderAfterFullLoad, fillToCapacity, beginningSound]);
