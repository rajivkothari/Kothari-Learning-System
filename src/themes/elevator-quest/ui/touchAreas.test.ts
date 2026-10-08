// Landing touch areas at every window size: each one is at least the minimum target, stays in the
// doorway, never reaches the floor buttons, the door buttons, the help button (NEXT JOB and LET'S
// COUNT take its place), Lifty or Lifty's words, the shaft map or the cabin's icon row, and two
// things to explore on one landing never share a touch. Checked on the vector landings and, for the
// floors with art in the manifest, on the art at every doorway shape the art is drawn for.
import { landingArtFits } from '../art/fit';
import { ART_MANIFEST } from '../art/catalog';
import { LANDINGS, exploreSpots, landingFor, landingObjects } from '../content/landings';
import type { TouchTarget } from '../director/landingTouch';
import { cabinGeometry } from './cabinGeometry';
import { heroFor } from './landingArt';
import { MIN_BUTTON, computeLayout, type Box } from './layout';
import { liftyPlacement, sceneBoxes, type LiftyContext } from './liftyPlacement';
import { MIN_CARD_HEIGHT, readingCardBox } from './readingCardLayout';
import { boxesOverlap, placeHotspots, touchLimits, touchable, type LandingDrawn } from './touchAreas';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
// The layout presets of liftyPlacement.test.ts and layout.test.ts.
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
const restored = { restored: () => true };
const inside = (a: Box, b: Box) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5;
const overlap = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

/** Every object on a floor as an exploring target, and as an answer target (what a reading job would use). */
function targets(floor: number, mode: 'explore' | 'answer'): TouchTarget[] {
  const objects = landingObjects(LANDINGS, floor);
  if (mode === 'answer') return objects.map((object) => ({ object, spot: null, mode, inspected: false, open: false, label: object.name }));
  return exploreSpots(LANDINGS, floor).map((spot) => ({ object: objects.find((o) => o.id === spot.target)!, spot, mode, inspected: false, open: false, label: spot.object }));
}

/** The controls and words the landing must leave alone, in a layout (the shaft map as it is drawn now). */
function protectedBoxes(w: number, h: number, shaftMode: 'status' | 'map'): [string, Box][] {
  const layout = computeLayout({ width: w, height: h }, NO_INSETS);
  const { cabin } = layout;
  const out: [string, Box][] = [['panel', layout.panel]];
  for (const context of CONTEXTS) {
    const p = liftyPlacement(layout, context, { help: true });
    out.push([`help (${context})`, p.help], [`Lifty (${context})`, p.figure], [`Lifty's words (${context})`, p.bubble]);
  }
  out.push([`shaft map (${shaftMode})`, sceneBoxes(layout, shaftMode).shaft]);
  // The cabin's icon row (clipboard, directory, settings) and the checklist: the top 64 pt of the cabin.
  out.push(['icon row', { x: cabin.x, y: cabin.y, width: cabin.width, height: 64 }]);
  if (layout.placard) out.push(['directory placard', layout.placard]);
  return out;
}

function doorOf(w: number, h: number, shaftMode: 'status' | 'map' = 'status') {
  const layout = computeLayout({ width: w, height: h }, NO_INSETS);
  const { cabin } = layout;
  const g = cabinGeometry(cabin, layout.bandHeight);
  const l = touchLimits(g, cabin, sceneBoxes(layout, shaftMode).shaft.width);
  return { layout, door: { x: cabin.x + g.door.x, y: cabin.y + g.door.y, w: g.door.w, h: g.door.h }, limits: { ...l, x: cabin.x + l.x, y: cabin.y + l.y } };
}
/** Full-window layouts: every thing on a landing gets its own touch there. */
const ROOMY = ['Fire HD 8 landscape', 'Fire HD 8 portrait', 'Fire HD 10 landscape', 'iPad landscape', 'iPad portrait', 'iPad 10.2 landscape', 'iPad mini landscape', 'iPad Pro 12.9 landscape'];

const artFloors = [...new Set(ART_MANIFEST.assets.filter((a) => a.kind === 'landing' && a.layer === 'background').map((a) => a.floor!))];
const backgroundOf = (floor: number) => ART_MANIFEST.assets.find((a) => a.kind === 'landing' && a.layer === 'background' && a.floor === floor && a.state === 'any')!;
const hitOf = (floor: number) => ART_MANIFEST.assets.find((a) => a.kind === 'landing' && a.floor === floor && a.hit)?.hit;
const floorsWithObjects = LANDINGS.floors.filter((f) => f.objects?.length).map((f) => f.floor);

