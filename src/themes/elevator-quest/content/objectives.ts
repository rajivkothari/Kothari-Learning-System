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
import { z } from 'zod';

import objectivesJson from '../../../../content/themes/elevator-quest/objectives.json';

export const OBJECT_VISUALS = ['repairKit', 'toolbox', 'spareParts', 'crew', 'beacon', 'loadingDock'] as const;
export type ObjectVisual = (typeof OBJECT_VISUALS)[number];

const Objective = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    step: z.string().min(1),
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
  /** Mission steps: id, kind, and how many items an activity step has. */
  steps: { id: string; kind: string; items?: number }[];
  /** The theme's copy lines (floor15.json `lines`). */
  lines: Record<string, string>;
}

/**
 * Checks: schema, unique ids, known steps and copy lines, the line really names the noun, a
 * destination job's line is relative (it has {change}) and a reference object's line gives its floor
 * ({start}), destination objects say what is missing at a wrong floor, collectable objects have an
 * action label, and every item of every job that sends the lift somewhere has a destination object.
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
    const line = ctx.lines[o.copy];
    if (!line) err('ref.copy', at, `Unknown copy line "${o.copy}"`);
    else {
      if (!line.toLowerCase().includes(o.noun.toLowerCase())) err('copy.noun', at, `Line "${o.copy}" does not name "${o.noun}"`);
      if (o.at === 'destination' && !line.includes('{change}')) err('copy.destination', at, `Line "${o.copy}" does not describe a destination to work out`);
      if (o.at === 'reference' && !line.includes('{start}')) err('copy.reference', at, `Line "${o.copy}" does not give the reference floor`);
    }
    if (o.at === 'destination' && !o.absent) err('missing.absent', at, 'A destination object needs words for its absence at a wrong floor');
    if (o.interaction === 'collect' && !o.action) err('missing.action', at, 'A collectable object needs an accessibility action label');
    if (o.interaction === 'collect' && o.at !== 'destination') err('ref.interaction', at, 'Only an object at the destination can be collected');
  });
  // Coverage: each item of each job gets exactly one destination object.
  for (const step of ctx.steps) {
    if (step.kind === 'narrative') continue;
    const count = step.kind === 'activity' ? (step.items ?? 1) : 1;
    for (let item = 0; item < count; item++) {
      const found = catalog.objectives.filter((o) => o.at === 'destination' && o.step === step.id && matchesItem(o, item));
      if (found.length === 0) err('missing.objective', `steps.${step.id}`, `Item ${item} of "${step.id}" has nothing to find at its destination`);
      if (found.length > 1) err('dup.objective', `steps.${step.id}`, `Item ${item} of "${step.id}" has ${found.length} destination objects`);
    }
  }
  return { ok: issues.length === 0, issues, catalog };
}

const matchesItem = (o: Pick<ObjectiveEntry, 'items'>, item: number) => o.items === 'all' || (o.items === 'first' ? item === 0 : item > 0);

export const OBJECTIVES: ObjectiveCatalog = ObjectivesSchema.parse(objectivesJson);

/** The object placed at a job's destination or reference floor, if any. */
export function objectiveFor(catalog: ObjectiveCatalog, stepId: string, itemIndex: number, at: ObjectiveEntry['at']): ObjectiveEntry | null {
  return catalog.objectives.find((o) => o.step === stepId && o.at === at && matchesItem(o, itemIndex)) ?? null;
}
