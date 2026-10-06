// Public API of the pure learning engine. No React, React Native, Expo, Skia,
// SQLite, filesystem, network, clock, or ambient randomness. Callers supply time,
// seeds, ids, and stored evidence.

export { ASSISTANCE_LEVELS, AssistanceLevelSchema, isAtMost, maxAssistance, recordedAssistance, type AssistanceLevel } from './evidence/assistance';
export {
  AttemptEvidenceSchema,
  ChallengeSchema,
  TransferSchema,
  compareAttempts,
  type AttemptEvidence,
  type Challenge,
  type Outcome,
  type Transfer,
} from './evidence/attempt';

export { MASTERY_LEVELS, MasteryLevelSchema, isAtLeast, levelRank, type MasteryLevel } from './skills/levels';
export { SkillDefinitionSchema, SkillIdSchema, type SkillDefinition, type SkillId } from './skills/skill';
export { buildSkillGraph, type GraphIssue, type GraphResult, type SkillGraph } from './skills/graph';

export { GeneratedItemSchema, ResponseSchema, type GeneratedItem, type Response, type ResponseOption } from './content/item';
export {
  ActivitySchema,
  ContentPackSchema,
  MasteryEncounterSchema,
  ScaffoldingPolicySchema,
  type Activity,
  type ContentPack,
  type MasteryEncounter,
  type ScaffoldingPolicy,
} from './content/pack';

export { createRegistry, defineGenerator, generateItem, generatorKey, type GeneratorRegistry, type ItemGenerator, type RegisteredGenerator } from './generation/generator';
export { BUILT_IN_GENERATORS } from './generation/registry';
export { createRng, type Rng } from './random/rng';

export { evaluateResponse, type Evaluation } from './evaluation/evaluate';
export { assistanceForProgress, nextScaffold, shouldRegenerate, type ItemProgress, type ScaffoldOffer } from './scaffolding/scaffolding';

export { EngineConfigSchema, MasteryPolicySchema, parseEngineConfig, type BudgetName, type EngineConfig, type MasteryPolicy } from './mastery/policy';
export { isReviewDue, nextReviewAt, type ReviewState } from './review/review';
export { classifyExposure, EXPOSURE_CLASSES, type ExposureClass } from './learner/exposure';
export type { LearnerState, SkillState } from './learner/types';

export { summarizeInstance, type CompletionSummary } from './progression/completion';
export { VALUE_TIERS, type ProgressionAssessment, type ValueEvent, type ValueTier } from './progression/value';
export { deriveLearnerState, runTimeline, type TimelineResult } from './progression/timeline';

export { checkActivityEligibility, checkEncounterEligibility, type Eligibility, type IneligibilityReason } from './eligibility/eligibility';
export { validateContentPack, type ContentIssue, type ValidationReport } from './validation/validateContent';
