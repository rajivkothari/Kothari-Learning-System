// Reading jobs are content: the pack's authored items (what is scored) and the theme's words (what
// the learner reads and does) are checked against each other, against the landings, and against
// the copy rules.
import corePack from '../../../content/packs/core.json';
import readingPack from '../../../content/packs/reading.json';
import readingJson from '../../../content/themes/elevator-quest/reading.json';
import { BUILT_IN_GENERATORS, composeContentPacks, ContentPackSchema, generateItem, validateContentPack } from '../../engine';
import { LANDINGS, directoryRows, landingObject } from '../elevator-quest/content/landings';
import { HELP_PLACEHOLDERS, READING, READING_GENERATOR, authoredItems, midSentenceCapitals, passageWords, readingItem, validateReading, type ReadingContext } from '../elevator-quest/content/reading';
import { fill } from './missionCopy';

/**
 * The canonical landing objects agreed for M8 (ids shared by the art, the landing catalog and the
 * reading items). The landing catalog's own `objects` are what a touch can hit, so they are used
 * where a floor declares them, and they must include every canonical object.
 */
const CANONICAL_OBJECTS: Record<number, readonly string[]> = {
  1: ['gear', 'plant', 'bench'],
  2: ['toolbox', 'drill', 'workbench'],
  5: ['fan-west', 'fan-east', 'switch'],
  6: ['gear-big', 'gear-small', 'motor'],
  7: ['platform-orange', 'platform-teal', 'platform-yellow', 'spring'],
  9: ['windmill', 'banner', 'bridge'],
  11: ['radio', 'printer', 'dish'],
  13: ['crane', 'blocks', 'cart'],
  15: ['core', 'gauge-left', 'gauge-right'],
  17: ['book', 'drawers', 'map'],
  18: ['telescope', 'chart', 'crank'],
  20: ['ball', 'hole', 'windmill'],
};

/** The object ids the landing catalog declares for a floor, or null when it declares none. */
const catalogObjects = (floor: number): string[] | null => {
  const entry = LANDINGS.floors.find((f) => f.floor === floor) as { objects?: { id: string }[] } | undefined;
  return entry?.objects ? entry.objects.map((o) => o.id) : null;
};

const pack = ContentPackSchema.parse(readingPack);
const generator = BUILT_IN_GENERATORS.get(`${READING_GENERATOR}@1`)!;
const names = new Set<string>(['Lifty', 'Floor', 'Floors', 'I']);
for (const f of LANDINGS.floors) for (const w of f.name.split(/\s+/)) names.add(w.charAt(0) + w.slice(1).toLowerCase());
const ctx: ReadingContext = {
  pack,
  floors: { min: 1, max: 20 },
  objectsOn: (floor) => catalogObjects(floor) ?? CANONICAL_OBJECTS[floor] ?? null,
  tags: generator.misconceptions,
  names,
  directory: directoryRows(LANDINGS, 1, 20, { restored: () => false }),
  objectName: (floor, id) => landingObject(LANDINGS, floor, id)?.name ?? null,
};
const clone = () => JSON.parse(JSON.stringify(readingJson)) as typeof readingJson & { items: Record<string, Record<string, unknown>> };
const codes = (raw: unknown, c: ReadingContext = ctx) => validateReading(raw, c).issues.map((i) => `${i.code}@${i.path}`);
const refs = authoredItems(pack);
const CATEGORY = (activityId: string) => activityId.split('.')[1]!;

describe('reading pack', () => {
  it('validates on its own and composed after the core pack', () => {
    const options = { registry: BUILT_IN_GENERATORS, budget: { seedsPerActivity: 120 }, budgetName: 'dev' as const };
    expect(validateContentPack(readingPack, options).issues).toEqual([]);
    const composed = composeContentPacks([ContentPackSchema.parse(corePack), pack]);
    expect(validateContentPack(composed, options).issues).toEqual([]);
  });

  it('has 25 to 35 items in the planned mix of kinds, each kind in at least two activities or one with two items', () => {
    expect(refs.length).toBeGreaterThanOrEqual(25);
    expect(refs.length).toBeLessThanOrEqual(35);
    const share = (cat: string) => refs.filter((r) => CATEGORY(r.activity.id) === cat).length / refs.length;
    const plan: Record<string, number> = { details: 0.3, inference: 0.2, sequence: 0.15, vocabulary: 0.15, cause: 0.1, sentence: 0.1 };
    for (const [cat, target] of Object.entries(plan)) expect(Math.abs(share(cat) - target)).toBeLessThanOrEqual(0.05);
    expect(new Set(refs.map((r) => CATEGORY(r.activity.id)))).toEqual(new Set(Object.keys(plan)));
    for (const a of pack.activities) expect(refs.filter((r) => r.activity.id === a.id).length).toBeGreaterThanOrEqual(2);
  });

  it('reading changes what the learner does: most items are answered by touching an object or riding', () => {
    const acting = refs.filter((r) => READING.items[r.id]?.mode !== 'choose').length;
    expect(acting / refs.length).toBeGreaterThanOrEqual(0.75);
  });

  it('uses only help kinds the theme already has words for, and no Concept Rescue', () => {
    for (const p of pack.scaffoldingPolicies) {
      expect(p.conceptRescue).toBeUndefined();
      for (const s of p.steps) expect(['highlightGiven', 'showAnswer']).toContain(s.kind);
      // A second miss brings a fresh item: three objects can never be cleared by elimination.
      expect(p.regenerateAfterWrongTries).toBe(2);
    }
  });

  it('every skill is literacy, Grade 1 to 3, with no prerequisites (nothing locks reading)', () => {
    for (const s of pack.skills) {
      expect(s.id).toMatch(/^ela\./);
      expect(s.domain).toBe('literacy');
      expect(s.gradeBand![0]).toBeGreaterThanOrEqual(1);
      expect(s.gradeBand![1]).toBeLessThanOrEqual(3);
      expect(s.prerequisites).toEqual([]);
    }
  });
});

