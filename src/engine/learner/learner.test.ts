import * as fc from 'fast-check';

import { ASSISTANCE_LEVELS, assistanceRank, type AssistanceLevel } from '../evidence/assistance';
import type { AttemptEvidence } from '../evidence/attempt';
import { MasteryPolicySchema, type MasteryPolicy } from '../mastery/policy';
import { deriveLearnerState } from '../progression/timeline';
import { canonicalJson } from '../random/hash';
import { isReviewDue, nextReviewAt, reviewIntervalMs } from '../review/review';
import { levelRank } from '../skills/levels';
import { DAY, HOUR, MINI_GRAPH, POLICY, T0, attemptFactory, successes } from '../testing/support';
import { classifyExposure } from './exposure';

const derive = (attempts: AttemptEvidence[], policy: MasteryPolicy = POLICY) => deriveLearnerState({ graph: MINI_GRAPH, policy, attempts });

/** 3 numeral + 2 vertical-scale successes on day 0, one more numeral success a day later. */
function masteryHistory(make = attemptFactory()) {
  return [
    ...successes(make, 3, T0, HOUR, { representation: 'numeral' }),
    ...successes(make, 2, T0 + 4 * HOUR, HOUR, { representation: 'verticalScale' }),
    make({ itemSignature: 'next-day', occurredAt: T0 + DAY + 6 * HOUR }),
  ];
}

describe('mastery levels', () => {
  it('starts introduced, with dependent skills locked', () => {
    const s = derive([]);
    expect(s.skills['test.base']?.level).toBe('introduced');
    expect(s.skills['test.next']?.level).toBe('locked');
    expect(s.asOf).toBeNull();
  });

  it('becomes practicing after the first scored attempt, even a wrong one', () => {
    const make = attemptFactory();
    expect(derive([make({ itemSignature: 'a', occurredAt: T0, outcome: 'incorrect' })]).skills['test.base']?.level).toBe('practicing');
  });

  it('reaches proficient on several independent successes across distinct items', () => {
    const s = derive(successes(attemptFactory(), 4, T0, HOUR));
    const base = s.skills['test.base']!;
    expect(base.level).toBe('proficient');
    expect(base.explanation.join(' ')).toMatch(/distinct item|representation|retention/);
  });

  it('does not count exact repeats: six successes on one item stay practicing', () => {
    const make = attemptFactory();
    const s = derive(Array.from({ length: 6 }, (_, i) => make({ itemSignature: 'same', occurredAt: T0 + i * HOUR })));
    expect(s.skills['test.base']).toMatchObject({ level: 'practicing', dimensions: { variety: { variants: 1 }, accuracy: { successes: 1, scored: 1 } } });
  });

  it('does not count demonstrated answers as successes', () => {
    const s = derive(successes(attemptFactory(), 6, T0, HOUR, { assistance: 'demonstrated' }));
    expect(s.skills['test.base']).toMatchObject({ level: 'practicing', dimensions: { accuracy: { successes: 0, scored: 6 }, variety: { variants: 0 } } });
  });

  it('requires retention across time and representation variety for mastered', () => {
    const make = attemptFactory();
    const sameDay = [...successes(make, 3, T0, HOUR, { representation: 'numeral' }), ...successes(make, 2, T0 + 4 * HOUR, HOUR, { representation: 'verticalScale' })];
    expect(derive(sameDay).skills['test.base']?.level).toBe('proficient');
    expect(derive(sameDay).skills['test.base']?.explanation.join(' ')).toMatch(/retention/);
    const s = derive(masteryHistory());
    expect(s.skills['test.base']).toMatchObject({ level: 'mastered', peakLevel: 'mastered', dimensions: { retention: { level: 'spaced' } } });
    expect(s.skills['test.base']?.review.masteredAt).toBe(T0 + DAY + 6 * HOUR);
  });

  it('records transfer evidence before mastery without changing the level', () => {
    const make = attemptFactory();
    const s = derive([
      make({ itemSignature: 't1', occurredAt: T0, cued: false, transfer: { kind: 'novel', contextKey: 'ctx.reference' } }),
      make({ itemSignature: 'p1', occurredAt: T0 + HOUR, outcome: 'incorrect' }),
    ]);
    expect(s.skills['test.base']).toMatchObject({ level: 'practicing', dimensions: { transfer: { level: 'emerging', contexts: ['ctx.reference'] } } });
  });

  it('does not count transfer evidence earned with heavy help', () => {
    const make = attemptFactory();
    const s = derive([make({ itemSignature: 't1', occurredAt: T0, cued: false, transfer: { kind: 'novel', contextKey: 'c' }, assistance: 'guided' })]);
    expect(s.skills['test.base']?.dimensions.transfer.level).toBe('none');
  });

  it('unlocks dependents from prerequisite peaks, and a later dip does not re-lock them', () => {
    const make = attemptFactory();
    const history = successes(make, 4, T0, HOUR);
    expect(derive(history).skills['test.next']?.unlocked).toBe(true);
    const dipped = [...history, ...Array.from({ length: 8 }, (_, i) => make({ itemSignature: `f${i}`, occurredAt: T0 + DAY + i * HOUR, outcome: 'incorrect' as const }))];
    const s = derive(dipped);
    expect(s.skills['test.base']?.level).toBe('practicing');
    expect(s.skills['test.base']?.peakLevel).toBe('proficient');
    expect(s.skills['test.next']?.unlocked).toBe(true);
  });
});

