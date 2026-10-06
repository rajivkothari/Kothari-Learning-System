// Completion summaries: what a finished (or abandoned) instance amounted to.
// Built from durable evidence (attempts + completion record), with content used
// only for what evidence cannot say (encounter stage list).
import type { ContentPack } from '../content/pack';
import { maxAssistance, type AssistanceLevel } from '../evidence/assistance';
import { compareAttempts, type AttemptEvidence, type Challenge, type Transfer } from '../evidence/attempt';
import type { CompletionRecord } from '../evidence/completion';
import type { SkillId } from '../skills/skill';

export interface CompletionSummary {
  completionId: string;
  instanceId: string;
  kind: 'activity' | 'encounter' | 'mission';
  targetId: string;
  targetKey: string;
  challenge: Challenge | null;
  transfer: Transfer;
  skillIds: SkillId[];
  /** Activity: final attempt correct. Encounter: every stage's final attempt correct. Mission: record says completed. */
  success: boolean;
  /** Most help received anywhere in the completion. */
  assistance: AssistanceLevel;
  completedAt: number;
}

const maxHelp = (attempts: readonly AttemptEvidence[]) => attempts.reduce<AssistanceLevel>((m, a) => maxAssistance(m, a.assistance), 'independent');

export function summarizeCompletion(record: CompletionRecord, attempts: readonly AttemptEvidence[], pack?: ContentPack): CompletionSummary {
  const sorted = [...attempts].sort(compareAttempts);
  const skillIds = [...new Set(sorted.flatMap((a) => a.skillIds))].sort();
  const base = {
    completionId: record.id,
    instanceId: record.instanceId,
    targetId: record.targetId,
    skillIds,
    assistance: maxHelp(sorted),
    completedAt: record.occurredAt,
  };
  if (record.kind === 'mission') {
    return { ...base, kind: 'mission', targetKey: `mission:${record.targetId}`, challenge: null, transfer: { kind: 'none' }, success: record.outcome === 'completed' };
  }
  const completed = record.outcome === 'completed';
  const last = sorted[sorted.length - 1];
  if (record.kind === 'encounter') {
    const encounter = pack?.encounters.find((e) => e.id === record.targetId);
    const stages = encounter?.stages ?? [...new Set(sorted.map((a) => a.activityId))];
    const success =
      completed &&
      stages.every((stage) => {
        const s = sorted.filter((a) => a.activityId === stage);
        return s.length > 0 && s[s.length - 1]?.outcome === 'correct';
      });
    return {
      ...base,
      kind: 'encounter',
      targetKey: `encounter:${record.targetId}`,
      challenge: 'masteryEncounter',
      transfer: encounter?.transfer ?? last?.transfer ?? { kind: 'none' },
      success,
    };
  }
  return {
    ...base,
    kind: 'activity',
    targetKey: `activity:${record.targetId}`,
    challenge: last?.challenge ?? 'practice',
    transfer: last?.transfer ?? { kind: 'none' },
    success: completed && last?.outcome === 'correct',
  };
}
