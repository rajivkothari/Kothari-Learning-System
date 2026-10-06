// Deterministic replay of attempt evidence into learner state.
//
// Mutable internally for speed, pure from the outside: the same graph, policy, and
// evidence always produce the same state, and nothing reads a clock or randomness.
//
// Design rules that make the anti-gaming invariants hold (see docs/LEARNING_MODEL.md):
// - Level gates count successes and treat failures as 0 independence credit, so an
//   added failure can only lower or delay a level, never raise or hasten it.
// - Exact repeats of solved items add no positive evidence (a failed repeat still
//   counts against accuracy: that is real information).
// - The review schedule moves only on qualifying successes.
import { isAtMost } from '../evidence/assistance';
import type { AttemptEvidence } from '../evidence/attempt';
import { HOUR_MS, RETENTION_LEVELS, type MasteryPolicy, type RetentionLevel } from '../mastery/policy';
import { INITIAL_REVIEW, isReviewDue, reviewIntervalMs, type ReviewState } from '../review/review';
import type { SkillGraph } from '../skills/graph';
import { isAtLeast, maxLevel, type MasteryLevel } from '../skills/levels';
import type { SkillDefinition, SkillId } from '../skills/skill';
import { classifyWithView, type ExposureResult, type ExposureView } from './exposure';
import type { LearnerState, SkillDimensions, SkillState, TransferLevel } from './types';

const EPSILON = 1e-9;

interface WindowEntry {
  success: boolean;
  credit: number;
}

interface SkillAcc {
  def: SkillDefinition;
  solved: Set<string>;
  representations: Set<string>;
  window: WindowEntry[];
  scored: number;
  qualifyingSuccessTimes: number[];
  transferContexts: Set<string>;
  level: MasteryLevel;
  peak: MasteryLevel;
  unlocked: boolean;
  review: ReviewState;
  explanation: string[];
}

export interface CompletionFacts {
  /** "activity:<id>" or "encounter:<id>". */
  targetKey: string;
  success: boolean;
  assistanceDemonstrated: boolean;
  transferContextQualified: string | null;
}

export interface LearnerModel {
  /** Apply one attempt. Returns its exposure class, computed before the attempt is applied. */
  applyAttempt(attempt: AttemptEvidence): ExposureResult;
  /** Record completion-level facts after its attempts were applied. */
  recordCompletion(facts: CompletionFacts): void;
  snapshot(): LearnerState;
}

export function retentionLevelFor(separated: number): RetentionLevel {
  return RETENTION_LEVELS[Math.min(separated, RETENTION_LEVELS.length - 1)] ?? 'none';
}

/** Count successes separated by at least `gapMs` (greedy, in time order). */
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
  const successes = acc.window.filter((e) => e.success).length;
  const creditSum = acc.window.reduce((s, e) => s + e.credit, 0);
  const separated = countSeparated(acc.qualifyingSuccessTimes, policy.retentionGapHours * HOUR_MS);
  const contexts = [...acc.transferContexts].sort();
  const transfer: TransferLevel =
    contexts.length === 0 ? 'none' : contexts.length >= policy.transferDemonstratedContexts ? 'demonstrated' : 'emerging';
  return {
    accuracy: { successes, scored, rate: scored === 0 ? 0 : successes / scored },
    independence: { rate: scored === 0 ? 0 : creditSum / scored },
    variety: { variants: acc.solved.size, representations: [...acc.representations].sort() },
    retention: { level: retentionLevelFor(separated), separatedSuccesses: separated },
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

export function createLearnerModel(graph: SkillGraph, policy: MasteryPolicy): LearnerModel {
  const accs = new Map<SkillId, SkillAcc>();
  for (const id of graph.order) {
    const def = graph.skills.get(id);
    if (!def) continue;
    accs.set(id, {
      def,
      solved: new Set(),
      representations: new Set(),
      window: [],
      scored: 0,
      qualifyingSuccessTimes: [],
      transferContexts: new Set(),
      level: 'introduced',
      peak: 'introduced',
      unlocked: true,
      review: { ...INITIAL_REVIEW },
      explanation: [],
    });
  }
  const cleared = new Set<string>();
  const contexts = new Set<string>();
  const solvedByActivity = new Map<string, Set<string>>();
  let asOf: number | null = null;
  const gapMs = policy.retentionGapHours * HOUR_MS;

  const view: ExposureView = {
    solved: (s, sig) => accs.get(s)?.solved.has(sig) ?? false,
    succeededTransferContext: (s, key) => accs.get(s)?.transferContexts.has(key) ?? false,
    peak: (s) => accs.get(s)?.peak ?? 'locked',
    reviewDue: (s, at) => {
      const acc = accs.get(s);
      return acc ? isReviewDue(acc.review, policy, at) : false;
    },
  };

  function recomputeLevels(at: number): void {
    for (const id of graph.order) {
      const acc = accs.get(id);
      if (!acc) continue;
      // Unlocking uses prerequisite PEAKS: once a prerequisite was achieved, a later dip does not re-lock.
      acc.unlocked = graph.prerequisitesOf(id).every((pre) => {
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

  // Locked/introduced initial levels need the graph applied once.
  recomputeLevels(0);
  for (const acc of accs.values()) acc.peak = acc.level;

  function applyAttempt(a: AttemptEvidence): ExposureResult {
    const exposure = classifyWithView(view, a, a.occurredAt);
    const t = a.occurredAt;
    asOf = asOf === null ? t : Math.max(asOf, t);

    const credit = a.outcome === 'correct' ? policy.assistanceCredit[a.assistance] : 0;
    const success = a.outcome === 'correct' && credit > 0;
    const qualifies = success && isAtMost(a.assistance, policy.retentionMaxAssistance);

    for (const skill of a.skillIds) {
      const acc = accs.get(skill);
      if (!acc || a.outcome === 'abandoned') continue; // unknown skills are a content error; validators report them

      const exactRepeat = success && acc.solved.has(a.itemSignature);
      if (!exactRepeat) {
        acc.window.push({ success, credit: success ? credit : 0 });
        if (acc.window.length > policy.recentWindow) acc.window.shift();
        acc.scored += 1;
      }
      if (success && !exactRepeat) {
        acc.solved.add(a.itemSignature);
        acc.representations.add(a.representation);
      }
      if (qualifies && !exactRepeat) acc.qualifyingSuccessTimes.push(t);
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
        } else if (due && (a.outcome === 'incorrect' || (a.outcome === 'correct' && credit === 0))) {
          acc.review = { ...r, needsReconsolidation: true, reconsolidationSince: t };
        }
      }
    }

    if (success) {
      const set = solvedByActivity.get(a.activityId) ?? new Set<string>();
      set.add(a.itemSignature);
      solvedByActivity.set(a.activityId, set);
    }

    recomputeLevels(t);
    return exposure;
  }

  function recordCompletion(f: CompletionFacts): void {
    if (f.success && !f.assistanceDemonstrated) cleared.add(f.targetKey);
    if (f.success && f.transferContextQualified) contexts.add(f.transferContextQualified);
  }

  function snapshot(): LearnerState {
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
    return {
      policyId: policy.id,
      asOf,
      skills,
      clearedTargets: [...cleared].sort(),
      succeededContexts: [...contexts].sort(),
      solvedByActivity: byActivity,
    };
  }

  return { applyAttempt, recordCompletion, snapshot };
}
