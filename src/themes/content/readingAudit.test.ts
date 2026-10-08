// M8.1 read-and-ride audit. A playtest ride said "two floors above the Archive" and expected 19,
// without the game ever saying where the Archive is. A learner must never need hidden knowledge:
// every ride is answerable from its note and the building directory, every place it names is in the
// directory under the directory's own name, and the words around a job (bold words, Lifty's clue)
// never give the answer away.
import readingPack from '../../../content/packs/reading.json';
import readingJson from '../../../content/themes/elevator-quest/reading.json';
import { BUILT_IN_GENERATORS, ContentPackSchema } from '../../engine';
import { LANDINGS, directoryRows, landingObject } from '../elevator-quest/content/landings';
import {
  EMPHASIS_MAX,
  READING,
  READING_GENERATOR,
  answerGiveaways,
  authoredItems,
  emphasisMarks,
  giveawaysIn,
  needsDirectory,
  placesIn,
  readingMarks,
  solveFloor,
  solvePlaces,
  titleCase,
  validateReading,
  type ReadingContext,
} from '../elevator-quest/content/reading';

const pack = ContentPackSchema.parse(readingPack);
const refs = authoredItems(pack);
const dormant = directoryRows(LANDINGS, 1, 20, { restored: () => false });
const restored = directoryRows(LANDINGS, 1, 20, { restored: () => true });
const floorIn = (rows: typeof dormant) => (place: string) => rows.find((r) => r.name.toLowerCase() === place.toLowerCase())?.floor ?? null;
const names = new Set<string>(['Lifty', 'Floor', 'Floors', 'I']);
for (const f of LANDINGS.floors) for (const w of f.name.split(/\s+/)) names.add(w.charAt(0) + w.slice(1).toLowerCase());
const ctx: ReadingContext = {
  pack,
  floors: { min: 1, max: 20 },
  objectsOn: (floor) => LANDINGS.floors.find((f) => f.floor === floor)?.objects?.map((o) => o.id) ?? null,
  tags: BUILT_IN_GENERATORS.get(`${READING_GENERATOR}@1`)!.misconceptions,
  names,
  directory: dormant,
  objectName: (floor, id) => landingObject(LANDINGS, floor, id)?.name ?? null,
};
const rides = refs.filter((r) => READING.items[r.id]?.mode === 'ride');
const clone = () => JSON.parse(JSON.stringify(readingJson)) as { items: Record<string, Record<string, unknown>> };
const codes = (raw: unknown) => validateReading(raw, ctx).issues.map((i) => `${i.code}@${i.path}`);
const giveaways = (id: string) => {
  const ref = refs.find((r) => r.id === id)!;
  const w = READING.items[id]!;
  const place = w.mode === 'ride' ? (dormant.find((d) => d.floor === ref.correct)?.name ?? null) : null;
  const objectName = w.mode === 'touch' ? (v: string) => landingObject(LANDINGS, w.floor!, v)?.name ?? null : undefined;
  return { all: [...answerGiveaways(w, ref.correct, ref.distractors.map((d) => d.value), { objectName }), ...(place ? [place] : [])], place };
};

describe('read and ride: every ride is answerable from the note and the directory', () => {
  it('there are nine rides, and each one says how its floor follows (the audit covers them all)', () => {
    expect(rides.map((r) => r.id).sort()).toEqual(['ball-down-two', 'grow-lights', 'hose-first', 'jobs-before-lunch', 'kit-above-archive', 'ladder-not-in-storage', 'lost-toy-between', 'painter-and-plumber', 'spare-springs']);
    for (const r of rides) expect({ id: r.id, solve: READING.items[r.id]!.solve !== undefined }).toEqual({ id: r.id, solve: true });
  });

  it.each(rides.map((r) => [r.id, r] as const))('%s: the note and the directory lead to the pack\'s answer, on a real floor', (_id, ref) => {
    const w = READING.items[ref.id]!;
    for (const rows of [dormant, restored]) expect(solveFloor(w.solve!, floorIn(rows))).toBe(ref.correct);
    expect(ref.correct).toBeGreaterThanOrEqual(1);
    expect(ref.correct).toBeLessThanOrEqual(20);
    // No wrong floor the content expects is the answer too (one answer, unambiguous).
    expect(ref.distractors.map((d) => d.value)).not.toContain(ref.correct);
  });

  it.each(rides.map((r) => [r.id] as const))('%s: every place it names is in the directory, under the directory\'s name, and listed', (id) => {
    const w = READING.items[id]!;
    const text = w.passage.join(' ');
    const directoryNames = dormant.map((d) => d.name);
    // Everything the note names that the directory lists is in `places`, and nothing else is.
    expect([...(w.places ?? [])].sort()).toEqual(placesIn(text, directoryNames).sort());
    for (const p of w.places ?? []) expect(directoryNames).toContain(p.toUpperCase());
    for (const p of solvePlaces(w.solve!)) expect(w.places).toContain(p);
  });

  it('the playtest item: the Archive is found in the directory, then two floors up', () => {
    const w = READING.items['kit-above-archive']!;
    expect(w.places).toEqual(['Archive']);
    expect(w.solve).toEqual({ place: 'Archive', offset: 2 });
    expect(floorIn(dormant)('Archive')).toBe(17);
    expect(needsDirectory(w)).toBe(true);
    expect(w.clue).toMatch(/directory/);
  });

  it('a ride that names only floors needs no directory; every other ride does', () => {
    for (const r of rides) {
      const w = READING.items[r.id]!;
      expect({ id: r.id, needs: needsDirectory(w) }).toEqual({ id: r.id, needs: !('floor' in w.solve!) });
    }
  });

  it('the words use each place by its directory name (Floor 11 is Communications, not Comms)', () => {
    for (const [id, w] of Object.entries(READING.items)) {
      const words = [w.source, ...w.passage, w.ask, w.done, w.clue ?? ''].join(' ');
      expect({ id, comms: /\bComms\b/.test(words) }).toEqual({ id, comms: false });
    }
    expect(dormant.find((d) => d.floor === 11)!.name).toBe('COMMUNICATIONS');
  });
});

