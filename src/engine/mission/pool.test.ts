// Mission pools: an activity step may list several activities; each instance presents one,
// chosen deterministically from the seed base, the mission key and the step id.
import { canonicalJson } from '../random/hash';
import { MISSION_CTX, PACK, T0 } from '../testing/support';
import { validateMissionPack } from '../validation/validateMissions';
import { poolChoice, stepActivityIds } from './pool';
import { applyCommand, currentItem, describeMission, missionCompatibility, startMission, startMissionAt, type MissionContext, type MissionState } from './runtime';
import { MissionDefinitionSchema, MissionPackSchema, missionKey, type ActivityStep } from './schema';

const POOL = ['move-up.practice', 'move-down.practice', 'move-either.stretch'];

const missionPack = (steps: unknown[]) => ({
  schemaVersion: 1,
  id: 'pool-missions',
  version: 'test',
  missions: [{ schemaVersion: 1, id: 'pooled', version: 1, title: 'Pool test', completionTier: 'low', steps }],
});
const RAW = missionPack([
  { kind: 'activity', id: 'mixed', activityIds: POOL, items: 2 },
  { kind: 'activity', id: 'fixed', activityId: 'move-up.scale.practice' },
]);
const CTX: MissionContext = { ...MISSION_CTX, missions: MissionPackSchema.parse(RAW).missions };
const KEY = missionKey('pooled', 1);
const POOL_STEP = MissionPackSchema.parse(RAW).missions[0]!.steps[0]! as ActivityStep;

const start = (seedBase: string, instanceId = `i-${seedBase}`) => startMission(CTX, { instanceId, seedBase, missionId: 'pooled', missionVersion: 1, learnerId: 'learner-a', at: T0 });
let n = 0;
const at = () => T0 + ++n * 1000;
const right = (s: MissionState) => applyCommand(CTX, s, { type: 'submit', commandId: `c${++n}`, optionId: currentItem(CTX, s)!.correctOptionId, at: at() });
const wrong = (s: MissionState) => applyCommand(CTX, s, { type: 'submit', commandId: `c${++n}`, optionId: currentItem(CTX, s)!.response.options.find((o) => !o.correct)!.id, at: at() });

describe('mission pool schema and validation', () => {
  const step = (extra: object) => MissionDefinitionSchema.safeParse({ schemaVersion: 1, id: 'm', version: 1, title: 't', completionTier: 'low', steps: [{ kind: 'activity', id: 's', ...extra }] });

  it('takes a single activity or a pool of two or more, never both or neither', () => {
    expect(step({ activityId: 'a' }).success).toBe(true);
    expect(step({ activityIds: ['a', 'b'] }).success).toBe(true);
    expect(step({}).success).toBe(false);
    expect(step({ activityId: 'a', activityIds: ['a', 'b'] }).success).toBe(false);
  });

  it('refuses a pool of one and a member listed twice', () => {
    expect(step({ activityIds: ['a'] }).success).toBe(false);
    expect(step({ activityIds: ['a', 'b', 'a'] }).success).toBe(false);
  });

  it('checks every member against the pack: unknown ids and encounter stages are refused, with the member path', () => {
    expect(validateMissionPack(RAW, PACK)).toMatchObject({ ok: true, issues: [] });
    const bad = missionPack([{ kind: 'activity', id: 'mixed', activityIds: ['move-up.practice', 'nope', 'encounter.capacity.route'] }]);
    const report = validateMissionPack(bad, PACK);
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      expect.objectContaining({ code: 'ref.unknownActivity', path: 'missions[0].steps[0].activityIds[1]' }),
      expect.objectContaining({ code: 'ref.encounterStageAsActivity', path: 'missions[0].steps[0].activityIds[2]' }),
    ]);
    const single = validateMissionPack(missionPack([{ kind: 'activity', id: 'one', activityIds: ['move-up.practice'] }]), PACK);
    expect(single.issues.map((i) => i.code)).toEqual([expect.stringMatching(/^schema\./)]);
  });
});

