/// <reference types="node" />
// The building directory and the words around a reading job (M8.1), headless through the real
// director, runtime and SQLite. A ride that names places ("two floors above the Archive") is found
// with the directory: Lifty introduces it once per learner, the first time such a job comes, and
// never to a learner who already opened it. Opening and closing the directory changes nothing about
// a job: its answer window, help and evidence stay exactly as they were. CLUE says the item's own
// strategy line and the note's bold words are the item's clue words; neither ever names the answer.
// Sounds: one answerRight as a success begins, one answerWrong as a miss is shown, one discovery.
import { count } from '../../../runtime/testing/harness';
import { FLOOR15, LINES } from '../content/floor15';
import { LANDINGS, exploreSpots } from '../content/landings';
import { READING, answerGiveaways, giveawaysIn, readingItem, readingMarks } from '../content/reading';
import { computeLayout } from '../ui/layout';
import { fitLine, liftyContext, liftyPlacement } from '../ui/liftyPlacement';
import { CONTENT, LEARNER, answerCorrectly, openSession, settled, solve, tempDir, virtualTime, type Session, type VirtualTime } from '../testing/headless';
import { activityOf, readingContent, rightValue, wrongValue } from '../testing/reading';
import { DIRECTORY_TIP, createFloor15Director, type DirectorView } from './director';
import { createPlaytestLog } from './playtestLog';

/** Two rides that name places (each needs the directory). */
const PLACES = () => readingContent('reading.details.ride', ['kit-above-archive', 'grow-lights']);
/** A ride that names only floors (no directory needed), then one that names places. */
const FLOORS_FIRST = () => readingContent('reading.inference.ride', ['painter-and-plumber', 'lost-toy-between']);
const TOUCH = () => readingContent('reading.details.touch', ['stuck-toolbox', 'left-fan-only']);

const sessions: Session[] = [];
const cleanups: (() => void)[] = [];
afterEach(async () => {
  for (const s of sessions.splice(0)) {
    s.director.dispose();
    await s.db.close().catch(() => undefined);
  }
  for (const c of cleanups.splice(0)) c();
});

async function open(content: typeof CONTENT, opts: { file?: string; time?: VirtualTime; instanceId?: string } = {}): Promise<Session> {
  let file = opts.file;
  if (!file) {
    const tmp = tempDir();
    cleanups.push(tmp.cleanup);
    file = tmp.file;
  }
  const s = await openSession(file, opts.time ?? virtualTime(), { content, ...(opts.instanceId ? { instanceId: opts.instanceId } : {}) });
  sessions.push(s);
  return s;
}

/** Wake the lift and wait at the first job (cued-moves), settled. */
async function atFirstJob(s: Session) {
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
  expect(s.view().task?.stepId).toBe('cued-moves');
}

/** Do the first job right, and wait at the first reading job with its window open. */
async function toReading(s: Session) {
  s.director.pressFloor(rightValue(s) as number);
  expect(await s.time.runUntil(() => s.view().task?.stepId === 'read-1' && settled(s)() && s.view().reading?.accepting === true)).toBe(true);
}

const tips = (s: Session) => s.db.all<{ memory_key: string }>("SELECT memory_key FROM world_memory WHERE memory_key = 'eq.tip.directory'");
const evidence = async (s: Session) => ({
  events: await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events'),
  progression: await count(s.db, 'SELECT COUNT(*) AS n FROM progression_events'),
});
const answered = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer');
const cues = (s: Session, slot: string) => s.audio.filter((c) => c.action === 'play' && (c.slot as string) === slot).length;

/** What the learner's job is made of. Opening the directory must leave every part of it alone. */
function jobState(s: Session) {
  const v: DirectorView = s.view();
  const a = activityOf(s);
  return {
    stage: v.stage,
    task: v.task,
    help: v.help,
    reading: v.reading,
    highlights: v.highlights,
    answerTargets: v.answerTargets,
    countAlong: v.countAlong,
    mismatch: v.mismatch,
    shaftMode: v.shaftMode,
    beacon: v.beacon,
    panel: { enabled: v.elevator.panelEnabled, lit: v.elevator.lit, disabled: v.elevator.disabledFloors, floor: v.elevator.floor, phase: v.elevator.phase },
    lifty: v.lifty,
    saving: v.saving,
    item: a.itemSignature,
    wrongTries: a.wrongTries,
    scaffolds: a.scaffolds,
  };
}

