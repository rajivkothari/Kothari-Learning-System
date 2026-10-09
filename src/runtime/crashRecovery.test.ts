// Interruptions at meaningful boundaries. A fault is injected before one SQL statement
// inside a command's transaction (the process "dies" mid-commit). After reopening, the
// database must be coherent, and retrying the same command must converge on exactly the
// history a run without any crash produces.
import { canonicalJson, createProcessor, type MissionView, type PresentationIntent, type ProcessorStateExport } from '../engine';
import type { SqlValue } from '../persistence/driver';
import { loadLearningEvents } from '../persistence/store';
import type { FaultPlan } from '../persistence/testing/nodeDatabase';
import { CACHE_WRITE_EVERY, cacheKeyFor, type GameRuntime, type RuntimeContent } from './gameRuntime';
import { CONTENT, CORE_CONTENT, count, correctOption, fakeClock, open, rightAnswer, tempDir, wrongAnswer, wrongOption, type Opened } from './testing/harness';

const LEARNER = 'learner-a';
const ID = 'mission-instance-1';

/** The scripted session: misses, help, then correct answers to the end. */
async function act(rt: GameRuntime, n: number, view: MissionView) {
  const commandId = `c${n}`;
  if (view.narrative) return rt.acknowledge(ID, { commandId });
  if (n === 2) return rt.submit(ID, { commandId, optionId: await wrongOption(rt, ID, true) });
  if (n === 3) return rt.submit(ID, { commandId, optionId: await wrongOption(rt, ID, false) });
  if (n === 4) return rt.useScaffold(ID, { commandId, scaffoldStepId: view.activity!.scaffolds.available[0]!.stepId });
  return rt.submit(ID, { commandId, optionId: await correctOption(rt, ID) });
}

interface Fault {
  name: string;
  /** Matches the statement to fail; `nth` counts matching statements across the run. */
  match: (sql: string, params: readonly SqlValue[]) => boolean;
  nth?: number;
  /** Retry in the same process instead of reopening (exercises in-memory rollback). */
  sameProcess?: boolean;
}

const sqlHas = (text: string) => (sql: string) => sql.includes(text);
const firstParam = (prefix: string) => (sql: string, params: readonly SqlValue[]) => typeof params[0] === 'string' && params[0].startsWith(prefix);

const FAULTS: Fault[] = [
  { name: 'creating the mission checkpoint at start', match: sqlHas('INSERT OR IGNORE INTO mission_instances') },
  { name: 'checkpoint after the first item is generated', match: sqlHas('UPDATE mission_instances'), nth: 1 },
  { name: 'checkpoint after an incorrect response', match: sqlHas('UPDATE mission_instances'), nth: 2 },
  { name: 'checkpoint after scaffold use', match: sqlHas('UPDATE mission_instances'), nth: 4 },
  { name: 'writing the first attempt', match: (sql, p) => sql.includes('INTO learning_events') && firstParam('attempt:')(sql, p) },
  { name: 'writing a step completion record', match: (sql, p) => sql.includes('INTO learning_events') && firstParam('completion:activity:')(sql, p) },
  { name: 'writing an encounter completion record', match: (sql, p) => sql.includes('INTO learning_events') && firstParam('completion:encounter:')(sql, p) },
  { name: 'writing the mission completion record', match: (sql, p) => sql.includes('INTO learning_events') && firstParam('completion:mission:')(sql, p) },
  { name: 'announcing the first progression upgrade', match: sqlHas('INTO progression_events') },
  { name: 'announcing the mission upgrade', match: (sql, p) => sql.includes('INTO progression_events') && typeof p[0] === 'string' && p[0].includes('|mission:') },
  // Derived cache writes (M9.1: written when due, not on every command). In this session: the first
  // command after a rebuild from history, an upgrade, an encounter completion, the mission completion.
  { name: 'writing the derived cache: first command after a rebuild', match: sqlHas('INTO derived_cache'), nth: 1 },
  { name: 'writing the derived cache: an upgrade', match: sqlHas('INTO derived_cache'), nth: 2 },
  { name: 'writing the derived cache', match: sqlHas('INTO derived_cache'), nth: 3 },
  { name: 'writing the derived cache: the mission completion', match: sqlHas('INTO derived_cache'), nth: 4 },
  { name: 'granting the first unlock', match: sqlHas('INTO unlocks') },
  { name: 'granting the second unlock', match: sqlHas('INTO unlocks'), nth: 2 },
  { name: 'checkpoint after an incorrect response (same process)', match: sqlHas('UPDATE mission_instances'), nth: 2, sameProcess: true },
  { name: 'mission completion record (same process)', match: (sql, p) => sql.includes('INTO learning_events') && firstParam('completion:mission:')(sql, p), sameProcess: true },
];

