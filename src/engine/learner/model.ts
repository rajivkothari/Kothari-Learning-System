// Deterministic replay of attempt evidence into learner state.
//
// Mutable internally for speed, pure from the outside: the same graph, policy, and
// evidence in the same order always produce the same state, and nothing reads a
// clock or randomness. State can be exported to JSON and restored (derived cache).
//
// Design rules that make the anti-gaming invariants hold (see docs/LEARNING_MODEL.md):
// - Level gates count successes and treat failures as 0 independence credit, so an
//   added failure can only lower or delay a level, never raise or hasten it.
// - Exact repeats of solved items add no positive evidence (a failed repeat still
//   counts against accuracy: that is real information).
// - An item whose answer was demonstrated counts as "seen": a later success on that
//   same item is a replay, not new evidence. A new variant is legitimate evidence.
// - The review schedule moves only on qualifying successes.
import { z } from 'zod';

import { isAtMost } from '../evidence/assistance';
import type { AttemptEvidence } from '../evidence/attempt';
import { HOUR_MS, RETENTION_LEVELS, type MasteryPolicy, type RetentionLevel } from '../mastery/policy';
import { INITIAL_REVIEW, isReviewDue, reviewIntervalMs, type ReviewState } from '../review/review';
import type { SkillGraph } from '../skills/graph';
import { isAtLeast, maxLevel, type MasteryLevel } from '../skills/levels';
import { SkillIdSchema, type SkillDefinition, type SkillId } from '../skills/skill';
import { classifyWithView, type ExposureResult, type ExposureView } from './exposure';
import type { LearnerState, SkillDimensions, SkillState, TransferLevel } from './types';

const EPSILON = 1e-9;
/** Bump when the exported shape or replay semantics change. Invalidates derived caches. */
export const MODEL_STATE_VERSION = 2;

interface WindowEntry {
  success: boolean;
  credit: number;
}

interface SkillAcc {
  def: SkillDefinition;
  solved: Set<string>;
  answerShown: Set<string>;
  representations: Set<string>;
  window: WindowEntry[];
  scored: number;
  /** Greedy count of qualifying successes at least the retention gap apart, in replay order. */
  retentionCount: number;
  retentionLastAt: number | null;
  transferContexts: Set<string>;
  level: MasteryLevel;
  peak: MasteryLevel;
  unlocked: boolean;
  review: ReviewState;
  explanation: string[];
}

/** JSON-safe export of the model. Only meaningful with the same graph and policy. */
export interface ModelStateExport {
  version: number;
  asOf: number | null;
  skills: Record<
    SkillId,
    {
      solved: string[];
      answerShown: string[];
      representations: string[];
      window: WindowEntry[];
      scored: number;
      retentionCount: number;
      retentionLastAt: number | null;
      transferContexts: string[];
      level: MasteryLevel;
      peak: MasteryLevel;
      unlocked: boolean;
      review: ReviewState;
      explanation: string[];
    }
  >;
  solvedByActivity: Record<string, string[]>;
}

export interface LearnerModel {
  /** Apply one attempt. Returns its exposure class, computed before the attempt is applied. */
  applyAttempt(attempt: AttemptEvidence): ExposureResult;
  peak(skill: SkillId): MasteryLevel;
  reviewStage(skill: SkillId): number;
  /** Classify a candidate without changing state. */
  view: ExposureView;
  snapshot(opportunities?: Record<string, LearnerState['opportunities'][string]>): LearnerState;
  exportState(): ModelStateExport;
}

export function retentionLevelFor(separated: number): RetentionLevel {
  return RETENTION_LEVELS[Math.min(separated, RETENTION_LEVELS.length - 1)] ?? 'none';
}

/** Count successes separated by at least `gapMs` (greedy, in the given order). */
export function countSeparated(times: readonly number[], gapMs: number): number {
  let count = 0;
  let last = Number.NEGATIVE_INFINITY;
  for (const t of times) {
    if (t - last >= gapMs) {
      count += 1;
      last = t;
    }
  }
  return count;
}

