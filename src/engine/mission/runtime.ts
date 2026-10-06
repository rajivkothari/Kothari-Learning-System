// Pure mission runtime: a reducer over serializable MissionState.
//
//   (context, state, command) -> { state, intents, events }
//
// - intents: presentation intents for the UI (what happened, not how it looks)
// - events:  durable learning events (attempts, completion records) to persist
//
// No clock, no randomness, no I/O. Time arrives on each command; every generated item
// comes from a seed derived from stable inputs (see itemSeed), so a resumed mission
// reproduces exactly the same item until that item is legitimately resolved.
//
// Checkpoints: every command produces a complete new state. Persisting that state in the
// same transaction as its events is the checkpoint; there is no in-between state to lose.
import type { AnswerValue, GeneratedItem, Response } from '../content/item';
import type { Activity, ContentPack, MasteryEncounter, ScaffoldingPolicy } from '../content/pack';
import { evaluateResponse, type Evaluation } from '../evaluation/evaluate';
import { AttemptEvidenceSchema, type AttemptEvidence } from '../evidence/attempt';
import { completionId, type CompletionRecord } from '../evidence/completion';
import { generateItem, generatorKey, type GeneratorRegistry } from '../generation/generator';
import type { LearningEvent } from '../progression/processor';
import { assistanceForProgress, misconceptionFocus, nextScaffold, shouldRegenerate, shouldRescue } from '../scaffolding/scaffolding';
import type { ActivityView, MissionView, PresentationIntent, RescueView, ScaffoldView } from './intents';
import { missionKey, type MissionDefinition, type MissionStep } from './schema';

export interface MissionContext {
  pack: ContentPack;
  registry: GeneratorRegistry;
  missions: readonly MissionDefinition[];
}

export interface ItemState {
  seed: string;
  signature: string;
  /** Increments when a fresh variant replaces an item (too many wrong tries). */
  generation: number;
  wrongTries: number;
  misconceptions: string[];
  /** Scaffold step ids used on this item, in order. */
  stepsGiven: string[];
  presentedAt: number;
  /** Concept Rescue on this item. The example is regenerated from its seed on resume. */
  rescue?: { seed: string; signature: string; status: 'active' | 'done'; focus: string | null } | null;
  /** A rescue was completed on the item this one replaced ("fresh" return): still guided help. */
  rescuedBefore?: boolean;
}

export interface MissionState {
  schemaVersion: 1;
  instanceId: string;
  missionId: string;
  missionVersion: number;
  learnerId: string;
  /** Stable base for every item seed in this mission instance. */
  seedBase: string;
  /** "abandoned": ended without finishing (content changed under it). Never resumed. */
  status: 'active' | 'completed' | 'abandoned';
  stepIndex: number;
  /** Encounter stage within the current step (0 for activity steps). */
  stageIndex: number;
  /** Items already resolved in the current activity unit. */
  itemIndex: number;
  item: ItemState | null;
  startedAt: number;
  completedAt: number | null;
  /** Last command applied. A repeated command id is ignored (idempotent). */
  lastCommandId: string | null;
}

export type MissionCommand =
  | { type: 'acknowledge'; commandId: string; at: number }
  | { type: 'submit'; commandId: string; optionId: string; at: number }
  | { type: 'submit'; commandId: string; value: AnswerValue; at: number }
  | { type: 'useScaffold'; commandId: string; scaffoldStepId: string; at: number }
  /** Answer on the Concept Rescue example. Instruction: not recorded as attempt evidence. */
  | { type: 'rescueAnswer'; commandId: string; value: AnswerValue; at: number }
  /**
   * End an active instance without finishing it (its content can no longer be regenerated).
   * Writes the mission's "abandoned" completion record. Needs no content, so it works on an
   * instance whose mission version or generator has gone.
   */
  | { type: 'abandon'; commandId: string; at: number };

