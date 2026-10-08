// Pack composition: several content packs used as one. Pure.
//
// A learning domain can live in its own pack file (core math, reading, ...) while every loader
// still works with a single ContentPack. Composition concatenates each collection in pack order,
// so the result is stable for a given list. Ids must be unique across the packs: a duplicate is
// an error, never a silent override, because evidence and missions refer to content by id.
import type { ContentPack } from './pack';

export class ContentCompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentCompositionError';
  }
}

const COLLECTIONS = ['skills', 'misconceptions', 'scaffoldingPolicies', 'activities', 'encounters'] as const;

/**
 * One pack made of `packs`, in order. The id, version and schemaVersion come from the first pack.
 * Throws ContentCompositionError on an empty list or an id that appears twice in any collection
 * (within one pack or across packs), naming the collection, the id and the packs involved.
 */
export function composeContentPacks(packs: readonly ContentPack[]): ContentPack {
  const [first] = packs;
  if (!first) throw new ContentCompositionError('Nothing to compose: no content packs given');
  for (const name of COLLECTIONS) {
    const owner = new Map<string, string>();
    for (const pack of packs) {
      for (const item of pack[name]) {
        const prior = owner.get(item.id);
        if (prior !== undefined) throw new ContentCompositionError(`Duplicate id "${item.id}" in ${name}: in pack "${prior}" and pack "${pack.id}"`);
        owner.set(item.id, pack.id);
      }
    }
  }
  return {
    schemaVersion: first.schemaVersion,
    id: first.id,
    version: first.version,
    skills: packs.flatMap((p) => p.skills),
    misconceptions: packs.flatMap((p) => p.misconceptions),
    scaffoldingPolicies: packs.flatMap((p) => p.scaffoldingPolicies),
    activities: packs.flatMap((p) => p.activities),
    encounters: packs.flatMap((p) => p.encounters),
  };
}
