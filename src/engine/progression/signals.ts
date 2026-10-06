// IN-GAME PROGRESSION SIGNALS: how the game may visibly acknowledge continued
// learning (ranks, XP bars, unlocks). Separate from learning evidence (what the
// learner knows) and from progression opportunities (scarce accomplishments a
// future Quest Token system may consume).
//
// Signals carry classifications, not numbers. The future XP formula decides
// amounts, diminishing returns, and session caps. Nothing here is time- or
// login-based, so no daily-login pressure can be built from it.
import type { ExposureClass } from '../learner/exposure';
import type { CompletionSummary } from './completion';
import type { OpportunityUpgrade } from './opportunities';

/** How much routine-practice credit a completion deserves, before any formula. */
export type PracticeCredit = 'full' | 'reduced' | 'none';

export type GameProgressSignal =
  | { kind: 'practiceCredit'; completionId: string; targetKey: string; skillIds: string[]; credit: PracticeCredit; novelty: ExposureClass }
  | { kind: 'skillMilestone'; skillId: string; level: 'proficient' | 'mastered' }
  | { kind: 'missionComplete'; missionId: string; firstTime: boolean };

const NOVELTY_ORDER: ExposureClass[] = ['exactReplay', 'easyVariation', 'dueSpacedReview', 'developing', 'novelApplication', 'higherOrderApplication'];

export function mostNovel(exposures: readonly ExposureClass[]): ExposureClass {
  return exposures.reduce<ExposureClass>((best, e) => (NOVELTY_ORDER.indexOf(e) > NOVELTY_ORDER.indexOf(best) ? e : best), exposures[0] ?? 'exactReplay');
}

export function practiceCredit(summary: CompletionSummary, novelty: ExposureClass): PracticeCredit {
  if (!summary.success || summary.assistance === 'demonstrated') return 'none';
  if (novelty === 'exactReplay') return 'none';
  if (novelty === 'easyVariation') return 'reduced';
  return 'full';
}

export function gameSignalsFor(summary: CompletionSummary, exposures: readonly ExposureClass[], upgrades: readonly OpportunityUpgrade[], firstMissionCompletion: boolean): GameProgressSignal[] {
  const signals: GameProgressSignal[] = [];
  if (summary.kind === 'mission') {
    if (summary.success) signals.push({ kind: 'missionComplete', missionId: summary.targetId, firstTime: firstMissionCompletion });
  } else {
    const novelty = mostNovel(exposures);
    signals.push({ kind: 'practiceCredit', completionId: summary.completionId, targetKey: summary.targetKey, skillIds: summary.skillIds, credit: practiceCredit(summary, novelty), novelty });
  }
  for (const u of upgrades) {
    if (u.kind === 'levelPeak' && u.skillId) signals.push({ kind: 'skillMilestone', skillId: u.skillId, level: u.toTier === 'high' ? 'mastered' : 'proficient' });
  }
  return signals;
}
