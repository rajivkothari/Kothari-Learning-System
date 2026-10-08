// startMissionAt: a checkpoint at a later position with no learning events (tooling and tests).
import coreMissions from '../../../content/missions/core.json';
import { BUILT_IN_GENERATORS } from '../generation/registry';
import { SHIPPED_PACK, T0 } from '../testing/support';
import { applyCommand, checkResponse, describeMission, startMissionAt, type MissionContext } from './runtime';
import { MissionPackSchema } from './schema';

// The packs the app ships, composed as every loader composes them (core math, then reading).
const CTX: MissionContext = { pack: SHIPPED_PACK, registry: BUILT_IN_GENERATORS, missions: MissionPackSchema.parse(coreMissions).missions };
const input = { instanceId: 'i1', missionId: 'positions-and-capacity', missionVersion: 3, learnerId: 'learner-a', seedBase: 'fixed', at: T0 };
const ENCOUNTER = MissionPackSchema.parse(coreMissions).missions[0]!.steps.findIndex((s) => s.id === 'capacity-encounter');

describe('startMissionAt', () => {
  it('positions a checkpoint at a step or encounter stage without learning events', () => {
    const r = startMissionAt(CTX, input, { stepIndex: ENCOUNTER, stageIndex: 1 });
    expect(r.events).toEqual([]);
    expect(r.state).toMatchObject({ stepIndex: ENCOUNTER, stageIndex: 1, itemIndex: 0, status: 'active' });
    const v = describeMission(CTX, r.state);
    expect(v.step?.id).toBe('capacity-encounter');
    expect(v.activity?.concept).toBe('fillToCapacity');
    expect(r.intents.at(-1)).toMatchObject({ type: 'SHOW_ACTIVITY' });
  });

  it('is deterministic for a seed base, and play continues normally from it', () => {
    const a = startMissionAt(CTX, input, { stepIndex: 1 });
    const b = startMissionAt(CTX, { ...input, instanceId: 'i2' }, { stepIndex: 1 });
    expect(describeMission(CTX, b.state).activity!.itemSignature).toBe(describeMission(CTX, a.state).activity!.itemSignature);
    const answer = (() => {
      for (let v = 1; v <= 20; v++) {
        const c = checkResponse(CTX, a.state, { mode: 'value', value: v });
        if (c.ok && c.evaluation.correct) return v;
      }
      throw new Error('unsolvable');
    })();
    const next = applyCommand(CTX, a.state, { type: 'submit', commandId: 'c1', value: answer, at: T0 + 5 });
    expect(next.events.filter((e) => e.type === 'attempt')).toHaveLength(1);
  });

  it('refuses positions that do not exist', () => {
    expect(() => startMissionAt(CTX, input, { stepIndex: 99 })).toThrow(/no step 99/);
    expect(() => startMissionAt(CTX, input, { stepIndex: 1, stageIndex: 1 })).toThrow(/no stage 1/);
  });
});
