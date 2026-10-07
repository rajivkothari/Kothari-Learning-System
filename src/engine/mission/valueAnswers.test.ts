// Value answers through the mission runtime, on the core pack the app ships.
import coreMissions from '../../../content/missions/core.json';
import corePack from '../../../content/packs/core.json';
import { ContentPackSchema } from '../content/pack';
import { BUILT_IN_GENERATORS } from '../generation/registry';
import { T0 } from '../testing/support';
import type { PresentationIntent } from './intents';
import { applyCommand, checkResponse, currentItem, describeMission, startMission, type MissionContext, type MissionState } from './runtime';
import { MissionPackSchema } from './schema';

const CTX: MissionContext = { pack: ContentPackSchema.parse(corePack), registry: BUILT_IN_GENERATORS, missions: MissionPackSchema.parse(coreMissions).missions };
const of = <T extends PresentationIntent['type']>(intents: PresentationIntent[], type: T) => intents.filter((i): i is Extract<PresentationIntent, { type: T }> => i.type === type);

function begin(seedBase = 'value-test'): MissionState {
  const s = startMission(CTX, { instanceId: 'm1', missionId: 'positions-and-capacity', missionVersion: 2, learnerId: 'learner-a', seedBase, at: T0 }).state;
  return applyCommand(CTX, s, { type: 'acknowledge', commandId: 'ack', at: T0 + 1 }).state;
}

const answerOf = (s: MissionState) => {
  const item = currentItem(CTX, s)!;
  return item.response.options.find((o) => o.correct)!.value as number;
};

describe('value answers in a mission', () => {
  it('views expose the answer domain and hide the generated options', () => {
    const view = describeMission(CTX, begin()).activity!;
    expect(view.answer).toEqual({ mode: 'value', min: 1, max: 20 });
    expect(view.options).toEqual([]);
  });

  it('checkResponse is pure and agrees with the committed result', () => {
    const s = begin();
    const right = answerOf(s);
    for (const value of [right, right - 1, right + 1, 1, 20]) {
      const check = checkResponse(CTX, s, { mode: 'value', value });
      const committed = applyCommand(CTX, s, { type: 'submit', commandId: `v${value}`, value, at: T0 + 2 });
      const result = of(committed.intents, 'RESPONSE_RESULT')[0]!;
      expect(check.ok).toBe(true);
      if (check.ok) expect({ correct: result.correct, misconception: result.misconception }).toEqual({ correct: check.evaluation.correct, misconception: check.evaluation.correct ? null : (check.evaluation.misconception ?? null) });
    }
  });

  it('rejects values outside the domain and responses of the wrong mode, without counting a try', () => {
    const s = begin();
    for (const [cmd, reason] of [
      [{ value: 0 }, 'outOfRange'],
      [{ value: 21 }, 'outOfRange'],
      [{ value: 2.5 }, 'outOfRange'],
      [{ optionId: 'a' }, 'invalidResponse'],
    ] as const) {
      const r = applyCommand(CTX, s, { type: 'submit', commandId: `bad-${reason}-${JSON.stringify(cmd)}`, at: T0 + 2, ...cmd } as never);
      expect(r.intents).toEqual([{ type: 'RESPONSE_REJECTED', reason }]);
      expect(r.state.item!.wrongTries).toBe(0);
      expect(r.events).toEqual([]);
    }
  });

  it('a wrong value that matches a known mistake carries its misconception', () => {
    const s = begin();
    const item = currentItem(CTX, s)!;
    const { start, change } = item.prompt as { start: number; change: number };
    const r = applyCommand(CTX, s, { type: 'submit', commandId: 'w', value: start + change - 1, at: T0 + 2 });
    expect(of(r.intents, 'RESPONSE_RESULT')[0]).toMatchObject({ correct: false, value: start + change - 1, misconception: 'quantity.countedStartingPosition' });
    expect(of(r.intents, 'WORLD_EVENT')[0]).toMatchObject({ appliedValue: start + change - 1, correct: false });
  });

  it('a demonstrated answer is only a last resort after the rescue, reveals the value, and is recorded as demonstrated', () => {
    let s = begin();
    const right = answerOf(s);
    const wrong = right === 1 ? 2 : 1;
    let n = 0;
    const miss = () => (s = applyCommand(CTX, s, { type: 'submit', commandId: `x${n++}`, value: wrong, at: T0 + 2 + n }).state);
    for (let i = 0; i < 5; i++) miss();
    // The fifth miss starts a Concept Rescue; finish it on the example.
    const rescue = describeMission(CTX, s).activity!.rescue!;
    expect(rescue.status).toBe('active');
    s = applyCommand(CTX, s, { type: 'rescueAnswer', commandId: 'r', value: rescue.example.answer, at: T0 + 20 }).state;
    // The answer is still hidden until the last-resort threshold.
    miss();
    expect(describeMission(CTX, s).activity!.scaffolds.revealedValue).toBeNull();
    miss();
    for (let i = 0; i < 4; i++) {
      const offer = describeMission(CTX, s).activity!.scaffolds.available[0];
      if (!offer) break;
      const r = applyCommand(CTX, s, { type: 'useScaffold', commandId: `h${i}`, scaffoldStepId: offer.stepId, at: T0 + 30 + i });
      s = r.state;
      if (offer.assistance === 'demonstrated') expect(of(r.intents, 'SCAFFOLD_SHOWN')[0]?.revealedValue).toBe(right);
    }
    expect(describeMission(CTX, s).activity!.scaffolds.revealedValue).toBe(right);
    const done = applyCommand(CTX, s, { type: 'submit', commandId: 'solve', value: right, at: T0 + 40 });
    expect(done.events.find((e) => e.type === 'attempt')).toMatchObject({ attempt: { assistance: 'demonstrated', outcome: 'correct', conceptRescue: true } });
  });
});
