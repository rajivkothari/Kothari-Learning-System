/**
 * @jest-environment node
 */
/// <reference types="node" />
// Reading jobs on the real Floor 15 screen (M8), over the real director, runtime and SQLite. The note
// opens first (its title, every sentence, the instruction; the CLUE sentence marked), then folds to
// answer: on the landing when every thing of the job can be touched there (illustrated landing
// shown), otherwise with cards naming the same options (vectors, a decode failure, a thing painted
// outside the safe core), never a mix. SHOW ME makes the answer glow. Cards are full-size, labelled
// buttons, locked while the job takes no answer. Nothing on screen depends on which option the content
// calls right, and every reading control has a label. The directory stays reachable during a ride job.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AudioEngine } from '../audio/audioEngine';
import { DEFAULT_AUDIO } from '../audio/mix';
import { calibrationArt, type ArtEntry, type ArtManifest } from '../art/manifest';
import { LINES } from '../content/floor15';
import { READING, readingItem, readingLine } from '../content/reading';
import { CONTENT, LEARNER, openSession, settled, tempDir, virtualTime, type Session } from '../testing/headless';
import { readingContent, rightValue, wrongValue } from '../testing/reading';
import { assembleSession, type Floor15Session } from '../sessionCore';
import { ArtProvider, DEFAULT_ART_SETTINGS, type ArtSettings } from './art/ArtContext';
import { GameScreen } from './GameScreen';
import { MIN_BUTTON } from './layout';
import { eq } from './palette';

jest.mock('../useFloor15', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  return {
    useDirectorView: (d: { subscribe: (l: () => void) => () => void; getView: () => unknown }) => useSyncExternalStore(d.subscribe, d.getView, d.getView),
    useSessionSettings: (s: { settings: { subscribe: (l: () => void) => () => void; get: () => unknown } }) => useSyncExternalStore(s.settings.subscribe, s.settings.get, s.settings.get),
  };
});

const silent = (): AudioEngine => ({
  handle: () => {},
  setSettings: () => {},
  suspend: () => {},
  resume: () => {},
  release: () => {},
  status: () => ({ ready: true, error: null, lastRequestAt: null, played: 0, waitingForGesture: false }),
});
const metrics = { frame: { x: 0, y: 0, width: 1180, height: 820 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const provenance = { provider: 'test fixture', aiGenerated: false, humanReviewed: true, license: 'Project-owned.' };

/** An illustrated landing on every floor (the Skia mock "loads" any image with a source). `failing`: ids whose image does not decode. */
function landingArt(failing: string[] = []): ArtSettings {
  const assets: ArtEntry[] = Array.from({ length: 20 }, (_, i) => ({ id: `landing.${i + 1}.background`, kind: 'landing' as const, file: `landings/${i + 1}/background.webp`, width: 1024, height: 1024, alpha: false, provenance, state: 'any' as const, layer: 'background' as const, floor: i + 1 }));
  const manifest: ArtManifest = { schemaVersion: 1, theme: 'elevator-quest', assets };
  return { ...DEFAULT_ART_SETTINGS, set: calibrationArt(manifest, Object.fromEntries(assets.map((a) => [a.id, `${failing.includes(a.id) ? 'fail' : 'fixture'}:${a.id}`]))) };
}
/** Vectors only (no landing art): what production draws while a floor's art is pending. */
const VECTORS: ArtSettings = { ...DEFAULT_ART_SETTINGS, set: { entries: [], source: () => null } };

const TOUCH_F2 = () => readingContent('reading.details.touch', ['stuck-toolbox', 'drill-first']);
const TOUCH_F1 = () => readingContent('reading.inference.touch', ['thirsty-plant', 'lobby-antique']);
const RIDE = () => readingContent('reading.details.ride', ['grow-lights', 'spare-springs']);
const CARDS = () => readingContent('reading.sentence.cards', ['question-sign', 'whole-sentence']);

const open: { s: Session; cleanup: () => void }[] = [];
afterEach(async () => {
  for (const { s, cleanup } of open.splice(0)) {
    s.director.dispose();
    await s.db.close();
    cleanup();
  }
});

/** Play to the first reading job headless (doors open there, its window open). */
async function atReading(content: typeof CONTENT, instanceId?: string): Promise<Session> {
  const tmp = tempDir();
  const s = await openSession(tmp.file, virtualTime(), { content, ...(instanceId ? { instanceId } : {}) });
  open.push({ s, cleanup: tmp.cleanup });
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
  s.director.pressFloor(rightValue(s) as number);
  expect(await s.time.runUntil(() => s.view().task?.stepId === 'read-1' && settled(s)() && s.view().reading?.accepting === true)).toBe(true);
  return s;
}

const flush = async () => {
  for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r));
};