describe('the directory introduction', () => {
  it('comes once, with the first job that needs the directory: Lifty says it after the job, and the DIRECTORY control pulses', async () => {
    const s = await open(PLACES());
    await atFirstJob(s);
    // A math job naming no place: no introduction.
    expect(s.view().directoryHint).toBe(false);
    expect(s.view().lifty.line).not.toContain(LINES.directory.intro);
    const before = await evidence(s);
    await toReading(s);
    const v = s.view();
    const w = readingItem(READING, v.reading!.item)!;
    expect(w.places?.length).toBeGreaterThan(0);
    expect(v.lifty.line).toBe(`${w.ask} ${LINES.directory.intro}`);
    expect(v.directoryHint).toBe(true);
    await s.director.idle();
    expect(await tips(s)).toHaveLength(1);
    // World memory only: nothing about learning was written by the introduction.
    expect((await evidence(s)).progression).toBe(before.progression);
    expect(s.log.entries().filter((e) => e.kind === 'tip' && e.data.key === DIRECTORY_TIP)).toHaveLength(1);

    // Opening the directory ends the pulse. Closing it changes nothing more.
    s.director.directoryOpened();
    expect(s.view().directoryHint).toBe(false);
    s.director.directoryClosed();
    expect(s.log.entries().filter((e) => e.kind === 'directory').map((e) => e.data.open)).toEqual([true, false]);

    // Two misses bring a fresh ride that names places too: no second introduction.
    const first = v.reading!.item;
    const wrong = wrongValue(s) as number;
    s.director.pressFloor(wrong);
    expect(await s.time.runUntil(() => answered(s).length === 2 && settled(s)() && s.view().reading?.accepting === true)).toBe(true);
    s.director.pressFloor(wrongValue(s, [wrong]) as number);
    expect(await s.time.runUntil(() => s.view().reading !== null && s.view().reading!.item !== first && settled(s)() && s.view().reading!.accepting)).toBe(true);
    const fresh = readingItem(READING, s.view().reading!.item)!;
    expect(fresh.places?.length).toBeGreaterThan(0);
    expect(s.view().lifty.line).toBe(fresh.ask);
    expect(s.view().directoryHint).toBe(false);
    await s.director.idle();
    expect(await tips(s)).toHaveLength(1);
  });

  it('ends with the job when the learner never opens it, and never comes back for that learner (a new session)', async () => {
    const tmp = tempDir();
    cleanups.push(tmp.cleanup);
    const time = virtualTime();
    const s = await open(PLACES(), { file: tmp.file, time });
    await atFirstJob(s);
    await toReading(s);
    expect(s.view().directoryHint).toBe(true);
    s.director.pressFloor(rightValue(s) as number);
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    expect(s.view().directoryHint).toBe(false);
    await s.director.idle();
    s.director.dispose();
    // The same learner comes back to a ride that needs the directory: Lifty says the job only.
    const again = createFloor15Director({ runtime: s.rt, learnerId: LEARNER, instanceId: s.director.instanceId(), clock: time, schedule: (fn, ms) => time.schedule(fn, ms), motion: 'normal', log: createPlaytestLog() });
    await again.start();
    expect(await time.runUntil(() => again.getView().stage === 'task' || again.getView().stage === 'success')).toBe(true);
    expect(again.getView().directoryHint).toBe(false);
    expect(again.getView().lifty.line).not.toContain(LINES.directory.intro);
    again.dispose();
  });

  it('never interrupts a learner who opened the directory first', async () => {
    const s = await open(PLACES());
    await atFirstJob(s);
    // Opened during the first job, before any job needed it.
    s.director.directoryOpened();
    s.director.directoryClosed();
    await toReading(s);
    expect(s.view().directoryHint).toBe(false);
    expect(s.view().lifty.line).toBe(readingItem(READING, s.view().reading!.item)!.ask);
    expect(s.log.entries().filter((e) => e.kind === 'tip' && e.data.key === DIRECTORY_TIP)).toHaveLength(0);
    await s.director.idle();
    expect(await tips(s)).toHaveLength(1); // remembered when it was opened
  });

  it('is not said while the directory is open, even the first time', async () => {
    const s = await open(PLACES(), { instanceId: 'directory-open' });
    await atFirstJob(s);
    s.director.directoryOpened();
    await toReading(s);
    expect(s.view().directoryHint).toBe(false);
    expect(s.view().lifty.line).not.toContain(LINES.directory.intro);
  });

  it('a ride that names only floors needs no directory; the first ride naming places brings it', async () => {
    const s = await open(FLOORS_FIRST());
    await atFirstJob(s);
    await toReading(s);
    expect(s.view().reading!.item).toBe('painter-and-plumber');
    expect(s.view().directoryHint).toBe(false);
    expect(s.view().lifty.line).toBe(readingItem(READING, 'painter-and-plumber')!.ask);
    // Missed twice: the fresh ride names places, and the introduction comes with it.
    const wrong = wrongValue(s) as number;
    s.director.pressFloor(wrong);
    expect(await s.time.runUntil(() => answered(s).length === 2 && settled(s)() && s.view().reading?.accepting === true)).toBe(true);
    s.director.pressFloor(wrongValue(s, [wrong]) as number);
    expect(await s.time.runUntil(() => s.view().reading?.item === 'lost-toy-between' && settled(s)() && s.view().reading!.accepting)).toBe(true);
    expect(s.view().directoryHint).toBe(true);
    expect(s.view().lifty.line).toBe(`${readingItem(READING, 'lost-toy-between')!.ask} ${LINES.directory.intro}`);
  });

  it('every line Lifty says with it fits the bubble on a Fire HD 8 (a resume included)', () => {
    const view = { stage: 'task', shaftMode: 'status', highlights: [], countAlong: null, task: { kind: 'panel' } } as unknown as DirectorView;
    for (const w of Object.values(READING.items).filter((x) => x.places?.length)) {
      for (const line of [`${w.ask} ${LINES.directory.intro}`, `${LINES.resume} ${w.ask} ${LINES.directory.intro}`, w.clue!]) {
        for (const [name, width, height] of [['landscape', 960, 600], ['portrait', 600, 960]] as const) {
          const bubble = liftyPlacement(computeLayout({ width, height }, { top: 0, right: 0, bottom: 0, left: 0 }), liftyContext(view), { help: true }).bubble;
          expect({ name, line, fits: fitLine(line, bubble) !== null }).toEqual({ name, line, fits: true });
        }
      }
    }
  });
});

