// Headless end-to-end flow: no React Native, no rendering. Real SQLite file.
import { canonicalJson, type PresentationIntent } from '../engine';
import { count, correctOption, fakeClock, finish, open, tempDir, wrongOption } from './testing/harness';

const of = <T extends PresentationIntent['type']>(intents: PresentationIntent[], type: T) => intents.filter((i): i is Extract<PresentationIntent, { type: T }> => i.type === type);

describe('full mission flow with persistence', () => {
  it('runs, survives a reopen, resumes the same item, and records everything exactly once', async () => {
    const tmp = tempDir();
    const clock = fakeClock();
    let { db, rt } = await open(tmp.file, clock);
    const id = 'mission-instance-1';

    // 1. Create learner (neutral id; display names are only ever entered on device).
    await rt.createLearner({ id: 'learner-a', themePack: 'theme.quantity' });

    // 2. Start mission.
    const started = await rt.startMission({ learnerId: 'learner-a', missionId: 'positions-and-loads', instanceId: id });
    expect(started.intents.map((i) => i.type)).toEqual(['MISSION_STARTED', 'SHOW_NARRATIVE']);
    const intro = await rt.acknowledge(id, { commandId: 'c1' });

    // 3. Inspect the first generated activity.
    const first = of(intro.intents, 'SHOW_ACTIVITY')[0]!.activity;
    expect(first).toMatchObject({ stepId: 'cued-practice', concept: 'positionAfterMove', challenge: 'practice', item: { index: 0, count: 2 } });

    // 4-5. Wrong, misconception-tagged answer -> useful outcome.
    const wrong = await rt.submit(id, { commandId: 'c2', optionId: await wrongOption(rt, id, true) });
    expect(of(wrong.intents, 'RESPONSE_RESULT')[0]).toMatchObject({ correct: false, retryAllowed: true, feedbackKey: expect.stringMatching(/^misconception:quantity\./) });
    expect(of(wrong.intents, 'WORLD_EVENT')[0]).toMatchObject({ concept: 'positionAfterMove', correct: false });

    // 6. Retry (still wrong; an untagged option if the item has one).
    const retry = await rt.submit(id, { commandId: 'c3', optionId: await wrongOption(rt, id, false) });
    expect(of(retry.intents, 'RESPONSE_RESULT')[0]?.retryAllowed).toBe(true);
    // Two misses: the policy now OFFERS its next help step, but nothing is forced.
    const available = (await rt.view(id)).activity!.scaffolds.available;
    expect(available).toHaveLength(1);

    // 7. Request and use a scaffold.
    const help = await rt.useScaffold(id, { commandId: 'c4', scaffoldStepId: available[0]!.stepId });
    expect(of(help.intents, 'SCAFFOLD_SHOWN')[0]?.scaffold.stepId).toBe(available[0]!.stepId);

    // 8. Solve.
    const solved = await rt.submit(id, { commandId: 'c5', optionId: await correctOption(rt, id) });
    expect(of(solved.intents, 'RESPONSE_RESULT')[0]?.correct).toBe(true);

    // 9-10. Advance through the rest of the first step and the second step.
    await rt.submit(id, { commandId: 'c6', optionId: await correctOption(rt, id) });
    const step2 = await rt.submit(id, { commandId: 'c7', optionId: await correctOption(rt, id) });
    expect(of(step2.intents, 'STEP_COMPLETE')[0]?.stepId).toBe('second-representation');
    const before = await rt.view(id);
    expect(before.activity?.stepId).toBe('uncued-stretch');

    // 11-12. Close and reopen.
    await db.close();
    ({ db, rt } = await open(tmp.file, clock));

    // 13-14. Resume: same mission, same generated item.
    const resumed = await rt.resume(id);
    expect(of(resumed.intents, 'SHOW_ACTIVITY')[0]!.activity.itemSignature).toBe(before.activity!.itemSignature);
    expect(canonicalJson(resumed.view)).toBe(canonicalJson(before));

    // 15. Finish.
    const rest = await finish(rt, id, 'end');
    expect(of(rest, 'MISSION_COMPLETE')).toHaveLength(1);

    // 16. Mission completion written once, even if the last command is retried.
    const missionCompletions = () => count(db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'completion' AND id LIKE 'completion:mission:%'");
    expect(await missionCompletions()).toBe(1);
    const lastCmd = (await db.get<{ last_command_id: string }>('SELECT last_command_id FROM mission_instances WHERE id = ?', [id]))!.last_command_id;
    const rows = await count(db, 'SELECT COUNT(*) AS n FROM learning_events');
    const again = await rt.acknowledge(id, { commandId: lastCmd });
    expect(again.duplicate).toBe(true);
    expect(of(again.intents, 'MISSION_COMPLETE')).toHaveLength(1); // the stored result is returned again
    expect(await count(db, 'SELECT COUNT(*) AS n FROM learning_events')).toBe(rows);
    expect(await missionCompletions()).toBe(1);

    // 17. Learning evidence exists: 2 + 1 + 1 + 2 attempts, wrong tries and help recorded on the first.
    expect(await count(db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(6);
    const firstAttempt = JSON.parse((await db.get<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq LIMIT 1"))!.payload);
    expect(firstAttempt).toMatchObject({ wrongTries: 2, misconceptions: expect.arrayContaining([expect.stringMatching(/^quantity\./)]), outcome: 'correct' });
    expect(['clue', 'visualSupport']).toContain(firstAttempt.assistance);

    // 18. Derived state matches a full replay of the source of truth.
    const replay = await rt.replayFromHistory('learner-a');
    expect(canonicalJson(await rt.learnerState('learner-a'))).toBe(canonicalJson(replay.state));
    const cache = await db.get<{ state: string }>("SELECT state FROM derived_cache WHERE learner_id = 'learner-a'");
    expect(canonicalJson(JSON.parse(cache!.state))).toBe(canonicalJson(replay.exported));

    // 19. Progression upgrades are not duplicated, even after a cache rebuild and reopen.
    const ids = async () => (await db.all<{ id: string }>('SELECT id FROM progression_events')).map((r) => r.id);
    const firstIds = await ids();
    expect(firstIds).toContain('learner-a|mission:positions-and-loads->normal');
    expect(new Set(firstIds).size).toBe(firstIds.length);
    await rt.rebuildCache('learner-a');
    await db.close();
    ({ db, rt } = await open(tmp.file, clock));
    await rt.acknowledge(id, { commandId: lastCmd });
    expect(await ids()).toEqual(firstIds);

    // 20. No Quest Token currency exists yet: no ledger table, no token or currency fields.
    const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((t) => t.name);
    expect(tables.some((t) => /token|ledger|currency|wallet|balance/i.test(t))).toBe(false);
    expect(JSON.stringify(rest)).not.toMatch(/token|currency|coins?\b/i);

    await db.close();
    tmp.cleanup();
  });
});
