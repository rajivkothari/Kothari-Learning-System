import { T0, attemptFactory } from '../testing/support';
import { LEARNING_EVENT_EVOLUTION, LearningEventVersionError, readLearningEvent, upgradePayload, type EvolutionTable } from './evolution';

const make = attemptFactory();
const v1 = () => JSON.parse(JSON.stringify(make({ itemSignature: 'sig-1', occurredAt: T0, wrongTries: 2, assistance: 'retry', misconceptions: ['offByOne'] }))) as Record<string, unknown>;

/** A pretend future: attempts at version 3, with upgraders 1 -> 2 -> 3. */
const FUTURE: EvolutionTable = {
  current: { attempt: 3, completion: 1 },
  upgrades: {
    attempt: {
      1: (p) => ({ ...p, schemaVersion: 2, sessionKind: 'unknown' }), // a new required field gets an explicit "unknown"
      2: (p) => ({ ...p, schemaVersion: 3, representationId: p.representation }), // a renamed field keeps its value
    },
    completion: {},
  },
};

const reason = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(LearningEventVersionError);
    return (e as LearningEventVersionError).reason;
  }
  throw new Error('expected a LearningEventVersionError');
};

describe('learning event evolution', () => {
  it('reads current payloads unchanged', () => {
    const raw = v1();
    expect(readLearningEvent('attempt', raw)).toEqual({ type: 'attempt', attempt: raw });
    expect(LEARNING_EVENT_EVOLUTION.current).toEqual({ attempt: 1, completion: 1 });
  });

  it('upgrades an old payload one version at a time, keeping every recorded fact', () => {
    const raw = v1();
    const frozen = Object.freeze({ ...raw });
    const up = upgradePayload('attempt', frozen, FUTURE);
    expect(up.schemaVersion).toBe(3);
    expect(up).toMatchObject({ sessionKind: 'unknown', representationId: raw.representation });
    // Evidence semantics are untouched: what happened, how much help, which mistakes.
    for (const k of ['id', 'itemSignature', 'outcome', 'assistance', 'wrongTries', 'misconceptions', 'occurredAt', 'skillIds', 'challenge', 'cued', 'transfer']) expect(up[k]).toEqual(raw[k]);
    expect(frozen.schemaVersion).toBe(1); // the stored payload is never modified
  });

  it('refuses a payload from a newer app, recoverably (nothing is rewritten)', () => {
    expect(reason(() => readLearningEvent('attempt', { ...v1(), schemaVersion: 2 }))).toBe('newerThanApp');
  });

  it('refuses a version with no upgrade path, and an upgrader that skips a version', () => {
    const gap: EvolutionTable = { ...FUTURE, upgrades: { ...FUTURE.upgrades, attempt: { 2: FUTURE.upgrades.attempt[2]! } } };
    expect(reason(() => upgradePayload('attempt', v1(), gap))).toBe('noUpgradePath');
    const sloppy: EvolutionTable = { current: { attempt: 2, completion: 1 }, upgrades: { attempt: { 1: (p) => ({ ...p }) }, completion: {} } };
    expect(reason(() => upgradePayload('attempt', v1(), sloppy))).toBe('noUpgradePath');
  });

  it('refuses malformed payloads', () => {
    for (const bad of [null, [], 'x', {}, { schemaVersion: 0 }, { schemaVersion: 1.5 }]) expect(reason(() => upgradePayload('completion', bad))).toBe('malformed');
  });
});