async function mount(s: Session, art: ArtSettings) {
  const session: Floor15Session = assembleSession({ learnerId: LEARNER, runtime: s.rt, director: s.director, audio: silent(), log: s.log, skillsBefore: null }, { motion: 'normal', audio: DEFAULT_AUDIO });
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ArtProvider value={art}>
        <GameScreen session={session} />
      </ArtProvider>
    </SafeAreaProvider>,
  );
  // The landing art decodes (the Skia mock), then the landing says whether its things can be touched.
  await act(flush);
}

/** Advance the game's time inside act, until `until`. */
const until = async (s: Session, cond: () => boolean) => {
  let ok = false;
  await act(async () => {
    ok = await s.time.runUntil(cond);
    await flush();
  });
  return ok;
};

const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, number | string>;
const activate = (node: ReturnType<typeof screen.getByTestId>) => fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
const fold = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId('reading-note-close'));
    await flush();
  });
};
const landingTargets = () => screen.queryAllByTestId(/^landing-touch-/).filter((n) => !String(n.props.testID).endsWith('-shown'));
const cards = () => screen.queryAllByTestId(/^reading-choice-/);
const answers = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer');

/** Every string a learner or a screen reader meets (texts and labels; not test ids). */
function shownWords(): string[] {
  const out: string[] = [];
  type Node = { props?: { accessibilityLabel?: unknown }; children?: (Node | string)[] | null } | string;
  const walk = (n: Node | null) => {
    if (n === null) return;
    if (typeof n === 'string') return void out.push(n);
    if (typeof n.props?.accessibilityLabel === 'string') out.push(n.props.accessibilityLabel);
    for (const c of n.children ?? []) walk(c);
  };
  const json = screen.toJSON() as Node | Node[] | null;
  for (const n of [json].flat()) walk(n);
  return out.sort();
}

