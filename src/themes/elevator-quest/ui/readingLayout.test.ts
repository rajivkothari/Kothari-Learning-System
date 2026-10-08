// A reading job on screen (M8), at every window size: the note and the cards keep to the reading card
// box (clear of the panel, the help button with NEXT JOB in its place, the icon row, and Lifty where
// there is room), the cards are full-size targets, and the folded note's button never covers the
// landing's touch areas, the indicator, Lifty, the help button, the icon row, the panel or the
// placard. How a job is answered (ui/readingSurface.ts): a touch job uses the landing only when every
// one of its things can be touched there, else cards for all of them; never a mix.
import { ART_MANIFEST } from '../art/catalog';
import { landingArtFits } from '../art/fit';
import type { ReadingView } from '../director/director';
import type { TouchTarget } from '../director/landingTouch';
import { LANDINGS, landingFor, landingObjects } from '../content/landings';
import { READING } from '../content/reading';
import { cabinGeometry } from './cabinGeometry';
import { heroFor } from './landingArt';
import { MIN_BUTTON, computeLayout, type Box } from './layout';
import { liftyPlacement, sceneBoxes, type LiftyContext } from './liftyPlacement';
import { CHOICE, NOTE_BUTTON, choiceColumns, noteButtonBox, readingCardBox } from './readingCardLayout';
import { answerReach, jobReach, offeredHotspots, readingOnScreen, readingSurface, readingTouch } from './readingSurface';
import { placeHotspots, touchLimits, type LandingDrawn } from './touchAreas';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
// The layout presets of layout.test.ts, liftyPlacement.test.ts and touchAreas.test.ts.
const SIZES: [string, number, number][] = [
  ['Fire HD 8 landscape', 960, 600],
  ['Fire HD 8 portrait', 600, 960],
  ['Fire HD 10 landscape', 1280, 800],
  ['iPad landscape', 1180, 820],
  ['iPad portrait', 820, 1180],
  ['iPad 10.2 landscape', 1080, 810],
  ['iPad mini landscape', 1133, 744],
  ['iPad Pro 12.9 landscape', 1366, 1024],
  ['iPad split 2/3 landscape', 694, 768],
  ['iPad split 1/2', 590, 820],
  ['iPad split 1/2 portrait', 507, 1024],
  ['iPad split 1/3', 375, 820],
  ['iPad split 1/3 landscape', 320, 768],
  ['iPad Slide Over', 320, 1024],
  ['narrow iPad window', 504, 820],
];
/** A reading job's Lifty contexts: the default, and SHOW ME on a ride (the floor ringed on the panel). */
const CONTEXTS: LiftyContext[] = ['default', 'panelHelp'];
const inside = (a: Box, b: Box) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5;
const overlap = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

const backgroundOf = (floor: number) => ART_MANIFEST.assets.find((a) => a.kind === 'landing' && a.layer === 'background' && a.floor === floor && a.state === 'any');
const answerTargets = (floor: number, ids: readonly string[]): TouchTarget[] =>
  ids.map((id) => landingObjects(LANDINGS, floor).find((o) => o.id === id)!).map((object) => ({ object, spot: null, mode: 'answer' as const, inspected: false, open: false, label: object.name }));
/** Every read-and-touch item: its landing and its options (the words name every option). */
const TOUCH_ITEMS = Object.entries(READING.items).filter(([, w]) => w.mode === 'touch').map(([id, w]) => ({ id, floor: w.floor!, options: Object.keys(w.options!) }));

