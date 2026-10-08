// Mini-games (M9): the contract between the framework (host, session, registry) and each game.
//
// A mini-game is a full-screen game a learner opens from a landing (Word Golf on Floor 20, Cargo
// Commander on Floor 4) and leaves with BACK TO ELEVATOR. The elevator session stays alive behind it,
// paused: its job keeps its place, no answer window is open, nothing is recorded.
//
// Each play session is one runtime mission instance (content/missions, EC). The game never sees the
// runtime: it gets a MiniGameSession, which turns the game's moments into runtime commands.
//   challenge()  the item now (prompt fields, how to answer, help offered); never the answer
//   check()      runtime.check: right or wrong, in memory, nothing recorded (instant feedback)
//   submit()     runtime.submit: the ONLY way anything is recorded as learning evidence
//   help()       runtime.useScaffold for the offered help step
//   next()       after a right answer: show the next item (the engine has already moved on; the
//                session holds the new item back until the game has played its moment)
//   saveGame()   gameplay state that is not learning (ball position, hole, crates loaded): a
//                per-learner setting, so a restart can resume or safely restart. Never evidence.
//
// What is never evidence and never reaches the runtime's learning records: entering or leaving a
// game, a golf shot, a crate moved, an animation replayed, a word replayed, a graded attempt
// restarted (clearing the tiles), opening a toolkit. Only a committed academic answer (a spelled
// word, a weighed load) is, through submit().
//
// Pure types: no React values (ComponentType is a type-only import), so tests and the director can
// read the catalog (catalog.ts) without a renderer.
import type { ComponentType } from 'react';

import type { ActivityView, AnswerSpec, AnswerValue, AssistanceLevel, LearnerState, Response } from '../../../engine';
import type { TextSizes } from '../ui/textRoles';

/** The games there are. A new game is a new id here, a catalog entry and a registry entry. */
export type MiniGameId = 'word-golf' | 'cargo-commander';

/** A game's place in the building, without its screen (catalog.ts; the director reads this). */
export interface MiniGameEntry {
  id: MiniGameId;
  /** The landing whose doorway offers it. */
  floor: number;
  /** The runtime mission each play session is an instance of (content/missions, EC). */
  missionId: string;
  /**
   * A game with more than one mission (one per tier, say): every mission it may run. An unfinished
   * instance of any of them resumes. Absent: only `missionId`.
   */
  missions?: readonly string[];
  /**
   * Which mission a NEW play session runs, from the learner's state (pure: EC's tiers.ts). Called only
   * when nothing unfinished resumes. Absent: `missionId`. Must return one of `missions` (or `missionId`).
   */
  chooseMission?: (learner: LearnerState) => string;
  /**
   * The id of a NEW play session's instance. The id seeds the mission's pool choices (the engine's
   * poolChoice), so a game can pick, from the learner's state, an id whose pools give the tiers it
   * wants (EC's cargo/tiers.ts). It must start with `base` (`<game>-<learner>-<time>`) and be new.
   * Absent: `base`.
   */
  chooseInstanceId?: (learner: LearnerState, base: string, missionId: string) => string;
  /** Copy key of the game's name (minigames copy: `games.<titleKey>`). */
  titleKey: string;
}

/** What a game's screen needs before it shows (the host may warm these). Optional. */
export interface MiniGamePreload {
  /** Art manifest ids (AA), e.g. "minigame.wordgolf.backdrop". */
  art?: readonly string[];
  /** Sound slots (AA), e.g. "golfHit". */
  sounds?: readonly string[];
}

export interface MiniGameDefinition extends MiniGameEntry {
  Screen: ComponentType<MiniGameScreenProps>;
  preload?: MiniGamePreload;
}

/** Sound for a game: semantic slots and narration keys, never file names. Missing assets are silent. */
export interface MiniGameSound {
  /** A one-shot slot (audio/profile.ts, e.g. "golfHit"). An unknown or missing slot is a no-op. */
  play(slot: string): void;
  /** Start (true) or stop (false) a looping slot ("golfRoll", "freightMove"). The host stops every loop when the game closes. */
  loop(slot: string, on: boolean): void;
  /** Narration by key (`word.<wordId>`: the word, a short sentence, the word). A no-op when there is no recording. Never help, never evidence. */
  say(key: string): void;
  /** Whether narration exists for `key`, so a replay control can hide when there is nothing to say. */
  canSay(key: string): boolean;
  /** Stop narration that is playing. */
  hush(): void;
}

export interface MiniGameScreenProps {
  session: MiniGameSession;
  /** The whole window the game may draw in (it owns the screen). */
  size: { width: number; height: number };
  /** Safe-area insets: keep controls inside them. */
  insets: { top: number; right: number; bottom: number; left: number };
  /** Text sizes by role for this window (ui/textRoles.ts): instruction 24 to 28, Lifty 20 to 24, labels at least 16. */
  text: TextSizes;
  /** The learner's Reduced Motion setting (the same as the elevator's): no travel animation, no shake, no parallax. */
  reducedMotion: boolean;
  /** The app is in the background: stop animations and loops, save. The host saves nothing for the game. */
  suspended: boolean;
  sound: MiniGameSound;
  /**
   * BACK TO ELEVATOR. The game draws the control (hostControls.tsx BackToElevatorButton, or its own
   * in its layout) and calls this; the host closes the screen and the learner is on the same landing
   * with the doors open. Save first: the host may also close the game at any time (Start Over).
   */
  onExit(): void;
}

/** What a submitted answer is recorded as: the assistance level of a right answer, or a miss. */
export type Evidence = AssistanceLevel | 'incorrect';

