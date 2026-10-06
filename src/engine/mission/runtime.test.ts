import { canonicalJson } from '../random/hash';
import { MISSION_CTX, PACK, T0 } from '../testing/support';
import { validateMissionPack } from '../validation/validateMissions';
import sampleMissions from '../../../content/fixtures/sample-missions.json';
import { applyCommand, currentItem, describeMission, itemSeed, resumeIntents, startMission, type MissionCommand, type MissionState } from './runtime';

const start = (instanceId = 'mi-1') => startMission(MISSION_CTX, { instanceId, missionId: 'positions-and-loads', missionVersion: 1, learnerId: 'learner-a', at: T0 });

let n = 0;
const cmd = <T extends MissionCommand['type']>(type: T, extra: object = {}): MissionCommand => ({ type, commandId: `c${++n}`, at: T0 + n * 1000, ...extra }) as MissionCommand;
const correctId = (state: MissionState) => currentItem(MISSION_CTX, state)!.correctOptionId;
const wrongId = (state: MissionState, tagged = true) => {
  const item = currentItem(MISSION_CTX, state)!;
  const opts = item.response.options.filter((o) => !o.correct);
  return (opts.find((o) => (tagged ? o.misconception : !o.misconception)) ?? opts[0])!.id;
};

describe('mission runtime', () => {
  it('validates the sample missions against the content pack', () => {
    expect(validateMissionPack(sampleMissions, PACK)).toMatchObject({ ok: true, issues: [] });
  });

  it('starts on the intro narrative and moves to the first activity on acknowledge', () => {
    const s = start();
    expect(s.intents.map((i) => i.type)).toEqual(['MISSION_STARTED', 'SHOW_NARRATIVE']);
    const r = applyCommand(MISSION_CTX, s.state, cmd('acknowledge'));
    expect(r.intents.map((i) => i.type)).toEqual(['STEP_COMPLETE', 'SHOW_ACTIVITY']);
    const show = r.intents[1] as Extract<(typeof r.intents)[number], { type: 'SHOW_ACTIVITY' }>;
    expect(show.activity).toMatchObject({ stepId: 'cued-practice', concept: 'positionAfterMove', challenge: 'practice', item: { index: 0, count: 2 } });
    expect(show.activity.options.every((o) => !('correct' in o))).toBe(true); // answers are not leaked to the UI
  });

  it('generates the same item for the same instance, and seeds from stable inputs only', () => {
    const a = applyCommand(MISSION_CTX, start('same').state, cmd('acknowledge'));
    const b = applyCommand(MISSION_CTX, start('same').state, cmd('acknowledge'));
    expect(a.state.item?.signature).toBe(b.state.item?.signature);
    expect(a.state.item?.seed).toBe(itemSeed(a.state, 'cued-practice', 0, 0, 0));
    expect(a.state.item?.seed).toBe('same|positions-and-loads@1|cued-practice|stage0|item0|gen0');
  });

  it('a serialized state resumes to an identical view', () => {
    const s = applyCommand(MISSION_CTX, start().state, cmd('acknowledge')).state;
    const restored = JSON.parse(JSON.stringify(s)) as MissionState;
    expect(canonicalJson(describeMission(MISSION_CTX, restored))).toBe(canonicalJson(describeMission(MISSION_CTX, s)));
    expect(resumeIntents(MISSION_CTX, restored)[0]?.type).toBe('SHOW_ACTIVITY');
  });

  it('a wrong, misconception-tagged answer gives useful feedback, a world consequence, and no evidence yet', () => {
    const s = applyCommand(MISSION_CTX, start().state, cmd('acknowledge')).state;
    const r = applyCommand(MISSION_CTX, s, cmd('submit', { optionId: wrongId(s) }));
    expect(r.intents[0]).toMatchObject({ type: 'RESPONSE_RESULT', correct: false, retryAllowed: true, feedbackKey: expect.stringMatching(/^misconception:quantity\./) });
    expect(r.intents[1]).toMatchObject({ type: 'WORLD_EVENT', concept: 'positionAfterMove', correct: false });
    expect(r.events).toEqual([]);
    expect(r.state.item).toMatchObject({ wrongTries: 1, misconceptions: [expect.stringMatching(/^quantity\./)] });
  });

  it('offers help in policy order, and the learner may also retry without it', () => {
    let s = applyCommand(MISSION_CTX, start().state, cmd('acknowledge')).state;
    expect(describeMission(MISSION_CTX, s).activity?.scaffolds.available).toEqual([expect.objectContaining({ stepId: 'highlight-start', mode: 'available' })]);
    expect(applyCommand(MISSION_CTX, s, cmd('useScaffold', { scaffoldStepId: 'number-line' })).intents).toEqual([{ type: 'RESPONSE_REJECTED', reason: 'scaffoldUnavailable' }]);
    const used = applyCommand(MISSION_CTX, s, cmd('useScaffold', { scaffoldStepId: 'highlight-start' }));
    expect(used.intents[0]).toMatchObject({ type: 'SCAFFOLD_SHOWN', scaffold: { assistance: 'clue' }, revealedOptionId: null });
    s = used.state;
    const solved = applyCommand(MISSION_CTX, s, cmd('submit', { optionId: correctId(s) }));
    const attempt = solved.events.find((e) => e.type === 'attempt');
    expect(attempt).toMatchObject({ attempt: { assistance: 'clue', outcome: 'correct', missionInstanceId: 'mi-1' } });
  });

  it('a demonstrated answer is recorded as demonstrated, never as independent', () => {
    let s = applyCommand(MISSION_CTX, start().state, cmd('acknowledge')).state;
    for (let i = 0; i < 3; i++) s = applyCommand(MISSION_CTX, s, cmd('submit', { optionId: wrongId(s, false) })).state;
    // The policy now offers its steps in order; take them all to reach the demonstration.
    for (;;) {
      const next = describeMission(MISSION_CTX, s).activity!.scaffolds.available[0];
      if (!next) break;
      const r = applyCommand(MISSION_CTX, s, cmd('useScaffold', { scaffoldStepId: next.stepId }));
      s = r.state;
      if (next.assistance === 'demonstrated') expect(r.intents[0]).toMatchObject({ revealedOptionId: correctId(s) });
    }
    const r = applyCommand(MISSION_CTX, s, cmd('submit', { optionId: correctId(s) }));
    expect(r.events[0]).toMatchObject({ type: 'attempt', attempt: { assistance: 'demonstrated', wrongTries: 3 } });
  });

  it('too many wrong tries resolve the item as incorrect and present a fresh variant (no identical loop)', () => {
    let s = applyCommand(MISSION_CTX, start().state, cmd('acknowledge')).state;
    let r = applyCommand(MISSION_CTX, s, cmd('submit', { optionId: wrongId(s) }));
    for (let i = 0; i < 3; i++) r = applyCommand(MISSION_CTX, r.state, cmd('submit', { optionId: wrongId(r.state) }));
    expect(r.intents.map((i) => i.type)).toEqual(['RESPONSE_RESULT', 'WORLD_EVENT', 'ITEM_REGENERATED', 'SHOW_ACTIVITY']);
    expect(r.events[0]).toMatchObject({ type: 'attempt', attempt: { outcome: 'incorrect', wrongTries: 3 } });
    expect(r.state.item).toMatchObject({ generation: 1, wrongTries: 0 });
    expect(r.state.item!.seed).toContain('gen1');
    // Same difficulty settings, usually a different item; never the same seed.
    expect(r.state.item!.seed).not.toBe(s.item!.seed);
  });

  it('ignores a repeated command id', () => {
    const s = start().state;
    const c = cmd('acknowledge');
    const once = applyCommand(MISSION_CTX, s, c);
    const twice = applyCommand(MISSION_CTX, once.state, c);
    expect(twice).toMatchObject({ duplicate: true, intents: [], events: [] });
    expect(twice.state).toBe(once.state);
  });

  it('runs the whole mission, emitting one completion per step and one for the mission', () => {
    let r = start();
    const allEvents = [...r.events];
    const types: string[] = [];
    while (r.state.status === 'active') {
      const view = describeMission(MISSION_CTX, r.state);
      r = view.narrative ? applyCommand(MISSION_CTX, r.state, cmd('acknowledge')) : applyCommand(MISSION_CTX, r.state, cmd('submit', { optionId: correctId(r.state) }));
      allEvents.push(...r.events);
      types.push(...r.intents.map((i) => i.type));
    }
    const completions = allEvents.filter((e) => e.type === 'completion').map((e) => (e.type === 'completion' ? `${e.completion.kind}:${e.completion.targetId}` : ''));
    expect(completions).toEqual([
      'activity:move-up.practice',
      'activity:move-up.scale.practice',
      'activity:move-either.stretch',
      'encounter:capacity-planning',
      'mission:positions-and-loads',
    ]);
    expect(allEvents.filter((e) => e.type === 'attempt')).toHaveLength(2 + 1 + 1 + 2);
    expect(types.filter((t) => t === 'MISSION_COMPLETE')).toHaveLength(1);
    expect(applyCommand(MISSION_CTX, r.state, cmd('acknowledge')).intents).toEqual([{ type: 'RESPONSE_REJECTED', reason: 'missionComplete' }]);
  });
});
