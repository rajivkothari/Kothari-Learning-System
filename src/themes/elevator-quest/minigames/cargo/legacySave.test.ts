// A Cargo Commander save written before M9.1 (D172: the key was `<signature>#<n>`, n the visit's own
// count of right loads) over the REAL runtime and SQLite: the fixture is the exact settings text the
// pre-M9.1 code left after a wrong WEIGH and a partial load (fixtures/pre-m9.1-save.json). The same
// play is repeated here up to that point, the fixture's settings replace what the current code saved,
// and the app restarts with the current code.
import { loadLearningEvents } from '../../../../persistence/store';
import { openNodeDatabase } from '../../../../persistence/testing/nodeDatabase';
import { openGameRuntime } from '../../../../runtime/gameRuntime';
import { fakeClock, tempDir } from '../../../../runtime/testing/harness';
import { THEME_PACK_ID } from '../../content/floor15';
import { miniGameById } from '../catalog';
import { openMiniGameSession, saveKey, type MiniGameSessionHandle } from '../session';
import { GAME_TEST_CONTENT } from '../testing/gameContent';
import type { MiniGameSession, MiniGameSound } from '../types';
import { createCargoFlow, type CargoFlow } from './cargoFlow';
import { loadFor, type CargoLoad } from './cargoState';
import { deliveryKey, type CargoMission } from './mission';
import legacy from './fixtures/pre-m9.1-save.json';

const LEARNER = 'learner-a';
const GAME = 'cargo-commander';
type Clock = ReturnType<typeof fakeClock>;

const settle = () => new Promise<void>((r) => setImmediate(r));
const silent: MiniGameSound = { play: () => undefined, loop: () => undefined, say: () => undefined, canSay: () => false, hush: () => undefined };

/** A runtime over `file`, with the instance ids the fixture was captured with. */
async function world(file: string, clock: Clock) {
  const db = openNodeDatabase(file);
  const rt = await openGameRuntime(db, GAME_TEST_CONTENT, clock);
  if (!(await rt.getLearner(LEARNER))) await rt.createLearner({ id: LEARNER, themePack: THEME_PACK_ID });
  let n = 0;
  const open = () => openMiniGameSession({ runtime: rt, learnerId: LEARNER, game: miniGameById(GAME)!, clock, newInstanceId: () => `${GAME}-${LEARNER}-${clock.now()}-${++n}` });
  return { db, rt, open };
}
type World = Awaited<ReturnType<typeof world>>;

interface Visit {
  w: World;
  h: MiniGameSessionHandle;
  flow: CargoFlow;
  runSaves: () => Promise<void>;
}

async function visit(w: World): Promise<Visit> {
  const h = await w.open();
  const pending: (() => void)[] = [];
  const flow = createCargoFlow({
    session: h.session,
    sound: silent,
    reducedMotion: () => true,
    now: () => 0,
    schedule: (fn) => {
      pending.push(fn);
      return () => {
        const i = pending.indexOf(fn);
        if (i >= 0) pending.splice(i, 1);
      };
    },
  });
  await flow.start();
  return { w, h, flow, runSaves: async () => (pending.splice(0).forEach((f) => f()), await settle()) };
}

async function leave(v: Visit) {
  await v.flow.flush();
  v.flow.dispose();
  await v.h.close();
}

function rightValue(session: MiniGameSession, m: CargoMission): number {
  for (let v = m.range.min; v <= m.range.max; v += 1) if (session.check({ mode: 'value', value: v })?.correct) return v;
  throw new Error('no right value');
}

function setLoad(flow: CargoFlow, load: CargoLoad) {
  const now = () => flow.view().cargo!.load;
  for (const id of now().crates) flow.act({ type: 'unloadCrate', id });
  while (now().sacks > 0) flow.act({ type: 'removeSack' });
  while (now().boxes > 0) flow.act({ type: 'removeBox' });
  for (const id of load.crates) flow.act({ type: 'loadCrate', id });
  for (let i = 0; i < load.sacks; i += 1) flow.act({ type: 'addSack' });
  for (let i = 0; i < load.boxes; i += 1) flow.act({ type: 'addBox' });
  expect(flow.view().cargo!.load).toEqual(load);
}

async function shipRight(v: Visit) {
  const m = v.flow.view().mission!;
  setLoad(v.flow, loadFor(m, rightValue(v.h.session, m))!);
  await v.flow.weigh();
  expect(v.flow.view().cargo!.phase).toBe('shipping');
  v.flow.arrived();
  await settle();
}

const attempts = async (w: World) => (await loadLearningEvents(w.db, LEARNER)).flatMap((e) => (e.event.type === 'attempt' ? [e.event.attempt] : []));

