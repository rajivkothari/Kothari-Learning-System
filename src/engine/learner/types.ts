// Derived learner state. Everything here is recomputable from attempt evidence
// under a given policy. Nothing here is stored as the source of truth.
import type { RetentionLevel } from '../mastery/policy';
import type { ReviewState } from '../review/review';
import type { MasteryLevel } from '../skills/levels';
import type { SkillId } from '../skills/skill';

export type TransferLevel = 'none' | 'emerging' | 'demonstrated';

export interface SkillDimensions {
  /** Recent scored attempts: successes / scored. Exact repeats of solved items are not scored. */
  accuracy: { successes: number; scored: number; rate: number };
  /** Mean independence credit per recent scored attempt (failures count 0). */
  independence: { rate: number };
  variety: { variants: number; representations: readonly string[] };
  /** Time-separated qualifying successes. */
  retention: { level: RetentionLevel; separatedSuccesses: number };
  /** Uncued use in declared transfer contexts. Independent of level: can appear before mastery. */
  transfer: { level: TransferLevel; contexts: readonly string[] };
}

export interface SkillState {
  skillId: SkillId;
  /** Current level. Can drop (recent failures, failed review). */
  level: MasteryLevel;
  /** Highest level ever reached. Never drops. Used for unlocking and milestones. */
  peakLevel: MasteryLevel;
  unlocked: boolean;
  dimensions: SkillDimensions;
  review: ReviewState;
  /** Signatures solved with credit > 0. Used to recognize exact replays. */
  solvedSignatures: readonly string[];
  /** Plain-language reasons for the level, and what is missing for the next one. */
  explanation: readonly string[];
}

export interface LearnerState {
  policyId: string;
  /** Time of the latest evidence applied, or null if none. */
  asOf: number | null;
  skills: Readonly<Record<SkillId, SkillState>>;
  /** Activities and encounters completed successfully without a demonstrated answer. */
  clearedTargets: readonly string[];
  /** Transfer contexts completed successfully within the transfer assistance limit. */
  succeededContexts: readonly string[];
  /** Distinct signatures solved per activity id. */
  solvedByActivity: Readonly<Record<string, readonly string[]>>;
}
