// Property tests for the anti-farming and no-intentional-failure rules.
// These are the invariants the future reward system relies on.
import * as fc from 'fast-check';

import { ASSISTANCE_LEVELS, maxAssistance, type AssistanceLevel } from '../evidence/assistance';
import { AttemptEvidenceSchema, type AttemptEvidence, type Challenge, type Transfer } from '../evidence/attempt';
import { HOUR, MINI_GRAPH, POLICY, T0 } from '../testing/support';
import { runTimeline } from './timeline';
import { tierRank, type ProgressionAssessment, type ValueEvent } from './value';

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

const ASSIST_MIXED: AssistanceLevel[] = ['independent', 'independent', 'independent', 'clue', 'verbalHint', 'visualSupport', 'guided', 'demonstrated'];

/** Mixed behaviour: lots of help, failures, encounters and transfer contexts. */
const mixedSpec: fc.Arbitrary<Spec> = fc.record({
  kind: fc.constantFrom<Kind>('practice', 'practice', 'practice', 'stretch', 'encounter', 'novel', 'higher'),
  sig: fc.nat(14), // small pool so exact replays happen
  correct: fc.boolean(),
  assistance: fc.constantFrom(...ASSIST_MIXED),
  gapHours: fc.constantFrom(1, 2, 6, 12, 26, 50, 80, 200),
  rep: fc.constantFrom('numeral', 'verticalScale'),
  skill: fc.constantFrom('test.base', 'test.base', 'test.next', 'both'),
  ctx: fc.constantFrom('ctx.a', 'ctx.b'),
});

/** Steady learning: mostly correct and independent, spread over days, so skills reach mastery and reviews come due. */
const learningSpec: fc.Arbitrary<Spec> = fc.record({
  kind: fc.constantFrom<Kind>('practice', 'practice', 'practice', 'practice', 'practice', 'stretch', 'novel'),
  sig: fc.nat(40),
  correct: fc.constantFrom(true, true, true, true, true, true, false),
  assistance: fc.constantFrom<AssistanceLevel>('independent', 'independent', 'independent', 'independent', 'retry', 'clue'),
  gapHours: fc.constantFrom(1, 3, 8, 22, 30, 76, 170),
  rep: fc.constantFrom('numeral', 'verticalScale'),
  skill: fc.constantFrom('test.base', 'test.base', 'test.base', 'test.next', 'both'),
  ctx: fc.constantFrom('ctx.a', 'ctx.b'),
});

const timelineArb = fc.oneof(fc.array(mixedSpec, { minLength: 1, maxLength: 25 }), fc.array(learningSpec, { minLength: 5, maxLength: 45 }));

function attempt(fields: Omit<AttemptEvidence, 'schemaVersion' | 'learnerId' | 'misconceptions'>): AttemptEvidence {
  return AttemptEvidenceSchema.parse({ schemaVersion: 1, learnerId: 'learner-prop', misconceptions: [], ...fields });
}

/** Build a timeline. `wrongTriesAt` adds wrong tries to chosen completions (same help otherwise). */
function build(specs: Spec[], wrongTriesAt: ReadonlySet<number> = new Set(), extraHelpAt: ReadonlyMap<number, AssistanceLevel> = new Map()): AttemptEvidence[] {
  let t = T0;
  const out: AttemptEvidence[] = [];
  specs.forEach((s, i) => {
    t += s.gapHours * HOUR;
    const skillIds = s.skill === 'both' ? ['test.base', 'test.next'] : [s.skill];
    const challenge: Challenge = s.kind === 'stretch' || s.kind === 'novel' || s.kind === 'higher' ? 'stretch' : s.kind === 'encounter' ? 'masteryEncounter' : 'practice';
    const transfer: Transfer = s.kind === 'novel' ? { kind: 'novel', contextKey: s.ctx } : s.kind === 'higher' || s.kind === 'encounter' ? { kind: 'higherOrder', contextKey: s.ctx } : { kind: 'none' };
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
      out.push(attempt({ ...base, id: `a-${i}`, activityId: `act-${s.kind}-${s.ctx}`, skillIds, itemSignature: `${s.kind}-${s.sig}`, occurredAt: t }));
    }
  });
  return out;
}

const run = (attempts: AttemptEvidence[]) => runTimeline({ graph: MINI_GRAPH, policy: POLICY, attempts }).completions;

