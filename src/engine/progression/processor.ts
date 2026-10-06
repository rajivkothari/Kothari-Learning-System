// The single path from durable learning events to derived state.
//
//   attempts + completion records (in order)
//     -> learner model (learning evidence: levels, dimensions, review)
//     -> per completion: demonstrations -> opportunity upgrades (scarce accomplishments)
//                        and game-progress signals (visible in-game progression)
//
// Event order is the caller's: the persistence layer passes insertion order (seq), so
// a full replay and an incremental update apply exactly the same sequence. runTimeline
// is the convenience form for callers that only have attempts (tests, tools): it sorts
// by time and synthesizes a completion after each instance's last attempt.
//
// The processor's state is exportable (derived cache) and restorable. Exported state
// plus the same subsequent events gives the same result as a full replay.
import type { ContentPack } from '../content/pack';
import { compareAttempts, type AttemptEvidence } from '../evidence/attempt';
import { completionId, type CompletionRecord } from '../evidence/completion';
import type { ExposureClass } from '../learner/exposure';
import { createLearnerModel, MODEL_STATE_VERSION, type LearnerModel, type ModelStateExport } from '../learner/model';
import type { LearnerState } from '../learner/types';
import type { MasteryPolicy } from '../mastery/policy';
import type { MissionDefinition } from '../mission/schema';
import type { SkillGraph } from '../skills/graph';
import { summarizeCompletion, type CompletionSummary } from './completion';
import { applyDemonstrations, demonstrationsFor, type OpportunityLedger, type OpportunityUpgrade } from './opportunities';
import { gameSignalsFor, mostNovel, type GameProgressSignal } from './signals';
import type { EventTier, ValueTier } from './tiers';
import { tierRank } from './tiers';

export type LearningEvent = { type: 'attempt'; attempt: AttemptEvidence } | { type: 'completion'; completion: CompletionRecord };

export function learningEventId(e: LearningEvent): string {
  return e.type === 'attempt' ? e.attempt.id : e.completion.id;
}

export interface ProcessorContext {
  graph: SkillGraph;
  policy: MasteryPolicy;
  pack?: ContentPack;
  missions?: readonly MissionDefinition[];
}

export interface CompletionAssessment {
  completionId: string;
  instanceId: string;
  kind: CompletionSummary['kind'];
  targetKey: string;
  success: boolean;
  /** Most novel exposure among the completion's items. */
  exposure: ExposureClass;
  /** Highest tier newly reached by any upgrade in this completion, or "none". */
  tier: ValueTier;
  upgrades: OpportunityUpgrade[];
  signals: GameProgressSignal[];
  notes: string[];
}

export interface ProcessorStateExport {
  version: number;
  model: ModelStateExport;
  opportunities: Record<string, EventTier>;
  /** Attempts of instances that have not completed yet (needed to summarize them later). */
  pendingInstances: Record<string, { attempts: AttemptEvidence[]; exposures: ExposureClass[]; successes: boolean[] }>;
  /** Per mission instance: exposures and credited-success flags of its attempts so far. */
  missionExposures: Record<string, ExposureClass[]>;
  missionSuccesses: Record<string, boolean[]>;
  /** Per mission instance: its attempts' help levels are summarized from these. */
  missionAttempts: Record<string, AttemptEvidence[]>;
  missionsCompleted: Record<string, number>;
  eventsApplied: number;
}

export const PROCESSOR_STATE_VERSION = 1;

export interface Processor {
  apply(event: LearningEvent): CompletionAssessment | null;
  learnerState(): LearnerState;
  opportunities(): Record<string, EventTier>;
  exportState(): ProcessorStateExport;
  readonly eventsApplied: number;
}

