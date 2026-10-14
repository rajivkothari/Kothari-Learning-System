/**
 * @jest-environment node
 */
// The Word Golf screen over the mock session (D197): the learner's path through a hole by touch only
// (TEE OFF, pick the shot, tiles, TRY IT, the flight, the result, onto the green, aim, power, PUTT, the
// hole card and the hole map), what a screen reader hears, rapid taps, Reduced Motion, and BACK TO
// ELEVATOR at every moment. The screen draws the controller's view and forwards touches; correctness
// comes from the session.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { TOKENS } from '../../ui/palette';
import { textSizes } from '../../ui/textRoles';
import type { MiniGameSound } from '../types';
import type { WordClue } from './clues';
import { WG_COPY } from './copy';
import type { Timers } from './controller';
import { HOLES, holeFor, say } from './course';
import { toPin } from './fairway';
import { TEST_WORDS, tilesFor, wordGolfMock } from './testPlay';
import { shotWords } from './TurnPanel';
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

async function open(opts: { width?: number; height?: number; reduced?: boolean; missionId?: string; completed?: string[]; onPlayMission?: (m: string) => void } = {}) {
  const missionId = opts.missionId ?? 'word-golf';
  const session = wordGolfMock({ missionId, words: holeFor(missionId).turns.length, ...(opts.completed ? { completedMissions: opts.completed } : {}) });
  const timers = manualTimers();
  const sound = soundLog();
  const onExit = jest.fn();
  const width = opts.width ?? 1180;
  const height = opts.height ?? 820;
  await render(<WordGolfScreen session={session} size={{ width, height }} insets={{ top: 0, right: 0, bottom: 0, left: 0 }} text={textSizes(width >= 1000 ? 'roomy' : 'standard')} reducedMotion={Boolean(opts.reduced)} suspended={false} sound={sound} onExit={onExit} clues={clues} timers={timers} {...(opts.onPlayMission ? { onPlayMission: opts.onPlayMission } : {})} />);
  await settle();
  return { session, timers, sound, onExit };
}

async function spellWord(word: string, tiles: string = TEST_WORDS[0].tiles) {
  for (const id of tilesFor(tiles, word)) await fireEvent.press(screen.getByTestId(`wg-tile-${id}`));
  await fireEvent.press(screen.getByTestId('wg-check'));
  await settle();
}

/** Hole 1: TEE OFF, spell gear, the flight plays, then onto the green (aiming). */
async function toGreen(timers: ReturnType<typeof manualTimers>) {
  await fireEvent.press(screen.getByTestId('wg-begin'));
  await settle();
  await spellWord('gear');
  await act(async () => timers.run());
  await settle();
  await fireEvent.press(screen.getByTestId('wg-carry-on'));
  await settle();
}

describe('the result card words (D197)', () => {
  const base = { word: 'gear', golden: false, sound: null, rime: null, carried: null, splash: false, lie: 'fairway' as const, flight: 120 };
  it('names the shot by the spelling; a lie that played it shorter has its own line, never "help"', () => {
    const sand = shotWords({ ...base, quality: 'steady', earned: 'power', from: 'bunker' }, WG_COPY);
    expect([sand.name, sand.why, sand.lie]).toEqual([WG_COPY.shotPower, WG_COPY.powerWhy, WG_COPY.bunkerNote]);
    const helped = shotWords({ ...base, quality: 'steady', earned: 'steady', from: 'tee' }, WG_COPY);
    expect([helped.name, helped.why, helped.lie]).toEqual([WG_COPY.shotSteady, WG_COPY.steadyWhy, null]);
    expect(shotWords({ ...base, quality: 'good', earned: 'good', from: 'fairway', rime: 'at' }, WG_COPY).family).toBe("A word from the -AT family.");
  });
});

