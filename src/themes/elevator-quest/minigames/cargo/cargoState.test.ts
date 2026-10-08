import fs from 'node:fs';
import path from 'node:path';

import {
  EMPTY_LOAD,
  applyAction,
  canApply,
  canWeigh,
  committedValue,
  demonstrate,
  direction,
  gaugeView,
  initialCargo,
  loadFor,
  restoreCargo,
  saveCargo,
  scaleTotal,
  shipped,
  weigh,
  weighFailed,
  weighResult,
  type CargoAction,
  type CargoState,
} from './cargoState';
import { CARGO_KINDS, MAX_BOXES, MAX_SACKS, cargoKindOf, deliveryKey, missionFromItem as fromItem, type CargoItemLike, type CargoMission } from './mission';

const item = (concept: string, prompt: CargoItemLike['prompt'], answer?: CargoItemLike['answer']): CargoItemLike => ({ activityId: `cargo.${concept}`, concept, prompt, ...(answer ? { answer } : {}) });
let keys = 0;
const missionFromItem = (i: CargoItemLike, key = `k${(keys += 1)}`) => fromItem(i, key);
const must = (m: CargoMission | null): CargoMission => {
  if (!m) throw new Error('no mission');
  return m;
};
const run = (m: CargoMission, s: CargoState, actions: CargoAction[]) => actions.reduce((acc, a) => applyAction(m, acc, a), s);
const times = (n: number, a: CargoAction): CargoAction[] => Array.from({ length: n }, () => a);
const fill = (m: CargoMission, sacks: number, boxes: number) => run(m, initialCargo(m), [...times(sacks, { type: 'addSack' }), ...times(boxes, { type: 'addBox' })]);

const exact = must(missionFromItem(item('exactLoad', { target: 57, crates: '23,14,34,19' })));
const capacity = must(missionFromItem(item('capacityRemaining', { capacity: 80, loaded: 47 })));
const missing = must(missionFromItem(item('missingAmount', { order: 92, have: 38 })));
const two = must(missionFromItem(item('twoDeliveries', { a: 37, b: 25 })));
const compare = must(missionFromItem(item('compare', { a: 41, b: 76 })));

describe('cargo missions from engine items', () => {
  it('reads every kind, from the concept or a kind field', () => {
    for (const k of CARGO_KINDS) expect(cargoKindOf({ concept: k, prompt: {} })).toBe(k);
    expect(cargoKindOf({ concept: 'quantity.twoDigit.compare', prompt: {} })).toBe('compare');
    expect(cargoKindOf({ concept: 'twoDigitCargo', prompt: { kind: 'missingAmount' } })).toBe('missingAmount');
    expect(cargoKindOf({ concept: 'positionAfterMove', prompt: {} })).toBeNull();
    expect(missionFromItem(item('positionAfterMove', { start: 3 }))).toBeNull();
  });

  it('reads crate lists in either shape and refuses an item without its givens', () => {
    const numbered = must(missionFromItem(item('exactLoad', { target: 30, crate1: 10, crate2: 20, crate3: 5 })));
    expect(numbered.crates.map((c) => c.weight)).toEqual([10, 20, 5]);
    expect(exact.crates.map((c) => c.weight)).toEqual([23, 14, 34, 19]);
    expect(missionFromItem(item('exactLoad', { target: 30 }))).toBeNull();
    expect(missionFromItem(item('capacityRemaining', { capacity: 80 }))).toBeNull();
  });

  it('never puts the answer on the gauge for two deliveries, and the scale top never points at it', () => {
    expect(two.mark).toBeNull();
    expect(two.capacity).toBeNull();
    // Same bigger order, different totals: the same scale.
    const other = must(missionFromItem(item('twoDeliveries', { a: 37, b: 12 })));
    expect(other.scaleMax).toBe(two.scaleMax);
    expect(two.givens).toEqual({ a: 37, b: 25 });
  });

  it('marks only givens: the target, the order, the heavier pallet, the capacity line', () => {
    expect(exact.mark).toEqual({ value: 57, role: 'target' });
    expect(missing.mark).toEqual({ value: 92, role: 'order' });
    expect(compare.mark).toEqual({ value: 76, role: 'pallet' });
    expect(compare.pallets).toEqual({ heavy: 76, light: 41 });
    expect(capacity.capacity).toBe(80);
    expect(capacity.mark).toBeNull();
    for (const m of [exact, capacity, missing, two, compare]) expect(m.scaleMax % 50).toBe(0);
  });

  it('a later delivery with the same givens has its own save key', () => {
    expect(deliveryKey('sig-1', 0)).not.toBe(deliveryKey('sig-1', 1));
    const a = must(missionFromItem(item('capacityRemaining', { capacity: 80, loaded: 47 }), deliveryKey('sig-1', 0)));
    expect(a.key).toBe('sig-1#0');
  });
});

