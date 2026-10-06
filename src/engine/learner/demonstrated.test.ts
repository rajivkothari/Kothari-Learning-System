// Demonstrated answers contaminate one exact item, never the skill.
//
// Item A demonstrated -> A again later: seen before, no fresh evidence.
// Item B (same skill, new legitimate variation) solved independently -> genuine evidence,
// level progress, and opportunity upgrades, exactly as if A had never been demonstrated.
import type { AttemptEvidence } from '../evidence/attempt';
import { lifetimeValue } from '../progression/opportunities';
import { deriveLearnerState, runTimeline } from '../progression/processor';
import { DAY, HOUR, MINI_GRAPH, POLICY, T0, attemptFactory } from '../testing/support';

const derive = (attempts: AttemptEvidence[]) => deriveLearnerState({ graph: MINI_GRAPH, policy: POLICY, attempts });
const timeline = (attempts: AttemptEvidence[]) => runTimeline({ graph: MINI_GRAPH, policy: POLICY, attempts });

describe('demonstrated answers', () => {
  const practice = () => attemptFactory();
  const stretch = () => attemptFactory({ activityId: 'stretch-a', challenge: 'stretch', cued: false, transfer: { kind: 'novel', contextKey: 'ctx-reference' } });

  it('contaminate the exact item: solving A again is an exact replay with no fresh evidence', () => {
    const make = practice();
    const shown = make({ itemSignature: 'A', occurredAt: T0, assistance: 'demonstrated' });
    const again = make({ itemSignature: 'A', occurredAt: T0 + DAY });
    const r = timeline([shown, again]);
    expect(r.completions.at(-1)).toMatchObject({ exposure: 'exactReplay', upgrades: [] });
    const skill = r.state.skills['test.base']!;
    expect(skill.solvedSignatures).not.toContain('A');
    expect(skill.dimensions.accuracy.successes).toBe(0);
    expect(skill.dimensions.independence.rate).toBe(0);
  });

  it('a repeated exact item never becomes strong evidence, however many times it is repeated', () => {
    const make = practice();
    const history = [make({ itemSignature: 'A', occurredAt: T0, assistance: 'demonstrated' })];
    for (let i = 1; i <= 8; i++) history.push(make({ itemSignature: 'A', occurredAt: T0 + i * DAY }));
    const s = derive(history).skills['test.base']!;
    expect(s.level).not.toBe('proficient');
    expect(s.dimensions.accuracy.successes).toBe(0);
    expect(s.dimensions.retention.separatedSuccesses).toBe(0);
  });

  it('a new variation solved independently contributes independence and accuracy evidence', () => {
    const make = practice();
    const s = derive([make({ itemSignature: 'A', occurredAt: T0, assistance: 'demonstrated' }), make({ itemSignature: 'B', occurredAt: T0 + HOUR })]).skills['test.base']!;
    expect(s.solvedSignatures).toEqual(['B']);
    expect(s.dimensions.accuracy.successes).toBe(1);
    expect(s.dimensions.independence.rate).toBeGreaterThan(0);
  });

  it('a new independent variation upgrades the opportunity the demonstration could not', () => {
    const make = stretch();
    const shown = make({ itemSignature: 'A', occurredAt: T0, assistance: 'demonstrated' });
    const afterShown = timeline([shown]);
    expect(afterShown.completions.at(-1)!.upgrades).toEqual([]);
    const later = timeline([shown, make({ itemSignature: 'B', occurredAt: T0 + DAY })]);
    expect(later.completions.at(-1)!.upgrades.map((u) => [u.key, u.toTier])).toEqual(
      expect.arrayContaining([
        ['clear:activity:stretch-a', 'normal'],
        ['transfer:ctx-reference', 'normal'],
      ]),
    );
  });

  it('does not permanently poison the skill: new independent variations still reach every milestone', () => {
    const fresh = practice();
    const withShown = practice();
    const later = (make: ReturnType<typeof attemptFactory>) =>
      Array.from({ length: 6 }, (_, i) => make({ itemSignature: `N${i}`, occurredAt: T0 + DAY + i * HOUR, representation: i % 2 ? 'verticalScale' : 'numeral' }));
    const clean = derive(later(fresh)).skills['test.base']!;
    const poisoned = derive([withShown({ itemSignature: 'A', occurredAt: T0, assistance: 'demonstrated' }), ...later(withShown)]).skills['test.base']!;
    expect(clean.peakLevel).toBe('proficient');
    expect(poisoned.peakLevel).toBe(clean.peakLevel);
    // The demonstrated item stays out of the solved set, so it can never be "replayed" for credit.
    expect(poisoned.solvedSignatures).not.toContain('A');
  });

  it('lifetime value with a demonstration first equals value without it', () => {
    const a = stretch();
    const b = stretch();
    const withShown = timeline([a({ itemSignature: 'A', occurredAt: T0, assistance: 'demonstrated' }), a({ itemSignature: 'B', occurredAt: T0 + DAY })]);
    const without = timeline([b({ itemSignature: 'B', occurredAt: T0 + DAY })]);
    expect(lifetimeValue(withShown.processor.opportunities())).toBe(lifetimeValue(without.processor.opportunities()));
  });
});
