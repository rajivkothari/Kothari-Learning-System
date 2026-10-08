/// <reference types="node" />
// Reading jobs (M8), headless through the real director, runtime and SQLite. A note says what to do;
// the job is answered by touching a thing on its landing, by a card naming the same thing, by riding
// to a floor, or by a card. Each mode answered right and wrong; a touch and a card for the same
// option write the same learning record; CLUE lights the key sentence; SHOW ME makes the answer
// glow (only it can be chosen then); a second miss brings a fresh item; nothing outside the job's
// answer window answers, and touching the landing's things never writes evidence by itself. The
// authored answer in the prompt never reaches the view. The screen's side is ui/GameScreen.reading.test.tsx.
import { canonicalJson } from '../../../engine';
import { count } from '../../../runtime/testing/harness';
import { LINES } from '../content/floor15';
import { LANDINGS, exploreSpots, landingFor } from '../content/landings';
import { READING, readingHelpLine, readingItem, readingLine, readingMisconceptionLine } from '../content/reading';
import { CONTENT, LEARNER, openSession, settled, tempDir, virtualTime, type Session } from '../testing/headless';
import { activityOf as activity, misreadingOf as misreading, readingContent, rightValue, wrongValue } from '../testing/reading';
import { createFloor15Director } from './director';
import { createPlaytestLog } from './playtestLog';

const TOUCH_F2 = () => readingContent('reading.details.touch', ['stuck-toolbox', 'drill-first']);
const RIDE = () => readingContent('reading.details.ride', ['grow-lights', 'spare-springs']);
const CARDS = () => readingContent('reading.sentence.cards', ['question-sign', 'whole-sentence']);

/** Wake the lift, do the first job right, and wait at the first reading job (doors open, its window open). */
async function atReading(content: typeof CONTENT, opts: { motion?: 'normal' | 'reduced'; autoHallCalls?: boolean; instanceId?: string } = {}): Promise<Session> {
  const tmp = tempDir();
  cleanups.push(tmp.cleanup);
  const s = await openSession(tmp.file, virtualTime(), { content, ...opts });
  sessions.push(s);
  s.director.pressDoorOpen();
  if (opts.autoHallCalls === false) {
    // The first job's floor calls the lift: take the call, as a learner would.
    expect(await s.time.runUntil(() => s.view().stage === 'call' || (settled(s)() && s.view().stage === 'task'))).toBe(true);
    if (s.view().stage === 'call') s.director.pressFloor(s.view().hallCall!);
  }
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
  expect(s.view().task?.stepId).toBe('cued-moves');
  s.director.pressFloor(rightValue(s) as number);
  if (opts.autoHallCalls === false) {
    expect(await s.time.runUntil(() => s.view().task?.stepId === 'read-1' && (s.view().stage === 'call' || settled(s)()))).toBe(true);
    return s;
  }
  expect(await s.time.runUntil(() => s.view().task?.stepId === 'read-1' && settled(s)() && s.view().reading?.accepting === true)).toBe(true);
  return s;
}

const sessions: Session[] = [];
const cleanups: (() => void)[] = [];
afterEach(async () => {
  for (const s of sessions.splice(0)) {
    s.director.dispose();
    await s.db.close();
  }
  for (const c of cleanups.splice(0)) c();
});

const attempts = (s: Session) => count(s.db, "SELECT COUNT(*) AS n FROM learning_events WHERE type = 'attempt'");
const records = async (s: Session) => (await s.db.all<{ type: string; payload: string }>('SELECT type, payload FROM learning_events ORDER BY seq')).map((r) => ({ type: r.type, payload: JSON.parse(r.payload) as unknown }));
const answered = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer');
const discarded = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer.discarded');
const words = (s: Session) => readingItem(READING, s.view().reading!.item)!;
/**
 * After an answer: the job has its feedback (a success, the same job waiting again, or a fresh item's
 * pause). A ride's answer is locked as the car leaves, so this waits for the answer itself first.
 */
const feedback = (s: Session) => {
  const before = answered(s).length;
  return () => answered(s).length > before && !s.view().saving && (s.view().stage === 'success' || s.view().stage === 'pause' || (s.view().stage === 'task' && s.view().reading?.accepting === true));
};
/** Give an answer (`act`) and wait for its feedback. */
const answer = (s: Session, act: () => void) => {
  const done = feedback(s);
  act();
  return s.time.runUntil(done);
};

