/// <reference types="node" />
// Persistence benchmark on a twelve-month learner history (yearHistory.ts). Run it with
// `node scripts/bench-persistence.js [--root <repo>] [--out <dir>]`; `--root` measures another
// checkout of this repository (a frozen baseline) with this same workload.
//
// Measured, on the machine running it (V8, node:sqlite on a temp file, sql.js in Node with a memory
// store standing in for IndexedDB): transactions and characters written per runtime call and per
// play day, derived-cache writes, submit latency, database size, cold start from the cache, full
// replay, and the browser adapter's image saves per play day. Not measured: Hermes, expo-sqlite on
// a tablet, or a real IndexedDB.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import type { SqlDatabase } from '../../persistence/driver';
import type { ByteStore, SqlJsStatic } from '../../persistence/sqljsDatabase';
import type { GameRuntime, RuntimeContent } from '../gameRuntime';
import { countingStore, instrumentDb, quantile, zeroStats, type WriteStats } from './instrument';
import { DAY_MS, playYear, type OpKind } from './yearHistory';

const ROOT = path.resolve(process.env.BENCH_ROOT ?? path.join(__dirname, '../../..'));
const OUT = path.resolve(process.env.BENCH_OUT ?? path.join(os.tmpdir(), 'bench-persistence'));
const DAYS = Number(process.env.BENCH_DAYS ?? 365);
const RUNS = Number(process.env.BENCH_RUNS ?? 3);
const LEARNER = 'learner-bench';
const START = 1_791_244_800_000; // 2026-10-06

/* eslint-disable @typescript-eslint/no-require-imports */
const impl = {
  openGameRuntime: (require(`${ROOT}/src/runtime/gameRuntime`) as typeof import('../gameRuntime')).openGameRuntime,
  openNodeDatabase: (require(`${ROOT}/src/persistence/testing/nodeDatabase`) as typeof import('../../persistence/testing/nodeDatabase')).openNodeDatabase,
  openSqlJsDatabase: (require(`${ROOT}/src/persistence/sqljsDatabase`) as typeof import('../../persistence/sqljsDatabase')).openSqlJsDatabase,
  loadSqlJs: (require(`${ROOT}/src/persistence/testing/sqljsNode`) as typeof import('../../persistence/testing/sqljsNode')).loadSqlJs,
  CORE_CONTENT: (require(`${ROOT}/src/runtime/testing/harness`) as typeof import('../testing/harness')).CORE_CONTENT as RuntimeContent,
  canonicalJson: (require(`${ROOT}/src/engine`) as typeof import('../../engine')).canonicalJson,
  hashValue: (require(`${ROOT}/src/engine`) as typeof import('../../engine')).hashValue,
};
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
/* eslint-enable @typescript-eslint/no-require-imports */

const settableClock = (t0: number) => {
  let t = t0;
  return { now: () => (t += 1), set: (x: number) => void (t = x) };
};

interface Bucket {
  ms: number[];
  bytes: number[];
  cacheBytes: number[];
  transactions: number;
}
const bucket = (): Bucket => ({ ms: [], bytes: [], cacheBytes: [], transactions: 0 });

/** Time and attribute every runtime call the workload makes. */
function recorder(stats: WriteStats, monthOf: () => number) {
  const by = new Map<string, Bucket>();
  const get = (k: string) => by.get(k) ?? (by.set(k, bucket()), by.get(k)!);
  return {
    by,
    around: async <T>(kind: OpKind, fn: () => Promise<T>): Promise<T> => {
      const before = { ...stats };
      const t = performance.now();
      const v = await fn();
      const ms = performance.now() - t;
      for (const key of [`${kind}`, `${kind}@m${monthOf()}`]) {
        const b = get(key);
        b.ms.push(ms);
        b.bytes.push(stats.bytes - before.bytes);
        b.cacheBytes.push(stats.cacheBytes - before.cacheBytes);
        b.transactions += stats.transactions - before.transactions;
      }
      return v;
    },
  };
}

