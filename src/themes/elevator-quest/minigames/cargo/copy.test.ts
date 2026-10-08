// Cargo Commander's words on screen: every placeholder filled, the answer never said before SHOW ME,
// numbers and key words marked.
import type { CargoFlowView } from './cargoFlow';
import { applyAction, initialCargo, weigh, weighResult } from './cargoState';
import { cargoBrief } from '../../content/minigames';
import { CARGO_COPY, briefFor, cargoMarks, cueLine, hintLine, longestCue } from './copy';
import { missionFromItem, type CargoMission } from './mission';

const m = (prompt: Record<string, string | number>, key = 'k'): CargoMission => {
  const mission = missionFromItem({ activityId: 'cargo.x.solid', concept: 'twoDigit', prompt, answer: { mode: 'value', min: 1, max: 299 } }, key);
  if (!mission) throw new Error('no mission');
  return mission;
};
const CASES: [CargoMission, number][] = [
  [m({ kind: 'exactLoad', target: 61, parts: '12,23,38,45', partCount: 4 }), 61],
  [m({ kind: 'capacityRemaining', capacity: 80, loaded: 47 }), 33],
  [m({ kind: 'missingAmount', order: 92, have: 38 }), 54],
  [m({ kind: 'twoDeliveries', a: 37, b: 25 }), 62],
  [m({ kind: 'compare', a: 41, b: 76 }), 35],
  [m({ kind: 'twoStep', capacity: 90, a: 23, b: 38 }), 29],
];
const hasNumber = (text: string, n: number) => new RegExp(`\\b${n}\\b`).test(text);
const view = (mission: CargoMission, patch: Partial<CargoFlowView> = {}): CargoFlowView => ({ status: 'playing', mission, cargo: initialCargo(mission), helpOffer: null, hint: null, busy: false, notice: null, last: false, solved: 0, ...patch });

describe.each(CASES)('%#: %o', (mission, answer) => {
  it('the brief and the hints before SHOW ME fill every placeholder and never say the answer (unless it is a given)', () => {
    const givens = Object.values(mission.givens);
    const lines = [briefFor(CARGO_COPY, mission), hintLine(CARGO_COPY, mission, { kind: 'tensAndOnes', assistance: 'visualSupport', revealed: null }), hintLine(CARGO_COPY, mission, { kind: 'jumpStrategy', assistance: 'guided', revealed: null })];
    for (const line of lines) {
      expect(line).not.toMatch(/\{[a-zA-Z]+\}/);
      if (!givens.includes(answer) && !mission.crates.some((c) => c.weight === answer)) expect(hasNumber(line, answer)).toBe(false);
    }
    expect(lines[0]).not.toMatch(/—/);
  });

  it('the brief is the content loader\'s brief for the prompt', () => {
    expect(briefFor(CARGO_COPY, mission)).toBe(cargoBrief(mission.prompt)?.text);
  });

  it('SHOW ME names the load it put in', () => {
    const line = hintLine(CARGO_COPY, mission, { kind: 'showAnswer', assistance: 'demonstrated', revealed: answer });
    expect(hasNumber(line, answer)).toBe(true);
    expect(line).not.toMatch(/\{[a-zA-Z]+\}/);
  });

  it('after a miss Lifty says which way, and keeps the hint already given', () => {
    const filler = mission.kind !== 'exactLoad';
    let cargo = initialCargo(mission);
    cargo = filler ? applyAction(mission, cargo, { type: 'addSack' }) : applyAction(mission, cargo, { type: 'loadCrate', id: 'c1' });
    cargo = weighResult(mission, weigh(mission, cargo).state, false);
    const hint = { kind: 'tensAndOnes', assistance: 'visualSupport' as const, revealed: null };
    const line = cueLine(CARGO_COPY, view(mission, { cargo, hint }));
    expect(line.startsWith(cargo.readout?.result === 'heavy' ? CARGO_COPY.cues.tooHeavy : CARGO_COPY.cues.notEnough)).toBe(true);
    expect(line).toContain(CARGO_COPY.hints.tensAndOnes);
    expect(longestCue(CARGO_COPY, mission)).toBeGreaterThanOrEqual(line.length);
  });
});

it('marks numbers and the emphasis words, whole words only', () => {
  const text = 'Load the TOTAL: 37 kg and 25 kg. TOTALS 3x';
  const marked = cargoMarks(text, CARGO_COPY.emphasis).map(([a, b]) => text.slice(a, b));
  expect(marked).toEqual(['TOTAL', '37', '25']);
});

it('says what happens at each moment of a delivery', () => {
  const mission = CASES[1]![0];
  expect(cueLine(CARGO_COPY, view(mission))).toBe(CARGO_COPY.cues.start);
  expect(cueLine(CARGO_COPY, view(mission, { notice: 'resume' }))).toBe(CARGO_COPY.cues.resume);
  expect(cueLine(CARGO_COPY, view(mission, { cargo: { ...initialCargo(mission), phase: 'shipping' } }))).toBe(CARGO_COPY.cues.right);
  expect(cueLine(CARGO_COPY, view(mission, { cargo: { ...initialCargo(mission), phase: 'shipped' }, last: true }))).toBe(CARGO_COPY.cues.allDone);
  expect(cueLine(CARGO_COPY, { ...view(mission), status: 'done', mission: null, cargo: null })).toBe(CARGO_COPY.cues.allDone);
});
