// DEVELOPER TOOLING ONLY (imported by src/devtools, stubbed out of production child bundles).
//
// Floor 15 jumps, simulated misses, Concept Rescue helpers, and read-only inspection. Rules:
// - Only test learners (src/runtime/devSeed.ts refuses others).
// - Jumps write a mission checkpoint only, never learning records.
// - Simulated misses go through runtime.submit like a child's tap. A miss writes the checkpoint
//   only: an attempt is recorded when the item is resolved, by whoever resolves it.
// - Nothing here scores. Wrong values are found with runtime.check, as the director does.
import { currentItem, missionKey, poolChoice, startMissionAt, type MissionContext } from '../../../engine';
import { seedMissionAt, assertTestLearner } from '../../../runtime/devSeed';
import type { GameRuntime, RuntimeContent } from '../../../runtime/gameRuntime';
import type { SqlDatabase } from '../../../persistence/driver';
import { FLOOR15, THEME_PACK_ID } from '../content/floor15';
import { jobOf } from '../director/jobs';

export interface JumpTarget {
  id: string;
  label: string;
  /** A step of mission "positions-and-capacity" (content/missions/core.json), by id. */
  stepId: string;
  stageIndex?: number;
  /** A pool step: the member to show. The jump picks a seed whose pool chooses it (play would too). */
  activityId?: string;
  /**
   * An authored reading item (the prompt's `item`): the jump also picks a seed whose first item is
   * this one, as play would generate it there.
   */
  item?: string;
  /**
   * The floor the car waits at for the job (its anchor, director/jobs.ts): the jump also picks a seed
   * whose first job waits there, as play would generate it (a job at the rooftop, Floor 20).
   */
  anchor?: number;
}

/**
 * Jump targets: every step, every kind of math job a pool step can present, and a reading job of
 * each way of answering one (M8): touch a thing on the landing, ride to a floor, pick a card, and a
 * touch job on a landing whose things are not all drawn on the art (it is answered with cards).
 */
