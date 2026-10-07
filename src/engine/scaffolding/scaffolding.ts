// Minimal scaffolding runtime: given an activity's policy and what has happened so
// far on the current item, which help can be offered next? Different activities
// use different policies. The engine imposes no universal hint ladder.
import type { ScaffoldingPolicy } from '../content/pack';
import { recordedAssistance, type AssistanceLevel } from '../evidence/assistance';

export interface ItemProgress {
  wrongTries: number;
  /** Step ids already given on this item, in order. */
  stepsGiven: readonly string[];
  /** A Concept Rescue was completed for this item (or the item it replaced). */
  rescued?: boolean;
}

export interface ScaffoldOffer {
  stepId: string;
  kind: string;
  assistance: AssistanceLevel;
  /** "available": learner may request it. "offer": policy says to offer it now. */
  mode: 'available' | 'offer';
}

/**
 * The next step in the policy that has not been given yet, if any. Steps are used in order.
 * An "afterWrongTries" step is OFFERED at its threshold and, unless it demonstrates the
 * answer, AVAILABLE on request before it, so the ladder never goes quiet between steps.
 */
export function nextScaffold(policy: ScaffoldingPolicy, progress: ItemProgress): ScaffoldOffer | null {
  const step = policy.steps.find((s) => !progress.stepsGiven.includes(s.id));
  if (!step) return null;
  const triggered = step.offer === 'afterWrongTries' && progress.wrongTries >= (step.afterWrongTries ?? Infinity);
  const early = step.requestableEarly ?? step.assistance !== 'demonstrated';
  if (step.offer === 'afterWrongTries' && !triggered && !early) return null;
  return { stepId: step.id, kind: step.kind, assistance: step.assistance, mode: triggered ? 'offer' : 'available' };
}

/**
 * Whether this miss count starts a Concept Rescue under the policy. `rescueStarted` covers a
 * rescue on this item and on the item it replaced, so a correction never loops.
 */
export function shouldRescue(policy: ScaffoldingPolicy, progress: ItemProgress & { rescueStarted: boolean }): boolean {
  return policy.conceptRescue !== undefined && !progress.rescueStarted && progress.wrongTries >= policy.conceptRescue.afterWrongTries;
}

/**
 * Which misunderstanding a rescue should focus on. Only when the evidence is strong: one tag
 * seen at least twice and on at least half of the misses. Otherwise null: teach the general idea.
 */
export function misconceptionFocus(misconceptions: readonly string[], wrongTries: number): string | null {
  const counts = new Map<string, number>();
  for (const m of misconceptions) counts.set(m, (counts.get(m) ?? 0) + 1);
  let best: [string, number] | null = null;
  for (const [tag, n] of [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (!best || n > best[1]) best = [tag, n];
  if (!best || best[1] < 2 || best[1] * 2 < wrongTries) return null;
  return best[0];
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
  if (progress.rescued) help.push('guided');
  return recordedAssistance({ wrongTries: progress.wrongTries, helpReceived: help });
}
