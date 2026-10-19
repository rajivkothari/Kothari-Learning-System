// Strike Lab's challenges (issue #3): which lane each mission step is played on and what its
// objective is. Pure data: no React, no clock. Each challenge is one runtime mission, and a mission
// step's activity chooses the puzzle (flow.ts taskOf); this table only sets the bowling around it.
//
// An objective is always "knock down these pins": the pins a right pair names (pairs.make-target), or
// the step's fixed target pins. Bowling never decides an answer and is never evidence.
import type { LaneSetup } from './lane';

export type ChallengeId = 'classic';

export interface StepLane {
  lane: LaneSetup;
  /** The objective's pins when the answer does not choose them. */
  targets?: readonly number[];
}

export interface ChallengeDef {
  id: ChallengeId;
  missionId: string;
  /** One entry per mission step, in order. */
  steps: readonly StepLane[];
  /** Spin stays locked until the step's answer is right (Word Strike). */
  spinEarned: boolean;
}

export const CHALLENGES: readonly ChallengeDef[] = [
  // Strike Lab V0.1's mission (D190), kept so an unfinished round resumes (D5): power the Smart Ball,
  // then knock the head pin; make the target with two pins, then knock those two.
  { id: 'classic', missionId: 'strike-lab', steps: [{ lane: { rack: 'ten' }, targets: [0] }, { lane: { rack: 'five' } }], spinEarned: false },
];

export const challengeFor = (missionId: string): ChallengeDef | null => CHALLENGES.find((c) => c.missionId === missionId) ?? null;
export const stepLane = (c: ChallengeDef, step: number): StepLane => c.steps[Math.max(0, Math.min(step, c.steps.length - 1))]!;