/**
 * The fixture's play with the current code (delivery 1 right; on delivery 2 the wrong WEIGH, recorded,
 * and the partial load), then BACK TO ELEVATOR; the settings are then set to `settings` (the pre-M9.1
 * code's own text) and the app restarts. Returns the first visit after the restart.
 */
async function restartOnto(file: string, settings: Record<string, string>): Promise<Visit> {
  const clock = fakeClock();
  const v = await visit(await world(file, clock));
  await shipRight(v);
  await v.flow.next();
  await settle();
  const c = v.h.session.challenge()!;
  // The fixture belongs to this very play (same content, same seeds): if this fails, re-capture it.
  const { stepId, itemIndex, signature, activityId } = legacy.delivery;
  expect({ instanceId: v.h.session.instanceId, stepId: c.stepId, itemIndex: c.item.index, signature: c.key, activityId: c.activityId }).toEqual({ instanceId: legacy.instanceId, stepId, itemIndex, signature, activityId });
  setLoad(v.flow, legacy.wrongLoad);
  await v.runSaves();
  await v.flow.weigh();
  expect(v.flow.view().cargo!.weighed).toEqual(legacy.weighed);
  expect(v.h.session.challenge()!.wrongTries).toBe(legacy.delivery.wrongTries);
  setLoad(v.flow, legacy.partialLoad);
  await v.runSaves();
  await leave(v);
  // The device now holds what the pre-M9.1 code wrote; the app is updated and restarted.
  for (const [key, value] of Object.entries(settings)) await v.w.rt.putSetting(LEARNER, key, value);
  v.w.rt.dropMemory();
  await v.w.db.close();
  return visit(await world(file, clock));
}

describe('a pre-M9.1 Cargo Commander save (real runtime)', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('restores the partial load of the same delivery, and its recorded wrong WEIGH is never counted again', async () => {
    const v = await restartOnto(tmp.file, legacy.settings);
    const newKey = deliveryKey({ stepId: legacy.delivery.stepId, item: { index: legacy.delivery.itemIndex }, key: legacy.delivery.signature });
    const back = v.flow.view();
    expect({ instance: v.h.session.instanceId, key: back.mission!.key, load: back.cargo!.load, weighed: back.cargo!.weighed, readout: back.cargo!.readout, notice: back.notice }).toEqual({
      instance: legacy.instanceId,
      key: newKey,
      load: legacy.partialLoad,
      weighed: legacy.weighed,
      readout: null,
      notice: 'resume',
    });
    // The restored state matches the runtime: one wrong try, and the same wrong load only shows its reading.
    expect(v.h.session.challenge()!.wrongTries).toBe(1);
    setLoad(v.flow, legacy.wrongLoad);
    await v.flow.weigh();
    expect(v.flow.view().cargo!.readout).toMatchObject({ value: legacy.weighed[0], result: expect.stringMatching(/heavy|light|notRight/) });
    await v.flow.weigh();
    expect(v.h.session.challenge()!.wrongTries).toBe(1);
    // The next save is in the new format.
    await v.flow.flush();
    const saved = JSON.parse((await v.w.rt.settings(LEARNER))[saveKey(GAME)]!) as { state: { cargo: { key: string } } };
    expect(saved.state.cargo.key).toBe(newKey);
    await shipRight(v);
    expect((await attempts(v.w)).map((a) => [a.outcome, a.wrongTries, a.assistance])).toEqual([
      ['correct', 0, 'independent'],
      ['correct', 1, 'retry'],
    ]);
    await leave(v);
    await v.w.db.close();
  });

  it('a pre-M9.1 key naming another item (the delivery before) restarts the delivery empty', async () => {
    const save = legacy.settings[`eq.mg.${GAME}.save`].replace(`"key":"${legacy.delivery.signature}#1"`, `"key":"${legacy.firstDeliverySignature}#0"`);
    expect(save).not.toBe(legacy.settings[`eq.mg.${GAME}.save`]);
    const v = await restartOnto(tmp.file, { ...legacy.settings, [`eq.mg.${GAME}.save`]: save });
    const back = v.flow.view();
    expect({ key: back.mission!.key, load: back.cargo!.load, weighed: back.cargo!.weighed, notice: back.notice }).toEqual({
      key: deliveryKey({ stepId: legacy.delivery.stepId, item: { index: legacy.delivery.itemIndex }, key: legacy.delivery.signature }),
      load: { crates: [], sacks: 0, boxes: 0 },
      weighed: [],
      notice: null,
    });
    expect(v.h.session.challenge()!.wrongTries).toBe(1);
    await leave(v);
    await v.w.db.close();
  });
});
