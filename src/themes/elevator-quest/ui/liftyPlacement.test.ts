// Lifty in the scene: at every tested window size and in every context, Lifty's figure, words
// and help button stay clear of the floor buttons, the indicator, the doorway, the shaft map, the
// cargo bay and the test-run board, and every line Lifty says fits the bubble.
import { answerCorrectly, openSession, settled, solve, tempDir, virtualTime } from '../testing/headless';
import { computeLayout, MIN_BUTTON, type Box } from './layout';
import { HELP_SIZE, TINY_CABIN, fitLine, liftyContext, liftyMoveMs, liftyPlacement, maintenanceReadoutBox, sceneBoxes, type LiftyContext } from './liftyPlacement';
import { cabinGeometry } from './cabinGeometry';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const SIZES: [string, number, number][] = [
  ['Fire HD 8 landscape', 960, 600],
  ['Fire HD 8 portrait', 600, 960],
  ['Fire HD 10 landscape', 1280, 800],
  ['iPad landscape', 1180, 820],
  ['iPad portrait', 820, 1180],
  ['iPad mini landscape', 1133, 744],
  ['iPad Pro 12.9 landscape', 1366, 1024],
  ['iPad split 2/3 landscape', 694, 768],
  ['iPad split 1/2', 590, 820],
  ['iPad split 1/3', 375, 820],
  ['iPad Slide Over', 320, 1024],
  ['narrow iPad window', 504, 820],
];
const CONTEXTS: LiftyContext[] = ['default', 'panelHelp', 'shaftMap', 'cargo', 'rescue', 'completion'];

const overlap = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
const inside = (a: Box, b: Box) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5;

describe('Lifty placement', () => {
  it.each(SIZES)('%s (%i x %i): Lifty never covers a protected control or representation', (_n, w, h) => {
    const layout = computeLayout({ width: w, height: h }, NO_INSETS);
    for (const context of CONTEXTS) {
      for (const shaftMode of ['status', 'map', 'numberLine'] as const) {
        const scene = sceneBoxes(layout, shaftMode, context);
        // The one documented exception: a tiny cabin during cargo puts Lifty over the indicator.
        const tinyCargo = context === 'cargo' && layout.cabin.width < TINY_CABIN;
        const p = liftyPlacement(layout, context);
        const protectedBoxes: [string, Box][] = [
          ['panel', layout.panel],
          ...(tinyCargo ? [] : ([['indicator', scene.indicator]] as [string, Box][])),
          ['doorway', scene.doorway],
          ...(context === 'cargo' || context === 'rescue' ? [] : ([['shaft map', scene.shaft]] as [string, Box][])),
          ...(context === 'cargo' ? ([['cargo bay', scene.cargo]] as [string, Box][]) : []),
          ...(context === 'rescue' ? ([['test-run board', scene.rescue]] as [string, Box][]) : []),
        ];
        for (const [part, box] of [['figure', p.figure], ['bubble', p.bubble], ['help', p.help]] as const) {
          expect({ context, part, inCabin: inside(box, layout.cabin) }).toEqual({ context, part, inCabin: true });
          for (const [name, prot] of protectedBoxes) expect({ context, shaftMode, part, covers: name, overlap: overlap(box, prot) }).toEqual({ context, shaftMode, part, covers: name, overlap: false });
        }
        expect(overlap(p.figure, p.bubble) || overlap(p.help, p.bubble) || overlap(p.help, p.figure)).toBe(false);
        expect(p.help.width).toBeGreaterThanOrEqual(MIN_BUTTON);
        expect(p.help.height).toBeGreaterThanOrEqual(MIN_BUTTON);
        expect(p.bubble.width).toBeGreaterThanOrEqual(150);
      }
    }
  });

  it.each(SIZES)('%s: the help button stays in one place in every context', (_n, w, h) => {
    const layout = computeLayout({ width: w, height: h }, NO_INSETS);
    const spots = new Set(CONTEXTS.map((c) => JSON.stringify(liftyPlacement(layout, c).help)));
    expect(spots.size).toBe(1);
  });

  it('turns toward what the help is about, and back to the learner afterwards', () => {
    const layout = computeLayout({ width: 1180, height: 820 }, NO_INSETS);
    const near = liftyPlacement(layout, 'default');
    const panel = liftyPlacement(layout, 'panelHelp');
    expect(near.side).toBe('left');
    expect(panel.side).toBe('right');
    expect(panel.attends).toBe('panel');
    expect(panel.figure.x).toBeGreaterThan(near.figure.x);
    expect(liftyPlacement(layout, 'shaftMap').attends).toBe('shaft');
    expect(liftyPlacement(layout, 'cargo').attends).toBe('below');
    expect(HELP_SIZE.height).toBeGreaterThanOrEqual(MIN_BUTTON);
  });

  it.each(SIZES)('%s: the maintenance readout never covers the door opening, the panel or the help button', (_n, w, h) => {
    const layout = computeLayout({ width: w, height: h }, NO_INSETS);
    const r = maintenanceReadoutBox(layout);
    if (!r) return;
    const door = cabinGeometry(layout.cabin, layout.bandHeight).door;
    expect(overlap(r, { x: layout.cabin.x + door.x, y: layout.cabin.y + door.y, width: door.w, height: door.h })).toBe(false);
    expect(overlap(r, layout.panel)).toBe(false);
    expect(overlap(r, sceneBoxes(layout, 'status').shaft)).toBe(false);
    expect(overlap(r, liftyPlacement(layout, 'default').figure)).toBe(false);
    expect(inside(r, layout.cabin)).toBe(true);
  });

  it('keeps the readout on a wide screen and drops it where the doorway would be covered', () => {
    expect(maintenanceReadoutBox(computeLayout({ width: 1180, height: 820 }, NO_INSETS))).not.toBeNull();
    expect(maintenanceReadoutBox(computeLayout({ width: 375, height: 820 }, NO_INSETS))).toBeNull();
  });

  it('moves at once under reduced motion, briefly otherwise', () => {
    expect(liftyMoveMs(true)).toBe(0);
    expect(liftyMoveMs(false)).toBeGreaterThan(0);
    expect(liftyMoveMs(false)).toBeLessThanOrEqual(400);
  });

  it('picks the context from the game state', () => {
    const base = { stage: 'task' as const, shaftMode: 'status' as const, highlights: [] as number[], countAlong: null, task: null };
    expect(liftyContext(base)).toBe('default');
    expect(liftyContext({ ...base, highlights: [7] })).toBe('panelHelp');
    expect(liftyContext({ ...base, shaftMode: 'numberLine' })).toBe('shaftMap');
    expect(liftyContext({ ...base, stage: 'cargo' })).toBe('cargo');
    expect(liftyContext({ ...base, stage: 'rescue' })).toBe('rescue');
    expect(liftyContext({ ...base, stage: 'complete' })).toBe('completion');
  });
});

