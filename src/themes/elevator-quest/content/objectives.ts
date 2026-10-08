// Mission objectives in the world: the concrete things Floor 15's jobs talk about, and where they
// physically appear. Pure: no React, no Skia.
//
// Rule (DECISIONS D123): a concrete mission noun gets a concrete world representation. If a job
// says "the repair kit is 7 floors up", the repair kit is on the landing when the doors open at the
// right floor, and it is NOT there at a wrong floor. The object is placed only after the answer is
// locked (from the committed check), so it never reveals the floor in advance.
//
// "destination": at the job's answer floor. "reference": at the given reference floor (the beacon),
// visible whenever the car stands there during that job. Objects are session state: nothing here is
// stored, and nothing here is evidence.
//
// A pool step (M8) presents one of several activities, each with its own words, so an object may
// name the `activities` it is for. An object without `activities` is for every activity of its step.
//
// A reading job (M8) has no mission object: its note is the job, and the thing it asks for is a
// landing object (touch) or a floor (ride) that is already part of the world. So reading activities
// are exempt from coverage, and an object may not name one. Every math job still needs its object.
import { z } from 'zod';

import objectivesJson from '../../../../content/themes/elevator-quest/objectives.json';

export const OBJECT_VISUALS = ['repairKit', 'toolbox', 'spareParts', 'crew', 'beacon', 'loadingDock'] as const;
export type ObjectVisual = (typeof OBJECT_VISUALS)[number];

const Objective = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    step: z.string().min(1),
    /** Pool steps: only for these activities of the step (the one the instance chose). Absent: every activity. */
    activities: z.array(z.string().min(1)).min(1).optional(),
    /** Which items of the step: the first, all after the first, or all. */
    items: z.enum(['first', 'rest', 'all']),
    at: z.enum(['destination', 'reference']),
    /** The word the job's line uses for the thing (checked against that line). */
    noun: z.string().min(2).max(30),
    /** The copy line (floor15.json lines) that names the thing. */
    copy: z.string().min(1),
    visual: z.enum(OBJECT_VISUALS),
    /** collect: one tap loads it into the lift (optional, never required). none: recognised on arrival. */
    interaction: z.enum(['collect', 'none']),
    /** Accessibility label for the object. */
    label: z.string().min(3).max(60),
    /** Accessibility action for a collectable object. */
    action: z.string().min(3).max(60).optional(),
    /** Lifty's world acknowledgement when the object is seen. */
    found: z.string().min(3).max(40),
    /** Lifty's line when the doors open at a wrong floor (destination objects). */
    absent: z.string().min(3).max(40).optional(),
  })
  .strict();

const ObjectivesSchema = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.literal('elevator-quest'),
    missionId: z.string(),
    objectives: z.array(Objective).min(1),
  })
  .strict();

export type ObjectiveEntry = z.infer<typeof Objective>;
export type ObjectiveCatalog = z.infer<typeof ObjectivesSchema>;

export interface ObjectiveIssue {
  code: string;
  path: string;
  message: string;
}

/** What the validator needs to know about the mission and its copy. */
export interface ObjectiveContext {
  missionId: string;
  /**
   * Mission steps: id, kind, and how many items an activity step has. `rides: false`: the job is
   * answered in the cargo bay, not by sending the lift anywhere, so it has no destination.
   * `activities`: every activity the step can present (a pool's members), each with its own `rides`.
   * `reading`: an authored reading activity (the reading generator's items): its note is the job, so
   * it has nothing to find and needs no object.
   */
  steps: { id: string; kind: string; items?: number; rides?: boolean; activities?: { id: string; rides: boolean; reading?: boolean }[] }[];
  /** The theme's copy lines (floor15.json `lines`). */
  lines: Record<string, string>;
}

/**
 * Checks: schema, unique ids, known steps and copy lines, the line really names the noun, a
 * destination job's line gives something to work out ({change}, {count} or {to}: never the floor
 * itself as the answer) and a reference object's line gives its floor
 * ({start}), destination objects say what is missing at a wrong floor, collectable objects have an
 * action label, and every item of every math job that sends the lift somewhere has a destination
 * object (reading jobs have none, and no object may name one).
 */