describe('landing touch areas', () => {
  it.each(SIZES.flatMap(([n, w, h]) => (['status', 'map'] as const).map((m) => [n, w, h, m] as const)))('%s (%i x %i), shaft map as %s: every spot can be touched, full size, and reaches nothing it must not', (name, w, h, shaftMode) => {
    const { layout, door, limits } = doorOf(w, h, shaftMode);
    // A split view so short that the doorway runs off the cabin shows no landing to touch.
    if (door.y + door.h > layout.cabin.y + layout.cabin.height) return expect(name).toBe('iPad split 1/3 landscape');
    const keep = protectedBoxes(w, h, shaftMode);
    for (const floor of floorsWithObjects) {
      const landing = landingFor(LANDINGS, floor, restored);
      const vector: LandingDrawn = { door, background: undefined, artHit: undefined, hero: heroFor(landing, door.w / door.h) };
      const drawings: [string, LandingDrawn][] = [['vector', vector]];
      if (artFloors.includes(floor) && landingArtFits(door)) drawings.push(['art', { ...vector, background: backgroundOf(floor), artHit: hitOf(floor) }]);
      for (const [drawn, at] of drawings) {
        const explore = placeHotspots(targets(floor, 'explore'), at, [], limits);
        // No dead spots: every exploring thing has a touch area on the landing drawn now (in a split
        // view's small doorway at least one, the others when the window is larger).
        const spots = exploreSpots(LANDINGS, floor).length;
        expect({ floor, drawn, spots: explore.length }).toEqual({ floor, drawn, spots: ROOMY.includes(name) ? spots : Math.min(spots, Math.max(1, explore.length)) });
        const answers = drawn === 'art' ? placeHotspots(targets(floor, 'answer'), at, [], limits) : [];
        for (const { target, area, hit } of [...explore, ...answers]) {
          const id = `${floor} ${drawn} ${target.object.id}`;
          // Full size, within the doorway, its frame and the floor below it, and around the thing itself.
          expect({ id, w: area.width >= MIN_BUTTON, h: area.height >= MIN_BUTTON, inLimits: inside(area, limits), inCabin: inside(area, layout.cabin), onIt: overlap(area, hit) || hit.width < 1 }).toEqual({ id, w: true, h: true, inLimits: true, inCabin: true, onIt: true });
          for (const [name, box] of keep) expect({ id, reaches: name, overlap: overlap(area, box) }).toEqual({ id, reaches: name, overlap: false });
        }
        // Two things to explore on one landing never share a touch.
        for (let i = 0; i < explore.length; i++) for (let j = i + 1; j < explore.length; j++) expect({ floor, drawn, a: explore[i]!.target.object.id, b: explore[j]!.target.object.id, overlap: boxesOverlap(explore[i]!.area, explore[j]!.area) }).toEqual({ floor, drawn, a: explore[i]!.target.object.id, b: explore[j]!.target.object.id, overlap: false });
      }
    }
  });

  it('a collectable mission object keeps its own touch: an exploring touch never covers it', () => {
    const { door } = doorOf(960, 600);
    const at: LandingDrawn = { door, background: undefined, artHit: undefined, hero: null };
    const ball = targets(20, 'explore');
    expect(placeHotspots(ball, at)).toHaveLength(1);
    const kit = { x: door.x, y: door.y, width: door.w, height: door.h };
    expect(placeHotspots(ball, at, [kit])).toHaveLength(0);
    // An answer target is the job's own: it stays.
    expect(placeHotspots(targets(20, 'answer'), { ...at, background: backgroundOf(20) }, [kit]).length).toBeGreaterThan(0);
  });

  it('says which things a read-and-touch job can use on the landing drawn now', () => {
    const one = (floor: number, id: string) => landingObjects(LANDINGS, floor).find((o) => o.id === id)!;
    // Floor 1's plant and bench are painted outside the safe core: touchable on no art yet.
    expect(touchable(one(1, 'plant'), { art: true, artHit: false })).toBe(false);
    expect(touchable(one(1, 'gear'), { art: true, artHit: false })).toBe(true);
    expect(touchable(one(20, 'ball'), { art: false, artHit: false })).toBe(true);
    expect(touchable(one(20, 'windmill'), { art: false, artHit: false })).toBe(false);
    // Floor 15's core takes the art's own hit.
    expect(touchable(one(15, 'core'), { art: true, artHit: true })).toBe(true);
    expect(touchable(one(15, 'core'), { art: true, artHit: false })).toBe(false);
  });

  it('smaller things sit in front of larger ones (they are drawn last)', () => {
    const { door } = doorOf(1180, 820);
    const placed = placeHotspots(targets(2, 'answer'), { door, background: { width: 1024, height: 1024 }, artHit: undefined, hero: null });
    const sizes = placed.map((p) => p.hit.width * p.hit.height);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(placed.at(-1)!.target.object.id).not.toBe('workbench');
  });

  it.each(SIZES)('%s: a reading card has room, in the cabin, clear of the controls and the help button (and of Lifty where there is room)', (_n, w, h) => {
    const layout = computeLayout({ width: w, height: h }, NO_INSETS);
    const card = readingCardBox(layout);
    expect(card.width).toBeGreaterThanOrEqual(Math.min(260, layout.cabin.width - 16));
    // Room for the title, two lines and CLOSE (more scrolls).
    expect(card.height).toBeGreaterThanOrEqual(Math.min(170, MIN_CARD_HEIGHT, layout.cabin.height - 90));
    expect(inside(card, layout.cabin)).toBe(true);
    const p = liftyPlacement(layout, 'default', { help: true });
    const roomy = card.y > p.bubble.y + p.bubble.height;
    const keep: [string, Box][] = [['panel', layout.panel], ['help', p.help], ['icon row', { x: layout.cabin.x, y: layout.cabin.y, width: layout.cabin.width, height: 64 }], ...(roomy ? ([['Lifty', p.figure], ["Lifty's words", p.bubble], ['indicator', sceneBoxes(layout, 'status').indicator]] as [string, Box][]) : [])];
    for (const [name, box] of keep) expect({ name, overlap: overlap(card, box) }).toEqual({ name, overlap: false });
  });
});
