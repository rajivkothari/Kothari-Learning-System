// ASSISTANCE EVIDENCE: what help the learner actually received. The same scale is
// recorded for every activity type. Which help an activity offers, and in what
// order, is a separate concern (scaffolding/scaffolding.ts).
import { z } from 'zod';

/** Ordered from least to most help. */
export const ASSISTANCE_LEVELS = [
  'independent', // first try, no help
  'retry', // succeeded after an error, no added help
  'clue', // small nudge: highlight, reminder of information already present
  'verbalHint', // text or narrated hint
  'visualSupport', // alternate representation: diagram, number line, letter guide
  'guided', // stepwise walk-through, learner still acts
  'demonstrated', // answer shown
] as const;

export const AssistanceLevelSchema = z.enum(ASSISTANCE_LEVELS);
export type AssistanceLevel = (typeof ASSISTANCE_LEVELS)[number];

export function assistanceRank(level: AssistanceLevel): number {
  return ASSISTANCE_LEVELS.indexOf(level);
}

export function isAtMost(level: AssistanceLevel, limit: AssistanceLevel): boolean {
  return assistanceRank(level) <= assistanceRank(limit);
}

export function maxAssistance(a: AssistanceLevel, b: AssistanceLevel): AssistanceLevel {
  return assistanceRank(a) >= assistanceRank(b) ? a : b;
}

/**
 * The assistance level to record for one item: the most help received, and at
 * least "retry" if the learner answered wrong before succeeding.
 */
export function recordedAssistance(input: { wrongTries: number; helpReceived: readonly AssistanceLevel[] }): AssistanceLevel {
  let level: AssistanceLevel = input.wrongTries > 0 ? 'retry' : 'independent';
  for (const help of input.helpReceived) level = maxAssistance(level, help);
  return level;
}
