import { ScaffoldingPolicySchema } from '../content/pack';
import { PACK } from '../testing/support';
import { assistanceForProgress, nextScaffold, shouldRegenerate } from './scaffolding';

const policy = (id: string) => PACK.scaffoldingPolicies.find((p) => p.id === id)!;

describe('scaffolding policies are per activity type', () => {
  it('arithmetic offers a clue on request, then a number line after two misses', () => {
    const p = policy('arithmetic.default');
    expect(nextScaffold(p, { wrongTries: 0, stepsGiven: [] })).toMatchObject({ stepId: 'highlight-start', assistance: 'clue', mode: 'available' });
    expect(nextScaffold(p, { wrongTries: 1, stepsGiven: ['highlight-start'] })).toBeNull();
    expect(nextScaffold(p, { wrongTries: 2, stepsGiven: ['highlight-start'] })).toMatchObject({ stepId: 'number-line', mode: 'offer' });
    expect(shouldRegenerate(p, { wrongTries: 3, stepsGiven: [] })).toBe(false); // show-answer is offered at 3 first
    expect(shouldRegenerate(p, { wrongTries: 4, stepsGiven: [] })).toBe(true);
  });

  it('phonics uses a different sequence: hear the word, then a picture, then the answer', () => {
    const p = policy('literacy.phonics');
    expect(p.steps.map((s) => s.kind)).toEqual(['replayWord', 'articulationPicture', 'showAnswer']);
    expect(nextScaffold(p, { wrongTries: 0, stepsGiven: [] })?.assistance).toBe('verbalHint');
  });

  it('the encounter policy never demonstrates an answer', () => {
    const p = policy('encounter.no-demonstration');
    expect(p.steps.every((s) => s.assistance !== 'demonstrated')).toBe(true);
    expect(nextScaffold(p, { wrongTries: 9, stepsGiven: ['remind-notes'] })).toBeNull();
  });

  it('records assistance on the shared scale whatever the sequence', () => {
    expect(assistanceForProgress(policy('arithmetic.default'), { wrongTries: 0, stepsGiven: [] })).toBe('independent');
    expect(assistanceForProgress(policy('arithmetic.default'), { wrongTries: 2, stepsGiven: [] })).toBe('retry');
    expect(assistanceForProgress(policy('arithmetic.default'), { wrongTries: 2, stepsGiven: ['highlight-start', 'number-line'] })).toBe('visualSupport');
    expect(assistanceForProgress(policy('literacy.phonics'), { wrongTries: 0, stepsGiven: ['replay-word'] })).toBe('verbalHint');
    expect(() => assistanceForProgress(policy('literacy.phonics'), { wrongTries: 0, stepsGiven: ['nope'] })).toThrow(/not part of policy/);
  });

  it('rejects a policy whose help decreases, or that offers "retry" as help', () => {
    const bad = ScaffoldingPolicySchema.safeParse({
      schemaVersion: 1,
      id: 'bad',
      description: 'x',
      allowLeaveAndReturn: true,
      steps: [
        { id: 'a', kind: 'k', assistance: 'guided', offer: 'onRequest' },
        { id: 'b', kind: 'k', assistance: 'clue', offer: 'onRequest' },
        { id: 'c', kind: 'k', assistance: 'retry', offer: 'onRequest' },
      ],
    });
    expect(bad.success).toBe(false);
    const paths = bad.error!.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['steps.1.assistance', 'steps.2.assistance']));
  });
});
