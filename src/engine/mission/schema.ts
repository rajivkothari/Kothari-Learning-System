// Mission definitions: ordered steps, theme-neutral. Deliberately small: a linear
// list of narrative, activity, and encounter steps. No branching yet: the first
// slice does not need it, and adding a graph later only touches this schema and
// the runtime's "next step" function.
import { z } from 'zod';

const Id = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, 'IDs are lowercase letters, digits, ".", "_" or "-"');

export const MissionStepSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('narrative'),
      id: Id,
      /** Semantic story beat key. The theme layer decides what it shows. */
      eventKey: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('activity'),
      id: Id,
      /** The step's activity. Give this or `activityIds`, never both. */
      activityId: z.string().min(1).optional(),
      /**
       * A pool: two or more activities, one of which this step presents in a mission instance. The
       * choice is deterministic from the instance's seed base, the mission key and the step id
       * (`poolChoice`), so a resumed or restarted instance gets the same activity, and different
       * instances see different members. The mission view names the chosen activity.
       */
      activityIds: z.array(z.string().min(1)).min(2, 'A pool needs at least two activities').optional(),
      /** Items to solve in this step. */
      items: z.number().int().min(1).max(10).default(1),
    })
    .strict()
    .refine((s) => (s.activityId === undefined) !== (s.activityIds === undefined), { message: 'An activity step names exactly one of activityId or activityIds', path: ['activityId'] })
    .refine((s) => s.activityIds === undefined || new Set(s.activityIds).size === s.activityIds.length, { message: 'A pool lists each activity once', path: ['activityIds'] }),
  z
    .object({
      kind: z.literal('encounter'),
      id: Id,
      encounterId: z.string().min(1),
    })
    .strict(),
]);
export type MissionStep = z.infer<typeof MissionStepSchema>;
export type ActivityStep = Extract<MissionStep, { kind: 'activity' }>;

export const MissionDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    /** Bump whenever steps or their order change. In-progress instances keep their version. */
    version: z.number().int().positive(),
    /** Developer label, not learner-facing copy. */
    title: z.string().min(1),
    steps: z.array(MissionStepSchema).min(1),
    /** Ceiling tier of the "mission completed" progression opportunity. */
    completionTier: z.enum(['low', 'normal', 'high']),
  })
  .strict()
  .superRefine((m, ctx) => {
    const ids = m.steps.map((s) => s.id);
    ids.forEach((id, i) => {
      if (ids.indexOf(id) !== i) ctx.addIssue({ code: 'custom', path: ['steps', i, 'id'], message: `Duplicate step id "${id}"` });
    });
    if (!m.steps.some((s) => s.kind !== 'narrative')) {
      ctx.addIssue({ code: 'custom', path: ['steps'], message: 'A mission needs at least one activity or encounter step' });
    }
  });
export type MissionDefinition = z.infer<typeof MissionDefinitionSchema>;

export const MissionPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    version: z.string().min(1),
    missions: z.array(MissionDefinitionSchema),
  })
  .strict();
export type MissionPack = z.infer<typeof MissionPackSchema>;

export function missionKey(id: string, version: number): string {
  return `${id}@${version}`;
}