describe('poolChoice', () => {
  it('is deterministic, and a single activity is always itself', () => {
    expect(poolChoice('seed-a', KEY, POOL_STEP)).toBe(poolChoice('seed-a', KEY, POOL_STEP));
    expect(poolChoice('anything', KEY, { id: 'x', activityId: 'only' })).toBe('only');
    expect(stepActivityIds(POOL_STEP)).toEqual(POOL);
    expect(stepActivityIds({ activityId: 'only' })).toEqual(['only']);
  });

  it('depends on the seed base, the mission key and the step id, and nothing else', () => {
    const picks = (f: (k: number) => string) => new Set(Array.from({ length: 60 }, (_, k) => f(k)));
    expect(picks((k) => poolChoice(`s${k}`, KEY, POOL_STEP)).size).toBe(POOL.length);
    expect(picks((k) => poolChoice('s', `pooled@${k}`, POOL_STEP)).size).toBe(POOL.length);
    expect(picks((k) => poolChoice('s', KEY, { ...POOL_STEP, id: `step-${k}` })).size).toBe(POOL.length);
  });

  it('reaches every member, roughly evenly, across seed bases (property)', () => {
    for (const size of [2, 3, 5, 7]) {
      const ids = Array.from({ length: size }, (_, k) => `a${k}`);
      const counts = new Map<string, number>();
      const seeds = 400 * size;
      for (let k = 0; k < seeds; k++) {
        const id = poolChoice(`base-${k}`, KEY, { id: 'pool', activityIds: ids });
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      expect([...counts.keys()].sort()).toEqual(ids);
      for (const c of counts.values()) expect(c / seeds).toBeGreaterThan(0.7 / size); // no member starved
    }
  });
});

describe('a pool step in a running mission', () => {
  it('presents the chosen activity, names it in the mission view, and records it in the evidence', () => {
    const s = start('alpha');
    const view = describeMission(CTX, s.state);
    const chosen = poolChoice('alpha', KEY, POOL_STEP);
    expect(view.step).toMatchObject({ id: 'mixed', kind: 'activity', activityId: chosen, pool: POOL });
    expect(view.activity).toMatchObject({ stepId: 'mixed', activityId: chosen });
    const r = right(s.state);
    const attempt = r.events.find((e) => e.type === 'attempt');
    expect(attempt).toMatchObject({ attempt: { activityId: chosen, activityInstanceId: 'i-alpha:mixed' } });
    // The next item of the same step stays with the same activity.
    expect(describeMission(CTX, r.state).activity).toMatchObject({ stepId: 'mixed', activityId: chosen, item: { index: 1, count: 2 } });
  });

  it('a single-activity step has no pool in its view', () => {
    let s = start('beta').state;
    s = right(s).state;
    s = right(s).state;
    expect(describeMission(CTX, s).step).toMatchObject({ id: 'fixed', activityId: 'move-up.scale.practice', pool: null });
  });

  it('is stable across resume, restart, misses and regeneration (nothing about the choice is stored)', () => {
    const s = start('gamma');
    const chosen = describeMission(CTX, s.state).activity!.activityId;
    // Resume: a serialized checkpoint describes the same activity and item.
    const restored = JSON.parse(JSON.stringify(s.state)) as MissionState;
    expect(canonicalJson(describeMission(CTX, restored))).toBe(canonicalJson(describeMission(CTX, s.state)));
    expect(missionCompatibility(CTX, restored)).toEqual({ ok: true });
    // Restart with the same seed base (another instance id): the same choice.
    expect(describeMission(CTX, start('gamma', 'other-instance').state).activity!.activityId).toBe(chosen);
    // Misses (a regeneration on the practice policy after enough of them) keep the activity.
    let state = s.state;
    for (let k = 0; k < 4; k++) {
      state = wrong(state).state;
      expect(describeMission(CTX, state).activity!.activityId).toBe(chosen);
    }
    // A jump to the step (developer tools) chooses exactly as play does.
    const jumped = startMissionAt(CTX, { instanceId: 'j', seedBase: 'gamma', missionId: 'pooled', missionVersion: 1, learnerId: 'learner-a', at: T0 }, { stepIndex: 0 });
    expect(describeMission(CTX, jumped.state).activity!.activityId).toBe(chosen);
  });

  it('every member is reachable in play across seed bases', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 80 && seen.size < POOL.length; k++) seen.add(describeMission(CTX, start(`seed-${k}`).state).activity!.activityId);
    expect([...seen].sort()).toEqual([...POOL].sort());
  });

  it('the item seed formula is unchanged: the pool picks the activity, the item still comes from the step seed', () => {
    const s = start('delta').state;
    expect(s.item!.seed).toBe('delta|pooled@1|mixed|stage0|item0|gen0');
  });
});
