// Content validator. Malformed content never reaches a learner: schema errors,
// broken references, graph problems, and generator output problems are all found
// here, with a path to where they occurred. Sampling depth is a budget, not a
// constant (content/engine-config.json: validationBudgets).
import type { z } from 'zod';

import { GeneratedItemSchema, type GeneratedItem } from '../content/item';
import { ContentPackSchema, type ContentPack } from '../content/pack';
import { generateItem, generatorKey, itemSignature, type GeneratorRegistry, type RegisteredGenerator } from '../generation/generator';
import type { BudgetName, ValidationBudget } from '../mastery/policy';
import { canonicalJson } from '../random/hash';
import { buildSkillGraph } from '../skills/graph';

export interface ContentIssue {
  severity: 'error' | 'warning';
  code: string;
  /** Location inside the pack, e.g. "activities[2].params.start". */
  path: string;
  message: string;
}

export interface ActivitySampleStats {
  activityId: string;
  seedsTried: number;
  distinctSignatures: number;
  declaredVariants: number | undefined;
}

export interface ValidationReport {
  ok: boolean;
  issues: ContentIssue[];
  samples: ActivitySampleStats[];
  pack: ContentPack | null;
}

export interface ValidateOptions {
  registry: GeneratorRegistry;
  budget: ValidationBudget;
  budgetName: BudgetName;
  /** Base for deterministic validation seeds. Failures print the seed. */
  seedBase?: string;
  /** Stop reporting sample failures for one activity after this many. */
  maxIssuesPerActivity?: number;
}

export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, part) => (typeof part === 'number' ? `${acc}[${part}]` : acc ? `${acc}.${String(part)}` : String(part)), '');
}

