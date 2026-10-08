// Developer tools act only on test learners, and never write learning evidence themselves.
import { openNodeDatabase } from '../../../persistence/testing/nodeDatabase';
import { activeTestLearner, currentGeneration, isTestLearner, resetTestLearner, seedMissionAt } from '../../../runtime/devSeed';
import { openGameRuntime } from '../../../runtime/gameRuntime';
import { count, fakeClock } from '../../../runtime/testing/harness';
import { FLOOR15, THEME_PACK_ID } from '../content/floor15';
import { LANDINGS, landingObjects } from '../content/landings';
import { READING, readingItem } from '../content/reading';
import { createFloor15Director, type Motion } from '../director/director';
import { createPlaytestLog } from '../director/playtestLog';
import type { Floor15Session } from '../sessionCore';
import { CONTENT, tempDir, virtualTime } from '../testing/headless';
import { JUMPS, inspectLearner, jumpTo, restartMission, simulateMisses, thresholds, type DevContext } from './floor15Tools';
import { SCENARIOS, type DevDriver } from './scenarios';

const events = (ctx: DevContext) => count(ctx.db, 'SELECT COUNT(*) AS n FROM learning_events');

async function setup(file: string): Promise<DevContext> {
  const db = openNodeDatabase(file);
  const clock = fakeClock();
  const runtime = await openGameRuntime(db, CONTENT, clock);
  return { db, runtime, content: CONTENT, now: () => clock.now() };
}

/**
 * The developer shell's driver, headless: the real director on the tools' runtime, on virtual time.
 * Enough for scenarios that drive one test learner's game (not the fresh-learner switch).
 */
async function headlessDriver(file: string) {
  const time = virtualTime();
  const db = openNodeDatabase(file);
  const runtime = await openGameRuntime(db, CONTENT, time);
  const ctx: DevContext = { db, runtime, content: CONTENT, now: () => time.now() };
  const learner = await activeTestLearner(runtime, 'learner-test-a', THEME_PACK_ID);
  let session: Floor15Session | null = null;
  const driver: DevDriver = {
    ctx,
    learnerId: () => learner,
    freshLearner: () => Promise.reject(new Error('not in this driver')),
    async mount(instanceId) {
      session?.director.dispose();
      const director = createFloor15Director({ runtime, learnerId: learner, instanceId: instanceId!, clock: time, schedule: (fn, ms) => time.schedule(fn, ms), motion: 'normal', log: createPlaytestLog() });
      await director.start();
      session = { learnerId: learner, runtime, director, log: createPlaytestLog(), skillsBefore: null, setMotion: (m: Motion) => director.setMotion(m) } as unknown as Floor15Session;
      return session;
    },
    async unmount() {
      session?.director.dispose();
      session = null;
    },
    async waitFor(pred, label, timeoutMs = 10_000) {
      if (!(await time.runUntil(pred, timeoutMs))) throw new Error(`timed out: ${label}`);
    },
    sleep: (ms) => time.advance(ms),
  };
  return { driver, ctx, view: () => session!.director.getView(), close: async () => (session?.director.dispose(), await db.close()) };
}

