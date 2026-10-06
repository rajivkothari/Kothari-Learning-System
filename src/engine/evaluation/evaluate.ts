// Pure evaluation of one response against one generated item. No randomness, no
// clock. The misconception tag, if the response matches one, is surfaced so feedback
// and scaffolding can respond to the specific error.
import type { AnswerValue, GeneratedItem, Response } from '../content/item';

export type Evaluation =
  | { valid: true; correct: true; optionId: string | null; value: AnswerValue }
  | { valid: true; correct: false; optionId: string | null; value: AnswerValue; misconception?: string }
  | { valid: false; reason: 'unknownOption' };

export function evaluateResponse(item: GeneratedItem, response: Response): Evaluation {
  if (response.mode === 'choice') {
    const option = item.response.options.find((o) => o.id === response.optionId);
    if (!option) return { valid: false, reason: 'unknownOption' };
    if (option.correct) return { valid: true, correct: true, optionId: option.id, value: option.value };
    return option.misconception
      ? { valid: true, correct: false, optionId: option.id, value: option.value, misconception: option.misconception }
      : { valid: true, correct: false, optionId: option.id, value: option.value };
  }
  // Free value: compare with the answer, then look for a diagnosable wrong value.
  const correct = item.response.options.find((o) => o.correct);
  const same = (v: AnswerValue) => String(v) === String(response.value);
  const option = item.response.options.find((o) => same(o.value));
  if (correct && same(correct.value)) return { valid: true, correct: true, optionId: correct.id, value: response.value };
  const tag = item.diagnostics.find((d) => same(d.value))?.misconception ?? option?.misconception;
  return tag
    ? { valid: true, correct: false, optionId: option?.id ?? null, value: response.value, misconception: tag }
    : { valid: true, correct: false, optionId: option?.id ?? null, value: response.value };
}
