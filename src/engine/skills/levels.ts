// Mastery levels, in order. "Applied" is not a level: transfer is an evidence
// dimension reported alongside the level (see docs/LEARNING_MODEL.md section 2).
import { z } from 'zod';

export const MASTERY_LEVELS = ['locked', 'introduced', 'practicing', 'proficient', 'mastered'] as const;
export const MasteryLevelSchema = z.enum(MASTERY_LEVELS);
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

export function levelRank(level: MasteryLevel): number {
  return MASTERY_LEVELS.indexOf(level);
}

export function isAtLeast(level: MasteryLevel, minimum: MasteryLevel): boolean {
  return levelRank(level) >= levelRank(minimum);
}

export function maxLevel(a: MasteryLevel, b: MasteryLevel): MasteryLevel {
  return levelRank(a) >= levelRank(b) ? a : b;
}
