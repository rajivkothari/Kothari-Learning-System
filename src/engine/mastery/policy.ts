// Mastery policy: every tunable number in the learning model. Values live in
// content/engine-config.json, never as literals in code. The shipped values are an
// INITIAL, UNVALIDATED starting point to be tuned after playtests. They are not
// derived from research and should not be described as scientifically validated.
import { z } from 'zod';

import { ASSISTANCE_LEVELS, AssistanceLevelSchema } from '../evidence/assistance';
import { MasteryLevelSchema } from '../skills/levels';

export const RETENTION_LEVELS = ['none', 'single', 'spaced', 'durable'] as const;
export const RetentionLevelSchema = z.enum(RETENTION_LEVELS);
export type RetentionLevel = (typeof RETENTION_LEVELS)[number];

const Unit = z.number().min(0).max(1);

const AssistanceCreditSchema = z
  .object(Object.fromEntries(ASSISTANCE_LEVELS.map((l) => [l, Unit])) as Record<(typeof ASSISTANCE_LEVELS)[number], typeof Unit>)
  .strict()
  .superRefine((credit, ctx) => {
    ASSISTANCE_LEVELS.forEach((level, i) => {
      const prev = ASSISTANCE_LEVELS[i - 1];
      if (prev && credit[level] > credit[prev]) {
        ctx.addIssue({ code: 'custom', path: [level], message: `More help cannot earn more credit: ${level} > ${prev}` });
      }
    });
    if (credit.demonstrated !== 0) {
      ctx.addIssue({ code: 'custom', path: ['demonstrated'], message: 'A demonstrated answer must earn 0 credit' });
    }
  });

export const MasteryPolicySchema = z
  .object({
    /** Stored with derived state so it is clear which rules produced it. */
    id: z.string().min(1),
    status: z.enum(['initial-unvalidated', 'tuned']),
    /** Independence credit per assistance level. Must be non-increasing; demonstrated = 0. */
    assistanceCredit: AssistanceCreditSchema,
    /** Accuracy and independence look at this many most recent scored attempts. */
    recentWindow: z.number().int().min(3),
    proficient: z
      .object({
        minSuccesses: z.number().int().min(1),
        minAccuracy: Unit,
        minIndependence: Unit,
        minVariants: z.number().int().min(1),
      })
      .strict(),
    mastered: z
      .object({
        minVariants: z.number().int().min(1),
        /** Capped by the number of representations the skill declares (minimum 1). */
        minRepresentations: z.number().int().min(1),
        minRetention: RetentionLevelSchema,
      })
      .strict(),
    /** Two successes count as separate retention evidence only this far apart. */
    retentionGapHours: z.number().positive(),
    /** Most help a success may include and still count for retention and review. */
    retentionMaxAssistance: AssistanceLevelSchema,
    /** Most help a success may include and still count as transfer evidence. */
    transferMaxAssistance: AssistanceLevelSchema,
    /** Distinct transfer contexts needed for transfer "demonstrated". */
    transferDemonstratedContexts: z.number().int().min(1),
    /** Review interval by review stage (0 = first review after mastery). Last value repeats. */
    reviewIntervalsDays: z.array(z.number().positive()).min(1),
    /** A skill unlocks when every prerequisite has reached this level at least once. */
    prerequisiteMinLevel: MasteryLevelSchema,
    /** A Stretch activity needs its skills at this level or above. */
    stretchMinLevel: MasteryLevelSchema,
  })
  .strict()
  .superRefine((p, ctx) => {
    p.reviewIntervalsDays.forEach((d, i) => {
      const prev = p.reviewIntervalsDays[i - 1];
      if (prev !== undefined && d < prev) {
        ctx.addIssue({ code: 'custom', path: ['reviewIntervalsDays', i], message: 'Review intervals must not shrink' });
      }
    });
    if (p.proficient.minIndependence > p.proficient.minAccuracy) {
      ctx.addIssue({
        code: 'custom',
        path: ['proficient', 'minIndependence'],
        message: 'Independence counts failures as 0 credit, so it can never exceed accuracy. This threshold would be unreachable.',
      });
    }
  });

export type MasteryPolicy = z.infer<typeof MasteryPolicySchema>;

export const ValidationBudgetSchema = z.object({ seedsPerActivity: z.number().int().positive() }).strict();
export type ValidationBudget = z.infer<typeof ValidationBudgetSchema>;
export const BUDGET_NAMES = ['dev', 'ci', 'release'] as const;
export type BudgetName = (typeof BUDGET_NAMES)[number];

export const EngineConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    masteryPolicy: MasteryPolicySchema,
    validationBudgets: z.object({ dev: ValidationBudgetSchema, ci: ValidationBudgetSchema, release: ValidationBudgetSchema }).strict(),
  })
  .strict();
export type EngineConfig = z.infer<typeof EngineConfigSchema>;

export function parseEngineConfig(raw: unknown): EngineConfig {
  return EngineConfigSchema.parse(raw);
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
