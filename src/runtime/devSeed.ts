// DEVELOPER TOOLING ONLY. Imported by the developer tools, never by the game. Production child
// bundles do not contain it (the tools are stubbed out by metro.config.js).
//
// Places a test learner's mission at a known checkpoint without playing the steps before it.
// It writes a mission checkpoint row only: no attempts, no completion records, no progression,
// no unlocks. Every later learning record comes from real play on that checkpoint through the
// normal runtime commands, on a test learner. Real learners are refused.
import { startMissionAt, type MissionContext } from '../engine';
import type { SqlDatabase } from '../persistence/driver';
import { insertMissionInstance } from '../persistence/store';
import type { GameRuntime, RuntimeContent } from './gameRuntime';

/** Learner ids the developer tools may write to. Never a real learner. */
export const TEST_LEARNER_BASES = ['learner-test-a', 'learner-test-b', 'fresh-learner'] as const;
export type TestLearnerBase = (typeof TEST_LEARNER_BASES)[number];

export function isTestLearner(id: string): boolean {
  return TEST_LEARNER_BASES.some((base) => id === base || id.startsWith(`${base}-g`));
}

export function assertTestLearner(id: string): void {
  if (!isTestLearner(id)) throw new Error(`Developer tools only act on test learners (${TEST_LEARNER_BASES.join(', ')}), not "${id}"`);
}

export interface SeedInput {
  learnerId: string;
  /** The caller's theme pack, stored on a learner this creates. The runtime knows no themes. */
  themePack: string;
  missionId: string;
  instanceId: string;
  /** Fixed seed base, so the same jump always shows the same items. */
  seedBase: string;
  stepIndex: number;
  stageIndex?: number;
  at: number;
}

export async function seedMissionAt(db: SqlDatabase, runtime: GameRuntime, content: RuntimeContent, input: SeedInput): Promise<void> {
  assertTestLearner(input.learnerId);
  if (!(await runtime.getLearner(input.learnerId))) await runtime.createLearner({ id: input.learnerId, themePack: input.themePack });
  const def = content.missions.filter((m) => m.id === input.missionId).sort((a, b) => b.version - a.version)[0];
  if (!def) throw new Error(`Unknown mission "${input.missionId}"`);
  const ctx: MissionContext = { pack: content.pack, registry: content.registry, missions: content.missions };
  const r = startMissionAt(
    ctx,
    { instanceId: input.instanceId, missionId: def.id, missionVersion: def.version, learnerId: input.learnerId, seedBase: input.seedBase, at: input.at },
    { stepIndex: input.stepIndex, ...(input.stageIndex !== undefined ? { stageIndex: input.stageIndex } : {}) },
  );
  if (r.events.length) throw new Error('A developer seed must not create learning records');
  await db.transaction(async (tx) => {
    if (!(await insertMissionInstance(tx, r.state, r.intents, input.at))) throw new Error(`Mission instance "${input.instanceId}" already exists`);
  });
}

/**
 * Test learner generations. A reset never deletes anything (learning history is append-only):
 * it moves the profile to a new id, `<base>-g<n+1>`, which starts empty. Older generations stay
 * in the database, unreachable from the tools.
 */
export async function currentGeneration(runtime: GameRuntime, base: TestLearnerBase): Promise<number> {
  let n = 0;
  while (await runtime.getLearner(`${base}-g${n + 1}`)) n += 1;
  return n;
}

export const learnerIdFor = (base: TestLearnerBase, generation: number) => `${base}-g${Math.max(1, generation)}`;

/** The id to use for a test profile now (its newest generation, created if needed). */
export async function activeTestLearner(runtime: GameRuntime, base: TestLearnerBase, themePack: string): Promise<string> {
  const id = learnerIdFor(base, await currentGeneration(runtime, base));
  if (!(await runtime.getLearner(id))) await runtime.createLearner({ id, themePack });
  return id;
}

/** Reset one test profile: the next generation, empty. Other profiles are untouched. */
export async function resetTestLearner(runtime: GameRuntime, base: TestLearnerBase, themePack: string): Promise<string> {
  const id = learnerIdFor(base, (await currentGeneration(runtime, base)) + 1);
  await runtime.createLearner({ id, themePack });
  return id;
}