export function createProcessor(ctx: ProcessorContext, restored?: ProcessorStateExport): Processor {
  if (restored && (restored.version !== PROCESSOR_STATE_VERSION || restored.model.version !== MODEL_STATE_VERSION)) {
    throw new Error('Processor state version mismatch; rebuild from history');
  }
  const model: LearnerModel = createLearnerModel(ctx.graph, ctx.policy, restored?.model);
  const ledger: OpportunityLedger = new Map(Object.entries(restored?.opportunities ?? {}));
  const pending = new Map<string, { attempts: AttemptEvidence[]; exposures: ExposureClass[]; successes: boolean[] }>(
    Object.entries(restored?.pendingInstances ?? {}).map(([k, v]) => [k, { attempts: [...v.attempts], exposures: [...v.exposures], successes: [...v.successes] }]),
  );
  const missionExposures = new Map<string, ExposureClass[]>(Object.entries(restored?.missionExposures ?? {}).map(([k, v]) => [k, [...v]]));
  const missionSuccesses = new Map<string, boolean[]>(Object.entries(restored?.missionSuccesses ?? {}).map(([k, v]) => [k, [...v]]));
  const allSkills = [...ctx.graph.order];
  const isCreditedSuccess = (a: AttemptEvidence) => a.outcome === 'correct' && ctx.policy.assistanceCredit[a.assistance] > 0;
  const missionAttempts = new Map<string, AttemptEvidence[]>(Object.entries(restored?.missionAttempts ?? {}).map(([k, v]) => [k, [...v]]));
  const missionsCompleted = new Map<string, number>(Object.entries(restored?.missionsCompleted ?? {}));
  let eventsApplied = restored?.eventsApplied ?? 0;

  function assess(record: CompletionRecord): CompletionAssessment {
    const isMission = record.kind === 'mission';
    const attempts = isMission ? (missionAttempts.get(record.instanceId) ?? []) : (pending.get(record.instanceId)?.attempts ?? []);
    const exposures = isMission ? (missionExposures.get(record.instanceId) ?? []) : (pending.get(record.instanceId)?.exposures ?? []);
    const successes = isMission ? (missionSuccesses.get(record.instanceId) ?? []) : (pending.get(record.instanceId)?.successes ?? []);
    const summary = summarizeCompletion(record, attempts, ctx.pack);
    const mission = isMission ? ctx.missions?.find((m) => m.id === record.targetId) : undefined;
    const demos = demonstrationsFor({
      summary,
      exposures,
      successes,
      milestoneSkills: allSkills,
      peak: (s) => model.peak(s),
      reviewStage: (s) => model.reviewStage(s),
      ...(mission ? { missionCeiling: mission.completionTier } : {}),
    });
    const upgrades = applyDemonstrations(ledger, demos, record.id, record.occurredAt);
    let firstMission = false;
    if (isMission && summary.success) {
      const n = missionsCompleted.get(record.targetId) ?? 0;
      firstMission = n === 0;
      missionsCompleted.set(record.targetId, n + 1);
    }
    const signals = gameSignalsFor(summary, exposures, upgrades, firstMission);
    const exposure = mostNovel(exposures);

    if (isMission) {
      missionAttempts.delete(record.instanceId);
      missionExposures.delete(record.instanceId);
      missionSuccesses.delete(record.instanceId);
    } else {
      pending.delete(record.instanceId);
    }

    const notes: string[] = [];
    if (!summary.success) notes.push('Not completed successfully: no completion value. Evidence was still recorded.');
    if (exposure === 'exactReplay' && !isMission) notes.push('Exact replay: no new evidence and no value.');
    if (exposure === 'easyVariation' && upgrades.length === 0) notes.push("Mastered material, no review due: you've mastered this, so try something new.");
    if (summary.assistance === 'demonstrated') notes.push('An answer was demonstrated: completion demonstrations are not counted. A later independent success still can be.');

    const tier = upgrades.reduce<ValueTier>((m, u) => (tierRank(u.toTier) > tierRank(m) ? u.toTier : m), 'none');
    return { completionId: record.id, instanceId: record.instanceId, kind: summary.kind, targetKey: summary.targetKey, success: summary.success, exposure, tier, upgrades, signals, notes };
  }

  function apply(event: LearningEvent): CompletionAssessment | null {
    eventsApplied += 1;
    if (event.type === 'attempt') {
      const a = event.attempt;
      const { exposure } = model.applyAttempt(a);
      const entry = pending.get(a.activityInstanceId) ?? { attempts: [], exposures: [], successes: [] };
      entry.attempts.push(a);
      entry.exposures.push(exposure);
      entry.successes.push(isCreditedSuccess(a));
      pending.set(a.activityInstanceId, entry);
      if (a.missionInstanceId) {
        missionAttempts.set(a.missionInstanceId, [...(missionAttempts.get(a.missionInstanceId) ?? []), a]);
        missionExposures.set(a.missionInstanceId, [...(missionExposures.get(a.missionInstanceId) ?? []), exposure]);
        missionSuccesses.set(a.missionInstanceId, [...(missionSuccesses.get(a.missionInstanceId) ?? []), isCreditedSuccess(a)]);
      }
      return null;
    }
    return assess(event.completion);
  }

  const sortedRecord = <T>(m: Map<string, T>) => Object.fromEntries([...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

  return {
    apply,
    learnerState: () => model.snapshot(Object.fromEntries(ledger)),
    opportunities: () => sortedRecord(ledger),
    exportState: () => ({
      version: PROCESSOR_STATE_VERSION,
      model: model.exportState(),
      opportunities: sortedRecord(ledger),
      pendingInstances: sortedRecord(new Map([...pending].map(([k, v]) => [k, { attempts: [...v.attempts], exposures: [...v.exposures], successes: [...v.successes] }]))),
      missionExposures: sortedRecord(new Map([...missionExposures].map(([k, v]) => [k, [...v]]))),
      missionSuccesses: sortedRecord(new Map([...missionSuccesses].map(([k, v]) => [k, [...v]]))),
      missionAttempts: sortedRecord(new Map([...missionAttempts].map(([k, v]) => [k, [...v]]))),
      missionsCompleted: sortedRecord(missionsCompleted),
      eventsApplied,
    }),
    get eventsApplied() {
      return eventsApplied;
    },
  };
}

export interface ReplayResult {
  state: LearnerState;
  completions: CompletionAssessment[];
  processor: Processor;
}

/** Apply events in the given order. Duplicate ids are applied once (idempotent replay). */
export function replayEvents(ctx: ProcessorContext, events: readonly LearningEvent[], restored?: ProcessorStateExport): ReplayResult {
  const processor = createProcessor(ctx, restored);
  const seen = new Set<string>();
  const completions: CompletionAssessment[] = [];
  for (const e of events) {
    const id = learningEventId(e);
    if (seen.has(id)) continue;
    seen.add(id);
    const r = processor.apply(e);
    if (r) completions.push(r);
  }
  return { state: processor.learnerState(), completions, processor };
}

/**
 * Convenience for callers with attempts only: sort by (time, id) and add an implicit
 * completion right after each instance's last attempt. Persisted histories carry real
 * completion records and use replayEvents directly.
 */
export function eventsFromAttempts(attempts: readonly AttemptEvidence[]): LearningEvent[] {
  const unique = [...new Map(attempts.map((a) => [a.id, a])).values()].sort(compareAttempts);
  const lastIndex = new Map<string, number>();
  unique.forEach((a, i) => lastIndex.set(a.activityInstanceId, i));
  const events: LearningEvent[] = [];
  unique.forEach((a, i) => {
    events.push({ type: 'attempt', attempt: a });
    if (lastIndex.get(a.activityInstanceId) === i) {
      const kind = a.encounterId ? 'encounter' : 'activity';
      events.push({
        type: 'completion',
        completion: {
          schemaVersion: 1,
          id: completionId(kind, a.activityInstanceId),
          learnerId: a.learnerId,
          kind,
          instanceId: a.activityInstanceId,
          targetId: a.encounterId ?? a.activityId,
          outcome: 'completed',
          occurredAt: a.occurredAt,
        },
      });
    }
  });
  return events;
}

export interface TimelineInput extends ProcessorContext {
  attempts: readonly AttemptEvidence[];
}

export function runTimeline(input: TimelineInput): ReplayResult {
  return replayEvents(input, eventsFromAttempts(input.attempts));
}

/** Derived learner state from durable evidence. Recompute freely under a newer policy. */
export function deriveLearnerState(input: TimelineInput): LearnerState {
  return runTimeline(input).state;
}
