// Cargo Commander's adaptive mix: tiers from evidence that a miss never removes, plans with wins and
// stretch, and the instance id that makes the runtime's pools play the plan.
import coreMissions from '../../../../../content/missions/core.json';
import { BUILT_IN_GENERATORS, MissionPackSchema, createRng, deriveLearnerState, describeMission, startMissionAt, type AttemptEvidence, type LearnerState } from '../../../../engine';
import { POLICY, SHIPPED_PACK, T0, attemptFactory, graphOf } from '../../../../engine/testing/support';
import { CARGO_TIERS, PROMOTE_AFTER, SESSION_PLANS, cargoActivities, cargoInstanceId, chooseCargoSession, planSession, tierOf, workingTier, type CargoTier } from './tiers';

const MISSIONS = MissionPackSchema.parse(coreMissions).missions;
const MISSION = MISSIONS.find((m) => m.id === 'cargo-commander')!;
const ACTIVITIES = cargoActivities(MISSION, SHIPPED_PACK);
const GRAPH = graphOf(SHIPPED_PACK.skills);
const rank = (t: CargoTier) => CARGO_TIERS.indexOf(t);
const EMPTY: Pick<LearnerState, 'skills' | 'solvedByActivity'> = { skills: {}, solvedByActivity: {} };

const stateOf = (attempts: AttemptEvidence[]) => deriveLearnerState({ graph: GRAPH, policy: POLICY, pack: SHIPPED_PACK, attempts });
const activity = (tier: CargoTier, i = 0) => ACTIVITIES.filter((a) => tierOf(a.id) === tier)[i % ACTIVITIES.filter((a) => tierOf(a.id) === tier).length]!;

