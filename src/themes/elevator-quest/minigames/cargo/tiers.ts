// Cargo Commander's adaptive mix (M9): which tier of load each delivery of a session asks for, chosen
// from the learner's state. Pure: no React, no runtime, no clock.
//
// Tiers are a content judgement written into the activity ids (content/packs/two-digit.json):
//   approachable  add or subtract two-digit numbers with no ten made or broken; two-crate loads
//   solid         a ten made or broken; a missing amount; four crates
//   stretch       past 100; a missing amount that breaks a ten; three crates of five
// They are labels for the mix, not challenge categories: every cargo activity is "practice".
//
// The working tier only ever goes up, and only on success:
//   solid    once the learner has solved PROMOTE_AFTER distinct approachable loads, or an approachable
//            skill has peaked at proficient
//   stretch  the same, one tier up (solid loads, solid skills)
// Both signals come from evidence that a miss never removes (distinct items solved with credit, and
// peak levels, which never drop), so a miss, or a run of misses, never steps a learner down
// (non-negotiable 7: an incorrect answer never makes the next item easier).
//
// A session is a mix around the working tier (SESSION_PLANS): it opens with a confident win, has solid
// challenges, and a stretch load now and then; it never ends on a stretch load.
//
// How a plan reaches the runtime: the mission `cargo-commander` has five delivery steps, each a pool of
// every cargo activity. The runtime picks a pool member from the instance's seed (engine poolChoice: the
// seed base is the instance id), so a plan is honoured by choosing the instance id: cargoInstanceId()
// tries `<base>`, `<base>.t1`, `<base>.t2`, ... and returns the first whose choices give the planned tier
// at every step (preferring one with no activity twice). Deterministic, and nothing in the engine
// changes: a resumed instance keeps its choices, and the evidence names the activity that was played.
import { isAtLeast, missionKey, poolChoice, stepActivityIds, type Activity, type LearnerState, type MasteryLevel, type MissionDefinition } from '../../../../engine';

export const CARGO_TIERS = ['approachable', 'solid', 'stretch'] as const;
export type CargoTier = (typeof CARGO_TIERS)[number];

/** Distinct loads solved at a tier that open the next tier. */
export const PROMOTE_AFTER = 4;
/** A tier's skill at this peak level opens the next tier too. */
export const PROMOTE_AT_LEVEL: MasteryLevel = 'proficient';
/** How many instance ids cargoInstanceId tries before settling for the closest. */
export const SEARCH_LIMIT = 4096;

/** The mix of a session by working tier, delivery by delivery. */
export const SESSION_PLANS: Readonly<Record<CargoTier, readonly CargoTier[]>> = {
  approachable: ['approachable', 'approachable', 'solid', 'approachable', 'approachable'],
  solid: ['approachable', 'solid', 'solid', 'stretch', 'solid'],
  stretch: ['solid', 'stretch', 'solid', 'stretch', 'solid'],
};

/** The tier an activity id names (its last segment), or null. */
export function tierOf(activityId: string): CargoTier | null {
  const last = activityId.slice(activityId.lastIndexOf('.') + 1);
  return (CARGO_TIERS as readonly string[]).includes(last) ? (last as CargoTier) : null;
}

type ActivityLike = Pick<Activity, 'id' | 'skills'>;
type StateLike = Pick<LearnerState, 'skills' | 'solvedByActivity'>;

/** Whether the learner has shown `tier`: enough distinct loads of it solved, or one of its skills at the promotion level. */
export function tierShown(state: StateLike, activities: readonly ActivityLike[], tier: CargoTier): boolean {
  const own = activities.filter((a) => tierOf(a.id) === tier);
  const solved = own.reduce((n, a) => n + (state.solvedByActivity[a.id]?.length ?? 0), 0);
  if (solved >= PROMOTE_AFTER) return true;
  const skills = new Set(own.flatMap((a) => a.skills));
  return [...skills].some((s) => {
    const peak = state.skills[s]?.peakLevel;
    return peak !== undefined && isAtLeast(peak, PROMOTE_AT_LEVEL);
  });
}

