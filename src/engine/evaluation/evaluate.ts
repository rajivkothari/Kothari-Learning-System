// Pure evaluation of one response against one generated item. No randomness, no
// clock. The misconception tag, if the response matches one, is surfaced so feedback
// and scaffolding can respond to the specific error.
import type { AnswerValue, GeneratedItem, Response } from '../content/item';
import type { AnswerSpec } from '../content/pack';

export type Evaluation =
  | { valid: true; correct: true; optionId: string | null; value: AnswerValue }
  | { valid: true; correct: false; optionId: string | null; value: AnswerValue; misconception?: string }
  | { valid: false; reason: 'unknownOption' };

/**
 * A text answer as it is compared (M9): lower case, letters only. "Cab", " cab " and "c-a-b" are the
 * same answer; a digit, a space or a mark is never part of a word. Plain a to z only: the content
 * is English words, and the validator refuses an answer with any other letter.
 */
export function normalizeTextAnswer(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * `answer` is the activity's answer spec. Only a "text" spec changes anything: then a value is compared
 * (with the answer and with every tagged wrong value) after normalizeTextAnswer, and the evaluation
 * carries the normalized text.
 */
export function evaluateResponse(item: GeneratedItem, response: Response, answer?: AnswerSpec): Evaluation {
  if (response.mode === 'choice') {
    const option = item.response.options.find((o) => o.id === response.optionId);
    if (!option) return { valid: false, reason: 'unknownOption' };
    if (option.correct) return { valid: true, correct: true, optionId: option.id, value: option.value };
    return option.misconception
      ? { valid: true, correct: false, optionId: option.id, value: option.value, misconception: option.misconception }
      : { valid: true, correct: false, optionId: option.id, value: option.value };
  }
  // Free value: compare with the answer, then look for a diagnosable wrong value.
  const text = answer?.mode === 'text';
  const norm = (v: AnswerValue) => (text ? normalizeTextAnswer(String(v)) : String(v));
  const given = norm(response.value);
  const value: AnswerValue = text ? given : response.value;
  const correct = item.response.options.find((o) => o.correct);
  const same = (v: AnswerValue) => norm(v) === given;
  const option = item.response.options.find((o) => same(o.value));
  if (correct && same(correct.value)) return { valid: true, correct: true, optionId: correct.id, value };
  const tag = item.diagnostics.find((d) => same(d.value))?.misconception ?? option?.misconception;
  return tag
    ? { valid: true, correct: false, optionId: option?.id ?? null, value, misconception: tag }
    : { valid: true, correct: false, optionId: option?.id ?? null, value };
}