function checkpointCopy(src: string, dest: string) {
  const d = new DatabaseSync(src);
  d.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  d.close();
  fs.copyFileSync(src, dest);
  const c = new DatabaseSync(dest);
  c.exec('PRAGMA journal_mode = DELETE'); // the browser image is never WAL
  c.close();
}

function dbFacts(file: string) {
  const d = new DatabaseSync(file);
  const one = (sql: string) => Number((d.prepare(sql).get() as Record<string, number>)?.n ?? 0);
  const facts = {
    bytes: fs.statSync(file).size,
    pages: one('SELECT page_count AS n FROM pragma_page_count'),
    freePages: one('SELECT freelist_count AS n FROM pragma_freelist_count'),
    events: one('SELECT COUNT(*) AS n FROM learning_events'),
    attempts: one("SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'"),
    eventPayloadBytes: one('SELECT SUM(LENGTH(payload)) AS n FROM learning_events'),
    missionStateBytes: one('SELECT SUM(LENGTH(state)) + SUM(LENGTH(COALESCE(last_result, \'\'))) AS n FROM mission_instances'),
    missionRows: one('SELECT COUNT(*) AS n FROM mission_instances'),
    cacheBytes: one('SELECT COALESCE(SUM(LENGTH(state)), 0) AS n FROM derived_cache'),
    cacheThroughSeq: one('SELECT COALESCE(MAX(through_seq), 0) AS n FROM derived_cache'),
    maxSeq: one('SELECT COALESCE(MAX(seq), 0) AS n FROM learning_events'),
    memories: one('SELECT COUNT(*) AS n FROM world_memory'),
    settings: one('SELECT COUNT(*) AS n FROM learner_settings'),
  };
  d.close();
  return facts;
}

const median = (xs: number[]) => quantile(xs, 0.5);
const spread = (xs: number[]) => (xs.length ? `${f(Math.min(...xs))}–${f(Math.max(...xs))}` : '-');
const f = (n: number) => (Number.isNaN(n) ? '-' : n < 10 ? n.toFixed(2) : n.toFixed(0));
const kb = (n: number) => (n / 1024).toFixed(1);
const mb = (n: number) => (n / 1024 / 1024).toFixed(2);

async function timeIt<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t = performance.now();
  const value = await fn();
  return { ms: performance.now() - t, value };
}

/** Cold start (a fresh process) on a snapshot copy: from its cache, full replay, and with no cache. */
async function recovery(file: string, content: RuntimeContent) {
  const fromCache: number[] = [];
  const replay: number[] = [];
  const noCache: number[] = [];
  let consistent = true;
  let cacheCurrentEqualsReplay: boolean | null = null;
  for (let run = 0; run < RUNS; run++) {
    const copy = `${file}.r${run}`;
    fs.copyFileSync(file, copy);
    let db = impl.openNodeDatabase(copy);
    let rt = await impl.openGameRuntime(db, content, settableClock(START + 400 * DAY_MS));
    const a = await timeIt(() => rt.learnerState(LEARNER));
    fromCache.push(a.ms);
    const r = await timeIt(() => rt.replayFromHistory(LEARNER));
    replay.push(r.ms);
    consistent &&= impl.canonicalJson(a.value) === impl.canonicalJson(r.value.state);
    const row = await db.get<{ through_seq: number; state: string }>('SELECT through_seq, state FROM derived_cache WHERE learner_id = ?', [LEARNER]);
    const maxSeq = (await db.get<{ n: number }>('SELECT MAX(seq) AS n FROM learning_events WHERE learner_id = ?', [LEARNER]))?.n ?? 0;
    if (row && row.through_seq === maxSeq) cacheCurrentEqualsReplay = impl.canonicalJson(JSON.parse(row.state)) === impl.canonicalJson(r.value.exported);
    await db.run('DELETE FROM derived_cache');
    await db.close();
    db = impl.openNodeDatabase(copy);
    rt = await impl.openGameRuntime(db, content, settableClock(START + 400 * DAY_MS));
    noCache.push((await timeIt(() => rt.learnerState(LEARNER))).ms);
    await db.close();
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(copy + ext, { force: true });
  }
  return { fromCache, replay, noCache, consistent, cacheCurrentEqualsReplay };
}

