// The derived cache may lag behind history: recovery restores it and replays only the tail of
// learning_events. This holds only if a restored snapshot plus the tail equals a full replay, at
// every point of a long history. Checked here on a synthetic twelve-month history played through
// the runtime (src/runtime/bench/yearHistory.ts): daily Floor 15 runs with misses, help and
// corrections, both mini-games, world memory and settings.
//
// CACHE_EQ_DAYS sets the length: 90 days by default (keeps `npm test` quick), 365 for the twelve-month check.
import { canonicalJson, createProcessor, replayEvents, type ProcessorContext, type ProcessorStateExport } from '../engine';
import { loadLearningEvents, putCache, type StoredEvent } from '../persistence/store';
import { cacheKeyFor } from './gameRuntime';
import { playYear } from './bench/yearHistory';
import { CORE_CONTENT, open, rightAnswer, tempDir, type Opened } from './testing/harness';

const DAYS = Number(process.env.CACHE_EQ_DAYS ?? 90);
const LEARNER = 'learner-year';
const OTHER = 'learner-other';
const START = 1_791_244_800_000;

const ctx: ProcessorContext = { graph: CORE_CONTENT.graph, policy: CORE_CONTENT.policy, pack: CORE_CONTENT.pack, missions: CORE_CONTENT.missions, ...(CORE_CONTENT.placement ? { placement: CORE_CONTENT.placement } : {}) };
const settable = () => {
  let t = START;
  return { now: () => (t += 1), set: (x: number) => void (t = x) };
};

describe(`derived cache: snapshot plus tail equals full replay (${DAYS} days)`, () => {
  let tmp: ReturnType<typeof tempDir>;
  let o: Opened;
  let events: StoredEvent[];
  let full: ProcessorStateExport;
  const clock = settable();

  beforeAll(async () => {
    tmp = tempDir();
    o = await open(tmp.file, clock, undefined, CORE_CONTENT);
    await o.rt.createLearner({ id: LEARNER, themePack: 'elevator-quest' });
    await o.rt.createLearner({ id: OTHER, themePack: 'elevator-quest' });
    // A second learner plays a little on the same days, so seq numbers interleave.
    await o.rt.startMission({ learnerId: OTHER, missionId: 'positions-and-capacity', instanceId: 'other-1' });
    await playYear({ rt: o.rt, pack: CORE_CONTENT.pack, learnerId: LEARNER, clock, start: START }, DAYS);
    let { revision } = await o.rt.activate('other-1');
    for (let n = 0; n < 6; n++) {
      const { view } = o.rt.currentView('other-1');
      const out = view.narrative ? await o.rt.acknowledge('other-1', { commandId: `o${n}`, basedOn: revision }) : await o.rt.submit('other-1', { commandId: `o${n}`, basedOn: revision, ...rightAnswer(o.rt, 'other-1') });
      revision = out.revision;
    }
    events = await loadLearningEvents(o.db, LEARNER);
    full = replayEvents(ctx, events.map((e) => e.event)).processor.exportState();
  }, 600_000);

  afterAll(async () => {
    await o.db.close();
    tmp.cleanup();
  });

  it('has a long history to check', () => {
    expect(events.length).toBeGreaterThan(DAYS * 10);
    expect(events.some((e) => e.event.type === 'completion' && e.event.completion.kind === 'mission')).toBe(true);
  });

  it('a restored snapshot at any prefix, plus the rest, exports exactly what a full replay exports', () => {
    const n = events.length;
    const cuts = new Set([0, 1, 2, 24, 25, 26, n - 25, n - 1, n]);
    for (let k = 0; k <= n; k += Math.max(1, Math.floor(n / 60))) cuts.add(k);
    const running = createProcessor(ctx);
    let applied = 0;
    for (const k of [...cuts].filter((c) => c >= 0 && c <= n).sort((a, b) => a - b)) {
      while (applied < k) running.apply(events[applied++]!.event);
      // Through JSON, as the cache row stores it.
      const snapshot = JSON.parse(JSON.stringify(running.exportState())) as ProcessorStateExport;
      const restored = createProcessor(ctx, snapshot);
      expect(canonicalJson(restored.exportState())).toBe(canonicalJson(snapshot)); // restore is lossless
      for (let i = k; i < n; i++) restored.apply(events[i]!.event);
      expect(canonicalJson(restored.exportState())).toBe(canonicalJson(full));
    }
  });

  it('the runtime, reopened on a cache that lags by any amount, arrives at the full replay', async () => {
    const n = events.length;
    const live = canonicalJson(await o.rt.learnerState(LEARNER));
    const replayed = await o.rt.replayFromHistory(LEARNER);
    expect(live).toBe(canonicalJson(replayed.state));
    expect(canonicalJson(replayed.exported)).toBe(canonicalJson(full));
    const other = canonicalJson(await o.rt.learnerState(OTHER));
    for (const k of [1, 24, Math.floor(n / 3), n - 24, n - 1]) {
      const p = createProcessor(ctx);
      for (let i = 0; i < k; i++) p.apply(events[i]!.event);
      await o.db.transaction((tx) => putCache(tx, LEARNER, { cacheKey: cacheKeyFor(CORE_CONTENT), throughSeq: events[k - 1]!.seq, state: JSON.stringify(p.exportState()) }, START));
      o.rt.dropMemory(); // a fresh process
      expect(canonicalJson(await o.rt.learnerState(LEARNER))).toBe(live);
      expect(canonicalJson(await o.rt.learnerState(OTHER))).toBe(other); // the other learner is untouched
    }
  });
});
