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
import type { GeneratedItem } from '../content/item';
import type { Activity, ContentPack, MasteryEncounter, ScaffoldingPolicy } from '../content/pack';
import { evaluateResponse } from '../evaluation/evaluate';
import { AttemptEvidenceSchema, type AttemptEvidence } from '../evidence/attempt';
import { completionId, type CompletionRecord } from '../evidence/completion';
import { generateItem, generatorKey, type GeneratorRegistry } from '../generation/generator';
import type { LearningEvent } from '../progression/processor';
import { assistanceForProgress, nextScaffold, shouldRegenerate } from '../scaffolding/scaffolding';
import type { ActivityView, MissionView, PresentationIntent, ScaffoldView } from './intents';
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
}

export interface MissionState {
  schemaVersion: 1;
  instanceId: string;
  missionId: string;
  missionVersion: number;
  learnerId: string;
  /** Stable base for every item seed in this mission instance. */
  seedBase: string;
  status: 'active' | 'completed';
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
  | { type: 'useScaffold'; commandId: string; scaffoldStepId: string; at: number };

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
    options: generated.response.options.map((o) => ({ id: o.id, value: o.value })),
    wrongTries: item.wrongTries,
    scaffolds: { available: scaffoldView(unit.policy, item), shown, revealedOptionId: demonstrated ? generated.correctOptionId : null },
    itemSignature: item.signature,
  };
}

/** Everything the UI needs to (re)draw the current state, e.g. after a restart. */
export function describeMission(ctx: MissionContext, state: MissionState): MissionView {
  const def = definition(ctx, state);
  const step = state.status === 'active' ? def.steps[state.stepIndex] : undefined;
  const base: MissionView = {
    instanceId: state.instanceId,
    missionId: state.missionId,
    missionVersion: state.missionVersion,
    status: state.status,
    step: step ? { index: state.stepIndex, count: def.steps.length, id: step.id, kind: step.kind } : null,
    activity: null,
    narrative: null,
  };
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
    assistance: assistanceForProgress(unit.policy, { wrongTries: wrongTriesBefore, stepsGiven: item.stepsGiven }),
    wrongTries: wrongTriesBefore,
    misconceptions: item.misconceptions,
    occurredAt: at,
    durationMs: Math.max(0, at - item.presentedAt),
  });
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

  const def = definition(ctx, state);
  const step = def.steps[state.stepIndex] as MissionStep;
  const draft: MissionState = { ...state, item: state.item ? { ...state.item, misconceptions: [...state.item.misconceptions], stepsGiven: [...state.item.stepsGiven] } : null, lastCommandId: command.commandId };
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

  if (command.type === 'useScaffold') {
    const offer = nextScaffold(unit.policy, { wrongTries: item.wrongTries, stepsGiven: item.stepsGiven });
    if (!offer || offer.stepId !== command.scaffoldStepId) return reject('scaffoldUnavailable');
    item.stepsGiven.push(offer.stepId);
    const revealed = offer.assistance === 'demonstrated' ? generated.correctOptionId : null;
    intents.push({
      type: 'SCAFFOLD_SHOWN',
      stepId: unit.step.id,
      scaffold: { stepId: offer.stepId, kind: offer.kind, assistance: offer.assistance, mode: offer.mode },
      revealedOptionId: revealed,
      nextAvailable: scaffoldView(unit.policy, item),
    });
    return { state: draft, intents, events, duplicate: false };
  }

  // submit
  const evaluation = evaluateResponse(generated, { mode: 'choice', optionId: command.optionId });
  if (!evaluation.valid) return reject('unknownOption');
  const chosen = generated.response.options.find((o) => o.id === command.optionId)!;
  intents.push({ type: 'WORLD_EVENT', stepId: unit.step.id, concept: generated.concept, prompt: generated.prompt, appliedValue: chosen.value, correct: evaluation.correct });

  if (!evaluation.correct) {
    const misconception = evaluation.misconception ?? null;
    item.wrongTries += 1;
    if (misconception) item.misconceptions.push(misconception);
    const regenerate = shouldRegenerate(unit.policy, { wrongTries: item.wrongTries, stepsGiven: item.stepsGiven });
    intents.unshift({
      type: 'RESPONSE_RESULT',
      stepId: unit.step.id,
      optionId: command.optionId,
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

  intents.unshift({ type: 'RESPONSE_RESULT', stepId: unit.step.id, optionId: command.optionId, correct: true, misconception: null, feedbackKey: 'correct', retryAllowed: false });
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
