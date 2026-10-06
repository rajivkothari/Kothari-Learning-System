import samplePack from '../../../content/fixtures/sample-pack.json';
import { createRegistry, defineGenerator, generateItem, generatorKey } from '../generation/generator';
import { BUILT_IN_GENERATORS } from '../generation/registry';
import { positionAfterMove } from '../generation/generators/positionAfterMove';
import { checkGeneratedItem, validateContentPack, type ValidationReport } from './validateContent';
import { z } from 'zod';

const clone = (): typeof samplePack => JSON.parse(JSON.stringify(samplePack));
const options = { registry: BUILT_IN_GENERATORS, budget: { seedsPerActivity: 25 }, budgetName: 'dev' as const };
const codes = (r: ValidationReport) => r.issues.map((i) => `${i.code} @ ${i.path}`);

describe('content validator', () => {
  it('locates schema errors', () => {
    const pack = clone() as unknown as { activities: { challenge: string }[] };
    pack.activities[1]!.challenge = 'bossFight';
    const r = validateContentPack(pack, options);
    expect(r.ok).toBe(false);
    expect(codes(r)).toEqual([expect.stringMatching(/^schema\.invalid_value @ activities\[1\]\.challenge$/)]);
  });

  it('reports graph cycles and missing prerequisites against the skill', () => {
    const pack = clone();
    pack.skills[0]!.prerequisites = ['math.linear.equations'];
    (pack.skills[1] as { prerequisites: string[] }).prerequisites = ['math.nope'];
    const c = codes(validateContentPack(pack, options));
    expect(c).toEqual(expect.arrayContaining([expect.stringMatching(/^graph\.cycle @ skills\[\d+\]$/), 'graph.missingPrerequisite @ skills[1]']));
  });

  it('reports broken references with their paths', () => {
    const pack = clone();
    pack.activities[0]!.skills = ['math.unknown'];
    pack.activities[1]!.scaffoldingPolicy = 'missing.policy';
    pack.activities[2]!.generator = { id: 'quantity.positionAfterMove', version: 9 };
    pack.encounters[0]!.stages = ['move-up.practice', 'nope'];
    pack.activities.push({ ...pack.activities[0]!, id: 'move-up.practice' });
    const c = codes(validateContentPack(pack, options));
    expect(c).toEqual(
      expect.arrayContaining([
        'ref.unknownSkill @ activities[0].skills[0]',
        'ref.unknownScaffoldingPolicy @ activities[1].scaffoldingPolicy',
        'ref.unknownGenerator @ activities[2].generator',
        'ref.stageChallenge @ encounters[0].stages[0]',
        'ref.unknownStage @ encounters[0].stages[1]',
        'ref.duplicateId @ activities[0]',
      ]),
    );
  });

  it('reports invalid generator params at the param path', () => {
    const pack = clone();
    (pack.activities[0]!.params as Record<string, unknown>).direction = 'sideways';
    expect(codes(validateContentPack(pack, options))).toContain('params.invalid @ activities[0].params.direction');
  });

  it('requires every misconception a generator can emit to be catalogued', () => {
    const pack = clone();
    pack.misconceptions = pack.misconceptions.filter((m) => m.id !== 'quantity.reversedDirection');
    const c = codes(validateContentPack(pack, options));
    expect(c).toContain('ref.uncataloguedMisconception @ activities[0].generator');
    expect(c.some((x) => x.startsWith('item.uncataloguedMisconception'))).toBe(true);
  });

  it('rejects encounter-only activities that no encounter uses', () => {
    const pack = clone();
    pack.encounters = [];
    expect(codes(validateContentPack(pack, options))).toContain('ref.orphanEncounterStage @ activities[4].challenge');
  });

  it('catches a generator whose answer disagrees with its independent solver', () => {
    const broken = defineGenerator({
      id: 'quantity.positionAfterMove',
      version: 1,
      concept: 'positionAfterMove',
      misconceptions: positionAfterMove.misconceptions,
      paramsSchema: z.object({}).passthrough(),
      optionCount: () => 4,
      generate: (_p, rng) => {
        const start = rng.int(1, 9);
        // Bug: says start + 2 but the prompt asks for start + 1, and repeats a value.
        return { prompt: { start, change: 1, direction: 'up', low: 1, high: 20 }, correct: start + 2, distractors: [{ value: start + 1 }, { value: start + 2 }, { value: start + 3 }, { value: start + 3 }] };
      },
      solve: (p) => (p.start as number) + 1,
    });
    const registry = createRegistry([broken, ...[...BUILT_IN_GENERATORS.values()].filter((g) => g.key !== generatorKey('quantity.positionAfterMove', 1))]);
    const c = codes(validateContentPack(clone(), { ...options, registry }));
    expect(c.some((x) => x.startsWith('item.answerMismatch @ activities[0] seed'))).toBe(true);
  });

  it('flags malformed items: duplicate values, two correct answers, a tagged correct answer, a bad signature', () => {
    const item = generateItem(positionAfterMove, samplePack.activities[0]!.params, 'x');
    const tampered = {
      ...item,
      signature: 'not-the-hash',
      response: {
        mode: 'choice' as const,
        options: [
          { id: 'a', value: 5, correct: true, misconception: 'quantity.countedOneExtra' },
          { id: 'b', value: 5, correct: true },
          { id: 'c', value: 7, correct: false },
        ],
      },
      correctOptionId: 'a',
    };
    const catalog = new Set(samplePack.misconceptions.map((m) => m.id));
    expect(checkGeneratedItem(tampered, positionAfterMove, catalog).map((p) => p.code)).toEqual(
      expect.arrayContaining(['item.duplicateOptionValue', 'item.correctCount', 'item.taggedCorrect', 'item.signature']),
    );
  });

  it('honours per-activity seed overrides for a budget', () => {
    const pack = clone();
    (pack.activities[0] as { validation?: unknown }).validation = { seeds: { dev: 3 } };
    const r = validateContentPack(pack, options);
    expect(r.samples.find((s) => s.activityId === pack.activities[0]!.id)?.seedsTried).toBe(3);
  });
});
