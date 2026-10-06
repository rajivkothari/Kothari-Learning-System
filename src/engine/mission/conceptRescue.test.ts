// Concept Rescue: after repeated misses, teach the idea with a DIFFERENT example the learner
// works through, then return to the target, which the learner must still solve.
import coreMissions from '../../../content/missions/core.json';
import corePack from '../../../content/packs/core.json';
import { ContentPackSchema, ScaffoldingPolicySchema, type ContentPack } from '../content/pack';
import { BUILT_IN_GENERATORS } from '../generation/registry';
import { runTimeline } from '../progression/processor';
import { misconceptionFocus } from '../scaffolding/scaffolding';
import { POLICY, T0, graphOf } from '../testing/support';
import type { PresentationIntent } from './intents';
import { applyCommand, checkResponse, currentItem, describeMission, startMission, type MissionContext, type MissionState } from './runtime';
import { MissionPackSchema } from './schema';

const of = <T extends PresentationIntent['type']>(intents: PresentationIntent[], type: T) => intents.filter((i): i is Extract<PresentationIntent, { type: T }> => i.type === type);

function contextWith(edit?: (pack: ContentPack) => void): MissionContext {
  const pack = ContentPackSchema.parse(structuredClone(corePack));
  edit?.(pack);
  return { pack, registry: BUILT_IN_GENERATORS, missions: MissionPackSchema.parse(coreMissions).missions };
}

const CTX = contextWith();

function begin(ctx = CTX, seedBase = 'rescue-test'): MissionState {
  const s = startMission(ctx, { instanceId: 'm1', missionId: 'positions-and-capacity', missionVersion: 1, learnerId: 'learner-a', seedBase, at: T0 }).state;
  return applyCommand(ctx, s, { type: 'acknowledge', commandId: 'ack', at: T0 + 1 }).state;
}

const target = (ctx: MissionContext, s: MissionState) => {
  const item = currentItem(ctx, s)!;
  const { start, change } = item.prompt as { start: number; change: number };
  return { item, answer: item.response.options.find((o) => o.correct)!.value as number, start, change };
};

/** Miss `n` times with the given value function, collecting every intent. */
function miss(ctx: MissionContext, s: MissionState, n: number, value: (i: number) => number) {
  const intents: PresentationIntent[] = [];
  let state = s;
  for (let i = 0; i < n; i++) {
    const r = applyCommand(ctx, state, { type: 'submit', commandId: `m${i}-${state.item!.wrongTries}`, value: value(i), at: T0 + 10 + i });
    intents.push(...r.intents);
    state = r.state;
  }
  return { state, intents };
}

