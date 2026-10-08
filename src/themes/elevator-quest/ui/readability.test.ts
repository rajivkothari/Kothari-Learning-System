// Readability at every window size (M8.1): the text roles never drop below their floors, what to do is
// the biggest text, no box of words overlaps a control, the DIRECTORY control is a full-size target
// beside the panel that never covers the cabin's things, and the directory sheet has room to read.
import { cabinGeometry } from './cabinGeometry';
import { ROW_H, directoryColumns, directoryGrid } from './directoryLayout';
import { DIRECTORY_SHEET_MIN, GLYPH_EM, MIN_BUTTON, computeLayout, directorySheetBox, type Box } from './layout';
import { SETTINGS_SIZE, bannerBox, liftyPlacement, sceneBoxes, type LiftyContext } from './liftyPlacement';
import { CHOICE, SHEET_PAD, askHeight, cardCoversPlate, choiceColumns, noteButtonBox, readingCardBox } from './readingCardLayout';
import { TEXT_FLOOR, lineHeightFor } from './textRoles';
import { touchLimits } from './touchAreas';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
// The layout presets of layout.test.ts, liftyPlacement.test.ts, readingLayout.test.ts and touchAreas.test.ts.
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
const CONTEXTS: LiftyContext[] = ['default', 'panelHelp', 'shaftMap', 'completion'];
const overlap = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
const inside = (a: Box, b: Box) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5;

