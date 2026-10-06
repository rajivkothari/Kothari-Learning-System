// PRESENTATION CONTRACT. The engine says WHAT happened; a theme/UI layer decides HOW
// it looks. Nothing here names a theme, a screen, a color, or an animation. The UI
// never needs mastery math: it reads these intents and views.
//
// Correctness of options is deliberately absent from views: the UI learns an answer
// was right through RESPONSE_RESULT (or a demonstrated scaffold's `reveal`).
import type { Challenge } from '../evidence/attempt';
import type { AssistanceLevel } from '../evidence/assistance';
import type { Prompt } from '../content/item';
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
  options: { id: string; value: number | string }[];
  wrongTries: number;
  scaffolds: {
    /** At most one: help is offered in the order the activity's policy defines. */
    available: ScaffoldView[];
    shown: { stepId: string; kind: string; assistance: AssistanceLevel }[];
    /** Present only after a "demonstrated" scaffold was used. */
    revealedOptionId: string | null;
  };
  /** For debugging and tests only. Stable across restarts. */
  itemSignature: string;
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
      optionId: string;
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
  | { type: 'SCAFFOLD_SHOWN'; stepId: string; scaffold: ScaffoldView; revealedOptionId: string | null; nextAvailable: ScaffoldView[] }
  | { type: 'ITEM_REGENERATED'; stepId: string; reason: 'tooManyWrongTries' }
  | { type: 'STEP_COMPLETE'; stepId: string; stepIndex: number }
  | { type: 'MISSION_COMPLETE'; missionId: string }
  | { type: 'RESPONSE_REJECTED'; reason: 'unknownOption' | 'noActivity' | 'scaffoldUnavailable' | 'notNarrative' | 'missionComplete' }
  // Added by the runtime service after the learning processor runs:
  | { type: 'PROGRESSION_UPGRADE'; upgrade: OpportunityUpgrade }
  | { type: 'GAME_PROGRESS'; signal: GameProgressSignal };

export type IntentType = PresentationIntent['type'];
