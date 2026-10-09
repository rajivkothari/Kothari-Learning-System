/**
 * @jest-environment node
 */
// The Word Golf screen over the mock session: the learner's path through a hole by touch only (tiles,
// CHECK, TAKE THE PUTT, aim, power, PUTT, NEXT HOLE), what a screen reader hears, rapid taps, Reduced
// Motion, and BACK TO ELEVATOR at every moment. The screen draws the controller's view and forwards
// touches; correctness comes from the session.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { TOKENS } from '../../ui/palette';
import { textSizes } from '../../ui/textRoles';
import type { MiniGameSound } from '../types';
import type { WordClue } from './clues';
import { WG_COPY } from './copy';
import type { Timers } from './controller';
import { HOLES } from './course';
import { TEST_WORDS, tilesFor, wordGolfMock } from './testPlay';
import { WordGolfScreen } from './WordGolfScreen';

const CLUES: Record<string, WordClue> = {
  'w-gear': { blank: 'The big ___ turns the belt.', meaning: 'A wheel with teeth.', phonics: 'Three sounds.' },
};
const clues = (id: string) => CLUES[id] ?? null;
const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, number | string>;

function manualTimers(): Timers & { run(): void } {
  const q = new Map<number, () => void>();
  let id = 0;
  return {
    set(fn) {
      id += 1;
      q.set(id, fn);
      return id;
    },
    clear: (h) => void q.delete(h as number),
    run() {
      for (let i = 0; i < 20 && q.size; i++)
        for (const [k, fn] of [...q]) {
          q.delete(k);
          fn();
        }
    },
  };
}

function soundLog(): MiniGameSound & { log: string[] } {
  const log: string[] = [];
  return { log, play: (s) => void log.push(s), loop: (s, on) => void log.push(`${s}:${on}`), say: (k) => void log.push(`say ${k}`), canSay: () => true, hush: () => {} };
}

const settle = () => act(async () => new Promise<void>((r) => setImmediate(r)));

async function open(opts: { width?: number; height?: number; reduced?: boolean } = {}) {
  const session = wordGolfMock();
  const timers = manualTimers();
  const sound = soundLog();
  const onExit = jest.fn();
  const width = opts.width ?? 1180;
  const height = opts.height ?? 820;
  await render(<WordGolfScreen session={session} size={{ width, height }} insets={{ top: 0, right: 0, bottom: 0, left: 0 }} text={textSizes(width >= 1000 ? 'roomy' : 'standard')} reducedMotion={Boolean(opts.reduced)} suspended={false} sound={sound} onExit={onExit} clues={clues} timers={timers} />);
  await settle();
  return { session, timers, sound, onExit };
}

async function spellWord(word: string, tiles: string = TEST_WORDS[0].tiles) {
  for (const id of tilesFor(tiles, word)) await fireEvent.press(screen.getByTestId(`wg-tile-${id}`));
  await fireEvent.press(screen.getByTestId('wg-check'));
  await settle();
}

