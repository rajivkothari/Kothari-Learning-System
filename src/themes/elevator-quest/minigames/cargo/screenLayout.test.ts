import { TEXT_FLOOR } from '../../ui/textRoles';
import { MIN_TARGET, cargoScreenLayout, crateGrid, dockLayout, holdLayout, inside, overlaps, type Box } from './screenLayout';

// Logical window sizes (pt / dp), the same set the elevator's layout is tested at.
const SIZES: [string, number, number][] = [
  ['Fire HD 8 landscape', 960, 600],
  ['Fire HD 8 portrait', 600, 960],
  ['Fire HD 10 landscape', 1280, 800],
  ['iPad 10.2 landscape', 1080, 810],
  ['iPad 10.2 portrait', 810, 1080],
  ['iPad Pro 12.9 landscape', 1366, 1024],
  ['iPad split 2/3 landscape', 694, 768],
  ['iPad split 1/2 portrait', 507, 1024],
  ['narrow iPad window', 504, 820],
  ['iPad Slide Over', 320, 1024],
];
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const BRIEF = 96; // the longest brief in cargo copy, about
const CUE = 90;

describe.each(SIZES)('Cargo Commander layout, %s (%i x %i)', (_name, w, h) => {
  it.each([0, 3, 4, 5, 6])('everything fits, nothing overlaps, every target is 64 pt (%i crates)', (crates) => {
    const l = cargoScreenLayout({ size: { width: w, height: h }, insets: NO_INSETS, briefChars: BRIEF, cueChars: CUE, crates });
    // Only Slide Over may need to scroll; every other window shows everything at once.
    if (w >= 400) expect(l.contentHeight).toBe(h);
    const screen: Box = { x: 0, y: 0, width: w, height: l.contentHeight };
    const regions = { back: l.back, toolkit: l.toolkit, help: l.help, brief: l.brief, freight: l.freight, gauge: l.gauge, weigh: l.weigh, cue: l.cue, supply: l.supply };
    for (const [name, b] of Object.entries(regions)) {
      expect({ name, ok: inside(b, screen) }).toEqual({ name, ok: true });
      expect({ name, h: b.height > 0 }).toEqual({ name, h: true });
    }
    const names = Object.keys(regions) as (keyof typeof regions)[];
    for (let i = 0; i < names.length; i += 1)
      for (let j = i + 1; j < names.length; j += 1) expect({ pair: `${names[i]}/${names[j]}`, overlap: overlaps(regions[names[i]!], regions[names[j]!]) }).toEqual({ pair: `${names[i]}/${names[j]}`, overlap: false });
    for (const t of [l.back, l.toolkit, l.help, l.weigh]) {
      expect(t.width).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(t.height).toBeGreaterThanOrEqual(MIN_TARGET);
    }
    // The hold sits inside the freight; the toolkit never covers the scale, WEIGH or the top bar.
    expect(inside(l.hold, l.freight)).toBe(true);
    for (const b of [l.gauge, l.back, l.toolkit, l.help, ...(l.toolkitCoversWeigh ? [] : [l.weigh])]) expect(overlaps(l.toolkitPanel, b)).toBe(false);
    expect(l.toolkitPanel.height).toBeGreaterThanOrEqual(300);
    expect(l.text.question).toBeGreaterThanOrEqual(TEXT_FLOOR.question);
    // A real scale: room for the dial and its readout.
    expect(l.gauge.width).toBeGreaterThanOrEqual(150);
    expect(l.gauge.height).toBeGreaterThanOrEqual(110);
    if (crates > 0) {
      expect(l.crate).toBeGreaterThanOrEqual(MIN_TARGET);
      const dock = dockLayout(l.supply, false, false, l.text.label).crates!;
      const cells = crateGrid(crates, l.crate, dock);
      for (const c of cells) expect(inside(c, dock)).toBe(true);
      const inHold = holdLayout(l.hold, false, false).crates!;
      for (const c of crateGrid(crates, l.crate, inHold)) expect(inside(c, inHold)).toBe(true);
    }
  });

  it.each([
    ['capacityRemaining', true, false],
    ['twoDeliveries', false, true],
    ['compare', true, true],
  ])('the filler kinds: the piles and the tens and ones are full-size targets (%s)', (_kind, hasBase, hasInfo) => {
    const l = cargoScreenLayout({ size: { width: w, height: h }, insets: NO_INSETS, briefChars: BRIEF, cueChars: CUE, crates: 0 });
    const hold = holdLayout(l.hold, true, hasBase);
    const dock = dockLayout(l.supply, true, hasInfo, l.text.label);
    for (const t of [hold.tens!, hold.ones!, dock.sackPile!, dock.boxPile!]) {
      expect(t.width).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(t.height).toBeGreaterThanOrEqual(MIN_TARGET);
    }
    expect(overlaps(hold.tens!, hold.ones!)).toBe(false);
    if (hold.base) expect(overlaps(hold.base, hold.tens!)).toBe(false);
    expect(inside(dock.sackPile!, l.supply)).toBe(true);
    expect(inside(dock.boxPile!, l.supply)).toBe(true);
    if (dock.info) expect(overlaps(dock.info, dock.sackPile!)).toBe(false);
  });
});

it('respects the safe area', () => {
  const insets = { top: 24, right: 30, bottom: 20, left: 30 };
  const l = cargoScreenLayout({ size: { width: 1080, height: 810 }, insets, briefChars: BRIEF, cueChars: CUE, crates: 4 });
  expect(l.back.x).toBeGreaterThanOrEqual(30);
  expect(l.back.y).toBeGreaterThanOrEqual(24);
  expect(l.help.x + l.help.width).toBeLessThanOrEqual(1080 - 30);
  expect(l.weigh.y + l.weigh.height).toBeLessThanOrEqual(810 - 20);
});
