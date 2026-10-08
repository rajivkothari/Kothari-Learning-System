// Concept Rescue: after repeated misses, teach the idea with a DIFFERENT example the learner
// works through, then return to the target, which the learner must still solve.
import coreMissions from '../../../content/missions/core.json';
import { ScaffoldingPolicySchema, type ContentPack } from '../content/pack';
import { BUILT_IN_GENERATORS } from '../generation/registry';
import { runTimeline } from '../progression/processor';
import { misconceptionFocus } from '../scaffolding/scaffolding';
import { POLICY, SHIPPED_PACK, T0, graphOf } from '../testing/support';
import type { PresentationIntent } from './intents';
import { applyCommand, checkResponse, currentItem, describeMission, startMission, type MissionContext, type MissionState } from './runtime';
import { MissionPackSchema } from './schema';

const of = <T extends PresentationIntent['type']>(intents: PresentationIntent[], type: T) => intents.filter((i): i is Extract<PresentationIntent, { type: T }> => i.type === type);

function contextWith(edit?: (pack: ContentPack) => void): MissionContext {
  // The packs the app ships, composed as every loader composes them (core math, then reading).
  const pack = structuredClone(SHIPPED_PACK);
  edit?.(pack);
  return { pack, registry: BUILT_IN_GENERATORS, missions: MissionPackSchema.parse(coreMissions).missions };
}

/**
 * The generic rescue: a parallel example after five misses, back to the same item. The core pack's
 * practice policies now correct at the first miss on the learner's own item (see below), so these
 * tests pin the generic policy to keep that path covered.
 */
const parallelAtFive = (p: ContentPack) => {
  for (const id of ['moves.on-a-line', 'loads.counted']) p.scaffoldingPolicies.find((x) => x.id === id)!.conceptRescue = { afterWrongTries: 5, returnTo: 'same', example: 'parallel' };
};
const CTX = contextWith(parallelAtFive);

