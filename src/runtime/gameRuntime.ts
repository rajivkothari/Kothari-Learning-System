// GameRuntime: the non-rendering game service. Connects the pure mission runtime and
// learning processor to SQLite. No React, no rendering, no theme.
//
// Transaction boundary (one per command):
//   learning events (attempts, completion records)  +  announced progression upgrades
//   +  mission checkpoint (state, revision, last command + its intents)  +  derived cache
// commit together or not at all. There is never "attempt saved but step lost" or
// "upgrade granted but attempt missing".
//
// Optimistic vs authoritative:
//   - Touch feedback is the UI's job and never waits for this service.
//   - `preview` evaluates a choice purely and instantly (no commit), so the UI may show
//     right/wrong immediately. Evaluation is deterministic, so the committed result
//     cannot disagree with the preview.
//   - Progression upgrades, step completion, and mission completion are announced only
//     from the committed result.
//
// Writes are serialized through one queue: expo-sqlite fails concurrent writers.
import {
  applyCommand,
  createProcessor,
  currentItem,
  describeMission,
  evaluateResponse,
  hashValue,
  replayEvents,
  resumeIntents,
  startMission,
  canonicalJson,
  type ContentPack,
  type GeneratorRegistry,
  type LearnerState,
  type MasteryPolicy,
  type MissionCommand,
  type MissionContext,
  type MissionDefinition,
  type MissionView,
  type OpportunityUpgrade,
  type PresentationIntent,
  type Processor,
  type ProcessorContext,
  type SkillGraph,
  MODEL_STATE_VERSION,
  PROCESSOR_STATE_VERSION,
  type ProcessorStateExport,
} from '../engine';
import type { SqlDatabase } from '../persistence/driver';
import { migrate } from '../persistence/migrations';
import {
  appendLearningEvents,
  appendProgressionEvents,
  getCache,
  getLearner,
  getMissionInstance,
  insertLearner,
  insertMissionInstance,
  listProgressionEvents,
  loadLearningEvents,
  maxEventSeq,
  putCache,
  updateMissionInstance,
  type LearnerRecord,
} from '../persistence/store';

export interface Clock {
  now(): number;
}

export interface RuntimeContent {
  pack: ContentPack;
  missions: readonly MissionDefinition[];
  registry: GeneratorRegistry;
  graph: SkillGraph;
  policy: MasteryPolicy;
  /** Version label of the mission set, part of the cache key. */
  missionsVersion: string;
}

export interface CommandOutcome {
  intents: PresentationIntent[];
  /** True when this command id was already committed; the stored intents are returned again. */
  duplicate: boolean;
  view: MissionView;
}

export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

export interface GameRuntime {
  createLearner(input: { id: string; themePack: string; displayName?: string | null }): Promise<LearnerRecord>;
  startMission(input: { learnerId: string; missionId: string; missionVersion?: number; instanceId: string }): Promise<CommandOutcome>;
  resume(instanceId: string): Promise<CommandOutcome>;
  view(instanceId: string): Promise<MissionView>;
  preview(instanceId: string, optionId: string): Promise<{ correct: boolean; misconception: string | null } | null>;
  submit(instanceId: string, input: { commandId: string; optionId: string }): Promise<CommandOutcome>;
  useScaffold(instanceId: string, input: { commandId: string; scaffoldStepId: string }): Promise<CommandOutcome>;
  acknowledge(instanceId: string, input: { commandId: string }): Promise<CommandOutcome>;
  learnerState(learnerId: string): Promise<LearnerState>;
  progressionEvents(learnerId: string): Promise<OpportunityUpgrade[]>;
  /** Full replay from the source of truth, ignoring any cache. */
  replayFromHistory(learnerId: string): Promise<{ state: LearnerState; exported: ProcessorStateExport }>;
  /** Drop and rebuild the derived cache from history. */
  rebuildCache(learnerId: string): Promise<void>;
  /** Forget in-memory processors (simulates a fresh app process for tests). */
  dropMemory(): void;
}

export function cacheKeyFor(content: Pick<RuntimeContent, 'policy' | 'pack' | 'missionsVersion'>): string {
  return hashValue({
    policy: content.policy,
    model: MODEL_STATE_VERSION,
    processor: PROCESSOR_STATE_VERSION,
    pack: `${content.pack.id}@${content.pack.version}`,
    missions: content.missionsVersion,
  });
}

