// Is this activity or encounter eligible right now? Explainable reasons, not a
// scheduler: this never chooses what comes next.
import type { Activity, ContentPack, MasteryEncounter } from '../content/pack';
import type { GeneratorRegistry } from '../generation/generator';
import { generatorKey } from '../generation/generator';
import type { LearnerState } from '../learner/types';
import type { MasteryPolicy } from '../mastery/policy';
import { isReviewDue } from '../review/review';
import type { SkillGraph } from '../skills/graph';
import { isAtLeast, type MasteryLevel } from '../skills/levels';

export type IneligibilityReason =
  | { code: 'unknownSkill'; skillId: string; message: string }
  | { code: 'skillLocked'; skillId: string; unmetPrerequisites: string[]; message: string }
  | { code: 'belowStretchLevel'; skillId: string; level: MasteryLevel; required: MasteryLevel; message: string }
  | { code: 'encounterRequirement'; skillId: string; level: MasteryLevel; required: MasteryLevel; message: string }
  | { code: 'masteredNoReviewDue'; message: string }
  | { code: 'replayExhausted'; solved: number; variants: number; message: string }
  | { code: 'encounterStageOnly'; message: string }
  | { code: 'unknownContent'; message: string };

/** Reasons that still allow playing for fun (no progression value expected). */
const FOR_FUN_CODES = new Set<IneligibilityReason['code']>(['masteredNoReviewDue', 'replayExhausted']);

export interface Eligibility {
  eligible: boolean;
  /** True when the only reasons are "already mastered" or "nothing new left". */
  playableForFun: boolean;
  reasons: IneligibilityReason[];
}

export interface EligibilityContext {
  state: LearnerState;
  graph: SkillGraph;
  policy: MasteryPolicy;
  pack: ContentPack;
  registry: GeneratorRegistry;
  now: number;
}

function finish(reasons: IneligibilityReason[]): Eligibility {
  return {
    eligible: reasons.length === 0,
    playableForFun: reasons.length > 0 && reasons.every((r) => FOR_FUN_CODES.has(r.code)),
    reasons,
  };
}

function skillReasons(skillIds: readonly string[], ctx: EligibilityContext): IneligibilityReason[] {
  const reasons: IneligibilityReason[] = [];
  for (const id of skillIds) {
    const s = ctx.state.skills[id];
    if (!s) {
      reasons.push({ code: 'unknownSkill', skillId: id, message: `Unknown skill "${id}"` });
      continue;
    }
    if (!s.unlocked) {
      const unmet = ctx.graph
        .prerequisitesOf(id)
        .filter((p) => !isAtLeast(ctx.state.skills[p]?.peakLevel ?? 'locked', ctx.policy.prerequisiteMinLevel));
      reasons.push({
        code: 'skillLocked',
        skillId: id,
        unmetPrerequisites: unmet,
        message: `"${id}" is locked until ${unmet.join(', ')} reach ${ctx.policy.prerequisiteMinLevel}`,
      });
    }
  }
  return reasons;
}

export function checkActivityEligibility(activity: Activity, ctx: EligibilityContext): Eligibility {
  if (activity.challenge === 'masteryEncounter') {
    return finish([{ code: 'encounterStageOnly', message: `"${activity.id}" is an encounter stage; check the encounter instead` }]);
  }
  const reasons = skillReasons(activity.skills, ctx);
  if (reasons.length > 0) return finish(reasons);

  if (activity.challenge === 'stretch') {
    for (const id of activity.skills) {
      const level = ctx.state.skills[id]?.level ?? 'locked';
      if (!isAtLeast(level, ctx.policy.stretchMinLevel)) {
        reasons.push({
          code: 'belowStretchLevel',
          skillId: id,
          level,
          required: ctx.policy.stretchMinLevel,
          message: `Stretch on "${id}" needs ${ctx.policy.stretchMinLevel}; currently ${level}`,
        });
      }
    }
  }

  if (activity.challenge === 'practice' && activity.transfer.kind === 'none') {
    const allMastered = activity.skills.every((id) => ctx.state.skills[id]?.peakLevel === 'mastered');
    const anyDue = activity.skills.some((id) => {
      const s = ctx.state.skills[id];
      return s ? isReviewDue(s.review, ctx.policy, ctx.now) || s.review.needsReconsolidation : false;
    });
    if (allMastered && !anyDue) {
      reasons.push({ code: 'masteredNoReviewDue', message: "You've mastered this. Let's find something new to learn." });
    }
  }

  const generator = ctx.registry.get(generatorKey(activity.generator.id, activity.generator.version));
  if (!generator) {
    reasons.push({ code: 'unknownContent', message: `Unknown generator ${generatorKey(activity.generator.id, activity.generator.version)}` });
  } else {
    const variants = generator.countVariants(activity.params);
    const solved = ctx.state.solvedByActivity[activity.id]?.length ?? 0;
    if (variants !== undefined && solved >= variants) {
      reasons.push({ code: 'replayExhausted', solved, variants, message: `Every variant of "${activity.id}" has been solved` });
    }
  }
  return finish(reasons);
}

export function checkEncounterEligibility(encounter: MasteryEncounter, ctx: EligibilityContext): Eligibility {
  const stageActivities = encounter.stages.map((id) => ctx.pack.activities.find((a) => a.id === id));
  if (stageActivities.some((a) => a === undefined)) {
    return finish([{ code: 'unknownContent', message: `Encounter "${encounter.id}" references a missing stage` }]);
  }
  const skills = [...new Set(stageActivities.flatMap((a) => a?.skills ?? []))];
  const reasons = skillReasons(skills, ctx);
  for (const req of encounter.requires) {
    const level = ctx.state.skills[req.skill]?.level ?? 'locked';
    if (!isAtLeast(level, req.minLevel)) {
      reasons.push({
        code: 'encounterRequirement',
        skillId: req.skill,
        level,
        required: req.minLevel,
        message: `Encounter needs "${req.skill}" at ${req.minLevel}; currently ${level}`,
      });
    }
  }
  return finish(reasons);
}