export interface MissionResult {
  state: MissionState;
  intents: PresentationIntent[];
  events: LearningEvent[];
  /** True when the command id was already applied: nothing changed. */
  duplicate: boolean;
}

export class MissionRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissionRuntimeError';
  }
}

/** Seed contract. Changing this formula changes every resumed item: treat it as versioned. */
export function itemSeed(state: Pick<MissionState, 'seedBase' | 'missionId' | 'missionVersion'>, stepId: string, stageIndex: number, itemIndex: number, generation: number): string {
  return `${state.seedBase}|${missionKey(state.missionId, state.missionVersion)}|${stepId}|stage${stageIndex}|item${itemIndex}|gen${generation}`;
}

interface Unit {
  step: Extract<MissionStep, { kind: 'activity' | 'encounter' }>;
  activity: Activity;
  encounter: MasteryEncounter | null;
  policy: ScaffoldingPolicy;
  stageCount: number;
  itemCount: number;
}

function definition(ctx: MissionContext, state: Pick<MissionState, 'missionId' | 'missionVersion'>): MissionDefinition {
  const def = ctx.missions.find((m) => m.id === state.missionId && m.version === state.missionVersion);
  if (!def) throw new MissionRuntimeError(`Unknown mission ${missionKey(state.missionId, state.missionVersion)}`);
  return def;
}

function unitFor(ctx: MissionContext, step: MissionStep, stageIndex: number): Unit | null {
  if (step.kind === 'narrative') return null;
  const policyFor = (id: string) => {
    const p = ctx.pack.scaffoldingPolicies.find((x) => x.id === id);
    if (!p) throw new MissionRuntimeError(`Unknown scaffolding policy "${id}"`);
    return p;
  };
  if (step.kind === 'activity') {
    const activity = ctx.pack.activities.find((a) => a.id === step.activityId);
    if (!activity) throw new MissionRuntimeError(`Unknown activity "${step.activityId}"`);
    return { step, activity, encounter: null, policy: policyFor(activity.scaffoldingPolicy), stageCount: 1, itemCount: step.items };
  }
  const encounter = ctx.pack.encounters.find((e) => e.id === step.encounterId);
  if (!encounter) throw new MissionRuntimeError(`Unknown encounter "${step.encounterId}"`);
  const activity = ctx.pack.activities.find((a) => a.id === encounter.stages[stageIndex]);
  if (!activity) throw new MissionRuntimeError(`Unknown encounter stage ${stageIndex} of "${encounter.id}"`);
  return { step, activity, encounter, policy: policyFor(encounter.scaffoldingPolicy), stageCount: encounter.stages.length, itemCount: 1 };
}

function generate(ctx: MissionContext, unit: Unit, seed: string): GeneratedItem {
  const g = ctx.registry.get(generatorKey(unit.activity.generator.id, unit.activity.generator.version));
  if (!g) throw new MissionRuntimeError(`Unknown generator for activity "${unit.activity.id}"`);
  return generateItem(g, unit.activity.params, seed);
}

function newItem(ctx: MissionContext, state: MissionState, unit: Unit, generation: number, at: number): ItemState {
  const seed = itemSeed(state, unit.step.id, state.stageIndex, state.itemIndex, generation);
  const item = generate(ctx, unit, seed);
  return { seed, signature: item.signature, generation, wrongTries: 0, misconceptions: [], stepsGiven: [], presentedAt: at };
}

/** Re-derive the current generated item from its seed. Fails loudly if content changed underneath. */
export function currentItem(ctx: MissionContext, state: MissionState): GeneratedItem | null {
  if (!state.item) return null;
  const step = definition(ctx, state).steps[state.stepIndex];
  const unit = step ? unitFor(ctx, step, state.stageIndex) : null;
  if (!unit) return null;
  const item = generate(ctx, unit, state.item.seed);
  if (item.signature !== state.item.signature) {
    throw new MissionRuntimeError(`Content changed under an in-progress item (${state.item.seed}). Restart the step or migrate the mission.`);
  }
  return item;
}

