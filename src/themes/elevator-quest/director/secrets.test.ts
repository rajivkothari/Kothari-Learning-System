/// <reference types="node" />
// Engineer Secrets (D194), headless through the real director, runtime and SQLite. A secret is a
// small detail of a landing's art: found by touching it in free play, never hinted, never needed.
// Finding one is world memory (`eq.secret.<id>`), never evidence, value or currency; it survives a
// restart and belongs to one learner. During a job, in B1 or on another landing a touch does nothing.
import { canonicalJson } from '../../../engine';
import { count } from '../../../runtime/testing/harness';
import { FLOOR15, LINES } from '../content/floor15';
import { BASEMENT, LANDINGS, SECRET_BURST_MS, engineerSecrets, secretAt, secretKey } from '../content/landings';
import { LEARNER, answerCorrectly, openSession, settled, tempDir, virtualTime, type Session, type VirtualTime } from '../testing/headless';

async function learningSnapshot(s: Session) {
  return {
    events: await count(s.db, 'SELECT COUNT(*) AS n FROM learning_events'),
    progression: await count(s.db, 'SELECT COUNT(*) AS n FROM progression_events'),
    unlocks: await count(s.db, 'SELECT COUNT(*) AS n FROM unlocks'),
    state: canonicalJson(await s.rt.learnerState(LEARNER)),
  };
}
const secretRows = async (s: Session, learnerId = LEARNER) => (await s.db.all<{ memory_key: string }>('SELECT memory_key FROM world_memory WHERE learner_id = ? ORDER BY seq', [learnerId])).map((r) => r.memory_key).filter((k) => k.startsWith('eq.secret.'));

async function toFreeRide(s: Session) {
  s.director.pressDoorOpen();
  await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
  while (s.view().stage !== 'finale') await answerCorrectly(s);
  s.director.pressFloor(FLOOR15.repairFloor);
  expect(await s.time.runUntil(() => s.view().stage === 'freeRide' && s.view().elevator.phase === 'idleOpen')).toBe(true);
  s.director.directoryOpened();
  s.director.directoryClosed();
}
async function rideTo(s: Session, floor: number) {
  if (s.view().elevator.floor !== floor) s.director.pressFloor(floor);
  expect(await s.time.runUntil(() => s.view().elevator.floor === floor && s.view().elevator.phase === 'idleOpen')).toBe(true);
}
async function restart(s: Session, file: string, time: VirtualTime, learnerId = LEARNER) {
  await s.director.idle();
  s.director.dispose();
  await s.db.close();
  return openSession(file, time, { learnerId });
}

describe('Engineer Secrets (D194)', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('a few secrets, each on its own landing, one id and one memory key each', () => {
    const all = engineerSecrets(LANDINGS);
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.length).toBeLessThanOrEqual(4); // a foundation, not a collection
    expect(new Set(all.map((x) => x.secret.id)).size).toBe(all.length);
    expect(new Set(all.map((x) => x.floor)).size).toBe(all.length);
    for (const { secret } of all) expect(secretKey(secret.id)).toMatch(/^eq\.secret\.[a-z0-9-]+$/);
  });

  it('found once in free play: a burst, the discovery sound, Lifty counts it; again: a reminder; never evidence', async () => {
    const time = virtualTime();
    let s = await openSession(tmp.file, time);
    await toFreeRide(s);
    const [one, two] = engineerSecrets(LANDINGS);
    await rideTo(s, one!.floor);
    const before = await learningSnapshot(s);
    // Hidden: arriving says nothing about it.
    await time.advance(1000);
    expect(s.view().lifty.line).not.toContain(one!.secret.name);
    const sounds = () => s.audio.filter((c) => c.action === 'play' && c.slot === 'discovery').length;
    const discovered = sounds();
    s.director.findSecret(one!.secret.id);
    expect(s.view().secretFound).toMatchObject({ floor: one!.floor, id: one!.secret.id, first: true });
    expect(s.view().secrets).toEqual([secretKey(one!.secret.id)]);
    expect(s.view().lifty.line).toBe(LINES.secretFound(one!.secret.line, 1, engineerSecrets(LANDINGS).length));
    expect(sounds() - discovered).toBe(1);
    // A tap during its burst is ignored; after it, a reminder and its own sound, nothing new remembered.
    const seq = s.view().secretFound!.seq;
    s.director.findSecret(one!.secret.id);
    expect(s.view().secretFound!.seq).toBe(seq);
    await time.advance(SECRET_BURST_MS.normal);
    s.director.findSecret(one!.secret.id);
    expect(s.view().secretFound).toMatchObject({ first: false });
    expect(s.view().lifty.line).toBe(LINES.secretAgain(one!.secret.name));
    expect(sounds() - discovered).toBe(1);
    // Another landing's secret cannot be found from here.
    s.director.findSecret(two!.secret.id);
    expect(s.view().secrets).toEqual([secretKey(one!.secret.id)]);
    await s.director.idle();
    expect(await secretRows(s)).toEqual([secretKey(one!.secret.id)]);
    expect(await learningSnapshot(s)).toEqual(before);
    // After a restart it is still found, for this learner only.
    s = await restart(s, tmp.file, time);
    expect(s.view().secrets).toEqual([secretKey(one!.secret.id)]);
    await s.rt.createLearner({ id: 'learner-b', themePack: 'elevator-quest' });
    const other = await restart(s, tmp.file, time, 'learner-b');
    expect(other.view().secrets).toEqual([]);
    expect(await secretRows(other, 'learner-b')).toEqual([]);
    other.director.dispose();
    await other.db.close();
  });

  it('never during the mission, in B1, or on a landing without one: a touch there changes nothing', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    s.director.pressDoorOpen();
    await time.runUntil(() => settled(s)() && s.view().stage === 'task');
    // During a job (whatever floor the car is on): refused, nothing remembered.
    for (const { secret } of engineerSecrets(LANDINGS)) s.director.findSecret(secret.id);
    expect(s.view().secretFound).toBeNull();
    expect(s.view().secrets).toEqual([]);
    // Free play, B1: the car is at floor 1 with the basement's doors; no secret of the lobby's.
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    s.director.pressFloor(FLOOR15.repairFloor);
    expect(await time.runUntil(() => s.view().stage === 'freeRide' && s.view().elevator.phase === 'idleOpen')).toBe(true);
    expect(s.director.expressRide(BASEMENT)).toBe(true);
    expect(await time.runUntil(() => s.view().basement && s.view().express === null && s.view().elevator.phase === 'idleOpen')).toBe(true);
    for (const { secret } of engineerSecrets(LANDINGS)) s.director.findSecret(secret.id);
    expect(secretAt(LANDINGS, 1)).toBeNull();
    expect(s.view().secrets).toEqual([]);
    await s.director.idle();
    expect(await secretRows(s)).toEqual([]);
    s.director.dispose();
    await s.db.close();
  });
});
