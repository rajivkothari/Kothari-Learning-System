// DEVELOPER TOOLING ONLY (imported by src/devtools, stubbed out of production child bundles).
//
// Floor 15 jumps, simulated misses, Concept Rescue helpers, and read-only inspection. Rules:
// - Only test learners (src/runtime/devSeed.ts refuses others).
// - Jumps write a mission checkpoint only, never learning records.
// - Simulated misses go through runtime.submit like a child's tap. A miss writes the checkpoint
//   only: an attempt is recorded when the item is resolved, by whoever resolves it.
// - Nothing here scores. Wrong values are found with runtime.check, as the director does.
import { seedMissionAt, assertTestLearner } from '../../../runtime/devSeed';
import type { GameRuntime, RuntimeContent } from '../../../runtime/gameRuntime';
import type { SqlDatabase } from '../../../persistence/driver';
import { FLOOR15, THEME_PACK_ID } from '../content/floor15';

export interface JumpTarget {
  id: string;
  label: string;
  stepIndex: number;
  stageIndex?: number;
}

/** Positions in mission "positions-and-capacity" (content/missions/core.json). */
export const JUMPS: readonly JumpTarget[] = [
  { id: 'start', label: 'Mission start (wake the lift)', stepIndex: 0 },
  { id: 'practice', label: 'Practice: first service call', stepIndex: 1 },
  { id: 'shaft', label: 'Shaft map job', stepIndex: 2 },
  { id: 'orders', label: 'Two orders (cargo bay, addition)', stepIndex: 3 },
  { id: 'two-part', label: 'Two-part trip', stepIndex: 4 },
  { id: 'start-floor', label: 'Where did the crew get on?', stepIndex: 5 },
  { id: 'meter', label: 'Trip meter (how many floors?)', stepIndex: 6 },
  { id: 'stretch', label: 'Stretch: beacon job', stepIndex: 7 },
  { id: 'express', label: 'Express stops (equal jumps)', stepIndex: 8 },
  { id: 'route', label: 'Encounter: route to the dock', stepIndex: 9, stageIndex: 0 },
  { id: 'cargo', label: 'Encounter: cargo bay', stepIndex: 9, stageIndex: 1 },
  { id: 'finale', label: 'Finale ride to Floor 15', stepIndex: 10 },
];

export interface DevContext {
  db: SqlDatabase;
  runtime: GameRuntime;
  content: RuntimeContent;
  now: () => number;
}

/** Seed a new mission instance for a test learner at a jump target. Returns its instance id. */
export async function jumpTo(ctx: DevContext, learnerId: string, jumpId: string): Promise<string> {
  const target = JUMPS.find((j) => j.id === jumpId);
  if (!target) throw new Error(`Unknown jump "${jumpId}"`);
  const instanceId = `dev-${jumpId}-${learnerId}-${ctx.now().toString(36)}`;
  await seedMissionAt(ctx.db, ctx.runtime, ctx.content, {
    learnerId,
    themePack: THEME_PACK_ID,
    missionId: FLOOR15.missionId,
    instanceId,
    seedBase: `dev:${jumpId}`,
    stepIndex: target.stepIndex,
    ...(target.stageIndex !== undefined ? { stageIndex: target.stageIndex } : {}),
    at: ctx.now(),
  });
  return instanceId;
}

/**
 * Give a test learner some exploration discoveries (world memory keys), as if they had inspected
 * those places. World memory only: never a learning record. Unmount the game first.
 */
export async function seedDiscoveries(ctx: DevContext, learnerId: string, keys: readonly string[]): Promise<void> {
  assertTestLearner(learnerId);
  for (const key of keys) await ctx.runtime.remember(learnerId, key);
}

/** Start a brand-new normal instance (the "Reset current mission" action). */
export async function restartMission(ctx: DevContext, learnerId: string): Promise<string> {
  assertTestLearner(learnerId);
  const instanceId = `floor15-${learnerId}-${ctx.now().toString(36)}`;
  if (!(await ctx.runtime.getLearner(learnerId))) await ctx.runtime.createLearner({ id: learnerId, themePack: THEME_PACK_ID });
  await ctx.runtime.startMission({ learnerId, missionId: FLOOR15.missionId, instanceId });
  return instanceId;
}

export type MissKind = 'untagged' | 'any' | { tag: string };

/** Values that are wrong for the current item, of the requested kind (via runtime.check). */
export function wrongValues(runtime: GameRuntime, instanceId: string, kind: MissKind): number[] {
  const { view } = runtime.currentView(instanceId);
  const a = view.activity?.answer;
  if (!a || a.mode !== 'value') return [];
  const out: number[] = [];
  for (let v = a.min; v <= a.max; v++) {
    const c = runtime.check(instanceId, { mode: 'value', value: v });
    if (!c.ok || c.evaluation.correct) continue;
    const tag = c.evaluation.misconception ?? null;
    if (kind === 'any' || (kind === 'untagged' && tag === null) || (typeof kind === 'object' && tag === kind.tag)) out.push(v);
  }
  return out;
}

