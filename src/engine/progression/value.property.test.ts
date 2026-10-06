// Property tests for the progression-opportunity rules. These are the invariants a
// future reward system relies on:
// - inserting deliberate failures never raises any opportunity's lifetime value
// - extra (unnecessary) help never raises it
// - a weaker earlier demonstration never raises the same opportunity's lifetime value
// - a weaker-then-stronger route can upgrade, but never totals more than the strongest
// - duplicate processing creates nothing new
// - replaying an already-solved item never creates an upgrade
import * as fc from 'fast-check';

import { maxAssistance, type AssistanceLevel } from '../evidence/assistance';
import { AttemptEvidenceSchema, type AttemptEvidence, type Challenge, type Transfer } from '../evidence/attempt';
import { HOUR, MINI_GRAPH, POLICY, T0 } from '../testing/support';
import { lifetimeValue } from './opportunities';
import { eventsFromAttempts, replayEvents, runTimeline } from './processor';
import { tierRank, type EventTier } from './tiers';

type Kind = 'practice' | 'stretch' | 'encounter' | 'novel' | 'higher';

interface Spec {
  kind: Kind;
  sig: number;
  correct: boolean;
  assistance: AssistanceLevel;
  gapHours: number;
  rep: 'numeral' | 'verticalScale';
  skill: 'test.base' | 'test.next' | 'both';
  ctx: 'ctx.a' | 'ctx.b';
}

const mixedSpec: fc.Arbitrary<Spec> = fc.record({
  kind: fc.constantFrom<Kind>('practice', 'practice', 'practice', 'stretch', 'encounter', 'novel', 'higher'),
  sig: fc.nat(14),
  correct: fc.boolean(),
  assistance: fc.constantFrom<AssistanceLevel>('independent', 'independent', 'independent', 'clue', 'verbalHint', 'visualSupport', 'guided', 'demonstrated'),
  gapHours: fc.constantFrom(1, 2, 6, 12, 26, 50, 80, 200),
  rep: fc.constantFrom('numeral', 'verticalScale'),
  skill: fc.constantFrom('test.base', 'test.base', 'test.next', 'both'),
  ctx: fc.constantFrom('ctx.a', 'ctx.b'),
});

const learningSpec: fc.Arbitrary<Spec> = fc.record({
  kind: fc.constantFrom<Kind>('practice', 'practice', 'practice', 'practice', 'practice', 'stretch', 'novel'),
  sig: fc.nat(40),
  correct: fc.constantFrom(true, true, true, true, true, true, false),
  assistance: fc.constantFrom<AssistanceLevel>('independent', 'independent', 'independent', 'independent', 'retry', 'clue', 'guided'),
  gapHours: fc.constantFrom(1, 3, 8, 22, 30, 76, 170),
  rep: fc.constantFrom('numeral', 'verticalScale'),
  skill: fc.constantFrom('test.base', 'test.base', 'test.base', 'test.next', 'both'),
  ctx: fc.constantFrom('ctx.a', 'ctx.b'),
});

const timelineArb = fc.oneof(fc.array(mixedSpec, { minLength: 1, maxLength: 25 }), fc.array(learningSpec, { minLength: 5, maxLength: 45 }));

function attempt(fields: Omit<AttemptEvidence, 'schemaVersion' | 'learnerId' | 'misconceptions'>): AttemptEvidence {
  return AttemptEvidenceSchema.parse({ schemaVersion: 1, learnerId: 'learner-prop', misconceptions: [], ...fields });
}

function shape(s: Spec): { challenge: Challenge; transfer: Transfer; skillIds: string[]; activityId: string } {
  const skillIds = s.skill === 'both' ? ['test.base', 'test.next'] : [s.skill];
  const challenge: Challenge = s.kind === 'practice' ? 'practice' : s.kind === 'encounter' ? 'masteryEncounter' : 'stretch';
  const transfer: Transfer = s.kind === 'novel' ? { kind: 'novel', contextKey: s.ctx } : s.kind === 'higher' || s.kind === 'encounter' ? { kind: 'higherOrder', contextKey: s.ctx } : { kind: 'none' };
  return { challenge, transfer, skillIds, activityId: `act-${s.kind}-${s.ctx}` };
}

