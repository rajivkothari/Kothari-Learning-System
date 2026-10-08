import { createMockSession, type MockItem, type MockSession } from '../testing/mockSession';
import { GAUGE_TICK_GAP_MS, createCargoFlow, type CargoFlow } from './cargoFlow';

const CARGO_LADDER = [
  { stepId: 'tens', kind: 'tensAndOnes', assistance: 'clue' as const },
  { stepId: 'jump', kind: 'jumpStrategy', assistance: 'visualSupport' as const },
  { stepId: 'show', kind: 'showAnswer', assistance: 'demonstrated' as const },
];
const SPEC = { mode: 'value' as const, min: 1, max: 199 };
const capacity: MockItem = { concept: 'twoDigit', prompt: { kind: 'capacityRemaining', capacity: 80, loaded: 47 }, answer: 33, answerSpec: SPEC };
const exact: MockItem = { concept: 'twoDigit', prompt: { kind: 'exactLoad', target: 61, parts: '12,23,38,45', partCount: 4 }, answer: 61, answerSpec: SPEC };
const two: MockItem = { concept: 'twoDigit', prompt: { kind: 'twoDeliveries', a: 37, b: 25 }, answer: 62, answerSpec: SPEC };

function setup(items: MockItem[], extra: Partial<Parameters<typeof createMockSession>[0]> = {}, reduced = false) {
  const session = createMockSession({ gameId: 'cargo-commander', items, ladder: CARGO_LADDER, ...extra });
  const played: string[] = [];
  const loops: string[] = [];
  let t = 0;
  const pending: (() => void)[] = [];
  const flow = createCargoFlow({
    session,
    sound: { play: (s) => played.push(s), loop: (s, on) => loops.push(`${s}:${on ? 'on' : 'off'}`) },
    reducedMotion: () => reduced,
    now: () => t,
    schedule: (fn) => {
      pending.push(fn);
      return () => {
        const i = pending.indexOf(fn);
        if (i >= 0) pending.splice(i, 1);
      };
    },
  });
  return { session, flow, played, loops, advance: (ms: number) => (t += ms), runSaves: () => pending.splice(0).forEach((f) => f()) };
}

const submits = (s: MockSession) => s.calls.filter((c) => c.method === 'submit');
const fill = (flow: CargoFlow, sacks: number, boxes: number) => {
  for (let i = 0; i < sacks; i += 1) flow.act({ type: 'addSack' });
  for (let i = 0; i < boxes; i += 1) flow.act({ type: 'addBox' });
};

describe('evidence integrity', () => {
  it('loading, unloading and saving never submit; only WEIGH does, once per new load value', async () => {
    const { session, flow, runSaves } = setup([capacity]);
    await flow.start();
    fill(flow, 4, 5);
    flow.act({ type: 'removeSack' });
    flow.act({ type: 'removeBox' });
    flow.act({ type: 'removeBox' });
    runSaves();
    await flow.flush();
    expect(submits(session)).toEqual([]);
    expect(session.recorded).toEqual([]);
    await flow.weigh(); // 33
    expect(submits(session).map((c) => c.args[0])).toEqual([{ mode: 'value', value: 33 }]);
    expect(session.recorded).toEqual([{ key: expect.any(String), correct: true, evidence: 'independent' }]);
  });

  it('an empty load is never weighed', async () => {
    const { session, flow } = setup([capacity]);
    await flow.start();
    await flow.weigh();
    flow.act({ type: 'addBox' });
    flow.act({ type: 'removeBox' });
    await flow.weigh();
    expect(submits(session)).toEqual([]);
  });

  it('a wrong WEIGH shows the total and a direction; the same value again sends nothing; a revised load is the next try', async () => {
    const { session, flow } = setup([capacity]);
    await flow.start();
    fill(flow, 3, 0);
    await flow.weigh();
    expect(flow.view().cargo?.readout).toEqual({ total: 77, value: 30, result: 'light' });
    expect(flow.view().helpOffer?.offered).toBe(true);
    flow.act({ type: 'addBox' });
    flow.act({ type: 'removeBox' });
    await flow.weigh();
    expect(submits(session)).toHaveLength(1);
    expect(flow.view().cargo?.readout?.result).toBe('light');
    fill(flow, 0, 3);
    await flow.weigh();
    expect(submits(session).map((c) => (c.args[0] as { value: number }).value)).toEqual([30, 33]);
    // The engine decides what a right answer after a miss counts as; never independent.
    expect(session.recorded.at(-1)).toEqual({ key: expect.any(String), correct: true, evidence: expect.not.stringMatching(/^independent$/) });
    expect(flow.view().cargo?.phase).toBe('shipping');
  });

  it('after too many misses a fresh delivery replaces the load (nothing carried over)', async () => {
    const { flow, session } = setup([two], { freshAfter: 2 });
    await flow.start();
    const firstKey = flow.view().mission?.key;
    fill(flow, 5, 0);
    await flow.weigh();
    flow.act({ type: 'addSack' });
    await flow.weigh();
    expect(flow.view().notice).toBe('fresh');
    expect(flow.view().mission?.key).not.toBe(firstKey);
    expect(flow.view().cargo?.load).toEqual({ crates: [], sacks: 0, boxes: 0 });
    expect(session.recorded).toEqual([{ key: expect.any(String), correct: false, evidence: 'incorrect' }]);
  });
});

