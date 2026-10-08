// Theme copy is content: schema-validated, checked against the mission and pack it decorates.
import coreMissions from '../../../content/missions/core.json';
import corePack from '../../../content/packs/core.json';
import readingPack from '../../../content/packs/reading.json';
import floor15 from '../../../content/themes/elevator-quest/floor15.json';
import { BUILT_IN_GENERATORS, ContentPackSchema, MissionPackSchema, composeContentPacks } from '../../engine';
import { CONTRACT } from '../elevator-quest/content/floor15';
import { emittableMisconceptions, fill, validateMissionCopy } from './missionCopy';

/** The packs the app ships, composed as the app composes them. */
const pack = composeContentPacks([ContentPackSchema.parse(corePack), ContentPackSchema.parse(readingPack)]);
const mission = MissionPackSchema.parse(coreMissions).missions.find((m) => m.id === floor15.missionId)!;
const ctx = { pack, mission, contract: CONTRACT };
const codes = (raw: unknown) => validateMissionCopy(raw, ctx).issues.map((i) => `${i.code}@${i.path}`);
const edit = (f: (c: typeof floor15) => void) => {
  const c = structuredClone(floor15);
  f(c);
  return c;
};

describe('Floor 15 copy', () => {
  it('is valid against the core pack, the mission, and the theme contract', () => {
    expect(validateMissionCopy(floor15, ctx).issues).toEqual([]);
  });

  it('has words for every math misconception the mission can produce (reading words live with the reading copy)', () => {
    const math = new Set(pack.misconceptions.filter((m) => m.domain === 'math').map((m) => m.id));
    const tags = emittableMisconceptions(pack, mission, (key) => BUILT_IN_GENERATORS.get(key)?.misconceptions ?? []).filter((t) => math.has(t));
    expect(tags.length).toBeGreaterThan(0);
    const missing = tags.filter((t) => !(t in floor15.misconceptions));
    expect(missing).toEqual([]);
  });

  it('rejects a missing required line, an unknown line, and a placeholder the line cannot fill', () => {
    expect(codes(edit((c) => delete (c.lines as Record<string, string>).intro))).toContain('copy.missingLine@lines.intro');
    expect(codes(edit((c) => ((c.lines as Record<string, string>).bonus = 'Extra')))).toContain('copy.unknownLine@lines.bonus');
    // {change} would reveal nothing here, but it is not a given of this line: a content mistake.
    expect(codes(edit((c) => (c.lines.reposition = 'Next call on {change}.')))).toContain('copy.unknownPlaceholder@lines.reposition');
    // Help lines may use {revealed} only through the contract (the demonstrated step).
    expect(codes(edit((c) => (c.help.highlightGiven.line = 'Try {answer}.')))).toContain('copy.unknownPlaceholder@help.highlightGiven.line');
  });

  it('success replay words: every strategy has words, and a suggestion never claims the learner used it', () => {
    expect(codes(edit((c) => delete (c.replay as Record<string, string>).bridgeToTen))).toContain('copy.missingLine@replay.bridgeToTen');
    expect(codes(edit((c) => (c.replay.bridgeToTen = 'You went {path}.')))).toContain('copy.claimsUnobserved@replay.bridgeToTen');
    expect(codes(edit((c) => (c.replay.countOn = 'One quick way: {answer}.')))).toContain('copy.unknownPlaceholder@replay.countOn');
    // Observed lines may say "you": the game saw it happen.
    expect(codes(edit((c) => (c.replay.numberLineObserved = 'You used the shaft map: {path}.')))).toEqual([]);
  });

  it('rejects unknown references: misconception tags, help kinds, mission steps', () => {
    expect(codes(edit((c) => ((c.misconceptions as Record<string, string>)['quantity.madeUp'] = 'x')))).toContain('ref.unknownMisconception@misconceptions.quantity.madeUp');
    expect(codes(edit((c) => ((c.rescue.focus as Record<string, string>)['quantity.madeUp'] = 'x')))).toContain('ref.unknownMisconception@rescue.focus.quantity.madeUp');
    expect(codes(edit((c) => ((c.help as Record<string, unknown>).sparkle = { label: 'X', line: 'y' })))).toContain('ref.unknownHelp@help.sparkle');
    expect(codes(edit((c) => delete (c.help as Record<string, unknown>).countStrategy))).toContain('copy.missingHelp@help.countStrategy');
    expect(codes(edit((c) => c.progress.push({ stepId: 'bonus-step', label: 'Bonus' })))).toContain('ref.unknownStep@progress');
    expect(codes(edit((c) => c.progress.splice(1, 1)))).toContain('copy.missingStep@progress');
  });

  it('rejects duplicate ids and out-of-order checklists', () => {
    expect(codes(edit((c) => c.progress.push({ ...c.progress[0]! })))).toContain('copy.duplicateId@progress');
    expect(codes(edit((c) => c.progress.reverse()))).toContain('copy.order@progress');
    expect(codes(edit((c) => c.unlocks.push({ ...c.unlocks[0]! })))).toContain('copy.duplicateId@unlocks');
  });

  it('requires Concept Rescue words whenever a policy the mission uses can rescue', () => {
    expect(codes(edit((c) => delete (c.rescue.lines as Record<string, string>).exampleRetry))).toContain('copy.missingLine@rescue.lines.exampleRetry');
  });

  it('rejects pacing outside safe bounds and malformed copy', () => {
    expect(codes(edit((c) => (c.pacing.autoRideTimeScale = 0.05)))[0]).toMatch(/^schema\./);
    expect(codes({ ...floor15, title: '' })[0]).toMatch(/^schema\./);
  });

  it('fills templates and leaves unknown placeholders visible', () => {
    expect(fill('Floor {start} and {change} {dir}', { start: 8, change: 7, dir: 'up' })).toBe('Floor 8 and 7 up');
    expect(fill('Floor {nope}', {})).toBe('Floor {nope}');
  });
});
