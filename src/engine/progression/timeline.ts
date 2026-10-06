// The single path from evidence to derived state: group attempts into completions,
// replay them in order, and assess each completion. deriveLearnerState is this
// same path, so state and value can never disagree about history.
//
// Ordering: completions by (time of their last attempt, instance id); attempts
// inside a completion by (time, id). Overlapping instances are applied whole, in
// that order. Deterministic for any input order.
import type { ContentPack } from '../content/pack';
import { isAtMost } from '../evidence/assistance';
import { compareAttempts, type AttemptEvidence } from '../evidence/attempt';
import { createLearnerModel } from '../learner/model';
import type { LearnerState } from '../learner/types';
import type { MasteryPolicy } from '../mastery/policy';
import type { SkillGraph } from '../skills/graph';
import { summarizeInstance } from './completion';
import { assessProgression, type ProgressionAssessment } from './value';

export interface TimelineInput {
  graph: SkillGraph;
  policy: MasteryPolicy;
  attempts: readonly AttemptEvidence[];
  pack?: ContentPack;
}

export interface TimelineResult {
  state: LearnerState;
  completions: ProgressionAssessment[];
}

export function groupInstances(attempts: readonly AttemptEvidence[]): AttemptEvidence[][] {
  const groups = new Map<string, AttemptEvidence[]>();
  for (const a of attempts) groups.set(a.activityInstanceId, [...(groups.get(a.activityInstanceId) ?? []), a]);
  const sorted = [...groups.values()].map((g) => [...g].sort(compareAttempts));
  const lastTime = (g: AttemptEvidence[]) => g[g.length - 1]?.occurredAt ?? 0;
  return sorted.sort(
    (x, y) =>
      lastTime(x) - lastTime(y) ||
      ((x[0]?.activityInstanceId ?? '') < (y[0]?.activityInstanceId ?? '') ? -1 : 1),
  );
}

export function runTimeline({ graph, policy, attempts, pack }: TimelineInput): TimelineResult {
  const model = createLearnerModel(graph, policy);
  const completions: ProgressionAssessment[] = [];

  for (const group of groupInstances(attempts)) {
    const before = model.snapshot();
    const summary = summarizeInstance(group, pack);
    const exposures = group.map((a) => model.applyAttempt(a));
    model.recordCompletion({
      targetKey: summary.targetKey,
      success: summary.success,
      assistanceDemonstrated: summary.assistance === 'demonstrated',
      transferContextQualified:
        summary.transfer.kind !== 'none' && isAtMost(summary.assistance, policy.transferMaxAssistance) ? summary.transfer.contextKey : null,
    });
    completions.push(assessProgression(before, model.snapshot(), summary, exposures));
  }

  return { state: model.snapshot(), completions };
}

/** Derived learner state from durable evidence. Recompute freely under a newer policy. */
export function deriveLearnerState(input: TimelineInput): LearnerState {
  return runTimeline(input).state;
}