function eventMap(completions: ProgressionAssessment[]): Map<string, ValueEvent> {
  return new Map(completions.flatMap((c) => c.events).map((e) => [e.key, e]));
}

const total = (completions: ProgressionAssessment[]) => completions.reduce((s, c) => s + c.events.reduce((x, e) => x + tierRank(e.tier), 0), 0);

/** Failer's events must be a subset of the honest learner's, each at an equal or lower tier. */
function expectDominated(honest: ProgressionAssessment[], failer: ProgressionAssessment[]) {
  const h = eventMap(honest);
  for (const [key, e] of eventMap(failer)) {
    const he = h.get(key);
    expect({ key, presentForHonest: he !== undefined }).toEqual({ key, presentForHonest: true });
    expect(tierRank(e.tier)).toBeLessThanOrEqual(tierRank(he!.tier));
  }
  expect(total(failer)).toBeLessThanOrEqual(total(honest));
}

describe('progression value invariants', () => {
  // Note: added failures can DELAY a milestone to a later completion. That later
  // completion then shows a milestone the honest learner earned earlier. It is the
  // same one-time event, not an extra one, so the invariant is stated over the whole
  // timeline (subset of events, no higher tiers, no higher total), plus a
  // per-completion check where the prior history is identical.
  it('property: extra wrong tries never add value; the first affected completion never rises', () => {
    fc.assert(
      fc.property(timelineArb, fc.uniqueArray(fc.nat(44), { maxLength: 8 }), (specs, picks) => {
        const correctOnes = new Set(picks.filter((i) => i < specs.length && specs[i]!.correct));
        if (correctOnes.size === 0) return;
        const honest = run(build(specs));
        const failer = run(build(specs, correctOnes));
        expectDominated(honest, failer);
        // The first modified completion has identical history before it: its own value never rises.
        const first = Math.min(...correctOnes);
        expect(tierRank(failer[first]!.tier)).toBeLessThanOrEqual(tierRank(honest[first]!.tier));
      }),
      { numRuns: 300 },
    );
  });

  it('property: more help on a completion never raises its value', () => {
    fc.assert(
      fc.property(timelineArb, fc.nat(44), fc.constantFrom(...ASSISTANCE_LEVELS), (specs, pick, help) => {
        const target = pick % specs.length;
        const honest = run(build(specs));
        const helped = run(build(specs, new Set(), new Map([[target, help]])));
        expect(tierRank(helped[target]!.tier)).toBeLessThanOrEqual(tierRank(honest[target]!.tier));
      }),
      { numRuns: 300 },
    );
  });

  it('property: inserting deliberately failed attempts anywhere never adds value', () => {
    const insertion = fc.record({ after: fc.nat(60), sig: fc.nat(14), skill: fc.constantFrom('test.base', 'test.next'), inside: fc.boolean() });
    fc.assert(
      fc.property(timelineArb, fc.array(insertion, { maxLength: 10 }), (specs, inserts) => {
        const honestAttempts = build(specs);
        const failerAttempts = [...honestAttempts];
        inserts.forEach((ins, k) => {
          const anchor = honestAttempts[ins.after % honestAttempts.length]!;
          failerAttempts.push(
            attempt({
              id: `fail-${k}`,
              // "inside": a wrong answer within an existing completion, before its final attempt.
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
        expectDominated(run(honestAttempts), run(failerAttempts));
      }),
      { numRuns: 300 },
    );
  });

  it('property: replaying an already-solved item never has value', () => {
    fc.assert(
      fc.property(timelineArb, fc.nat(44), (specs, pick) => {
        const attempts = build(specs);
        const solved = attempts.filter((a) => a.outcome === 'correct' && a.assistance !== 'demonstrated' && !a.encounterId);
        if (solved.length === 0) return;
        const original = solved[pick % solved.length]!;
        const replay = attempt({
          ...original,
          id: 'replay',
          activityInstanceId: 'replay-inst',
          challenge: 'practice',
          cued: true,
          transfer: { kind: 'none' },
          occurredAt: (attempts.at(-1)?.occurredAt ?? T0) + HOUR,
        });
        const result = run([...attempts, replay]).at(-1)!;
        expect(result.exposure).toBe('exactReplay');
        expect(result.tier).toBe('none');
      }),
      { numRuns: 300 },
    );
  });
});