function dimensionsOf(acc: SkillAcc, policy: MasteryPolicy): SkillDimensions {
  const scored = acc.window.length;
  let successes = 0;
  let creditSum = 0;
  for (const e of acc.window) {
    if (e.success) successes += 1;
    creditSum += e.credit;
  }
  const contexts = [...acc.transferContexts].sort();
  const transfer: TransferLevel =
    contexts.length === 0 ? 'none' : contexts.length >= policy.transferDemonstratedContexts ? 'demonstrated' : 'emerging';
  return {
    accuracy: { successes, scored, rate: scored === 0 ? 0 : successes / scored },
    independence: { rate: scored === 0 ? 0 : creditSum / scored },
    variety: { variants: acc.solved.size, representations: [...acc.representations].sort() },
    retention: { level: retentionLevelFor(acc.retentionCount), separatedSuccesses: acc.retentionCount },
    transfer: { level: transfer, contexts },
  };
}

function requiredRepresentations(def: SkillDefinition, policy: MasteryPolicy): number {
  return Math.min(policy.mastered.minRepresentations, Math.max(1, def.representations.length));
}

/** Level from current evidence, plus the gate that decides mastery (ignoring reconsolidation). */
function computeLevel(acc: SkillAcc, policy: MasteryPolicy): { level: MasteryLevel; masteryGatesMet: boolean; explanation: string[] } {
  if (!acc.unlocked) return { level: 'locked', masteryGatesMet: false, explanation: ['Prerequisites have not reached the required level yet.'] };
  if (acc.scored === 0) return { level: 'introduced', masteryGatesMet: false, explanation: ['No scored attempts yet.'] };

  const d = dimensionsOf(acc, policy);
  const p = policy.proficient;
  const missingProficient: string[] = [];
  if (d.accuracy.successes < p.minSuccesses) missingProficient.push(`needs ${p.minSuccesses - d.accuracy.successes} more recent success(es)`);
  if (d.accuracy.rate + EPSILON < p.minAccuracy) missingProficient.push(`recent accuracy ${d.accuracy.rate.toFixed(2)} below ${p.minAccuracy}`);
  if (d.independence.rate + EPSILON < p.minIndependence)
    missingProficient.push(`recent independence ${d.independence.rate.toFixed(2)} below ${p.minIndependence}`);
  if (d.variety.variants < p.minVariants) missingProficient.push(`needs ${p.minVariants - d.variety.variants} more distinct item(s)`);
  if (missingProficient.length > 0) return { level: 'practicing', masteryGatesMet: false, explanation: missingProficient };

  const m = policy.mastered;
  const missingMastered: string[] = [];
  if (d.variety.variants < m.minVariants) missingMastered.push(`needs ${m.minVariants - d.variety.variants} more distinct item(s)`);
  const reps = requiredRepresentations(acc.def, policy);
  if (d.variety.representations.length < reps)
    missingMastered.push(`needs success in ${reps - d.variety.representations.length} more representation(s)`);
  if (RETENTION_LEVELS.indexOf(d.retention.level) < RETENTION_LEVELS.indexOf(m.minRetention))
    missingMastered.push(`needs retention "${m.minRetention}" (successes separated in time), has "${d.retention.level}"`);
  if (missingMastered.length > 0) return { level: 'proficient', masteryGatesMet: false, explanation: missingMastered };

  if (acc.review.needsReconsolidation) {
    return { level: 'proficient', masteryGatesMet: true, explanation: ['A due review was missed. A later, time-separated success restores Mastered.'] };
  }
  return { level: 'mastered', masteryGatesMet: true, explanation: ['All mastery gates met.'] };
}

/**
 * Starting-capability assumption: skills a learner may PLAY before their prerequisites have
 * evidence (eventually from parent setup, an introductory calibration, or observed play). It
 * unlocks those skills only. It never raises a prerequisite's level and never counts as
 * evidence of anything.
 */
export const PlacementSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    /** Where the assumption came from. Only "assumption" exists today. */
    source: z.enum(['assumption', 'parentSetup', 'calibration', 'observed']),
    unlockedSkills: z.array(SkillIdSchema),
    note: z.string().optional(),
  })
  .strict();
export type Placement = Pick<z.infer<typeof PlacementSchema>, 'id' | 'unlockedSkills'>;