function begin(ctx = CTX, seedBase = 'rescue-test'): MissionState {
  const s = startMission(ctx, { instanceId: 'm1', missionId: 'positions-and-capacity', missionVersion: 3, learnerId: 'learner-a', seedBase, at: T0 }).state;
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
      p.scaffoldingPolicies.find((x) => x.id === 'moves.on-a-line')!.conceptRescue = { afterWrongTries: 2, returnTo: 'same', example: 'parallel' };
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
      p.scaffoldingPolicies.find((x) => x.id === 'moves.on-a-line')!.conceptRescue = { afterWrongTries: 5, returnTo: 'fresh', example: 'parallel' };
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

describe('Correction on the learner\'s own item (the core pack\'s practice policies, D149)', () => {
  const ctx = contextWith(); // core.json as shipped: a correction at the first miss
  const attemptsOf = (events: readonly unknown[]) => events.flatMap((e) => ((e as { type: string }).type === 'attempt' ? [(e as { attempt: Record<string, unknown> }).attempt] : []));

  it('the first miss starts a correction that works through the very item the learner missed', () => {
    const s = begin(ctx);
    const t = target(ctx, s);
    const r = miss(ctx, s, 1, () => t.change);
    const rescue = of(r.intents, 'CONCEPT_RESCUE')[0]!.rescue;
    expect(rescue).toMatchObject({ source: 'target', returnTo: 'fresh', example: { signature: t.item.signature, answer: t.answer } });
    expect(of(r.intents, 'RESPONSE_RESULT')[0]).toMatchObject({ correct: false, retryAllowed: false });
    // The target cannot be answered while it is being corrected, and never again after.
    expect(applyCommand(ctx, r.state, { type: 'submit', commandId: 'x', value: t.answer, at: T0 + 20 }).intents).toEqual([expect.objectContaining({ type: 'RESPONSE_REJECTED', reason: 'rescueActive' })]);
  });

  it('corrective actions are never evidence; the corrected item is a miss; the fresh item is never independent', () => {
    const s = begin(ctx);
    const t = target(ctx, s);
    const corrected = miss(ctx, s, 1, () => t.change);
    expect(attemptsOf(miss(ctx, s, 1, () => t.change).intents as never)).toEqual([]);
    // A wrong count on the board is instruction: no attempt, no tries counted.
    const wrongCount = applyCommand(ctx, corrected.state, { type: 'rescueAnswer', commandId: 'w', value: t.answer + 1, at: T0 + 30 });
    expect(wrongCount.events).toEqual([]);
    expect(wrongCount.state.item!.wrongTries).toBe(1);
    const done = applyCommand(ctx, wrongCount.state, { type: 'rescueAnswer', commandId: 'r', value: t.answer, at: T0 + 40 });
    const resolved = attemptsOf(done.events);
    expect(resolved).toEqual([expect.objectContaining({ outcome: 'incorrect', itemSignature: t.item.signature, conceptRescue: true, wrongTries: 0 })]);
    expect(resolved[0]!.assistance).not.toBe('independent');
    // A fresh equivalent item: same activity, a different item.
    const fresh = target(ctx, done.state);
    expect(fresh.item.signature).not.toBe(t.item.signature);
    expect(fresh.item.templateId).toBe(t.item.templateId);
    const solved = applyCommand(ctx, done.state, { type: 'submit', commandId: 'solve', value: fresh.answer, at: T0 + 60 });
    const after = attemptsOf(solved.events);
    expect(after).toEqual([expect.objectContaining({ outcome: 'correct', assistance: 'guided', conceptRescue: true, wrongTries: 0, itemSignature: fresh.item.signature })]);
    // In the learner model: the corrected item is not solved, the fresh one is solved with guided help only.
    const graph = graphOf(ctx.pack.skills);
    const model = runTimeline({ graph, policy: POLICY, attempts: [...resolved, ...after] as never });
    const skill = model.state.skills['math.add.within20']!;
    expect(skill.solvedSignatures).not.toContain(t.item.signature);
    expect(skill.dimensions.independence.rate).toBeLessThan(1);
  });

  it('the fresh item is never the job just corrected: a different question and answer, at every step, across seeds', () => {
    const answerOf = (i: ReturnType<typeof currentItem>) => i!.response.options.find((o) => o.correct)!.value as number;
    // A reading job (version 3) is answered by picking an option (a thing or a card); its policy has no correction.
    const choice = (s: MissionState) => describeMission(ctx, s).activity!.answer.mode === 'choice';
    const right = (s: MissionState) => (choice(s) ? { optionId: currentItem(ctx, s)!.response.options.find((o) => o.correct)!.id } : { value: answerOf(currentItem(ctx, s)) });
    let corrections = 0;
    for (let n = 0; n < 40; n++) {
      let s = begin(ctx, `fresh-${n}`);
      let at = T0 + 10;
      for (let guard = 0; guard < 120 && s.status === 'active'; guard++) {
        if (!s.item) {
          s = applyCommand(ctx, s, { type: 'acknowledge', commandId: `a${guard}`, at: (at += 10) }).state;
          continue;
        }
        const item = currentItem(ctx, s)!;
        const answer = answerOf(item);
        const wrong = choice(s) ? { optionId: item.response.options.find((o) => !o.correct)!.id } : { value: answer >= 2 ? answer - 1 : answer + 1 };
        const r = applyCommand(ctx, s, { type: 'submit', commandId: `w${guard}`, ...wrong, at: (at += 10) });
        s = r.state;
        const rescue = of(r.intents, 'CONCEPT_RESCUE')[0]?.rescue;
        if (rescue?.source === 'target') {
          s = applyCommand(ctx, s, { type: 'rescueAnswer', commandId: `r${guard}`, value: rescue.example.answer, at: (at += 10) }).state;
          const fresh = currentItem(ctx, s)!;
          expect({ seed: n, step: s.stepIndex, fresh: fresh.signature !== item.signature && String(answerOf(fresh)) !== String(answer) }).toEqual({ seed: n, step: s.stepIndex, fresh: true });
          corrections++;
        }
        s = applyCommand(ctx, s, { type: 'submit', commandId: `c${guard}`, ...right(s), at: (at += 10) }).state;
      }
      expect(s.status).toBe('completed');
    }
    expect(corrections).toBeGreaterThan(200);
  });

  it('a correction happens once: missing the fresh item uses the ordinary ladder on it, never another correction', () => {
    const s = begin(ctx);
    const t = target(ctx, s);
    const corrected = miss(ctx, s, 1, () => t.change);
    const done = applyCommand(ctx, corrected.state, { type: 'rescueAnswer', commandId: 'r', value: t.answer, at: T0 + 40 });
    const fresh = target(ctx, done.state);
    const again = miss(ctx, done.state, 3, () => fresh.change);
    expect(of(again.intents, 'CONCEPT_RESCUE')).toEqual([]);
    expect(of(again.intents, 'RESPONSE_RESULT').every((r) => r.retryAllowed)).toBe(true);
    expect(target(ctx, again.state).item.signature).toBe(fresh.item.signature); // the same fresh item, retried
    expect(describeMission(ctx, again.state).activity!.scaffolds.available[0]).toMatchObject({ kind: 'highlightGiven', mode: 'offer' });
  });

  it('a regeneration after a correction keeps the rescue with the lineage: no second correction, and a first-try right answer is never independent', () => {
    const wrong = (answer: number) => (answer >= 2 ? answer - 1 : answer + 1);
    const regenAfter = ctx.pack.scaffoldingPolicies.find((x) => x.id === 'moves.on-a-line')!.regenerateAfterWrongTries!;
    const s = begin(ctx);
    const t = target(ctx, s);
    // A miss and the correction, counted through to the fresh item.
    const corrected = miss(ctx, s, 1, () => wrong(t.answer));
    expect(of(corrected.intents, 'CONCEPT_RESCUE')).toHaveLength(1);
    const done = applyCommand(ctx, corrected.state, { type: 'rescueAnswer', commandId: 'r', value: t.answer, at: T0 + 40 });
    const fresh = target(ctx, done.state);
    // Repeated misses on the fresh item until it regenerates: the ordinary ladder, never another correction.
    const misses = miss(ctx, done.state, regenAfter, () => wrong(fresh.answer));
    expect(of(misses.intents, 'CONCEPT_RESCUE')).toEqual([]);
    expect(of(misses.intents, 'ITEM_REGENERATED')).toHaveLength(1);
    expect(misses.state.item).toMatchObject({ generation: done.state.item!.generation + 1, wrongTries: 0, rescuedBefore: true });
    // The checkpoint keeps it across a restart.
    const restored = JSON.parse(JSON.stringify(misses.state)) as MissionState;
    expect(restored.item!.rescuedBefore).toBe(true);
    // A first-try right answer on the regenerated item: real, but guided evidence, never independent.
    const variant = target(ctx, restored);
    expect(variant.item.signature).not.toBe(fresh.item.signature);
    const solved = applyCommand(ctx, restored, { type: 'submit', commandId: 'solve-variant', value: variant.answer, at: T0 + 200 });
    const att = attemptsOf(solved.events);
    expect(att).toEqual([expect.objectContaining({ outcome: 'correct', wrongTries: 0, conceptRescue: true, itemSignature: variant.item.signature })]);
    expect(att[0]!.assistance).not.toBe('independent');
    // And a miss on the regenerated item is the ordinary ladder again, never a second correction.
    const again = applyCommand(ctx, restored, { type: 'submit', commandId: 'miss-variant', value: wrong(variant.answer), at: T0 + 210 });
    expect(of(again.intents, 'CONCEPT_RESCUE')).toEqual([]);
    expect(of(again.intents, 'RESPONSE_RESULT')[0]).toMatchObject({ correct: false, retryAllowed: true });
  });

  it('a learner never rescued keeps clean evidence across a regeneration: a first-try right answer stays independent', () => {
    const noRescue = contextWith((p) => delete p.scaffoldingPolicies.find((x) => x.id === 'moves.on-a-line')!.conceptRescue);
    const wrong = (answer: number) => (answer >= 2 ? answer - 1 : answer + 1);
    const regenAfter = noRescue.pack.scaffoldingPolicies.find((x) => x.id === 'moves.on-a-line')!.regenerateAfterWrongTries!;
    const s = begin(noRescue);
    const t = target(noRescue, s);
    const misses = miss(noRescue, s, regenAfter, () => wrong(t.answer));
    expect(of(misses.intents, 'CONCEPT_RESCUE')).toEqual([]);
    expect(of(misses.intents, 'ITEM_REGENERATED')).toHaveLength(1);
    expect(misses.state.item!.rescuedBefore).toBeUndefined();
    const variant = target(noRescue, misses.state);
    const att = attemptsOf(applyCommand(noRescue, misses.state, { type: 'submit', commandId: 'solve', value: variant.answer, at: T0 + 200 }).events);
    expect(att).toEqual([expect.objectContaining({ outcome: 'correct', wrongTries: 0, assistance: 'independent' })]);
    expect(att[0]).not.toHaveProperty('conceptRescue');
  });

  it('is deterministic and survives a restart: the stored state regenerates the same correction and fresh item', () => {
    const run = () => {
      const s = begin(ctx, 'det');
      const t = target(ctx, s);
      const corrected = miss(ctx, s, 1, () => t.change);
      const restored = JSON.parse(JSON.stringify(corrected.state)) as MissionState; // what the database keeps
      const view = describeMission(ctx, restored).activity!.rescue!;
      const done = applyCommand(ctx, restored, { type: 'rescueAnswer', commandId: 'r', value: view.example.answer, at: T0 + 40 });
      return { view, fresh: target(ctx, done.state).item.signature };
    };
    const a = run();
    const b = run();
    expect(a.view).toMatchObject({ source: 'target', status: 'active' });
    expect(b).toEqual(a);
  });

  it('a correction on the target must return to a fresh item (the schema refuses "same")', () => {
    const base = ctx.pack.scaffoldingPolicies.find((x) => x.id === 'moves.on-a-line')!;
    expect(ScaffoldingPolicySchema.safeParse({ ...base, conceptRescue: { afterWrongTries: 1, returnTo: 'same', example: 'target' } }).success).toBe(false);
    expect(ScaffoldingPolicySchema.safeParse({ ...base, conceptRescue: { afterWrongTries: 1, returnTo: 'fresh', example: 'target' } }).success).toBe(true);
  });
});
