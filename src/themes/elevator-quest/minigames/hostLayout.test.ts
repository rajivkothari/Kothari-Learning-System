// Where the landing's PLAY button goes (M9), at the fifteen window sizes of touchAreas.test.ts: at
// least 64 pt tall, inside the cabin, never over the panel and its door buttons, the help slot,
// Lifty (his figure and words, in every context the entrance shows in), the indicator, the icon row,
// the DIRECTORY plate, the shaft map, the readout, the note button or the landing's own touch areas
// (vectors and art). The game's name on every full window; PLAY where only that fits; none in Split
// View 1/3 and Slide Over.
import { cabinGeometry } from '../ui/cabinGeometry';
import { computeLayout, type Box } from '../ui/layout';
import { liftyPlacement, maintenanceReadoutBox, sceneBoxes, type LiftyContext } from '../ui/liftyPlacement';
import { noteButtonBox } from '../ui/readingCardLayout';
import { TEXT_FLOOR } from '../ui/textRoles';
import { HOST_COPY, entranceLabel } from './hostCopy';
import { ENTRANCE, entrancePlacement, labelLines, labelWidth, landingTouchAreas, type EntranceContext } from './hostLayout';
import { MINI_GAMES } from './catalog';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
// The layout presets of touchAreas.test.ts (and liftyPlacement.test.ts, layout.test.ts).
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
/** Full windows: the button names the game. */
const FULL = ['Fire HD 8 landscape', 'Fire HD 8 portrait', 'Fire HD 10 landscape', 'iPad landscape', 'iPad portrait', 'iPad 10.2 landscape', 'iPad mini landscape', 'iPad Pro 12.9 landscape'];
/** No room for a 64 pt button with 10 pt padding anywhere beside the doorway (a few dozen points wide). */
const NONE = ['iPad split 1/3', 'iPad split 1/3 landscape', 'iPad Slide Over'];
/** The stages the entrance shows in, by Lifty's context (free ride and calls: default; jobs: any). */
const CONTEXTS: LiftyContext[] = ['default', 'panelHelp', 'shaftMap'];
const STATES: EntranceContext[] = [
  { readout: true, note: false, shaft: 'status' }, // free ride, maintenance panel unlocked
  { readout: false, note: false, shaft: 'status' }, // a hall call, a panel job
  { readout: false, note: true, shaft: 'status' }, // a reading ride, its note folded
  { readout: false, note: false, shaft: 'map' }, // a shaft job, or help on the shaft map
  { readout: false, note: true, shaft: 'map' },
];

const inside = (a: Box, b: Box) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5;
const overlap = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

/** Everything the button must never cover, built here from the layout's own pieces (not hostLayout's list). */
function protectedBoxes(w: number, h: number, on: EntranceContext, floor: number): [string, Box][] {
  const layout = computeLayout({ width: w, height: h }, NO_INSETS);
  const out: [string, Box][] = [['panel and door buttons', layout.panel], ['directory', layout.directory]];
  for (const context of CONTEXTS) {
    const p = liftyPlacement(layout, context, { help: true });
    out.push([`help (${context})`, p.help], [`Lifty (${context})`, p.figure], [`Lifty's words (${context})`, p.bubble]);
  }
  const scene = sceneBoxes(layout, on.shaft);
  out.push(['indicator', scene.indicator], [`shaft map (${on.shaft})`, scene.shaft], ['icon row', { x: layout.cabin.x, y: layout.cabin.y, width: layout.cabin.width, height: 64 }]);
  if (layout.placard) out.push(['directory placard', layout.placard]);
  const readout = maintenanceReadoutBox(layout);
  if (on.readout && readout) out.push(['maintenance readout', readout]);
  if (on.note) out.push(['note button', noteButtonBox(layout)]);
  landingTouchAreas(layout, floor, [on.shaft]).forEach((b, i) => out.push([`landing touch ${i}`, b]));
  return out;
}

