import type { AttemptEvidence } from '../evidence/attempt';
import { DAY, HOUR, MINI_GRAPH, PACK, PACK_GRAPH, POLICY, T0, attemptFactory, successes } from '../testing/support';
import { runTimeline } from './timeline';
import { capByAssistance } from './value';

const run = (attempts: AttemptEvidence[]) => runTimeline({ graph: MINI_GRAPH, policy: POLICY, attempts });
const last = (attempts: AttemptEvidence[]) => run(attempts).completions.at(-1)!;

describe('progression value', () => {
  it('first clear of a Stretch activity is normal; clearing it again is none', () => {
    const make = attemptFactory({ activityId: 'stretch-a', challenge: 'stretch', cued: false });
    const first = [make({ itemSignature: 's1', occurredAt: T0 })];
    expect(last(first)).toMatchObject({ tier: 'normal', events: [expect.objectContaining({ kind: 'firstClear' })] });
    const again = [...first, make({ itemSignature: 's2', occurredAt: T0 + HOUR })];
    expect(last(again).tier).toBe('none');
  });

  it('practice completions earn nothing by themselves; progress shows up as level milestones', () => {
    const make = attemptFactory();
    const results = run(successes(make, 4, T0, HOUR)).completions;
    expect(results.slice(0, 3).map((r) => r.tier)).toEqual(['none', 'none', 'none']);
    expect(results[3]).toMatchObject({ tier: 'normal', events: [expect.objectContaining({ key: 'peak:test.base:proficient' })] });
  });

  it('reaching Mastered for the first time is high', () => {
    const make = attemptFactory();
    const history = [
      ...successes(make, 3, T0, HOUR, { representation: 'numeral' }),
      ...successes(make, 2, T0 + 4 * HOUR, HOUR, { representation: 'verticalScale' }),
      make({ itemSignature: 'next-day', occurredAt: T0 + DAY + 6 * HOUR }),
    ];
    expect(last(history)).toMatchObject({ tier: 'high', events: [expect.objectContaining({ key: 'peak:test.base:mastered' })] });
  });

  it('exact replay has no value and says so', () => {
    const make = attemptFactory({ activityId: 'stretch-a', challenge: 'stretch', cued: false });
    const r = last([make({ itemSignature: 's1', occurredAt: T0 }), make({ itemSignature: 's1', occurredAt: T0 + HOUR })]);
    expect(r).toMatchObject({ tier: 'none', exposure: 'exactReplay' });
    expect(r.notes.join(' ')).toMatch(/Exact replay/);
  });

  it('due spaced review is low; mastered material with no review due is none', () => {
    const make = attemptFactory();
    const masteredAt = T0 + DAY + 6 * HOUR;
    const history = [
      ...successes(make, 3, T0, HOUR, { representation: 'numeral' }),
      ...successes(make, 2, T0 + 4 * HOUR, HOUR, { representation: 'verticalScale' }),
      make({ itemSignature: 'next-day', occurredAt: masteredAt }),
    ];
    const easy = last([...history, make({ itemSignature: 'easy', occurredAt: masteredAt + HOUR })]);
    expect(easy).toMatchObject({ tier: 'none', exposure: 'easyVariation' });
    expect(easy.notes.join(' ')).toMatch(/mastered this/);
    const review = last([...history, make({ itemSignature: 'review', occurredAt: masteredAt + 3 * DAY })]);
    expect(review).toMatchObject({ tier: 'low', exposure: 'dueSpacedReview', events: [expect.objectContaining({ kind: 'reviewStage' })] });
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
    expect(r.completions[1]!.events.map((e) => e.kind).sort()).toEqual(['firstClear', 'transferContext']);
  });

  it('a demonstrated answer voids the clear, so a later independent clear still counts', () => {
    const make = attemptFactory({ activityId: 'stretch-a', challenge: 'stretch', cued: false });
    const shown = [make({ itemSignature: 's1', occurredAt: T0, assistance: 'demonstrated' })];
    expect(last(shown).tier).toBe('none');
    expect(last([...shown, make({ itemSignature: 's2', occurredAt: T0 + DAY })]).tier).toBe('normal');
  });

  it('help lowers completion-specific value but never removes earned milestones', () => {
    const make = attemptFactory({ activityId: 'stretch-a', challenge: 'stretch', cued: false });
    expect(last([make({ itemSignature: 's1', occurredAt: T0, assistance: 'verbalHint' })]).tier).toBe('low');
    expect(capByAssistance('high', 'clue')).toBe('high');
    expect(capByAssistance('high', 'visualSupport')).toBe('normal');
    expect(capByAssistance('high', 'guided')).toBe('low');
    expect(capByAssistance('high', 'demonstrated')).toBeNull();
  });
});