function armed(fault: Fault): FaultPlan & { fired: () => boolean } {
  let seen = 0;
  let fired = false;
  return {
    failBefore: (sql, params) => {
      if (fired || !fault.match(sql, params)) return false;
      seen += 1;
      if (seen < (fault.nth ?? 1)) return false;
      fired = true;
      return true;
    },
    fired: () => fired,
  };
}

interface Outcome {
  events: string[];
  progression: string[];
  unlocks: string[];
  lastCommand: string | null;
}

async function snapshot(o: Opened): Promise<Outcome> {
  return {
    events: (await o.db.all<{ id: string }>('SELECT id FROM learning_events ORDER BY seq')).map((r) => r.id),
    progression: (await o.db.all<{ id: string }>('SELECT id FROM progression_events ORDER BY seq')).map((r) => r.id),
    unlocks: (await o.db.all<{ id: string }>('SELECT id FROM unlocks ORDER BY seq')).map((r) => r.id),
    lastCommand: (await o.db.get<{ last_command_id: string | null }>('SELECT last_command_id FROM mission_instances WHERE id = ?', [ID]))?.last_command_id ?? null,
  };
}

/** The stored cache, restored, plus the learner's events after it: what recovery computes. Null without a cache. */
async function cachePlusTail(o: Opened, learnerId: string, content: RuntimeContent): Promise<ProcessorStateExport | null> {
  const cache = await o.db.get<{ through_seq: number; state: string; cache_key: string }>('SELECT through_seq, state, cache_key FROM derived_cache WHERE learner_id = ?', [learnerId]);
  if (!cache || cache.cache_key !== cacheKeyFor(content)) return null;
  const ctx = { graph: content.graph, policy: content.policy, pack: content.pack, missions: content.missions, ...(content.placement ? { placement: content.placement } : {}) };
  const p = createProcessor(ctx, JSON.parse(cache.state) as ProcessorStateExport);
  for (const { event } of await loadLearningEvents(o.db, learnerId, cache.through_seq)) p.apply(event);
  return p.exportState();
}

