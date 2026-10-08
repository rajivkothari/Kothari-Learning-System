// The shipped mission (positions-and-capacity, version 3) as a run: pools choose one activity per
// step, so the expected share of each level of math per run follows from the pools. Target (M8
// plan): about 35% review (upper first grade), 50% solid second grade, 15% stretch within second
// grade. The levels are a content judgement recorded here; the arithmetic of the mix is checked.
import { stepActivityIds } from '../mission/pool';
import { SHIPPED_MISSIONS, SHIPPED_PACK } from '../testing/support';

type Level = 'review' | 'second' | 'stretch';
const LEVEL: Record<string, Level> = {
  // Review: counting on and back inside 20, small groups, doubles, ten more or less, teens as a ten and ones, comparing two.
  'move-up.line.cued': 'review',
  'move-down.scale.cued': 'review',
  'move-up.scale.teens': 'review',
  'move-down.scale.teens': 'review',
  'combine-groups.objects': 'review',
  'combine-groups.doubles': 'review',
  'tens.ten-more-less': 'review',
  'tens.teen-from-zero': 'review',
  'order.compare-two': 'review',
  'distance.meter': 'review',
  'encounter.capacity.route': 'review',
  // Solid second grade: through ten, make ten, near doubles, two steps, skip counting from any start, a ten then ones, unknown start, ordering three, missing addend.
  'move-up.scale.bridge-ten': 'second',
  'move-down.scale.bridge-ten': 'second',
  'combine-groups.make-ten': 'second',
  'combine-groups.near-doubles': 'second',
  'two-moves.line.cued': 'second',
  'two-moves.same-way': 'second',
  'sequence.twos.gap': 'second',
  'sequence.twos.next': 'second',
  'tens.and-ones.up': 'second',
  'equal-jumps.line.cued': 'second',
  'start-unknown.line': 'second',
  'order.three': 'second',
  'encounter.capacity.fill': 'second',
  // Stretch, still second grade: bigger moves and distances, by 5s from any start, adding a teen, a ten and ones down, the beacon.
  'sequence.fives': 'stretch',
  'distance.meter.far': 'stretch',
  'move-either.reference.stretch': 'stretch',
  'start-unknown.bridge': 'stretch',
  'two-moves.line.wide': 'stretch',
  'tens.and-ones.down': 'stretch',
  'move-up.line.add-teen': 'stretch',
};

const mission = SHIPPED_MISSIONS.find((m) => m.id === 'positions-and-capacity')!;

/** Expected math items per run at each level: each pool member is equally likely. */
function expectedMix(): Record<Level, number> {
  const mix: Record<Level, number> = { review: 0, second: 0, stretch: 0 };
  for (const step of mission.steps) {
    if (step.kind === 'narrative') continue;
    const ids = step.kind === 'activity' ? stepActivityIds(step) : SHIPPED_PACK.encounters.find((e) => e.id === step.encounterId)!.stages;
    const items = step.kind === 'activity' ? step.items : 1;
    const math = ids.filter((id) => SHIPPED_PACK.activities.find((a) => a.id === id)!.skills.every((s) => s.startsWith('math.')));
    if (math.length === 0) continue; // reading steps are not part of the math mix
    for (const id of math) {
      const level = LEVEL[id];
      if (!level) throw new Error(`No level recorded for "${id}"`);
      // A pool contributes one item per run, split across its members; an encounter runs every stage.
      mix[level] += step.kind === 'activity' ? items / math.length : 1;
    }
  }
  return mix;
}

describe('the shipped mission: math per run (version 3)', () => {
  it('is version 3, with pool steps for variety and one item on the first service call', () => {
    expect(mission.version).toBe(3);
    expect(mission.steps.find((s) => s.id === 'cued-moves')).toMatchObject({ activityId: 'move-up.line.cued', items: 1 });
    expect(mission.steps.filter((s) => s.kind === 'activity' && s.activityIds).length).toBeGreaterThanOrEqual(5);
  });

  it('every math activity a run can present has a recorded level, and every recorded one is shipped', () => {
    const shipped = new Set(SHIPPED_PACK.activities.map((a) => a.id));
    for (const id of Object.keys(LEVEL)) expect({ id, shipped: shipped.has(id) }).toEqual({ id, shipped: true });
    expect(() => expectedMix()).not.toThrow();
  });

  it('mixes about 35% review, 50% second grade and 15% stretch', () => {
    const mix = expectedMix();
    const total = mix.review + mix.second + mix.stretch;
    expect(total).toBeCloseTo(10, 5); // nine math steps, the encounter has two stages
    const share = (l: Level) => mix[l] / total;
    expect(share('review')).toBeGreaterThanOrEqual(0.3);
    expect(share('review')).toBeLessThanOrEqual(0.42);
    expect(share('second')).toBeGreaterThanOrEqual(0.43);
    expect(share('second')).toBeLessThanOrEqual(0.58);
    expect(share('stretch')).toBeGreaterThanOrEqual(0.1);
    expect(share('stretch')).toBeLessThanOrEqual(0.2);
  });

  it('never jumps to third grade: every math skill used starts by grade 2 (none is third grade only)', () => {
    const used = new Set(Object.keys(LEVEL).flatMap((id) => SHIPPED_PACK.activities.find((a) => a.id === id)!.skills));
    for (const id of used) {
      const band = SHIPPED_PACK.skills.find((s) => s.id === id)!.gradeBand!;
      expect({ id, starts: band[0] <= 2 }).toEqual({ id, starts: true });
    }
  });
});