export async function openGameRuntime(db: SqlDatabase, content: RuntimeContent, clock: Clock): Promise<GameRuntime> {
  await migrate(db, clock.now());
  const missionCtx: MissionContext = { pack: content.pack, registry: content.registry, missions: content.missions };
  const processorCtx: ProcessorContext = { graph: content.graph, policy: content.policy, pack: content.pack, missions: content.missions };
  const cacheKey = cacheKeyFor(content);
  const processors = new Map<string, Processor>();
  let queue: Promise<unknown> = Promise.resolve();

  /** Serialize every write. A failed task does not poison the queue. */
  function serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  async function processorFor(learnerId: string): Promise<Processor> {
    const cached = processors.get(learnerId);
    if (cached) return cached;
    const row = await getCache(db, learnerId);
    let processor: Processor;
    let after = 0;
    try {
      if (!row || row.cacheKey !== cacheKey) throw new Error('missing or stale cache');
      processor = createProcessor(processorCtx, JSON.parse(row.state) as ProcessorStateExport);
      after = row.throughSeq;
    } catch {
      // Missing, stale, or unreadable cache: it is never authoritative, so rebuild from history.
      processor = createProcessor(processorCtx);
      after = 0;
    }
    for (const { event } of await loadLearningEvents(db, learnerId, after)) processor.apply(event);
    processors.set(learnerId, processor);
    return processor;
  }

  async function loadMission(instanceId: string) {
    const row = await getMissionInstance(db, instanceId);
    if (!row) throw new RuntimeError(`Unknown mission instance "${instanceId}"`);
    return row;
  }

  async function execute(instanceId: string, build: (at: number) => MissionCommand): Promise<CommandOutcome> {
    return serialized(async () => {
      const row = await loadMission(instanceId);
      const command = build(clock.now());
      if (row.lastCommandId === command.commandId) {
        return { intents: row.lastResult ?? [], duplicate: true, view: describeMission(missionCtx, row.state) };
      }
      const learnerId = row.state.learnerId;
      const result = applyCommand(missionCtx, row.state, command);
      const processor = await processorFor(learnerId);
      try {
        const assessments = result.events.map((e) => processor.apply(e)).filter((a) => a !== null);
        const upgrades = assessments.flatMap((a) => a.upgrades);
        const signals = assessments.flatMap((a) => a.signals);
        return await db.transaction(async (tx) => {
          await appendLearningEvents(tx, learnerId, result.events);
          const fresh = await appendProgressionEvents(tx, learnerId, upgrades);
          const intents: PresentationIntent[] = [
            ...result.intents,
            ...fresh.map((upgrade): PresentationIntent => ({ type: 'PROGRESSION_UPGRADE', upgrade })),
            ...signals.map((signal): PresentationIntent => ({ type: 'GAME_PROGRESS', signal })),
          ];
          await updateMissionInstance(tx, { state: result.state, expectedRevision: row.revision, commandId: command.commandId, intents, now: command.at });
          await putCache(tx, learnerId, { cacheKey, throughSeq: await maxEventSeq(tx, learnerId), state: JSON.stringify(processor.exportState()) }, command.at);
          return { intents, duplicate: false, view: describeMission(missionCtx, result.state) };
        });
      } catch (e) {
        processors.delete(learnerId); // in-memory state may include uncommitted events: reload next time
        throw e;
      }
    });
  }

  return {
    createLearner: (input) =>
      serialized(async () => {
        const record: LearnerRecord = { id: input.id, themePack: input.themePack, displayName: input.displayName ?? null, createdAt: clock.now() };
        await db.transaction((tx) => insertLearner(tx, record));
        return (await getLearner(db, input.id)) as LearnerRecord;
      }),

    startMission: (input) =>
      serialized(async () => {
        const existing = await getMissionInstance(db, input.instanceId);
        if (existing) return { intents: resumeIntents(missionCtx, existing.state), duplicate: true, view: describeMission(missionCtx, existing.state) };
        if (!(await getLearner(db, input.learnerId))) throw new RuntimeError(`Unknown learner "${input.learnerId}"`);
        const def = content.missions
          .filter((m) => m.id === input.missionId && (input.missionVersion === undefined || m.version === input.missionVersion))
          .sort((a, b) => b.version - a.version)[0];
        if (!def) throw new RuntimeError(`Unknown mission "${input.missionId}"`);
        const now = clock.now();
        const r = startMission(missionCtx, { instanceId: input.instanceId, missionId: def.id, missionVersion: def.version, learnerId: input.learnerId, at: now });
        await db.transaction(async (tx) => {
          await insertMissionInstance(tx, r.state, r.intents, now);
          await appendLearningEvents(tx, input.learnerId, r.events);
        });
        return { intents: r.intents, duplicate: false, view: describeMission(missionCtx, r.state) };
      }),

    resume: async (instanceId) => {
      const row = await loadMission(instanceId);
      return { intents: resumeIntents(missionCtx, row.state), duplicate: false, view: describeMission(missionCtx, row.state) };
    },

    view: async (instanceId) => describeMission(missionCtx, (await loadMission(instanceId)).state),

    preview: async (instanceId, optionId) => {
      const item = currentItem(missionCtx, (await loadMission(instanceId)).state);
      if (!item) return null;
      const e = evaluateResponse(item, { mode: 'choice', optionId });
      if (!e.valid) return null;
      return { correct: e.correct, misconception: e.correct ? null : (e.misconception ?? null) };
    },

    submit: (instanceId, input) => execute(instanceId, (at) => ({ type: 'submit', commandId: input.commandId, optionId: input.optionId, at })),
    useScaffold: (instanceId, input) => execute(instanceId, (at) => ({ type: 'useScaffold', commandId: input.commandId, scaffoldStepId: input.scaffoldStepId, at })),
    acknowledge: (instanceId, input) => execute(instanceId, (at) => ({ type: 'acknowledge', commandId: input.commandId, at })),

    learnerState: async (learnerId) => (await serialized(() => processorFor(learnerId))).learnerState(),
    progressionEvents: (learnerId) => listProgressionEvents(db, learnerId),

    replayFromHistory: async (learnerId) => {
      const events = (await loadLearningEvents(db, learnerId)).map((s) => s.event);
      const r = replayEvents(processorCtx, events);
      return { state: r.state, exported: r.processor.exportState() };
    },

    rebuildCache: (learnerId) =>
      serialized(async () => {
        processors.delete(learnerId);
        const events = await loadLearningEvents(db, learnerId);
        const r = replayEvents(processorCtx, events.map((s) => s.event));
        await db.transaction((tx) => putCache(tx, learnerId, { cacheKey, throughSeq: events.at(-1)?.seq ?? 0, state: JSON.stringify(r.processor.exportState()) }, clock.now()));
        processors.set(learnerId, r.processor);
      }),

    dropMemory: () => processors.clear(),
  };
}

/** Canonical comparison helper for cache-vs-replay checks. */
export function sameDerivedState(a: ProcessorStateExport, b: ProcessorStateExport): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