/** Everything that must hold after any reopen, crash or not. */
async function expectCoherent(o: Opened, learnerId = LEARNER, content: RuntimeContent = CONTENT) {
  // Derived state equals a replay of the source of truth.
  const replay = await o.rt.replayFromHistory(learnerId);
  expect(canonicalJson(await o.rt.learnerState(learnerId))).toBe(canonicalJson(replay.state));
  // The cache plus the tail after it (what recovery computes) equals the full replay; the tail is bounded.
  const recovered = await cachePlusTail(o, learnerId, content);
  if (recovered) expect(canonicalJson(recovered)).toBe(canonicalJson(replay.exported));
  // A cache under another key (another policy or content) is ignored by recovery and rebuilt.
  const cache = await o.db.get<{ through_seq: number; state: string }>('SELECT through_seq, state FROM derived_cache WHERE learner_id = ? AND cache_key = ?', [learnerId, cacheKeyFor(content)]);
  if (cache) expect(await count(o.db, 'SELECT COUNT(*) AS n FROM learning_events WHERE learner_id = ? AND seq > ?', [learnerId, cache.through_seq])).toBeLessThan(CACHE_WRITE_EVERY);
  const maxSeq = await count(o.db, 'SELECT COALESCE(MAX(seq), 0) AS n FROM learning_events WHERE learner_id = ?', [learnerId]);
  if (cache && cache.through_seq === maxSeq) expect(canonicalJson(JSON.parse(cache.state))).toBe(canonicalJson(replay.exported));
  // Every announced upgrade has its evidence: its source completion record exists.
  const orphans = await count(
    o.db,
    'SELECT COUNT(*) AS n FROM progression_events p WHERE NOT EXISTS (SELECT 1 FROM learning_events e WHERE e.id = p.source_completion_id)',
  );
  expect(orphans).toBe(0);
  // An unlock never exists without the mission completion that earned it.
  const unlocks = await count(o.db, 'SELECT COUNT(*) AS n FROM unlocks');
  const completions = await count(o.db, "SELECT COUNT(*) AS n FROM learning_events WHERE id LIKE 'completion:mission:%'");
  expect(unlocks === 0 || completions > 0).toBe(true);
  // The checkpoint is readable and points at a real step (or is complete).
  if (await count(o.db, 'SELECT COUNT(*) AS n FROM mission_instances WHERE id = ?', [ID])) {
    const view = await o.rt.view(ID);
    expect(view.status === 'completed' || view.step !== null).toBe(true);
  }
}

async function play(file: string, fault?: Fault): Promise<{ outcome: Outcome; crashed: boolean }> {
  const clock = fakeClock();
  const plan = fault ? armed(fault) : undefined;
  let o = await open(file, clock, plan);
  await o.rt.createLearner({ id: LEARNER, themePack: 'theme.quantity' });
  let crashed = false;

  const recover = async (e: unknown) => {
    expect(String(e)).toMatch(/Injected fault/);
    crashed = true;
    if (fault?.sameProcess) return; // the runtime must recover in place
    await o.db.close();
    o = await open(file, clock); // fresh process, no faults
    await expectCoherent(o);
  };

  for (;;) {
    try {
      await o.rt.startMission({ learnerId: LEARNER, missionId: 'positions-and-loads', instanceId: ID });
      break;
    } catch (e) {
      await recover(e);
      expect(await count(o.db, 'SELECT COUNT(*) AS n FROM mission_instances')).toBe(0);
    }
  }

  for (let n = 1; n < 60; n++) {
    const view = await o.rt.view(ID);
    if (view.status === 'completed') break;
    const before = await snapshot(o);
    try {
      await act(o.rt, n, view);
    } catch (e) {
      await recover(e);
      // Nothing from the failed command survived: no partial state.
      expect(await snapshot(o)).toEqual(before);
      // The checkpoint still shows the same item.
      expect(canonicalJson(await o.rt.view(ID))).toBe(canonicalJson(view));
      await act(o.rt, n, view); // retry the very same command id
    }
  }

  await expectCoherent(o);
  const outcome = await snapshot(o);
  await o.db.close();
  return { outcome, crashed };
}

