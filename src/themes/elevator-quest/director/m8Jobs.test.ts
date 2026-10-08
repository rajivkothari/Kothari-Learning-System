// The M8 math jobs in the building, headless through the real runtime: every job a pool can present
// (lamp patterns, the ten-floor express, calls in order, doubles, through ten, the wider stretch
// jobs) is reached with a developer jump, missed once (the consequence, then the correction board on
// the learner's own job), then the fresh job takes help and is solved, with its success replay.
// Every line Lifty says has its placeholders filled and fits the bubble on a Fire HD 8.
import { openNodeDatabase } from '../../../persistence/testing/nodeDatabase';
import { activeTestLearner } from '../../../runtime/devSeed';
import { openGameRuntime } from '../../../runtime/gameRuntime';
import { fakeClock } from '../../../runtime/testing/harness';
import { THEME_PACK_ID } from '../content/floor15';
import { jumpTo, wrongValues } from '../devtools/floor15Tools';
import { CONTENT, answerWith, openSession, settled, solve, tempDir, virtualTime, type Session } from '../testing/headless';
import { computeLayout } from '../ui/layout';
import { fitLine, liftyContext, liftyPlacement, type LiftyContext } from '../ui/liftyPlacement';

const FIRE: [string, number, number][] = [
  ['Fire HD 8 landscape', 960, 600],
  ['Fire HD 8 portrait', 600, 960],
];
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

/** Jump id -> the theme concept its job shows. */
const M8_JUMPS: [string, string][] = [
  ['lamps', 'missingInSequence'],
  ['lamps-next', 'missingInSequence'],
  ['fives', 'missingInSequence'],
  ['ten-jump', 'tensAndOnes'],
  ['teen', 'tensAndOnes'],
  ['ten-and-ones', 'tensAndOnes'],
  ['ten-and-ones-down', 'tensAndOnes'],
  ['compare', 'orderPositions'],
  ['order', 'orderPositions'],
  ['same-way', 'positionAfterTwoMoves'],
  ['two-part-wide', 'positionAfterTwoMoves'],
  ['bridge-up', 'positionAfterMove'],
  ['bridge-down', 'positionAfterMove'],
  ['add-teen', 'positionAfterMove'],
  ['start-far', 'startBeforeMove'],
  ['meter-far', 'distanceBetween'],
  ['make-ten', 'combineGroups'],
  ['doubles', 'combineGroups'],
  ['near-doubles', 'combineGroups'],
];

async function sessionAt(file: string, jump: string): Promise<Session> {
  const db = openNodeDatabase(file);
  const rt = await openGameRuntime(db, CONTENT, fakeClock());
  const learnerId = await activeTestLearner(rt, 'learner-test-a', THEME_PACK_ID);
  const instanceId = await jumpTo({ db, runtime: rt, content: CONTENT, now: () => 1_791_244_800_000 }, learnerId, jump);
  await db.close();
  const s = await openSession(file, virtualTime(), { instanceId, learnerId });
  expect(await s.time.runUntil(settled(s))).toBe(true);
  return s;
}

const answers = (s: Session) => s.log.entries().filter((e) => e.kind === 'answer').length;

describe.each(M8_JUMPS)('the M8 job "%s"', (jump, concept) => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('a miss shows its consequence and the correction counts the job through; the fresh job takes help, is solved, and replays', async () => {
    const s = await sessionAt(tmp.file, jump);
    const said = new Map<string, { context: LiftyContext; help: boolean }>();
    s.director.subscribe((v) => {
      const help = v.help !== null || v.stage === 'success' || v.rescueReady;
      if (v.lifty.line) said.set(`${liftyContext(v)}|${help}|${v.lifty.line}`, { context: liftyContext(v), help });
    });
    const id = s.director.instanceId();
    const view = s.rt.currentView(id).view.activity!;
    expect(view.concept).toBe(concept);
    const first = view.itemSignature;
    expect(s.view().lifty.line).not.toMatch(/\{[a-zA-Z]+\}/);

    // A miss (a tagged one when the job has one): the world shows it, Lifty gives one cue, LET'S COUNT waits.
    const tagged = wrongValues(s.rt, id, 'any').filter((v) => s.rt.check(id, { mode: 'value', value: v }).ok && (s.rt.check(id, { mode: 'value', value: v }) as { evaluation: { misconception?: string } }).evaluation.misconception);
    const miss = tagged[0] ?? wrongValues(s.rt, id, 'any')[0]!;
    const before = answers(s);
    answerWith(s, miss);
    expect(await s.time.runUntil(() => answers(s) > before && !s.view().saving && s.view().rescueReady && (s.view().stage === 'pause' || s.view().stage === 'cargo'))).toBe(true);
    expect(s.view().lifty.line.length).toBeGreaterThan(5);

    // The correction: the learner's own job on the board, counted cell by cell, then said.
    s.director.beginRescue();
    expect(s.view()).toMatchObject({ stage: 'rescue', rescue: { corrective: true, phase: 'counting' } });
    for (let guard = 0; guard < 40 && s.view().rescue?.phase === 'counting'; guard++) {
      const r = s.view().rescue!;
      s.director.rescueTap(r.origin + (r.direction === 'down' ? -1 : 1) * r.stride * (r.counted.length + 1));
    }
    const r = s.view().rescue!;
    expect(r.phase).toBe('ask');
    const sign = r.direction === 'down' ? -1 : 1;
    s.director.rescueTap(r.asks === 'cell' ? r.origin + sign * r.stride * r.steps : r.kind === 'fill' ? r.countFrom + r.steps : r.steps);
    expect(await s.time.runUntil(() => s.view().rescue?.phase === 'right')).toBe(true);
    expect(await s.time.runUntil(() => (s.view().stage === 'task' || s.view().stage === 'cargo') && settled(s)())).toBe(true);

    // The fresh job: a different question, introduced as a new job.
    expect(s.rt.currentView(id).view.activity!.itemSignature).not.toBe(first);
    expect(s.view().lifty.line).toMatch(/^New job\./);
    // Help has this job's own words (no stock fallback, nothing left unfilled).
    expect(s.view().help).not.toBeNull();
    s.director.requestHelp();
    expect(await s.time.runUntil(() => !s.view().saving)).toBe(true);
    expect(s.view().lifty.line).not.toMatch(/Here is a clue|\{[a-zA-Z]+\}/);

    // Solved: the success shows the thing found (or the accepted load) and one way to reach it.
    answerWith(s, solve(s));
    expect(await s.time.runUntil(() => s.view().stage === 'success' && s.view().success === 'review')).toBe(true);
    expect(s.view().replay).not.toBeNull();
    expect(s.view().replay!.text).not.toMatch(/\{[a-zA-Z]+\}/);
    if (s.view().task?.kind !== 'cargo') expect(s.view().props.length).toBeGreaterThan(0);
    expect(s.log.entries().filter((e) => e.kind === 'correction.followUp').at(-1)?.data).toMatchObject({ correct: true });

    // Every line said fits Lifty's bubble on a Fire HD 8 and fills every placeholder.
    for (const [key, at] of said) {
      const line = key.split('|').slice(2).join('|');
      expect(line).not.toMatch(/\{[a-zA-Z]+\}|undefined|NaN/);
      for (const [name, w, h] of FIRE) {
        const bubble = liftyPlacement(computeLayout({ width: w, height: h }, NO_INSETS), at.context, { help: at.help }).bubble;
        expect({ name, line, fits: fitLine(line, bubble) !== null }).toEqual({ name, line, fits: true });
      }
    }
    await s.director.idle();
    s.director.dispose();
    await s.db.close();
  });
});
