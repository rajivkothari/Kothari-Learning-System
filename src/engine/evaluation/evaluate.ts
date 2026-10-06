// Pure evaluation of one response against one generated item. No randomness, no
// clock. The misconception tag, if the chosen option carries one, is surfaced so
// feedback and scaffolding can respond to the specific error.
import type { GeneratedItem, Response } from '../content/item';

export type Evaluation =
  | { valid: true; correct: true; optionId: string }
  | { valid: true; correct: false; optionId: string; misconception?: string }
  | { valid: false; reason: 'unknownOption'; optionId: string };

export function evaluateResponse(item: GeneratedItem, response: Response): Evaluation {
  const option = item.response.options.find((o) => o.id === response.optionId);
  if (!option) return { valid: false, reason: 'unknownOption', optionId: response.optionId };
  if (option.correct) return { valid: true, correct: true, optionId: option.id };
  return option.misconception
    ? { valid: true, correct: false, optionId: option.id, misconception: option.misconception }
    : { valid: true, correct: false, optionId: option.id };
}