describe('reading words (content/themes/elevator-quest/reading.json)', () => {
  it('the landing catalog has every canonical object on the floors it describes', () => {
    for (const [floor, ids] of Object.entries(CANONICAL_OBJECTS)) {
      const declared = catalogObjects(Number(floor));
      if (declared) expect({ floor, missing: ids.filter((id) => !declared.includes(id)) }).toEqual({ floor, missing: [] });
    }
  });

  it('agree with the pack, the landings and the copy rules', () => {
    expect(validateReading(readingJson, ctx).issues).toEqual([]);
  });

  it('every generated item finds its words, and every option it lists has a name', () => {
    for (const a of pack.activities) {
      for (let i = 0; i < 60; i++) {
        const item = generateItem(generator, a.params, `words:${i}`);
        const words = readingItem(READING, item.prompt.item);
        expect(words).not.toBeNull();
        if (words!.mode !== 'ride') for (const o of item.response.options) expect(words!.options).toHaveProperty(String(o.value));
      }
    }
    expect(readingItem(READING, 'no-such-item')).toBeNull();
    expect(readingItem(READING, 7)).toBeNull();
  });

  it('never sends a reading job to Floor 15: its landing is dormant until the mission restores it', () => {
    for (const r of refs) {
      const w = READING.items[r.id]!;
      if (w.mode === 'touch') expect(w.floor).not.toBe(15);
      if (w.mode === 'ride') expect(r.correct).not.toBe(15);
    }
  });

  it('passages are short: 1 to 4 sentences of 15 to 60 words', () => {
    for (const w of Object.values(READING.items)) {
      expect(w.passage.length).toBeLessThanOrEqual(4);
      expect(passageWords(w)).toBeGreaterThanOrEqual(15);
      expect(passageWords(w)).toBeLessThanOrEqual(60);
    }
  });

  it('help lines fill completely with the values the game has', () => {
    for (const [kind, lines] of Object.entries(READING.help)) {
      for (const mode of ['touch', 'ride', 'choose'] as const) {
        const vars = Object.fromEntries((HELP_PLACEHOLDERS[kind]?.[mode] ?? []).map((p) => [p, p === 'revealed' ? 12 : 'toolbox']));
        expect(fill(lines[mode], vars)).not.toMatch(/\{/);
      }
    }
  });

  it('finds capitalised words inside sentences (the privacy guard on names)', () => {
    expect(midSentenceCapitals('The crew left it in the Workshop. "Our ball fell."')).toEqual(['Workshop']);
    expect(midSentenceCapitals('Found it! The kit: Where is it?')).toEqual([]);
  });

  describe('rejects', () => {
    it('an item with no words, and words for an unknown item', () => {
      expect(codes(Object.assign(clone(), { items: Object.fromEntries(Object.entries(clone().items).filter(([k]) => k !== 'stuck-toolbox')) }))).toContain('missing.item@items.stuck-toolbox');
      const extra = clone();
      extra.items['made-up'] = { ...extra.items['stuck-toolbox']! };
      expect(codes(extra)).toContain('ref.unknownItem@items.made-up');
    });

    it('a touch option that is not an object on that landing, or a landing without objects', () => {
      const c = clone();
      c.items['stuck-toolbox']!.floor = 5;
      expect(codes(c)).toContain('ref.object@items.stuck-toolbox');
      c.items['stuck-toolbox']!.floor = 3;
      expect(codes(c)).toContain('ref.floor@items.stuck-toolbox.floor');
    });

    it('a ride answer that is not a floor', () => {
      const bad = structuredClone(readingPack);
      const ride = bad.activities.find((a) => a.id === 'reading.details.ride')!;
      (ride.params.items[0] as { correct: number }).correct = 21;
      expect(codes(readingJson, { ...ctx, pack: ContentPackSchema.parse(bad) })).toContain('ref.floor@items.grow-lights');
    });

    it('a mode that does not match how the activity is answered', () => {
      const c = clone();
      c.items['grow-lights']!.mode = 'choose';
      expect(codes(c)).toContain('ref.mode@items.grow-lights');
    });

    it('missing or extra option names', () => {
      const c = clone();
      delete (c.items['quiet-radio']!.options as Record<string, string>).printer;
      (c.items['quiet-radio']!.options as Record<string, string>).kettle = 'kettle';
      expect(codes(c)).toEqual(expect.arrayContaining(['missing.option@items.quiet-radio.options', 'ref.option@items.quiet-radio.options.kettle']));
    });

    it('a passage too short or too long, a CLUE sentence that does not exist, a broken sentence', () => {
      const c = clone();
      c.items['stuck-toolbox']!.passage = ['The toolbox is stuck.'];
      c.items['stuck-toolbox']!.key = 2;
      expect(codes(c)).toEqual(expect.arrayContaining(['copy.length@items.stuck-toolbox.passage', 'ref.key@items.stuck-toolbox.key']));
      c.items['stuck-toolbox']!.passage = ['the toolbox is stuck and the crew needs the wrenches that are inside it today'];
      expect(codes(c)).toContain('copy.sentence@items.stuck-toolbox.passage.0');
      c.items['stuck-toolbox']!.passage = ['The toolbox is stuck. The crew needs the wrenches inside it today, so please open it.'];
      expect(codes(c)).toContain('copy.sentence@items.stuck-toolbox.passage.0');
      c.items['stuck-toolbox']!.passage = Array.from({ length: 4 }, () => 'The crew needs every one of the wrenches inside the toolbox right now, so please hurry up.');
      c.items['stuck-toolbox']!.key = 0;
      expect(codes(c)).toContain('copy.length@items.stuck-toolbox.passage');
    });

    it('an instruction that does not say what to do', () => {
      const c = clone();
      c.items['stuck-toolbox']!.ask = 'Which thing needs fixing?';
      c.items['grow-lights']!.ask = 'Where do the lights go?';
      c.items['fragile-map']!.ask = 'Pick what fragile means.';
      expect(codes(c)).toEqual(expect.arrayContaining(['copy.ask@items.stuck-toolbox.ask', 'copy.ask@items.grow-lights.ask', 'copy.ask@items.fragile-map.ask']));
    });

    it('internal vocabulary, protected names, dashes, unknown placeholders and unknown names', () => {
      const c = clone();
      c.items['stuck-toolbox']!.done = 'Correct! Score one.';
      c.items['grow-lights']!.done = 'The Minecraft lights are in.';
      c.items['spare-springs']!.done = 'Springs found \u2014 hooray.';
      c.items['ladder-not-in-storage']!.done = 'The ladder is on Floor {answer}.';
      c.items['kit-above-archive']!.passage = ['The crew used the repair kit to fix the Archive door.', 'Then Morgan left the kit two floors above the Archive.'];
      const got = codes(c);
      expect(got).toEqual(
        expect.arrayContaining([
          'copy.internal@items.stuck-toolbox.done',
          'copy.protectedName@items.grow-lights.done',
          'copy.dash@items.spare-springs.done',
          'copy.unknownPlaceholder@items.ladder-not-in-storage.done',
          'copy.properNoun@items.kit-above-archive.passage.1',
        ]),
      );
    });

    it('help without words for a kind the policy offers, help for a kind it does not, and a placeholder a help line cannot fill', () => {
      const c = clone();
      delete (c.help as Record<string, unknown>).showAnswer;
      (c.help as Record<string, unknown>).countStrategy = { touch: 'Count.', ride: 'Count.', choose: 'Count.' };
      c.help.highlightGiven.ride = 'Go to Floor {revealed}.';
      expect(codes(c)).toEqual(expect.arrayContaining(['missing.help@help.showAnswer', 'ref.unknownHelp@help.countStrategy', 'copy.unknownPlaceholder@help.highlightGiven.ride']));
    });

    it('a reading line missing, a line that is not one, and a placeholder a line cannot fill', () => {
      const c = clone();
      delete (c.lines as Record<string, string>).again;
      (c.lines as Record<string, string>).bonus = 'Extra words.';
      c.lines.touched = 'That is Floor {floor}.';
      expect(codes(c)).toEqual(expect.arrayContaining(['missing.line@lines.again', 'ref.unknownLine@lines.bonus', 'copy.unknownPlaceholder@lines.touched']));
    });

    it('a misreading without words, and words for a tag the pack does not have', () => {
      const c = clone();
      delete (c.misconceptions as Record<string, string>)['reading.ignoredNegation'];
      (c.misconceptions as Record<string, string>)['reading.madeUp'] = 'Read it again.';
      expect(codes(c)).toEqual(expect.arrayContaining(['missing.misconception@misconceptions.reading.ignoredNegation', 'ref.unknownMisconception@misconceptions.reading.madeUp']));
    });

    it('malformed words', () => {
      expect(codes({ ...readingJson, schemaVersion: 2 })[0]).toMatch(/^schema\./);
    });
  });
});