function scaffoldView(policy: ScaffoldingPolicy, item: ItemState): ScaffoldView[] {
  if (item.rescue?.status === 'active') return []; // the rescue is the help right now
  const offer = nextScaffold(policy, { wrongTries: item.wrongTries, stepsGiven: item.stepsGiven });
  return offer ? [{ stepId: offer.stepId, kind: offer.kind, assistance: offer.assistance, mode: offer.mode }] : [];
}

function activityView(ctx: MissionContext, state: MissionState, unit: Unit, item: ItemState): ActivityView {
  const generated = currentItem(ctx, state) as GeneratedItem;
  const shown = item.stepsGiven.map((id) => {
    const s = unit.policy.steps.find((x) => x.id === id);
    return { stepId: id, kind: s?.kind ?? 'unknown', assistance: s?.assistance ?? 'clue' };
  });
  const demonstrated = shown.some((s) => s.assistance === 'demonstrated');
  return {
    stepId: unit.step.id,
    activityId: unit.activity.id,
    encounterId: unit.encounter?.id ?? null,
    stage: unit.encounter ? { index: state.stageIndex, count: unit.stageCount } : null,
    item: { index: state.itemIndex, count: unit.itemCount },
    challenge: unit.activity.challenge,
    cued: unit.activity.cued,
    representation: unit.activity.representation,
    concept: generated.concept,
    prompt: generated.prompt,
    answer: unit.activity.answer,
    options: unit.activity.answer.mode === 'choice' ? generated.response.options.map((o) => ({ id: o.id, value: o.value })) : [],
    wrongTries: item.wrongTries,
    scaffolds: {
      available: scaffoldView(unit.policy, item),
      shown,
      revealedOptionId: demonstrated && unit.activity.answer.mode === 'choice' ? generated.correctOptionId : null,
      revealedValue: demonstrated ? correctValue(generated) : null,
    },
    rescue: rescueView(ctx, unit, item),
    itemSignature: item.signature,
  };
}

const RESCUE_CANDIDATES = 24;

/**
 * Deterministic parallel example for a Concept Rescue: same generator and params, a different
 * item with a different answer. Prefers examples that keep the target's non-numeric givens
 * (same direction, same kind of move) and use the smallest numbers, so the idea is easy to see.
 */
function rescueExample(ctx: MissionContext, unit: Unit, item: ItemState, target: GeneratedItem): { seed: string; item: GeneratedItem } {
  const targetAnswer = String(correctValue(target));
  const sameShape = (g: GeneratedItem) => Object.entries(target.prompt).filter(([k, v]) => typeof v !== 'number' && g.prompt[k] === v).length;
  const size = (g: GeneratedItem) => Object.values(g.prompt).reduce<number>((n, v) => n + (typeof v === 'number' ? Math.abs(v) : 0), 0);
  let best: { seed: string; item: GeneratedItem } | null = null;
  for (let k = 0; k < RESCUE_CANDIDATES; k++) {
    const seed = `${item.seed}|rescue${k}`;
    const g = generate(ctx, unit, seed);
    if (g.signature === target.signature || String(correctValue(g)) === targetAnswer) continue;
    if (!best || sameShape(g) > sameShape(best.item) || (sameShape(g) === sameShape(best.item) && size(g) < size(best.item))) best = { seed, item: g };
  }
  if (!best) throw new MissionRuntimeError(`No parallel example differs from the target for activity "${unit.activity.id}"`);
  return best;
}

function rescueView(ctx: MissionContext, unit: Unit, item: ItemState): RescueView | null {
  if (!item.rescue) return null;
  const example = generate(ctx, unit, item.rescue.seed);
  if (example.signature !== item.rescue.signature) throw new MissionRuntimeError('Content changed under an in-progress Concept Rescue.');
  return {
    status: item.rescue.status,
    focus: item.rescue.focus,
    returnTo: unit.policy.conceptRescue?.returnTo ?? 'same',
    example: { concept: example.concept, prompt: example.prompt, answer: correctValue(example), signature: example.signature },
  };
}

