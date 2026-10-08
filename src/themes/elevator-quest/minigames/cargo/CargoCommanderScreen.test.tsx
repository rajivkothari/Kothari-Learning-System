/**
 * @jest-environment node
 */
// Cargo Commander's screen over FW's mock session: only WEIGH records anything, the toolkit calls
// nothing, the exact reading appears only on WEIGH, BACK saves first, every control is labelled.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { createMockSession, type MockItem } from '../testing/mockSession';
import { textSizes } from '../../ui/textRoles';
import { CargoCommanderScreen } from './CargoCommanderScreen';
import { CARGO_COPY } from './copy';

const SPEC = { mode: 'value' as const, min: 1, max: 169 };
const LADDER = [
  { stepId: 'tens-and-ones', kind: 'tensAndOnes', assistance: 'visualSupport' as const },
  { stepId: 'jump-strategy', kind: 'jumpStrategy', assistance: 'guided' as const },
  { stepId: 'show-answer', kind: 'showAnswer', assistance: 'demonstrated' as const },
];
const capacity: MockItem = { concept: 'twoDigit', prompt: { kind: 'capacityRemaining', capacity: 80, loaded: 47 }, answer: 33, answerSpec: SPEC };
const exact: MockItem = { concept: 'twoDigit', prompt: { kind: 'exactLoad', target: 61, parts: '12,23,38,45', partCount: 4 }, answer: 61, answerSpec: { mode: 'value', min: 1, max: 299 } };
const silent = { play: jest.fn(), loop: jest.fn(), say: jest.fn(), canSay: () => false, hush: jest.fn() };
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

async function settle() {
  for (let i = 0; i < 6; i += 1) await act(async () => await Promise.resolve());
}

async function open(items: MockItem[], size = { width: 600, height: 960 }) {
  const session = createMockSession({ gameId: 'cargo-commander', items, ladder: LADDER });
  const onExit = jest.fn();
  await render(<CargoCommanderScreen session={session} size={size} insets={NO_INSETS} text={textSizes('standard')} reducedMotion suspended={false} sound={silent} onExit={onExit} />);
  await settle();
  return { session, onExit };
}
const press = async (id: string, n = 1) => {
  for (let i = 0; i < n; i += 1) await fireEvent.press(screen.getByTestId(id));
  await settle();
};
const submits = (s: ReturnType<typeof createMockSession>) => s.calls.filter((c) => c.method === 'submit');
const textOf = (c: unknown): string => (typeof c === 'string' || typeof c === 'number' ? String(c) : Array.isArray(c) ? c.map(textOf).join('') : c && typeof c === 'object' && 'props' in c ? textOf((c as { props: { children?: unknown } }).props.children) : '');
const readout = () => screen.getByLabelText(/^Scale\./).props.accessibilityLabel as string;

