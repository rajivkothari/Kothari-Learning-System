// PROGRESSION VALUE: does a completion have meaningful progression value?
// This is NOT a currency amount. It is an input a future reward system may use.
//
// Value comes only from one-time events, each with a stable key:
//   firstClear      first successful clear of a Stretch activity or Mastery Encounter
//   levelPeak       a skill reaches a new highest level (Proficient, Mastered)
//   transferContext first qualifying success in a declared transfer context
//   reviewStage     a due spaced review passed, reaching a new review stage
// The completion's tier is the highest event tier, or "none".
//
// Wrong attempts are not an input. More help can only lower a tier. Every event is
// once-only, so repetition cannot farm value. These properties are tested in
// value.property.test.ts.
import { assistanceRank, type AssistanceLevel } from '../evidence/assistance';
import { exposureRank, type ExposureClass, type ExposureResult } from '../learner/exposure';
import type { LearnerState } from '../learner/types';
import { levelRank } from '../skills/levels';
import type { CompletionSummary } from './completion';

export const VALUE_TIERS = ['none', 'low', 'normal', 'high'] as const;
export type ValueTier = (typeof VALUE_TIERS)[number];
export type EventTier = Exclude<ValueTier, 'none'>;

export function tierRank(t: ValueTier): number {
  return VALUE_TIERS.indexOf(t);
}

export interface ValueEvent {
  key: string;
  kind: 'firstClear' | 'levelPeak' | 'transferContext' | 'reviewStage';
  tier: EventTier;
  skillId?: string;
  detail: string;
}

export interface ProgressionAssessment {
  instanceId: string;
  targetKey: string;
  success: boolean;
  /** Most novel exposure among the completion's items. */
  exposure: ExposureClass;
  tier: ValueTier;
  events: ValueEvent[];
  notes: string[];
}

/** More help never raises a tier. Demonstrated answers void completion-specific events. */
export function capByAssistance(tier: EventTier, assistance: AssistanceLevel): EventTier | null {
  if (assistance === 'demonstrated') return null;
  if (assistance === 'guided') return 'low';
  if (assistanceRank(assistance) >= assistanceRank('verbalHint')) {
    return tier === 'high' ? 'normal' : 'low';
  }
  return tier;
}

export function assessProgression(
  before: LearnerState,
  after: LearnerState,
  summary: CompletionSummary,
  exposures: readonly ExposureResult[],
): ProgressionAssessment {
  const events: ValueEvent[] = [];
  const notes: string[] = [];

  if (summary.success && !before.clearedTargets.includes(summary.targetKey) && after.clearedTargets.includes(summary.targetKey)) {
    const base: EventTier | null = summary.challenge === 'masteryEncounter' ? 'high' : summary.challenge === 'stretch' ? 'normal' : null;
    if (base) {
      const tier = capByAssistance(base, summary.assistance);
      if (tier) events.push({ key: `clear:${summary.targetKey}`, kind: 'firstClear', tier, detail: `First clear of ${summary.targetKey} (${summary.challenge})` });
    }
  }

  if (summary.transfer.kind !== 'none') {
    const key = summary.transfer.contextKey;
    if (!before.succeededContexts.includes(key) && after.succeededContexts.includes(key)) {
      events.push({
        key: `transfer:${key}`,
        kind: 'transferContext',
        tier: summary.transfer.kind === 'higherOrder' ? 'high' : 'normal',
        detail: `First success in ${summary.transfer.kind} context "${key}"`,
      });
    }
  }

  for (const [id, now] of Object.entries(after.skills)) {
    const prev = before.skills[id];
    if (!prev) continue;
    for (const level of ['proficient', 'mastered'] as const) {
      if (levelRank(prev.peakLevel) < levelRank(level) && levelRank(now.peakLevel) >= levelRank(level)) {
        events.push({
          key: `peak:${id}:${level}`,
          kind: 'levelPeak',
          tier: level === 'mastered' ? 'high' : 'normal',
          skillId: id,
          detail: `${id} reached ${level} for the first time`,
        });
      }
    }
    for (let stage = prev.review.stage + 1; stage <= now.review.stage; stage++) {
      events.push({ key: `review:${id}:${stage}`, kind: 'reviewStage', tier: 'low', skillId: id, detail: `${id} passed spaced review ${stage}` });
    }
  }

  const exposure = exposures.reduce<ExposureClass>(
    (best, e) => (exposureRank(e.exposure) > exposureRank(best) ? e.exposure : best),
    exposures[0]?.exposure ?? 'exactReplay',
  );
  if (!summary.success) notes.push('Not completed successfully: no completion value. Evidence was still recorded.');
  if (exposure === 'exactReplay') notes.push('Exact replay: no new evidence and no value.');
  if (exposure === 'easyVariation' && events.length === 0) notes.push("Mastered material, no review due: you've mastered this, so try something new.");
  if (summary.assistance === 'demonstrated') notes.push('The answer was demonstrated: completion events are not awarded.');

  const tier = events.reduce<ValueTier>((m, e) => (tierRank(e.tier) > tierRank(m) ? e.tier : m), 'none');
  return { instanceId: summary.instanceId, targetKey: summary.targetKey, success: summary.success, exposure, tier, events, notes };
}