/** The right value for the current item (developer tools only: screenshots of a success). */
export function rightValue(runtime: GameRuntime, instanceId: string): number | null {
  const { view } = runtime.currentView(instanceId);
  const a = view.activity?.answer;
  if (!a || a.mode !== 'value') return null;
  for (let v = a.min; v <= a.max; v++) {
    const c = runtime.check(instanceId, { mode: 'value', value: v });
    if (c.ok && c.evaluation.correct) return v;
  }
  return null;
}

/**
 * Submit `count` wrong answers on the instance's current item, stopping early if a Concept
 * Rescue starts. The instance must not be driven by a live director at the same time: the
 * caller disposes the session first and starts a new one afterwards.
 */
export async function simulateMisses(ctx: DevContext, learnerId: string, instanceId: string, count: number, kind: MissKind): Promise<{ misses: number; rescue: boolean }> {
  assertTestLearner(learnerId);
  const owner = await ctx.db.get<{ learner_id: string }>('SELECT learner_id FROM mission_instances WHERE id = ?', [instanceId]);
  if (owner?.learner_id !== learnerId) throw new Error('Instance belongs to another learner');
  let { revision } = await ctx.runtime.activate(instanceId);
  let misses = 0;
  for (let i = 0; i < count; i++) {
    if (ctx.runtime.currentView(instanceId).view.activity?.rescue?.status === 'active') return { misses, rescue: true };
    const candidates = wrongValues(ctx.runtime, instanceId, kind);
    const fallback = kind === 'any' ? [] : wrongValues(ctx.runtime, instanceId, 'any');
    const value = candidates[i % Math.max(1, candidates.length)] ?? fallback[i % Math.max(1, fallback.length)];
    if (value === undefined) break;
    const out = await ctx.runtime.submit(instanceId, { commandId: `dev-miss-${instanceId}-${ctx.now().toString(36)}-${i}`, value, basedOn: revision });
    revision = out.revision;
    misses += 1;
  }
  return { misses, rescue: ctx.runtime.currentView(instanceId).view.activity?.rescue?.status === 'active' };
}

/** How many misses the practice policy needs before the visual tool and the rescue (data, not literals). */
export function thresholds(content: RuntimeContent, policyId = 'moves.on-a-line'): { visual: number | null; rescue: number | null } {
  const p = content.pack.scaffoldingPolicies.find((x) => x.id === policyId);
  return { visual: p?.steps.find((s) => s.assistance === 'visualSupport')?.afterWrongTries ?? null, rescue: p?.conceptRescue?.afterWrongTries ?? null };
}

export interface Inspection {
  learnerId: string;
  unlocks: string[];
  settings: Record<string, string>;
  placement: { id: string; source: string; unlockedSkills: string[] } | null;
  skills: { id: string; level: string; peak: string; unlocked: boolean }[];
  attempts: number;
  completions: number;
  lastAttempt: { outcome: string; assistance: string; wrongTries: number; conceptRescue: boolean } | null;
}

/** Read-only snapshot for the developer panel. Never shown in the child's game. */
export async function inspectLearner(ctx: DevContext, learnerId: string): Promise<Inspection> {
  const [unlocks, settings, state] = await Promise.all([ctx.runtime.unlocks(learnerId), ctx.runtime.settings(learnerId), ctx.runtime.learnerState(learnerId)]);
  const count = async (sql: string) => (await ctx.db.get<{ n: number }>(sql, [learnerId]))?.n ?? 0;
  const last = await ctx.db.get<{ payload: string }>("SELECT payload FROM learning_events WHERE learner_id = ? AND type = 'attempt' ORDER BY seq DESC LIMIT 1", [learnerId]);
  const a = last ? (JSON.parse(last.payload) as { outcome: string; assistance: string; wrongTries: number; conceptRescue?: boolean }) : null;
  const p = ctx.content.placement as { id: string; source?: string; unlockedSkills: readonly string[] } | undefined;
  return {
    learnerId,
    unlocks: unlocks.map((u) => u.unlockId),
    settings,
    placement: p ? { id: p.id, source: p.source ?? 'assumption', unlockedSkills: [...p.unlockedSkills] } : null,
    skills: Object.entries(state.skills).map(([id, s]) => ({ id, level: s.level, peak: s.peakLevel, unlocked: s.unlocked })),
    attempts: await count("SELECT COUNT(*) AS n FROM learning_events WHERE learner_id = ? AND type = 'attempt'"),
    completions: await count("SELECT COUNT(*) AS n FROM learning_events WHERE learner_id = ? AND id LIKE 'completion:mission:%'"),
    lastAttempt: a ? { outcome: a.outcome, assistance: a.assistance, wrongTries: a.wrongTries, conceptRescue: a.conceptRescue === true } : null,
  };
}