describe("Lifty's words fit", () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('every line said in a real playthrough (misses, help, a test run, cargo, finale, resume) fits at every size', async () => {
    // Each line with the context it was said in, and whether the help button was on screen.
    const lines = new Map<string, { context: LiftyContext; help: boolean }>();
    const note = (v: ReturnType<typeof s.view>) => {
      const helpSlot = v.help !== null || v.stage === 'success'; // the slot holds NEXT JOB during a success
      const key = `${liftyContext(v)}|${helpSlot}|${v.lifty.line}`;
      if (v.lifty.line && !lines.has(key)) lines.set(key, { context: liftyContext(v), help: helpSlot });
    };
    const time = virtualTime();
    let s = await openSession(tmp.file, time, { instanceId: 'lines' });
    const listen = () => s.director.subscribe(note);
    let stop = listen();
    note(s.view());
    s.director.pressDoorOpen();
    await time.runUntil(() => settled(s)() && s.view().stage === 'task');
    // Five misses on the first job: feedback, help offers, then the test run.
    const answered = () => s.log.entries().filter((e) => e.kind === 'answer').length;
    for (let i = 0; i < 5 && s.view().stage === 'task'; i++) {
      const right = solve(s);
      const before = answered();
      s.director.pressFloor(right >= 19 ? right - 2 : right + 2);
      await time.runUntil(() => answered() > before && !s.view().saving && (s.view().stage === 'rescue' || (s.view().stage === 'task' && settled(s)())));
      s.director.requestHelp();
      await time.runUntil(() => !s.view().saving);
    }
    await time.runUntil(() => s.view().stage === 'rescue');
    const r = s.view().rescue!;
    const sign = r.direction === 'down' ? -1 : 1;
    s.director.rescueTap(r.origin); // a wrong first tap
    for (let k = 1; k <= r.steps; k++) s.director.rescueTap(r.origin + sign * k);
    s.director.rescueTap(r.origin + sign * r.steps);
    await time.runUntil(() => s.view().stage === 'task' && settled(s)());
    // Resume mid-mission (the "welcome back" line joins the job line).
    stop();
    s.director.dispose();
    await s.db.close();
    s = await openSession(tmp.file, time, { instanceId: 'lines' });
    stop = listen();
    note(s.view());
    await time.runUntil(settled(s));
    while (s.view().stage !== 'finale') {
      if (s.view().stage === 'cargo') {
        s.director.loadCrate();
        s.director.pressDoorClose(); // an underload first
        await time.runUntil(() => !s.view().saving);
      }
      await answerCorrectly(s);
    }
    s.director.pressFloor(15);
    await time.runUntil(() => s.view().stage === 'freeRide');
    stop();
    s.director.dispose();
    await s.db.close();

    const said = [...lines].map(([key, at]) => ({ ...at, line: key.split('|').slice(2).join('|') }));
    expect(new Set(said.map((x) => x.line)).size).toBeGreaterThan(15);
    expect(new Set(said.map((x) => x.context))).toEqual(new Set(CONTEXTS));
    for (const [name, w, h] of SIZES) {
      const layout = computeLayout({ width: w, height: h }, NO_INSETS);
      for (const { context, help, line } of said) {
        const bubble = liftyPlacement(layout, context, { help }).bubble;
        expect({ size: name, context, line, fits: fitLine(line, bubble) !== null }).toEqual({ size: name, context, line, fits: true });
      }
    }
  }, 60_000);
});