describe('the committed value per kind', () => {
  it('exactLoad: the crates chosen, nothing else', () => {
    const s = run(exact, initialCargo(exact), [{ type: 'loadCrate', id: 'c1' }, { type: 'loadCrate', id: 'c3' }]);
    expect(committedValue(exact, s.load)).toBe(57);
    expect(scaleTotal(exact, s.load)).toBe(57);
    expect(direction(exact, s.load)).toBe('even');
  });

  it('capacityRemaining: the filler on top of the load aboard (47 + 33 = 80, with regrouping in the ones)', () => {
    const s = fill(capacity, 3, 3);
    expect(committedValue(capacity, s.load)).toBe(33);
    expect(scaleTotal(capacity, s.load)).toBe(80);
    expect(direction(capacity, s.load)).toBe('even');
  });

  it('missingAmount: the filler is the missing part (92 - 38 = 54)', () => {
    const s = fill(missing, 5, 4);
    expect(committedValue(missing, s.load)).toBe(54);
    expect(direction(missing, s.load)).toBe('even');
  });

  it('twoDeliveries: the whole load, and twelve ones still count as a ten and two (37 + 25 = 62)', () => {
    const canonical = fill(two, 6, 2);
    const regrouped = fill(two, 5, 12);
    expect(committedValue(two, canonical.load)).toBe(62);
    expect(committedValue(two, regrouped.load)).toBe(62);
  });

  it('twoStep: the filler on top of two orders aboard, up to the line (90 - 23 - 38 = 29)', () => {
    const m = must(missionFromItem(item('twoDigit', { kind: 'twoStep', capacity: 90, a: 23, b: 38 })));
    expect(m.basePallets).toEqual([23, 38]);
    expect(m.capacity).toBe(90);
    const s = fill(m, 2, 9);
    expect(committedValue(m, s.load)).toBe(29);
    expect(scaleTotal(m, s.load)).toBe(90);
  });

  it('reads the engine generator prompt as it is (concept twoDigit, kind field, crates list)', () => {
    const m = must(missionFromItem(item('twoDigit', { kind: 'exactLoad', target: 61, parts: '12,23,38,45', partCount: 4 })));
    expect(m.kind).toBe('exactLoad');
    expect(loadFor(m, 61)?.crates.slice().sort()).toEqual(['c2', 'c3']);
  });

  it('compare: the filler added to the lighter pallet is the difference (76 - 41 = 35)', () => {
    const s = fill(compare, 3, 5);
    expect(committedValue(compare, s.load)).toBe(35);
    expect(scaleTotal(compare, s.load)).toBe(76);
  });
});

