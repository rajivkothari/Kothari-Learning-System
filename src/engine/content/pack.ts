// Content schemas: the minimum needed for M2. Every top-level record carries a
// schemaVersion so loaders can migrate or reject old content explicitly.
import { z } from 'zod';

import { AssistanceLevelSchema, assistanceRank } from '../evidence/assistance';
import { ChallengeSchema, TransferSchema } from '../evidence/attempt';
import { MasteryLevelSchema } from '../skills/levels';
import { DomainSchema, SkillDefinitionSchema, SkillIdSchema } from '../skills/skill';

const Id = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, 'IDs are lowercase letters, digits, ".", "_" or "-"');

export const MisconceptionSchema = z
  .object({
    id: z.string().min(1),
    domain: DomainSchema,
    /** Parent/developer-facing explanation. */
    description: z.string().min(1),
  })
  .strict();
export type Misconception = z.infer<typeof MisconceptionSchema>;

/**
 * SCAFFOLDING POLICY: which help an activity offers, in what order, and when.
 * Each step declares the assistance level it represents, so whatever the sequence,
 * the evidence recorded uses the shared assistance scale.
 */
export const ScaffoldStepSchema = z
  .object({
    id: z.string().min(1),
    /** Presentation-neutral kind, e.g. "highlightGiven", "numberLine", "replayWord". */
    kind: z.string().min(1),
    assistance: AssistanceLevelSchema,
    /** "onRequest": learner asks. "afterWrongTries": offered after N wrong answers. */
    offer: z.enum(['onRequest', 'afterWrongTries']),
    afterWrongTries: z.number().int().positive().optional(),
  })
  .strict()
  .refine((s) => s.assistance !== 'independent' && s.assistance !== 'retry', {
    message: '"independent" and "retry" describe the learner, not help an activity can offer',
    path: ['assistance'],
  })
  .refine((s) => (s.offer === 'afterWrongTries') === (s.afterWrongTries !== undefined), {
    message: 'afterWrongTries is required exactly when offer is "afterWrongTries"',
    path: ['afterWrongTries'],
  });

export const ScaffoldingPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    description: z.string().min(1),
    steps: z.array(ScaffoldStepSchema),
    allowLeaveAndReturn: z.boolean(),
    /** Present a fresh variant after this many wrong tries instead of looping the same item. */
    regenerateAfterWrongTries: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    p.steps.forEach((step, i) => {
      const prev = p.steps[i - 1];
      if (prev && assistanceRank(step.assistance) < assistanceRank(prev.assistance)) {
        ctx.addIssue({
          code: 'custom',
          path: ['steps', i, 'assistance'],
          message: `Help must not decrease: step "${step.id}" (${step.assistance}) follows "${prev.id}" (${prev.assistance})`,
        });
      }
    });
  });
export type ScaffoldingPolicy = z.infer<typeof ScaffoldingPolicySchema>;

/**
 * How the learner answers. "choice": pick one of the generated options. "value": produce any
 * integer in [min, max] (for example, any position on a bounded line). A value answer is
 * harder than a choice among a few options, so it is a content decision, not a theme one.
 */
export const AnswerSpecSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('choice') }).strict(),
  z
    .object({ mode: z.literal('value'), min: z.number().int(), max: z.number().int() })
    .strict()
    .refine((a) => a.min <= a.max, { message: 'answer.min must be <= answer.max', path: ['max'] }),
]);
export type AnswerSpec = z.infer<typeof AnswerSpecSchema>;

const SeedOverrides = z
  .object({ dev: z.number().int().positive(), ci: z.number().int().positive(), release: z.number().int().positive() })
  .partial()
  .strict();

export const ActivitySchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    /** Developer label, not learner-facing copy. */
    title: z.string().min(1),
    generator: z.object({ id: z.string().min(1), version: z.number().int().positive() }).strict(),
    params: z.record(z.string(), z.unknown()),
    skills: z.array(SkillIdSchema).min(1),
    challenge: ChallengeSchema,
    cued: z.boolean(),
    representation: z.string().min(1),
    transfer: TransferSchema,
    scaffoldingPolicy: z.string().min(1),
    answer: AnswerSpecSchema.default({ mode: 'choice' }),
    validation: z.object({ seeds: SeedOverrides.optional() }).strict().optional(),
  })
  .strict()
  .refine((a) => a.cued === false || a.transfer.kind === 'none', {
    message: 'A cued activity (operation named) cannot claim transfer evidence',
    path: ['transfer'],
  });
export type Activity = z.infer<typeof ActivitySchema>;

/** Contract for a multi-stage Mastery Encounter. Stages are activities. */
export const MasteryEncounterSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    title: z.string().min(1),
    stages: z.array(z.string().min(1)).min(2),
    requires: z.array(z.object({ skill: SkillIdSchema, minLevel: MasteryLevelSchema }).strict()).min(1),
    transfer: z.object({ kind: z.literal('higherOrder'), contextKey: z.string().min(1) }).strict(),
    scaffoldingPolicy: z.string().min(1),
  })
  .strict();
export type MasteryEncounter = z.infer<typeof MasteryEncounterSchema>;

export const ContentPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    version: z.string().min(1),
    skills: z.array(SkillDefinitionSchema),
    misconceptions: z.array(MisconceptionSchema),
    scaffoldingPolicies: z.array(ScaffoldingPolicySchema),
    activities: z.array(ActivitySchema),
    encounters: z.array(MasteryEncounterSchema).default([]),
  })
  .strict();
export type ContentPack = z.infer<typeof ContentPackSchema>;
