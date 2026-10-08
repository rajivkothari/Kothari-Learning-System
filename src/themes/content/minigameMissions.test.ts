/// <reference types="node" />
// The mini-game missions (M9) through the real runtime and SQLite, with the app's content: what a
// finished game grants, and that it leaves the elevator's own mission and progression alone.
import { MissionPackSchema, type PresentationIntent } from '../../engine';
import coreMissions from '../../../content/missions/core.json';
import { openNodeDatabase } from '../../persistence/testing/nodeDatabase';
import { openGameRuntime, type GameRuntime } from '../../runtime/gameRuntime';
import { fakeClock, rightAnswer, tempDir, wrongAnswer } from '../../runtime/testing/harness';
import { loadElevatorQuestContent } from '../elevator-quest/appContent';
import { cargoActivities, chooseCargoSession } from '../elevator-quest/minigames/cargo/tiers';

const LEARNER = 'learner-games';
const MISSIONS = MissionPackSchema.parse(coreMissions).missions;

async function play(rt: GameRuntime, instanceId: string, prefix: string, missFirst = false): Promise<PresentationIntent[]> {
  const intents: PresentationIntent[] = [];
  for (let n = 0; n < 40; n++) {
    const view = await rt.view(instanceId);
    if (view.status === 'completed') return intents;
    await rt.activate(instanceId);
    if (missFirst && n === 0) intents.push(...(await rt.submit(instanceId, { commandId: `${prefix}-miss`, ...wrongAnswer(rt, instanceId) })).intents);
    intents.push(...(await rt.submit(instanceId, { commandId: `${prefix}-${n}`, ...rightAnswer(rt, instanceId) })).intents);
  }
  throw new Error('Mission did not finish');
}

describe('mini-game missions', () => {
  it('word-golf and cargo-commander are version 1, low tier, activity steps only (three holes, five deliveries)', () => {
    const golf = MISSIONS.find((m) => m.id === 'word-golf')!;
    const cargo = MISSIONS.find((m) => m.id === 'cargo-commander')!;
    expect([golf.version, golf.completionTier, golf.steps.map((s) => s.id)]).toEqual([1, 'low', ['hole-1', 'hole-2', 'hole-3']]);
    expect([cargo.version, cargo.completionTier, cargo.steps.length]).toEqual([1, 'low', 5]);
    for (const s of [...golf.steps, ...cargo.steps]) expect(s).toMatchObject({ kind: 'activity', items: 1 });
  });

  it('finishing a game records its evidence and completion, grants no unlock, and leaves the elevator mission as it was', async () => {
    const dir = tempDir();
    try {
      const clock = fakeClock();
      const content = loadElevatorQuestContent();
      const rt = await openGameRuntime(openNodeDatabase(dir.file), content, clock);
      await rt.createLearner({ id: LEARNER, themePack: 'elevator-quest' });
      // The elevator's mission is open first, as in play.
      await rt.startMission({ learnerId: LEARNER, missionId: 'positions-and-capacity', instanceId: 'floor15-1' });
      const floor15Before = await rt.resume('floor15-1');

      await rt.startMission({ learnerId: LEARNER, missionId: 'word-golf', instanceId: 'word-golf-1' });
      const golf = await play(rt, 'word-golf-1', 'g', true);
      const cargoMission = content.missions.find((m) => m.id === 'cargo-commander')!;
      const plan = chooseCargoSession({ base: 'cargo-commander-1', state: await rt.learnerState(LEARNER), mission: cargoMission, activities: cargoActivities(cargoMission, content.pack) });
      await rt.startMission({ learnerId: LEARNER, missionId: 'cargo-commander', instanceId: plan.instanceId });
      expect((await rt.view(plan.instanceId)).activity?.activityId).toBe(plan.activities[0]);
      const cargo = await play(rt, plan.instanceId, 'c');

      for (const intents of [golf, cargo]) {
        expect(intents.filter((i) => i.type === 'UNLOCK_GRANTED')).toEqual([]);
        expect(intents.filter((i) => i.type === 'MISSION_COMPLETE')).toHaveLength(1);
      }
      expect(await rt.unlocks(LEARNER)).toEqual([]);
      // Progression: at most a low mission-complete per game (plus skill peaks, if any were reached).
      const upgrades = await rt.progressionEvents(LEARNER);
      for (const u of upgrades) expect(['missionComplete', 'levelPeak']).toContain(u.kind);
      for (const u of upgrades.filter((x) => x.kind === 'missionComplete')) expect([u.toTier, u.ceiling]).toEqual(['low', 'low']);
      // The elevator's own instance is untouched: same view, same revision, still active.
      const floor15After = await rt.resume('floor15-1');
      expect(floor15After.revision).toBe(floor15Before.revision);
      expect(floor15After.view).toEqual(floor15Before.view);
      expect(await rt.findActiveMission(LEARNER, 'positions-and-capacity')).toBe('floor15-1');
      // The spelled words and the weighed loads are evidence for their own skills.
      const state = await rt.learnerState(LEARNER);
      const practised = Object.values(state.skills).filter((s) => s.dimensions.accuracy.scored > 0).map((s) => s.skillId);
      expect(practised.some((s) => s.startsWith('ela.spelling.'))).toBe(true);
      expect(practised.some((s) => s.includes('twoDigit'))).toBe(true);
      expect(practised.some((s) => !s.startsWith('ela.spelling.') && !s.includes('twoDigit'))).toBe(false);
    } finally {
      dir.cleanup();
    }
  });
});
