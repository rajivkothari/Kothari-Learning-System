// Test-only helpers for engine tests. Not exported from the engine index.
// Learner ids are synthetic; never put real learner data in fixtures.
import config from '../../../content/engine-config.json';
import sampleMissions from '../../../content/fixtures/sample-missions.json';
import samplePack from '../../../content/fixtures/sample-pack.json';
import coreMissions from '../../../content/missions/core.json';
import corePack from '../../../content/packs/core.json';
import readingPack from '../../../content/packs/reading.json';
import spellingPack from '../../../content/packs/spelling.json';
import twoDigitPack from '../../../content/packs/two-digit.json';
import { composeContentPacks } from '../content/compose';
import { ContentPackSchema, type ContentPack } from '../content/pack';
import { AttemptEvidenceSchema, type AttemptEvidence } from '../evidence/attempt';
import { BUILT_IN_GENERATORS } from '../generation/registry';
import { parseEngineConfig, type EngineConfig, type MasteryPolicy } from '../mastery/policy';
import type { MissionContext } from '../mission/runtime';
import { MissionPackSchema, type MissionDefinition } from '../mission/schema';
import { buildSkillGraph, type SkillGraph } from '../skills/graph';
import type { SkillDefinition } from '../skills/skill';

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
/** Fixed reference time. Tests never read the real clock. */
export const T0 = 1_791_244_800_000; // 2026-10-06T00:00:00Z

export const ENGINE_CONFIG: EngineConfig = parseEngineConfig(config);
export const POLICY: MasteryPolicy = ENGINE_CONFIG.masteryPolicy;
export const PACK: ContentPack = ContentPackSchema.parse(samplePack);

export function graphOf(skills: readonly SkillDefinition[]): SkillGraph {
  const result = buildSkillGraph(skills);
  if (!result.ok) throw new Error(result.issues.map((i) => i.message).join('; '));
  return result.graph;
}

export const PACK_GRAPH = graphOf(PACK.skills);
export const MISSIONS: MissionDefinition[] = MissionPackSchema.parse(sampleMissions).missions;
export const MISSION_CTX: MissionContext = { pack: PACK, registry: BUILT_IN_GENERATORS, missions: MISSIONS };

/**
 * The packs the app ships, in the order every loader composes them: core math, reading, then (M9) the
 * mini-games' spelling and two-digit math.
 */
export const SHIPPED_PACKS: readonly ContentPack[] = [corePack, readingPack, spellingPack, twoDigitPack].map((p) => ContentPackSchema.parse(p));
export const SHIPPED_PACK: ContentPack = composeContentPacks(SHIPPED_PACKS);
export const SHIPPED_MISSIONS: MissionDefinition[] = MissionPackSchema.parse(coreMissions).missions;
export const SHIPPED_CTX: MissionContext = { pack: SHIPPED_PACK, registry: BUILT_IN_GENERATORS, missions: SHIPPED_MISSIONS };

/** Two-skill graph for focused mastery tests: "test.base" -> "test.next". */
export const MINI_SKILLS: SkillDefinition[] = [
  { id: 'test.base', domain: 'math', strand: 'test', label: 'Base', prerequisites: [], representations: ['numeral', 'verticalScale'], tags: [] },
  { id: 'test.next', domain: 'math', strand: 'test', label: 'Next', prerequisites: ['test.base'], representations: [], tags: [] },
];
export const MINI_GRAPH = graphOf(MINI_SKILLS);

type AttemptInput = Partial<Omit<AttemptEvidence, 'schemaVersion'>> & Pick<AttemptEvidence, 'itemSignature' | 'occurredAt'>;

let factories = 0;

/** Factory with its own prefix and counter, so ids never collide across factories. */
export function attemptFactory(defaults: Partial<AttemptEvidence> = {}) {
  factories += 1;
  const prefix = `f${String(factories).padStart(3, '0')}`;
  let n = 0;
  return (input: AttemptInput): AttemptEvidence => {
    n += 1;
    const tag = `${prefix}-${String(n).padStart(4, '0')}`;
    return AttemptEvidenceSchema.parse({
      schemaVersion: 1,
      id: `att-${tag}`,
      learnerId: 'learner-test',
      activityId: 'activity-test',
      activityInstanceId: `inst-${tag}`,
      skillIds: ['test.base'],
      challenge: 'practice',
      cued: true,
      representation: 'numeral',
      transfer: { kind: 'none' },
      outcome: 'correct',
      assistance: 'independent',
      wrongTries: 0,
      misconceptions: [],
      ...defaults,
      ...input,
    });
  };
}

/** n independent successes on distinct items, `gapMs` apart, starting at `start`. */
export function successes(make: ReturnType<typeof attemptFactory>, count: number, start: number, gapMs: number, extra: Partial<AttemptEvidence> = {}): AttemptEvidence[] {
  return Array.from({ length: count }, (_, i) => make({ itemSignature: `${extra.representation ?? 'sig'}-${start}-${i}`, occurredAt: start + i * gapMs, ...extra }));
}