/** One week of play on the browser adapter, opened from a snapshot image. */
async function browserWeek(file: string, content: RuntimeContent, seed: number) {
  const SQL: SqlJsStatic = await impl.loadSqlJs();
  const store = countingStore(new Uint8Array(fs.readFileSync(file)));
  const exportMs: number[] = [];
  {
    const probe = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      probe.export();
      exportMs.push(performance.now() - t);
    }
    probe.close();
  }
  const db: SqlDatabase = await impl.openSqlJsDatabase(SQL, store as ByteStore);
  const clock = settableClock(START + 400 * DAY_MS);
  const rt: GameRuntime = await impl.openGameRuntime(db, content, clock);
  const stats = zeroStats();
  const rec = recorder(stats, () => 0);
  const perDay: { saves: number; bytes: number }[] = [];
  let mark = { saves: store.stats.saves, bytes: store.stats.bytes };
  await playYear({
    rt,
    pack: content.pack,
    learnerId: LEARNER,
    clock,
    start: START + 400 * DAY_MS,
    seed,
    idPrefix: `wk${seed}`,
    memory: false,
    hooks: {
      around: rec.around,
      endOfDay: () => {
        perDay.push({ saves: store.stats.saves - mark.saves, bytes: store.stats.bytes - mark.bytes });
        mark = { saves: store.stats.saves, bytes: store.stats.bytes };
      },
    },
  }, 7);
  await db.close();
  return { perDay, by: rec.by, imageBytes: store.stats.lastSize, exportMs };
}