describe('crash and restart at command boundaries', () => {
  let baseline: Outcome;

  beforeAll(async () => {
    const tmp = tempDir();
    baseline = (await play(tmp.file)).outcome;
    tmp.cleanup();
    expect(baseline.events.filter((e) => e.startsWith('completion:mission:'))).toHaveLength(1);
    expect(baseline.progression.length).toBeGreaterThan(0);
    expect(baseline.unlocks).toEqual(['learner-a|test.rank-1', 'learner-a|test.panel']);
  });

  it.each(FAULTS.map((f) => [f.name, f] as const))('%s', async (_name, fault) => {
    const tmp = tempDir();
    const { outcome, crashed } = await play(tmp.file, fault);
    tmp.cleanup();
    expect(crashed).toBe(true);
    expect(outcome).toEqual(baseline);
  });

  it('world memory: a crash while remembering writes nothing and touches no learning record', async () => {
    const tmp = tempDir();
    const clock = fakeClock();
    let o = await open(tmp.file, clock, { failBefore: sqlHas('INTO world_memory') });
    await o.rt.createLearner({ id: LEARNER, themePack: 'theme.quantity' });
    await o.rt.startMission({ learnerId: LEARNER, missionId: 'positions-and-loads', instanceId: ID });
    const before = await snapshot(o);
    await expect(o.rt.remember(LEARNER, 'theme.discovery.room-1')).rejects.toThrow(/Injected fault/);
    await o.db.close();
    o = await open(tmp.file, clock);
    expect(await snapshot(o)).toEqual(before);
    expect(await o.rt.memories(LEARNER)).toEqual([]);
    expect(await o.rt.remember(LEARNER, 'theme.discovery.room-1')).toBe(true);
    expect(await snapshot(o)).toEqual(before); // world memory is never learning
    await expectCoherent(o);
    await o.db.close();
    tmp.cleanup();
  });

  it('a crash after commit (result never delivered) is answered from the stored result on retry', async () => {
    const tmp = tempDir();
    const clock = fakeClock();
    let o = await open(tmp.file, clock);
    await o.rt.createLearner({ id: LEARNER, themePack: 'theme.quantity' });
    await o.rt.startMission({ learnerId: LEARNER, missionId: 'positions-and-loads', instanceId: ID });
    await o.rt.acknowledge(ID, { commandId: 'c1' });
    const first = await o.rt.submit(ID, { commandId: 'c2', optionId: await correctOption(o.rt, ID) });
    const rows = await snapshot(o);
    await o.db.close(); // the UI never saw `first`
    o = await open(tmp.file, clock);
    const again = await o.rt.submit(ID, { commandId: 'c2', optionId: 'ignored-on-retry' });
    expect(again.duplicate).toBe(true);
    expect(again.intents).toEqual(first.intents);
    expect(await snapshot(o)).toEqual(rows);
    // A second start with the same instance id resumes instead of duplicating.
    const restarted = await o.rt.startMission({ learnerId: LEARNER, missionId: 'positions-and-loads', instanceId: ID });
    expect(restarted.duplicate).toBe(true);
    expect(await count(o.db, 'SELECT COUNT(*) AS n FROM mission_instances')).toBe(1);
    await o.db.close();
    tmp.cleanup();
  });
});

// ---------- derived cache write policy (M9.1), on the shipped content, two learners ----------
//
// The cache is written only when due: CACHE_WRITE_EVERY events since the last write, a mission or
// encounter completion (an abandon is one), an upgrade or unlock, or the first command after a
// rebuild (a cache-key change). A crash at any of these writes, or with the cache up to
// CACHE_WRITE_EVERY - 1 events behind, must recover to exactly the full replay for both learners,
// and the retried command must converge on the history a run without the crash produces.
const A = 'learner-a';
const B = 'learner-b';
const MISSION = 'positions-and-capacity';

type Move = { learner: string; instance: string; kind: 'start' | 'auto' | 'miss' | 'abandon' };

/** The scripted two-learner session: A plays a run with misses, B a few jobs in between; A starts a run and abandons it; A plays another, B again in between. */
function* moves(status: (id: string) => string): Generator<Move> {
  let bMoves = 0;
  const b = function* (n: number): Generator<Move> {
    if (n % 3 === 0 && bMoves < 10 && status('b1') === 'active') {
      bMoves += 1;
      yield { learner: B, instance: 'b1', kind: 'auto' };
    }
  };
  yield { learner: A, instance: 'a1', kind: 'start' };
  yield { learner: B, instance: 'b1', kind: 'start' };
  for (let n = 0; status('a1') === 'active'; n++) {
    yield { learner: A, instance: 'a1', kind: n % 5 === 3 ? 'miss' : 'auto' };
    if (n < 15) yield* b(n);
  }
  yield { learner: A, instance: 'a2', kind: 'start' };
  for (let n = 0; n < 6; n++) yield { learner: A, instance: 'a2', kind: 'auto' };
  yield { learner: A, instance: 'a2', kind: 'abandon' };
  yield { learner: A, instance: 'a3', kind: 'start' };
  for (let n = 0; status('a3') === 'active'; n++) {
    yield { learner: A, instance: 'a3', kind: 'auto' };
    yield* b(n + 1);
  }
}