describe('reading job layout', () => {
  it.each(SIZES.flatMap(([n, w, h]) => CONTEXTS.map((c) => [n, w, h, c] as const)))('%s (%i x %i), Lifty %s: the note and cards box, and the folded note\'s button, reach nothing they must not', (_name, w, h, context) => {
    const layout = computeLayout({ width: w, height: h }, NO_INSETS);
    const { cabin } = layout;
    const lifty = liftyPlacement(layout, context, { help: true });
    const scene = sceneBoxes(layout, 'status', context);
    const iconRow = { x: cabin.x, y: cabin.y, width: cabin.width, height: 64 };
    // The note's and the cards' box.
    const card = readingCardBox(layout, context);
    expect(inside(card, cabin)).toBe(true);
    const roomy = card.y > lifty.bubble.y + lifty.bubble.height;
    const cardKeep: [string, Box][] = [['panel', layout.panel], ['help', lifty.help], ['icon row', iconRow], ...(roomy ? ([['Lifty', lifty.figure], ["Lifty's words", lifty.bubble], ['indicator', scene.indicator]] as [string, Box][]) : [])];
    for (const [name, box] of cardKeep) expect({ name, overlap: overlap(card, box) }).toEqual({ name, overlap: false });
    // The folded note's button.
    const note = noteButtonBox(layout, context);
    expect([note.width, note.height]).toEqual([NOTE_BUTTON, NOTE_BUTTON]);
    expect(NOTE_BUTTON).toBeGreaterThanOrEqual(MIN_BUTTON);
    expect(inside(note, cabin)).toBe(true);
    const g = cabinGeometry(cabin, layout.bandHeight);
    const reach = touchLimits(g, cabin, scene.shaft.width);
    const keep: [string, Box][] = [
      ['landing touch areas', { x: cabin.x + reach.x, y: cabin.y + reach.y, width: reach.width, height: reach.height }],
      ['indicator', scene.indicator],
      ['Lifty', lifty.figure],
      ["Lifty's words", lifty.bubble],
      ['help', lifty.help],
      ['icon row', iconRow],
      ['panel', layout.panel],
      ...(layout.placard ? ([['directory placard', layout.placard]] as [string, Box][]) : []),
    ];
    for (const [name, box] of keep) expect({ name, overlap: overlap(note, box) }).toEqual({ name, overlap: false });
  });

  it.each(SIZES)('%s: cards are full-size targets that fit the width, and fit the height where the window allows', (name, w, h) => {
    const layout = computeLayout({ width: w, height: h }, NO_INSETS);
    const box = readingCardBox(layout);
    const sheet = { width: Math.min(box.width, 640), height: box.height };
    for (const count of [2, 3, 4]) {
      const columns = choiceColumns(sheet, count);
      expect(columns).toBeGreaterThanOrEqual(1);
      expect(columns).toBeLessThanOrEqual(count);
      const inner = sheet.width - 2 * 12 - 2 * 2;
      const cardWidth = (inner - CHOICE.gap * (columns - 1)) / columns;
      expect({ name, count, wide: cardWidth >= (columns === 1 ? MIN_BUTTON : CHOICE.minWidth - 4) }).toEqual({ name, count, wide: true });
      // Full windows: every card and the instruction show at once, no scrolling.
      const rows = Math.ceil(count / columns);
      const height = 2 * 12 + 2 * 27 + 8 + rows * CHOICE.minHeight + (rows - 1) * CHOICE.gap;
      if (!name.includes('split') && !name.includes('Slide') && !name.includes('narrow')) expect({ name, count, fits: height <= box.height }).toEqual({ name, count, fits: true });
    }
  });

  it('a touch job is offered on the landing only when every one of its things can be touched there', () => {
    const at = (floor: number, art: boolean): LandingDrawn => {
      const layout = computeLayout({ width: 1180, height: 820 }, NO_INSETS);
      const g = cabinGeometry(layout.cabin, layout.bandHeight);
      const landing = landingFor(LANDINGS, floor, { restored: () => true });
      return { door: g.door, background: art ? backgroundOf(floor) : undefined, artHit: undefined, hero: heroFor(landing, g.door.w / g.door.h) };
    };
    const limitsAt = () => {
      const layout = computeLayout({ width: 1180, height: 820 }, NO_INSETS);
      return touchLimits(cabinGeometry(layout.cabin, layout.bandHeight), layout.cabin, 64);
    };
    const check = (floor: number, ids: string[], art: boolean) => {
      const targets = answerTargets(floor, ids);
      const placed = placeHotspots(targets, at(floor, art), [], limitsAt());
      const reach = answerReach(targets, placed);
      const offered = offeredHotspots(placed, reach);
      return { reach, offered: offered.map((p) => p.target.object.id).sort() };
    };
    // Floor 2 with its art: every thing has a box. On the vector landing only the toolbox has a place: cards.
    if (backgroundOf(2)) expect(check(2, ['toolbox', 'drill', 'workbench'], true)).toEqual({ reach: true, offered: ['drill', 'toolbox', 'workbench'] });
    expect(check(2, ['toolbox', 'drill', 'workbench'], false)).toEqual({ reach: false, offered: [] });
    // Floor 1: the plant and the bench are painted outside the safe core (no box): cards, even with the art.
    expect(check(1, ['plant', 'bench', 'gear'], Boolean(backgroundOf(1)))).toEqual({ reach: false, offered: [] });
    // No answer targets: nothing to decide.
    expect(answerReach([], [])).toBeNull();
    // A job is judged on all of its options, so SHOW ME (one target left) never moves it off its cards.
    const f1 = landingObjects(LANDINGS, 1);
    if (backgroundOf(1)) {
      expect(jobReach(['gear'], f1, at(1, true), limitsAt())).toBe(true);
      expect(jobReach(['gear', 'plant', 'bench'], f1, at(1, true), limitsAt())).toBe(false);
    }
    // An option that is no object on this landing can never be touched here.
    expect(jobReach(['gear', 'telescope'], f1, at(1, Boolean(backgroundOf(1))), limitsAt())).toBe(false);
  });

  it.each(SIZES)('%s: on every illustrated landing, a read-and-touch item\'s things either all get a touch area clear of the note button, or the item takes cards', (_n, w, h) => {
    const layout = computeLayout({ width: w, height: h }, NO_INSETS);
    const { cabin } = layout;
    const g = cabinGeometry(cabin, layout.bandHeight);
    const door = { x: cabin.x + g.door.x, y: cabin.y + g.door.y, w: g.door.w, h: g.door.h };
    const l = touchLimits(g, cabin, 64);
    const limits = { x: cabin.x + l.x, y: cabin.y + l.y, width: l.width, height: l.height };
    const note = noteButtonBox(layout);
    for (const item of TOUCH_ITEMS) {
      const background = backgroundOf(item.floor);
      if (!background || !landingArtFits(door)) continue;
      const landing = landingFor(LANDINGS, item.floor, { restored: () => true });
      const drawn: LandingDrawn = { door, background, artHit: undefined, hero: heroFor(landing, door.w / door.h) };
      const targets = answerTargets(item.floor, item.options);
      const placed = placeHotspots(targets, drawn, [], limits);
      const reach = answerReach(targets, placed);
      const offered = offeredHotspots(placed, reach);
      expect({ item: item.id, mixed: offered.length > 0 && offered.length < targets.length }).toEqual({ item: item.id, mixed: false });
      for (const p of offered) expect({ item: item.id, thing: p.target.object.id, coversNote: overlap(p.area, note) }).toEqual({ item: item.id, thing: p.target.object.id, coversNote: false });
    }
  });
});