/** The tier the learner works at now: approachable, then each tier shown opens the next. Never goes down. */
export function workingTier(state: StateLike, activities: readonly ActivityLike[]): CargoTier {
  if (!tierShown(state, activities, 'approachable')) return 'approachable';
  return tierShown(state, activities, 'solid') ? 'stretch' : 'solid';
}

/** The tiers of a session of `deliveries` loads (the plan for the working tier, repeated if longer). */
export function planSession(tier: CargoTier, deliveries: number): CargoTier[] {
  const plan = SESSION_PLANS[tier];
  return Array.from({ length: deliveries }, (_, i) => plan[i % plan.length] as CargoTier);
}

export interface CargoInstanceChoice {
  /** The instance id to start the mission with (its seed base). */
  instanceId: string;
  /** The activity each delivery step presents in that instance. */
  activities: string[];
  /** Whether every step got its planned tier (false only when the search limit ran out: the closest was kept). */
  matched: boolean;
}

/** After this many ids, a plan already matched is kept even if it repeats a load (repeats give different numbers). */
export const DISTINCT_EFFORT = 512;

/**
 * The first instance id from `base` (then `<base>.t1`, `<base>.t2`, ...) whose pool choices give `plan`'s
 * tier at every activity step (only activity steps count, in order). An id that also presents no activity
 * twice is preferred: the search keeps looking for one up to DISTINCT_EFFORT ids, then settles for the
 * first full match. Deterministic: the same inputs always give the same id. Each try is one seeded pick
 * per step (engine poolChoice) until a step misses its tier, so most tries cost one or two picks.
 */
export function cargoInstanceId(input: { base: string; plan: readonly CargoTier[]; mission: MissionDefinition; limit?: number }): CargoInstanceChoice {
  const key = missionKey(input.mission.id, input.mission.version);
  const steps = input.mission.steps.filter((s) => s.kind === 'activity');
  const limit = input.limit ?? SEARCH_LIMIT;
  let firstMatch: CargoInstanceChoice | null = null;
  let closest: CargoInstanceChoice & { score: number } = { instanceId: input.base, activities: [], matched: false, score: -1 };
  for (let k = 0; k < limit; k++) {
    if (firstMatch && k >= DISTINCT_EFFORT) return firstMatch;
    const instanceId = k === 0 ? input.base : `${input.base}.t${k}`;
    // Steps in order, stopping at the first that misses its tier (most ids miss early: cheap to reject).
    const activities: string[] = [];
    for (const step of steps) {
      const a = poolChoice(instanceId, key, step);
      if (tierOf(a) !== input.plan[activities.length]) break;
      activities.push(a);
    }
    if (activities.length === steps.length) {
      if (new Set(activities).size === activities.length) return { instanceId, activities, matched: true };
      firstMatch ??= { instanceId, activities, matched: true };
    } else if (!firstMatch && activities.length > closest.score) {
      closest = { instanceId, activities: steps.map((s) => poolChoice(instanceId, key, s)), matched: false, score: activities.length };
    }
  }
  return firstMatch ?? { instanceId: closest.instanceId, activities: closest.activities, matched: false };
}

/** Everything a new Cargo Commander session needs: the working tier, the plan, and the instance id that plays it. */
export function chooseCargoSession(input: { base: string; state: StateLike; mission: MissionDefinition; activities: readonly ActivityLike[] }): CargoInstanceChoice & { tier: CargoTier; plan: CargoTier[] } {
  const tier = workingTier(input.state, input.activities);
  const deliveries = input.mission.steps.filter((s) => s.kind === 'activity').length;
  const plan = planSession(tier, deliveries);
  return { tier, plan, ...cargoInstanceId({ base: input.base, plan, mission: input.mission }) };
}

/** The cargo activities a mission's steps can present (for workingTier's `activities`), from a pack. */
export function cargoActivities(mission: MissionDefinition, pack: { activities: readonly ActivityLike[] }): ActivityLike[] {
  const ids = new Set(mission.steps.flatMap((s) => (s.kind === 'activity' ? [...stepActivityIds(s)] : [])));
  return pack.activities.filter((a) => ids.has(a.id));
}