function correctValue(item: GeneratedItem): AnswerValue {
  return (item.response.options.find((o) => o.correct) ?? item.response.options[0]!).value;
}

export type ResponseCheck =
  | { ok: true; evaluation: Extract<Evaluation, { valid: true }> }
  | { ok: false; reason: 'unknownOption' | 'invalidResponse' | 'outOfRange' | 'noActivity' };

/**
 * Evaluate a response against the CURRENT item of `state`, exactly as `applyCommand` will.
 * Pure and synchronous: a UI may call it on tap for immediate feedback, before any commit.
 */
export function checkResponse(ctx: MissionContext, state: MissionState, response: Response): ResponseCheck {
  if (state.status !== 'active' || !state.item) return { ok: false, reason: 'noActivity' };
  const step = definition(ctx, state).steps[state.stepIndex];
  const unit = step ? unitFor(ctx, step, state.stageIndex) : null;
  if (!unit) return { ok: false, reason: 'noActivity' };
  const answer = unit.activity.answer;
  if (answer.mode !== response.mode) return { ok: false, reason: 'invalidResponse' };
  if (response.mode === 'value' && answer.mode === 'value') {
    const v = response.value;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < answer.min || v > answer.max) return { ok: false, reason: 'outOfRange' };
  }
  const evaluation = evaluateResponse(currentItem(ctx, state) as GeneratedItem, response);
  return evaluation.valid ? { ok: true, evaluation } : { ok: false, reason: evaluation.reason };
}

/** Everything the UI needs to (re)draw the current state, e.g. after a restart. */
export function describeMission(ctx: MissionContext, state: MissionState): MissionView {
  const ended: MissionView = { instanceId: state.instanceId, missionId: state.missionId, missionVersion: state.missionVersion, status: state.status, step: null, activity: null, narrative: null };
  // An ended instance needs no content (its mission version may no longer be installed).
  if (state.status !== 'active') return ended;
  const def = definition(ctx, state);
  const step = def.steps[state.stepIndex];
  const base: MissionView = { ...ended, step: step ? { index: state.stepIndex, count: def.steps.length, id: step.id, kind: step.kind } : null };
  if (!step) return base;
  if (step.kind === 'narrative') return { ...base, narrative: { stepId: step.id, eventKey: step.eventKey } };
  const unit = unitFor(ctx, step, state.stageIndex) as Unit;
  return state.item ? { ...base, activity: activityView(ctx, state, unit, state.item) } : base;
}

/** Intents that re-present the current step, for a UI resuming a mission. */
export function resumeIntents(ctx: MissionContext, state: MissionState): PresentationIntent[] {
  const view = describeMission(ctx, state);
  if (view.narrative) return [{ type: 'SHOW_NARRATIVE', narrative: view.narrative }];
  if (view.activity) return [{ type: 'SHOW_ACTIVITY', activity: view.activity }];
  return state.status === 'completed' ? [{ type: 'MISSION_COMPLETE', missionId: state.missionId }] : [];
}