describe('help', () => {
  it('hints first, then SHOW ME puts the right load in; weighing it is demonstrated, never independent', async () => {
    const { session, flow } = setup([exact]);
    await flow.start();
    await flow.help();
    expect(flow.view().hint).toEqual({ kind: 'tensAndOnes', assistance: 'clue', revealed: null });
    expect(flow.view().cargo?.load.crates).toEqual([]);
    await flow.help();
    expect(flow.view().hint?.kind).toBe('jumpStrategy');
    await flow.help();
    expect(flow.view().hint).toEqual({ kind: 'showAnswer', assistance: 'demonstrated', revealed: 61 });
    expect(flow.view().cargo?.load.crates.slice().sort()).toEqual(['c2', 'c3']);
    expect(flow.view().helpOffer).toBeNull();
    expect(submits(session)).toEqual([]); // the learner still presses WEIGH
    await flow.weigh();
    expect(session.recorded).toEqual([{ key: expect.any(String), correct: true, evidence: 'demonstrated' }]);
  });
});

describe('the run and the next delivery are child-paced', () => {
  it('a right load ships, NEXT DELIVERY waits for the learner, then the next item comes', async () => {
    const { session, flow, played, loops } = setup([capacity, two]);
    await flow.start();
    fill(flow, 3, 3);
    await flow.weigh();
    expect(flow.view().cargo?.phase).toBe('shipping');
    expect(loops).toEqual(['freightMove:on']);
    expect(session.calls.filter((c) => c.method === 'next')).toEqual([]);
    flow.act({ type: 'addBox' }); // nothing moves during the run
    expect(flow.view().cargo?.load.boxes).toBe(3);
    flow.arrived();
    expect(loops).toEqual(['freightMove:on', 'freightMove:off']);
    expect(played).toContain('deliveryComplete');
    expect(flow.view().cargo?.phase).toBe('shipped');
    expect(session.calls.filter((c) => c.method === 'next')).toEqual([]);
    await flow.next();
    expect(flow.view().mission?.kind).toBe('twoDeliveries');
    expect(flow.view().cargo?.load).toEqual({ crates: [], sacks: 0, boxes: 0 });
    expect(flow.view().hint).toBeNull();
  });

  it('the last delivery finishes the game after its run', async () => {
    const { session, flow } = setup([two]);
    await flow.start();
    fill(flow, 6, 2);
    await flow.weigh();
    expect(flow.view().last).toBe(true);
    expect(session.finished).toBe(false);
    flow.arrived();
    await flow.next();
    expect(session.finished).toBe(true);
    expect(flow.view().status).toBe('done');
  });

  it('Reduced Motion: no travel sound, the same states', async () => {
    const { flow, loops, played } = setup([two], {}, true);
    await flow.start();
    fill(flow, 6, 2);
    await flow.weigh();
    flow.arrived();
    expect(loops.filter((l) => l.endsWith(':on'))).toEqual([]);
    expect(played).toContain('deliveryComplete');
    expect(flow.view().cargo?.phase).toBe('shipped');
  });
});

describe('sound', () => {
  it('a crate placed or picked up sounds at once; the gauge tick is rate-limited', async () => {
    const { flow, played, advance } = setup([capacity]);
    await flow.start();
    flow.act({ type: 'addSack' });
    flow.act({ type: 'addSack' });
    flow.act({ type: 'removeSack' });
    expect(played.filter((s) => s === 'cratePlace')).toHaveLength(2);
    expect(played.filter((s) => s === 'cratePick')).toHaveLength(1);
    expect(played.filter((s) => s === 'gaugeTick')).toHaveLength(1);
    advance(GAUGE_TICK_GAP_MS);
    flow.act({ type: 'addBox' });
    expect(played.filter((s) => s === 'gaugeTick')).toHaveLength(2);
    // A tap that changes nothing makes no sound.
    const n = played.length;
    flow.act({ type: 'removeBox' });
    flow.act({ type: 'removeBox' });
    expect(played.slice(n)).toEqual(['cratePick']); // the first takes the box off (the tick is inside its gap), the second does nothing
  });
});

describe('save and resume (gameplay only)', () => {
  it('a half-loaded delivery is saved and comes back as it was', async () => {
    const first = setup([capacity, two]);
    await first.flow.start();
    fill(first.flow, 2, 4);
    first.runSaves();
    await Promise.resolve();
    const saved = first.session.saved;
    expect(saved).toMatchObject({ v: 1, cargo: { load: { sacks: 2, boxes: 4 } } });
    first.flow.dispose();
    const again = setup([capacity, two], { resumed: { state: saved } });
    await again.flow.start();
    expect(again.flow.view().cargo?.load).toEqual({ crates: [], sacks: 2, boxes: 4 });
    expect(again.flow.view().notice).toBe('resume');
    expect(submits(again.session)).toEqual([]);
  });

  it('a save for another delivery restarts the one on screen safely (empty)', async () => {
    const first = setup([capacity, two]);
    await first.flow.start();
    fill(first.flow, 2, 4);
    await first.flow.flush();
    const again = setup([capacity, two], { resumed: { state: first.session.saved, solved: 1 } });
    await again.flow.start();
    expect(again.flow.view().cargo?.load).toEqual({ crates: [], sacks: 0, boxes: 0 });
    expect(again.flow.view().notice).toBeNull();
  });

  it('a weigh in flight when the app stopped is not trusted: the load comes back, ready to weigh', async () => {
    const first = setup([capacity], { latencyMs: 5 });
    await first.flow.start();
    fill(first.flow, 3, 3);
    const pending = first.flow.weigh();
    await first.flow.flush();
    const saved = first.session.saved;
    await pending;
    const again = setup([capacity], { resumed: { state: saved } });
    await again.flow.start();
    expect(again.flow.view().cargo?.phase).toBe('loading');
    expect(again.flow.view().cargo?.load).toEqual({ crates: [], sacks: 3, boxes: 3 });
  });
});