describe('loading limits', () => {
  it('sacks and boxes stop at what the freight floor takes', () => {
    const full = fill(two, MAX_SACKS + 3, MAX_BOXES + 3);
    expect(full.load.sacks).toBe(MAX_SACKS);
    expect(full.load.boxes).toBe(MAX_BOXES);
    expect(canApply(two, full, { type: 'addSack' })).toBe(false);
    expect(canApply(two, full, { type: 'addBox' })).toBe(false);
  });

  it('never goes past the activity answer range', () => {
    const m = must(missionFromItem(item('twoDeliveries', { a: 30, b: 20 }, { mode: 'value', min: 0, max: 60 })));
    const s = fill(m, 9, 9);
    expect(committedValue(m, s.load)).toBeLessThanOrEqual(60);
    expect(s.load.sacks).toBe(6);
    expect(s.load.boxes).toBe(0);
  });

  it('invalid combinations do nothing: unknown crates, a crate twice, removing from empty, filler in a crate job', () => {
    const s0 = initialCargo(exact);
    expect(applyAction(exact, s0, { type: 'loadCrate', id: 'nope' })).toBe(s0);
    const s1 = applyAction(exact, s0, { type: 'loadCrate', id: 'c2' });
    expect(applyAction(exact, s1, { type: 'loadCrate', id: 'c2' })).toBe(s1);
    expect(applyAction(exact, s1, { type: 'unloadCrate', id: 'c4' })).toBe(s1);
    expect(applyAction(exact, s1, { type: 'addSack' })).toBe(s1);
    const f0 = initialCargo(capacity);
    expect(applyAction(capacity, f0, { type: 'removeSack' })).toBe(f0);
    expect(applyAction(capacity, f0, { type: 'removeBox' })).toBe(f0);
    expect(applyAction(capacity, f0, { type: 'loadCrate', id: 'c1' })).toBe(f0);
  });

  it('over the capacity line is a warning on the gauge, and loading stays possible (the learner finds out on WEIGH)', () => {
    const s = fill(capacity, 4, 0);
    expect(scaleTotal(capacity, s.load)).toBe(87);
    expect(gaugeView(capacity, s.load).over).toBe(true);
    expect(canWeigh(capacity, s)).toBe(true);
  });

  it('the gauge moves with every piece and counts whole tens', () => {
    const g0 = gaugeView(capacity, EMPTY_LOAD);
    const g1 = gaugeView(capacity, fill(capacity, 1, 4).load);
    expect(g1.fraction).toBeGreaterThan(g0.fraction);
    expect(g0.tens).toBe(4);
    expect(g1.tens).toBe(6); // 47 + 14 = 61
    expect(gaugeView(capacity, fill(capacity, MAX_SACKS, MAX_BOXES).load).fraction).toBe(1);
  });
});

describe('WEIGH', () => {
  it('an empty load can never be weighed', () => {
    for (const m of [exact, capacity, missing, two, compare]) {
      expect(canWeigh(m, initialCargo(m))).toBe(false);
      expect(weigh(m, initialCargo(m)).submit).toBeNull();
    }
  });

  it('the first WEIGH of a load submits its value; the reading appears only then', () => {
    const s = fill(capacity, 3, 0);
    expect(s.readout).toBeNull();
    const step = weigh(capacity, s);
    expect(step.submit).toBe(30);
    expect(step.state.phase).toBe('weighing');
    expect(step.state.readout).toEqual({ total: 77, value: 30, result: null });
    // Nothing moves while the answer is in flight.
    expect(applyAction(capacity, step.state, { type: 'addBox' })).toBe(step.state);
    expect(weigh(capacity, step.state).submit).toBeNull();
  });

  it('a wrong WEIGH shows the exact total and which way to go, then the learner revises without penalty', () => {
    let s = weighResult(capacity, weigh(capacity, fill(capacity, 3, 0)).state, false);
    expect(s.phase).toBe('loading');
    expect(s.readout).toEqual({ total: 77, value: 30, result: 'light' });
    s = run(capacity, s, times(3, { type: 'addBox' }));
    expect(s.readout).toBeNull(); // the scale must weigh the new load
    expect(s.revisions).toBe(3); // recorded, never used against the learner
    const again = weigh(capacity, s);
    expect(again.submit).toBe(33);
    expect(weighResult(capacity, again.state, true).phase).toBe('shipping');
  });

  it('too heavy says heavy', () => {
    const s = weighResult(compare, weigh(compare, fill(compare, 4, 0)).state, false);
    expect(s.readout?.result).toBe('heavy');
    expect(s.readout?.total).toBe(81);
  });

  it('the same value is never sent twice: weighing it again only shows the reading', () => {
    let s = weighResult(two, weigh(two, fill(two, 5, 0)).state, false);
    s = applyAction(two, s, { type: 'addBox' });
    s = applyAction(two, s, { type: 'removeBox' });
    const step = weigh(two, s);
    expect(step.submit).toBeNull();
    expect(step.state.readout).toEqual({ total: 50, value: 50, result: 'light' });
    expect(step.state.weighed).toEqual([50]);
  });

  it('exactLoad: two crate sets with the same total are the same answer', () => {
    const m = must(missionFromItem(item('exactLoad', { target: 43, crates: '10,25,20,15,33' })));
    let s = run(m, initialCargo(m), [{ type: 'loadCrate', id: 'c1' }, { type: 'loadCrate', id: 'c2' }]); // 10 + 25
    s = weighResult(m, weigh(m, s).state, false);
    expect(s.readout?.result).toBe('light');
    s = run(m, s, [{ type: 'unloadCrate', id: 'c1' }, { type: 'unloadCrate', id: 'c2' }, { type: 'loadCrate', id: 'c3' }, { type: 'loadCrate', id: 'c4' }]); // 20 + 15
    expect(committedValue(m, s.load)).toBe(35);
    expect(weigh(m, s).submit).toBeNull();
    s = run(m, s, [{ type: 'unloadCrate', id: 'c3' }, { type: 'unloadCrate', id: 'c4' }, { type: 'loadCrate', id: 'c5' }, { type: 'loadCrate', id: 'c1' }]); // 33 + 10
    expect(weigh(m, s).submit).toBe(43);
  });

  it('a submit that failed can be weighed again', () => {
    const step = weigh(missing, fill(missing, 5, 4));
    const s = weighFailed(step.state);
    expect(s.phase).toBe('loading');
    expect(s.weighed).toEqual([]);
    expect(weigh(missing, s).submit).toBe(54);
  });

  it('shipping ends in shipped, which only the learner leaves (NEXT DELIVERY)', () => {
    const s = weighResult(exact, weigh(exact, run(exact, initialCargo(exact), [{ type: 'loadCrate', id: 'c1' }, { type: 'loadCrate', id: 'c3' }])).state, true);
    expect(shipped(s).phase).toBe('shipped');
    expect(shipped(shipped(s)).phase).toBe('shipped');
    expect(applyAction(exact, shipped(s), { type: 'unloadCrate', id: 'c1' }).phase).toBe('shipped');
  });
});