/** Enter the step at state.stepIndex (or complete the mission). Mutates `draft`. */
function enterStep(ctx: MissionContext, draft: MissionState, at: number, intents: PresentationIntent[], events: LearningEvent[]): void {
  const def = definition(ctx, draft);
  const step = def.steps[draft.stepIndex];
  if (!step) {
    draft.status = 'completed';
    draft.completedAt = at;
    draft.item = null;
    events.push({
      type: 'completion',
      completion: {
        schemaVersion: 1,
        id: completionId('mission', draft.instanceId),
        learnerId: draft.learnerId,
        kind: 'mission',
        instanceId: draft.instanceId,
        targetId: draft.missionId,
        missionInstanceId: draft.instanceId,
        outcome: 'completed',
        occurredAt: at,
      },
    });
    intents.push({ type: 'MISSION_COMPLETE', missionId: draft.missionId });
    return;
  }
  draft.stageIndex = 0;
  draft.itemIndex = 0;
  if (step.kind === 'narrative') {
    draft.item = null;
    intents.push({ type: 'SHOW_NARRATIVE', narrative: { stepId: step.id, eventKey: step.eventKey } });
    return;
  }
  const unit = unitFor(ctx, step, 0) as Unit;
  draft.item = newItem(ctx, draft, unit, 0, at);
  intents.push({ type: 'SHOW_ACTIVITY', activity: activityView(ctx, draft, unit, draft.item) });
}

export interface StartMissionInput {
  instanceId: string;
  missionId: string;
  missionVersion: number;
  learnerId: string;
  /** Defaults to the instance id. Must be stable for the life of the instance. */
  seedBase?: string;
  at: number;
}

export function startMission(ctx: MissionContext, input: StartMissionInput): MissionResult {
  const def = definition(ctx, input);
  const state: MissionState = {
    schemaVersion: 1,
    instanceId: input.instanceId,
    missionId: input.missionId,
    missionVersion: input.missionVersion,
    learnerId: input.learnerId,
    seedBase: input.seedBase ?? input.instanceId,
    status: 'active',
    stepIndex: 0,
    stageIndex: 0,
    itemIndex: 0,
    item: null,
    startedAt: input.at,
    completedAt: null,
    lastCommandId: null,
  };
  const intents: PresentationIntent[] = [{ type: 'MISSION_STARTED', missionId: def.id, stepCount: def.steps.length }];
  const events: LearningEvent[] = [];
  enterStep(ctx, state, input.at, intents, events);
  return { state, intents, events, duplicate: false };
}

/**
 * A new checkpoint positioned at a later step (and encounter stage), as if the steps before it
 * had been skipped. Emits no learning events: nothing was learned, so nothing is recorded.
 * For developer tooling and tests that need a known state. The item is generated exactly as
 * play would generate it at that position, so it stays deterministic for a given seedBase.
 */
export function startMissionAt(ctx: MissionContext, input: StartMissionInput, position: { stepIndex: number; stageIndex?: number }): MissionResult {
  const def = definition(ctx, input);
  const step = def.steps[position.stepIndex];
  if (!step) throw new MissionRuntimeError(`Mission ${missionKey(def.id, def.version)} has no step ${position.stepIndex}`);
  const stageIndex = position.stageIndex ?? 0;
  const started = startMission(ctx, input);
  const state: MissionState = { ...started.state, stepIndex: position.stepIndex, stageIndex: 0, itemIndex: 0, item: null };
  const intents: PresentationIntent[] = [{ type: 'MISSION_STARTED', missionId: def.id, stepCount: def.steps.length }];
  const events: LearningEvent[] = [];
  enterStep(ctx, state, input.at, intents, events);
  if (stageIndex > 0) {
    const unit = unitFor(ctx, step, stageIndex);
    if (!unit || step.kind !== 'encounter') throw new MissionRuntimeError(`Step "${step.id}" has no stage ${stageIndex}`);
    state.stageIndex = stageIndex;
    state.item = newItem(ctx, state, unit, 0, input.at);
    intents.splice(1, intents.length - 1, { type: 'SHOW_ACTIVITY', activity: activityView(ctx, state, unit, state.item) });
  }
  if (events.length > 0) throw new MissionRuntimeError('startMissionAt must not produce learning events');
  return { state, intents, events, duplicate: false };
}

