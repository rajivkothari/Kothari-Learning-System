// Replay / novelty classification. Driven by explicit evidence (item signature,
// declared transfer context, mastery peak, review schedule), never by comparing
// text and never by inference.
import type { Transfer } from '../evidence/attempt';
import type { MasteryPolicy } from '../mastery/policy';
import { isReviewDue } from '../review/review';
import type { MasteryLevel } from '../skills/levels';
import type { SkillId } from '../skills/skill';
import type { LearnerState } from './types';

export const EXPOSURE_CLASSES = [
  'exactReplay', // the same item, already solved
  'easyVariation', // new item, skill already mastered, no review due
  'dueSpacedReview', // new item, mastered skill whose review is due
  'developing', // ordinary learning on a skill not yet mastered
  'novelApplication', // first success not yet seen in this transfer context
  'higherOrderApplication', // as above, in a multi-step / combined-skill context
] as const;
export type ExposureClass = (typeof EXPOSURE_CLASSES)[number];

/** Ordering used to summarize a multi-item completion: the most novel item wins. */
export function exposureRank(c: ExposureClass): number {
  return EXPOSURE_CLASSES.indexOf(c);
}

export interface ExposureCandidate {
  itemSignature: string;
  skillIds: readonly SkillId[];
  transfer: Transfer;
}

export interface ExposureView {
  solved(skill: SkillId, signature: string): boolean;
  succeededTransferContext(skill: SkillId, contextKey: string): boolean;
  peak(skill: SkillId): MasteryLevel;
  reviewDue(skill: SkillId, at: number): boolean;
}

export interface ExposureResult {
  exposure: ExposureClass;
  reason: string;
}

export function classifyWithView(view: ExposureView, c: ExposureCandidate, at: number): ExposureResult {
  if (c.skillIds.every((s) => view.solved(s, c.itemSignature))) {
    return { exposure: 'exactReplay', reason: 'This exact item was already solved for every skill it exercises.' };
  }
  if (c.transfer.kind !== 'none') {
    const key = c.transfer.contextKey;
    if (c.skillIds.some((s) => !view.succeededTransferContext(s, key))) {
      return c.transfer.kind === 'higherOrder'
        ? { exposure: 'higherOrderApplication', reason: `First success not yet recorded in higher-order context "${key}".` }
        : { exposure: 'novelApplication', reason: `First success not yet recorded in transfer context "${key}".` };
    }
  }
  if (c.skillIds.every((s) => view.peak(s) === 'mastered')) {
    return c.skillIds.some((s) => view.reviewDue(s, at))
      ? { exposure: 'dueSpacedReview', reason: 'Mastered skill whose spaced review is due.' }
      : { exposure: 'easyVariation', reason: 'New variant of mastered material; no review is due yet.' };
  }
  return { exposure: 'developing', reason: 'Skill is still being learned.' };
}

/** Classify a prospective or recorded item against a derived learner state. */
export function classifyExposure(state: LearnerState, policy: MasteryPolicy, c: ExposureCandidate, at: number): ExposureResult {
  const view: ExposureView = {
    solved: (s, sig) => state.skills[s]?.solvedSignatures.includes(sig) ?? false,
    succeededTransferContext: (s, key) => state.skills[s]?.dimensions.transfer.contexts.includes(key) ?? false,
    peak: (s) => state.skills[s]?.peakLevel ?? 'locked',
    reviewDue: (s, t) => {
      const review = state.skills[s]?.review;
      return review ? isReviewDue(review, policy, t) : false;
    },
  };
  return classifyWithView(view, c, at);
}