describe('how a reading job is answered on screen', () => {
  const view = (over: Partial<ReadingView>): ReadingView => ({ item: 'x', mode: 'touch', floor: 2, title: 'T', lines: ['A line.'], ask: 'Touch it.', open: false, highlight: null, accepting: true, options: [], ...over });

  it('the note first; folded: the panel, the cards, or the landing (cards when a thing cannot be touched; nothing until that is known)', () => {
    expect(readingSurface(view({ open: true }), true)).toBe('note');
    expect(readingSurface(view({ mode: 'ride' }), null)).toBe('panel');
    expect(readingSurface(view({ mode: 'choose' }), null)).toBe('cards');
    expect(readingSurface(view({}), true)).toBe('landing');
    expect(readingSurface(view({}), false)).toBe('cards');
    expect(readingSurface(view({}), null)).toBeNull();
  });

  it('is on screen while the job waits, during its answer and a miss\'s pause; never during a success or a hall call', () => {
    const r = view({});
    for (const stage of ['task', 'riding', 'pause'] as const) expect(readingOnScreen({ stage, reading: r })).toBe(r);
    for (const stage of ['success', 'call', 'error', 'freeRide'] as const) expect(readingOnScreen({ stage, reading: r })).toBeNull();
  });

  it('the landing\'s answer targets are named as the note names them, and are not offered while the note is open over the landing', () => {
    const [toolbox] = answerTargets(2, ['toolbox']);
    const explore = { ...toolbox!, mode: 'explore' as const, label: 'Inspect the toolbox' };
    const options = [{ optionId: 'a', value: 'toolbox', label: 'red toolbox', tried: false, shown: false }];
    expect(readingTouch([toolbox!], view({ options }))[0]!.label).toBe('red toolbox');
    expect(readingTouch([toolbox!], view({ options, open: true }))).toEqual([]);
    expect(readingTouch([explore], view({ options, open: true }))).toEqual([explore]);
    expect(readingTouch([toolbox!], null)).toEqual([toolbox]);
  });
});