export const JUMPS: readonly JumpTarget[] = [
  { id: 'start', label: 'Mission start (wake the lift)', stepId: 'intro' },
  { id: 'practice', label: 'Practice: first service call', stepId: 'cued-moves' },
  { id: 'shaft', label: 'Shaft map job', stepId: 'second-representation', activityId: 'move-down.scale.cued' },
  { id: 'bridge-up', label: 'Shaft map: count on through ten', stepId: 'second-representation', activityId: 'move-up.scale.bridge-ten' },
  { id: 'bridge-down', label: 'Shaft map: count back through ten', stepId: 'second-representation', activityId: 'move-down.scale.bridge-ten' },
  { id: 'orders', label: 'Two orders (cargo bay, addition)', stepId: 'two-groups', activityId: 'combine-groups.objects' },
  { id: 'make-ten', label: 'Two orders that make ten', stepId: 'two-groups', activityId: 'combine-groups.make-ten' },
  { id: 'doubles', label: 'Two equal orders (doubles)', stepId: 'two-groups', activityId: 'combine-groups.doubles' },
  { id: 'near-doubles', label: 'Two orders one apart (near doubles)', stepId: 'two-groups', activityId: 'combine-groups.near-doubles' },
  { id: 'two-part', label: 'Two-part trip', stepId: 'two-moves', activityId: 'two-moves.line.cued' },
  { id: 'same-way', label: 'Two-part trip, the same way twice', stepId: 'two-moves', activityId: 'two-moves.same-way' },
  { id: 'express', label: 'Express stops (equal jumps)', stepId: 'number-sense', activityId: 'equal-jumps.line.cued' },
  { id: 'lamps', label: 'Lamp check: a gap in a pattern of 2s', stepId: 'number-sense', activityId: 'sequence.twos.gap' },
  { id: 'lamps-next', label: 'Lamp check: the next lamp, by 2s', stepId: 'number-sense', activityId: 'sequence.twos.next' },
  { id: 'fives', label: 'Lamp check: a pattern of 5s', stepId: 'number-sense', activityId: 'sequence.fives' },
  { id: 'ten-jump', label: 'Ten-floor express: ten more or ten less', stepId: 'number-sense', activityId: 'tens.ten-more-less' },
  { id: 'teen', label: 'Ten-floor express from the bottom (a teen number)', stepId: 'number-sense', activityId: 'tens.teen-from-zero' },
  { id: 'ten-and-ones', label: 'Ten-floor express, then some ones', stepId: 'number-sense', activityId: 'tens.and-ones.up' },
  { id: 'start-floor', label: 'Where did the crew get on?', stepId: 'start-unknown' },
  // Reading jobs (M8). The note opens first; folded, the job is answered on the landing, the panel or the cards.
  { id: 'read-touch', label: 'Reading: read the note, touch the thing (Floor 13)', stepId: 'read-1', activityId: 'reading.details.touch', item: 'push-the-cart' },
  { id: 'read-ride', label: 'Reading: read the note, ride to the floor', stepId: 'read-1', activityId: 'reading.details.ride' },
  { id: 'read-order', label: 'Reading: what comes first, then ride', stepId: 'read-2', activityId: 'reading.sequence.ride' },
  { id: 'read-golf', label: 'Reading: touch the thing on the rooftop (Floor 20: hole, ball, windmill)', stepId: 'read-2', activityId: 'reading.sequence.touch', item: 'check-the-hole' },
  { id: 'read-touch-cards', label: 'Reading: a touch job answered with cards (the lobby: not every thing is on the art)', stepId: 'read-3', activityId: 'reading.inference.touch', item: 'thirsty-plant' },
  { id: 'read-cards', label: 'Reading: a word in context, pick a card', stepId: 'read-4', activityId: 'reading.vocabulary.cards' },
  { id: 'meter', label: 'Trip meter (how many floors?)', stepId: 'compare-distance', activityId: 'distance.meter' },
  { id: 'meter-far', label: 'Trip meter, 8 to 15 floors', stepId: 'compare-distance', activityId: 'distance.meter.far' },
  { id: 'compare', label: 'Two calls: which comes second?', stepId: 'compare-distance', activityId: 'order.compare-two' },
  { id: 'order', label: 'Three calls in order', stepId: 'compare-distance', activityId: 'order.three' },
  // A job that waits at the rooftop (M8.1): the golf landing is open while the answer is a ride elsewhere.
  { id: 'calls-top', label: 'Two calls going down: the car waits at Floor 20 (rooftop golf)', stepId: 'compare-distance', activityId: 'order.compare-two', anchor: 20 },
  { id: 'stretch', label: 'Stretch: beacon job', stepId: 'stretch', activityId: 'move-either.reference.stretch' },
  { id: 'start-far', label: 'Stretch: where did they get on (6 to 9 floors)', stepId: 'stretch', activityId: 'start-unknown.bridge' },
  { id: 'two-part-wide', label: 'Stretch: a two-part trip with big moves', stepId: 'stretch', activityId: 'two-moves.line.wide' },
  { id: 'ten-and-ones-down', label: 'Stretch: ten-floor express down, then ones', stepId: 'stretch', activityId: 'tens.and-ones.down' },
  { id: 'add-teen', label: 'Stretch: 10 to 12 floors up', stepId: 'stretch', activityId: 'move-up.line.add-teen' },
  { id: 'route', label: 'Encounter: route to the dock', stepId: 'capacity-encounter', stageIndex: 0 },
  { id: 'cargo', label: 'Encounter: cargo bay', stepId: 'capacity-encounter', stageIndex: 1 },
  { id: 'finale', label: 'Finale ride to Floor 15', stepId: 'finale' },
];

/**
 * Where a jump lands in the content's mission: the step index, and a seed base whose pool choice
 * is the jump's activity and, for a reading jump, whose first item is the jump's item (searched
 * deterministically: `dev:<jump>`, then `dev:<jump>:1`, ...).
 */