async function perform(rt: GameRuntime, m: Move, i: number) {
  const commandId = `${m.instance}-${i}`;
  if (m.kind === 'start') {
    await rt.startMission({ learnerId: m.learner, missionId: MISSION, instanceId: m.instance });
    return rt.activate(m.instance);
  }
  await rt.activate(m.instance); // after a reopen the checkpoint is loaded again
  if (m.kind === 'abandon') return rt.abandonMission(m.instance, { commandId });
  const { view } = rt.currentView(m.instance);
  if (view.narrative) return rt.acknowledge(m.instance, { commandId });
  const rescue = view.activity?.rescue;
  if (rescue?.status === 'active') return rt.rescueAnswer(m.instance, { commandId, value: rescue.example.answer });
  const answer = m.kind === 'miss' && view.activity!.wrongTries === 0 ? wrongAnswer(rt, m.instance) : rightAnswer(rt, m.instance);
  return rt.submit(m.instance, { commandId, ...answer });
}

interface CoreOutcome {
  events: string[];
  progression: string[];
  unlocks: string[];
  missions: { id: string; status: string; last_command_id: string | null }[];
}
const coreSnapshot = async (o: Opened): Promise<CoreOutcome> => ({
  events: (await o.db.all<{ id: string }>('SELECT id FROM learning_events ORDER BY seq')).map((r) => r.id),
  progression: (await o.db.all<{ id: string }>('SELECT id FROM progression_events ORDER BY seq')).map((r) => r.id),
  unlocks: (await o.db.all<{ id: string }>('SELECT id FROM unlocks ORDER BY seq')).map((r) => r.id),
  missions: await o.db.all('SELECT id, status, last_command_id FROM mission_instances ORDER BY id'),
});

/** Why each cache write in a crash-free run happened, in order (1-based write numbers). */
type Reason = 'rebuild' | 'count' | 'completion' | 'abandon' | 'milestone';

