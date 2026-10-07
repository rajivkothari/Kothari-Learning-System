// GameRuntime: the non-rendering game service. Connects the pure mission runtime and
// learning processor to SQLite. No React, no rendering, no theme.
//
// Transaction boundary (one per command):
//   learning events (attempts, completion records)  +  announced progression upgrades
//   +  unlocks  +  mission checkpoint (state, revision, last command + its intents)
//   +  derived cache
// commit together or not at all. There is never "attempt saved but step lost" or
// "upgrade granted but attempt missing".
//
// Active mission (M4): `activate` loads the checkpoint ONCE and keeps it in memory. While
// a mission is active, `check` (is this answer right? which misconception?) and
// `currentView` are synchronous and touch no database. SQLite is the durable record and
// the recovery source, never the answer key. Commands still commit before the in-memory
// checkpoint advances, so the visible "authoritative" state is always a committed one.
//
// Optimistic vs authoritative:
//   - Touch feedback is the UI's job and never waits for this service.
//   - `check` evaluates a response purely and instantly, in memory. Evaluation is
//     deterministic, so the committed result cannot disagree with it.
//   - Progression upgrades, unlocks, step completion, and mission completion are
//     announced only from the committed result.
//
// Writes are serialized through one queue: expo-sqlite fails concurrent writers.
import {
  applyCommand,
  canonicalJson,
  checkResponse,
  createProcessor,
  describeMission,
  missionCompatibility,
  hashValue,
  replayEvents,
  resumeIntents,
  startMission,
  MODEL_STATE_VERSION,
  PROCESSOR_STATE_VERSION,
  type AnswerValue,
  type ContentPack,
  type GeneratorRegistry,
  type LearnerState,
  type MasteryPolicy,
  type MissionCommand,
  type MissionContext,
  type MissionDefinition,
  type MissionView,
  type OpportunityUpgrade,
  type Placement,
  type PresentationIntent,
  type Processor,
  type ProcessorContext,
  type ProcessorStateExport,
  type Response,
  type ResponseCheck,
  type SkillGraph,
} from '../engine';
import type { SqlDatabase } from '../persistence/driver';
import { migrate } from '../persistence/migrations';
import {
  appendLearningEvents,
  appendProgressionEvents,
  appendUnlocks,
  getCache,
  getLearner,
  getMissionInstance,
  getSettings,
  insertLearner,
  insertMissionInstance,
  listMissionInstances,
  appendMemory,
  listMemory,
  listProgressionEvents,
  listUnlocks,
  loadLearningEvents,
  maxEventSeq,
  putCache,
  putSetting,
  updateMissionInstance,
  type LearnerRecord,
  type MissionRow,
  type UnlockGrant,
} from '../persistence/store';
import { unlocksFor, type UnlockRule } from './unlocks';

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
  /** In-game unlock catalog supplied by the theme. Optional. */
  unlocks?: readonly UnlockRule[];
  /** Starting-capability assumption: skills playable before prerequisite evidence. Part of the cache key. */
  placement?: Placement;
}

export interface CommandOutcome {
  intents: PresentationIntent[];
  /** True when this command id was already committed; the stored intents are returned again. */
  duplicate: boolean;
  view: MissionView;
  /** Checkpoint revision after this command. Pass it back as `basedOn` with the next command. */
  revision: number;
}

export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

/** Every command may name the checkpoint revision it was built against. A mismatch is refused as stale. */
interface CommandBase {
  commandId: string;
  basedOn?: number;
}
export type SubmitInput = CommandBase & ({ optionId: string } | { value: AnswerValue });