describe('a reading job on the Floor 15 screen', () => {
  it('a touch job with its landing shown: the note first (CLUE line marked when given), then the landing\'s things answer it', async () => {
    const s = await atReading(TOUCH_F2());
    await mount(s, landingArt());
    const r = s.view().reading!;
    const w = readingItem(READING, r.item)!;
    // The note: its title, every sentence, the instruction, and a way to fold it. Nothing to touch under it yet.
    expect(screen.getByTestId('reading-note')).toBeTruthy();
    expect(screen.getByText(w.source)).toBeTruthy();
    for (const line of w.passage) expect(screen.getByLabelText(line)).toBeTruthy();
    expect(screen.getByLabelText(w.ask)).toBeTruthy();
    expect(screen.getByLabelText(readingLine('noteClose'))).toBeTruthy();
    expect(landingTargets()).toHaveLength(0);
    expect(cards()).toHaveLength(0);
    // CLUE marks the key sentence ("Clue: ..." for a screen reader) and keeps the note open.
    await act(async () => {
      fireEvent.press(screen.getByLabelText(new RegExp(s.view().help!.label)));
      await s.director.idle();
      await flush();
    });
    expect(screen.getByLabelText(`Clue: ${w.passage[w.key]}`)).toBeTruthy();
    expect(flat(screen.getByLabelText(`Clue: ${w.passage[w.key]}`).props.style).borderLeftColor).toBe(eq.clue);
    // Folded: every option is a thing on the landing, named as the note names it. No cards.
    await fold();
    expect(screen.queryByTestId('reading-note')).toBeNull();
    expect(screen.getByLabelText(readingLine('noteOpen'))).toBeTruthy();
    expect(cards()).toHaveLength(0);
    expect(landingTargets().map((n) => n.props.testID as string).sort()).toEqual(r.options.map((o) => `landing-touch-${o.value}`).sort());
    for (const o of r.options) expect(screen.getByTestId(`landing-touch-${o.value}`).props.accessibilityLabel).toBe(o.label);
    // The note opens again from its button.
    await act(async () => {
      fireEvent.press(screen.getByTestId('reading-note-open'));
      await flush();
    });
    expect(screen.getByTestId('reading-note')).toBeTruthy();
    await fold();
    // Touch the right thing: the job is done.
    await act(async () => {
      activate(screen.getByTestId(`landing-touch-${rightValue(s)}`));
      await flush();
    });
    expect(answers(s).at(-1)!.data).toMatchObject({ via: 'touch' });
    expect(await until(s, () => s.view().stage === 'success')).toBe(true);
    expect(screen.queryByTestId('reading-note-open')).toBeNull();
    expect(landingTargets()).toHaveLength(0);
  });

  it('a miss on the landing, CLUE, then SHOW ME: the thing shown glows and is the only one left to touch', async () => {
    const s = await atReading(TOUCH_F2());
    await mount(s, landingArt());
    await fold();
    const right = String(rightValue(s));
    await act(async () => {
      activate(screen.getByTestId(`landing-touch-${wrongValue(s)}`));
      await flush();
    });
    expect(await until(s, () => s.view().stage === 'task' && s.view().reading!.accepting)).toBe(true);
    expect(screen.queryAllByTestId(/-shown$/)).toHaveLength(0);
    for (const step of [0, 1]) {
      await act(async () => {
        fireEvent.press(screen.getByLabelText(new RegExp(s.view().help!.label)));
        await s.director.idle();
        await flush();
      });
      // CLUE opens the note; fold it again to look at the landing.
      if (step === 0) await fold();
    }
    expect(screen.queryByTestId('reading-note')).toBeNull();
    expect(screen.getByTestId(`landing-touch-${right}-shown`)).toBeTruthy();
    expect(landingTargets().map((n) => n.props.testID)).toEqual([`landing-touch-${right}`]);
  });

  it.each([
    ['the vector landing (art pending)', VECTORS, TOUCH_F2],
    ['a landing whose art fails to decode', landingArt(['landing.2.background']), TOUCH_F2],
    ['Floor 1, whose plant and bench are painted outside the safe core', landingArt(), TOUCH_F1],
  ] as const)('a touch job falls back to cards on %s: the same options, never mixed with touch', async (_name, art, content) => {
    const s = await atReading(content());
    await mount(s, art);
    await fold();
    expect(landingTargets()).toHaveLength(0);
    const r = s.view().reading!;
    expect(screen.getByTestId('reading-choices')).toBeTruthy();
    expect(cards().map((n) => n.props.testID as string).sort()).toEqual(r.options.map((o) => `reading-choice-${o.value}`).sort());
    for (const o of r.options) {
      const card = screen.getByTestId(`reading-choice-${o.value}`);
      expect(card.props.accessibilityRole).toBe('button');
      expect(card.props.accessibilityLabel).toBe(o.label);
      expect(Number(flat(card.props.style).minHeight)).toBeGreaterThanOrEqual(MIN_BUTTON);
    }
    // The note opens from the cards' sheet.
    expect(screen.getByTestId('reading-note-open')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId(`reading-choice-${rightValue(s)}`));
      await flush();
    });
    expect(answers(s).at(-1)!.data).toMatchObject({ via: 'card', correct: true });
    expect(await until(s, () => s.view().stage === 'success')).toBe(true);
  });

  it('a touch job on cards stays on cards: when the doors close, and after SHOW ME points at a thing the landing could show', async () => {
    // Floor 1's antique is the gear in its case (it has a box on the art); the plant and the bench do not.
    const s = await atReading(readingContent('reading.vocabulary.touch', ['thirsty-plant', 'lobby-antique']));
    expect(s.view().reading!.item).toBe('lobby-antique');
    await mount(s, landingArt());
    await fold();
    expect(cards().length).toBeGreaterThan(0);
    const right = String(rightValue(s));
    expect(right).toBe('gear');
    await act(async () => {
      fireEvent.press(screen.getByTestId(`reading-choice-${wrongValue(s)}`));
      await flush();
    });
    expect(await until(s, () => s.view().stage === 'task' && s.view().reading!.accepting)).toBe(true);
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        fireEvent.press(screen.getByLabelText(new RegExp(s.view().help!.label)));
        await s.director.idle();
        await flush();
      });
      if (i === 0) await fold();
    }
    expect(s.view().answerTargets?.objects).toEqual([right]);
    expect(landingTargets()).toHaveLength(0);
    expect(flat(screen.getByTestId(`reading-choice-${right}`).props.style).borderColor).toBe(eq.clue);
    // The doors close: the cards stay (they do not need the landing).
    await act(async () => {
      s.director.pressDoorClose();
      await flush();
    });
    expect(await until(s, () => s.view().elevator.phase === 'idleClosed')).toBe(true);
    expect(cards().length).toBeGreaterThan(0);
    expect(landingTargets()).toHaveLength(0);
  });

  it('a card job: cards lock while the answer is checked, a miss gives the window back, SHOW ME makes one card glow and steps the others back', async () => {
    const s = await atReading(CARDS());
    await mount(s, VECTORS);
    expect(cards()).toHaveLength(0); // the note first
    await fold();
    expect(within(screen.getByTestId('reading-choices')).getByText(s.view().reading!.ask)).toBeTruthy();
    const wrong = String(wrongValue(s));
    const right = String(rightValue(s));
    // Two quick presses: one answer. The cards are locked until the job takes an answer again.
    await act(async () => {
      fireEvent.press(screen.getByTestId(`reading-choice-${wrong}`));
      fireEvent.press(screen.getByTestId(`reading-choice-${right}`));
      await flush();
    });
    expect(answers(s).filter((e) => e.data.via === 'card')).toHaveLength(1);
    expect(screen.getByTestId(`reading-choice-${right}`).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId(`reading-choice-${wrong}`).props.accessibilityState).toMatchObject({ selected: true });
    expect(await until(s, () => s.view().stage === 'task' && s.view().reading!.accepting)).toBe(true);
    expect(screen.getByTestId(`reading-choice-${right}`).props.accessibilityState).toMatchObject({ disabled: false, selected: false });
    // CLUE (the note opens with its key sentence marked), then SHOW ME (the note folds; the card shown glows).
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        fireEvent.press(screen.getByLabelText(new RegExp(s.view().help!.label)));
        await s.director.idle();
        await flush();
      });
      if (i === 0) {
        expect(screen.getByTestId('reading-note')).toBeTruthy();
        await fold();
      }
    }
    const shown = screen.getByTestId(`reading-choice-${right}`);
    expect(flat(shown.props.style).borderColor).toBe(eq.clue);
    expect(shown.props.accessibilityState).toMatchObject({ disabled: false });
    for (const o of s.view().reading!.options.filter((x) => x.value !== right)) expect(screen.getByTestId(`reading-choice-${o.value}`).props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      fireEvent.press(shown);
      await flush();
    });
    expect(await until(s, () => s.view().stage === 'success')).toBe(true);
  });

  it('a ride job: the note stays readable while the panel answers, and the building directory can still be opened', async () => {
    const s = await atReading(RIDE());
    await mount(s, VECTORS);
    expect(screen.getByTestId('reading-note')).toBeTruthy();
    expect(cards()).toHaveLength(0);
    const before = { note: s.view().reading!.open, stage: s.view().stage, item: s.view().reading!.item };
    await act(async () => {
      fireEvent.press(screen.getByLabelText(LINES.directory.open));
      await flush();
    });
    expect(screen.getByText(LINES.directory.title)).toBeTruthy();
    // Opening it is logged and changes no job state: the note stays open, the job is the same.
    expect(s.log.entries().filter((e) => e.kind === 'directory').length).toBeGreaterThan(0);
    expect({ note: s.view().reading!.open, stage: s.view().stage, item: s.view().reading!.item }).toEqual(before);
    // Every floor, top first; only the car's floor says YOU ARE HERE, never the floor the job asks for.
    const rows = screen.getAllByTestId(/^directory-row-\d+$/).map((r) => Number(String(r.props.testID).split('-').pop()));
    expect(rows).toEqual(Array.from({ length: 20 }, (_, i) => 20 - i));
    const here = screen.getAllByText(LINES.directory.here);
    expect(here).toHaveLength(1);
    const car = s.view().elevator.floor;
    expect(screen.getByTestId(`directory-row-${car}`).props.accessibilityValue).toEqual({ text: LINES.directory.here.toLowerCase() });
    const answer = rightValue(s) as number;
    if (answer !== car) expect(screen.getByTestId(`directory-row-${answer}`).props.accessibilityValue).toBeUndefined();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(LINES.directory.back));
      await flush();
    });
    // Back returns straight to the question: the note as it was.
    expect(screen.queryByText(LINES.directory.title)).toBeNull();
    expect(screen.getByTestId('reading-note')).toBeTruthy();
    // The panel answers: the note folds for the ride, and its button can open it again.
    await act(async () => {
      fireEvent(screen.getByLabelText(`Floor ${rightValue(s)}`), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
      await flush();
    });
    expect(await until(s, () => s.view().stage === 'riding')).toBe(true);
    expect(screen.queryByTestId('reading-note')).toBeNull();
    expect(screen.getByTestId('reading-note-open')).toBeTruthy();
    expect(await until(s, () => s.view().stage === 'success')).toBe(true);
  });

  it('every reading control has a role and a label', async () => {
    for (const [content, art] of [[TOUCH_F2, landingArt()], [CARDS, VECTORS]] as const) {
      const s = await atReading(content());
      await mount(s, art);
      const note = screen.getByTestId('reading-note-close');
      expect([note.props.accessibilityRole, note.props.accessibilityLabel]).toEqual(['button', readingLine('noteClose')]);
      await fold();
      const controls = [screen.getByTestId('reading-note-open'), ...landingTargets(), ...cards()];
      expect(controls.length).toBeGreaterThan(1);
      for (const c of controls) expect({ id: c.props.testID, role: c.props.accessibilityRole, labelled: typeof c.props.accessibilityLabel === 'string' && c.props.accessibilityLabel.length > 0 }).toEqual({ id: c.props.testID, role: 'button', labelled: true });
      screen.unmount();
    }
  });

  it.each([
    ['touch', 'reading.details.touch', ['stuck-toolbox', 'drill-first'], () => landingArt()],
    ['cards', 'reading.sentence.cards', ['question-sign', 'whole-sentence'], () => VECTORS],
    ['ride', 'reading.details.ride', ['grow-lights', 'spare-springs'], () => VECTORS],
  ] as const)('%s: nothing on screen depends on which option the content calls right, note open or folded', async (_mode, activityId, items, art) => {
    const seen = async (swap: string | null) => {
      const s = await atReading(readingContent(activityId, items, swap), 'answer-blind');
      await mount(s, art());
      const item = s.view().reading!.item;
      const openWords = shownWords();
      await fold();
      const folded = shownWords();
      const ids = [...landingTargets(), ...cards()].map((n) => n.props.testID as string).sort();
      screen.unmount();
      return { item, openWords, folded, ids };
    };
    const normal = await seen(null);
    const swapped = await seen(normal.item);
    expect(swapped).toEqual(normal);
  });
});