describe('nothing around a job gives the answer away', () => {
  it('every item has 1 to 5 bold words, each whole words of the note or the instruction', () => {
    for (const [id, w] of Object.entries(READING.items)) {
      const spans = w.emphasis ?? [];
      expect({ id, n: spans.length >= 1 && spans.length <= EMPHASIS_MAX }).toEqual({ id, n: true });
      const { lineMarks, askMarks } = readingMarks(w);
      expect(lineMarks).toHaveLength(w.passage.length);
      for (const span of spans) expect({ id, span, found: [...w.passage, w.ask].some((line) => emphasisMarks(line, [span]).length > 0) }).toEqual({ id, span, found: true });
      // The marks cover only the spans' own text.
      const marked = [...lineMarks.flatMap((m, i) => m.map(([s, e]) => w.passage[i]!.slice(s, e))), ...askMarks.map(([s, e]) => w.ask.slice(s, e))];
      for (const m of marked) expect(spans.some((s) => m.includes(s))).toBe(true);
    }
  });

  it('no bold word names the answer: a ride\'s floor, or the right thing or card', () => {
    for (const r of refs) {
      const w = READING.items[r.id]!;
      const { all, place } = giveaways(r.id);
      const bold = w.emphasis ?? [];
      for (const span of bold) expect({ id: r.id, span, said: giveawaysIn(span, all.filter((g) => g !== place)) }).toEqual({ id: r.id, span, said: [] });
      // The ride's own place may be bold only beside another place or floor of the note.
      if (place && bold.some((s) => giveawaysIn(s, [place]).length > 0)) expect(bold.filter((s) => giveawaysIn(s, [place]).length === 0 && (/Floor \d+/.test(s) || (w.places ?? []).some((p) => s.includes(p)))).length).toBeGreaterThan(0);
    }
  });

  it('no clue names the answer, and every ride and most other jobs have one', () => {
    for (const r of refs) {
      const w = READING.items[r.id]!;
      if (w.clue) expect({ id: r.id, said: giveawaysIn(w.clue, giveaways(r.id).all) }).toEqual({ id: r.id, said: [] });
    }
    for (const r of rides) expect(READING.items[r.id]!.clue).toBeTruthy();
    expect(refs.filter((r) => READING.items[r.id]!.clue).length / refs.length).toBeGreaterThanOrEqual(0.75);
  });

  it('the giveaways: a ride\'s floor in digits and words, a touch\'s thing and its own words, never a relation word', () => {
    const ride = READING.items['kit-above-archive']!;
    expect(answerGiveaways(ride, 19, [17, 15])).toEqual(['19', 'nineteen']);
    const fan = READING.items['left-fan-only']!;
    const touch = answerGiveaways(fan, 'fan-west', ['fan-east', 'switch'], { objectName: (v) => landingObject(LANDINGS, 5, v)?.name ?? null });
    expect(touch).toEqual(expect.arrayContaining(['left fan', 'west fan', 'west']));
    expect(touch).not.toContain('left');
    expect(touch).not.toContain('fan');
    expect(answerGiveaways(READING.items['open-platform']!, 'platform-yellow', ['platform-orange', 'platform-teal', 'spring'])).toContain('yellow');
  });
});