async function playCore(file: string, fault?: { nth: number; sameProcess?: boolean }): Promise<{ outcome: CoreOutcome; crashed: boolean; reasons: Reason[] }> {
  const clock = fakeClock();
  let writes = 0;
  let fired = false;
  const plan: FaultPlan = {
    failBefore: (sql) => {
      if (!sql.includes('INTO derived_cache')) return false;
      writes += 1;
      if (fault && !fired && writes === fault.nth) return (fired = true);
      return false;
    },
  };
  let o = await open(file, clock, plan, CORE_CONTENT);
  await o.rt.createLearner({ id: A, themePack: 'theme.any' });
  await o.rt.createLearner({ id: B, themePack: 'theme.any' });
  const reasons: Reason[] = [];
  const seen = new Set<string>();
  const statuses = new Map<string, string>();
  let crashed = false;
  let i = 0;
  for (const m of moves((id) => statuses.get(id) ?? 'active')) {
    i += 1;
    const writesBefore = writes;
    const seqBefore = await count(o.db, 'SELECT COALESCE(MAX(seq), 0) AS n FROM learning_events');
    const before = await coreSnapshot(o);
    let out: { view: MissionView; intents?: PresentationIntent[] };
    try {
      out = await perform(o.rt, m, i);
    } catch (e) {
      expect(String(e)).toMatch(/Injected fault/);
      crashed = true;
      if (!fault?.sameProcess) {
        await o.db.close();
        o = await open(file, clock, plan, CORE_CONTENT); // a fresh process (the fault already fired)
      }
      expect(await coreSnapshot(o)).toEqual(before); // nothing of the failed command survived
      await expectCoherent(o, A, CORE_CONTENT);
      await expectCoherent(o, B, CORE_CONTENT);
      out = await perform(o.rt, m, i); // the very same command id
    }
    statuses.set(m.instance, out.view.status);
    // At every command boundary, what recovery would compute (cache + tail) equals a full replay.
    const recovered = await cachePlusTail(o, m.learner, CORE_CONTENT);
    if (recovered) expect(canonicalJson(recovered)).toBe(canonicalJson((await o.rt.replayFromHistory(m.learner)).exported));
    if (writes > writesBefore) {
      const completions = await count(o.db, "SELECT COUNT(*) AS n FROM learning_events WHERE seq > ? AND (id LIKE 'completion:encounter:%' OR id LIKE 'completion:mission:%')", [seqBefore]);
      const intents = out.intents ?? [];
      reasons.push(
        !seen.has(m.learner) ? 'rebuild'
        : m.kind === 'abandon' ? 'abandon'
        : completions > 0 ? 'completion'
        : intents.some((x) => x.type === 'PROGRESSION_UPGRADE' || x.type === 'UNLOCK_GRANTED') ? 'milestone'
        : 'count',
      );
      seen.add(m.learner);
    }
  }
  await expectCoherent(o, A, CORE_CONTENT);
  await expectCoherent(o, B, CORE_CONTENT);
  const outcome = await coreSnapshot(o);
  await o.db.close();
  return { outcome, crashed, reasons };
}