describe('readability at every window size', () => {
  it.each(SIZES)('%s (%i x %i): every text role is at or above its floor, and what to do is the biggest', (_n, w, h) => {
    const { text } = computeLayout({ width: w, height: h }, NO_INSETS);
    expect(text.question).toBeGreaterThanOrEqual(TEXT_FLOOR.question);
    expect(text.question).toBeLessThanOrEqual(28);
    expect(text.dialogue.min).toBeGreaterThanOrEqual(TEXT_FLOOR.dialogue.min);
    expect(text.dialogue.max).toBeLessThanOrEqual(24);
    expect(text.passage).toBeGreaterThanOrEqual(TEXT_FLOOR.passage);
    expect(text.passage).toBeLessThanOrEqual(24);
    expect(text.choice).toBeGreaterThanOrEqual(TEXT_FLOOR.choice);
    expect(text.directory).toBeGreaterThanOrEqual(18);
    expect(text.directory).toBeLessThanOrEqual(22);
    expect(text.label).toBeGreaterThanOrEqual(16);
    expect(text.question).toBeGreaterThan(text.passage);
    expect(text.question).toBeGreaterThanOrEqual(text.dialogue.max);
    expect(text.question).toBeGreaterThan(text.label);
  });

  it.each(SIZES)('%s: no box of words overlaps a control, and the mission banner keeps clear of the indicator and Lifty', (name, w, h) => {
    const layout = computeLayout({ width: w, height: h }, NO_INSETS);
    const { cabin } = layout;
    const settings: Box = { x: cabin.x + cabin.width - 8 - SETTINGS_SIZE, y: cabin.y + 8, width: SETTINGS_SIZE, height: SETTINGS_SIZE };
    const indicator = sceneBoxes(layout, 'status').indicator;
    for (const context of CONTEXTS) {
      const p = liftyPlacement(layout, context, { help: true });
      const controls: [string, Box][] = [['panel', layout.panel], ['directory', layout.directory], ['help', p.help], ['settings', settings]];
      // Lifty's words.
      for (const [c, box] of controls) expect({ name, context, words: 'bubble', control: c, overlap: overlap(p.bubble, box) }).toEqual({ name, context, words: 'bubble', control: c, overlap: false });
      // The mission banner.
      const banner = bannerBox(layout);
      if (banner) {
        expect(inside(banner, cabin)).toBe(true);
        for (const [c, box] of [...controls, ['indicator', indicator], ["Lifty's words", p.bubble], ['Lifty', p.figure]] as [string, Box][]) expect({ name, context, words: 'banner', control: c, overlap: overlap(banner, box) }).toEqual({ name, context, words: 'banner', control: c, overlap: false });
        // Room for the objective and the current step at the label size.
        expect(banner.height).toBeGreaterThanOrEqual(2 * lineHeightFor(layout.text.label, 'label') + 12);
      }
      // The note and the cards: never over the panel, the help button or settings, and clear of the
      // DIRECTORY plate except in the one window too short for both (there the plate waits under the card).
      const card = readingCardBox(layout, context);
      for (const [c, box] of [['panel', layout.panel], ['help', p.help], ['settings', settings]] as [string, Box][]) expect({ name, context, words: 'card', control: c, overlap: overlap(card, box) }).toEqual({ name, context, words: 'card', control: c, overlap: false });
      expect({ name, context, coversPlate: overlap(card, layout.directory) }).toEqual({ name, context, coversPlate: cardCoversPlate(layout, card) && name === 'iPad split 1/3 landscape' });
    }
  });

  it.each(SIZES)('%s: the DIRECTORY control is a full-size target beside the panel, clear of every other control, Lifty and the landing', (name, w, h) => {
    const layout = computeLayout({ width: w, height: h }, NO_INSETS);
    const { cabin, directory: d } = layout;
    expect(d.width).toBeGreaterThanOrEqual(name.includes('split 1/3 landscape') ? 92 : 112);
    expect(d.height).toBeGreaterThanOrEqual(MIN_BUTTON);
    expect(inside(d, { x: 0, y: 0, width: w, height: h })).toBe(true);
    expect(overlap(d, layout.panel)).toBe(false);
    // Next to the panel: beside it, under it, or just over it in the cabin's corner.
    const gap = Math.min(Math.abs(d.x - (layout.panel.x + layout.panel.width)), Math.abs(d.y - (layout.panel.y + layout.panel.height)), Math.abs(layout.panel.y - (d.y + d.height)));
    expect({ name, nearPanel: gap <= 24 }).toEqual({ name, nearPanel: true });
    const g = cabinGeometry(cabin, layout.bandHeight);
    const reach = touchLimits(g, cabin, 96);
    const landing: Box = { x: cabin.x + reach.x, y: cabin.y + reach.y, width: reach.width, height: reach.height };
    for (const context of [...CONTEXTS, 'cargo', 'rescue'] as LiftyContext[]) {
      const p = liftyPlacement(layout, context, { help: true });
      for (const [c, box] of [['Lifty', p.figure], ["Lifty's words", p.bubble], ['help', p.help], ['indicator', sceneBoxes(layout, 'status').indicator]] as [string, Box][]) expect({ name, context, control: c, overlap: overlap(d, box) }).toEqual({ name, context, control: c, overlap: false });
    }
    if (overlap(d, cabin)) {
      // Only the corner plate meets the cabin: never over the landing's touch areas or the folded note's button.
      expect(layout.placard).toEqual(d);
      expect(overlap(d, landing)).toBe(false);
      expect(overlap(d, noteButtonBox(layout))).toBe(false);
    }
  });

  it.each(SIZES)('%s: the directory sheet shows at least four rows of at least 56 pt, and the names have room', (name, w, h) => {
    const layout = computeLayout({ width: w, height: h }, NO_INSETS);
    const sheet = directorySheetBox(layout);
    expect(inside(sheet, { x: 0, y: 0, width: w, height: h })).toBe(true);
    expect(ROW_H).toBeGreaterThanOrEqual(56);
    // Header (Back, 64 pt), the note, the board's padding: the rest is rows.
    const rowsHeight = sheet.height - 10 * 2 - 7 - 64 - 8 - lineHeightFor(layout.text.label, 'label') * 2 - 8;
    expect({ name, rows: Math.floor(rowsHeight / (ROW_H + 6)) >= 4 }).toEqual({ name, rows: true });
    if (layout.cabin.height >= DIRECTORY_SHEET_MIN) expect(sheet).toEqual(layout.cabin);
    // A row holds the number, the icon and a long name ("Engineering Bay") at the directory size.
    const width = sheet.width - 24;
    const cell = directoryGrid(20, width, directoryColumns(width)).cells[0]!;
    const nameRoom = cell.w - (cell.icon.x - cell.x + cell.icon.w + 12);
    expect({ name, fits: nameRoom >= 'Engineering Bay'.length * layout.text.directory * GLYPH_EM }).toEqual({ name, fits: true });
  });

  it.each(SIZES)('%s: every choice card is reachable: whole in the box, or the sheet scrolls (never cut off)', (name, w, h) => {
    const layout = computeLayout({ width: w, height: h }, NO_INSETS);
    const box = readingCardBox(layout);
    const sheet = { width: Math.min(box.width, 680), height: box.height };
    for (const count of [2, 3, 4]) {
      const columns = choiceColumns(sheet, count, layout.text);
      const rows = Math.ceil(count / columns);
      const content = SHEET_PAD * 2 + askHeight(layout.text) + rows * CHOICE.minHeight + (rows - 1) * CHOICE.gap;
      const cardWidth = (sheet.width - SHEET_PAD * 2 - 4 - CHOICE.gap * (columns - 1)) / columns;
      expect({ name, count, wide: cardWidth >= Math.min(CHOICE.minWidth, sheet.width - 28) }).toEqual({ name, count, wide: true });
      // Full windows show the question and every card at once; smaller ones scroll inside the sheet.
      if (!/split|Slide|narrow/.test(name)) expect({ name, count, whole: content <= box.height }).toEqual({ name, count, whole: true });
      else expect(box.height).toBeGreaterThanOrEqual(CHOICE.minHeight + SHEET_PAD * 2);
    }
  });
});