describe('SHOW ME', () => {
  it('builds the shown value as tens and ones, or as the crates that make it', () => {
    expect(loadFor(capacity, 33)).toEqual({ crates: [], sacks: 3, boxes: 3 });
    expect(loadFor(exact, 57)?.crates.slice().sort()).toEqual(['c1', 'c3']);
    expect(loadFor(exact, 1000)).toBeNull();
    const s = demonstrate(capacity, fill(capacity, 9, 9), 33);
    expect(s.load).toEqual({ crates: [], sacks: 3, boxes: 3 });
    expect(s.shown).toBe(true);
    expect(s.readout).toBeNull(); // the learner still weighs it
  });
});

describe('saving and resuming', () => {
  it('a half-loaded delivery resumes as it was', () => {
    const s = weighResult(missing, weigh(missing, fill(missing, 4, 2)).state, false);
    const back = restoreCargo(JSON.parse(JSON.stringify(saveCargo(applyAction(missing, s, { type: 'addBox' })))), missing);
    expect(back.load).toEqual({ crates: [], sacks: 4, boxes: 3 });
    expect(back.weighed).toEqual([42]);
    expect(back.phase).toBe('loading');
    expect(back.readout).toBeNull();
  });

  it('another delivery, a broken save or a load that does not fit restarts it empty', () => {
    const fresh = initialCargo(missing);
    expect(restoreCargo(null, missing)).toEqual(fresh);
    expect(restoreCargo({ v: 1, junk: true }, missing)).toEqual(fresh);
    expect(restoreCargo(saveCargo(fill(capacity, 2, 2)), missing)).toEqual(fresh);
    const bad = { ...saveCargo(fill(missing, 2, 2)), load: { crates: ['c1'], sacks: 2, boxes: 2 } };
    expect(restoreCargo(bad, missing)).toEqual(fresh);
    const tooMuch = { ...saveCargo(initialCargo(exact)), load: { crates: ['c1', 'c1'], sacks: 0, boxes: 0 } };
    expect(restoreCargo(tooMuch, exact)).toEqual(initialCargo(exact));
  });

  it('a weigh in flight is forgotten, a shipped delivery is not resumed', () => {
    const inFlight = weigh(two, fill(two, 6, 2)).state;
    const back = restoreCargo(saveCargo(inFlight), two);
    expect(back.phase).toBe('loading');
    expect(back.weighed).toEqual([]);
    const done = weighResult(two, inFlight, true);
    expect(restoreCargo(saveCargo(done), two)).toEqual(initialCargo(two));
  });
});

it('the cargo logic modules stay render-free (no React, no renderer, no clock)', () => {
  for (const f of ['cargoState.ts', 'mission.ts', 'cargoFlow.ts', 'copy.ts', 'screenLayout.ts', 'gaugeGeometry.ts', 'cargoArt.ts']) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    const imports = src.match(/from '[^']+'/g) ?? [];
    expect(imports.filter((i) => /react|@shopify|expo/.test(i))).toEqual([]);
    expect(src).not.toMatch(/Date\.now|Math\.random/);
  }
});