describe('spaced review', () => {
  const history = masteryHistory();
  const masteredAt = T0 + DAY + 6 * HOUR;

  it('is never due immediately after mastery (property)', () => {
    const review = derive(history).skills['test.base']!.review;
    const interval = reviewIntervalMs(POLICY, 0);
    fc.assert(fc.property(fc.integer({ min: 0, max: interval - 1 }), (delta) => expect(isReviewDue(review, POLICY, masteredAt + delta)).toBe(false)));
    expect(isReviewDue(review, POLICY, masteredAt + interval)).toBe(true);
  });

  it('an immediate repeat after mastery is easy variation, not review, and does not advance the schedule', () => {
    const make = attemptFactory({ activityId: 'other' });
    const state = derive(history);
    const candidate = { itemSignature: 'fresh-1', skillIds: ['test.base'], transfer: { kind: 'none' as const } };
    expect(classifyExposure(state, POLICY, candidate, masteredAt + HOUR).exposure).toBe('easyVariation');
    const after = derive([...history, make({ itemSignature: 'fresh-1', occurredAt: masteredAt + HOUR })]);
    expect(after.skills['test.base']?.review.stage).toBe(0);
  });

  it('a due success passes the review and lengthens the next interval', () => {
    const due = masteredAt + 3 * DAY + HOUR;
    const state = derive(history);
    expect(classifyExposure(state, POLICY, { itemSignature: 'r1', skillIds: ['test.base'], transfer: { kind: 'none' } }, due).exposure).toBe('dueSpacedReview');
    const after = derive([...history, attemptFactory({ activityId: 'review' })({ itemSignature: 'r1', occurredAt: due })]).skills['test.base']!;
    expect(after.review.stage).toBe(1);
    expect(nextReviewAt(after.review, POLICY)).toBe(due + 7 * DAY);
  });

  it('a failed due review demotes the current level until a time-separated success', () => {
    const make = attemptFactory({ activityId: 'review' });
    const fail = masteredAt + 3 * DAY;
    const withFail = [...history, make({ itemSignature: 'r-fail', occurredAt: fail, outcome: 'incorrect' })];
    const s1 = derive(withFail).skills['test.base']!;
    expect(s1).toMatchObject({ level: 'proficient', peakLevel: 'mastered', review: { needsReconsolidation: true, stage: 0 } });

    const soon = [...withFail, make({ itemSignature: 'r-soon', occurredAt: fail + 2 * HOUR })];
    const s2 = derive(soon).skills['test.base']!;
    expect(s2.level).toBe('proficient'); // too soon after the failure
    expect(s2.review.stage).toBe(1); // but the schedule only listens to successes

    const later = [...soon, make({ itemSignature: 'r-later', occurredAt: fail + DAY })];
    expect(derive(later).skills['test.base']).toMatchObject({ level: 'mastered', review: { needsReconsolidation: false } });
  });
});

describe('derived state is recomputable from durable evidence', () => {
  it('a different policy re-derives state from the same, unmodified evidence', () => {
    const history = masteryHistory();
    const frozen = canonicalJson(history);
    const stricter = MasteryPolicySchema.parse({ ...POLICY, id: 'stricter-test', mastered: { ...POLICY.mastered, minVariants: 8 } });
    expect(derive(history).skills['test.base']?.level).toBe('mastered');
    const s = derive(history, stricter);
    expect(s.skills['test.base']?.level).toBe('proficient');
    expect(s.policyId).toBe('stricter-test');
    expect(canonicalJson(history)).toBe(frozen);
  });

  it('property: input order does not matter', () => {
    const history = masteryHistory();
    const expected = canonicalJson(derive(history));
    fc.assert(fc.property(fc.shuffledSubarray(history, { minLength: history.length, maxLength: history.length }), (shuffled) => {
      expect(canonicalJson(derive(shuffled))).toBe(expected);
    }));
  });
});

describe('assistance monotonicity', () => {
  it('policy credit never rises with more help, and demonstrated earns nothing', () => {
    for (let i = 1; i < ASSISTANCE_LEVELS.length; i++) {
      expect(POLICY.assistanceCredit[ASSISTANCE_LEVELS[i]!]).toBeLessThanOrEqual(POLICY.assistanceCredit[ASSISTANCE_LEVELS[i - 1]!]);
    }
    expect(POLICY.assistanceCredit.demonstrated).toBe(0);
  });

  it('property: raising the help on one attempt never raises independence or level (distinct items)', () => {
    const level = fc.constantFrom(...ASSISTANCE_LEVELS);
    const row = fc.record({ correct: fc.boolean(), assistance: level, gapHours: fc.integer({ min: 0, max: 48 }) });
    fc.assert(
      fc.property(fc.array(row, { minLength: 1, maxLength: 14 }), fc.nat(), level, (rows, pick, extra) => {
        const build = (bump: number | null) => {
          const make = attemptFactory();
          let t = T0;
          return rows.map((r, i) => {
            t += r.gapHours * HOUR;
            let assistance: AssistanceLevel = r.assistance;
            if (i === bump && assistanceRank(extra) > assistanceRank(assistance)) assistance = extra;
            const outcome = r.correct ? ('correct' as const) : ('incorrect' as const);
            return make({ itemSignature: `u${i}`, occurredAt: t, outcome, assistance, wrongTries: assistanceRank(assistance) >= 1 && r.correct ? 1 : 0 });
          });
        };
        const target = pick % rows.length;
        const a = derive(build(null)).skills['test.base']!;
        const b = derive(build(target)).skills['test.base']!;
        expect(b.dimensions.independence.rate).toBeLessThanOrEqual(a.dimensions.independence.rate + 1e-12);
        expect(levelRank(b.peakLevel)).toBeLessThanOrEqual(levelRank(a.peakLevel));
      }),
      { numRuns: 300 },
    );
  });
});
