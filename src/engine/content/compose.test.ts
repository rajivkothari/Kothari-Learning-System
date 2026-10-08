import corePack from '../../../content/packs/core.json';
import readingPack from '../../../content/packs/reading.json';
import { ContentCompositionError, composeContentPacks } from './compose';
import { ContentPackSchema, type ContentPack } from './pack';

const CORE = ContentPackSchema.parse(corePack);
const READING = ContentPackSchema.parse(readingPack);

/** A small valid pack with one of everything, ids prefixed so two of them never collide. */
function mini(id: string, prefix: string): ContentPack {
  return ContentPackSchema.parse({
    schemaVersion: 1,
    id,
    version: `v-${id}`,
    skills: [{ id: `${prefix}.skill`, domain: 'math', strand: 's', label: 'L', representations: ['numeral'] }],
    misconceptions: [{ id: `${prefix}.tag`, domain: 'math', description: 'd' }],
    scaffoldingPolicies: [{ schemaVersion: 1, id: `${prefix}.policy`, description: 'd', steps: [], allowLeaveAndReturn: true }],
    activities: [
      {
        schemaVersion: 1,
        id: `${prefix}.activity`,
        title: 't',
        generator: { id: 'quantity.positionAfterMove', version: 1 },
        params: {},
        skills: [`${prefix}.skill`],
        challenge: 'practice',
        cued: true,
        representation: 'numeral',
        transfer: { kind: 'none' },
        scaffoldingPolicy: `${prefix}.policy`,
      },
    ],
    encounters: [],
  });
}

describe('composeContentPacks', () => {
  it('concatenates every collection in pack order; id and version come from the first pack', () => {
    const a = mini('a', 'pa');
    const b = mini('b', 'pb');
    const ab = composeContentPacks([a, b]);
    expect(ab).toMatchObject({ schemaVersion: 1, id: 'a', version: 'v-a' });
    expect(ab.skills.map((s) => s.id)).toEqual(['pa.skill', 'pb.skill']);
    expect(ab.misconceptions.map((s) => s.id)).toEqual(['pa.tag', 'pb.tag']);
    expect(ab.scaffoldingPolicies.map((s) => s.id)).toEqual(['pa.policy', 'pb.policy']);
    expect(ab.activities.map((s) => s.id)).toEqual(['pa.activity', 'pb.activity']);
    expect(ContentPackSchema.parse(ab)).toEqual(ab);
  });

  it('is order-stable: the same list gives the same pack, and the order of the list is the order of the result', () => {
    const [a, b] = [mini('a', 'pa'), mini('b', 'pb')];
    expect(composeContentPacks([a, b])).toEqual(composeContentPacks([a, b]));
    const ba = composeContentPacks([b, a]);
    expect(ba.id).toBe('b');
    expect(ba.activities.map((x) => x.id)).toEqual(['pb.activity', 'pa.activity']);
  });

  it('refuses a duplicate id across packs, in any collection, naming both packs', () => {
    for (const key of ['skills', 'misconceptions', 'scaffoldingPolicies', 'activities'] as const) {
      const a = mini('a', 'pa');
      const b = mini('b', 'pb');
      (b[key] as { id: string }[])[0]!.id = (a[key] as { id: string }[])[0]!.id;
      expect(() => composeContentPacks([a, b])).toThrow(ContentCompositionError);
      expect(() => composeContentPacks([a, b])).toThrow(new RegExp(`Duplicate id ".*" in ${key}: in pack "a" and pack "b"`));
    }
  });

  it('refuses a duplicate id inside one pack too, and an empty list', () => {
    const a = mini('a', 'pa');
    const twice = { ...a, skills: [...a.skills, ...a.skills] };
    expect(() => composeContentPacks([twice])).toThrow(/Duplicate id "pa.skill" in skills/);
    expect(() => composeContentPacks([])).toThrow(ContentCompositionError);
  });

  it('does not change the packs it was given', () => {
    const a = mini('a', 'pa');
    const before = structuredClone(a);
    composeContentPacks([a, mini('b', 'pb')]);
    expect(a).toEqual(before);
  });

  it('composes the shipped packs (core, then reading) without a clash', () => {
    const shipped = composeContentPacks([CORE, READING]);
    expect(shipped.id).toBe(CORE.id);
    expect(shipped.activities.length).toBe(CORE.activities.length + READING.activities.length);
    expect(shipped.activities.slice(0, CORE.activities.length)).toEqual(CORE.activities);
  });
});