/** Build a timeline. Optional extra wrong tries / extra help on chosen completions. */
function build(specs: Spec[], wrongTriesAt: ReadonlySet<number> = new Set(), extraHelpAt: ReadonlyMap<number, AssistanceLevel> = new Map()): AttemptEvidence[] {
  let t = T0;
  const out: AttemptEvidence[] = [];
  specs.forEach((s, i) => {
    t += s.gapHours * HOUR;
    const { challenge, transfer, skillIds, activityId } = shape(s);
    let assistance = s.assistance;
    const extra = extraHelpAt.get(i);
    if (extra) assistance = maxAssistance(assistance, extra);
    const wrongTries = wrongTriesAt.has(i) ? 2 : 0;
    if (wrongTries > 0) assistance = maxAssistance(assistance, 'retry');
    const base = {
      activityInstanceId: `inst-${i}`,
      challenge,
      cued: transfer.kind === 'none',
      representation: s.rep,
      transfer,
      outcome: s.correct ? ('correct' as const) : ('incorrect' as const),
      assistance,
      wrongTries,
    };
    if (s.kind === 'encounter') {
      out.push(attempt({ ...base, id: `a-${i}-1`, activityId: 'enc.s1', encounterId: 'enc', skillIds, itemSignature: `enc1-${s.sig}`, occurredAt: t }));
      out.push(attempt({ ...base, id: `a-${i}-2`, activityId: 'enc.s2', encounterId: 'enc', skillIds, itemSignature: `enc2-${s.sig}`, occurredAt: t + 60_000 }));
    } else {
      out.push(attempt({ ...base, id: `a-${i}`, activityId, skillIds, itemSignature: `${s.kind}-${s.sig}`, occurredAt: t }));
    }
  });
  return out;
}

const ledgerOf = (attempts: AttemptEvidence[]) => runTimeline({ graph: MINI_GRAPH, policy: POLICY, attempts }).processor.opportunities();

/** Every opportunity's lifetime tier for `variant` is <= the honest one; total too. */
function expectNoGain(honest: Record<string, EventTier>, variant: Record<string, EventTier>) {
  for (const [key, tier] of Object.entries(variant)) {
    const h = honest[key];
    expect({ key, honestHasIt: h !== undefined }).toEqual({ key, honestHasIt: true });
    expect(tierRank(tier)).toBeLessThanOrEqual(tierRank(h!));
  }
  expect(lifetimeValue(variant)).toBeLessThanOrEqual(lifetimeValue(honest));
}