describe('the validator catches what the audit fixed', () => {
  it('accepts the shipped words', () => {
    expect(validateReading(readingJson, ctx).issues).toEqual([]);
  });

  it('a ride with no solve, or one whose places and floor do not add up', () => {
    const c = clone();
    delete c.items['kit-above-archive']!.solve;
    expect(codes(c)).toContain('missing.solve@items.kit-above-archive.solve');
    c.items['kit-above-archive']!.solve = { place: 'Archive', offset: 3 };
    expect(codes(c)).toContain('ref.solve@items.kit-above-archive.solve');
    c.items['kit-above-archive']!.solve = { place: 'Workshop', offset: 2 };
    expect(codes(c)).toContain('ref.solve@items.kit-above-archive.solve');
    c.items['painter-and-plumber']!.solve = { floor: 14 };
    expect(codes(c)).toContain('ref.solve@items.painter-and-plumber.solve');
    // Two floors between and nothing ruled out: not one answer.
    c.items['lost-toy-between']!.solve = { between: ['Lobby', 'Storage'] };
    expect(codes(c)).toContain('ref.solve@items.lost-toy-between.solve');
  });

  it('a place the directory does not have (an old short name), one the note does not name, and one the note names but does not list', () => {
    const c = clone();
    (c.items['grow-lights']!.passage as string[])[1] = 'The lights are for the plants in Comms.';
    c.items['grow-lights']!.places = ['Lobby', 'Comms'];
    c.items['grow-lights']!.solve = { place: 'Comms' };
    expect(codes(c)).toContain('ref.place@items.grow-lights.places');
    const d = clone();
    d.items['spare-springs']!.places = ['Platform Heights', 'Archive'];
    expect(codes(d)).toContain('ref.place@items.spare-springs.places');
    const e = clone();
    e.items['grow-lights']!.places = ['Hydroponics'];
    expect(codes(e)).toContain('missing.place@items.grow-lights.places');
    const f = clone();
    f.items['stuck-toolbox']!.places = ['Workshop'];
    expect(codes(f)).toContain('ref.places@items.stuck-toolbox.places');
  });

  it('bold words or a clue that give the answer away', () => {
    const c = clone();
    c.items['kit-above-archive']!.clue = 'It is Floor 19, two floors above.';
    c.items['ladder-not-in-storage']!.clue = 'Go to the Workshop.';
    c.items['stuck-toolbox']!.emphasis = ['toolbox lid', 'stuck shut'];
    c.items['open-platform']!.emphasis = ['yellow', 'open'];
    c.items['quiet-radio']!.clue = 'The radio dish got bumped.';
    expect(codes(c)).toEqual(
      expect.arrayContaining([
        'leak.clue@items.kit-above-archive.clue',
        'leak.clue@items.ladder-not-in-storage.clue',
        'leak.emphasis@items.stuck-toolbox.emphasis',
        'leak.emphasis@items.open-platform.emphasis',
        'leak.clue@items.quiet-radio.clue',
      ]),
    );
  });

  it('bold words that single out the ride\'s place, that are not in the note, or too many of them', () => {
    const c = clone();
    c.items['grow-lights']!.emphasis = ['Hydroponics', 'are for'];
    c.items['hose-first']!.emphasis = ['hose', 'Storage'];
    c.items['stuck-toolbox']!.emphasis = ['wrench'];
    c.items['drill-first']!.emphasis = ['First', 'Next', 'Last', 'steps', 'holes', 'shelf'];
    c.items['box-or-cart']!.emphasis = ['it', 'it'];
    expect(codes(c)).toEqual(
      expect.arrayContaining([
        'leak.emphasis@items.grow-lights.emphasis',
        'leak.emphasis@items.hose-first.emphasis',
        'copy.emphasis@items.stuck-toolbox.emphasis',
        'copy.emphasis@items.drill-first.emphasis',
        'copy.emphasis@items.box-or-cart.emphasis',
      ]),
    );
  });

  it('a clue that breaks the copy rules', () => {
    const c = clone();
    c.items['kit-above-archive']!.clue = 'Ask Morgan where the kit is.';
    expect(codes(c)).toContain('copy.properNoun@items.kit-above-archive.clue');
  });
});

describe('bold ranges', () => {
  it('match whole words only, exact case, merged where they overlap', () => {
    expect(emphasisMarks('So Lifty lifted it out and carried it alone.', ['it'])).toEqual([
      [16, 18],
      [35, 37],
    ]);
    expect(emphasisMarks('The orange platform is closed. Closed!', ['closed'])).toEqual([[23, 29]]);
    expect(emphasisMarks('two floors above the Archive', ['two floors', 'floors above'])).toEqual([[0, 16]]);
    expect(emphasisMarks('"Our ball stopped two floors below us."', ['two floors below us'])).toEqual([[18, 37]]);
    expect(emphasisMarks('hoisting', ['hoist'])).toEqual([]);
  });

  it('places named in a text, as the directory names them', () => {
    expect(placesIn('After lunch, fix the lamp in the Test Lab.', ['TEST LAB', 'MACHINE ROOM', 'LOBBY'])).toEqual(['Test Lab']);
    expect(placesIn('the storage room', ['STORAGE'])).toEqual([]);
    expect(titleCase('ROOFTOP GOLF')).toBe('Rooftop Golf');
  });
});