describe('Word Golf screen (D197)', () => {
  it('plays hole 1 by touch: TEE OFF, the word, SWING!, the result, the green, PUTT, in the hole', async () => {
    const { session, timers, sound } = await open();
    expect(screen.getByText(HOLES[0]!.name)).toBeTruthy();
    expect(screen.getByTestId('wg-hole-title').props.children).toContain(`HOLE 1 / ${HOLES.length}`);
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    // One target (the green): the spelling card, with the word's power and the shot it is for.
    expect(screen.getByTestId('wg-spell-card')).toBeTruthy();
    expect(screen.getByTestId('wg-word-power').props.children).toBe('4-LETTER WORD: 150 YARDS');
    expect(screen.getByTestId('wg-shot-target').props.children).toBe(WG_COPY.targetGreen);
    expect(screen.queryByTestId('wg-change-shot')).toBeNull();
    // The clue never shows the word; the word is said as it appears.
    expect(screen.queryByText(/gear/i)).toBeNull();
    expect(sound.log).toContain('say word.w-gear');
    expect(screen.getByTestId('wg-check').props.accessibilityState).toMatchObject({ disabled: true });
    await spellWord('gear');
    expect(session.calls.filter((c) => c.method === 'submit')).toEqual([{ method: 'submit', args: [{ mode: 'value', value: 'gear' }] }]);
    // The word is the shot: SWING! with the word, then what it did.
    expect(screen.getByTestId('wg-panel-flight')).toBeTruthy();
    expect(screen.getByText(WG_COPY.swing)).toBeTruthy();
    await act(async () => timers.run());
    await settle();
    expect(screen.getByTestId('wg-shot-name').props.children).toBe(WG_COPY.shotPower);
    expect(screen.getByTestId('wg-shot-why').props.children).toBe(WG_COPY.powerWhy);
    expect(screen.getByTestId('wg-shot-where').props.children).toBe(WG_COPY.onGreen);
    expect(sound.log).toEqual(expect.arrayContaining(['answerRight', 'golfHit']));
    await fireEvent.press(screen.getByTestId('wg-carry-on'));
    await settle();
    expect(screen.getByText(WG_COPY.aimPrompt)).toBeTruthy();
    // Aim: the arrows say where the aim points, for a screen reader; it starts on the flag.
    expect(screen.getByLabelText(WG_COPY.aimLeft).props.accessibilityValue).toEqual({ text: WG_COPY.aimValueOn });
    // PUTT twice: one putt.
    const hits = sound.log.filter((x) => x === 'golfHit').length;
    await fireEvent.press(screen.getByTestId('wg-putt'));
    await fireEvent.press(screen.getByTestId('wg-putt'));
    expect(sound.log.filter((x) => x === 'golfHit')).toHaveLength(hits + 1);
    expect(screen.getByText(WG_COPY.rolling)).toBeTruthy();
    for (let i = 0; i < 6 && !screen.queryByTestId('wg-panel-sunk'); i++) {
      if (screen.queryByTestId('wg-putt')) await fireEvent.press(screen.getByTestId('wg-putt'));
      await act(async () => timers.run());
      await settle();
    }
    expect(screen.getByTestId('wg-panel-sunk')).toBeTruthy();
    expect(screen.getByTestId('wg-words').props.children).toBe('gear');
    expect(sound.log).toEqual(expect.arrayContaining(['holeComplete']));
    // Golf added nothing to the record: one answer, one submit; the hole finished once.
    expect(session.recorded).toHaveLength(1);
    expect(session.calls.filter((c) => c.method === 'finish')).toHaveLength(1);
    // No host to switch holes: BACK TO ELEVATOR is the way on.
    expect(screen.getByTestId('wg-done-back')).toBeTruthy();
  });

  it('PICK YOUR SHOT: two cards that say what each needs; the spelling card names the shot, CHANGE SHOT goes back', async () => {
    const { session } = await open({ missionId: 'word-golf-4' });
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    expect(screen.getByText(WG_COPY.pickShot)).toBeTruthy();
    // Each card says what it needs and how far it leaves the ball from the flag (D199: the bold one is nearer).
    const [safeT, boldT] = holeFor('word-golf-4').turns[0]!.targets;
    const then = (t: typeof safeT) => say(WG_COPY.thenToPin, { yards: toPin(holeFor('word-golf-4'), t!.at) });
    expect(screen.getByTestId('wg-target-short-of-sand').props.accessibilityLabel).toBe(`${WG_COPY.targetSafe}. ${WG_COPY.safeNote} ${then(safeT)}`);
    expect(screen.getByTestId('wg-target-over-sand').props.accessibilityLabel).toBe(`${WG_COPY.targetBold}. ${WG_COPY.boldNote} ${then(boldT)}`);
    expect(toPin(holeFor('word-golf-4'), boldT!.at)).toBeLessThan(toPin(holeFor('word-golf-4'), safeT!.at));
    await fireEvent.press(screen.getByTestId('wg-target-over-sand'));
    await settle();
    expect(screen.getByTestId('wg-shot-target').props.children).toBe(WG_COPY.targetBold);
    await fireEvent.press(screen.getByTestId('wg-change-shot'));
    await settle();
    expect(screen.getByTestId('wg-panel-target')).toBeTruthy();
    // Choosing and changing the shot is play: nothing reached the session.
    expect(session.calls.filter((c) => c.method === 'submit' || c.method === 'help')).toHaveLength(0);
  });

  it('a tap on the course skips the flight: the result card at once', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    await spellWord('gear');
    expect(screen.getByTestId('wg-panel-flight')).toBeTruthy();
    await fireEvent(screen.getByTestId('wg-course'), 'responderGrant', { nativeEvent: { locationX: 10, locationY: 10 } });
    await settle();
    expect(screen.getByTestId('wg-panel-result')).toBeTruthy();
  });

  it('a drag on the power meter or the green reaches the game once, when the finger lifts, at the last place it was', async () => {
    const { session, timers } = await open();
    await toGreen(timers);
    const now = () => screen.getByTestId('wg-power-meter').props.accessibilityValue.now as number;
    const aimValue = () => screen.getByLabelText(WG_COPY.aimRight).props.accessibilityValue;
    expect(now()).toBe(4);
    // Power: the test renderer has no layout, so the meter is 1 wide and locationX is the power.
    const meter = screen.getByTestId('wg-power-meter');
    await fireEvent(meter, 'responderGrant', { nativeEvent: { locationX: 0.3 } });
    for (const x of [0.4, 0.55, 0.9, 0.81]) await fireEvent(meter, 'responderMove', { nativeEvent: { locationX: x } });
    expect(now()).toBe(4); // the drag is not the game's yet
    await fireEvent(meter, 'responderRelease', { nativeEvent: { locationX: 0.81 } });
    expect(now()).toBe(8); // 0.81
    // Aim: touch the green far to the side of the cup, drag, lift.
    const before = aimValue();
    const course = screen.getByTestId('wg-course');
    await fireEvent(course, 'responderGrant', { nativeEvent: { locationX: 2, locationY: 2 } });
    await fireEvent(course, 'responderMove', { nativeEvent: { locationX: 4, locationY: 3 } });
    expect(aimValue()).toEqual(before);
    await fireEvent(course, 'responderRelease', { nativeEvent: { locationX: 4, locationY: 3 } });
    expect(aimValue()).not.toEqual(before);
    // Nothing of it reaches the session: the one word only.
    expect(session.calls.filter((c) => c.method === 'submit' || c.method === 'help')).toHaveLength(1);
  });

  it('the power meter gives the browser the same value as native (aria-value*), and it changes only once a power is committed', async () => {
    const { timers } = await open();
    await toGreen(timers);
    const props = () => screen.getByTestId('wg-power-meter').props;
    const aria = () => ({ min: props()['aria-valuemin'], max: props()['aria-valuemax'], now: props()['aria-valuenow'], text: props()['aria-valuetext'] });
    expect(aria()).toEqual(props().accessibilityValue);
    expect(aria()).toMatchObject({ min: 0, max: 10, now: 4 });
    expect(props().accessibilityRole).toBe('adjustable');
    const meter = screen.getByTestId('wg-power-meter');
    await fireEvent(meter, 'responderGrant', { nativeEvent: { locationX: 0.7 } });
    expect(aria().now).toBe(4);
    await fireEvent(meter, 'responderRelease', { nativeEvent: { locationX: 0.7 } });
    expect(aria()).toEqual(props().accessibilityValue);
    expect(aria().now).toBe(7);
    await fireEvent(screen.getByTestId('wg-power-meter'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(aria().now).toBe(8);
    await fireEvent.press(screen.getByLabelText(WG_COPY.lessPower));
    expect(aria().now).toBe(7);
    expect(aria().text).toBeTruthy();
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

  it('a misspelling stays on the card with a gentle line: no red, no shot', async () => {
    const { session } = await open();
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    await spellWord('gaer');
    expect(screen.getByTestId('wg-feedback')).toBeTruthy();
    expect(screen.getByText(WG_COPY.notYet)).toBeTruthy();
    expect(screen.queryByTestId('wg-panel-flight')).toBeNull();
    expect(session.recorded).toHaveLength(0);
    expect(JSON.stringify(screen.toJSON()).toUpperCase()).not.toContain(TOKENS.palette.danger.toUpperCase());
  });

  it('HELP shows its hint, each step labelled by its kind; after SHOW ME the word still flies (a steady shot)', async () => {
    const { timers } = await open();
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(WG_COPY.help) }));
    await settle();
    expect(screen.getByText(WG_COPY.replayLine)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(WG_COPY.helpLabel('phonicsHint')) }));
    await settle();
    expect(screen.getByText('Three sounds.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(WG_COPY.helpLabel('revealLetter')) }));
    await settle();
    expect(screen.getByTestId('wg-ghost-1').props.children).toBe('e');
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(WG_COPY.helpLabel('showAnswer')) }));
    await settle();
    await spellWord('gear');
    await act(async () => timers.run());
    await settle();
    expect(screen.getByTestId('wg-shot-name').props.children).toBe(WG_COPY.shotSteady);
    expect(screen.getByTestId('wg-shot-why').props.children).toBe(WG_COPY.steadyWhy);
  });

  it('BACK TO ELEVATOR saves and leaves once, at any moment (even mid-putt)', async () => {
    const { session, onExit, timers } = await open();
    await toGreen(timers);
    await fireEvent.press(screen.getByTestId('wg-putt'));
    const back = screen.getByTestId('wg-back');
    expect(Number(flat(back.props.style).minHeight)).toBeGreaterThanOrEqual(64);
    await fireEvent.press(back);
    await fireEvent.press(back);
    await settle();
    expect(onExit).toHaveBeenCalledTimes(1);
    // Saved where the putt stops; a putt that dropped finished the hole (finish clears the save).
    if (session.finished) expect(session.saved).toBeNull();
    else expect((session.saved as { phase: string }).phase).toBe('aim');
  });

  it('Reduced Motion: the same game on Fire HD 8 portrait; the hole still ends', async () => {
    const { timers } = await open({ reduced: true, width: 600, height: 960 });
    await toGreen(timers);
    for (let i = 0; i < 6 && !screen.queryByTestId('wg-panel-sunk'); i++) {
      if (screen.queryByTestId('wg-putt')) await fireEvent.press(screen.getByTestId('wg-putt'));
      await act(async () => timers.run());
      await settle();
    }
    expect(screen.getByTestId('wg-panel-sunk')).toBeTruthy();
  });

  it('MOVE CLOSER appears after three putts, is full size, and records nothing', async () => {
    const { session, timers } = await open();
    await toGreen(timers);
    for (let i = 0; i < 6; i++) await fireEvent.press(screen.getByLabelText(WG_COPY.lessPower));
    for (let putt = 0; putt < 3; putt++) {
      expect(screen.queryByTestId('wg-move-closer')).toBeNull();
      // Aim away from the cup (each miss aims back at it) so no putt drops.
      for (let i = 0; i < 90; i++) await fireEvent.press(screen.getByLabelText(WG_COPY.aimRight));
      await fireEvent.press(screen.getByTestId('wg-putt'));
      await act(async () => timers.run());
      await settle();
    }
    const closer = screen.getByTestId('wg-move-closer');
    expect(Number(flat(closer.props.style).minHeight)).toBeGreaterThanOrEqual(64);
    await fireEvent.press(closer);
    await settle();
    expect(screen.getByText(WG_COPY.moved)).toBeTruthy();
    expect(session.calls.filter((c) => c.method === 'submit' || c.method === 'help')).toHaveLength(1);
    expect(session.recorded).toHaveLength(1);
  });

  it('the hole card offers NEXT HOLE, PLAY AGAIN and HOLES; the map opens finished holes and the next one only', async () => {
    const played: string[] = [];
    const { timers, onExit } = await open({ completed: ['word-golf-2'], onPlayMission: (m) => void played.push(m) });
    // From the first card: the map. Hole 1 (here) and 2 (finished) open, 3 (next not finished) open, 4 waits.
    await fireEvent.press(screen.getByTestId('wg-holes'));
    expect(screen.getByTestId('wg-hole-map')).toBeTruthy();
    expect(screen.getByTestId('wg-map-4').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('wg-map-2').props.accessibilityLabel).toContain(WG_COPY.done);
    // The hole being played, not started: the map just closes.
    await fireEvent.press(screen.getByTestId('wg-map-1'));
    await settle();
    expect(played).toEqual([]);
    expect(screen.queryByTestId('wg-hole-map')).toBeNull();
    await toGreen(timers);
    for (let i = 0; i < 6 && !screen.queryByTestId('wg-panel-sunk'); i++) {
      if (screen.queryByTestId('wg-putt')) await fireEvent.press(screen.getByTestId('wg-putt'));
      await act(async () => timers.run());
      await settle();
    }
    expect(screen.getByTestId('wg-again')).toBeTruthy();
    expect(screen.getByTestId('wg-holes')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('wg-next-hole'));
    await fireEvent.press(screen.getByTestId('wg-next-hole'));
    await settle();
    expect(played).toEqual(['word-golf-2']);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('hole 10 is the Tower Cup only once every hole is finished', async () => {
    for (const completed of [[], HOLES.slice(0, 9).map((h) => h.mission)]) {
      const { timers } = await open({ missionId: 'word-golf-10', completed });
      // The mock gives the test words in order, one a turn.
      let k = 0;
      for (let i = 0; i < 40 && !screen.queryByTestId('wg-panel-sunk'); i++) {
        if (screen.queryByTestId('wg-target-right-side')) await fireEvent.press(screen.getByTestId('wg-target-right-side'));
        else if (screen.queryByTestId('wg-spell-card')) {
          await spellWord(TEST_WORDS[k]!.word, TEST_WORDS[k]!.tiles);
          k += 1;
        } else {
          const id = ['wg-begin', 'wg-carry-on', 'wg-putt'].find((x) => screen.queryByTestId(x));
          if (id) await fireEvent.press(screen.getByTestId(id));
        }
        await act(async () => timers.run());
        await settle();
      }
      expect(screen.getByTestId('wg-panel-sunk')).toBeTruthy();
      expect(Boolean(screen.queryByTestId('wg-tower-cup'))).toBe(completed.length === 9);
      screen.unmount();
    }
  });

  it('every control is at least 64 pt on Fire HD 8 portrait', async () => {
    await open({ width: 600, height: 960, missionId: 'word-golf-4' });
    for (const id of ['wg-back', 'wg-begin']) expect(Number(flat(screen.getByTestId(id).props.style).minHeight)).toBeGreaterThanOrEqual(64);
    await fireEvent.press(screen.getByTestId('wg-begin'));
    await settle();
    for (const id of ['wg-target-short-of-sand', 'wg-target-over-sand']) expect(Number(flat(screen.getByTestId(id).props.style).minHeight)).toBeGreaterThanOrEqual(64);
    await fireEvent.press(screen.getByTestId('wg-target-short-of-sand'));
    await settle();
    for (const t of screen.getAllByTestId(/^wg-tile-\d+$/)) {
      const st = flat(t.props.style);
      expect(Number(st.width)).toBeGreaterThanOrEqual(64);
      expect(Number(st.height)).toBeGreaterThanOrEqual(64);
    }
    for (const id of ['wg-check', 'wg-undo', 'wg-clear', 'wg-change-shot']) expect(Number(flat(screen.getByTestId(id).props.style).minHeight)).toBeGreaterThanOrEqual(64);
  });
});