export function validateObjectives(raw: unknown, ctx: ObjectiveContext): { ok: boolean; issues: ObjectiveIssue[]; catalog: ObjectiveCatalog | null } {
  const parsed = ObjectivesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ code: `schema.${i.code}`, path: i.path.join('.'), message: i.message })), catalog: null };
  const catalog = parsed.data;
  const issues: ObjectiveIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ code, path, message });
  if (catalog.missionId !== ctx.missionId) err('ref.mission', 'missionId', `Objectives are for "${catalog.missionId}", not "${ctx.missionId}"`);
  const seen = new Set<string>();
  catalog.objectives.forEach((o, i) => {
    const at = `objectives.${i}`;
    if (seen.has(o.id)) err('dup.id', at, `Duplicate objective "${o.id}"`);
    seen.add(o.id);
    const step = ctx.steps.find((s) => s.id === o.step);
    if (!step) err('ref.step', at, `Unknown mission step "${o.step}"`);
    else if (step.kind === 'narrative') err('ref.step', at, `Step "${o.step}" has no job to place an object for`);
    else
      for (const a of o.activities ?? []) {
        const member = (step.activities ?? []).find((x) => x.id === a);
        if (!member) err('ref.activity', at, `"${a}" is not an activity of step "${o.step}"`);
        else if (member.reading) err('ref.activity', at, `"${a}" is a reading job: its note is the job, with no object to find`);
      }
    const line = ctx.lines[o.copy];
    if (!line) err('ref.copy', at, `Unknown copy line "${o.copy}"`);
    else {
      if (!line.toLowerCase().includes(o.noun.toLowerCase())) err('copy.noun', at, `Line "${o.copy}" does not name "${o.noun}"`);
      if (o.at === 'destination' && !DESTINATION_GIVENS.some((g) => line.includes(g))) err('copy.destination', at, `Line "${o.copy}" does not describe a destination to work out`);
      if (o.at === 'reference' && !line.includes('{start}')) err('copy.reference', at, `Line "${o.copy}" does not give the reference floor`);
    }
    if (o.at === 'destination' && !o.absent) err('missing.absent', at, 'A destination object needs words for its absence at a wrong floor');
    if (o.interaction === 'collect' && !o.action) err('missing.action', at, 'A collectable object needs an accessibility action label');
    if (o.interaction === 'collect' && o.at !== 'destination') err('ref.interaction', at, 'Only an object at the destination can be collected');
  });
  // Coverage: each item of each job (each activity a pool step can present) gets exactly one destination
  // object. A cargo job sends the lift nowhere and a reading job's note is the job: neither has one.
  for (const step of ctx.steps) {
    if (step.kind === 'narrative') continue;
    const members: { id: string | null; rides: boolean; reading?: boolean }[] = step.activities ?? [{ id: null, rides: step.rides !== false }];
    const count = step.kind === 'activity' ? (step.items ?? 1) : 1;
    for (const member of members) {
      if (!member.rides || member.reading) continue;
      const which = member.id ? `${step.id}" (${member.id})` : `${step.id}"`;
      for (let item = 0; item < count; item++) {
        const found = catalog.objectives.filter((o) => o.at === 'destination' && o.step === step.id && matchesItem(o, item) && matchesActivity(o, member.id));
        if (found.length === 0) err('missing.objective', `steps.${step.id}`, `Item ${item} of "${which} has nothing to find at its destination`);
        if (found.length > 1) err('dup.objective', `steps.${step.id}`, `Item ${item} of "${which} has ${found.length} destination objects`);
      }
    }
  }
  return { ok: issues.length === 0, issues, catalog };
}

/**
 * A destination job's line names how to work the floor out: a move, a stop count, the floor to
 * measure to, a pattern with a gap, a ten-floor jump and the ones after it, or which call in the order of travel.
 */
const DESTINATION_GIVENS = ['{change}', '{count}', '{to}', '{pattern}', '{ones}', '{jump}', '{rank}'];

const matchesItem = (o: Pick<ObjectiveEntry, 'items'>, item: number) => o.items === 'all' || (o.items === 'first' ? item === 0 : item > 0);
/** An object for named activities matches only those; an object without `activities` matches any (or an unnamed one). */
const matchesActivity = (o: Pick<ObjectiveEntry, 'activities'>, activityId: string | null | undefined) => !o.activities || (activityId != null && o.activities.includes(activityId));

export const OBJECTIVES: ObjectiveCatalog = ObjectivesSchema.parse(objectivesJson);

/**
 * The object placed at a job's destination or reference floor, if any. `activityId`: the activity the
 * step presents (a pool's choice); an object for named activities is placed only for those.
 */
export function objectiveFor(catalog: ObjectiveCatalog, stepId: string, itemIndex: number, at: ObjectiveEntry['at'], activityId?: string): ObjectiveEntry | null {
  return catalog.objectives.find((o) => o.step === stepId && o.at === at && matchesItem(o, itemIndex) && matchesActivity(o, activityId)) ?? null;
}
