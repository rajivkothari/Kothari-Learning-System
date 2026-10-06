import type { AttemptEvidence } from '../evidence/attempt';
import { DAY, HOUR, MINI_GRAPH, PACK, PACK_GRAPH, POLICY, T0, attemptFactory, successes } from '../testing/support';
import { capByAssistance, lifetimeValue } from './opportunities';
import { runTimeline } from './processor';

const run = (attempts: AttemptEvidence[]) => runTimeline({ graph: MINI_GRAPH, policy: POLICY, attempts });
const last = (attempts: AttemptEvidence[]) => run(attempts).completions.at(-1)!;
const ledger = (attempts: AttemptEvidence[]) => run(attempts).processor.opportunities();

describe('progression opportunities', () => {
  it('a Stretch first clear is normal; clearing it again at the same strength adds nothing', () => {
    const make = attemptFactory({ activityId: 'stretch-a', challenge: 'stretch', cued: false });
    const first = [make({ itemSignature: 's1', occurredAt: T0 })];
    expect(last(first)).toMatchObject({ tier: 'normal', upgrades: [expect.objectContaining({ key: 'clear:activity:stretch-a', fromTier: 'none', toTier: 'normal', increment: 2 })] });
    expect(last([...first, make({ itemSignature: 's2', occurredAt: T0 + HOUR })]).upgrades).toEqual([]);
  });

  it('guided first, independent later: upgrades low -> normal, total equals an immediate independent clear', () => {
    const make = attemptFactory({ activityId: 'stretch-a', challenge: 'stretch', cued: false });
    const assisted = [make({ itemSignature: 's1', occurredAt: T0, assistance: 'guided' })];
    expect(last(assisted).upgrades).toEqual([expect.objectContaining({ toTier: 'low', increment: 1 })]);
    const improved = [...assisted, make({ itemSignature: 's2', occurredAt: T0 + DAY })];
    expect(last(improved).upgrades).toEqual([expect.objectContaining({ fromTier: 'low', toTier: 'normal', increment: 1 })]);

    const immediate = [attemptFactory({ activityId: 'stretch-a', challenge: 'stretch', cued: false })({ itemSignature: 's9', occurredAt: T0 })];
    expect(ledger(improved)['clear:activity:stretch-a']).toBe('normal');
    expect(lifetimeValue(ledger(improved))).toBe(lifetimeValue(ledger(immediate)));
  });

  it('a demonstrated answer demonstrates nothing; a later independent clear on a NEW item still counts', () => {
    const make = attemptFactory({ activityId: 'stretch-a', challenge: 'stretch', cued: false });
    const shown = [make({ itemSignature: 's1', occurredAt: T0, assistance: 'demonstrated' })];
    expect(last(shown).upgrades).toEqual([]);
    expect(last([...shown, make({ itemSignature: 's2', occurredAt: T0 + DAY })]).tier).toBe('normal');
  });

  it('re-solving the exact item whose answer was demonstrated is a replay, not an upgrade', () => {
    const make = attemptFactory({ activityId: 'stretch-a', challenge: 'stretch', cued: false });
    const r = last([make({ itemSignature: 's1', occurredAt: T0, assistance: 'demonstrated' }), make({ itemSignature: 's1', occurredAt: T0 + DAY })]);
    expect(r).toMatchObject({ exposure: 'exactReplay', upgrades: [] });
  });

  it('practice completions earn nothing by themselves; progress shows up as level milestones and practice credit', () => {
    const results = run(successes(attemptFactory(), 4, T0, HOUR)).completions;
    expect(results.slice(0, 3).map((r) => r.tier)).toEqual(['none', 'none', 'none']);
    expect(results.slice(0, 3).every((r) => r.signals.some((s) => s.kind === 'practiceCredit' && s.credit === 'full'))).toBe(true);
    expect(results[3]).toMatchObject({ tier: 'normal', upgrades: [expect.objectContaining({ key: 'peak:test.base:proficient' })] });
    expect(results[3]!.signals).toContainEqual({ kind: 'skillMilestone', skillId: 'test.base', level: 'proficient' });
  });

  it('reaching Mastered is high; mastered material with no review due gives reduced practice credit and no upgrade', () => {
    const make = attemptFactory();
    const masteredAt = T0 + DAY + 6 * HOUR;
    const history = [
      ...successes(make, 3, T0, HOUR, { representation: 'numeral' }),
      ...successes(make, 2, T0 + 4 * HOUR, HOUR, { representation: 'verticalScale' }),
      make({ itemSignature: 'next-day', occurredAt: masteredAt }),
    ];
    expect(last(history)).toMatchObject({ tier: 'high', upgrades: [expect.objectContaining({ key: 'peak:test.base:mastered' })] });
    const easy = last([...history, make({ itemSignature: 'easy', occurredAt: masteredAt + HOUR })]);
    expect(easy).toMatchObject({ tier: 'none', exposure: 'easyVariation' });
    expect(easy.signals).toContainEqual(expect.objectContaining({ kind: 'practiceCredit', credit: 'reduced' }));
    const review = last([...history, make({ itemSignature: 'review', occurredAt: masteredAt + 3 * DAY })]);
    expect(review).toMatchObject({ tier: 'low', exposure: 'dueSpacedReview', upgrades: [expect.objectContaining({ kind: 'reviewStage', key: 'review:test.base:1' })] });
  });

  it('exact replay has no value and no practice credit', () => {
    const make = attemptFactory({ activityId: 'stretch-a', challenge: 'stretch', cued: false });
    const r = last([make({ itemSignature: 's1', occurredAt: T0 }), make({ itemSignature: 's1', occurredAt: T0 + HOUR })]);
    expect(r).toMatchObject({ tier: 'none', exposure: 'exactReplay', upgrades: [] });
    expect(r.signals).toContainEqual(expect.objectContaining({ kind: 'practiceCredit', credit: 'none' }));
  });

  it('a Mastery Encounter clear in a new higher-order context is high, once', () => {
    const make = attemptFactory({ encounterId: 'capacity-planning', challenge: 'masteryEncounter', cued: false, transfer: { kind: 'higherOrder', contextKey: 'capacityPlanning' } });
    const instance = (id: string, t: number, stage2Correct = true) => [
      make({ activityInstanceId: id, activityId: 'encounter.capacity.route', skillIds: ['math.add.within20', 'math.sub.within20'], itemSignature: `${id}-1`, occurredAt: t }),
      make({ activityInstanceId: id, activityId: 'encounter.capacity.remainder', skillIds: ['math.sub.within20'], itemSignature: `${id}-2`, occurredAt: t + 60_000, outcome: stage2Correct ? 'correct' : 'incorrect' }),
    ];
    const r = runTimeline({ graph: PACK_GRAPH, policy: POLICY, pack: PACK, attempts: [...instance('e1', T0, false), ...instance('e2', T0 + DAY), ...instance('e3', T0 + 2 * DAY)] });
    expect(r.completions.map((c) => [c.success, c.tier])).toEqual([
      [false, 'none'],
      [true, 'high'],
      [true, 'none'],
    ]);
    expect(r.completions[1]!.upgrades.map((e) => e.kind).sort()).toEqual(['firstClear', 'transferContext']);
  });

  it('help caps completion demonstrations but never removes earned milestones', () => {
    const make = attemptFactory({ activityId: 'stretch-a', challenge: 'stretch', cued: false });
    expect(last([make({ itemSignature: 's1', occurredAt: T0, assistance: 'verbalHint' })]).tier).toBe('low');
    expect(capByAssistance('high', 'clue')).toBe('high');
    expect(capByAssistance('high', 'visualSupport')).toBe('normal');
    expect(capByAssistance('high', 'guided')).toBe('low');
    expect(capByAssistance('high', 'demonstrated')).toBeNull();
  });

  it('re-applying a completion record to the same processor creates no duplicate upgrades', () => {
    const make = attemptFactory({ activityId: 'stretch-a', challenge: 'stretch', cued: false });
    const r = run([make({ itemSignature: 's1', occurredAt: T0 })]);
    const completion = { schemaVersion: 1 as const, id: r.completions[0]!.completionId, learnerId: 'learner-test', kind: 'activity' as const, instanceId: r.completions[0]!.instanceId, targetId: 'stretch-a', outcome: 'completed' as const, occurredAt: T0 };
    const again = r.processor.apply({ type: 'completion', completion });
    expect(again?.upgrades).toEqual([]);
  });
});