describe('cargo tiers', () => {
  it('every activity the mission can present has a tier, every tier has several, and all are practice', () => {
    expect(ACTIVITIES.length).toBeGreaterThanOrEqual(9);
    for (const a of ACTIVITIES) {
      expect(tierOf(a.id)).not.toBeNull();
      expect(SHIPPED_PACK.activities.find((x) => x.id === a.id)!.challenge).toBe('practice');
    }
    for (const t of CARGO_TIERS) expect(ACTIVITIES.filter((a) => tierOf(a.id) === t).length).toBeGreaterThanOrEqual(3);
    expect(tierOf('cargo.exact.solid')).toBe('solid');
    expect(tierOf('cargo.exact')).toBeNull();
  });

  it('starts at approachable and opens the next tier after enough loads solved, or a skill at proficient', () => {
    expect(workingTier(EMPTY, ACTIVITIES)).toBe('approachable');
    const make = attemptFactory({ learnerId: 'learner-tiers' });
    const solved = (tier: CargoTier, n: number, start: number) =>
      Array.from({ length: n }, (_, i) => {
        const a = activity(tier, i);
        return make({ activityId: a.id, skillIds: a.skills, itemSignature: `${a.id}-${start}-${i}`, occurredAt: start + i * 1000, cued: false, representation: 'objects' });
      });
    const almost = solved('approachable', PROMOTE_AFTER - 1, T0);
    expect(workingTier(stateOf(almost), ACTIVITIES)).toBe('approachable');
    const open = [...almost, ...solved('approachable', 1, T0 + 100_000)];
    expect(workingTier(stateOf(open), ACTIVITIES)).toBe('solid');
    expect(workingTier(stateOf([...open, ...solved('solid', PROMOTE_AFTER, T0 + 200_000)]), ACTIVITIES)).toBe('stretch');
    // A skill of the tier at proficient opens the next tier too.
    const skill = activity('approachable').skills[0]!;
    const proficient = { skills: { [skill]: { peakLevel: 'proficient' } }, solvedByActivity: {} } as unknown as LearnerState;
    expect(workingTier(proficient, ACTIVITIES)).toBe('solid');
  });

  it('never steps down: no miss, run of misses or help ever lowers the working tier (random histories)', () => {
    for (let run = 0; run < 25; run++) {
      const rng = createRng(`tiers-${run}`);
      const make = attemptFactory({ learnerId: `learner-${run}` });
      const attempts: AttemptEvidence[] = [];
      let before = rank(workingTier(stateOf(attempts), ACTIVITIES));
      for (let i = 0; i < 40; i++) {
        const a = rng.pick(ACTIVITIES);
        const wrong = rng.next() < 0.45;
        const assistance = wrong ? 'retry' : rng.pick(['independent', 'clue', 'visualSupport', 'guided', 'demonstrated'] as const);
        attempts.push(
          make({
            activityId: a.id,
            skillIds: a.skills,
            itemSignature: `${a.id}-${rng.int(0, 6)}`,
            occurredAt: T0 + i * 3_600_000,
            outcome: wrong ? 'incorrect' : 'correct',
            assistance,
            wrongTries: wrong ? 1 : 0,
            cued: false,
            representation: 'objects',
          }),
        );
        const after = rank(workingTier(stateOf(attempts), ACTIVITIES));
        expect(after).toBeGreaterThanOrEqual(before);
        if (wrong) expect(after).toBe(before);
        before = after;
      }
    }
  });

  it('a session opens with a win, has challenges, stretches now and then, and never ends on a stretch load', () => {
    for (const t of CARGO_TIERS) {
      const plan = SESSION_PLANS[t];
      expect(rank(plan[0]!)).toBeLessThanOrEqual(Math.max(0, rank(t) - (t === 'approachable' ? 0 : 1)));
      expect(plan.at(-1)).not.toBe('stretch');
      expect(plan.some((p) => rank(p) > rank(t)) || t === 'stretch').toBe(true);
      expect(plan.some((p) => p === t)).toBe(true);
      expect(plan.every((p) => Math.abs(rank(p) - rank(t)) <= 1)).toBe(true);
    }
    expect(SESSION_PLANS.approachable).not.toContain('stretch');
    expect(planSession('solid', 7)).toEqual([...SESSION_PLANS.solid, ...SESSION_PLANS.solid.slice(0, 2)]);
  });

  it('finds an instance id whose pools play the plan, deterministically; the runtime presents exactly those', () => {
    const ctx = { pack: SHIPPED_PACK, registry: BUILT_IN_GENERATORS, missions: MISSIONS };
    for (const t of CARGO_TIERS) {
      for (const base of ['cargo-commander-learner-a-1', 'cargo-commander-learner-b-zz', 'x', 'y-2']) {
        const plan = planSession(t, 5);
        const choice = cargoInstanceId({ base, plan, mission: MISSION });
        expect(choice.matched).toBe(true);
        expect(cargoInstanceId({ base, plan, mission: MISSION })).toEqual(choice);
        expect(choice.activities.map(tierOf)).toEqual(plan);
        // The runtime, started with that instance id (its default seed base), presents the planned loads.
        const input = { instanceId: choice.instanceId, missionId: MISSION.id, missionVersion: MISSION.version, learnerId: 'l', at: T0 };
        const seen = [0, 1, 2, 3, 4].map((stepIndex) => describeMission(ctx, startMissionAt(ctx, input, { stepIndex }).state).activity!.activityId);
        expect(seen).toEqual(choice.activities);
      }
    }
  });

  it('chooseCargoSession puts it together from the learner state', () => {
    const s = chooseCargoSession({ base: 'cargo-commander-l-1', state: EMPTY, mission: MISSION, activities: ACTIVITIES });
    expect(s.tier).toBe('approachable');
    expect(s.plan).toEqual(SESSION_PLANS.approachable);
    expect(s.matched).toBe(true);
    expect(s.activities.map(tierOf)).toEqual(s.plan);
  });

  it('matches every plan for many bases within the search limit, mostly with no load twice', () => {
    let distinct = 0;
    let total = 0;
    for (const t of CARGO_TIERS) {
      for (let i = 0; i < 40; i++) {
        const choice = cargoInstanceId({ base: `cargo-commander-learner-${i}-${t}`, plan: planSession(t, 5), mission: MISSION });
        expect(choice.matched).toBe(true);
        total += 1;
        if (new Set(choice.activities).size === 5) distinct += 1;
      }
    }
    expect(distinct / total).toBeGreaterThan(0.4);
  });

  it('settles for the closest instance when the search limit runs out', () => {
    const impossible: CargoTier[] = ['stretch', 'stretch', 'stretch', 'stretch', 'stretch'];
    const r = cargoInstanceId({ base: 'b', plan: impossible, mission: MISSION, limit: 50 });
    expect(r.matched).toBe(false);
    expect(r.activities).toHaveLength(5);
  });
});
