/// <reference types="node" />
// Node benchmark: how replay, cache restore, and per-command commits scale with history.
// Run with `npm run bench`. Not part of `npm test`.
//
// What this measures: V8 (JIT) on the machine running it, node:sqlite on a temp file.
// What it does not: Hermes on a Fire tablet. Device numbers need the Device Lab.
import { performance } from 'node:perf_hooks';

import {
  applyCommand,
  createProcessor,
  currentItem,
  replayEvents,
  startMission,
  type LearningEvent,
  type MissionCommand,
  type MissionState,
} from '../../engine';
import { DAY, MISSION_CTX, T0 } from '../../engine/testing/support';
import { appendLearningEvents, loadLearningEvents } from '../../persistence/store';
import { CONTENT, correctOption, fakeClock, open, tempDir } from '../testing/harness';

const LEARNER = 'learner-bench';
const SIZES = (process.env.BENCH_SIZES ?? '1000,10000,50000').split(',').map(Number);
const MINUTE = 60_000;

/** Synthetic but realistic history: missions played through the pure runtime, some misses, spread over days. */
function history(targetAttempts: number): LearningEvent[] {
  const events: LearningEvent[] = [];
  let attempts = 0;
  let t = T0;
  for (let run = 0; attempts < targetAttempts; run++) {
    if (run % 4 === 0) t += DAY;
    t += 30 * MINUTE;
    const missionId = run % 3 === 2 ? 'first-sounds' : 'positions-and-loads';
    let r = startMission(MISSION_CTX, { instanceId: `bench-${run}`, missionId, missionVersion: 1, learnerId: LEARNER, at: t });
    let state: MissionState = r.state;
    for (let c = 0; state.status === 'active' && c < 100; c++) {
      t += 15_000;
      const item = currentItem(MISSION_CTX, state);
      let command: MissionCommand;
      if (!item) command = { type: 'acknowledge', commandId: `k${c}`, at: t };
      else {
        const miss = (run + c) % 7 === 0 && state.item!.wrongTries === 0;
        const option = item.response.options.find((o) => o.correct !== miss)!;
        command = { type: 'submit', commandId: `k${c}`, optionId: option.id, at: t };
      }
      r = applyCommand(MISSION_CTX, state, command);
      state = r.state;
      for (const e of r.events) {
        events.push(e);
        if (e.type === 'attempt') attempts += 1;
      }
    }
  }
  return events;
}

function time<T>(fn: () => T): { ms: number; value: T } {
  const start = performance.now();
  const value = fn();
  return { ms: performance.now() - start, value };
}

async function timeAsync<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await fn();
  return { ms: performance.now() - start, value };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const f = (ms: number) => (ms < 10 ? ms.toFixed(2) : ms.toFixed(0));

interface Row {
  attempts: number;
  events: number;
  replayMs: number;
  sqliteLoadMs: number;
  coldRebuildMs: number;
  coldFromCacheMs: number;
  cacheBytes: number;
  applyPerEventUs: number;
  commandMedianMs: number;
  commandP90Ms: number;
}

async function measure(target: number): Promise<Row> {
  const events = history(target);
  const attempts = events.filter((e) => e.type === 'attempt').length;
  const ctx = { graph: CONTENT.graph, policy: CONTENT.policy, pack: CONTENT.pack, missions: CONTENT.missions };

  // 1. Full replay in memory (median of 3).
  const replayMs = median([0, 1, 2].map(() => time(() => replayEvents(ctx, events)).ms));

  // 2. Incremental apply cost per event (warm processor, no export).
  const p = createProcessor(ctx);
  const applyMs = time(() => events.forEach((e) => p.apply(e))).ms;

  // 3. Populate SQLite through the real repositories.
  const tmp = tempDir();
  const last = events.at(-1)!;
  const clock = fakeClock((last.type === 'attempt' ? last.attempt.occurredAt : last.completion.occurredAt) + DAY);
  let o = await open(tmp.file, clock);
  await o.rt.createLearner({ id: LEARNER, themePack: 'theme.bench' });
  await o.db.transaction((tx) => appendLearningEvents(tx, LEARNER, events));
  const loads: number[] = [];
  for (let i = 0; i < 3; i++) loads.push((await timeAsync(() => loadLearningEvents(o.db, LEARNER))).ms);
  const sqliteLoadMs = median(loads);

  // 4. Cold start with no cache: load + validate + replay, through the runtime.
  await o.db.run('DELETE FROM derived_cache');
  await o.db.close();
  o = await open(tmp.file, clock);
  const coldRebuildMs = (await timeAsync(() => o.rt.learnerState(LEARNER))).ms;

  // 5. Cold start from a current cache.
  await o.rt.rebuildCache(LEARNER);
  const cacheBytes = (await o.db.get<{ n: number }>('SELECT LENGTH(state) AS n FROM derived_cache'))!.n;
  await o.db.close();
  o = await open(tmp.file, clock);
  const coldFromCacheMs = (await timeAsync(() => o.rt.learnerState(LEARNER))).ms;

  // 6. Per-command commit latency on top of this history (warm processor, includes SQLite + cache write).
  const commandMs: number[] = [];
  for (let m = 0; commandMs.length < 40; m++) {
    const id = `live-${m}`;
    await o.rt.startMission({ learnerId: LEARNER, missionId: 'positions-and-loads', instanceId: id });
    for (let c = 0; c < 20 && (await o.rt.view(id)).status === 'active'; c++) {
      const view = await o.rt.view(id);
      const option = view.narrative ? null : await correctOption(o.rt, id);
      const { ms } = await timeAsync(() => (option ? o.rt.submit(id, { commandId: `x${c}`, optionId: option }) : o.rt.acknowledge(id, { commandId: `x${c}` })));
      commandMs.push(ms);
    }
  }
  await o.db.close();
  tmp.cleanup();
  const sorted = [...commandMs].sort((a, b) => a - b);

  return {
    attempts,
    events: events.length,
    replayMs,
    sqliteLoadMs,
    coldRebuildMs,
    coldFromCacheMs,
    cacheBytes,
    applyPerEventUs: (applyMs * 1000) / events.length,
    commandMedianMs: median(commandMs),
    commandP90Ms: sorted[Math.floor(sorted.length * 0.9)]!,
  };
}

describe('history benchmark', () => {
  it('measures replay, cache restore, and command latency', async () => {
    const rows: Row[] = [];
    for (const n of SIZES) rows.push(await measure(n));
    const lines = [
      `node ${process.version}, ${process.arch}`,
      '| attempts | events | full replay (mem) | SQLite load+validate | cold start, no cache | cold start, cache | cache size | apply/event | command p50 | command p90 |',
      '|---|---|---|---|---|---|---|---|---|---|',
      ...rows.map(
        (r) =>
          `| ${r.attempts} | ${r.events} | ${f(r.replayMs)} ms | ${f(r.sqliteLoadMs)} ms | ${f(r.coldRebuildMs)} ms | ${f(r.coldFromCacheMs)} ms | ${(r.cacheBytes / 1024).toFixed(0)} KB | ${r.applyPerEventUs.toFixed(1)} µs | ${f(r.commandMedianMs)} ms | ${f(r.commandP90Ms)} ms |`,
      ),
    ];
    process.stdout.write(`\n${lines.join('\n')}\n`);
    for (const r of rows) expect(r.attempts).toBeGreaterThan(0);
  }, 600_000);
});
