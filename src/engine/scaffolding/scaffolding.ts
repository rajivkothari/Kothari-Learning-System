// Minimal scaffolding runtime: given an activity's policy and what has happened so
// far on the current item, which help can be offered next? Different activities
// use different policies. The engine imposes no universal hint ladder.
import type { ScaffoldingPolicy } from '../content/pack';
import { recordedAssistance, type AssistanceLevel } from '../evidence/assistance';

export interface ItemProgress {
  wrongTries: number;
  /** Step ids already given on this item, in order. */
  stepsGiven: readonly string[];
}

export interface ScaffoldOffer {
  stepId: string;
  kind: string;
  assistance: AssistanceLevel;
  /** "available": learner may request it. "offer": policy says to offer it now. */
  mode: 'available' | 'offer';
}

/** The next step in the policy that has not been given yet, if any. Steps are used in order. */
export function nextScaffold(policy: ScaffoldingPolicy, progress: ItemProgress): ScaffoldOffer | null {
  const step = policy.steps.find((s) => !progress.stepsGiven.includes(s.id));
  if (!step) return null;
  const triggered = step.offer === 'afterWrongTries' && progress.wrongTries >= (step.afterWrongTries ?? Infinity);
  if (step.offer === 'afterWrongTries' && !triggered) return null;
  return { stepId: step.id, kind: step.kind, assistance: step.assistance, mode: triggered ? 'offer' : 'available' };
}

/** Whether the policy says to present a fresh variant instead of the same item again. */
export function shouldRegenerate(policy: ScaffoldingPolicy, progress: ItemProgress): boolean {
  return policy.regenerateAfterWrongTries !== undefined && progress.wrongTries >= policy.regenerateAfterWrongTries;
}

/** Assistance to record for the item, derived from what was actually given. */
export function assistanceForProgress(policy: ScaffoldingPolicy, progress: ItemProgress): AssistanceLevel {
  const help = progress.stepsGiven.map((id) => {
    const step = policy.steps.find((s) => s.id === id);
    if (!step) throw new Error(`Scaffold step "${id}" is not part of policy "${policy.id}"`);
    return step.assistance;
  });
  return recordedAssistance({ wrongTries: progress.wrongTries, helpReceived: help });
}
