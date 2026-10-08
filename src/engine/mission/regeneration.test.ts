// A regeneration after too many misses never brings back the item it replaces: with a small pool of
// authored items, the next generation alone could be the same item, which the learner could then
// answer by elimination (and be recorded as independent on a first try).
import { ContentPackSchema, type ContentPack } from '../content/pack';
import { MISSION_CTX, PACK, T0 } from '../testing/support';
import { applyCommand, currentItem, describeMission, startMission, type MissionContext, type MissionState } from './runtime';
import { MissionPackSchema } from './schema';

const item = (id: string, correct: string, wrong: string[]) => ({ id, correct, distractors: wrong.map((value) => ({ value })) });
const SMALL_POOL = [item('note-a', 'gear', ['plant', 'bench']), item('note-b', 'bench', ['gear', 'plant'])];

function contextWith(items: unknown[], regenerateAfterWrongTries = 2): MissionContext {
  const pack: ContentPack = ContentPackSchema.parse({
    ...PACK,
    scaffoldingPolicies: [...PACK.scaffoldingPolicies, { schemaVersion: 1, id: 'test.regenerate', description: 'Regenerate after misses, no rescue', steps: [], allowLeaveAndReturn: true, regenerateAfterWrongTries }],
    activities: [
      ...PACK.activities,
      {
        schemaVersion: 1,
        id: 'read.small',
        title: 'A small authored pool',
        generator: { id: 'literacy.authoredItem', version: 1 },
        params: { items },
        skills: [PACK.skills[0]!.id],
        challenge: 'practice',
        cued: false,
        representation: 'text',
        transfer: { kind: 'none' },
        scaffoldingPolicy: 'test.regenerate',
      },
    ],
  });
  const missions = MissionPackSchema.parse({ schemaVersion: 1, id: 'm', version: 't', missions: [{ schemaVersion: 1, id: 'reading', version: 1, title: 't', completionTier: 'low', steps: [{ kind: 'activity', id: 'read', activityId: 'read.small' }] }] }).missions;
  return { ...MISSION_CTX, pack, missions };
}

let n = 0;
const miss = (ctx: MissionContext, s: MissionState) => {
  const wrong = currentItem(ctx, s)!.response.options.find((o) => !o.correct)!;
  return applyCommand(ctx, s, { type: 'submit', commandId: `c${++n}`, optionId: wrong.id, at: T0 + n * 1000 });
};

describe('regeneration after too many misses', () => {
  it('never returns the same item from a pool of two (every seed base)', () => {
    const ctx = contextWith(SMALL_POOL);
    for (let k = 0; k < 200; k++) {
      let s = startMission(ctx, { instanceId: `i${k}`, missionId: 'reading', missionVersion: 1, learnerId: 'learner-a', at: T0 }).state;
      const before = s.item!.signature;
      s = miss(ctx, s).state;
      const r = miss(ctx, s);
      expect(r.intents.map((i) => i.type)).toContain('ITEM_REGENERATED');
      expect(r.state.item!.signature).not.toBe(before);
      expect(r.state.item!.wrongTries).toBe(0);
      // The resolved item is one incorrect attempt; the new one is unseen.
      expect(r.events.filter((e) => e.type === 'attempt')).toHaveLength(1);
      expect(describeMission(ctx, r.state).activity!.itemSignature).toBe(r.state.item!.signature);
    }
  });

  it('prefers a different answer too, and falls back to a different question with the same answer', () => {
    const sameAnswer = [item('note-a', 'gear', ['plant']), item('note-b', 'gear', ['bench'])];
    const ctx = contextWith(sameAnswer);
    for (let k = 0; k < 60; k++) {
      let s = startMission(ctx, { instanceId: `j${k}`, missionId: 'reading', missionVersion: 1, learnerId: 'learner-a', at: T0 }).state;
      const before = s.item!.signature;
      s = miss(ctx, miss(ctx, s).state).state;
      expect(s.item!.signature).not.toBe(before);
    }
  });

  it('is deterministic: the same misses on the same instance regenerate the same item', () => {
    const ctx = contextWith([...SMALL_POOL, item('note-c', 'plant', ['gear', 'bench'])]);
    const run = () => {
      let s = startMission(ctx, { instanceId: 'same', missionId: 'reading', missionVersion: 1, learnerId: 'learner-a', at: T0 }).state;
      s = miss(ctx, miss(ctx, s).state).state;
      return { seed: s.item!.seed, signature: s.item!.signature, generation: s.item!.generation };
    };
    expect(run()).toEqual(run());
  });

  it('a second regeneration continues after the generation the first one used', () => {
    const ctx = contextWith(SMALL_POOL);
    let s = startMission(ctx, { instanceId: 'twice', missionId: 'reading', missionVersion: 1, learnerId: 'learner-a', at: T0 }).state;
    s = miss(ctx, miss(ctx, s).state).state;
    const first = s.item!;
    s = miss(ctx, miss(ctx, s).state).state;
    expect(s.item!.generation).toBeGreaterThan(first.generation);
    expect(s.item!.signature).not.toBe(first.signature);
  });
});