export function jumpPosition(content: Pick<RuntimeContent, 'missions' | 'pack' | 'registry'>, target: JumpTarget): { stepIndex: number; seedBase: string } {
  const mission = content.missions.find((m) => m.id === FLOOR15.missionId);
  const stepIndex = mission ? mission.steps.findIndex((s) => s.id === target.stepId) : -1;
  const step = mission?.steps[stepIndex];
  if (!mission || !step) throw new Error(`Jump "${target.id}": no step "${target.stepId}"`);
  const base = `dev:${target.id}`;
  if (!target.activityId) return { stepIndex, seedBase: base };
  if (step.kind !== 'activity') throw new Error(`Jump "${target.id}": step "${target.stepId}" has no activities`);
  const key = missionKey(mission.id, mission.version);
  const ctx: MissionContext = { pack: content.pack, registry: content.registry, missions: content.missions };
  // The item the checkpoint would show, generated exactly as seedMissionAt does (pure, nothing stored).
  const firstItem = (seedBase: string) => {
    const at = startMissionAt(ctx, { instanceId: 'jump-search', missionId: mission.id, missionVersion: mission.version, learnerId: 'jump-search', seedBase, at: 0 }, { stepIndex });
    return currentItem(ctx, at.state);
  };
  const fits = (seedBase: string) => {
    if (target.item === undefined && target.anchor === undefined) return true;
    const item = firstItem(seedBase);
    if (!item) return false;
    if (target.item !== undefined && item.prompt.item !== target.item) return false;
    return target.anchor === undefined || jobOf(item)?.anchor === target.anchor;
  };
  for (let k = 0; k < 500; k++) {
    const seedBase = k === 0 ? base : `${base}:${k}`;
    if (poolChoice(seedBase, key, step) !== target.activityId) continue;
    if (fits(seedBase)) return { stepIndex, seedBase };
  }
  throw new Error(`Jump "${target.id}": step "${target.stepId}" never chooses "${target.activityId}"${target.item ? ` with item "${target.item}"` : ''}${target.anchor !== undefined ? ` waiting at floor ${target.anchor}` : ''}`);
}

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
  const { stepIndex, seedBase } = jumpPosition(ctx.content, target);
  const instanceId = `dev-${jumpId}-${learnerId}-${ctx.now().toString(36)}`;
  await seedMissionAt(ctx.db, ctx.runtime, ctx.content, {
    learnerId,
    themePack: THEME_PACK_ID,
    missionId: FLOOR15.missionId,
    instanceId,
    seedBase,
    stepIndex,
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

/** Listed options that are wrong for the current item (a reading job's things or cards), of the requested kind (via runtime.check). */
export function wrongOptions(runtime: GameRuntime, instanceId: string, kind: MissKind): string[] {
  const activity = runtime.currentView(instanceId).view.activity;
  if (!activity || activity.answer.mode !== 'choice') return [];
  return activity.options.flatMap((o) => {
    const c = runtime.check(instanceId, { mode: 'choice', optionId: o.id });
    if (!c.ok || c.evaluation.correct) return [];
    const tag = c.evaluation.misconception ?? null;
    return kind === 'any' || (kind === 'untagged' && tag === null) || (typeof kind === 'object' && tag === kind.tag) ? [o.id] : [];
  });
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
 * Submit `count` wrong answers on the instance's current item (a wrong value, or for a reading job
 * a wrong listed option), stopping early if a Concept Rescue starts. The instance must not be
 * driven by a live director at the same time: the caller disposes the session first and starts a
 * new one afterwards.
 */
export async function simulateMisses(ctx: DevContext, learnerId: string, instanceId: string, count: number, kind: MissKind): Promise<{ misses: number; rescue: boolean }> {
  assertTestLearner(learnerId);
  const owner = await ctx.db.get<{ learner_id: string }>('SELECT learner_id FROM mission_instances WHERE id = ?', [instanceId]);
  if (owner?.learner_id !== learnerId) throw new Error('Instance belongs to another learner');
  let { revision } = await ctx.runtime.activate(instanceId);
  let misses = 0;
  for (let i = 0; i < count; i++) {
    if (ctx.runtime.currentView(instanceId).view.activity?.rescue?.status === 'active') return { misses, rescue: true };
    const choice = ctx.runtime.currentView(instanceId).view.activity?.answer.mode === 'choice';
    const wrong = choice ? wrongOptions : wrongValues;
    const candidates: (number | string)[] = wrong(ctx.runtime, instanceId, kind);
    const fallback: (number | string)[] = kind === 'any' ? [] : wrong(ctx.runtime, instanceId, 'any');
    const pick = candidates[i % Math.max(1, candidates.length)] ?? fallback[i % Math.max(1, fallback.length)];
    if (pick === undefined) break;
    const commandId = `dev-miss-${instanceId}-${ctx.now().toString(36)}-${i}`;
    const out = await ctx.runtime.submit(instanceId, choice ? { commandId, optionId: String(pick), basedOn: revision } : { commandId, value: pick, basedOn: revision });
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
