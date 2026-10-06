// Interruptions at meaningful boundaries. A fault is injected before one SQL statement
// inside a command's transaction (the process "dies" mid-commit). After reopening, the
// database must be coherent, and retrying the same command must converge on exactly the
// history a run without any crash produces.
import { canonicalJson, type MissionView } from '../engine';
import type { SqlValue } from '../persistence/driver';
import type { FaultPlan } from '../persistence/testing/nodeDatabase';
import type { GameRuntime } from './gameRuntime';
import { count, correctOption, fakeClock, open, tempDir, wrongOption, type Opened } from './testing/harness';

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
  { name: 'creating the mission checkpoint at start', match: sqlHas('INTO mission_instances') },
  { name: 'checkpoint after the first item is generated', match: sqlHas('UPDATE mission_instances'), nth: 1 },
  { name: 'checkpoint after an incorrect response', match: sqlHas('UPDATE mission_instances'), nth: 2 },
  { name: 'checkpoint after scaffold use', match: sqlHas('UPDATE mission_instances'), nth: 4 },
  { name: 'writing the first attempt', match: (sql, p) => sql.includes('INTO learning_events') && firstParam('attempt:')(sql, p) },
  { name: 'writing a step completion record', match: (sql, p) => sql.includes('INTO learning_events') && firstParam('completion:activity:')(sql, p) },
  { name: 'writing an encounter completion record', match: (sql, p) => sql.includes('INTO learning_events') && firstParam('completion:encounter:')(sql, p) },
  { name: 'writing the mission completion record', match: (sql, p) => sql.includes('INTO learning_events') && firstParam('completion:mission:')(sql, p) },
  { name: 'announcing the first progression upgrade', match: sqlHas('INTO progression_events') },
  { name: 'announcing the mission upgrade', match: (sql, p) => sql.includes('INTO progression_events') && typeof p[0] === 'string' && p[0].includes('|mission:') },
  { name: 'writing the derived cache', match: sqlHas('INTO derived_cache'), nth: 3 },
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

/** Everything that must hold after any reopen, crash or not. */
async function expectCoherent(o: Opened) {
  // Derived state equals a replay of the source of truth.
  const replay = await o.rt.replayFromHistory(LEARNER);
  expect(canonicalJson(await o.rt.learnerState(LEARNER))).toBe(canonicalJson(replay.state));
  // The cache, when current, equals the replay.
  const cache = await o.db.get<{ through_seq: number; state: string }>('SELECT through_seq, state FROM derived_cache WHERE learner_id = ?', [LEARNER]);
  const maxSeq = await count(o.db, 'SELECT COALESCE(MAX(seq), 0) AS n FROM learning_events WHERE learner_id = ?', [LEARNER]);
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
