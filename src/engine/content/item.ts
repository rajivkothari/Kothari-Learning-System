// A generated item is theme-neutral educational semantics. A theme layer turns
// { concept: "positionAfterMove", prompt: { start: 8, change: 7, direction: "up" } }
// into whatever fiction it likes. The engine knows no theme, setting, or learner name.
import { z } from 'zod';

export const AnswerValueSchema = z.union([z.number(), z.string().min(1)]);
export type AnswerValue = z.infer<typeof AnswerValueSchema>;

export const PromptSchema = z.record(z.string(), z.union([z.number(), z.string(), z.boolean()]));
export type Prompt = z.infer<typeof PromptSchema>;

export const ResponseOptionSchema = z
  .object({
    id: z.string().min(1),
    value: AnswerValueSchema,
    correct: z.boolean(),
    /** Likely misconception if chosen. Optional: not every wrong answer is diagnosable. */
    misconception: z.string().min(1).optional(),
  })
  .strict();
export type ResponseOption = z.infer<typeof ResponseOptionSchema>;

export const GeneratedItemSchema = z
  .object({
    schemaVersion: z.literal(1),
    templateId: z.string().min(1),
    templateVersion: z.number().int().positive(),
    seed: z.string(),
    /** Hash of template id, version, concept, and prompt. Excludes option order and seed. */
    signature: z.string().min(1),
    concept: z.string().min(1),
    prompt: PromptSchema,
    response: z
      .object({
        mode: z.literal('choice'),
        options: z.array(ResponseOptionSchema).min(2),
      })
      .strict(),
    correctOptionId: z.string().min(1),
    /**
     * Every tagged wrong value the generator proposed, including ones that did not fit in
     * the option list. Lets a free-value answer (any position on a line, any count) still
     * surface its misconception. Not part of the signature.
     */
    diagnostics: z.array(z.object({ value: AnswerValueSchema, misconception: z.string().min(1) }).strict()).default([]),
  })
  .strict();
export type GeneratedItem = z.infer<typeof GeneratedItemSchema>;

/** A learner response: pick a listed option, or produce a value from the activity's answer domain. */
export const ResponseSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('choice'), optionId: z.string().min(1) }).strict(),
  z.object({ mode: z.literal('value'), value: AnswerValueSchema }).strict(),
]);
export type Response = z.infer<typeof ResponseSchema>;