describe('progression opportunity invariants', () => {
  it('property: the sum of granted increments always equals lifetime value (no double counting)', () => {
    fc.assert(
      fc.property(timelineArb, (specs) => {
        const r = runTimeline({ graph: MINI_GRAPH, policy: POLICY, attempts: build(specs) });
        const increments = r.completions.flatMap((c) => c.upgrades).reduce((s, u) => s + u.increment, 0);
        expect(increments).toBe(lifetimeValue(r.processor.opportunities()));
      }),
      { numRuns: 300 },
    );
  });

  it('property: inserting deliberately failed attempts anywhere never raises lifetime value', () => {
    const insertion = fc.record({ after: fc.nat(60), sig: fc.nat(14), skill: fc.constantFrom('test.base', 'test.next'), inside: fc.boolean() });
    fc.assert(
      fc.property(timelineArb, fc.array(insertion, { maxLength: 10 }), (specs, inserts) => {
        const honest = build(specs);
        const failer = [...honest];
        inserts.forEach((ins, k) => {
          const anchor = honest[ins.after % honest.length]!;
          failer.push(
            attempt({
              id: `fail-${k}`,
              activityInstanceId: ins.inside ? anchor.activityInstanceId : `fail-inst-${k}`,
              activityId: ins.inside ? anchor.activityId : 'act-failing',
              ...(ins.inside && anchor.encounterId ? { encounterId: anchor.encounterId } : {}),
              skillIds: [ins.skill],
              itemSignature: `fail-${ins.sig}`,
              challenge: ins.inside ? anchor.challenge : 'practice',
              cued: ins.inside ? anchor.cued : true,
              representation: 'numeral',
              transfer: ins.inside ? anchor.transfer : { kind: 'none' },
              outcome: 'incorrect',
              assistance: 'independent',
              wrongTries: 0,
              occurredAt: anchor.occurredAt - 1,
            }),
          );
        });
        expectNoGain(ledgerOf(honest), ledgerOf(failer));
      }),
      { numRuns: 300 },
    );
  });

  it('property: extra wrong tries never raise lifetime value', () => {
    fc.assert(
      fc.property(timelineArb, fc.uniqueArray(fc.nat(44), { maxLength: 8 }), (specs, picks) => {
        const chosen = new Set(picks.filter((i) => i < specs.length && specs[i]!.correct));
        expectNoGain(ledgerOf(build(specs)), ledgerOf(build(specs, chosen)));
      }),
      { numRuns: 300 },
    );
  });

  it('property: unnecessary help never raises lifetime value', () => {
    fc.assert(
      fc.property(
        timelineArb,
        fc.array(fc.tuple(fc.nat(44), fc.constantFrom<AssistanceLevel>('clue', 'verbalHint', 'visualSupport', 'guided', 'demonstrated')), { maxLength: 6 }),
        (specs, helps) => {
          const extra = new Map(helps.map(([i, h]) => [i % specs.length, h]));
          expectNoGain(ledgerOf(build(specs)), ledgerOf(build(specs, new Set(), extra)));
        },
      ),
      { numRuns: 300 },
    );
  });

  it('property: a weaker earlier demonstration never raises that opportunity, and weaker-then-stronger can upgrade up to (never past) the strong value', () => {
    const weaker = fc.constantFrom<AssistanceLevel>('verbalHint', 'visualSupport', 'guided', 'demonstrated');
    fc.assert(
      fc.property(timelineArb, fc.nat(44), weaker, (specs, pick, help) => {
        const honest = build(specs);
        // Only targets whose own completion actually demonstrated something (not an exact replay).
        const honestRun = runTimeline({ graph: MINI_GRAPH, policy: POLICY, attempts: honest });
        const counted = new Set(honestRun.completions.filter((c) => c.exposure !== 'exactReplay').map((c) => c.instanceId));
        const targets = specs.map((s, i) => ({ s, i })).filter(({ s, i }) => s.kind !== 'practice' && s.correct && counted.has(`inst-${i}`));
        if (targets.length === 0) return;
        const { s, i } = targets[pick % targets.length]!;
        const at = honest.find((a) => a.activityInstanceId === `inst-${i}`)!;
        const { challenge, transfer, skillIds, activityId } = shape(s);
        const weakFirst = attempt({
          id: 'weak-first',
          activityInstanceId: 'weak-first-inst',
          activityId: s.kind === 'encounter' ? 'enc.s1' : activityId,
          ...(s.kind === 'encounter' ? { encounterId: 'enc' } : {}),
          skillIds,
          itemSignature: `weak-new-${i}`,
          challenge,
          cued: transfer.kind === 'none',
          representation: s.rep,
          transfer,
          outcome: 'correct',
          assistance: maxAssistance(help, at.assistance),
          wrongTries: 0,
          occurredAt: at.occurredAt - 30 * 60_000,
        });
        const h = ledgerOf(honest);
        const v = ledgerOf([...honest, weakFirst]);
        // Same opportunity keys: clear and transfer for this target.
        const keys = [s.kind === 'encounter' ? 'clear:encounter:enc' : `clear:activity:${activityId}`, transfer.kind !== 'none' ? `transfer:${transfer.contextKey}` : null].filter(
          (k): k is string => k !== null,
        );
        for (const k of keys) expect(tierRank(v[k] ?? 'none')).toBe(tierRank(h[k] ?? 'none'));
      }),
      { numRuns: 300 },
    );
  });

  it('property: immediate independent success is never worth less than taking a weaker route first', () => {
    const weak = fc.constantFrom<AssistanceLevel>('clue', 'verbalHint', 'visualSupport', 'guided', 'demonstrated');
    fc.assert(
      fc.property(fc.constantFrom<Kind>('stretch', 'novel', 'higher'), fc.array(weak, { minLength: 1, maxLength: 4 }), (kind, weakRoute) => {
        const make = (route: AssistanceLevel[]) =>
          route.map((assistance, n) => {
            const { challenge, transfer, skillIds, activityId } = shape({ kind, sig: 0, correct: true, assistance, gapHours: 1, rep: 'numeral', skill: 'test.base', ctx: 'ctx.a' });
            return attempt({ id: `r-${n}`, activityInstanceId: `r-inst-${n}`, activityId, skillIds, itemSignature: `r-sig-${n}`, challenge, cued: transfer.kind === 'none', representation: 'numeral', transfer, outcome: 'correct', assistance, wrongTries: 0, occurredAt: T0 + n * HOUR });
          });
        const immediate = ledgerOf(make(['independent']));
        const indirect = ledgerOf(make([...weakRoute, 'independent']));
        const k = kind === 'stretch' ? `clear:activity:act-stretch-ctx.a` : `transfer:ctx.a`;
        // Genuine improvement is recognized: the indirect route reaches the same tier...
        expect(tierRank(indirect[k]!)).toBe(tierRank(immediate[k]!));
        // ...and the same opportunities total no more than the immediate route.
        const opp = (l: Record<string, EventTier>) => Object.entries(l).filter(([key]) => key.startsWith('clear:') || key.startsWith('transfer:')).reduce((s, [, t]) => s + tierRank(t), 0);
        expect(opp(indirect)).toBe(opp(immediate));
      }),
      { numRuns: 200 },
    );
  });

  it('property: duplicate processing creates no duplicate upgrades', () => {
    fc.assert(
      fc.property(timelineArb, fc.array(fc.nat(200), { maxLength: 15 }), (specs, dupes) => {
        const events = eventsFromAttempts(build(specs));
        // Real duplicates (retries, re-delivery) arrive after the original: insert copies later.
        const withDupes = [...events];
        for (const d of dupes) {
          const original = events[d % events.length]!;
          const at = withDupes.indexOf(original);
          withDupes.splice(at + 1 + (d % (withDupes.length - at)), 0, original);
        }
        const a = replayEvents({ graph: MINI_GRAPH, policy: POLICY }, events);
        const b = replayEvents({ graph: MINI_GRAPH, policy: POLICY }, withDupes);
        expect(b.processor.opportunities()).toEqual(a.processor.opportunities());
        const ids = (r: typeof a) => r.completions.flatMap((c) => c.upgrades.map((u) => `${u.key}->${u.toTier}`));
        expect(new Set(ids(b)).size).toBe(ids(b).length);
        expect(ids(b).sort()).toEqual(ids(a).sort());
      }),
      { numRuns: 200 },
    );
  });

  it('property: replaying an already-solved item never manufactures an upgrade', () => {
    fc.assert(
      fc.property(timelineArb, fc.nat(44), fc.constantFrom<Challenge>('practice', 'stretch'), (specs, pick, challenge) => {
        const attempts = build(specs);
        const solved = attempts.filter((a) => a.outcome === 'correct' && !a.encounterId);
        if (solved.length === 0) return;
        const original = solved[pick % solved.length]!;
        const replay = attempt({ ...original, id: 'replay', activityInstanceId: 'replay-inst', challenge, assistance: 'independent', wrongTries: 0, occurredAt: (attempts.at(-1)?.occurredAt ?? T0) + HOUR });
        const result = runTimeline({ graph: MINI_GRAPH, policy: POLICY, attempts: [...attempts, replay] }).completions.at(-1)!;
        expect(result.exposure).toBe('exactReplay');
        expect(result.upgrades).toEqual([]);
        expect(result.tier).toBe('none');
      }),
      { numRuns: 300 },
    );
  });
});
