// ATTEMPT EVIDENCE: durable, immutable facts about one item interaction.
// Records what happened, never derived judgments (level, novelty class, value).
// Those are recomputed from evidence under the current policy, so thresholds can
// change later without rewriting history.
import { z } from 'zod';

import { SkillIdSchema } from '../skills/skill';
import { AssistanceLevelSchema, assistanceRank } from './assistance';

export const ChallengeSchema = z.enum(['practice', 'stretch', 'masteryEncounter']);
export type Challenge = z.infer<typeof ChallengeSchema>;

/**
 * Transfer context declared by content. "novel" = the skill applied, uncued, in a
 * context it was not taught in. "higherOrder" = combined with other skills in
 * multi-step reasoning. contextKey names the context so repeats are recognizable.
 */
export const TransferSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('novel'), contextKey: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('higherOrder'), contextKey: z.string().min(1) }).strict(),
]);
export type Transfer = z.infer<typeof TransferSchema>;

export const OutcomeSchema = z.enum(['correct', 'incorrect', 'abandoned']);
export type Outcome = z.infer<typeof OutcomeSchema>;

const EpochMs = z.number().int().nonnegative();

export const AttemptEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    learnerId: z.string().min(1),
    sessionId: z.string().min(1).optional(),
    activityId: z.string().min(1),
    /** One play-through of an activity or encounter. Groups attempts into a completion. */
    activityInstanceId: z.string().min(1),
    encounterId: z.string().min(1).optional(),
    /** Semantic identity of the generated item (see generation/generate.ts). */
    itemSignature: z.string().min(1),
    templateId: z.string().min(1).optional(),
    templateVersion: z.number().int().positive().optional(),
    seed: z.string().optional(),
    skillIds: z.array(SkillIdSchema).min(1),
    challenge: ChallengeSchema,
    /** True when the instruction named the operation or strategy. */
    cued: z.boolean(),
    representation: z.string().min(1),
    transfer: TransferSchema,
    outcome: OutcomeSchema,
    /** Most help received on this item. */
    assistance: AssistanceLevelSchema,
    /** Wrong answers before the final outcome. */
    wrongTries: z.number().int().nonnegative(),
    /** Misconception tags revealed by wrong answers, in order. */
    misconceptions: z.array(z.string().min(1)).default([]),
    /** Caller-supplied time. The engine never reads a clock. */
    occurredAt: EpochMs,
    durationMs: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.wrongTries > 0 && a.outcome === 'correct' && assistanceRank(a.assistance) < assistanceRank('retry')) {
      ctx.addIssue({
        code: 'custom',
        path: ['assistance'],
        message: 'A correct answer after wrong tries cannot be recorded as "independent". Use at least "retry".',
      });
    }
    if (a.misconceptions.length > a.wrongTries + (a.outcome === 'incorrect' ? 1 : 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['misconceptions'],
        message: 'More misconception tags than wrong answers',
      });
    }
  });

export type AttemptEvidence = z.infer<typeof AttemptEvidenceSchema>;

/** Deterministic order for replay: time, then id. */
export function compareAttempts(a: AttemptEvidence, b: AttemptEvidence): number {
  return a.occurredAt - b.occurredAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