function attemptFor(state: MissionState, unit: Unit, generated: GeneratedItem, item: ItemState, outcome: 'correct' | 'incorrect', wrongTriesBefore: number, at: number): AttemptEvidence {
  const instance = `${state.instanceId}:${unit.step.id}`;
  return AttemptEvidenceSchema.parse({
    schemaVersion: 1,
    id: `attempt:${instance}:stage${state.stageIndex}:item${state.itemIndex}:gen${item.generation}`,
    learnerId: state.learnerId,
    activityId: unit.activity.id,
    activityInstanceId: instance,
    ...(unit.encounter ? { encounterId: unit.encounter.id } : {}),
    missionInstanceId: state.instanceId,
    itemSignature: generated.signature,
    templateId: generated.templateId,
    templateVersion: generated.templateVersion,
    seed: item.seed,
    skillIds: unit.activity.skills,
    challenge: unit.activity.challenge,
    cued: unit.activity.cued,
    representation: unit.activity.representation,
    transfer: unit.encounter ? unit.encounter.transfer : unit.activity.transfer,
    outcome,
    assistance: assistanceForProgress(unit.policy, { wrongTries: wrongTriesBefore, stepsGiven: item.stepsGiven, rescued: Boolean(item.rescue?.status === 'done' || item.rescuedBefore) }),
    wrongTries: wrongTriesBefore,
    misconceptions: item.misconceptions,
    occurredAt: at,
    durationMs: Math.max(0, at - item.presentedAt),
    ...(item.rescue?.status === 'done' || item.rescuedBefore ? { conceptRescue: true } : {}),
  });
}

/**
 * Can this checkpoint still be shown with the current content? Regenerating the current item (and
 * any Concept Rescue example) must give the stored signatures. False when content or a generator
 * changed under an in-progress instance: the caller abandons it and starts a fresh one.
 */
export function missionCompatibility(ctx: MissionContext, state: MissionState): { ok: true } | { ok: false; reason: string } {
  if (state.status !== 'active') return { ok: true };
  try {
    describeMission(ctx, state);
    return { ok: true };
  } catch (e) {
    if (e instanceof MissionRuntimeError) return { ok: false, reason: e.message };
    throw e;
  }
}

function abandon(state: MissionState, command: { commandId: string; at: number }): MissionResult {
  const completion: CompletionRecord = {
    schemaVersion: 1,
    id: completionId('mission', state.instanceId),
    learnerId: state.learnerId,
    kind: 'mission',
    instanceId: state.instanceId,
    targetId: state.missionId,
    missionInstanceId: state.instanceId,
    outcome: 'abandoned',
    occurredAt: command.at,
  };
  // Attempts already recorded stay as they are. The open item simply ends: no attempt is invented.
  return { state: { ...state, status: 'abandoned', item: null, lastCommandId: command.commandId }, intents: [], events: [{ type: 'completion', completion }], duplicate: false };
}