describe('opening the directory changes nothing about the job', () => {
  it('a reading ride: the same job, window, help and evidence; the answer still counts, independent', async () => {
    const s = await open(PLACES());
    await atFirstJob(s);
    await toReading(s);
    // A miss first, so help is on offer and the job has history.
    const wrong = wrongValue(s) as number;
    s.director.pressFloor(wrong);
    expect(await s.time.runUntil(() => answered(s).length === 2 && settled(s)() && s.view().reading?.accepting === true)).toBe(true);
    expect(s.view().help?.offered).toBe(true);
    const before = jobState(s);
    const records = await evidence(s);
    const windows = s.log.entries().filter((e) => e.kind === 'answer.window').length;
    for (let i = 0; i < 3; i++) {
      s.director.directoryOpened();
      await s.time.advance(1500);
      s.director.directoryClosed();
    }
    await s.director.idle();
    expect(jobState(s)).toEqual(before);
    expect(await evidence(s)).toEqual(records);
    expect(s.log.entries().filter((e) => e.kind === 'answer.window')).toHaveLength(windows);
    // The window is still the same one: the right floor answers the job.
    s.director.pressFloor(rightValue(s) as number);
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    const rows = await s.db.all<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq");
    // A right answer after a miss, with no help: the directory is not assistance.
    expect(JSON.parse(rows.at(-1)!.payload)).toMatchObject({ outcome: 'correct', assistance: 'retry' });
  });

  it('a math job: the same job, window, help and evidence, opened in the middle of choosing a floor too', async () => {
    const s = await open(CONTENT);
    await atFirstJob(s);
    const before = jobState(s);
    const records = await evidence(s);
    s.director.directoryOpened();
    s.director.directoryClosed();
    await s.director.idle();
    expect(jobState(s)).toEqual(before);
    expect(await evidence(s)).toEqual(records);
    // A floor lit, then the directory checked before the doors close: the choice stands and answers.
    s.director.pressFloor(solve(s));
    s.director.directoryOpened();
    s.director.directoryClosed();
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    const rows = await s.db.all<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq");
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({ outcome: 'correct', assistance: 'independent' });
  });

  it('a touch job, and between jobs: nothing changes and nothing is recorded', async () => {
    const s = await open(TOUCH());
    await atFirstJob(s);
    await toReading(s);
    const before = jobState(s);
    const records = await evidence(s);
    s.director.directoryOpened();
    s.director.directoryClosed();
    await s.director.idle();
    expect(jobState(s)).toEqual(before);
    expect(await evidence(s)).toEqual(records);
    expect(s.view().directoryHint).toBe(false); // a touch job never needs the directory
  });
});

