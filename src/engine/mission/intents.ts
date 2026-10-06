// PRESENTATION CONTRACT. The engine says WHAT happened; a theme/UI layer decides HOW
// it looks. Nothing here names a theme, a screen, a color, or an animation. The UI
// never needs mastery math: it reads these intents and views.
//
// Correctness of options is deliberately absent from views: the UI learns an answer
// was right through RESPONSE_RESULT (or a demonstrated scaffold's `reveal`).
import type { Challenge } from '../evidence/attempt';
import type { AssistanceLevel } from '../evidence/assistance';
import type { AnswerValue, Prompt } from '../content/item';
import type { AnswerSpec } from '../content/pack';
import type { OpportunityUpgrade } from '../progression/opportunities';
import type { GameProgressSignal } from '../progression/signals';

export interface ScaffoldView {
  stepId: string;
  /** Presentation-neutral kind, e.g. "highlightGiven", "alternateRepresentation", "replayWord". */
  kind: string;
  assistance: AssistanceLevel;
  /** "offer": the policy suggests it now. "available": the learner may ask for it. */
  mode: 'available' | 'offer';
}

export interface ActivityView {
  stepId: string;
  activityId: string;
  encounterId: string | null;
  /** Position inside the step: encounter stage (if any) and item. */
  stage: { index: number; count: number } | null;
  item: { index: number; count: number };
  challenge: Challenge;
  cued: boolean;
  representation: string;
  /** Semantic concept, e.g. "positionAfterMove". The theme maps it to its fiction. */
  concept: string;
  prompt: Prompt;
  /** How the learner answers: pick an option, or produce a value in [min, max]. */
  answer: AnswerSpec;
  /** Listed options (choice mode). Empty in value mode, so the UI cannot show distractors. */
  options: { id: string; value: number | string }[];
  wrongTries: number;
  scaffolds: {
    /** At most one: help is offered in the order the activity's policy defines. */
    available: ScaffoldView[];
    shown: { stepId: string; kind: string; assistance: AssistanceLevel }[];
    /** Present only after a "demonstrated" scaffold was used. */
    revealedOptionId: string | null;
    /** The demonstrated answer value (both modes), or null. */
    revealedValue: AnswerValue | null;
  };
  /** Concept Rescue on this item, if one has started. */
  rescue: RescueView | null;
  /** For debugging and tests only. Stable across restarts. */
  itemSignature: string;
}

/**
 * A Concept Rescue: a different, parallel example of the same idea. Its answer is part of the
 * view because the learner works through it with the theme's teaching; the TARGET's answer is
 * never included.
 */
export interface RescueView {
  status: 'active' | 'done';
  /** Misconception to focus on when the evidence is strong, else null (teach the general idea). */
  focus: string | null;
  returnTo: 'same' | 'fresh';
  example: { concept: string; prompt: Prompt; answer: AnswerValue; signature: string };
}

export interface NarrativeView {
  stepId: string;
  eventKey: string;
}

export interface MissionView {
  instanceId: string;
  missionId: string;
  missionVersion: number;
  status: 'active' | 'completed';
  step: { index: number; count: number; id: string; kind: 'narrative' | 'activity' | 'encounter' } | null;
  activity: ActivityView | null;
  narrative: NarrativeView | null;
}

export type PresentationIntent =
  | { type: 'MISSION_STARTED'; missionId: string; stepCount: number }
  | { type: 'SHOW_NARRATIVE'; narrative: NarrativeView }
  | { type: 'SHOW_ACTIVITY'; activity: ActivityView }
  | {
      type: 'RESPONSE_RESULT';
      stepId: string;
      /** The chosen option (choice mode), or the option sharing the value, if any. */
      optionId: string | null;
      /** The value the learner gave or chose. */
      value: AnswerValue;
      correct: boolean;
      /** Misconception tag if the chosen wrong option carries one. */
      misconception: string | null;
      /** Copy key for the theme: "correct", "misconception:<tag>", or "incorrect.generic". */
      feedbackKey: string;
      /** True when the learner may try the same item again. */
      retryAllowed: boolean;
    }
  | {
      /** The semantic world consequence of an answer, right or wrong. The theme decides what moves. */
      type: 'WORLD_EVENT';
      stepId: string;
      concept: string;
      prompt: Prompt;
      appliedValue: number | string;
      correct: boolean;
    }
  | { type: 'OFFER_SCAFFOLD'; stepId: string; scaffold: ScaffoldView }
  | { type: 'SCAFFOLD_SHOWN'; stepId: string; scaffold: ScaffoldView; revealedOptionId: string | null; revealedValue: AnswerValue | null; nextAvailable: ScaffoldView[] }
  | { type: 'ITEM_REGENERATED'; stepId: string; reason: 'tooManyWrongTries' }
  | { type: 'CONCEPT_RESCUE'; stepId: string; rescue: RescueView }
  /** The learner's answer on the rescue example (instruction, not scored evidence). */
  | { type: 'RESCUE_RESULT'; stepId: string; value: AnswerValue; correct: boolean }
  | { type: 'CONCEPT_RESCUE_COMPLETE'; stepId: string; returnTo: 'same' | 'fresh' }
  | { type: 'STEP_COMPLETE'; stepId: string; stepIndex: number }
  | { type: 'MISSION_COMPLETE'; missionId: string }
  | {
      type: 'RESPONSE_REJECTED';
      /** "stale": the runtime refused a command built against an older checkpoint (double tap, late tap). */
      reason: 'unknownOption' | 'invalidResponse' | 'outOfRange' | 'noActivity' | 'scaffoldUnavailable' | 'notNarrative' | 'missionComplete' | 'stale' | 'rescueActive' | 'noRescue';
    }
  // Added by the runtime service after the learning processor runs:
  | { type: 'PROGRESSION_UPGRADE'; upgrade: OpportunityUpgrade }
  | { type: 'GAME_PROGRESS'; signal: GameProgressSignal }
  /** A content-defined unlock (rank, cosmetic, system) granted for the first time. Never a currency. */
  | { type: 'UNLOCK_GRANTED'; unlockId: string };

export type IntentType = PresentationIntent['type'];