describe('reading jobs: touch a thing on the landing', () => {
  it('opens the note on the job\'s landing, its things are the answer targets, and the panel stays locked', async () => {
    const s = await atReading(TOUCH_F2());
    const v = s.view();
    const w = words(s);
    expect(v.task?.kind).toBe('read');
    expect(v.elevator.floor).toBe(2);
    expect(v.reading).toMatchObject({ mode: 'touch', floor: 2, title: w.source, lines: w.passage, ask: w.ask, open: true, highlight: null, accepting: true });
    expect(v.reading!.options.map((o) => o.label).sort()).toEqual(Object.values(w.options!).sort());
    expect(v.answerTargets).toEqual({ floor: 2, objects: activity(s).options.map((o) => String(o.value)) });
    expect(v.elevator.panelEnabled).toBe(false);
    expect(v.lifty.line).toBe(w.ask);
    // CLUE can be asked for at once (the text is the help).
    expect(v.help?.label).toBeTruthy();
    s.director.closeNote();
    expect(s.view().reading!.open).toBe(false);
    s.director.openNote();
    expect(s.view().reading!.open).toBe(true);
  });

  it('a right touch: the job is done with the world\'s words, one attempt recorded, NEXT JOB waits', async () => {
    const s = await atReading(TOUCH_F2());
    const done = words(s).done;
    const before = await attempts(s);
    s.director.touchObject(rightValue(s) as string);
    expect(s.view().stage).toBe('riding');
    expect(s.view().reading!.accepting).toBe(false);
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    expect(s.view().reading).toBeNull();
    expect(s.view().answerTargets).toBeNull();
    expect(s.view().lifty.line).toContain(done);
    expect(await attempts(s)).toBe(before + 1);
    expect(answered(s).at(-1)!.data).toMatchObject({ via: 'touch', correct: true });
  });

  it('a wrong touch: the thing touched is named, one cue, then the same job takes a fresh window', async () => {
    const s = await atReading(TOUCH_F2());
    const item = s.view().reading!.item;
    const signature = activity(s).itemSignature;
    const wrong = wrongValue(s) as string;
    const label = s.view().reading!.options.find((o) => o.value === wrong)!.label;
    const misconception = misreading(s, wrong);
    expect(await answer(s, () => s.director.touchObject(wrong))).toBe(true);
    const v = s.view();
    expect(v.stage).toBe('task');
    expect(v.lifty.mood).toBe('concerned');
    expect(v.lifty.line).toBe(`${readingLine('touched', { label })} ${readingMisconceptionLine(misconception) ?? readingLine('again')}`);
    expect(v.reading!.item).toBe(item);
    expect(activity(s).itemSignature).toBe(signature);
    expect(v.reading!.options.find((o) => o.value === wrong)!.tried).toBe(true);
    expect(v.task!.wrongTries).toBe(1);
    // CLUE is offered now.
    expect(v.help?.offered).toBe(true);
    // A thing with its own reaction played it (the consequence of the touch).
    const spot = exploreSpots(LANDINGS, 2).find((x) => x.target === wrong);
    if (spot) expect(v.reaction?.spotId).toBe(spot.id);
    // The window is open again: a right touch now finishes the job.
    s.director.touchObject(rightValue(s) as string);
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    expect(await attempts(s)).toBeGreaterThanOrEqual(2);
  });

  it('a touch and a card for the same option write the same learning record', async () => {
    const play = async (via: 'touch' | 'card') => {
      const s = await atReading(TOUCH_F2(), { instanceId: 'reading-parity' });
      const wrong = wrongValue(s) as string;
      expect(await answer(s, () => (via === 'touch' ? s.director.touchObject(wrong) : s.director.chooseReading(wrong)))).toBe(true);
      const right = rightValue(s) as string;
      if (via === 'touch') s.director.touchObject(right);
      else s.director.chooseReading(right);
      expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
      return { records: await records(s), state: canonicalJson(await s.rt.learnerState(LEARNER)) };
    };
    const touch = await play('touch');
    const card = await play('card');
    expect(touch.records.length).toBeGreaterThan(0);
    expect(card).toEqual(touch);
  });

  it('touching the landing\'s things while the hall call waits only makes them react: no answer, no evidence, no discovery', async () => {
    const s = await atReading(TOUCH_F2(), { autoHallCalls: false });
    expect(s.view().stage).toBe('call');
    expect(s.view().answerTargets).toBeNull();
    const events = await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events');
    const memory = await count(s.db, 'SELECT COUNT(*) AS n FROM world_memory');
    // The car is still on the first job's floor: touch whatever can be touched there, and pick a card.
    const here = exploreSpots(LANDINGS, s.view().elevator.floor);
    for (const spot of here) {
      s.director.touchObject(spot.target);
      s.director.inspect(spot.id);
    }
    s.director.chooseReading('toolbox');
    s.director.touchObject('toolbox');
    await s.time.advance(2000);
    expect(answered(s)).toHaveLength(1); // the first job's floor only
    expect(await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events')).toBe(events);
    expect(await count(s.db, 'SELECT COUNT(*) AS n FROM world_memory')).toBe(memory);
    expect(s.view().stage).toBe('call');
  });
});

describe('reading jobs: ride to a floor', () => {
  it('a right floor: the panel answers it like a move, the note folds for the ride, and the floor shows first', async () => {
    const s = await atReading(RIDE());
    const v = s.view();
    expect(v.task?.kind).toBe('panel');
    expect(v.reading).toMatchObject({ mode: 'ride', floor: null, open: true, options: [] });
    expect(v.answerTargets).toBeNull();
    expect(v.elevator.panelEnabled).toBe(true);
    const floor = rightValue(s) as number;
    s.director.pressFloor(floor);
    expect(await s.time.runUntil(() => s.view().stage === 'riding')).toBe(true);
    expect(s.view().reading!.open).toBe(false);
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    expect(s.view().elevator.floor).toBe(floor);
    expect(s.view().success).toBe('arrival');
  });

  it('a wrong floor: the place reached is named with one cue, then the same job from there; a second miss brings a fresh item', async () => {
    const s = await atReading(RIDE());
    const first = s.view().reading!.item;
    const wrong = wrongValue(s) as number;
    expect(await answer(s, () => s.director.pressFloor(wrong))).toBe(true);
    let v = s.view();
    expect(v.stage).toBe('task');
    expect(v.elevator.floor).toBe(wrong);
    const place = landingFor(LANDINGS, wrong, { restored: () => false }).name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
    expect(v.lifty.line).toBe(`${readingLine('arrived', { floor: wrong, place })} ${readingMisconceptionLine(misreading(s, wrong)) ?? readingLine('again')}`);
    expect(v.elevator.panelEnabled).toBe(true);
    expect(v.reading!.item).toBe(first);
    const signature = activity(s).itemSignature;
    // The second miss: the job pauses on its consequence, locked, then a fresh item comes.
    s.director.pressFloor(wrongValue(s, [wrong]) as number);
    expect(await s.time.runUntil(() => s.view().stage === 'pause')).toBe(true);
    v = s.view();
    expect(v.reading!.item).toBe(first); // still the missed job's note while its consequence shows
    expect(v.reading!.accepting).toBe(false);
    expect(v.help).toBeNull();
    expect(await s.time.runUntil(() => settled(s)() && s.view().reading?.accepting === true)).toBe(true);
    expect(activity(s).itemSignature).not.toBe(signature);
    expect(s.view().reading!.item).not.toBe(first);
    expect(s.view().task!.wrongTries).toBe(0);
  });
});

describe('reading jobs: pick a card', () => {
  it('right and wrong: a card answers only while the window is open; the miss gets one cue, then a fresh window', async () => {
    const s = await atReading(CARDS());
    const v = s.view();
    expect(v.task?.kind).toBe('read');
    expect(v.reading).toMatchObject({ mode: 'choose', floor: null, open: true });
    expect(v.reading!.options).toHaveLength(activity(s).options.length);
    expect(v.answerTargets).toBeNull();
    const wrong = wrongValue(s) as string;
    const right = rightValue(s) as string;
    // Rapid taps: the second card in the same moment is outside the window.
    expect(
      await answer(s, () => {
        s.director.chooseReading(wrong);
        s.director.chooseReading(right);
      }),
    ).toBe(true);
    expect(answered(s)).toHaveLength(2); // the first job's floor, and this card
    expect(answered(s).at(-1)!.data).toMatchObject({ value: wrong, via: 'card', correct: false });
    expect(discarded(s).at(-1)!.data).toMatchObject({ value: right, reason: 'noWindow' });
    expect(s.view().lifty.line).toBe(readingMisconceptionLine(misreading(s, wrong)) ?? readingLine('again'));
    expect(s.view().reading!.accepting).toBe(true);
    s.director.chooseReading(rightValue(s) as string);
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    expect(answered(s).at(-1)!.data).toMatchObject({ via: 'card', correct: true });
  });
});

describe('reading help', () => {
  it('CLUE lights the key sentence and opens the note', async () => {
    const s = await atReading(TOUCH_F2());
    s.director.closeNote();
    s.director.requestHelp();
    await s.director.idle();
    const v = s.view();
    expect(v.reading!.highlight).toBe(words(s).key);
    expect(v.reading!.open).toBe(true);
    expect(v.lifty.line).toBe(readingHelpLine('highlightGiven', 'touch'));
    // CLUE is no answer: the window is still open.
    expect(v.reading!.accepting).toBe(true);
  });

  it('SHOW ME after a miss: the answer glows, the note folds, and only it can be chosen; a touch on it finishes the job', async () => {
    const s = await atReading(TOUCH_F2());
    const right = rightValue(s) as string;
    expect(await answer(s, () => s.director.touchObject(wrongValue(s) as string))).toBe(true);
    // Before SHOW ME nothing says which option is right.
    expect(s.view().reading!.options.every((o) => !o.shown)).toBe(true);
    s.director.requestHelp(); // CLUE
    await s.director.idle();
    s.director.requestHelp(); // SHOW ME
    await s.director.idle();
    const v = s.view();
    expect(v.reading!.options.filter((o) => o.shown).map((o) => o.value)).toEqual([right]);
    expect(v.reading!.open).toBe(false);
    expect(v.answerTargets).toEqual({ floor: 2, objects: [right] });
    const label = v.reading!.options.find((o) => o.shown)!.label;
    expect(v.lifty.line).toBe(readingHelpLine('showAnswer', 'touch', { label }));
    // Another card is not the one shown: ignored, nothing recorded.
    const before = await attempts(s);
    s.director.chooseReading(v.reading!.options.find((o) => !o.shown)!.value);
    await s.time.advance(1000);
    expect(await attempts(s)).toBe(before);
    expect(discarded(s).at(-1)!.data).toMatchObject({ reason: 'notShown' });
    s.director.touchObject(right);
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    expect(await attempts(s)).toBe(before + 1);
  });

  it('SHOW ME on a ride rings the floor on the panel', async () => {
    const s = await atReading(RIDE());
    const right = rightValue(s) as number;
    expect(await answer(s, () => s.director.pressFloor(wrongValue(s) as number))).toBe(true);
    s.director.requestHelp();
    await s.director.idle();
    s.director.requestHelp();
    await s.director.idle();
    expect(s.view().highlights).toEqual([right]);
    expect(s.view().lifty.line).toBe(readingHelpLine('showAnswer', 'ride', { revealed: right }));
  });

  it('coming back to a job after CLUE and SHOW ME keeps the clue lit and the answer shown', async () => {
    const s = await atReading(TOUCH_F2());
    const right = rightValue(s) as string;
    expect(await answer(s, () => s.director.touchObject(wrongValue(s) as string))).toBe(true);
    s.director.requestHelp();
    await s.director.idle();
    s.director.requestHelp();
    await s.director.idle();
    s.director.dispose();
    const director = createFloor15Director({ runtime: s.rt, learnerId: LEARNER, instanceId: s.director.instanceId(), clock: s.time, schedule: (fn, ms) => s.time.schedule(fn, ms), motion: 'normal', log: createPlaytestLog() });
    await director.start();
    expect(await s.time.runUntil(() => director.getView().stage === 'task')).toBe(true);
    const v = director.getView();
    expect(v.reading!.highlight).toBe(readingItem(READING, v.reading!.item)!.key);
    expect(v.reading!.options.filter((o) => o.shown).map((o) => o.value)).toEqual([right]);
    expect(v.reading!.open).toBe(false);
    expect(v.answerTargets?.objects).toEqual([right]);
    director.dispose();
  });
});

describe('reading jobs: the edges', () => {
  it('a card job missed twice: its own cards stay, locked, while the miss shows; then a fresh item with its own cards', async () => {
    const s = await atReading(CARDS());
    const first = s.view().reading!;
    const wrong = wrongValue(s) as string;
    expect(await answer(s, () => s.director.chooseReading(wrong))).toBe(true);
    expect(await answer(s, () => s.director.chooseReading(wrongValue(s, [wrong]) as string))).toBe(true);
    const paused = s.view();
    expect(paused.stage).toBe('pause');
    expect(paused.reading!.item).toBe(first.item);
    expect(paused.reading!.options.map((o) => o.value).sort()).toEqual(first.options.map((o) => o.value).sort());
    expect(paused.reading!.accepting).toBe(false);
    // A card during the pause answers nothing.
    const before = await attempts(s);
    s.director.chooseReading(first.options[0]!.value);
    expect(await attempts(s)).toBe(before);
    // The note can still be read during the pause.
    s.director.closeNote();
    s.director.openNote();
    expect(s.view().reading!.open).toBe(true);
    expect(await s.time.runUntil(() => s.view().stage === 'task' && s.view().reading?.accepting === true)).toBe(true);
    const fresh = s.view().reading!;
    expect(fresh.item).not.toBe(first.item);
    expect(fresh.options.map((o) => o.value).sort()).toEqual(activity(s).options.map((o) => String(o.value)).sort());
    expect(fresh.open).toBe(true);
    expect(fresh.highlight).toBeNull();
  });

  it('during a ride job the landing\'s things do nothing: no reaction, no answer, no evidence', async () => {
    const s = await atReading(RIDE());
    const floor = s.view().elevator.floor;
    const events = await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events');
    for (const spot of exploreSpots(LANDINGS, floor)) {
      s.director.touchObject(spot.target);
      s.director.inspect(spot.id);
    }
    await s.time.advance(1500);
    expect(s.view().reaction).toBeNull();
    expect(s.view().stage).toBe('task');
    expect(await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events')).toBe(events);
    expect(s.view().reading!.accepting).toBe(true);
  });

  it('under Reduced Motion a touch answer gets its feedback after a short beat (no ride, no long motion)', async () => {
    const s = await atReading(TOUCH_F2(), { motion: 'reduced' });
    const start = s.time.now();
    expect(await answer(s, () => s.director.touchObject(wrongValue(s) as string))).toBe(true);
    expect(s.time.now() - start).toBeLessThanOrEqual(250);
    expect(s.view().elevator.floor).toBe(2);
  });

  it('the panel stays locked for a touch or card job: a floor press is not an answer', async () => {
    const s = await atReading(TOUCH_F2());
    const before = answered(s).length;
    s.director.pressFloor(9);
    await s.time.advance(3000);
    expect(answered(s)).toHaveLength(before);
    expect(s.view().elevator.floor).toBe(2);
    expect(s.view().elevator.destination).toBeNull();
  });
});

describe('reading jobs never read the authored answer', () => {
  it.each([
    ['touch', 'reading.details.touch', ['stuck-toolbox', 'drill-first']],
    ['ride', 'reading.details.ride', ['grow-lights', 'spare-springs']],
    ['cards', 'reading.sentence.cards', ['question-sign', 'whole-sentence']],
  ] as const)('%s: the note, its options and Lifty\'s words are the same whichever option the content calls right', async (_mode, activityId, items) => {
    const shown = async (swap: string | null) => {
      const s = await atReading(readingContent(activityId, items, swap), { instanceId: 'answer-blind' });
      const v = s.view();
      const reading = { ...v.reading!, options: [...v.reading!.options].map(({ optionId: _id, ...o }) => o).sort((a, b) => a.value.localeCompare(b.value)) };
      return { item: v.reading!.item, reading, lifty: v.lifty.line, targets: v.answerTargets ? [...v.answerTargets.objects].sort() : null, highlights: v.highlights };
    };
    const normal = await shown(null);
    const swapped = await shown(normal.item);
    expect(swapped).toEqual(normal);
  });
});

describe('the reading copy covers what the jobs say', () => {
  it('every help kind and every misreading the reading activities can show has words', () => {
    const reading = CONTENT.pack.activities.filter((a) => a.generator.id === 'literacy.authoredItem');
    const policies = new Set(reading.map((a) => a.scaffoldingPolicy));
    const kinds = CONTENT.pack.scaffoldingPolicies.filter((p) => policies.has(p.id)).flatMap((p) => p.steps.map((s) => s.kind));
    expect(kinds.sort()).toEqual(['highlightGiven', 'showAnswer']);
    for (const kind of kinds) for (const mode of ['touch', 'ride', 'choose'] as const) expect(readingHelpLine(kind, mode, { label: 'x', revealed: 1 })).toBeTruthy();
    const tags = new Set(reading.flatMap((a) => ((a.params as { items: { distractors: { misconception?: string }[] }[] }).items).flatMap((i) => i.distractors.flatMap((d) => (d.misconception ? [d.misconception] : [])))));
    for (const tag of tags) expect(readingMisconceptionLine(tag)).toBeTruthy();
    for (const key of ['touched', 'arrived', 'again', 'noteOpen', 'noteClose', 'cards']) expect(READING.lines[key]).toBeTruthy();
    expect(LINES.regenerated).toBeTruthy();
  });
});
