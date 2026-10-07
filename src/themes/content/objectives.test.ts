// Mission objectives are content: every concrete thing a Floor 15 job names has a world object,
// at a valid place, with an accessible label, and the job's own words agree with it.
import coreMissions from '../../../content/missions/core.json';
import floor15 from '../../../content/themes/elevator-quest/floor15.json';
import objectivesJson from '../../../content/themes/elevator-quest/objectives.json';
import { MissionPackSchema } from '../../engine';
import { OBJECT_VISUALS, validateObjectives, type ObjectiveContext } from '../elevator-quest/content/objectives';

const mission = MissionPackSchema.parse(coreMissions).missions.find((m) => m.id === floor15.missionId)!;
const ctx: ObjectiveContext = {
  missionId: mission.id,
  steps: mission.steps.map((s) => ({ id: s.id, kind: s.kind, ...('items' in s && typeof s.items === 'number' ? { items: s.items } : {}) })),
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
    raw.objectives = raw.objectives.filter((o) => o.id !== 'toolbox');
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

  it('refuses an unsupported visual (schema)', () => {
    const raw = clone() as unknown as { objectives: { visual: string }[] };
    raw.objectives[0]!.visual = 'sticker';
    expect(codes(raw).some((c) => c.startsWith('schema.'))).toBe(true);
  });

  it('child-facing words carry no internal vocabulary', () => {
    for (const o of objectivesJson.objectives) for (const w of [o.found, (o as { absent?: string }).absent, o.label]) if (w) expect(w).not.toMatch(/stretch|mastery|encounter|misconception|practice|correct|wrong/i);
  });
});
