import type { Activity } from '../content/pack';
import type { AttemptEvidence } from '../evidence/attempt';
import { generateItem, generatorKey } from '../generation/generator';
import { BUILT_IN_GENERATORS } from '../generation/registry';
import { deriveLearnerState } from '../progression/timeline';
import { DAY, HOUR, PACK, PACK_GRAPH, POLICY, T0, attemptFactory } from '../testing/support';
import { checkActivityEligibility, checkEncounterEligibility, type EligibilityContext } from './eligibility';

const activity = (id: string): Activity => PACK.activities.find((a) => a.id === id)!;
const encounter = PACK.encounters[0]!;

function ctx(attempts: AttemptEvidence[] = [], now = T0 + DAY): EligibilityContext {
  return { state: deriveLearnerState({ graph: PACK_GRAPH, policy: POLICY, attempts, pack: PACK }), graph: PACK_GRAPH, policy: POLICY, pack: PACK, registry: BUILT_IN_GENERATORS, now };
}

/** Independent successes on distinct items for a skill, two days apart in two batches (reaches mastered). */
function master(skill: string, reps: string[], make = attemptFactory({ skillIds: [skill] }), start = T0) {
  return [
    ...[0, 1, 2].map((i) => make({ itemSignature: `${skill}-a${i}`, occurredAt: start + i * HOUR, representation: reps[0]! })),
    ...[0, 1].map((i) => make({ itemSignature: `${skill}-b${i}`, occurredAt: start + (4 + i) * HOUR, representation: reps[1] ?? reps[0]! })),
    make({ itemSignature: `${skill}-c`, occurredAt: start + DAY + 6 * HOUR, representation: reps[0]! }),
  ];
}

describe('eligibility', () => {
  it('explains a locked skill with its unmet prerequisites', () => {
    const r = checkActivityEligibility(activity('move-up.practice'), ctx());
    expect(r.eligible).toBe(false);
    expect(r.playableForFun).toBe(false);
    expect(r.reasons[0]).toMatchObject({ code: 'skillLocked', skillId: 'math.add.within20', unmetPrerequisites: ['math.add.within10', 'math.count.within20'] });
  });

  const unlockAddSub = [
    ...master('math.count.within10', ['objects']),
    ...master('math.count.within20', ['objects', 'numeral'], undefined, T0 + 3 * DAY),
    ...master('math.add.within10', ['objects', 'numeral'], undefined, T0 + 6 * DAY),
    ...master('math.sub.within10', ['objects', 'numeral'], undefined, T0 + 9 * DAY),
  ];

  it('is eligible once prerequisites have peaked at the required level', () => {
    const r = checkActivityEligibility(activity('move-up.practice'), ctx(unlockAddSub, T0 + 12 * DAY));
    expect(r).toEqual({ eligible: true, playableForFun: false, reasons: [] });
  });

  it('holds a Stretch activity until the skill is being practiced', () => {
    const r = checkActivityEligibility(activity('move-either.stretch'), ctx(unlockAddSub, T0 + 12 * DAY));
    expect(r.reasons.map((x) => x.code)).toEqual(['belowStretchLevel', 'belowStretchLevel']);
  });

  it('gates the Mastery Encounter on component skill levels', () => {
    const r = checkEncounterEligibility(encounter, ctx(unlockAddSub, T0 + 12 * DAY));
    expect(r.reasons.filter((x) => x.code === 'encounterRequirement').map((x) => (x as { skillId: string }).skillId)).toEqual(['math.add.within20', 'math.sub.within20']);
  });

  it('marks mastered practice as for-fun only until review is due', () => {
    const history = [...unlockAddSub, ...master('math.add.within20', ['numeral', 'verticalScale'], undefined, T0 + 12 * DAY)];
    const masteredAt = T0 + 13 * DAY + 6 * HOUR;
    const notDue = checkActivityEligibility(activity('move-up.practice'), ctx(history, masteredAt + HOUR));
    expect(notDue).toMatchObject({ eligible: false, playableForFun: true, reasons: [{ code: 'masteredNoReviewDue' }] });
    const due = checkActivityEligibility(activity('move-up.practice'), ctx(history, masteredAt + 3 * DAY));
    expect(due.eligible).toBe(true);
  });

  it('reports exhausted replay when every variant has been solved', () => {
    const literacy = activity('beginning-sound.practice');
    const generator = BUILT_IN_GENERATORS.get(generatorKey(literacy.generator.id, literacy.generator.version))!;
    const make = attemptFactory({ activityId: literacy.id, skillIds: ['literacy.sound.beginning'], representation: 'pictureWord' });
    const signatures = new Set<string>();
    for (let i = 0; signatures.size < generator.countVariants(literacy.params)!; i++) signatures.add(generateItem(generator, literacy.params, `e${i}`).signature);
    const solvedAll = [...signatures].map((sig, i) => make({ itemSignature: sig, occurredAt: T0 + i * HOUR }));
    const letters = master('literacy.letter.recognition', ['card'], undefined, T0 - 10 * DAY);
    const r = checkActivityEligibility(literacy, ctx([...letters, ...solvedAll], T0 + DAY));
    expect(r.reasons).toEqual([expect.objectContaining({ code: 'replayExhausted', solved: 8, variants: 8 })]);
    expect(r.playableForFun).toBe(true);
  });

  it('refuses to schedule an encounter stage on its own', () => {
    expect(checkActivityEligibility(activity('encounter.capacity.route'), ctx()).reasons[0]?.code).toBe('encounterStageOnly');
  });
});
