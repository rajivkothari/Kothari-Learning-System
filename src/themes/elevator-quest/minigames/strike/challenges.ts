// Strike Lab's challenges (issue #3): which lane each mission step is played on and what its
// objective is. Pure data: no React, no clock. Each challenge is one runtime mission, and a mission
// step's activity chooses the puzzle (flow.ts taskOf); this table only sets the bowling around it.
//
// An objective is always "knock down these pins": the pins a right pair names (pairs.make-target), or
// the step's fixed target pins. Bowling never decides an answer and is never evidence.
//
// The three arcade challenges (stage 2) each change how the bowling is played, not only the question:
//   Pin Pursuit   the right pair lights two numbered pins, and each step stands them in a new
//                 formation (five, a V, a wide row), so the shot (or the two balls) changes.
//   Word Strike   the spelled word unlocks spin, and a post stands in front of the target: a straight
//                 ball cannot get there, a hooked one can (lane.test.ts checks both).
//   Physics Lab   a test strip the child sets SLICK or GRIPPY: on step one only grippy lets the spin
//                 bite enough to curve past the post, on step two only slick lets the ball slide past it
//                 (lane.test.ts). The strip is play: it is never evidence, and there is no science skill.
import type { LaneSetup, SurfaceKind } from './lane';

export type ChallengeId = 'classic' | 'pin-pursuit' | 'word-strike' | 'physics-lab';

/** Physics Lab's test strip: a patch the child sets slick or grippy (it starts on `start`). */
export interface StripChoice {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  start: SurfaceKind;
}

export interface StepLane {
  lane: LaneSetup;
  /** The objective's pins when the answer does not choose them. */
  targets?: readonly number[];
  /** A strip whose surface the child chooses (Physics Lab). */
  strip?: StripChoice;
}

export interface ChallengeDef {
  id: ChallengeId;
  missionId: string;
  /** One entry per mission step, in order. */
  steps: readonly StepLane[];
  /** Spin stays locked until the step's answer is right (Word Strike). */
  spinEarned: boolean;
  /** Listed on the level map (the classic round only resumes, D5). */
  listed: boolean;
}

export const CHALLENGES: readonly ChallengeDef[] = [
  // Strike Lab V0.1's mission (D190), kept so an unfinished round resumes (D5): power the Smart Ball,
  // then knock the head pin; make the target with two pins, then knock those two.
  { id: 'classic', missionId: 'strike-lab', steps: [{ lane: { rack: 'ten' }, targets: [0] }, { lane: { rack: 'five' } }], spinEarned: false, listed: false },
  // Pin Pursuit: the right pair's two pins, from three formations.
  { id: 'pin-pursuit', missionId: 'strike-pin-pursuit', steps: [{ lane: { rack: 'five' } }, { lane: { rack: 'vee' } }, { lane: { rack: 'wide' } }], spinEarned: false, listed: true },
  // Word Strike: a post in front of the target; spin opens with the word.
  {
    id: 'word-strike',
    missionId: 'strike-word-strike',
    steps: [
      { lane: { rack: 'ten', obstacle: { x: 0, y: 9, r: 0.16 } }, targets: [0] },
      { lane: { rack: 'five', obstacle: { x: 0, y: 10.5, r: 0.18 } }, targets: [3] },
    ],
    spinEarned: true,
    listed: true,
  },
  // Physics Lab: the strip starts on the surface that does not work, so the child tries the other.
  {
    id: 'physics-lab',
    missionId: 'strike-physics-lab',
    steps: [
      { lane: { rack: 'vee', obstacle: { x: 0, y: 10, r: 0.18 } }, targets: [2], strip: { x0: -0.53, x1: 0.53, y0: 8, y1: 14.5, start: 'oil' } },
      { lane: { rack: 'wide', obstacle: { x: 0, y: 10, r: 0.2 } }, targets: [2], strip: { x0: -0.53, x1: 0.53, y0: 4, y1: 14.5, start: 'grip' } },
    ],
    spinEarned: false,
    listed: true,
  },
];

/** The challenges the level map lists, in order. */
export const LISTED: readonly ChallengeDef[] = CHALLENGES.filter((c) => c.listed);

/** The lane with the strip set to a surface (no strip: the lane as it is). */
export function laneWith(step: StepLane, surface: SurfaceKind | null): LaneSetup {
  if (!step.strip) return step.lane;
  const { x0, x1, y0, y1, start } = step.strip;
  return { ...step.lane, surfaces: [...(step.lane.surfaces ?? []), { kind: surface ?? start, x0, x1, y0, y1 }] };
}

/** The level a new play session opens: the first listed challenge not finished, else the first. */
export function nextChallenge(completed: readonly string[]): string {
  return (LISTED.find((c) => !completed.includes(c.missionId)) ?? LISTED[0]!).missionId;
}

export const challengeFor = (missionId: string): ChallengeDef | null => CHALLENGES.find((c) => c.missionId === missionId) ?? null;
export const stepLane = (c: ChallengeDef, step: number): StepLane => c.steps[Math.max(0, Math.min(step, c.steps.length - 1))]!;