// Only through scripts/bench-persistence.js (it sets BENCH_ROOT): `npm run bench` stays the quick history benchmark.
(process.env.BENCH_ROOT ? describe : describe.skip)('persistence benchmark (twelve months)', () => {
  it('measures writes, latency, size and recovery', async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const content = impl.CORE_CONTENT;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-year-'));
    const file = path.join(dir, 'game.db');
    const raw = impl.openNodeDatabase(file);
    const { db, stats } = instrumentDb(raw);
    const clock = settableClock(START);
    const rt = await impl.openGameRuntime(db, content, clock);
    await rt.createLearner({ id: LEARNER, themePack: 'elevator-quest' });

    let day = 0;
    const rec = recorder(stats, () => Math.min(12, Math.floor(day / 30.5) + 1));
    const days: { day: number; transactions: number; bytes: number; cacheBytes: number; cacheWrites: number }[] = [];
    let mark = { ...stats };
    const snapshotAt = [...new Set([30, 91, 182, DAYS - 1])].filter((d) => d < DAYS).sort((a, b) => a - b);
    const snapshots: { label: string; file: string }[] = [];
    const t0 = performance.now();
    const counts = await playYear({
      rt,
      pack: content.pack,
      learnerId: LEARNER,
      clock,
      start: START,
      hooks: {
        around: (kind, fn) => {
          day = Math.floor((clock.now() - START) / DAY_MS);
          return rec.around(kind, fn);
        },
        endOfDay: (d) => {
          days.push({ day: d, transactions: stats.transactions - mark.transactions, bytes: stats.bytes - mark.bytes, cacheBytes: stats.cacheBytes - mark.cacheBytes, cacheWrites: stats.cacheWrites - mark.cacheWrites });
          mark = { ...stats };
          while (snapshotAt.length && d >= snapshotAt[0]!) {
            const at = snapshotAt.shift()!;
            const snap = path.join(dir, `day-${at + 1}.db`);
            checkpointCopy(file, snap);
            snapshots.push({ label: `day ${at + 1}`, file: snap });
          }
        },
      },
    }, DAYS);
    const generateMs = performance.now() - t0;

    // Evidence consistency at the end, on the live runtime: derived state == full replay.
    const live = await rt.learnerState(LEARNER);
    const replay = await rt.replayFromHistory(LEARNER);
    const liveConsistent = impl.canonicalJson(live) === impl.canonicalJson(replay.state);
    // Fingerprints to compare two checkouts: the same history and the same derived learner state.
    const eventIds = (await raw.all<{ id: string }>('SELECT id FROM learning_events ORDER BY seq')).map((r) => r.id);
    const fingerprint = { events: impl.hashValue(eventIds), learnerState: impl.hashValue(JSON.parse(impl.canonicalJson(live))), progression: impl.hashValue((await rt.progressionEvents(LEARNER)).map((u) => `${u.key}->${u.toTier}`)), unlocks: impl.hashValue((await rt.unlocks(LEARNER)).map((u) => u.unlockId)) };
    await db.close();

    const rows = [];
    for (const s of snapshots) {
      const facts = dbFacts(s.file);
      const rcv = await recovery(s.file, content);
      const web = [];
      for (let run = 0; run < RUNS; run++) web.push(await browserWeek(s.file, content, 7 + run));
      rows.push({ label: s.label, facts, rcv, web });
    }

    const month = (k: string) => rec.by.get(k) ?? bucket();
    const lastMonth = Math.min(12, Math.floor((DAYS - 1) / 30.5) + 1);
    const perDayTx = days.map((d) => d.transactions);
    const result = {
      root: ROOT,
      node: process.version,
      days: DAYS,
      counts,
      generateMs,
      liveConsistent,
      fingerprint,
      perDay: { transactionsMedian: median(perDayTx), transactionsP95: quantile(perDayTx, 0.95), bytesMedian: median(days.map((d) => d.bytes)), bytesLastMonthMedian: median(days.filter((d) => d.day >= DAYS - 30).map((d) => d.bytes)), cacheWritesMedian: median(days.map((d) => d.cacheWrites)), cacheBytesLastMonthMedian: median(days.filter((d) => d.day >= DAYS - 30).map((d) => d.cacheBytes)) },
      ops: Object.fromEntries(
        [...rec.by].map(([k, b]) => [k, { n: b.ms.length, p50: median(b.ms), p95: quantile(b.ms, 0.95), bytesP50: median(b.bytes), cacheBytesP50: median(b.cacheBytes), transactions: b.transactions }]),
      ),
      snapshots: rows.map((r) => ({
        label: r.label,
        facts: r.facts,
        recovery: { fromCacheMs: r.rcv.fromCache, replayMs: r.rcv.replay, noCacheMs: r.rcv.noCache, consistent: r.rcv.consistent, cacheCurrentEqualsReplay: r.rcv.cacheCurrentEqualsReplay },
        browser: r.web.map((w) => ({
          imageBytes: w.imageBytes,
          exportMs: w.exportMs,
          savesPerDay: w.perDay.map((d) => d.saves),
          bytesPerDay: w.perDay.map((d) => d.bytes),
          submit: { p50: median(w.by.get('submit')?.ms ?? []), p95: quantile(w.by.get('submit')?.ms ?? [], 0.95) },
          putSetting: { p50: median(w.by.get('putSetting')?.ms ?? []), p95: quantile(w.by.get('putSetting')?.ms ?? [], 0.95) },
        })),
      })),
    };

    const md: string[] = [];
    md.push(`# Persistence benchmark`, '', `root ${ROOT}, node ${process.version}, ${os.cpus().length} cores, load ${os.loadavg().map((x) => x.toFixed(1)).join(' ')}`, '');
    md.push(`Workload: ${DAYS} days, ${counts.playDays} play days, ${counts.commands} answer/help/story commands, ${counts.missions} Floor 15 runs completed, ${counts.golf} Word Golf and ${counts.cargo} Cargo sessions. Generated in ${(generateMs / 1000).toFixed(0)} s. Live state == full replay at the end: ${liveConsistent}. Fingerprints: events ${fingerprint.events.slice(0, 12)}, learner state ${fingerprint.learnerState.slice(0, 12)}, progression ${fingerprint.progression.slice(0, 12)}, unlocks ${fingerprint.unlocks.slice(0, 12)}.`, '');
    md.push('## node:sqlite, whole year (per runtime call)', '', '| call | n | p50 ms | p95 ms | chars written p50 | of which cache p50 | transactions |', '|---|---|---|---|---|---|---|');
    for (const k of ['submit', 'useScaffold', 'acknowledge', 'rescueAnswer', 'putSetting', 'remember', 'startMission', 'activate']) {
      const b = month(k);
      md.push(`| ${k} | ${b.ms.length} | ${f(median(b.ms))} | ${f(quantile(b.ms, 0.95))} | ${median(b.bytes)} | ${median(b.cacheBytes)} | ${b.transactions} |`);
    }
    md.push('', '| month | submit p50 ms | submit p95 ms | submit chars p50 | cache chars p50 |', '|---|---|---|---|---|');
    for (let m = 1; m <= lastMonth; m++) {
      const b = month(`submit@m${m}`);
      md.push(`| ${m} | ${f(median(b.ms))} | ${f(quantile(b.ms, 0.95))} | ${median(b.bytes)} | ${median(b.cacheBytes)} |`);
    }
    md.push('', `Per play day: transactions median ${result.perDay.transactionsMedian} (p95 ${result.perDay.transactionsP95}); chars written median ${kb(result.perDay.bytesMedian)} KB (last month ${kb(result.perDay.bytesLastMonthMedian)} KB); cache writes median ${result.perDay.cacheWritesMedian}, cache chars last month median ${kb(result.perDay.cacheBytesLastMonthMedian)} KB.`, '');
    md.push('## Snapshots', '', '| at | events | DB MB | free pages | event payload MB | mission rows / MB | cache KB | cold start from cache ms | full replay ms | no-cache start ms | state == replay |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      md.push(`| ${r.label} | ${r.facts.events} | ${mb(r.facts.bytes)} | ${r.facts.freePages}/${r.facts.pages} | ${mb(r.facts.eventPayloadBytes)} | ${r.facts.missionRows} / ${mb(r.facts.missionStateBytes)} | ${kb(r.facts.cacheBytes)} | ${f(median(r.rcv.fromCache))} (${spread(r.rcv.fromCache)}) | ${f(median(r.rcv.replay))} (${spread(r.rcv.replay)}) | ${f(median(r.rcv.noCache))} (${spread(r.rcv.noCache)}) | ${r.rcv.consistent}${r.rcv.cacheCurrentEqualsReplay === null ? '' : `, cache ${r.rcv.cacheCurrentEqualsReplay}`} |`);
    }
    md.push('', '## Browser adapter (sql.js, memory store), one week from each snapshot', '', '| at | image MB | export ms | saves per play day (median of runs) | MB saved per play day | submit p50 ms | submit p95 ms | putSetting p50 ms | putSetting p95 ms |', '|---|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      const saves = r.web.map((w) => median(w.perDay.map((d) => d.saves)));
      const bytes = r.web.map((w) => median(w.perDay.map((d) => d.bytes)));
      md.push(`| ${r.label} | ${mb(r.web[0]!.imageBytes)} | ${f(median(r.web.flatMap((w) => w.exportMs)))} | ${median(saves)} | ${mb(median(bytes))} | ${f(median(r.web.map((w) => median(w.by.get('submit')?.ms ?? []))))} (${spread(r.web.map((w) => median(w.by.get('submit')?.ms ?? [])))}) | ${f(median(r.web.map((w) => quantile(w.by.get('submit')?.ms ?? [], 0.95))))} | ${f(median(r.web.map((w) => median(w.by.get('putSetting')?.ms ?? []))))} | ${f(median(r.web.map((w) => quantile(w.by.get('putSetting')?.ms ?? [], 0.95))))} |`);
    }
    const tag = process.env.BENCH_TAG ?? 'run';
    fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(result, null, 1));
    fs.writeFileSync(path.join(OUT, `${tag}.md`), `${md.join('\n')}\n`);
    process.stdout.write(`\n${md.join('\n')}\n`);
    fs.rmSync(dir, { recursive: true, force: true });
    expect(liveConsistent).toBe(true);
    for (const r of rows) expect(r.rcv.consistent).toBe(true);
  }, 3_600_000);
});