export function createLearnerModel(graph: SkillGraph, policy: MasteryPolicy, restored?: ModelStateExport, placement?: Placement): LearnerModel {
  const placed = new Set(placement?.unlockedSkills ?? []);
  if (restored && restored.version !== MODEL_STATE_VERSION) throw new Error(`Model state version ${restored.version} != ${MODEL_STATE_VERSION}`);
  const accs = new Map<SkillId, SkillAcc>();
  for (const id of graph.order) {
    const def = graph.skills.get(id);
    if (!def) continue;
    const r = restored?.skills[id];
    accs.set(id, {
      def,
      solved: new Set(r?.solved ?? []),
      answerShown: new Set(r?.answerShown ?? []),
      representations: new Set(r?.representations ?? []),
      window: r ? r.window.map((e) => ({ ...e })) : [],
      scored: r?.scored ?? 0,
      retentionCount: r?.retentionCount ?? 0,
      retentionLastAt: r?.retentionLastAt ?? null,
      transferContexts: new Set(r?.transferContexts ?? []),
      level: r?.level ?? 'introduced',
      peak: r?.peak ?? 'introduced',
      unlocked: r?.unlocked ?? true,
      review: r ? { ...r.review } : { ...INITIAL_REVIEW },
      explanation: r ? [...r.explanation] : [],
    });
  }
  const solvedByActivity = new Map<string, Set<string>>(Object.entries(restored?.solvedByActivity ?? {}).map(([k, v]) => [k, new Set(v)]));
  let asOf: number | null = restored?.asOf ?? null;
  const gapMs = policy.retentionGapHours * HOUR_MS;

  // Transitive dependents, so a change in one skill re-evaluates only what it can unlock.
  const dependentsCache = new Map<SkillId, Set<SkillId>>();
  const affectedBy = (id: SkillId): Set<SkillId> => {
    const cached = dependentsCache.get(id);
    if (cached) return cached;
    const out = new Set<SkillId>([id]);
    const stack = [id];
    while (stack.length > 0) {
      const next = stack.pop() as SkillId;
      for (const d of graph.dependentsOf(next)) {
        if (!out.has(d)) {
          out.add(d);
          stack.push(d);
        }
      }
    }
    dependentsCache.set(id, out);
    return out;
  };

  const seen = (acc: SkillAcc, sig: string) => acc.solved.has(sig) || acc.answerShown.has(sig);

  const view: ExposureView = {
    solved: (s, sig) => {
      const acc = accs.get(s);
      return acc ? seen(acc, sig) : false;
    },
    succeededTransferContext: (s, key) => accs.get(s)?.transferContexts.has(key) ?? false,
    peak: (s) => accs.get(s)?.peak ?? 'locked',
    reviewDue: (s, at) => {
      const acc = accs.get(s);
      return acc ? isReviewDue(acc.review, policy, at) : false;
    },
  };

  function recomputeLevels(at: number, only: Set<SkillId> | null): void {
    for (const id of graph.order) {
      if (only && !only.has(id)) continue;
      const acc = accs.get(id);
      if (!acc) continue;
      // Unlocking uses prerequisite PEAKS: once a prerequisite was achieved, a later dip does not re-lock.
      // A placement may unlock a skill for play without touching its prerequisites.
      acc.unlocked =
        placed.has(id) ||
        graph.prerequisitesOf(id).every((pre) => {
          const p = accs.get(pre);
          return p !== undefined && isAtLeast(p.peak, policy.prerequisiteMinLevel);
        });
      const { level, masteryGatesMet, explanation } = computeLevel(acc, policy);
      acc.level = level;
      acc.explanation = explanation;
      acc.peak = maxLevel(acc.peak, level);
      if (masteryGatesMet && acc.review.masteredAt === null) {
        acc.review = { ...acc.review, masteredAt: at, lastDemonstratedAt: at };
        acc.peak = 'mastered';
      }
    }
  }

  if (!restored) {
    // Locked/introduced initial levels need the graph applied once.
    recomputeLevels(0, null);
    for (const acc of accs.values()) acc.peak = acc.level;
  }

  function applyAttempt(a: AttemptEvidence): ExposureResult {
    const exposure = classifyWithView(view, a, a.occurredAt);
    const t = a.occurredAt;
    asOf = asOf === null ? t : Math.max(asOf, t);

    const credit = a.outcome === 'correct' ? policy.assistanceCredit[a.assistance] : 0;
    const success = a.outcome === 'correct' && credit > 0;
    const answerWasShown = a.outcome === 'correct' && credit === 0;
    const qualifies = success && isAtMost(a.assistance, policy.retentionMaxAssistance);
    const affected = new Set<SkillId>();

    for (const skill of a.skillIds) {
      const acc = accs.get(skill);
      if (!acc || a.outcome === 'abandoned') continue; // unknown skills are a content error; validators report them
      for (const s of affectedBy(skill)) affected.add(s);

      const exactRepeat = success && seen(acc, a.itemSignature);
      if (!exactRepeat) {
        acc.window.push({ success, credit: success ? credit : 0 });
        if (acc.window.length > policy.recentWindow) acc.window.shift();
        acc.scored += 1;
      }
      if (success && !exactRepeat) {
        acc.solved.add(a.itemSignature);
        acc.representations.add(a.representation);
      }
      if (answerWasShown) acc.answerShown.add(a.itemSignature);
      if (qualifies && !exactRepeat && (acc.retentionLastAt === null || t - acc.retentionLastAt >= gapMs)) {
        acc.retentionCount += 1;
        acc.retentionLastAt = t;
      }
      if (success && !exactRepeat && a.transfer.kind !== 'none' && isAtMost(a.assistance, policy.transferMaxAssistance)) {
        acc.transferContexts.add(a.transfer.contextKey);
      }

      const r = acc.review;
      if (r.masteredAt !== null && r.lastDemonstratedAt !== null && t >= r.masteredAt) {
        const due = t - r.lastDemonstratedAt >= reviewIntervalMs(policy, r.stage);
        if (qualifies && !exactRepeat) {
          let next: ReviewState = due ? { ...r, stage: r.stage + 1, lastDemonstratedAt: t } : r;
          if (next.needsReconsolidation && next.reconsolidationSince !== null && t - next.reconsolidationSince >= gapMs) {
            next = { ...next, needsReconsolidation: false, reconsolidationSince: null };
          }
          acc.review = next;
        } else if (due && (a.outcome === 'incorrect' || answerWasShown)) {
          acc.review = { ...r, needsReconsolidation: true, reconsolidationSince: t };
        }
      }
    }

    if (success) {
      const set = solvedByActivity.get(a.activityId) ?? new Set<string>();
      set.add(a.itemSignature);
      solvedByActivity.set(a.activityId, set);
    }

    if (affected.size > 0) recomputeLevels(t, affected);
    return exposure;
  }

  function snapshot(opportunities: LearnerState['opportunities'] = {}): LearnerState {
    const skills: Record<SkillId, SkillState> = {};
    for (const [id, acc] of accs) {
      skills[id] = {
        skillId: id,
        level: acc.level,
        peakLevel: acc.peak,
        unlocked: acc.unlocked,
        dimensions: dimensionsOf(acc, policy),
        review: { ...acc.review },
        solvedSignatures: [...acc.solved].sort(),
        explanation: [...acc.explanation],
      };
    }
    const byActivity: Record<string, readonly string[]> = {};
    for (const [id, set] of [...solvedByActivity].sort(([a], [b]) => (a < b ? -1 : 1))) byActivity[id] = [...set].sort();
    return { policyId: policy.id, asOf, skills, opportunities: { ...opportunities }, solvedByActivity: byActivity };
  }

  function exportState(): ModelStateExport {
    const skills: ModelStateExport['skills'] = {};
    for (const [id, acc] of accs) {
      skills[id] = {
        solved: [...acc.solved].sort(),
        answerShown: [...acc.answerShown].sort(),
        representations: [...acc.representations].sort(),
        window: acc.window.map((e) => ({ ...e })),
        scored: acc.scored,
        retentionCount: acc.retentionCount,
        retentionLastAt: acc.retentionLastAt,
        transferContexts: [...acc.transferContexts].sort(),
        level: acc.level,
        peak: acc.peak,
        unlocked: acc.unlocked,
        review: { ...acc.review },
        explanation: [...acc.explanation],
      };
    }
    const solved: Record<string, string[]> = {};
    for (const [id, set] of [...solvedByActivity].sort(([a], [b]) => (a < b ? -1 : 1))) solved[id] = [...set].sort();
    return { version: MODEL_STATE_VERSION, asOf, skills, solvedByActivity: solved };
  }

  return {
    applyAttempt,
    peak: (s) => accs.get(s)?.peak ?? 'locked',
    reviewStage: (s) => accs.get(s)?.review.stage ?? 0,
    view,
    snapshot,
    exportState,
  };
}
