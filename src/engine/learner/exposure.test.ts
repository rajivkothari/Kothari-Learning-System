import { deriveLearnerState } from '../progression/timeline';
import { DAY, HOUR, MINI_GRAPH, POLICY, T0, attemptFactory, successes } from '../testing/support';
import { classifyExposure, type ExposureCandidate } from './exposure';

const make = attemptFactory();
const mastered = [
  ...successes(make, 3, T0, HOUR, { representation: 'numeral' }),
  ...successes(make, 2, T0 + 4 * HOUR, HOUR, { representation: 'verticalScale' }),
  make({ itemSignature: 'next-day', occurredAt: T0 + DAY + 6 * HOUR }),
  make({ itemSignature: 'ctx-1', occurredAt: T0 + DAY + 7 * HOUR, cued: false, transfer: { kind: 'novel', contextKey: 'reference' } }),
];
const masteredAt = T0 + DAY + 6 * HOUR;
const state = deriveLearnerState({ graph: MINI_GRAPH, policy: POLICY, attempts: mastered });
const fresh = deriveLearnerState({ graph: MINI_GRAPH, policy: POLICY, attempts: successes(attemptFactory(), 2, T0, HOUR) });

const c = (sig: string, transfer: ExposureCandidate['transfer'] = { kind: 'none' }): ExposureCandidate => ({ itemSignature: sig, skillIds: ['test.base'], transfer });
const at = masteredAt + 2 * HOUR;

describe('exposure classification', () => {
  it('exact replay: an item already solved', () => {
    expect(classifyExposure(state, POLICY, c('next-day'), at).exposure).toBe('exactReplay');
    // Text changes are irrelevant: identity is the semantic signature.
    expect(classifyExposure(fresh, POLICY, c('sig-' + T0 + '-0'), T0 + DAY).exposure).toBe('exactReplay');
  });

  it('developing: new item on a skill not yet mastered', () => {
    expect(classifyExposure(fresh, POLICY, c('new'), T0 + DAY).exposure).toBe('developing');
  });

  it('easy variation vs due spaced review on mastered material', () => {
    expect(classifyExposure(state, POLICY, c('new'), at).exposure).toBe('easyVariation');
    expect(classifyExposure(state, POLICY, c('new'), masteredAt + 3 * DAY).exposure).toBe('dueSpacedReview');
  });

  it('novel and higher-order application only in contexts not yet succeeded', () => {
    expect(classifyExposure(state, POLICY, c('new', { kind: 'novel', contextKey: 'reference' }), at).exposure).toBe('easyVariation');
    expect(classifyExposure(state, POLICY, c('new', { kind: 'novel', contextKey: 'fresh-context' }), at).exposure).toBe('novelApplication');
    expect(classifyExposure(state, POLICY, c('new', { kind: 'higherOrder', contextKey: 'planning' }), at).exposure).toBe('higherOrderApplication');
    // Application can happen before mastery too.
    expect(classifyExposure(fresh, POLICY, c('new', { kind: 'novel', contextKey: 'x' }), T0 + DAY).exposure).toBe('novelApplication');
  });

  it('property-like: repeating the exact mastered item never increases novelty', () => {
    for (const t of [at, masteredAt + 3 * DAY, masteredAt + 90 * DAY]) {
      expect(classifyExposure(state, POLICY, c('next-day'), t).exposure).toBe('exactReplay');
      expect(classifyExposure(state, POLICY, c('next-day', { kind: 'higherOrder', contextKey: 'new' }), t).exposure).toBe('exactReplay');
    }
  });
});