export interface GameRuntime {
  createLearner(input: { id: string; themePack: string; displayName?: string | null }): Promise<LearnerRecord>;
  getLearner(id: string): Promise<LearnerRecord | null>;
  startMission(input: { learnerId: string; missionId: string; missionVersion?: number; instanceId: string }): Promise<CommandOutcome>;
  /** Latest active instance of a mission for a learner, if any (for "resume where you left off"). */
  findActiveMission(learnerId: string, missionId: string): Promise<string | null>;
  /** The learner's most recently started instance of a mission, active or completed. */
  latestMission(learnerId: string, missionId: string): Promise<{ id: string; status: 'active' | 'completed' | 'abandoned' } | null>;
  /**
   * Can the stored checkpoint still be shown with the installed content? False when content or a
   * generator changed under an in-progress instance (the item no longer regenerates identically).
   */
  missionCompatibility(instanceId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** End an active instance as "abandoned" (one completion record). Its evidence is kept as is. */
  abandonMission(instanceId: string, input: CommandBase): Promise<CommandOutcome>;
  resume(instanceId: string): Promise<CommandOutcome>;
  /** Load the checkpoint into memory. After this, `check` and `currentView` never touch the database. */
  activate(instanceId: string): Promise<{ view: MissionView; revision: number }>;
  /** Forget the in-memory checkpoint (leaving the mission screen). */
  deactivate(instanceId: string): void;
  /** Synchronous, in memory, no I/O. Throws if the mission is not active. */
  check(instanceId: string, response: Response): ResponseCheck;
  /** Synchronous, in memory, no I/O. Throws if the mission is not active. */
  currentView(instanceId: string): { view: MissionView; revision: number };
  view(instanceId: string): Promise<MissionView>;
  preview(instanceId: string, optionId: string): Promise<{ correct: boolean; misconception: string | null } | null>;
  submit(instanceId: string, input: SubmitInput): Promise<CommandOutcome>;
  useScaffold(instanceId: string, input: CommandBase & { scaffoldStepId: string }): Promise<CommandOutcome>;
  acknowledge(instanceId: string, input: CommandBase): Promise<CommandOutcome>;
  /** Answer the Concept Rescue practice example. Never evidence: the example's answer is taught. */
  rescueAnswer(instanceId: string, input: CommandBase & { value: AnswerValue }): Promise<CommandOutcome>;
  learnerState(learnerId: string): Promise<LearnerState>;
  progressionEvents(learnerId: string): Promise<OpportunityUpgrade[]>;
  unlocks(learnerId: string): Promise<UnlockGrant[]>;
  /**
   * World memory: what the game remembers about a learner's play that is not learning (a place
   * inspected, a tip shown). Once per learner and key, durable, append-only. Never evidence,
   * never value: the learning processor never reads it. Resolves true when the key is new.
   */
  remember(learnerId: string, key: string): Promise<boolean>;
  memories(learnerId: string): Promise<string[]>;
  /** Access and sensory settings. Stored per learner; never read by learning logic. */
  settings(learnerId: string): Promise<Record<string, string>>;
  putSetting(learnerId: string, key: string, value: string): Promise<void>;
  /** Full replay from the source of truth, ignoring any cache. */
  replayFromHistory(learnerId: string): Promise<{ state: LearnerState; exported: ProcessorStateExport }>;
  /** Drop and rebuild the derived cache from history. */
  rebuildCache(learnerId: string): Promise<void>;
  /** Forget in-memory processors and checkpoints (simulates a fresh app process for tests). */
  dropMemory(): void;
}

export function cacheKeyFor(content: Pick<RuntimeContent, 'policy' | 'pack' | 'missionsVersion' | 'placement'>): string {
  return hashValue({
    policy: content.policy,
    placement: content.placement ?? null,
    model: MODEL_STATE_VERSION,
    processor: PROCESSOR_STATE_VERSION,
    pack: `${content.pack.id}@${content.pack.version}`,
    missions: content.missionsVersion,
  });
}

export async function openGameRuntime(db: SqlDatabase, content: RuntimeContent, clock: Clock): Promise<GameRuntime> {
  await migrate(db, clock.now());
  const missionCtx: MissionContext = { pack: content.pack, registry: content.registry, missions: content.missions };
  const processorCtx: ProcessorContext = { graph: content.graph, policy: content.policy, pack: content.pack, missions: content.missions, ...(content.placement ? { placement: content.placement } : {}) };
  const cacheKey = cacheKeyFor(content);
  const unlockRules = content.unlocks ?? [];
  const processors = new Map<string, Processor>();
  /** Committed checkpoints of active missions. Updated only after a successful commit. */
  const active = new Map<string, MissionRow>();
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

  async function loadMission(instanceId: string): Promise<MissionRow> {
    const mem = active.get(instanceId);
    if (mem) return mem;
    const row = await getMissionInstance(db, instanceId);
    if (!row) throw new RuntimeError(`Unknown mission instance "${instanceId}"`);
    return row;
  }

  function activeRow(instanceId: string): MissionRow {
    const row = active.get(instanceId);
    if (!row) throw new RuntimeError(`Mission "${instanceId}" is not active. Call activate() first.`);
    return row;
  }

  async function execute(instanceId: string, basedOn: number | undefined, build: (at: number) => MissionCommand): Promise<CommandOutcome> {
    return serialized(async () => {
      const row = await loadMission(instanceId);
      const command = build(clock.now());
      if (row.lastCommandId === command.commandId) {
        return { intents: row.lastResult ?? [], duplicate: true, view: describeMission(missionCtx, row.state), revision: row.revision };
      }
      if (basedOn !== undefined && basedOn !== row.revision) {
        // Built against an older checkpoint (a second tap that raced the first). Nothing is written.
        return { intents: [{ type: 'RESPONSE_REJECTED', reason: 'stale' }], duplicate: false, view: describeMission(missionCtx, row.state), revision: row.revision };
      }
      const learnerId = row.state.learnerId;
      const result = applyCommand(missionCtx, row.state, command);
      const processor = await processorFor(learnerId);
      try {
        const assessments = result.events.map((e) => processor.apply(e)).filter((a) => a !== null);
        const upgrades = assessments.flatMap((a) => a.upgrades);
        const signals = assessments.flatMap((a) => a.signals);
        const outcome = await db.transaction(async (tx) => {
          await appendLearningEvents(tx, learnerId, result.events);
          const fresh = await appendProgressionEvents(tx, learnerId, upgrades);
          const unlocked = await appendUnlocks(tx, learnerId, unlocksFor(unlockRules, signals, command.at));
          const intents: PresentationIntent[] = [
            ...result.intents,
            ...fresh.map((upgrade): PresentationIntent => ({ type: 'PROGRESSION_UPGRADE', upgrade })),
            ...signals.map((signal): PresentationIntent => ({ type: 'GAME_PROGRESS', signal })),
            ...unlocked.map((u): PresentationIntent => ({ type: 'UNLOCK_GRANTED', unlockId: u.unlockId })),
          ];
          await updateMissionInstance(tx, { state: result.state, expectedRevision: row.revision, commandId: command.commandId, intents, now: command.at });
          await putCache(tx, learnerId, { cacheKey, throughSeq: await maxEventSeq(tx, learnerId), state: JSON.stringify(processor.exportState()) }, command.at);
          return { intents, duplicate: false, view: describeMission(missionCtx, result.state), revision: row.revision + 1 };
        });
        // Committed: only now does the in-memory checkpoint advance.
        if (active.has(instanceId)) active.set(instanceId, { state: result.state, lastCommandId: command.commandId, lastResult: outcome.intents, revision: outcome.revision });
        return outcome;
      } catch (e) {
        // In-memory state may include uncommitted events: reload both from the database next time.
        processors.delete(learnerId);
        active.delete(instanceId);
        throw e;
      }
    });
  }

  const responseOf = (input: SubmitInput) => ('optionId' in input ? { optionId: input.optionId } : { value: input.value });

  return {
    createLearner: (input) =>
      serialized(async () => {
        const record: LearnerRecord = { id: input.id, themePack: input.themePack, displayName: input.displayName ?? null, createdAt: clock.now() };
        await db.transaction((tx) => insertLearner(tx, record));
        return (await getLearner(db, input.id)) as LearnerRecord;
      }),

    getLearner: (id) => getLearner(db, id),

    startMission: (input) =>
      serialized(async () => {
        const existing = await getMissionInstance(db, input.instanceId);
        if (existing) {
          // An instance id belongs to one learner. Reusing it for another is a bug, never a resume.
          if (existing.state.learnerId !== input.learnerId) throw new RuntimeError(`Mission instance "${input.instanceId}" belongs to another learner`);
          return { intents: resumeIntents(missionCtx, existing.state), duplicate: true, view: describeMission(missionCtx, existing.state), revision: existing.revision };
        }
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
        return { intents: r.intents, duplicate: false, view: describeMission(missionCtx, r.state), revision: 1 };
      }),

    latestMission: async (learnerId, missionId) => {
      const latest = (await listMissionInstances(db, learnerId)).filter((r) => r.missionId === missionId).at(-1);
      if (!latest) return null;
      const status = latest.status === 'completed' || latest.status === 'abandoned' ? latest.status : 'active';
      return { id: latest.id, status };
    },

    findActiveMission: async (learnerId, missionId) => {
      const rows = await listMissionInstances(db, learnerId, 'active');
      return rows.filter((r) => r.missionId === missionId).at(-1)?.id ?? null;
    },

    resume: async (instanceId) => {
      const row = await loadMission(instanceId);
      return { intents: resumeIntents(missionCtx, row.state), duplicate: false, view: describeMission(missionCtx, row.state), revision: row.revision };
    },

    activate: (instanceId) =>
      serialized(async () => {
        const row = await getMissionInstance(db, instanceId);
        if (!row) throw new RuntimeError(`Unknown mission instance "${instanceId}"`);
        active.set(instanceId, row);
        await processorFor(row.state.learnerId); // warm, so the first commit does not replay history
        return { view: describeMission(missionCtx, row.state), revision: row.revision };
      }),

    deactivate: (instanceId) => {
      active.delete(instanceId);
    },

    check: (instanceId, response) => checkResponse(missionCtx, activeRow(instanceId).state, response),

    currentView: (instanceId) => {
      const row = activeRow(instanceId);
      return { view: describeMission(missionCtx, row.state), revision: row.revision };
    },

    view: async (instanceId) => describeMission(missionCtx, (await loadMission(instanceId)).state),

    preview: async (instanceId, optionId) => {
      const check = checkResponse(missionCtx, (await loadMission(instanceId)).state, { mode: 'choice', optionId });
      if (!check.ok) return null;
      return { correct: check.evaluation.correct, misconception: check.evaluation.correct ? null : (check.evaluation.misconception ?? null) };
    },

    submit: (instanceId, input) => execute(instanceId, input.basedOn, (at) => ({ type: 'submit', commandId: input.commandId, at, ...responseOf(input) }) as MissionCommand),
    useScaffold: (instanceId, input) => execute(instanceId, input.basedOn, (at) => ({ type: 'useScaffold', commandId: input.commandId, scaffoldStepId: input.scaffoldStepId, at })),
    acknowledge: (instanceId, input) => execute(instanceId, input.basedOn, (at) => ({ type: 'acknowledge', commandId: input.commandId, at })),
    missionCompatibility: async (instanceId) => missionCompatibility(missionCtx, (await loadMission(instanceId)).state),
    abandonMission: async (instanceId, input) => {
      const outcome = await execute(instanceId, input.basedOn, (at) => ({ type: 'abandon', commandId: input.commandId, at }));
      active.delete(instanceId);
      return outcome;
    },
    rescueAnswer: (instanceId, input) => execute(instanceId, input.basedOn, (at) => ({ type: 'rescueAnswer', commandId: input.commandId, value: input.value, at })),

    learnerState: async (learnerId) => (await serialized(() => processorFor(learnerId))).learnerState(),
    progressionEvents: (learnerId) => listProgressionEvents(db, learnerId),
    unlocks: (learnerId) => listUnlocks(db, learnerId),
    remember: (learnerId, key) =>
      serialized(async () => {
        if (!key || key.length > 200) throw new RuntimeError(`Invalid memory key "${key}"`);
        return db.transaction((tx) => appendMemory(tx, learnerId, key, clock.now()));
      }),
    memories: async (learnerId) => (await listMemory(db, learnerId)).map((m) => m.key),
    settings: (learnerId) => getSettings(db, learnerId),
    putSetting: (learnerId, key, value) => serialized(() => db.transaction((tx) => putSetting(tx, learnerId, key, value, clock.now()))),

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

    dropMemory: () => {
      processors.clear();
      active.clear();
    },
  };
}

/** Canonical comparison helper for cache-vs-replay checks. */
export function sameDerivedState(a: ProcessorStateExport, b: ProcessorStateExport): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
