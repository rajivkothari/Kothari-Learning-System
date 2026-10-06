// Deterministic item generation contract.
//
// - Generators are pure: (params, rng) -> draft. No clock, no Math.random, no I/O.
// - generateItem seeds the rng from template id + version + caller seed, so the
//   same seed and template version always give the same item.
// - The signature hashes the item's meaning (concept + prompt), not its option
//   order or seed, so two seeds that produce the same question share a signature.
// - Bumping a generator's version is required whenever its output for a given
//   seed could change. Old evidence keeps its old templateVersion.
import type { z } from 'zod';

import type { AnswerValue, GeneratedItem, Prompt, ResponseOption } from '../content/item';
import { hashValue } from '../random/hash';
import { createRng, type Rng } from '../random/rng';

export interface Distractor {
  value: AnswerValue;
  /** Likely misconception, when the wrong value has one plausible cause. */
  misconception?: string;
}

export interface GeneratorDraft {
  prompt: Prompt;
  correct: AnswerValue;
  /** Candidates in priority order. Duplicates and values equal to the answer are dropped. */
  distractors: Distractor[];
}

export interface ItemGenerator<P> {
  id: string;
  version: number;
  /** Theme-neutral instruction concept, e.g. "positionAfterMove". */
  concept: string;
  /** Every misconception tag this generator can emit. */
  misconceptions: readonly string[];
  paramsSchema: z.ZodType<P>;
  optionCount(params: P): number;
  generate(params: P, rng: Rng): GeneratorDraft;
  /** Independent solver used by validation to check the generated answer. */
  solve(prompt: Prompt): AnswerValue;
  /** Exact number of distinct items the params allow, when computable. */
  countVariants?(params: P): number;
}

export class ContentGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentGenerationError';
  }
}

export interface ParamIssue {
  path: (string | number)[];
  message: string;
}

/** Type-erased generator, safe to store in a registry and call with raw content params. */
export interface RegisteredGenerator {
  readonly id: string;
  readonly version: number;
  readonly key: string;
  readonly concept: string;
  readonly misconceptions: readonly string[];
  checkParams(raw: unknown): ParamIssue[];
  draft(raw: unknown, rng: Rng): { draft: GeneratorDraft; optionCount: number };
  solve(prompt: Prompt): AnswerValue;
  countVariants(raw: unknown): number | undefined;
}

export function generatorKey(id: string, version: number): string {
  return `${id}@${version}`;
}

export function defineGenerator<P>(g: ItemGenerator<P>): RegisteredGenerator {
  const parse = (raw: unknown): P => {
    const r = g.paramsSchema.safeParse(raw);
    if (!r.success) throw new ContentGenerationError(`Invalid params for ${generatorKey(g.id, g.version)}: ${r.error.message}`);
    return r.data;
  };
  return {
    id: g.id,
    version: g.version,
    key: generatorKey(g.id, g.version),
    concept: g.concept,
    misconceptions: g.misconceptions,
    checkParams: (raw) => {
      const r = g.paramsSchema.safeParse(raw);
      return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.map((p) => (typeof p === 'symbol' ? String(p) : p)), message: i.message }));
    },
    draft: (raw, rng) => {
      const params = parse(raw);
      return { draft: g.generate(params, rng), optionCount: g.optionCount(params) };
    },
    solve: (prompt) => g.solve(prompt),
    countVariants: (raw) => (g.countVariants ? g.countVariants(parse(raw)) : undefined),
  };
}

export type GeneratorRegistry = ReadonlyMap<string, RegisteredGenerator>;

export function createRegistry(generators: readonly RegisteredGenerator[]): GeneratorRegistry {
  const map = new Map<string, RegisteredGenerator>();
  for (const g of generators) {
    if (map.has(g.key)) throw new ContentGenerationError(`Duplicate generator ${g.key}`);
    map.set(g.key, g);
  }
  return map;
}

const OPTION_IDS = ['a', 'b', 'c', 'd', 'e', 'f'];

export function itemSignature(templateId: string, templateVersion: number, concept: string, prompt: Prompt): string {
  return hashValue({ t: templateId, v: templateVersion, c: concept, p: prompt });
}

/** Generate one item. Same generator version + params + seed => identical item. */
export function generateItem(generator: RegisteredGenerator, rawParams: unknown, seed: string): GeneratedItem {
  const rng = createRng(`${generator.key}:${seed}`);
  const { draft, optionCount } = generator.draft(rawParams, rng);

  const seen = new Set<string>([String(draft.correct)]);
  const chosen: Distractor[] = [];
  for (const d of draft.distractors) {
    const key = String(d.value);
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push(d);
    if (chosen.length === optionCount - 1) break;
  }

  const unordered: Omit<ResponseOption, 'id'>[] = [
    { value: draft.correct, correct: true },
    ...chosen.map((d) => (d.misconception ? { value: d.value, correct: false, misconception: d.misconception } : { value: d.value, correct: false })),
  ];
  const options: ResponseOption[] = rng.shuffle(unordered).map((o, i) => ({ id: OPTION_IDS[i] ?? `o${i}`, ...o }));
  const correctOption = options.find((o) => o.correct);
  if (!correctOption) throw new ContentGenerationError('Generated item has no correct option');

  const diagnosed = new Set<string>([String(draft.correct)]);
  const diagnostics: { value: AnswerValue; misconception: string }[] = [];
  for (const d of draft.distractors) {
    if (!d.misconception || diagnosed.has(String(d.value))) continue;
    diagnosed.add(String(d.value));
    diagnostics.push({ value: d.value, misconception: d.misconception });
  }

  return {
    schemaVersion: 1,
    templateId: generator.id,
    templateVersion: generator.version,
    seed,
    signature: itemSignature(generator.id, generator.version, generator.concept, draft.prompt),
    concept: generator.concept,
    prompt: draft.prompt,
    response: { mode: 'choice', options },
    correctOptionId: correctOption.id,
    diagnostics,
  };
}