describe('CLUE and the bold words never give the answer away', () => {
  it('CLUE says the ride\'s own strategy line, lights the key sentence, rings no floor, and counts as a clue', async () => {
    const s = await open(PLACES());
    await atFirstJob(s);
    await toReading(s);
    const w = readingItem(READING, s.view().reading!.item)!;
    const right = rightValue(s) as number;
    s.director.requestHelp();
    await s.director.idle();
    expect(s.view().lifty.line).toBe(w.clue);
    expect(s.view().lifty.line).not.toMatch(new RegExp(`\\b${right}\\b`));
    expect(s.view().reading!.highlight).toBe(w.key);
    expect(s.view().highlights).toEqual([]);
    expect(s.view().reading!.accepting).toBe(true);
    s.director.pressFloor(right);
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    const rows = await s.db.all<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq");
    expect(JSON.parse(rows.at(-1)!.payload)).toMatchObject({ outcome: 'correct', assistance: 'clue' });
  });

  it('the view carries the bold words as ranges, and none of them covers the answer', async () => {
    for (const content of [PLACES(), TOUCH()]) {
      const s = await open(content, { instanceId: `marks-${sessions.length}` });
      await atFirstJob(s);
      await toReading(s);
      const r = s.view().reading!;
      const w = readingItem(READING, r.item)!;
      expect({ lineMarks: r.lineMarks, askMarks: r.askMarks }).toEqual(readingMarks(w));
      expect(r.lineMarks).toHaveLength(r.lines.length);
      expect(r.lineMarks.flat().length + r.askMarks.length).toBeGreaterThan(0);
      const a = activityOf(s);
      const right = rightValue(s);
      const wrongs = a.answer.mode === 'value' ? [] : a.options.map((o) => String(o.value)).filter((v) => v !== right);
      const giveaways = answerGiveaways(w, right, wrongs);
      const bold = [...r.lineMarks.flatMap((m, i) => m.map(([b, e]) => r.lines[i]!.slice(b, e))), ...r.askMarks.map(([b, e]) => r.ask.slice(b, e))];
      for (const text of bold) expect({ text, said: giveawaysIn(text, giveaways) }).toEqual({ text, said: [] });
    }
  });
});

describe('sounds', () => {
  it('a right answer: one answerRight as the success begins; a wrong one: one answerWrong as the miss shows', async () => {
    const s = await open(PLACES());
    await atFirstJob(s);
    await toReading(s);
    s.director.pressFloor(wrongValue(s) as number);
    expect(await s.time.runUntil(() => answered(s).length === 2 && settled(s)() && s.view().reading?.accepting === true)).toBe(true);
    expect([cues(s, 'answerRight'), cues(s, 'answerWrong')]).toEqual([1, 1]); // the first job, then this miss
    s.director.pressFloor(rightValue(s) as number);
    expect(await s.time.runUntil(() => s.view().stage === 'success')).toBe(true);
    await s.time.advance(10_000);
    expect([cues(s, 'answerRight'), cues(s, 'answerWrong')]).toEqual([2, 1]);
  });

  it('a first discovery plays discovery once; touching it again plays only its own sound', async () => {
    const s = await open(CONTENT);
    await atFirstJob(s);
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    s.director.pressFloor(FLOOR15.repairFloor);
    expect(await s.time.runUntil(() => s.view().stage === 'freeRide' && s.view().elevator.phase === 'idleOpen')).toBe(true);
    const floor = 18;
    s.director.pressFloor(floor);
    expect(await s.time.runUntil(() => s.view().elevator.floor === floor && s.view().elevator.phase === 'idleOpen')).toBe(true);
    const spot = exploreSpots(LANDINGS, floor)[0]!;
    const own = (spot as { sound?: string }).sound ?? 'landingReaction';
    const ownBefore = cues(s, own);
    s.director.touchObject(spot.target);
    expect(cues(s, 'discovery')).toBe(1);
    expect(cues(s, own)).toBe(ownBefore + 1);
    await s.time.advance(5000);
    s.director.touchObject(spot.target);
    expect(cues(s, 'discovery')).toBe(1);
    expect(cues(s, own)).toBe(ownBefore + 2);

    // A thing that opens plays its own sound opening, and its closing sound shutting.
    s.director.pressFloor(2);
    expect(await s.time.runUntil(() => s.view().elevator.floor === 2 && s.view().elevator.phase === 'idleOpen')).toBe(true);
    const box = exploreSpots(LANDINGS, 2).find((x) => x.reaction === 'open')!;
    expect([box.sound, box.closeSound]).toEqual(['toolboxOpen', 'toolboxClose']);
    const [opens, shuts] = [cues(s, 'toolboxOpen'), cues(s, 'toolboxClose')];
    s.director.touchObject(box.target);
    expect([cues(s, 'toolboxOpen') - opens, cues(s, 'toolboxClose') - shuts]).toEqual([1, 0]);
    await s.time.advance(2000);
    s.director.touchObject(box.target);
    expect([cues(s, 'toolboxOpen') - opens, cues(s, 'toolboxClose') - shuts]).toEqual([1, 1]);
    expect(cues(s, 'discovery')).toBe(2); // the toolbox was a first discovery too
  });
});
