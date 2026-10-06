// PROGRESSION OPPORTUNITIES with tier upgrades.
//
// An opportunity is a stable key ("clear:activity:x", "transfer:ctx", "peak:skill:mastered",
// "review:skill:2", "mission:m") with a ceiling tier. Each completion yields
// DEMONSTRATIONS: an achieved tier for some opportunities, capped by the help used.
// The ledger keeps the best tier per key. A stronger demonstration UPGRADES it and only
// the increment is newly rewardable.
//
// Consequences, by construction:
// - Lifetime value of an opportunity = the strongest tier ever demonstrated for it.
// - An immediate strong demonstration receives the full value at once.
// - A weaker route first (help, failures) can never total more than the strongest
//   demonstration, because increments only fill the gap up to it.
// - Re-demonstrating at the same or lower tier is worth nothing (no farming).
// This is NOT currency. Token amounts, if any, are decided by a future reward system.
import { assistanceRank, type AssistanceLevel } from '../evidence/assistance';
import type { ExposureClass } from '../learner/exposure';
import { levelRank, type MasteryLevel } from '../skills/levels';
import type { CompletionSummary } from './completion';
import { tierRank, type EventTier, type ValueTier } from './tiers';

export type OpportunityKind = 'firstClear' | 'transferContext' | 'levelPeak' | 'reviewStage' | 'missionComplete';

export interface Demonstration {
  key: string;
  kind: OpportunityKind;
  /** Tier achieved by this demonstration (already capped by help). */
  tier: EventTier;
  /** Highest tier this opportunity can ever reach. */
  ceiling: EventTier;
  skillId?: string;
  detail: string;
}

export interface OpportunityUpgrade {
  key: string;
  kind: OpportunityKind;
  fromTier: ValueTier;
  toTier: EventTier;
  /** tierRank(toTier) - tierRank(fromTier). The only newly rewardable part. */
  increment: number;
  ceiling: EventTier;
  skillId?: string;
  detail: string;
  /** Completion that produced it. Stable, so the upgrade is idempotent: `${key}->${toTier}`. */
  sourceCompletionId: string;
  at: number;
}

export type OpportunityLedger = Map<string, EventTier>;

/** More help never raises a tier. Demonstrated answers void completion-specific demonstrations. */
export function capByAssistance(tier: EventTier, assistance: AssistanceLevel): EventTier | null {
  if (assistance === 'demonstrated') return null;
  if (assistance === 'guided') return 'low';
  if (assistanceRank(assistance) >= assistanceRank('verbalHint')) return tier === 'high' ? 'normal' : 'low';
  return tier;
}

export function upgradeId(u: Pick<OpportunityUpgrade, 'key' | 'toTier'>): string {
  return `${u.key}->${u.toTier}`;
}

/** Apply demonstrations to the ledger (mutates it). Returns upgrades in a deterministic order. */
export function applyDemonstrations(ledger: OpportunityLedger, demos: readonly Demonstration[], sourceCompletionId: string, at: number): OpportunityUpgrade[] {
  const upgrades: OpportunityUpgrade[] = [];
  for (const d of [...demos].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
    const tier = tierRank(d.tier) > tierRank(d.ceiling) ? d.ceiling : d.tier;
    const best: ValueTier = ledger.get(d.key) ?? 'none';
    if (tierRank(tier) <= tierRank(best)) continue;
    ledger.set(d.key, tier);
    upgrades.push({
      key: d.key,
      kind: d.kind,
      fromTier: best,
      toTier: tier,
      increment: tierRank(tier) - tierRank(best),
      ceiling: d.ceiling,
      ...(d.skillId ? { skillId: d.skillId } : {}),
      detail: d.detail,
      sourceCompletionId,
      at,
    });
  }
  return upgrades;
}

/** Sum of best tiers across all opportunities. Equals the sum of all increments ever granted. */
export function lifetimeValue(ledger: ReadonlyMap<string, EventTier> | Readonly<Record<string, EventTier>>): number {
  const tiers = ledger instanceof Map ? [...ledger.values()] : Object.values(ledger);
  return tiers.reduce((s, t) => s + tierRank(t), 0);
}

export interface DemonstrationInputs {
  summary: CompletionSummary;
  /** Exposure classes of the attempts that make up the completion. */
  exposures: readonly ExposureClass[];
  /** Whether each of those attempts was a credited success (correct, credit > 0), same order. */
  successes: readonly boolean[];
  /** Skills to check for level and review milestones: every skill in the graph. */
  milestoneSkills: readonly string[];
  peak(skill: string): MasteryLevel;
  reviewStage(skill: string): number;
  /** Ceiling for mission completion, from the mission definition. */
  missionCeiling?: EventTier;
}

export function demonstrationsFor(i: DemonstrationInputs): Demonstration[] {
  const { summary } = i;
  const out: Demonstration[] = [];

  // Learning milestones: fixed tiers, checked across ALL skills at every completion, so a
  // milestone reached indirectly (a prerequisite unlocking a dependent) is recognized at
  // the completion where it happened, not later by whatever touches that skill next.
  for (const skill of i.milestoneSkills) {
    if (levelRank(i.peak(skill)) >= levelRank('proficient')) {
      out.push({ key: `peak:${skill}:proficient`, kind: 'levelPeak', tier: 'normal', ceiling: 'normal', skillId: skill, detail: `${skill} reached proficient` });
    }
    if (i.peak(skill) === 'mastered') {
      out.push({ key: `peak:${skill}:mastered`, kind: 'levelPeak', tier: 'high', ceiling: 'high', skillId: skill, detail: `${skill} reached mastered` });
    }
    for (let stage = 1; stage <= i.reviewStage(skill); stage++) {
      out.push({ key: `review:${skill}:${stage}`, kind: 'reviewStage', tier: 'low', ceiling: 'low', skillId: skill, detail: `${skill} passed spaced review ${stage}` });
    }
  }

  if (!summary.success) return out;
  // A completion demonstrates something only through a credited success on an item not
  // already solved or shown. Wrong answers and replays alongside it add nothing.
  const freshSuccess = i.exposures.some((e, n) => e !== 'exactReplay' && i.successes[n] === true);
  if (!freshSuccess) return out;

  const capped = (ceiling: EventTier) => capByAssistance(ceiling, summary.assistance);

  if (summary.kind === 'mission') {
    const ceiling = i.missionCeiling ?? 'normal';
    const tier = capped(ceiling);
    if (tier) out.push({ key: summary.targetKey, kind: 'missionComplete', tier, ceiling, detail: `Completed ${summary.targetKey}` });
    return out;
  }

  const clearCeiling: EventTier | null = summary.challenge === 'masteryEncounter' ? 'high' : summary.challenge === 'stretch' ? 'normal' : null;
  if (clearCeiling) {
    const tier = capped(clearCeiling);
    if (tier) out.push({ key: `clear:${summary.targetKey}`, kind: 'firstClear', tier, ceiling: clearCeiling, detail: `Cleared ${summary.targetKey} (${summary.challenge})` });
  }
  if (summary.transfer.kind !== 'none') {
    const ceiling: EventTier = summary.transfer.kind === 'higherOrder' ? 'high' : 'normal';
    const tier = capped(ceiling);
    if (tier) {
      out.push({
        key: `transfer:${summary.transfer.contextKey}`,
        kind: 'transferContext',
        tier,
        ceiling,
        detail: `Success in ${summary.transfer.kind} context "${summary.transfer.contextKey}"`,
      });
    }
  }
  return out;
}
