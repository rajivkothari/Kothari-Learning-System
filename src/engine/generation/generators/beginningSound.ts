// "Which letter makes the first sound in <word>?" Literacy example proving the
// engine is not math-specific. Words come only from the content's word list.
import { z } from 'zod';

import { ContentGenerationError, defineGenerator, type Distractor } from '../generator';

const Letter = z.string().regex(/^[a-z]$/, 'single lowercase letter');

const ParamsSchema = z
  .object({
    words: z
      .array(z.object({ word: z.string().regex(/^[a-z]{2,8}$/), onset: Letter }).strict())
      .min(1)
      .refine((ws) => ws.every((w) => w.word.startsWith(w.onset)), 'each word must start with its onset letter'),
    letterPool: z.array(Letter).min(3),
    optionCount: z.number().int().min(2).max(6),
  })
  .strict();
type Params = z.infer<typeof ParamsSchema>;

export const MISCONCEPTIONS = {
  choseFinalSound: 'literacy.choseFinalSound',
  mirroredLetter: 'literacy.mirroredLetter',
} as const;

const MIRRORS: Record<string, string> = { b: 'd', d: 'b', p: 'q', q: 'p' };

export const beginningSound = defineGenerator<Params>({
  id: 'literacy.beginningSound',
  version: 1,
  concept: 'beginningSoundOfWord',
  misconceptions: Object.values(MISCONCEPTIONS),
  paramsSchema: ParamsSchema,
  optionCount: (p) => p.optionCount,

  generate(p, rng) {
    const { word, onset } = rng.pick(p.words);
    const final = word[word.length - 1] ?? '';
    const candidates: Distractor[] = [];
    if (final && final !== onset) candidates.push({ value: final, misconception: MISCONCEPTIONS.choseFinalSound });
    const mirror = MIRRORS[onset];
    if (mirror) candidates.push({ value: mirror, misconception: MISCONCEPTIONS.mirroredLetter });
    for (const letter of rng.shuffle(p.letterPool)) candidates.push({ value: letter });
    return { prompt: { word }, correct: onset, distractors: candidates };
  },

  solve(prompt) {
    const { word } = prompt;
    if (typeof word !== 'string' || word.length === 0) throw new ContentGenerationError('beginningSound: bad prompt');
    return word[0] as string;
  },

  countVariants: (p) => new Set(p.words.map((w) => w.word)).size,
});
