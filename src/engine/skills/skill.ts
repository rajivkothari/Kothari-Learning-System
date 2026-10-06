import { z } from 'zod';

/** Dotted, lowercase, stable. Never reused once shipped: "math.add.within20". */
export const SkillIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(\.[a-z0-9][a-zA-Z0-9]*)+$/, 'Skill IDs are dotted lowercase segments, e.g. "math.add.within20"');
export type SkillId = z.infer<typeof SkillIdSchema>;

export const DomainSchema = z.enum(['math', 'literacy', 'science', 'logic']);
export type Domain = z.infer<typeof DomainSchema>;

/** Grade is metadata only. -1 = Pre-K, 0 = Kindergarten, 1-8 = grades. */
const GradeSchema = z.number().int().min(-1).max(12);

export const SkillDefinitionSchema = z
  .object({
    id: SkillIdSchema,
    domain: DomainSchema,
    strand: z.string().min(1),
    /** Developer- and parent-facing label. Never shown as a grade to the learner. */
    label: z.string().min(1),
    gradeBand: z.tuple([GradeSchema, GradeSchema]).optional(),
    prerequisites: z.array(SkillIdSchema).default([]),
    /** Representations a learner can meet this skill in. Mastery asks for variety across them. */
    representations: z.array(z.string().min(1)).default([]),
    tags: z.array(z.string().min(1)).default([]),
  })
  .strict()
  .refine((s) => !s.gradeBand || s.gradeBand[0] <= s.gradeBand[1], {
    message: 'gradeBand must be [low, high] with low <= high',
    path: ['gradeBand'],
  });

export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;
