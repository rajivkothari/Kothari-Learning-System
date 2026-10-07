// Playtest "start over" (D143): the device's learner moves to a fresh generation that has no
// progress, keeps its motion and sound settings, and nothing already recorded is deleted.
import { FLOOR15, THEME_PACK_ID } from './content/floor15';
import { currentLearnerFor, startOverLearner } from './sessionCore';
import { LEARNER, answerCorrectly, openSession, settled, tempDir, virtualTime } from './testing/headless';

describe('start over', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('starts an empty learner, keeps the settings, deletes nothing, and the newest generation is the device', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    s.director.pressDoorOpen();
    await time.runUntil(() => settled(s)() && s.view().stage === 'task');
    await answerCorrectly(s);
    await s.rt.putSetting(LEARNER, 'output', 'quiet');
    await s.rt.putSetting(LEARNER, 'motion', 'reduced');
    const count = async (table: string, learner: string) => (await s.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE learner_id = ?`, [learner]))!.n;
    const before = await count('learning_events', LEARNER);
    expect(before).toBeGreaterThan(0);
    expect(await currentLearnerFor(s.rt, LEARNER)).toBe(LEARNER);

    const second = await startOverLearner(s.rt, LEARNER, THEME_PACK_ID);
    expect(second).toBe(`${LEARNER}-r2`);
    expect(await currentLearnerFor(s.rt, LEARNER)).toBe(second);
    expect(await count('learning_events', second)).toBe(0);
    expect(await s.rt.findActiveMission(second, FLOOR15.missionId)).toBeNull();
    expect(await s.rt.settings(second)).toEqual(expect.objectContaining({ output: 'quiet', motion: 'reduced' }));
    // The first save is still there, untouched (append-only history).
    expect(await count('learning_events', LEARNER)).toBe(before);

    expect(await startOverLearner(s.rt, LEARNER, THEME_PACK_ID)).toBe(`${LEARNER}-r3`);
    expect(await currentLearnerFor(s.rt, LEARNER)).toBe(`${LEARNER}-r3`);
    s.director.dispose();
    await s.db.close();
  });
});
