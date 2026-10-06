// Spaced review: a deliberately small model, not a memory-science claim.
// Once a skill first reaches Mastered, a review is due when no qualifying success
// has happened for the current stage's interval. A qualifying success while due
// passes the review and advances the stage (longer interval next time).
//
// The schedule depends only on qualifying successes. Failures do not move it, so
// deliberately failing can never make reviews come around more often. A failed due
// review instead marks the skill as needing reconsolidation, which lowers its
// current level until a later, time-separated success.
import { DAY_MS, type MasteryPolicy } from '../mastery/policy';

export interface ReviewState {
  /** When the skill first reached Mastered. null until then. */
  masteredAt: number | null;
  /** Reviews passed so far. Never decreases. */
  stage: number;
  /** Last qualifying demonstration that counted for the schedule (mastery or a passed review). */
  lastDemonstratedAt: number | null;
  needsReconsolidation: boolean;
  reconsolidationSince: number | null;
}

export const INITIAL_REVIEW: ReviewState = {
  masteredAt: null,
  stage: 0,
  lastDemonstratedAt: null,
  needsReconsolidation: false,
  reconsolidationSince: null,
};

export function reviewIntervalMs(policy: MasteryPolicy, stage: number): number {
  const days = policy.reviewIntervalsDays;
  return (days[Math.min(stage, days.length - 1)] ?? days[days.length - 1] ?? 1) * DAY_MS;
}

export function nextReviewAt(review: ReviewState, policy: MasteryPolicy): number | null {
  if (review.masteredAt === null || review.lastDemonstratedAt === null) return null;
  return review.lastDemonstratedAt + reviewIntervalMs(policy, review.stage);
}

/** True when a review is due at time `at`. Never true before first mastery. */
export function isReviewDue(review: ReviewState, policy: MasteryPolicy, at: number): boolean {
  const due = nextReviewAt(review, policy);
  return due !== null && at >= due;
}