export function applyCommand(ctx: MissionContext, state: MissionState, command: MissionCommand): MissionResult {
  if (state.lastCommandId === command.commandId) return { state, intents: [], events: [], duplicate: true };
  const reject = (reason: Extract<PresentationIntent, { type: 'RESPONSE_REJECTED' }>['reason']): MissionResult => ({
    state: { ...state, lastCommandId: command.commandId },
    intents: [{ type: 'RESPONSE_REJECTED', reason }],
    events: [],
    duplicate: false,
  });
  if (state.status === 'completed') return reject('missionComplete');
  if (state.status === 'abandoned') return reject('missionAbandoned');
  if (command.type === 'abandon') return abandon(state, command);

  const def = definition(ctx, state);
  const step = def.steps[state.stepIndex] as MissionStep;
  const draft: MissionState = {
    ...state,
    item: state.item ? { ...state.item, misconceptions: [...state.item.misconceptions], stepsGiven: [...state.item.stepsGiven], rescue: state.item.rescue ? { ...state.item.rescue } : state.item.rescue } : null,
    lastCommandId: command.commandId,
  };
  const intents: PresentationIntent[] = [];
  const events: LearningEvent[] = [];

  if (command.type === 'acknowledge') {
    if (step.kind !== 'narrative') return reject('notNarrative');
    intents.push({ type: 'STEP_COMPLETE', stepId: step.id, stepIndex: state.stepIndex });
    draft.stepIndex += 1;
    enterStep(ctx, draft, command.at, intents, events);
    return { state: draft, intents, events, duplicate: false };
  }

  const unit = unitFor(ctx, step, state.stageIndex);
  const item = draft.item;
  if (!unit || !item) return reject('noActivity');
  const generated = currentItem(ctx, state) as GeneratedItem;

  const rescueActive = item.rescue?.status === 'active';

  if (command.type === 'rescueAnswer') {
    if (!rescueActive || !item.rescue) return reject('noRescue');
    const example = generate(ctx, unit, item.rescue.seed);
    const correct = String(command.value) === String(correctValue(example));
    intents.push({ type: 'RESCUE_RESULT', stepId: unit.step.id, value: command.value, correct });
    if (!correct) return { state: draft, intents, events, duplicate: false };
    item.rescue = { ...item.rescue, status: 'done' };
    const returnTo = unit.policy.conceptRescue?.returnTo ?? 'same';
    intents.push({ type: 'CONCEPT_RESCUE_COMPLETE', stepId: unit.step.id, returnTo });
    if (returnTo === 'fresh') {
      // A fresh equivalent item: the miss history stays with the old one, the rescue goes along.
      events.push({ type: 'attempt', attempt: attemptFor(state, unit, generated, item, 'incorrect', item.wrongTries - 1, command.at) });
      draft.item = { ...newItem(ctx, draft, unit, item.generation + 1, command.at), rescuedBefore: true };
    }
    intents.push({ type: 'SHOW_ACTIVITY', activity: activityView(ctx, draft, unit, draft.item as ItemState) });
    return { state: draft, intents, events, duplicate: false };
  }
  if (rescueActive) return reject('rescueActive');

  if (command.type === 'useScaffold') {
    const offer = nextScaffold(unit.policy, { wrongTries: item.wrongTries, stepsGiven: item.stepsGiven });
    if (!offer || offer.stepId !== command.scaffoldStepId) return reject('scaffoldUnavailable');
    item.stepsGiven.push(offer.stepId);
    const demonstrated = offer.assistance === 'demonstrated';
    intents.push({
      type: 'SCAFFOLD_SHOWN',
      stepId: unit.step.id,
      scaffold: { stepId: offer.stepId, kind: offer.kind, assistance: offer.assistance, mode: offer.mode },
      revealedOptionId: demonstrated && unit.activity.answer.mode === 'choice' ? generated.correctOptionId : null,
      revealedValue: demonstrated ? correctValue(generated) : null,
      nextAvailable: scaffoldView(unit.policy, item),
    });
    return { state: draft, intents, events, duplicate: false };
  }

  // submit
  const response: Response = 'optionId' in command ? { mode: 'choice', optionId: command.optionId } : { mode: 'value', value: command.value };
  const check = checkResponse(ctx, state, response);
  if (!check.ok) return reject(check.reason);
  const evaluation = check.evaluation;
  intents.push({ type: 'WORLD_EVENT', stepId: unit.step.id, concept: generated.concept, prompt: generated.prompt, appliedValue: evaluation.value, correct: evaluation.correct });

  if (!evaluation.correct) {
    const misconception = evaluation.misconception ?? null;
    item.wrongTries += 1;
    if (misconception) item.misconceptions.push(misconception);
    if (shouldRescue(unit.policy, { wrongTries: item.wrongTries, stepsGiven: item.stepsGiven, rescueStarted: Boolean(item.rescue) })) {
      // Step away from this item and teach the idea underneath with a different example.
      const example = rescueExample(ctx, unit, item, generated);
      item.rescue = { seed: example.seed, signature: example.item.signature, status: 'active', focus: misconceptionFocus(item.misconceptions, item.wrongTries) };
      intents.unshift({
        type: 'RESPONSE_RESULT',
        stepId: unit.step.id,
        optionId: evaluation.optionId,
        value: evaluation.value,
        correct: false,
        misconception,
        feedbackKey: misconception ? `misconception:${misconception}` : 'incorrect.generic',
        retryAllowed: false,
      });
      intents.push({ type: 'CONCEPT_RESCUE', stepId: unit.step.id, rescue: rescueView(ctx, unit, item) as RescueView });
      return { state: draft, intents, events, duplicate: false };
    }
    const regenerate = shouldRegenerate(unit.policy, { wrongTries: item.wrongTries, stepsGiven: item.stepsGiven });
    intents.unshift({
      type: 'RESPONSE_RESULT',
      stepId: unit.step.id,
      optionId: evaluation.optionId,
      value: evaluation.value,
      correct: false,
      misconception,
      feedbackKey: misconception ? `misconception:${misconception}` : 'incorrect.generic',
      retryAllowed: !regenerate,
    });
    if (regenerate) {
      // Resolve this item as incorrect and present a fresh variant at the same difficulty.
      events.push({ type: 'attempt', attempt: attemptFor(state, unit, generated, item, 'incorrect', item.wrongTries - 1, command.at) });
      draft.item = newItem(ctx, draft, unit, item.generation + 1, command.at);
      intents.push({ type: 'ITEM_REGENERATED', stepId: unit.step.id, reason: 'tooManyWrongTries' });
      intents.push({ type: 'SHOW_ACTIVITY', activity: activityView(ctx, draft, unit, draft.item) });
    } else {
      const offer = scaffoldView(unit.policy, item).find((s) => s.mode === 'offer');
      if (offer) intents.push({ type: 'OFFER_SCAFFOLD', stepId: unit.step.id, scaffold: offer });
    }
    return { state: draft, intents, events, duplicate: false };
  }

  intents.unshift({ type: 'RESPONSE_RESULT', stepId: unit.step.id, optionId: evaluation.optionId, value: evaluation.value, correct: true, misconception: null, feedbackKey: 'correct', retryAllowed: false });
  events.push({ type: 'attempt', attempt: attemptFor(state, unit, generated, item, 'correct', item.wrongTries, command.at) });

  // Advance: next item, next encounter stage, or next step.
  draft.itemIndex += 1;
  if (draft.itemIndex < unit.itemCount) {
    draft.item = newItem(ctx, draft, unit, 0, command.at);
    intents.push({ type: 'SHOW_ACTIVITY', activity: activityView(ctx, draft, unit, draft.item) });
    return { state: draft, intents, events, duplicate: false };
  }
  if (unit.encounter && draft.stageIndex + 1 < unit.stageCount) {
    draft.stageIndex += 1;
    draft.itemIndex = 0;
    const next = unitFor(ctx, step, draft.stageIndex) as Unit;
    draft.item = newItem(ctx, draft, next, 0, command.at);
    intents.push({ type: 'SHOW_ACTIVITY', activity: activityView(ctx, draft, next, draft.item) });
    return { state: draft, intents, events, duplicate: false };
  }

  const kind = unit.encounter ? 'encounter' : 'activity';
  const instance = `${state.instanceId}:${unit.step.id}`;
  events.push({
    type: 'completion',
    completion: {
      schemaVersion: 1,
      id: completionId(kind, instance),
      learnerId: state.learnerId,
      kind,
      instanceId: instance,
      targetId: unit.encounter?.id ?? unit.activity.id,
      missionInstanceId: state.instanceId,
      outcome: 'completed',
      occurredAt: command.at,
    } satisfies CompletionRecord,
  });
  intents.push({ type: 'STEP_COMPLETE', stepId: unit.step.id, stepIndex: state.stepIndex });
  draft.stepIndex += 1;
  enterStep(ctx, draft, command.at, intents, events);
  return { state: draft, intents, events, duplicate: false };
}
