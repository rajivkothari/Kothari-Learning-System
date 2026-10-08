// Mission pools: an activity step may offer several activities, of which each mission instance
// presents one. The choice is a pure function of stable inputs (the instance's seed base, the
// mission key and the step id), so it is never stored: a resumed instance derives the same choice,
// and a restarted run with the same seed base gets the same activities.
import { createRng } from '../random/rng';
import type { ActivityStep } from './schema';

/** Every activity a step can present: its one activity, or each member of its pool. */
export function stepActivityIds(step: Pick<ActivityStep, 'activityId' | 'activityIds'>): readonly string[] {
  if (step.activityIds) return step.activityIds;
  return step.activityId ? [step.activityId] : [];
}

/**
 * The activity a step presents in the instance with `seedBase` of mission `missionKey` (see
 * schema.missionKey). A single activity is itself; a pool member is picked uniformly. Treat the seed
 * formula as versioned: changing it changes which activity a resumed instance shows.
 */
export function poolChoice(seedBase: string, missionKey: string, step: Pick<ActivityStep, 'id' | 'activityId' | 'activityIds'>): string {
  const ids = stepActivityIds(step);
  if (ids.length === 0) throw new RangeError(`Step "${step.id}" names no activity`);
  if (ids.length === 1) return ids[0] as string;
  return createRng(`${seedBase}|${missionKey}|${step.id}|pool`).pick(ids);
}