describe('Cargo Commander screen', () => {
  it('shows the brief with its givens, never the answer, and the scale without a reading', async () => {
    await open([capacity]);
    const text = textOf(screen.getByTestId('cargo-brief').props.children);
    expect(text).toContain('80');
    expect(text).toContain('47');
    expect(text).not.toContain('33');
    expect(readout()).toContain(CARGO_COPY.a11y.readoutHidden);
    expect(screen.getByText(CARGO_COPY.cues.start)).toBeTruthy();
  });

  it('loading never records anything; the first WEIGH sends the load once; the reading appears then', async () => {
    const { session } = await open([capacity]);
    await press('dock-sacks', 3);
    await press('dock-boxes', 2);
    await press('freight-ones');
    expect(submits(session)).toEqual([]);
    expect(readout()).toContain(CARGO_COPY.a11y.readoutHidden);
    await press('cargo-weigh');
    expect(submits(session).map((c) => c.args[0])).toEqual([{ mode: 'value', value: 31 }]);
    expect(readout()).toContain('78 kg');
    expect(screen.getByText(CARGO_COPY.cues.notEnough)).toBeTruthy();
    // The same load again: the reading, nothing sent.
    await press('cargo-weigh');
    expect(submits(session)).toHaveLength(1);
    await press('dock-boxes', 2);
    expect(readout()).toContain(CARGO_COPY.a11y.readoutHidden);
    await press('cargo-weigh');
    expect(submits(session).map((c) => (c.args[0] as { value: number }).value)).toEqual([31, 33]);
    expect(session.recorded).toHaveLength(1);
  });

  it('the toolkit is a scratch space: opening it and using every tool calls nothing in the session', async () => {
    const { session } = await open([capacity]);
    const before = session.calls.length;
    await press('cargo-toolkit-button');
    expect(screen.getByTestId('cargo-toolkit')).toBeTruthy();
    for (const word of [CARGO_COPY.toolkit.addTen, CARGO_COPY.toolkit.addOne, CARGO_COPY.toolkit.takeOne]) await fireEvent.press(screen.getByLabelText(word));
    await fireEvent.press(screen.getByText(CARGO_COPY.toolkit.numberLine));
    for (const word of [CARGO_COPY.toolkit.jumpTen, CARGO_COPY.toolkit.jumpOne, CARGO_COPY.toolkit.back, CARGO_COPY.toolkit.clear]) await fireEvent.press(screen.getByLabelText(word));
    await fireEvent.press(screen.getByText(CARGO_COPY.toolkit.workArea));
    await fireEvent.press(screen.getByLabelText(CARGO_COPY.buttons.toolkitClose));
    await settle();
    expect(screen.queryByTestId('cargo-toolkit')).toBeNull();
    expect(session.calls.slice(before)).toEqual([]);
  });

  it('crates load and unload with a touch, each labelled with its weight', async () => {
    const { session } = await open([exact]);
    await fireEvent.press(screen.getByLabelText('Load the 23 kg crate'));
    await fireEvent.press(screen.getByLabelText('Load the 38 kg crate'));
    await fireEvent.press(screen.getByLabelText('Load the 12 kg crate'));
    await fireEvent.press(screen.getByLabelText('Unload the 12 kg crate'));
    await settle();
    expect(screen.getByLabelText('Unload the 23 kg crate')).toBeTruthy();
    expect(submits(session)).toEqual([]);
    await press('cargo-weigh');
    expect(session.recorded).toEqual([{ key: expect.any(String), correct: true, evidence: 'independent' }]);
    // Reduced Motion: the run is a still change, then NEXT... here the last delivery: ALL DONE.
    expect(screen.getByLabelText(CARGO_COPY.buttons.finish)).toBeTruthy();
  });

  it('help is the session ladder; SHOW ME puts the load in and the learner still weighs', async () => {
    const { session } = await open([capacity]);
    const help = () => screen.getByLabelText(/^Help/);
    for (let i = 0; i < 3; i += 1) {
      await fireEvent.press(help());
      await settle();
    }
    expect(session.calls.filter((c) => c.method === 'help')).toHaveLength(3);
    expect(submits(session)).toEqual([]);
    expect(screen.getByLabelText('Sacks in the freight: 3. Take one off.')).toBeTruthy();
    expect(screen.getByLabelText('Boxes in the freight: 3. Take one off.')).toBeTruthy();
    await press('cargo-weigh');
    expect(session.recorded).toEqual([{ key: expect.any(String), correct: true, evidence: 'demonstrated' }]);
  });

  it('BACK TO ELEVATOR saves the half-loaded delivery first, and records nothing', async () => {
    const { session, onExit } = await open([capacity]);
    await press('dock-sacks', 2);
    await fireEvent.press(screen.getByTestId('minigame-back'));
    await settle();
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(session.saved).toMatchObject({ v: 1, cargo: { load: { sacks: 2, boxes: 0 } } });
    expect(submits(session)).toEqual([]);
  });

  it('every control has a role and a label', async () => {
    await open([capacity], { width: 1080, height: 810 });
    for (const id of ['cargo-weigh', 'dock-sacks', 'dock-boxes', 'freight-tens', 'freight-ones', 'cargo-toolkit-button', 'minigame-back']) {
      const el = screen.getByTestId(id);
      expect(el.props.accessibilityRole ?? el.props.role).toBe('button');
      expect(typeof el.props.accessibilityLabel).toBe('string');
    }
  });
});
