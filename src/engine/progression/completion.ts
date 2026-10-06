// A completion is one play-through (activityInstanceId) of an activity or encounter,
// summarized from its attempts. Uses the durable evidence first and content only
// for what evidence cannot say (an encounter's stage list and transfer context).
import type { ContentPack } from '../content/pack';
import { maxAssistance, type AssistanceLevel } from '../evidence/assistance';
import { compareAttempts, type AttemptEvidence, type Challenge, type Transfer } from '../evidence/attempt';
import type { SkillId } from '../skills/skill';

export interface CompletionSummary {
  instanceId: string;
  kind: 'activity' | 'encounter';
  targetId: string;
  targetKey: string;
  challenge: Challenge;
  transfer: Transfer;
  skillIds: SkillId[];
  /** Activity: the final attempt is correct. Encounter: every stage's final attempt is correct. */
  success: boolean;
  /** Most help received anywhere in the completion. */
  assistance: AssistanceLevel;
  completedAt: number;
}

export function summarizeInstance(attempts: readonly AttemptEvidence[], pack?: ContentPack): CompletionSummary {
  if (attempts.length === 0) throw new Error('summarizeInstance: no attempts');
  const sorted = [...attempts].sort(compareAttempts);
  const last = sorted[sorted.length - 1] as AttemptEvidence;
  const instanceId = last.activityInstanceId;
  if (sorted.some((a) => a.activityInstanceId !== instanceId)) throw new Error('summarizeInstance: attempts from different instances');

  const assistance = sorted.reduce<AssistanceLevel>((m, a) => maxAssistance(m, a.assistance), 'independent');
  const skillIds = [...new Set(sorted.flatMap((a) => a.skillIds))].sort();
  const encounterId = sorted.find((a) => a.encounterId)?.encounterId;

  if (encounterId) {
    const encounter = pack?.encounters.find((e) => e.id === encounterId);
    const stages = encounter?.stages ?? [...new Set(sorted.map((a) => a.activityId))];
    const success = stages.every((stage) => {
      const stageAttempts = sorted.filter((a) => a.activityId === stage);
      return stageAttempts.length > 0 && stageAttempts[stageAttempts.length - 1]?.outcome === 'correct';
    });
    return {
      instanceId,
      kind: 'encounter',
      targetId: encounterId,
      targetKey: `encounter:${encounterId}`,
      challenge: 'masteryEncounter',
      transfer: encounter?.transfer ?? last.transfer,
      skillIds,
      success,
      assistance,
      completedAt: last.occurredAt,
    };
  }

  return {
    instanceId,
    kind: 'activity',
    targetId: last.activityId,
    targetKey: `activity:${last.activityId}`,
    challenge: last.challenge,
    transfer: last.transfer,
    skillIds,
    success: last.outcome === 'correct',
    assistance,
    completedAt: last.occurredAt,
  };
}