describe('Word Golf screen', () => {
  it('a drag on the power meter or the green reaches the game once, when the finger lifts, at the last place it was', async () => {
    const { session } = await open();
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    await spellWord('gear');
    await fireEvent.press(screen.getByTestId('wg-take-shot'));
    const now = () => screen.getByTestId('wg-power-meter').props.accessibilityValue.now as number;
    const aimValue = () => screen.getByLabelText(WG_COPY.aimRight).props.accessibilityValue;
    expect(now()).toBe(5);
    // Power: the test renderer has no layout, so the meter is 1 wide and locationX is the power.
    const meter = screen.getByTestId('wg-power-meter');
    await fireEvent(meter, 'responderGrant', { nativeEvent: { locationX: 0.3 } });
    for (const x of [0.4, 0.55, 0.9, 0.81]) await fireEvent(meter, 'responderMove', { nativeEvent: { locationX: x } });
    expect(now()).toBe(5); // the drag is not the game's yet
    await fireEvent(meter, 'responderRelease', { nativeEvent: { locationX: 0.81 } });
    expect(now()).toBe(8); // 0.81
    // A touch without a move still sets it (grant, then release).
    await fireEvent(screen.getByTestId('wg-power-meter'), 'responderGrant', { nativeEvent: { locationX: 0.44 } });
    await fireEvent(screen.getByTestId('wg-power-meter'), 'responderRelease', { nativeEvent: { locationX: 0.44 } });
    expect(now()).toBe(4);
    // Aim: touch the green far to the side of the cup, drag, lift.
    const before = aimValue();
    const course = screen.getByTestId('wg-course');
    await fireEvent(course, 'responderGrant', { nativeEvent: { locationX: 2, locationY: 2 } });
    await fireEvent(course, 'responderMove', { nativeEvent: { locationX: 4, locationY: 3 } });
    expect(aimValue()).toEqual(before);
    await fireEvent(course, 'responderRelease', { nativeEvent: { locationX: 4, locationY: 3 } });
    expect(aimValue()).not.toEqual(before);
    // Nothing of it reaches the session: no submit, no help.
    expect(session.calls.filter((c) => c.method === 'submit' || c.method === 'help')).toHaveLength(1);
  });

  it('plays a hole by touch: intro, spell, earned putt, aim, power, PUTT, in the cup', async () => {
    const { session, timers, sound } = await open();
    expect(screen.getByText(HOLES[0]!.name)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    // The clue never shows the word; the word is said as it appears.
    expect(screen.getByTestId('wg-spell-card')).toBeTruthy();
    expect(screen.queryByText(/gear/i)).toBeNull();
    expect(sound.log).toContain('say word.w-gear');
    expect(screen.getByText(WG_COPY.spellPrompt)).toBeTruthy();
    // CHECK waits for every slot.
    expect(screen.getByTestId('wg-check').props.accessibilityState).toMatchObject({ disabled: true });
    await spellWord('gear');
    expect(session.calls.filter((c) => c.method === 'submit')).toEqual([{ method: 'submit', args: [{ mode: 'value', value: 'gear' }] }]);
    expect(screen.getByText(WG_COPY.earned)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('wg-take-shot'));
    expect(screen.getByText(WG_COPY.aimPrompt)).toBeTruthy();
    // Aim: the arrows say where the aim points, for a screen reader.
    const left = screen.getByLabelText(WG_COPY.aimLeft);
    expect(left.props.accessibilityRole).toBe('button');
    expect(left.props.accessibilityValue).toEqual({ text: WG_COPY.aimValueLittleLeft });
    for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByLabelText(WG_COPY.aimRight));
    expect(screen.getByLabelText(WG_COPY.aimRight).props.accessibilityValue).toEqual({ text: WG_COPY.aimValueOn });
    // Power: a screen reader adjusts the meter; the buttons step it.
    const meter = screen.getByTestId('wg-power-meter');
    expect(meter.props.accessibilityRole).toBe('adjustable');
    expect(meter.props.accessibilityValue).toMatchObject({ now: 5 });
    await fireEvent(meter, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await fireEvent.press(screen.getByLabelText(WG_COPY.morePower));
    expect(screen.getByTestId('wg-power-meter').props.accessibilityValue).toMatchObject({ now: 6 });
    // PUTT twice: one putt.
    await fireEvent.press(screen.getByTestId('wg-putt'));
    await fireEvent.press(screen.getByTestId('wg-putt'));
    expect(sound.log.filter((s) => s === 'golfHit')).toHaveLength(1);
    expect(screen.getByText(WG_COPY.rolling)).toBeTruthy();
    await act(async () => timers.run());
    await settle();
    expect(screen.getByText(WG_COPY.sunk)).toBeTruthy();
    expect(sound.log).toEqual(expect.arrayContaining(['golfCup', 'holeComplete']));
    // Golf added nothing to the record: one answer, one submit.
    expect(session.recorded).toHaveLength(1);
    // NEXT HOLE leads straight to the next word (no card to tap through between holes).
    await fireEvent.press(screen.getByTestId('wg-next-hole'));
    await settle();
    expect(screen.getByTestId('wg-spell-card')).toBeTruthy();
    expect(screen.getByLabelText(new RegExp(HOLES[1]!.name))).toBeTruthy();
  });

  it('places a tile once however fast it is tapped; a slot or UNDO gives letters back; CLEAR empties the row', async () => {
    const { sound } = await open();
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    const first = tilesFor(TEST_WORDS[0].tiles, 'g')[0]!;
    await fireEvent.press(screen.getByTestId(`wg-tile-${first}`));
    await fireEvent.press(screen.getByTestId(`wg-tile-${first}`));
    expect(sound.log.filter((s) => s === 'tilePlace')).toHaveLength(1);
    expect(screen.getByTestId('wg-slot-0').props.accessibilityLabel).toBe('Space 1: g');
    expect(screen.getByTestId('wg-slot-1').props.accessibilityLabel).toBe('Space 2: empty');
    await fireEvent.press(screen.getByTestId('wg-slot-0'));
    expect(screen.getByTestId('wg-slot-0').props.accessibilityLabel).toBe('Space 1: empty');
    await fireEvent.press(screen.getByTestId(`wg-tile-${first}`));
    await fireEvent.press(screen.getByTestId('wg-tile-0'));
    await fireEvent.press(screen.getByTestId('wg-undo'));
    expect(screen.getByTestId('wg-slot-1').props.accessibilityLabel).toBe('Space 2: empty');
    await fireEvent.press(screen.getByTestId('wg-clear'));
    expect(screen.getByTestId('wg-slot-0').props.accessibilityLabel).toBe('Space 1: empty');
    expect(sound.log.filter((s) => s === 'tileUndo')).toHaveLength(3);
  });

  it('a misspelling stays on the card with a gentle line: no red, and the putt waits', async () => {
    const { session } = await open();
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    await spellWord('gaer');
    expect(screen.getByTestId('wg-feedback')).toBeTruthy();
    expect(screen.getByText(WG_COPY.notYet)).toBeTruthy();
    expect(screen.queryByTestId('wg-take-shot')).toBeNull();
    expect(session.recorded).toHaveLength(0);
    // Never the danger colour anywhere on the card.
    expect(JSON.stringify(screen.toJSON()).toUpperCase()).not.toContain(TOKENS.palette.danger.toUpperCase());
  });

  it('HELP shows its hint, and each step is labelled by its kind (SOUND HINT, SHOW A PART, SHOW ME)', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    // The mock ladder starts with a replay step (no words of its own: HELP), then a sound hint.
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(WG_COPY.help) }));
    await settle();
    expect(screen.getByText(WG_COPY.replayLine)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(WG_COPY.helpLabel('phonicsHint')) }));
    await settle();
    expect(screen.getByText('Three sounds.')).toBeTruthy();
    expect(screen.getByText(WG_COPY.helpLine('phonicsHint')!)).toBeTruthy();
    // The part of the word: its pattern's letters show faintly in their places.
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(WG_COPY.helpLabel('revealLetter')) }));
    await settle();
    expect(screen.getByTestId('wg-slot-1').props.accessibilityLabel).toBe('Space 2: empty');
    expect(screen.getByTestId('wg-ghost-1').props.children).toBe('e');
    expect(screen.getByTestId('wg-ghost-2').props.children).toBe('a');
  });

  it('BACK TO ELEVATOR saves and leaves once, at any moment (even mid-putt)', async () => {
    const { session, onExit } = await open();
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    await spellWord('gear');
    await fireEvent.press(screen.getByTestId('wg-take-shot'));
    await fireEvent.press(screen.getByTestId('wg-putt'));
    const back = screen.getByTestId('wg-back');
    expect(Number(flat(back.props.style).minHeight)).toBeGreaterThanOrEqual(64);
    await fireEvent.press(back);
    await fireEvent.press(back);
    await settle();
    expect(onExit).toHaveBeenCalledTimes(1);
    expect((session.saved as { phase: string }).phase).toMatch(/aim|sunk/);
  });

  it('Reduced Motion: the same game, the ball still plays its path, and the hole still ends', async () => {
    const { timers } = await open({ reduced: true, width: 600, height: 960 });
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    await spellWord('gear');
    await fireEvent.press(screen.getByTestId('wg-take-shot'));
    for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByLabelText(WG_COPY.aimRight));
    await fireEvent.press(screen.getByLabelText(WG_COPY.morePower));
    await fireEvent.press(screen.getByTestId('wg-putt'));
    await act(async () => timers.run());
    await settle();
    expect(screen.getByText(WG_COPY.sunk)).toBeTruthy();
  });

  it('MOVE CLOSER appears after three putts on a hole, is full size, and records nothing', async () => {
    const { session, timers } = await open();
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    await spellWord('gear');
    await fireEvent.press(screen.getByTestId('wg-take-shot'));
    for (let i = 0; i < 8; i++) await fireEvent.press(screen.getByLabelText(WG_COPY.lessPower));
    for (let putt = 0; putt < 3; putt++) {
      expect(screen.queryByTestId('wg-move-closer')).toBeNull();
      await fireEvent.press(screen.getByTestId('wg-putt'));
      await act(async () => timers.run());
      await settle();
    }
    const closer = screen.getByTestId('wg-move-closer');
    expect(closer.props.accessibilityLabel).toBe(WG_COPY.moveCloser);
    expect(Number(flat(closer.props.style).minHeight)).toBeGreaterThanOrEqual(64);
    await fireEvent.press(closer);
    await settle();
    expect(screen.getByText(WG_COPY.moved)).toBeTruthy();
    expect(screen.queryByTestId('wg-move-closer')).toBeNull();
    expect(session.calls.filter((c) => c.method === 'submit' || c.method === 'help')).toHaveLength(1);
    expect(session.recorded).toHaveLength(1);
  });

  it('every control is at least 64 pt on Fire HD 8 portrait', async () => {
    await open({ width: 600, height: 960 });
    for (const id of ['wg-back', 'wg-begin']) expect(Number(flat(screen.getByTestId(id).props.style).minHeight)).toBeGreaterThanOrEqual(64);
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    for (const t of screen.getAllByTestId(/^wg-tile-\d+$/)) {
      const s = flat(t.props.style);
      expect(Number(s.width)).toBeGreaterThanOrEqual(64);
      expect(Number(s.height)).toBeGreaterThanOrEqual(64);
    }
    for (const id of ['wg-check', 'wg-undo', 'wg-clear']) expect(Number(flat(screen.getByTestId(id).props.style).minHeight)).toBeGreaterThanOrEqual(64);
  });
});