describe('Concept Rescue', () => {
  it('starts exactly at the policy threshold, not before', () => {
    const s = begin();
    const t = target(CTX, s);
    const four = miss(CTX, s, 4, () => t.change); // answering with the move size
    expect(of(four.intents, 'CONCEPT_RESCUE')).toEqual([]);
    expect(describeMission(CTX, four.state).activity!.rescue).toBeNull();
    const five = miss(CTX, four.state, 1, () => t.change);
    expect(of(five.intents, 'CONCEPT_RESCUE')).toHaveLength(1);
    expect(of(five.intents, 'RESPONSE_RESULT')[0]).toMatchObject({ correct: false, retryAllowed: false });
  });

  it('the threshold is configurable per policy', () => {
    const ctx = contextWith((p) => {
      p.scaffoldingPolicies.find((x) => x.id === 'moves.on-a-line')!.conceptRescue = { afterWrongTries: 2, returnTo: 'same' };
    });
    const s = begin(ctx);
    const t = target(ctx, s);
    expect(of(miss(ctx, s, 2, () => t.change).intents, 'CONCEPT_RESCUE')).toHaveLength(1);
    const none = contextWith((p) => {
      delete p.scaffoldingPolicies.find((x) => x.id === 'moves.on-a-line')!.conceptRescue;
    });
    const s2 = begin(none);
    const t2 = target(none, s2);
    expect(of(miss(none, s2, 6, () => t2.change).intents, 'CONCEPT_RESCUE')).toEqual([]);
  });

  it('ordinary misses never reveal the target answer', () => {
    const s = begin();
    const t = target(CTX, s);
    let state = s;
    for (let i = 0; i < 4; i++) {
      state = miss(CTX, state, 1, () => (t.answer === 1 ? 2 : 1)).state;
      const view = describeMission(CTX, state).activity!;
      expect(view.scaffolds.revealedValue).toBeNull();
      expect(view.options).toEqual([]);
    }
  });

  it('teaches with a parallel example: different item, different answer, same kind of move, deterministic', () => {
    for (const seedBase of ['a', 'b', 'c', 'd', 'e']) {
      const s = begin(CTX, seedBase);
      const t = target(CTX, s);
      const { state, intents } = miss(CTX, s, 5, () => (t.answer === 1 ? 2 : 1));
      const rescue = of(intents, 'CONCEPT_RESCUE')[0]!.rescue;
      expect(rescue.example.signature).not.toBe(t.item.signature);
      expect(rescue.example.answer).not.toBe(t.answer);
      expect(rescue.example.prompt.direction).toBe(t.item.prompt.direction);
      expect(rescue.status).toBe('active');
      // Same state, same example: survives a restart.
      const again = describeMission(CTX, JSON.parse(JSON.stringify(state)) as MissionState).activity!.rescue!;
      expect(again).toEqual(rescue);
    }
  });

  it('focuses on a misconception only when the evidence is strong', () => {
    const s = begin();
    const t = target(CTX, s);
    // Counted the starting position every time.
    const strong = miss(CTX, s, 5, () => t.answer - 1);
    expect(of(strong.intents, 'CONCEPT_RESCUE')[0]!.rescue.focus).toBe('quantity.countedStartingPosition');
    // Untagged, scattered misses: no pretending to know why.
    const untagged = Array.from({ length: 20 }, (_, i) => i + 1).filter((v) => {
      const c = checkResponse(CTX, s, { mode: 'value', value: v });
      return c.ok && !c.evaluation.correct && !c.evaluation.misconception;
    });
    expect(untagged.length).toBeGreaterThanOrEqual(5);
    const scattered = miss(CTX, s, 5, (i) => untagged[i]!);
    expect(of(scattered.intents, 'CONCEPT_RESCUE')[0]!.rescue.focus).toBeNull();
    expect(misconceptionFocus(['a', 'b', 'a', 'c', 'b'], 5)).toBeNull(); // 2 of 5: not half
    expect(misconceptionFocus(['a', 'a', 'a'], 5)).toBe('a');
    expect(misconceptionFocus(['a'], 1)).toBeNull(); // one miss is not evidence
  });

  it('pauses the target during the rescue and returns the learner to it, unsolved', () => {
    const s = begin();
    const t = target(CTX, s);
    let { state } = miss(CTX, s, 5, () => t.change);
    const example = describeMission(CTX, state).activity!.rescue!.example;
    // The target cannot be answered, and no other help competes, while the rescue runs.
    expect(applyCommand(CTX, state, { type: 'submit', commandId: 'early', value: t.answer, at: T0 + 50 }).intents).toEqual([{ type: 'RESPONSE_REJECTED', reason: 'rescueActive' }]);
    expect(describeMission(CTX, state).activity!.scaffolds.available).toEqual([]);
    // A wrong answer on the example is just a retry of the example. Nothing is recorded.
    const wrong = applyCommand(CTX, state, { type: 'rescueAnswer', commandId: 'rw', value: (example.answer as number) + 1, at: T0 + 51 });
    expect(of(wrong.intents, 'RESCUE_RESULT')[0]).toMatchObject({ correct: false });
    expect(wrong.events).toEqual([]);
    const done = applyCommand(CTX, wrong.state, { type: 'rescueAnswer', commandId: 'rc', value: example.answer, at: T0 + 52 });
    expect(of(done.intents, 'CONCEPT_RESCUE_COMPLETE')[0]).toMatchObject({ returnTo: 'same' });
    expect(done.events).toEqual([]);
    state = done.state;
    // Back on the SAME target, still unsolved, still in the same step.
    const view = describeMission(CTX, state).activity!;
    expect(view.itemSignature).toBe(t.item.signature);
    expect(view.rescue!.status).toBe('done');
    expect(view.scaffolds.revealedValue).toBeNull();
    // The learner does the final reasoning. The help is recorded honestly.
    const solved = applyCommand(CTX, state, { type: 'submit', commandId: 'solve', value: t.answer, at: T0 + 60 });
    const attempt = solved.events.find((e) => e.type === 'attempt')!;
    expect(attempt).toMatchObject({ attempt: { outcome: 'correct', assistance: 'guided', conceptRescue: true, wrongTries: 5, itemSignature: t.item.signature } });
  });

  it('can return to a fresh equivalent item instead, carrying the rescue into the evidence', () => {
    const ctx = contextWith((p) => {
      p.scaffoldingPolicies.find((x) => x.id === 'moves.on-a-line')!.conceptRescue = { afterWrongTries: 5, returnTo: 'fresh' };
    });
    const s = begin(ctx);
    const t = target(ctx, s);
    const { state } = miss(ctx, s, 5, () => t.change);
    const example = describeMission(ctx, state).activity!.rescue!.example;
    const done = applyCommand(ctx, state, { type: 'rescueAnswer', commandId: 'rc', value: example.answer, at: T0 + 52 });
    // The old item is resolved as a miss; a new variation takes its place.
    expect(done.events).toEqual([expect.objectContaining({ type: 'attempt', attempt: expect.objectContaining({ outcome: 'incorrect', itemSignature: t.item.signature }) })]);
    const fresh = target(ctx, done.state);
    expect(fresh.item.signature).not.toBe(t.item.signature);
    const solved = applyCommand(ctx, done.state, { type: 'submit', commandId: 'solve', value: fresh.answer, at: T0 + 60 });
    expect(solved.events.find((e) => e.type === 'attempt')).toMatchObject({ attempt: { outcome: 'correct', assistance: 'guided', conceptRescue: true } });
  });

  it('keeps demonstrated-answer contamination rules: a rescued target is real (if weak) evidence, the example is not evidence at all', () => {
    const s = begin();
    const t = target(CTX, s);
    const { state } = miss(CTX, s, 5, () => t.change);
    const example = describeMission(CTX, state).activity!.rescue!.example;
    const done = applyCommand(CTX, state, { type: 'rescueAnswer', commandId: 'rc', value: example.answer, at: T0 + 52 });
    const solved = applyCommand(CTX, done.state, { type: 'submit', commandId: 'solve', value: t.answer, at: T0 + 60 });
    const attempts = solved.events.flatMap((e) => (e.type === 'attempt' ? [e.attempt] : []));
    const graph = graphOf(CTX.pack.skills);
    const r = runTimeline({ graph, policy: POLICY, attempts });
    const skill = r.state.skills['math.add.within20']!;
    expect(skill.solvedSignatures).toContain(t.item.signature); // guided credit > 0: seen and solved, not demonstrated
    expect(skill.solvedSignatures).not.toContain(example.signature);
  });

  it('policies must leave room for the rescue and never demonstrate early', () => {
    const base = CTX.pack.scaffoldingPolicies.find((x) => x.id === 'moves.on-a-line')!;
    expect(ScaffoldingPolicySchema.safeParse({ ...base, regenerateAfterWrongTries: 5 }).success).toBe(false);
    expect(ScaffoldingPolicySchema.safeParse({ ...base, steps: base.steps.map((st) => (st.assistance === 'demonstrated' ? { ...st, requestableEarly: true } : st)) }).success).toBe(false);
  });
});
