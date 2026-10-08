// Authored items: each item is written by a person (a short text and what to do about it), not
// computed. The generator only picks one of the items the content lists. The words themselves live
// with the theme, keyed by item id; the engine sees only ids and values.
//
// The prompt is { item, answer }. The authored answer is part of what an authored item means, the
// same way a computed item's givens fix its answer, so:
// - solve(prompt) can return it (the contract's solver sees only the prompt). For authored content
//   the solver checks that the item was assembled from the authored answer; whether that answer is
//   right is checked by the content's own validation and an adult review, not by computing.
// - the signature changes when an item's answer changes, so a saved item whose answer was edited
//   is detected as changed content instead of silently keeping its old evidence.
// A presentation layer must not show `answer`: it learns correctness from the response result, as
// for every other item.
import { z } from 'zod';

import { ContentGenerationError, defineGenerator } from '../generator';

const ItemId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'item ids are lowercase letters, digits and "-"');
/** An answer value: a whole number, or a lowercase id the presentation layer names. */
const Value = z.union([z.number().int(), z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'string values are lowercase ids')]);

export const MISCONCEPTIONS = {
  ignoredNegation: 'reading.ignoredNegation',
  choseFirstNamed: 'reading.choseFirstNamed',
  choseLastNamed: 'reading.choseLastNamed',
  wrongDirection: 'reading.wrongDirection',
  wentToOtherPlace: 'reading.wentToOtherPlace',
  usedNumberAsAnswer: 'reading.usedNumberAsAnswer',
  followedWordOrder: 'reading.followedWordOrder',
  mixedUpSides: 'reading.mixedUpSides',
  otherWordMeaning: 'reading.otherWordMeaning',
  swappedCauseAndEffect: 'reading.swappedCauseAndEffect',
  matchedWordsOnly: 'reading.matchedWordsOnly',
} as const;

const TAGS = Object.values(MISCONCEPTIONS) as [string, ...string[]];

const ItemSchema = z
  .object({
    id: ItemId,
    correct: Value,
    /** Wrong values in priority order, each with the one likely cause when there is one. */
    distractors: z
      .array(z.object({ value: Value, misconception: z.enum(TAGS).optional() }).strict())
      .min(1)
      .max(5),
  })
  .strict()
  .superRefine((item, ctx) => {
    const kind = typeof item.correct;
    item.distractors.forEach((d, i) => {
      if (typeof d.value !== kind) ctx.addIssue({ code: 'custom', path: ['distractors', i, 'value'], message: `every value of an item has the type of its answer (${kind})` });
    });
    const values = item.distractors.map((d) => String(d.value));
    values.forEach((v, i) => {
      if (v === String(item.correct)) ctx.addIssue({ code: 'custom', path: ['distractors', i, 'value'], message: 'the answer cannot also be a distractor' });
      if (values.indexOf(v) !== i) ctx.addIssue({ code: 'custom', path: ['distractors', i, 'value'], message: 'distractor values must be unique' });
    });
  });

const ParamsSchema = z
  .object({
    /** At least two, so a fresh item can replace one that was missed. */
    items: z.array(ItemSchema).min(2),
  })
  .strict()
  .superRefine((p, ctx) => {
    const ids = p.items.map((i) => i.id);
    ids.forEach((id, i) => {
      if (ids.indexOf(id) !== i) ctx.addIssue({ code: 'custom', path: ['items', i, 'id'], message: `duplicate item id "${id}"` });
    });
  });
type Params = z.infer<typeof ParamsSchema>;

export const authoredItem = defineGenerator<Params>({
  id: 'literacy.authoredItem',
  version: 1,
  concept: 'authoredItem',
  misconceptions: TAGS,
  paramsSchema: ParamsSchema,
  /** Every distractor of the item is listed: an item with fewer distractors shows fewer options. */
  optionCount: (p) => 1 + Math.max(...p.items.map((i) => i.distractors.length)),

  generate(p, rng) {
    const item = rng.pick(p.items);
    return {
      prompt: { item: item.id, answer: item.correct },
      correct: item.correct,
      distractors: item.distractors.map((d) => (d.misconception ? { value: d.value, misconception: d.misconception } : { value: d.value })),
    };
  },

  solve(prompt) {
    const { item, answer } = prompt;
    if (typeof item !== 'string' || item.length === 0) throw new ContentGenerationError('authoredItem: prompt has no item id');
    if (typeof answer === 'number' || (typeof answer === 'string' && answer.length > 0)) return answer;
    throw new ContentGenerationError(`authoredItem: item "${item}" has no authored answer`);
  },

  countVariants: (p) => p.items.length,
});