describe('mini-game entrance placement', () => {
  const cases = SIZES.flatMap(([name, w, h]) => MINI_GAMES.flatMap((g) => [false, true].map((resume) => [name, w, h, g.floor, g.titleKey, resume] as const)));
  it.each(cases)('%s (%i x %i), floor %i (%s, unfinished: %s): a full-size button that covers nothing it must not', (name, w, h, floor, titleKey, resume) => {
    const layout = computeLayout({ width: w, height: h }, NO_INSETS);
    const label = entranceLabel(titleKey, resume);
    for (const on of STATES) {
      const p = entrancePlacement(layout, floor, { full: [...new Set([label, entranceLabel(titleKey, false)])], short: HOST_COPY.play }, on);
      if (NONE.includes(name)) {
        expect({ name, placed: p }).toEqual({ name, placed: null });
        continue;
      }
      if (!p) throw new Error(`no entrance at ${name} for ${JSON.stringify(on)}`);
      const id = `${name} ${floor} ${JSON.stringify(on)}`;
      // The game's name on every full window (BACK TO ... where it fits, else PLAY ...); PLAY alone only in narrower windows.
      expect({ id, short: p.short }).toEqual({ id, short: FULL.includes(name) ? false : p.short });
      if (!resume) expect({ id, label: p.label }).toEqual({ id, label: p.short ? HOST_COPY.play : label });
      expect({ id, tall: p.box.height >= ENTRANCE.minHeight, wide: p.box.width >= (p.short ? ENTRANCE.minShortWidth : ENTRANCE.minWidth), inCabin: inside(p.box, layout.cabin) }).toEqual({ id, tall: true, wide: true, inCabin: true });
      // A text role, never smaller than a label.
      expect([layout.text.choice, layout.text.label]).toContain(p.size);
      expect(p.size).toBeGreaterThanOrEqual(TEXT_FLOOR.label);
      for (const [what, box] of protectedBoxes(w, h, on, floor)) expect({ id, what, overlap: overlap(p.box, box) }).toEqual({ id, what, overlap: false });
      // Beside or below the doorway, never in it: the landing stays in view.
      const g = cabinGeometry(layout.cabin, layout.bandHeight);
      const door = { x: layout.cabin.x + g.door.x, y: layout.cabin.y + g.door.y, width: g.door.w, height: g.door.h };
      expect({ id, inDoorway: overlap(p.box, door) }).toEqual({ id, inDoorway: false });
    }
  });

  it.each(SIZES)('%s (%i x %i): every entrance label, measured, fits inside its button with at least 10 pt to spare each side', (name, w, h) => {
    const layout = computeLayout({ width: w, height: h }, NO_INSETS);
    for (const g of MINI_GAMES) {
      for (const resume of [false, true]) {
        const label = entranceLabel(g.titleKey, resume);
        for (const on of STATES) {
          const p = entrancePlacement(layout, g.floor, { full: [...new Set([label, entranceLabel(g.titleKey, false)])], short: HOST_COPY.play }, on);
          if (!p) continue;
          const inner = p.box.width - ENTRANCE.padX * 2;
          const lines = labelLines(p.label, inner, p.size);
          const id = `${name} ${g.titleKey} ${p.label}`;
          // Inside the 2 pt border, at least 10 pt of padding; one word per line when needed; never under the label role.
          expect({ id, padding: ENTRANCE.padX - 2 >= 10, lines: lines.length <= ENTRANCE.maxLines, fits: lines.every((l) => labelWidth(l, p.size) <= inner), tall: p.box.height >= lines.length * Math.round(p.size * 1.25) + ENTRANCE.padY * 2, size: p.size >= TEXT_FLOOR.label }).toEqual({ id, padding: true, lines: true, fits: true, tall: true, size: true });
        }
      }
    }
  });

  it('measures the label face glyph by glyph: COMMANDER at 18 pt is wider than the 130 pt the web build drew', () => {
    expect(labelWidth('COMMANDER', 18)).toBeGreaterThanOrEqual(130);
    expect(labelLines('PLAY CARGO COMMANDER', labelWidth('COMMANDER', 18), 18)).toEqual(['PLAY', 'CARGO', 'COMMANDER']);
  });

  it('the label fits its box: lines times line height plus padding is the height, never more than three lines', () => {
    const layout = computeLayout({ width: 960, height: 600 }, NO_INSETS);
    const p = entrancePlacement(layout, 4, { full: [entranceLabel('cargoCommander', true)], short: HOST_COPY.play }, STATES[0]!)!;
    expect(p.lines).toBeLessThanOrEqual(ENTRANCE.maxLines);
    expect(p.box.height).toBeGreaterThanOrEqual(p.lines * Math.round(p.size * 1.25));
  });
});