describe('Floor 15 developer tools', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('refuse to touch a real learner', async () => {
    const ctx = await setup(tmp.file);
    await ctx.runtime.createLearner({ id: 'learner-1', themePack: 'elevator-quest' });
    expect(isTestLearner('learner-1')).toBe(false);
    expect(isTestLearner('learner-test-a-g2')).toBe(true);
    await expect(jumpTo(ctx, 'learner-1', 'cargo')).rejects.toThrow(/test learners/);
    await expect(restartMission(ctx, 'learner-1')).rejects.toThrow(/test learners/);
    await ctx.runtime.startMission({ learnerId: 'learner-1', missionId: 'positions-and-capacity', instanceId: 'real' });
    await expect(simulateMisses(ctx, 'learner-1', 'real', 2, 'any')).rejects.toThrow(/test learners/);
    // Even with a test learner's name, an instance owned by someone else is refused.
    await expect(simulateMisses(ctx, 'learner-test-a-g1', 'real', 2, 'any')).rejects.toThrow(/another learner/);
  });

  it('jumps write a checkpoint only, never learning records, and are deterministic', async () => {
    const ctx = await setup(tmp.file);
    const learner = await activeTestLearner(ctx.runtime, 'learner-test-a', THEME_PACK_ID);
    const signatures: string[] = [];
    for (const j of JUMPS) {
      const id = await jumpTo(ctx, learner, j.id);
      const { view } = await ctx.runtime.activate(id);
      expect(view.step?.id).toBe(j.stepId);
      // A pool step shows the job the jump names (a seed whose pool chooses it, as play would).
      if (j.activityId) expect(view.activity?.activityId).toBe(j.activityId);
      // A reading jump shows the item it names (a seed whose first item is that one).
      if (j.item) expect(view.activity?.prompt.item).toBe(j.item);
      if (j.id === 'cargo') expect(view.activity?.concept).toBe('fillToCapacity');
      if (j.id === 'orders') expect(view.activity?.concept).toBe('combineGroups');
      if (j.id === 'meter') expect(view.activity?.concept).toBe('distanceBetween');
      if (j.id === 'express') expect(view.activity?.concept).toBe('equalJumps');
      if (j.id === 'lamps') expect(view.activity?.concept).toBe('missingInSequence');
      if (j.id === 'teen') expect(view.activity?.concept).toBe('tensAndOnes');
      if (j.id === 'order') expect(view.activity?.concept).toBe('orderPositions');
      if (view.activity) signatures.push(view.activity.itemSignature);
    }
    expect(await events(ctx)).toBe(0);
    const again = await jumpTo(ctx, learner, 'practice');
    expect((await ctx.runtime.activate(again)).view.activity!.itemSignature).toBe(signatures[0]);
  });

  it('every step has a jump, and the reading jumps cover each way of answering one', async () => {
    const mission = CONTENT.missions.find((m) => m.id === FLOOR15.missionId)!;
    expect(mission.steps.map((s) => s.id).filter((id) => !JUMPS.some((j) => j.stepId === id))).toEqual([]);
    const ctx = await setup(tmp.file);
    const learner = await activeTestLearner(ctx.runtime, 'learner-test-a', THEME_PACK_ID);
    const modes: Record<string, string> = {};
    for (const j of JUMPS.filter((x) => x.stepId.startsWith('read-'))) {
      const { view } = await ctx.runtime.activate(await jumpTo(ctx, learner, j.id));
      modes[j.id] = readingItem(READING, view.activity!.prompt.item)!.mode;
    }
    expect(modes).toEqual({ 'read-touch': 'touch', 'read-ride': 'ride', 'read-order': 'ride', 'read-touch-cards': 'touch', 'read-cards': 'choose' });
    // The touch jump's things are all drawn on its landing's art (boxes): they can be touched there.
    const boxed = (itemId: string) => {
      const words = readingItem(READING, itemId)!;
      return Object.keys(words.options!).map((id) => Boolean(landingObjects(LANDINGS, words.floor!).find((o) => o.id === id)?.box));
    };
    expect(boxed(JUMPS.find((j) => j.id === 'read-touch')!.item!)).not.toContain(false);
    // The fallback jump's landing does not draw them all, so the screen offers the same options as cards.
    expect(boxed(JUMPS.find((j) => j.id === 'read-touch-cards')!.item!)).toContain(false);
    expect(await events(ctx)).toBe(0);
  });

  it('reading scenarios reach their states in the answer window, and record nothing', async () => {
    const want: Record<string, (v: ReturnType<Awaited<ReturnType<typeof headlessDriver>>['view']>) => unknown> = {
      'read-touch': (v) => ({ mode: v.reading?.mode, open: v.reading?.open, accepting: v.reading?.accepting, at: v.elevator.floor === v.reading?.floor, targets: v.answerTargets?.objects.length }),
      'read-touch-folded': (v) => ({ open: v.reading?.open, accepting: v.reading?.accepting, targets: v.answerTargets?.floor === v.elevator.floor }),
      'read-ride': (v) => ({ mode: v.reading?.mode, open: v.reading?.open, panel: v.elevator.panelEnabled }),
      'read-ride-folded': (v) => ({ open: v.reading?.open, panel: v.elevator.panelEnabled }),
      'read-cards': (v) => ({ mode: v.reading?.mode, open: v.reading?.open, cards: (v.reading?.options.length ?? 0) >= 2 }),
      'read-cards-folded': (v) => ({ open: v.reading?.open, accepting: v.reading?.accepting }),
      'read-touch-cards': (v) => ({ mode: v.reading?.mode, floor: v.elevator.floor, open: v.reading?.open, accepting: v.reading?.accepting }),
      'read-clue': (v) => ({ open: v.reading?.open, clue: v.reading?.highlight !== null, shown: v.reading?.options.filter((o) => o.shown).length }),
      'read-show-me': (v) => ({ open: v.reading?.open, shown: v.reading?.options.filter((o) => o.shown).length, targets: v.answerTargets?.objects.length }),
    };
    const expected: Record<string, unknown> = {
      'read-touch': { mode: 'touch', open: true, accepting: true, at: true, targets: 3 },
      'read-touch-folded': { open: false, accepting: true, targets: true },
      'read-ride': { mode: 'ride', open: true, panel: true },
      'read-ride-folded': { open: false, panel: true },
      'read-cards': { mode: 'choose', open: true, cards: true },
      'read-cards-folded': { open: false, accepting: true },
      'read-touch-cards': { mode: 'touch', floor: 1, open: false, accepting: true },
      'read-clue': { open: true, clue: true, shown: 0 },
      'read-show-me': { open: false, shown: 1, targets: 1 },
    };
    const got: Record<string, unknown> = {};
    for (const id of Object.keys(want)) {
      const own = tempDir();
      const h = await headlessDriver(own.file);
      await SCENARIOS.find((x) => x.id === id)!.run(h.driver);
      got[id] = want[id]!(h.view());
      expect(await events(h.ctx)).toBe(0); // help asked for is checkpoint state; no attempt until an answer
      await h.close();
      own.cleanup();
    }
    expect(got).toEqual(expected);
  });

  it('simulated misses reach the correction (the shipped policy: the first miss) without writing evidence', async () => {
    const ctx = await setup(tmp.file);
    const learner = await activeTestLearner(ctx.runtime, 'learner-test-a', THEME_PACK_ID);
    expect(thresholds(ctx.content)).toEqual({ visual: 3, rescue: 1 });
    const id = await jumpTo(ctx, learner, 'practice');
    const r = await simulateMisses(ctx, learner, id, 3, 'untagged');
    expect(r).toEqual({ misses: 1, rescue: true }); // stops where the correction starts
    expect(ctx.runtime.currentView(id).view.activity!.rescue).toMatchObject({ status: 'active', source: 'target', returnTo: 'fresh' });
    expect(await events(ctx)).toBe(0);
  });

  it('on the encounter (generic policy) they reach the visual tool, then a misconception-specific test run', async () => {
    const ctx = await setup(tmp.file);
    const learner = await activeTestLearner(ctx.runtime, 'learner-test-b', THEME_PACK_ID);
    const t = thresholds(ctx.content, 'encounter.clues-only');
    expect(t.rescue).toBe(5);
    const id = await jumpTo(ctx, learner, 'route');
    await simulateMisses(ctx, learner, id, 2, { tag: 'quantity.countedStartingPosition' });
    expect(ctx.runtime.currentView(id).view.activity!.rescue).toBeNull();
    const r = await simulateMisses(ctx, learner, id, 3, { tag: 'quantity.countedStartingPosition' });
    expect(r).toEqual({ misses: 3, rescue: true });
    expect(ctx.runtime.currentView(id).view.activity!.rescue).toMatchObject({ source: 'parallel', focus: 'quantity.countedStartingPosition' });
    expect(await events(ctx)).toBe(0);
  });

  it('reset starts an empty generation for one profile only; nothing is deleted', async () => {
    const ctx = await setup(tmp.file);
    const a1 = await activeTestLearner(ctx.runtime, 'learner-test-a', THEME_PACK_ID);
    const b1 = await activeTestLearner(ctx.runtime, 'learner-test-b', THEME_PACK_ID);
    await ctx.runtime.putSetting(a1, 'motion', 'reduced');
    await ctx.runtime.putSetting(b1, 'output', 'quiet');
    const before = await inspectLearner(ctx, b1);

    const a2 = await resetTestLearner(ctx.runtime, 'learner-test-a', THEME_PACK_ID);
    expect(a2).toBe('learner-test-a-g2');
    expect(await currentGeneration(ctx.runtime, 'learner-test-a')).toBe(2);
    expect(await activeTestLearner(ctx.runtime, 'learner-test-a', THEME_PACK_ID)).toBe(a2);
    expect(await ctx.runtime.settings(a2)).toEqual({});
    expect(await ctx.runtime.settings(a1)).toEqual({ motion: 'reduced' }); // kept, unreachable from the tools
    expect(await activeTestLearner(ctx.runtime, 'learner-test-b', THEME_PACK_ID)).toBe(b1);
    expect(await inspectLearner(ctx, b1)).toEqual(before);
  });

  it('test learners stay isolated from each other', async () => {
    const ctx = await setup(tmp.file);
    const a = await activeTestLearner(ctx.runtime, 'learner-test-a', THEME_PACK_ID);
    const b = await activeTestLearner(ctx.runtime, 'learner-test-b', THEME_PACK_ID);
    const id = await jumpTo(ctx, a, 'practice');
    await simulateMisses(ctx, a, id, 2, 'any');
    expect(await ctx.runtime.findActiveMission(b, 'positions-and-capacity')).toBeNull();
    expect((await inspectLearner(ctx, b)).attempts).toBe(0);
    await expect(simulateMisses(ctx, b, id, 1, 'any')).rejects.toThrow(/another learner/);
  });

  it('inspection reports placement, settings, unlocks, and skills read-only', async () => {
    const ctx = await setup(tmp.file);
    const a = await activeTestLearner(ctx.runtime, 'learner-test-a', THEME_PACK_ID);
    const before = await events(ctx);
    const i = await inspectLearner(ctx, a);
    expect(i.placement).toMatchObject({ source: 'assumption', unlockedSkills: ['math.add.within20', 'math.sub.within20', 'math.count.skip.within20', 'math.placeValue.teens', 'math.compare.within20'] });
    expect(i.skills.length).toBeGreaterThan(0);
    expect(i).toMatchObject({ unlocks: [], settings: {}, attempts: 0, completions: 0, lastAttempt: null });
    expect(await events(ctx)).toBe(before);
  });

  it('seedMissionAt refuses to reuse an instance id', async () => {
    const ctx = await setup(tmp.file);
    const a = await activeTestLearner(ctx.runtime, 'learner-test-a', THEME_PACK_ID);
    const input = { learnerId: a, themePack: 'any-theme', missionId: 'positions-and-capacity', instanceId: 'x', seedBase: 's', stepIndex: 1, at: 1 };
    await seedMissionAt(ctx.db, ctx.runtime, ctx.content, input);
    await expect(seedMissionAt(ctx.db, ctx.runtime, ctx.content, input)).rejects.toThrow(/already exists/);
  });
});