describe('crash at every derived-cache boundary (shipped content, two learners)', () => {
  let baseline: Awaited<ReturnType<typeof playCore>>;

  beforeAll(async () => {
    const tmp = tempDir();
    baseline = await playCore(tmp.file);
    tmp.cleanup();
    expect(baseline.outcome.missions.map((m) => m.status)).toEqual(['completed', 'abandoned', 'completed', 'active']);
    // Every kind of boundary happened in the crash-free run.
    for (const r of ['rebuild', 'count', 'completion', 'abandon', 'milestone'] as const) expect(baseline.reasons).toContain(r);
  }, 120_000);

  const cases: { name: string; reason: Reason; sameProcess?: boolean }[] = [
    { name: 'the first command after a rebuild', reason: 'rebuild' },
    { name: 'the event count threshold', reason: 'count' },
    { name: 'the event count threshold (same process)', reason: 'count', sameProcess: true },
    { name: 'an encounter or mission completion', reason: 'completion' },
    { name: 'an abandon', reason: 'abandon' },
    { name: 'an upgrade or unlock', reason: 'milestone' },
  ];
  it.each(cases.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
    const nth = baseline.reasons.indexOf(c.reason) + 1;
    const tmp = tempDir();
    const run = await playCore(tmp.file, { nth, ...(c.sameProcess ? { sameProcess: true } : {}) });
    tmp.cleanup();
    expect(run.crashed).toBe(true);
    expect(run.outcome).toEqual(baseline.outcome);
  });

  it('a cache CACHE_WRITE_EVERY - 1 events behind, two learners interleaved: reopen, crash on the next command, recover', async () => {
    const tmp = tempDir();
    await playCore(tmp.file);
    const clock = fakeClock(10 ** 13);
    let o = await open(tmp.file, clock, undefined, CORE_CONTENT);
    const fresh = { A: canonicalJson(await o.rt.learnerState(A)), B: canonicalJson(await o.rt.learnerState(B)) };
    // Put A's cache back to the prefix that leaves exactly CACHE_WRITE_EVERY - 1 of A's events after it.
    const events = await loadLearningEvents(o.db, A);
    const k = events.length - (CACHE_WRITE_EVERY - 1);
    const ctx = { graph: CORE_CONTENT.graph, policy: CORE_CONTENT.policy, pack: CORE_CONTENT.pack, missions: CORE_CONTENT.missions, ...(CORE_CONTENT.placement ? { placement: CORE_CONTENT.placement } : {}) };
    const p = createProcessor(ctx);
    for (const e of events.slice(0, k)) p.apply(e.event);
    expect(await count(o.db, 'SELECT COUNT(*) AS n FROM learning_events WHERE learner_id = ? AND seq > ?', [B, events[k - 1]!.seq])).toBeGreaterThan(0); // B's events interleave
    await o.db.run('UPDATE derived_cache SET through_seq = ?, state = ? WHERE learner_id = ?', [events[k - 1]!.seq, JSON.stringify(p.exportState()), A]);
    await o.db.close();
    // A fresh process: both learners recover to the full replay.
    o = await open(tmp.file, clock, { failBefore: (sql, params) => sql.includes('INTO learning_events') && params[1] === B }, CORE_CONTENT);
    expect(canonicalJson(await o.rt.learnerState(A))).toBe(fresh.A);
    expect(canonicalJson(await o.rt.learnerState(B))).toBe(fresh.B);
    await expectCoherent(o, A, CORE_CONTENT);
    await expectCoherent(o, B, CORE_CONTENT);
    // B's next answer crashes mid-commit; after a reopen both learners still equal their replays.
    await o.rt.activate('b1');
    let { view } = o.rt.currentView('b1');
    const answer = () => (view.narrative ? o.rt.acknowledge('b1', { commandId: 'b-next' }) : o.rt.submit('b1', { commandId: 'b-next', ...rightAnswer(o.rt, 'b1') }));
    await expect(answer()).rejects.toThrow(/Injected fault/);
    await o.db.close();
    o = await open(tmp.file, clock, undefined, CORE_CONTENT);
    await expectCoherent(o, A, CORE_CONTENT);
    await expectCoherent(o, B, CORE_CONTENT);
    await o.rt.activate('b1');
    ({ view } = o.rt.currentView('b1'));
    await answer();
    await expectCoherent(o, A, CORE_CONTENT);
    await expectCoherent(o, B, CORE_CONTENT);
    expect(canonicalJson(await o.rt.learnerState(A))).toBe(fresh.A); // A untouched by B
    await o.db.close();
    tmp.cleanup();
  }, 120_000);

  it('a cache-key change: the first command under the new key writes the cache; a crash there recovers', async () => {
    const stricter: RuntimeContent = { ...CORE_CONTENT, policy: { ...CORE_CONTENT.policy, id: 'policy-under-test', proficient: { ...CORE_CONTENT.policy.proficient, minSuccesses: 99 } } };
    expect(cacheKeyFor(stricter)).not.toBe(cacheKeyFor(CORE_CONTENT));
    const tmp = tempDir();
    await playCore(tmp.file);
    const clock = fakeClock(10 ** 13);
    let o = await open(tmp.file, clock, { failBefore: sqlHas('INTO derived_cache') }, stricter);
    await o.rt.activate('b1');
    const next = (rt: GameRuntime) => {
      const { view } = rt.currentView('b1');
      return view.narrative ? rt.acknowledge('b1', { commandId: 'b-key' }) : rt.submit('b1', { commandId: 'b-key', ...rightAnswer(rt, 'b1') });
    };
    await expect(next(o.rt)).rejects.toThrow(/Injected fault/);
    await o.db.close();
    o = await open(tmp.file, clock, undefined, stricter);
    await expectCoherent(o, B, stricter);
    await o.rt.activate('b1');
    await next(o.rt);
    expect((await o.db.get<{ cache_key: string }>('SELECT cache_key FROM derived_cache WHERE learner_id = ?', [B]))!.cache_key).toBe(cacheKeyFor(stricter));
    await expectCoherent(o, B, stricter);
    await expectCoherent(o, A, stricter);
    await o.db.close();
    tmp.cleanup();
  }, 120_000);
});