/** The next help step the activity's policy offers (EC's pack). */
export interface HelpOffer {
  stepId: string;
  /** The policy's help kind (EC names them, e.g. "phonicsHint", "revealLetter", "showAnswer"). */
  kind: string;
  assistance: AssistanceLevel;
  /** True when the policy suggests it now (after a miss): the help control may draw attention, never insist. */
  offered: boolean;
}

/** The item the game shows now. Built from the engine's view: it never carries the answer. */
export interface ChallengeView {
  /** Changes whenever a new item is presented (the engine's item signature; stable across restarts). */
  key: string;
  stepId: string;
  activityId: string;
  concept: string;
  challenge: ActivityView['challenge'];
  /** The generator's prompt fields (EC: spelling has wordId, length, tiles, pattern, syllables; cargo per kind). */
  prompt: ActivityView['prompt'];
  /** How to answer: a choice, a number in [min, max], or (EC, M9) text. */
  answer: AnswerSpec;
  /** Choice mode only (empty otherwise). */
  options: readonly { id: string; value: AnswerValue }[];
  /** This item's place in its step (a step may hold several items: a hole's words, a run's loads). */
  item: { index: number; count: number };
  /** Misses on this item so far. */
  wrongTries: number;
  /** The next help step, or null when the ladder is used up. */
  help: HelpOffer | null;
  /** Help already given on this item, in order. */
  helpShown: readonly { stepId: string; kind: string; assistance: AssistanceLevel }[];
  /** After SHOW ME (a demonstrated step): the answer, shown. A right answer after it is never independent. */
  revealed: AnswerValue | null;
}

/** runtime.check: instant, in memory, nothing recorded. Null when the response cannot be checked (wrong mode, out of range, no item). */
export interface MiniGameCheck {
  correct: boolean;
  misconception: string | null;
}

export type SubmitResult =
  | {
      status: 'answered';
      correct: boolean;
      /** What the engine recorded for this answer. A right answer after any help or a miss is never "independent". */
      evidence: Evidence;
      misconception: string | null;
      /** A miss replaced the item with a fresh one of the same kind (too many tries). challenge() shows it. */
      fresh: boolean;
      /** The mission is complete (the last item was answered right). Call finish() when the game is done celebrating. */
      done: boolean;
    }
  | {
      status: 'refused';
      /**
       * busy: another command is in flight. closed: the game is closing or finished. noChallenge: no
       * item takes an answer (a story beat, or a right answer waiting for next()). invalid: wrong
       * answer mode or out of range. stale: the item changed under the answer. failed: saving did
       * not work (the session reloaded the last save; let the learner answer again). Nothing was recorded.
       */
      reason: 'busy' | 'closed' | 'noChallenge' | 'invalid' | 'stale' | 'failed';
    };

/** What a help step gives (help()). */
export interface HelpView {
  stepId: string;
  kind: string;
  assistance: AssistanceLevel;
  /** A demonstrated step's answer (SHOW ME), else null. */
  revealed: AnswerValue | null;
  /** The next step on the ladder, or null. */
  next: HelpOffer | null;
}

export interface MiniGameProgress {
  /** challenge: an item takes answers. solved: a right answer waits for next(). story: a narrative step waits for next(). done: complete. */
  phase: 'challenge' | 'solved' | 'story' | 'done';
  /** The mission's steps: which one now (0-based), of how many. */
  step: { index: number; count: number };
  /** The current item in its step, or null outside an activity. */
  item: { index: number; count: number } | null;
  /** Right answers committed during this visit (since the session opened). Presentation only. */
  solved: number;
  done: boolean;
}

/** One play session of a mini-game over one runtime mission instance. */
export interface MiniGameSession {
  readonly gameId: MiniGameId;
  readonly learnerId: string;
  /** The runtime mission instance (resumed when the learner comes back to an unfinished game). */
  readonly instanceId: string;
  /** True when this session resumed an unfinished instance rather than starting a new one. */
  readonly resumed: boolean;
  /** The item taking answers now, or null (a story beat, a right answer waiting for next(), or done). */
  challenge(): ChallengeView | null;
  /** A narrative step waiting for next(), or null. */
  story(): { stepId: string; eventKey: string } | null;
  /**
   * The right answer waiting for next() (phase "solved"): what was answered and how it was recorded.
   * Also after a restart: a right answer committed just before the app closed comes back here, so the
   * game can still play its moment (the shot, the freight run). Null otherwise.
   */
  solvedAnswer(): { value: AnswerValue; evidence: Evidence } | null;
  /** runtime.check, nothing recorded. */
  check(response: Response): MiniGameCheck | null;
  /** runtime.submit with an idempotent command id: the only evidence path. One at a time. */
  submit(response: Response): Promise<SubmitResult>;
  /** runtime.useScaffold for the offered step. Null when no help is offered (or busy/closed). */
  help(): Promise<HelpView | null>;
  /** After a right answer (phase "solved"), or on a story beat: on to the next item. Null when done or nothing waits. */
  next(): Promise<ChallengeView | null>;
  progress(): MiniGameProgress;
  /** Gameplay state (JSON-serializable, at most 32 KB), per learner, for this instance only. Never evidence. */
  saveGame(state: unknown): Promise<void>;
  /** The state saved for this instance, or null (none, another instance's, or unreadable). */
  loadGame(): Promise<unknown | null>;
  /** The game is done with this instance (complete, after its celebration): the save is cleared, and the next visit starts a new game. */
  finish(): Promise<void>;
  /** Re-render on change (useSyncExternalStore). */
  subscribe(listener: () => void): () => void;
}