function fromZod(issues: readonly z.ZodError['issues'][number][], prefix: string): ContentIssue[] {
  return issues.map((i) => ({
    severity: 'error',
    code: `schema.${i.code}`,
    path: [prefix, formatPath(i.path)].filter(Boolean).join('.'),
    message: i.message,
  }));
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

/** Structural checks on one generated item. Returns problems, empty if fine. */
export function checkGeneratedItem(item: GeneratedItem, generator: RegisteredGenerator, catalog: ReadonlySet<string>): { code: string; message: string }[] {
  const problems: { code: string; message: string }[] = [];
  const parsed = GeneratedItemSchema.safeParse(item);
  if (!parsed.success) problems.push({ code: 'item.schema', message: parsed.error.message });

  const options = item.response.options;
  if (new Set(options.map((o) => o.id)).size !== options.length) problems.push({ code: 'item.duplicateOptionId', message: 'Duplicate option ids' });
  if (new Set(options.map((o) => String(o.value))).size !== options.length) problems.push({ code: 'item.duplicateOptionValue', message: 'Two options show the same value' });

  const correct = options.filter((o) => o.correct);
  if (correct.length !== 1) problems.push({ code: 'item.correctCount', message: `Expected exactly one correct option, found ${correct.length}` });
  if (correct[0] && correct[0].id !== item.correctOptionId) problems.push({ code: 'item.correctOptionId', message: 'correctOptionId does not point at the correct option' });
  if (correct.some((o) => o.misconception)) problems.push({ code: 'item.taggedCorrect', message: 'The correct option carries a misconception tag' });

  try {
    const solved = generator.solve(item.prompt);
    if (correct[0] && String(solved) !== String(correct[0].value)) {
      problems.push({ code: 'item.answerMismatch', message: `Independent solver says ${String(solved)}, item says ${String(correct[0].value)}` });
    }
  } catch (e) {
    problems.push({ code: 'item.unsolvable', message: e instanceof Error ? e.message : String(e) });
  }

  for (const o of options) {
    if (!o.misconception) continue;
    if (!generator.misconceptions.includes(o.misconception)) problems.push({ code: 'item.undeclaredMisconception', message: `Tag "${o.misconception}" is not declared by ${generator.key}` });
    if (!catalog.has(o.misconception)) problems.push({ code: 'item.uncataloguedMisconception', message: `Tag "${o.misconception}" is missing from the pack's misconception catalog` });
  }

  if (item.signature !== itemSignature(item.templateId, item.templateVersion, item.concept, item.prompt)) {
    problems.push({ code: 'item.signature', message: 'Signature does not match the item content' });
  }
  return problems;
}

export function validateContentPack(raw: unknown, options: ValidateOptions): ValidationReport {
  const issues: ContentIssue[] = [];
  const samples: ActivitySampleStats[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ severity: 'error', code, path, message });

  const parsed = ContentPackSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: fromZod(parsed.error.issues, ''), samples, pack: null };
  const pack = parsed.data;

  // Skill graph.
  const graph = buildSkillGraph(pack.skills);
  if (!graph.ok) {
    for (const g of graph.issues) {
      const id = 'skillId' in g ? g.skillId : (g.cycle[0] ?? '');
      const index = pack.skills.findIndex((s) => s.id === id);
      err(`graph.${g.code}`, `skills[${index}]`, g.message);
    }
  }
  const skillIds = new Set(pack.skills.map((s) => s.id));

  // Unique ids per collection.
  const collections = {
    misconceptions: pack.misconceptions.map((m) => m.id),
    scaffoldingPolicies: pack.scaffoldingPolicies.map((p) => p.id),
    activities: pack.activities.map((a) => a.id),
    encounters: pack.encounters.map((e) => e.id),
  };
  for (const [name, ids] of Object.entries(collections)) {
    for (const d of duplicates(ids)) err('ref.duplicateId', `${name}[${ids.indexOf(d)}]`, `Duplicate id "${d}" in ${name}`);
  }
  const policies = new Set(collections.scaffoldingPolicies);
  const catalog = new Set(collections.misconceptions);
  const stageIds = new Set(pack.encounters.flatMap((e) => e.stages));

  // Activities: references, params, generator output.
  pack.activities.forEach((activity, i) => {
    const at = `activities[${i}]`;
    activity.skills.forEach((s, j) => {
      if (!skillIds.has(s)) err('ref.unknownSkill', `${at}.skills[${j}]`, `Unknown skill "${s}"`);
    });
    if (!policies.has(activity.scaffoldingPolicy)) err('ref.unknownScaffoldingPolicy', `${at}.scaffoldingPolicy`, `Unknown scaffolding policy "${activity.scaffoldingPolicy}"`);
    if (activity.challenge === 'masteryEncounter' && !stageIds.has(activity.id)) {
      err('ref.orphanEncounterStage', `${at}.challenge`, 'Mastery Encounter activities must be used as a stage of an encounter');
    }

    const key = generatorKey(activity.generator.id, activity.generator.version);
    const generator = options.registry.get(key);
    if (!generator) {
      err('ref.unknownGenerator', `${at}.generator`, `Unknown generator ${key}`);
      return;
    }
    for (const tag of generator.misconceptions) {
      if (!catalog.has(tag)) err('ref.uncataloguedMisconception', `${at}.generator`, `${key} can emit "${tag}", which is missing from misconceptions[]`);
    }
    const paramIssues = generator.checkParams(activity.params);
    if (paramIssues.length > 0) {
      for (const p of paramIssues) err('params.invalid', [`${at}.params`, formatPath(p.path)].filter(Boolean).join('.'), p.message);
      return;
    }

    const seeds = activity.validation?.seeds?.[options.budgetName] ?? options.budget.seedsPerActivity;
    const maxIssues = options.maxIssuesPerActivity ?? 5;
    const signatures = new Set<string>();
    let reported = 0;
    for (let n = 0; n < seeds && reported < maxIssues; n++) {
      const seed = `${options.seedBase ?? 'validate'}:${activity.id}:${n}`;
      try {
        const item = generateItem(generator, activity.params, seed);
        signatures.add(item.signature);
        const problems = checkGeneratedItem(item, generator, catalog);
        const again = generateItem(generator, activity.params, seed);
        if (canonicalJson(again) !== canonicalJson(item)) problems.push({ code: 'item.nonDeterministic', message: 'Same seed produced a different item' });
        for (const p of problems) {
          err(p.code, `${at} seed "${seed}"`, p.message);
          reported++;
        }
      } catch (e) {
        err('item.generationFailed', `${at} seed "${seed}"`, e instanceof Error ? e.message : String(e));
        reported++;
      }
    }
    const declaredVariants = generator.countVariants(activity.params);
    if (declaredVariants !== undefined && signatures.size > declaredVariants) {
      err('item.variantCount', at, `Saw ${signatures.size} distinct items but the generator declares only ${declaredVariants}`);
    }
    samples.push({ activityId: activity.id, seedsTried: seeds, distinctSignatures: signatures.size, declaredVariants });
  });

  // Encounters.
  const activityById = new Map(pack.activities.map((a) => [a.id, a]));
  pack.encounters.forEach((encounter, i) => {
    const at = `encounters[${i}]`;
    encounter.stages.forEach((stage, j) => {
      const a = activityById.get(stage);
      if (!a) err('ref.unknownStage', `${at}.stages[${j}]`, `Unknown activity "${stage}"`);
      else if (a.challenge !== 'masteryEncounter') err('ref.stageChallenge', `${at}.stages[${j}]`, `Stage "${stage}" must have challenge "masteryEncounter"`);
    });
    encounter.requires.forEach((r, j) => {
      if (!skillIds.has(r.skill)) err('ref.unknownSkill', `${at}.requires[${j}].skill`, `Unknown skill "${r.skill}"`);
    });
    if (!policies.has(encounter.scaffoldingPolicy)) err('ref.unknownScaffoldingPolicy', `${at}.scaffoldingPolicy`, `Unknown scaffolding policy "${encounter.scaffoldingPolicy}"`);
  });

  return { ok: issues.every((i) => i.severity !== 'error'), issues, samples, pack };
}
