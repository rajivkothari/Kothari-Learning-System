// The same runtime, persistence, and progression path with a literacy mission:
// string answers, a phonics help sequence, and literacy misconceptions.
import { canonicalJson, type PresentationIntent } from '../engine';
import { correctOption, count, fakeClock, finish, open, tempDir, wrongOption } from './testing/harness';

const of = <T extends PresentationIntent['type']>(intents: PresentationIntent[], type: T) => intents.filter((i): i is Extract<PresentationIntent, { type: T }> => i.type === type);

describe('literacy mission through the runtime', () => {
  it('records phonics help and literacy misconceptions, and completes at the mission tier', async () => {
    const tmp = tempDir();
    const clock = fakeClock();
    let { db, rt } = await open(tmp.file, clock);
    const id = 'mission-instance-lit';
    await rt.createLearner({ id: 'learner-b', themePack: 'theme.story' });

    const started = await rt.startMission({ learnerId: 'learner-b', missionId: 'first-sounds', instanceId: id });
    const activity = of(started.intents, 'SHOW_ACTIVITY')[0]!.activity;
    expect(activity).toMatchObject({ concept: 'beginningSoundOfWord', representation: 'pictureWord', item: { index: 0, count: 3 } });
    expect(typeof activity.prompt.word).toBe('string');
    expect(activity.options.every((o) => typeof o.value === 'string' && /^[a-z]$/.test(o.value))).toBe(true);
    // Hearing the word again is available before any mistake, on request only.
    expect(activity.scaffolds.available).toEqual([expect.objectContaining({ stepId: 'replay-word', assistance: 'verbalHint', mode: 'available' })]);

    const heard = await rt.useScaffold(id, { commandId: 'l1', scaffoldStepId: 'replay-word' });
    expect(of(heard.intents, 'SCAFFOLD_SHOWN')[0]?.scaffold.kind).toBe('replayWord');

    const wrong = await rt.submit(id, { commandId: 'l2', optionId: await wrongOption(rt, id, true) });
    expect(of(wrong.intents, 'RESPONSE_RESULT')[0]).toMatchObject({ correct: false, feedbackKey: expect.stringMatching(/^misconception:literacy\./) });

    // Restart between the miss and the answer: the same word comes back.
    const before = await rt.view(id);
    await db.close();
    ({ db, rt } = await open(tmp.file, clock));
    expect(canonicalJson(await rt.view(id))).toBe(canonicalJson(before));

    await rt.submit(id, { commandId: 'l3', optionId: await correctOption(rt, id) });
    const rest = await finish(rt, id, 'lit');
    expect(of(rest, 'MISSION_COMPLETE')).toEqual([{ type: 'MISSION_COMPLETE', missionId: 'first-sounds' }]);

    const first = JSON.parse((await db.get<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq LIMIT 1"))!.payload);
    expect(first).toMatchObject({ outcome: 'correct', wrongTries: 1, assistance: 'verbalHint', skillIds: ['literacy.sound.beginning'], misconceptions: [expect.stringMatching(/^literacy\./)] });

    expect(await count(db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'")).toBe(3);
    const progression = (await db.all<{ id: string }>('SELECT id FROM progression_events')).map((r) => r.id);
    expect(progression).toContain('learner-b|mission:first-sounds->low');

    const replay = await rt.replayFromHistory('learner-b');
    expect(canonicalJson(await rt.learnerState('learner-b'))).toBe(canonicalJson(replay.state));
    expect(replay.state.skills['literacy.sound.beginning']?.dimensions.accuracy.successes).toBeGreaterThan(0);

    await db.close();
    tmp.cleanup();
  });
});
