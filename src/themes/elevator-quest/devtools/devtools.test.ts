// Developer tools act only on test learners, and never write learning evidence themselves.
import { openNodeDatabase } from '../../../persistence/testing/nodeDatabase';
import { activeTestLearner, currentGeneration, isTestLearner, resetTestLearner, seedMissionAt } from '../../../runtime/devSeed';
import { openGameRuntime } from '../../../runtime/gameRuntime';
import { count, fakeClock } from '../../../runtime/testing/harness';
import { CONTENT, tempDir } from '../testing/headless';
import { JUMPS, inspectLearner, jumpTo, restartMission, simulateMisses, thresholds, type DevContext } from './floor15Tools';

const events = (ctx: DevContext) => count(ctx.db, 'SELECT COUNT(*) AS n FROM learning_events');

async function setup(file: string): Promise<DevContext> {
  const db = openNodeDatabase(file);
  const clock = fakeClock();
  const runtime = await openGameRuntime(db, CONTENT, clock);
  return { db, runtime, content: CONTENT, now: () => clock.now() };
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
    const learner = await activeTestLearner(ctx.runtime, 'learner-test-a');
    const signatures: string[] = [];
    for (const j of JUMPS) {
      const id = await jumpTo(ctx, learner, j.id);
      const { view } = await ctx.runtime.activate(id);
      expect(view.step?.id).toBe(['intro', 'cued-moves', 'second-representation', 'reference-stretch', 'capacity-encounter', 'capacity-encounter', 'finale'][JUMPS.indexOf(j)]);
      if (j.id === 'cargo') expect(view.activity?.concept).toBe('fillToCapacity');
      if (view.activity) signatures.push(view.activity.itemSignature);
    }
    expect(await events(ctx)).toBe(0);
    const again = await jumpTo(ctx, learner, 'practice');
    expect((await ctx.runtime.activate(again)).view.activity!.itemSignature).toBe(signatures[0]);
  });

  it('simulated misses reach the visual tool and Concept Rescue without writing evidence', async () => {
    const ctx = await setup(tmp.file);
    const learner = await activeTestLearner(ctx.runtime, 'learner-test-a');
    const t = thresholds(ctx.content);
    expect(t).toEqual({ visual: 3, rescue: 5 });
    const id = await jumpTo(ctx, learner, 'practice');
    await simulateMisses(ctx, learner, id, t.visual!, 'untagged');
    expect(ctx.runtime.currentView(id).view.activity!.scaffolds.available[0]).toMatchObject({ kind: 'highlightGiven', mode: 'offer' });
    const r = await simulateMisses(ctx, learner, id, 10, 'untagged');
    expect(r.rescue).toBe(true);
    const rescue = ctx.runtime.currentView(id).view.activity!.rescue!;
    expect(rescue.status).toBe('active');
    expect(rescue.focus).toBeNull(); // scattered, untagged misses: the general explanation
    expect(await events(ctx)).toBe(0);
  });

  it('a misconception-specific rescue appears when the misses share a tag', async () => {
    const ctx = await setup(tmp.file);
    const learner = await activeTestLearner(ctx.runtime, 'learner-test-b');
    const id = await jumpTo(ctx, learner, 'practice');
    const r = await simulateMisses(ctx, learner, id, 5, { tag: 'quantity.countedStartingPosition' });
    expect(r).toEqual({ misses: 5, rescue: true });
    expect(ctx.runtime.currentView(id).view.activity!.rescue!.focus).toBe('quantity.countedStartingPosition');
    expect(await events(ctx)).toBe(0);
  });

  it('reset starts an empty generation for one profile only; nothing is deleted', async () => {
    const ctx = await setup(tmp.file);
    const a1 = await activeTestLearner(ctx.runtime, 'learner-test-a');
    const b1 = await activeTestLearner(ctx.runtime, 'learner-test-b');
    await ctx.runtime.putSetting(a1, 'motion', 'reduced');
    await ctx.runtime.putSetting(b1, 'output', 'quiet');
    const before = await inspectLearner(ctx, b1);

    const a2 = await resetTestLearner(ctx.runtime, 'learner-test-a');
    expect(a2).toBe('learner-test-a-g2');
    expect(await currentGeneration(ctx.runtime, 'learner-test-a')).toBe(2);
    expect(await activeTestLearner(ctx.runtime, 'learner-test-a')).toBe(a2);
    expect(await ctx.runtime.settings(a2)).toEqual({});
    expect(await ctx.runtime.settings(a1)).toEqual({ motion: 'reduced' }); // kept, unreachable from the tools
    expect(await activeTestLearner(ctx.runtime, 'learner-test-b')).toBe(b1);
    expect(await inspectLearner(ctx, b1)).toEqual(before);
  });

  it('test learners stay isolated from each other', async () => {
    const ctx = await setup(tmp.file);
    const a = await activeTestLearner(ctx.runtime, 'learner-test-a');
    const b = await activeTestLearner(ctx.runtime, 'learner-test-b');
    const id = await jumpTo(ctx, a, 'practice');
    await simulateMisses(ctx, a, id, 2, 'any');
    expect(await ctx.runtime.findActiveMission(b, 'positions-and-capacity')).toBeNull();
    expect((await inspectLearner(ctx, b)).attempts).toBe(0);
    await expect(simulateMisses(ctx, b, id, 1, 'any')).rejects.toThrow(/another learner/);
  });

  it('inspection reports placement, settings, unlocks, and skills read-only', async () => {
    const ctx = await setup(tmp.file);
    const a = await activeTestLearner(ctx.runtime, 'learner-test-a');
    const before = await events(ctx);
    const i = await inspectLearner(ctx, a);
    expect(i.placement).toMatchObject({ source: 'assumption', unlockedSkills: ['math.add.within20', 'math.sub.within20'] });
    expect(i.skills.length).toBeGreaterThan(0);
    expect(i).toMatchObject({ unlocks: [], settings: {}, attempts: 0, completions: 0, lastAttempt: null });
    expect(await events(ctx)).toBe(before);
  });

  it('seedMissionAt refuses to reuse an instance id', async () => {
    const ctx = await setup(tmp.file);
    const a = await activeTestLearner(ctx.runtime, 'learner-test-a');
    const input = { learnerId: a, missionId: 'positions-and-capacity', instanceId: 'x', seedBase: 's', stepIndex: 1, at: 1 };
    await seedMissionAt(ctx.db, ctx.runtime, ctx.content, input);
    await expect(seedMissionAt(ctx.db, ctx.runtime, ctx.content, input)).rejects.toThrow(/already exists/);
  });
});
