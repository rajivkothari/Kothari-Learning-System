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

export { GeneratedItemSchema, ResponseSchema, type AnswerValue, type GeneratedItem, type Response, type ResponseOption } from './content/item';
export {
  ActivitySchema,
  AnswerSpecSchema,
  ContentPackSchema,
  MasteryEncounterSchema,
  ScaffoldingPolicySchema,
  type Activity,
  type AnswerSpec,
  type ContentPack,
  type MasteryEncounter,
  type ScaffoldingPolicy,
} from './content/pack';
export { ContentCompositionError, composeContentPacks } from './content/compose';

export { createRegistry, defineGenerator, generateItem, generatorKey, type GeneratorRegistry, type ItemGenerator, type RegisteredGenerator } from './generation/generator';
export { BUILT_IN_GENERATORS } from './generation/registry';
export { createRng, type Rng } from './random/rng';
export { canonicalJson, hashValue } from './random/hash';

export { evaluateResponse, type Evaluation } from './evaluation/evaluate';
export { assistanceForProgress, nextScaffold, shouldRegenerate, type ItemProgress, type ScaffoldOffer } from './scaffolding/scaffolding';

export { EngineConfigSchema, MasteryPolicySchema, parseEngineConfig, type BudgetName, type EngineConfig, type MasteryPolicy } from './mastery/policy';
export { isReviewDue, nextReviewAt, type ReviewState } from './review/review';
export { classifyExposure, EXPOSURE_CLASSES, type ExposureClass } from './learner/exposure';
export type { LearnerState, SkillState } from './learner/types';
export { MODEL_STATE_VERSION, PlacementSchema, type Placement } from './learner/model';

export { CompletionRecordSchema, completionId, type CompletionRecord } from './evidence/completion';
export { LEARNING_EVENT_EVOLUTION, LearningEventVersionError, readLearningEvent, upgradePayload, type EvolutionTable, type PayloadUpgrader } from './evidence/evolution';
export { summarizeCompletion, type CompletionSummary } from './progression/completion';
export { VALUE_TIERS, tierRank, type EventTier, type ValueTier } from './progression/tiers';
export { capByAssistance, lifetimeValue, upgradeId, type OpportunityKind, type OpportunityUpgrade } from './progression/opportunities';
export type { GameProgressSignal, PracticeCredit } from './progression/signals';
export {
  createProcessor,
  PROCESSOR_STATE_VERSION,
  deriveLearnerState,
  eventsFromAttempts,
  learningEventId,
  replayEvents,
  runTimeline,
  type CompletionAssessment,
  type LearningEvent,
  type Processor,
  type ProcessorContext,
  type ProcessorStateExport,
} from './progression/processor';
export { MissionDefinitionSchema, MissionPackSchema, missionKey, type ActivityStep, type MissionDefinition, type MissionPack, type MissionStep } from './mission/schema';
export { poolChoice, stepActivityIds } from './mission/pool';
export {
  applyCommand,
  currentItem,
  checkResponse,
  describeMission,
  itemSeed,
  MissionRuntimeError,
  resumeIntents,
  startMission,
  startMissionAt,
  missionCompatibility,
  type MissionCommand,
  type MissionContext,
  type MissionResult,
  type MissionState,
  type ResponseCheck,
  type StartMissionInput,
} from './mission/runtime';
export type { ActivityView, MissionView, NarrativeView, PresentationIntent, RescueView, ScaffoldView } from './mission/intents';
export { validateMissionPack, type MissionValidationReport } from './validation/validateMissions';

export { checkActivityEligibility, checkEncounterEligibility, type Eligibility, type IneligibilityReason } from './eligibility/eligibility';
export { validateContentPack, type ContentIssue, type ValidationReport } from './validation/validateContent';
