// Mission objectives are content: every concrete thing a Floor 15 job names has a world object,
// at a valid place, with an accessible label, and the job's own words agree with it.
import coreMissions from '../../../content/missions/core.json';
import corePack from '../../../content/packs/core.json';
import readingPack from '../../../content/packs/reading.json';
import floor15 from '../../../content/themes/elevator-quest/floor15.json';
import objectivesJson from '../../../content/themes/elevator-quest/objectives.json';
import { BUILT_IN_GENERATORS, ContentPackSchema, MissionPackSchema, composeContentPacks, stepActivityIds } from '../../engine';
import { OBJECT_VISUALS, validateObjectives, type ObjectiveContext } from '../elevator-quest/content/objectives';
import { READING_GENERATOR } from '../elevator-quest/content/reading';
import { CARGO_CONCEPTS } from '../elevator-quest/director/jobs';

const mission = MissionPackSchema.parse(coreMissions).missions.find((m) => m.id === floor15.missionId)!;
const pack = composeContentPacks([ContentPackSchema.parse(corePack), ContentPackSchema.parse(readingPack)]);
/** A job answered in the cargo bay sends the lift nowhere. */
const rides = (activityId: string) => {
  const g = pack.activities.find((a) => a.id === activityId)!.generator;
  return !CARGO_CONCEPTS.includes(BUILT_IN_GENERATORS.get(`${g.id}@${g.version}`)!.concept);
};
/** An authored reading activity: its note is the job, with nothing to find. */
const reading = (activityId: string) => pack.activities.find((a) => a.id === activityId)!.generator.id === READING_GENERATOR;
const ctx: ObjectiveContext = {
  missionId: mission.id,
  // A pool step lists every activity it can present: each needs its own object (or one for the whole step).
  steps: mission.steps.map((s) => ({ id: s.id, kind: s.kind, ...('items' in s && typeof s.items === 'number' ? { items: s.items } : {}), ...(s.kind === 'activity' ? { activities: stepActivityIds(s).map((id) => ({ id, rides: rides(id), reading: reading(id) })) } : {}) })),
  lines: floor15.lines,
};
const clone = () => JSON.parse(JSON.stringify(objectivesJson)) as typeof objectivesJson;
const codes = (raw: unknown) => validateObjectives(raw, ctx).issues.map((i) => i.code);

describe('Floor 15 mission objectives', () => {
  it('are valid, cover every job, and use supported visuals', () => {
    const r = validateObjectives(objectivesJson, ctx);
    expect(r.issues).toEqual([]);
    for (const o of r.catalog!.objectives) {
      expect(OBJECT_VISUALS).toContain(o.visual);
      expect(o.label.length).toBeGreaterThan(2);
    }
  });

  it('refuses a job line that does not name the object', () => {
    const raw = clone();
    raw.objectives[0]!.noun = 'spanner';
    expect(codes(raw)).toContain('copy.noun');
  });

  it('refuses an unknown step, an unknown line, and a duplicate id', () => {
    const raw = clone();
    raw.objectives[0]!.step = 'nowhere';
    raw.objectives[1]!.copy = 'nothing';
    raw.objectives[2]!.id = raw.objectives[3]!.id;
    expect(codes(raw)).toEqual(expect.arrayContaining(['ref.step', 'ref.copy', 'dup.id']));
  });

  it('refuses a job with nothing to find, and a destination object with no words for its absence', () => {
    const raw = clone();
    raw.objectives = raw.objectives.filter((o) => o.id !== 'repair-kit');
    delete (raw.objectives.find((o) => o.id === 'crew') as { absent?: string }).absent;
    expect(codes(raw)).toEqual(expect.arrayContaining(['missing.objective', 'missing.absent']));
  });

  it('refuses a reference object whose line does not give its floor, and a collectable without an action label', () => {
    const raw = clone();
    const beacon = raw.objectives.find((o) => o.id === 'beacon')!;
    beacon.copy = 'finale'; // "Full load. Take us to Floor {repairFloor}.": no reference floor in it
    beacon.noun = 'load';
    delete (raw.objectives.find((o) => o.id === 'toolbox') as { action?: string }).action;
    expect(codes(raw)).toEqual(expect.arrayContaining(['copy.reference', 'missing.action']));
  });

  it('a pool step needs an object for every activity it can present, and an object names only activities of its step', () => {
    const raw = clone();
    raw.objectives = raw.objectives.filter((o) => o.id !== 'crew-compare');
    (raw.objectives.find((o) => o.id === 'crew-order') as { activities: string[] }).activities.push('distance.meter');
    (raw.objectives.find((o) => o.id === 'crew-lamp') as { activities: string[] }).activities.push('not-in-this-step');
    const issues = validateObjectives(raw, ctx).issues;
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing.objective', message: expect.stringContaining('order.compare-two') }),
      expect.objectContaining({ code: 'dup.objective', message: expect.stringContaining('distance.meter') }),
      expect.objectContaining({ code: 'ref.activity' }),
    ]));
  });

  it('a reading job needs no object (its note is the job), a math job still does, and no object may name a reading job', () => {
    const readSteps = ctx.steps.filter((s) => s.activities?.some((a) => a.reading)).map((s) => s.id);
    expect(readSteps).toEqual(['read-1', 'read-2', 'read-3', 'read-4']);
    // The shipped catalog places nothing for them, and that is valid.
    expect(objectivesJson.objectives.filter((o) => readSteps.includes(o.step))).toEqual([]);
    expect(validateObjectives(objectivesJson, ctx).issues).toEqual([]);
    // The exemption is the reading flag alone: the same members counted as math jobs have nothing to find.
    const asMath: ObjectiveContext = { ...ctx, steps: ctx.steps.map((s) => (s.id === 'read-1' ? { ...s, activities: s.activities!.map((a) => ({ ...a, reading: false })) } : s)) };
    expect(validateObjectives(objectivesJson, asMath).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing.objective', message: expect.stringContaining('reading.details.touch') }),
      expect.objectContaining({ code: 'missing.objective', message: expect.stringContaining('reading.details.ride') }),
    ]));
    // A math member without its object still fails, in a pool that also holds others with theirs.
    const raw = clone();
    raw.objectives = raw.objectives.filter((o) => o.id !== 'toolbox-teen');
    expect(validateObjectives(raw, ctx).issues).toEqual([expect.objectContaining({ code: 'missing.objective', message: expect.stringContaining('tens.teen-from-zero') })]);
    // An object for a reading job is refused.
    const named = clone() as unknown as { objectives: Record<string, unknown>[] };
    named.objectives.push({ ...named.objectives.find((o) => o.id === 'repair-kit'), id: 'note-kit', step: 'read-1', items: 'all', activities: ['reading.details.touch'] });
    expect(validateObjectives(named, ctx).issues).toEqual([expect.objectContaining({ code: 'ref.activity', message: expect.stringContaining('reading job') })]);
  });

  it('refuses an unsupported visual (schema)', () => {
    const raw = clone() as unknown as { objectives: { visual: string }[] };
    raw.objectives[0]!.visual = 'sticker';
    expect(codes(raw).some((c) => c.startsWith('schema.'))).toBe(true);
  });

  it('child-facing words carry no internal vocabulary', () => {
    for (const o of objectivesJson.objectives) for (const w of [o.found, (o as { absent?: string }).absent, o.label]) if (w) expect(w).not.toMatch(/stretch|mastery|encounter|misconception|practice|correct|wrong/i);
  });
});
