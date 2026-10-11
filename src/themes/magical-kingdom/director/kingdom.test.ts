import { BUILT_IN_GENERATORS, generateItem, generatorKey, validateContentPack, validateMissionPack } from '../../../engine';
import { openNodeDatabase, type FaultPlan } from '../../../persistence/testing/nodeDatabase';
import { loadLearningEvents } from '../../../persistence/store';
import { openGameRuntime } from '../../../runtime/gameRuntime';
import { tempDir } from '../../../runtime/testing/harness';
import { loadKingdomContent } from '../appContent';
import { createKingdomDirector } from './kingdom';
import { readRoyalCompletions } from '../wardrobe';

const BASE = 'learner-storyteller-test';
const content = loadKingdomContent();
const databases: ReturnType<typeof openNodeDatabase>[] = [];
afterEach(async () => { for (const db of databases.splice(0)) await db.close(); });
async function setup(file = ':memory:', faults: FaultPlan = {}) {
  let time = 100_000;
  const db = openNodeDatabase(file, faults); databases.push(db);
  const runtime = await openGameRuntime(db, content, { now: () => ++time });
  const d = createKingdomDirector(runtime, BASE, () => ++time, (base) => readRoyalCompletions(db, base));
  await d.start();
  return { db, runtime, d, now: () => ++time };
}
const attempts = async (db: ReturnType<typeof openNodeDatabase>, learner = BASE) => (await loadLearningEvents(db, learner)).flatMap((x) => x.event.type === 'attempt' ? [x.event.attempt] : []);
const placeFive = (d: ReturnType<typeof createKingdomDirector>) => { for (let i = 0; i < 5; i++) d.place(i); };

it('locked clothes cannot be equipped; successful missions unlock full outfits and persist their combinations', async () => {
  const {db,d,runtime,now}=await setup();
  await d.customize('outfit','outfit-starlight');
  expect(d.view().look.outfit).toBe('outfit-lavender');
  await d.customize('bow','bow-pink');
  await d.enter('ice');placeFive(d);await d.submit();
  expect(d.view().progress.total).toBe(0);
  await d.home();
  expect(d.view().newGifts).toContain('outfit-winter');
  expect(d.view().progress).toEqual({ice:1,garden:0,total:1});
  await d.customize('outfit','outfit-winter');await d.customize('wand','wand-crystal');
  expect(await attempts(db)).toHaveLength(1);
  d.dispose();const reopened=createKingdomDirector(runtime,BASE,now,base=>readRoyalCompletions(db,base));await reopened.start();
  expect(reopened.view().look).toMatchObject({outfit:'outfit-winter',bow:'bow-pink',wand:'wand-crystal'});
  expect(reopened.view().newGifts).toEqual([]);
  await reopened.restart();reopened.dispose();
  const fresh=createKingdomDirector(runtime,BASE,now,base=>readRoyalCompletions(db,base));await fresh.start();
  expect(fresh.view().look.outfit).toBe('outfit-winter');expect(fresh.view().progress.total).toBe(1);
  expect(await attempts(db)).toHaveLength(1);
});
it('replay has three stages; repair counts only added crystals and awards one completed mission', async () => {
  const {db,d}=await setup();await d.enter('ice');placeFive(d);await d.submit();await d.home();d.dismissGifts();
  await d.enter('ice');expect(d.view().stages).toBe(3);
  for(let stage=1;stage<=3;stage++){
    const v=d.view();expect(v.stage).toBe(stage);
    if(stage===2) expect(v.initial).toBeGreaterThan(0);
    for(let i=0;i<v.target-v.initial;i++) d.place(i);
    d.place(9);expect(d.view().placements).toHaveLength(v.target-v.initial);
    await d.submit();expect(d.view().solved).toBe(true);
    expect(d.view().progress.total).toBe(1);
    if(stage<3){expect(d.view().canContinue).toBe(true);await d.next();}
  }
  expect(d.view().canContinue).toBe(false);await d.home();await d.home();
  expect(d.view().progress).toEqual({ice:2,garden:0,total:2});
  expect(d.view().newGifts).toContain('bow-icy');expect(await attempts(db)).toHaveLength(4);
});
it('existing committed missions unlock clothes; uncommitted and unrelated learner work do not', async () => {
  const {db,d,runtime,now}=await setup();await d.enter('garden');
  d.plant(d.view().activity!.options.find(o=>o.value===d.view().word[0])!.id);await d.submit();
  expect((await readRoyalCompletions(db,BASE))).toEqual([]);await d.home();d.dispose();
  const restored=createKingdomDirector(runtime,BASE,now,base=>readRoyalCompletions(db,base));await restored.start();
  expect(restored.view().unlocked).toContain('outfit-garden');expect(restored.view().progress.total).toBe(1);
  expect(await readRoyalCompletions(db,'learner-other')).toEqual([]);
});
it('mid-adventure departure resumes the next stage with no early gift or extra evidence', async () => {
  const {db,d}=await setup();await d.enter('ice');placeFive(d);await d.submit();await d.home();d.dismissGifts();await d.enter('ice');
  for(let i=0;i<d.view().target;i++) d.place(i);await d.submit();await d.home();
  expect(d.view().newGifts).toEqual([]);expect(d.view().progress.total).toBe(1);
  await d.enter('ice');expect(d.view().stage).toBe(2);expect(d.view().placements).toEqual([]);
  expect(await attempts(db)).toHaveLength(2);
});
it('a repair celebration survives a real database close and reopen with its original stones intact', async () => {
  const tmp=tempDir();
  try {
    const first=await setup(tmp.file);const d=first.d;
    await d.enter('ice');placeFive(d);await d.submit();await d.home();await d.enter('ice');
    for(let i=0;i<d.view().target;i++)d.place(i);await d.submit();await d.next();
    const target=d.view().target,initial=d.view().initial;
    for(let i=0;i<target-initial;i++)d.place(i);await d.submit();await d.flush();d.dispose();
    await first.db.close();databases.splice(databases.indexOf(first.db),1);
    const reopened=await setup(tmp.file);
    expect(reopened.d.view()).toMatchObject({room:'ice',stage:2,solved:true,target,initial,canContinue:true});
    expect(reopened.d.view().placements).toHaveLength(target-initial);
    expect(await attempts(reopened.db)).toHaveLength(3);
    await reopened.d.next();expect(reopened.d.view().stage).toBe(3);
    reopened.d.dispose();await reopened.db.close();databases.splice(databases.indexOf(reopened.db),1);
  } finally {tmp.cleanup();}
});
it('a tampered cosmetic setting cannot unlock a dress, and failed wardrobe writes keep the last saved look', async () => {
  let fail=false;
  const {db,d,runtime,now}=await setup(':memory:',{failBefore:sql=>fail&&/learner_settings/i.test(sql)});
  await runtime.putSetting(BASE,'kingdom.look',JSON.stringify({outfit:'outfit-starlight',wand:'wand-star'}));d.dispose();
  const reopened=createKingdomDirector(runtime,BASE,now,base=>readRoyalCompletions(db,base));await reopened.start();
  expect(reopened.view().look).toMatchObject({outfit:'outfit-lavender',wand:'wand-none'});
  fail=true;await reopened.customize('bow','bow-pink');expect(reopened.view().error).toBe(true);
  expect(reopened.view().look.bow).toBe('bow-turquoise');expect(await attempts(db)).toEqual([]);
  fail=false;await reopened.retry();await reopened.customize('bow','bow-pink');expect(reopened.view().look.bow).toBe('bow-pink');
});
it('a failed reward read after completion recovers the committed castle state and gift without another answer', async () => {
  let fail=false;
  const {db,d}=await setup(':memory:',{failBefore:sql=>fail&&/FROM mission_instances WHERE status = 'completed'/.test(sql)});
  await d.enter('ice');placeFive(d);await d.submit();fail=true;await d.home();
  expect(d.view().error).toBe(true);expect(await attempts(db)).toHaveLength(1);
  fail=false;await d.retry();
  expect(d.view()).toMatchObject({room:'castle',error:false,progress:{ice:1,garden:0,total:1}});
  expect(d.view().newGifts).toContain('outfit-winter');expect(await attempts(db)).toHaveLength(1);
});

it('validates the new content, mission references and copy using KLS contracts', () => {
  const report = validateContentPack(content.pack, { registry: BUILT_IN_GENERATORS, budget: { seedsPerActivity: 100 }, budgetName: 'ci' });
  expect(report.issues.filter((x) => x.severity === 'error')).toEqual([]);
  expect(validateMissionPack({ schemaVersion: 1, id: 'kingdom-adventures', version: '2026.10.1', missions: content.missions }, content.pack).ok).toBe(true);
  const activity = content.pack.activities.find((a) => a.id === 'bridge-varied')!;
  const generator = BUILT_IN_GENERATORS.get(generatorKey(activity.generator.id, activity.generator.version))!;
  const values = new Set(Array.from({ length: 200 }, (_, i) => generateItem(generator, activity.params, `kingdom-check-${i}`).prompt.capacity));
  expect([...values].sort((a, b) => Number(a) - Number(b))).toEqual([1,2,3,4,5,6,7,8,9,10]);
});
it('exploration, invalid touches, moving and removing crystals create no evidence', async () => {
  const { db, d } = await setup();
  expect(d.view().ready).toBe(true);
  await d.outfit('gold'); await d.enter('ice');
  d.place(-1); d.place(99); d.place(0); d.place(0); d.place(1); d.remove(0);
  await d.flush();
  expect(d.view().placements).toEqual([1]);
  expect(await loadLearningEvents(db, BASE)).toEqual([]);
  await d.home(); expect(await loadLearningEvents(db, BASE)).toEqual([]);
});
it('an explicit correct construction records one independent attempt; rapid submit cannot duplicate it', async () => {
  const { db, d } = await setup(); await d.enter('ice'); placeFive(d);
  await Promise.all([d.submit(), d.submit(), d.submit()]);
  expect(d.view().solved).toBe(true);
  expect((await attempts(db)).map((a) => [a.outcome, a.assistance])).toEqual([['correct', 'independent']]);
  await d.submit(); await d.home(); await d.home();
  expect((await attempts(db)).length).toBe(1);
  expect(d.view().rewards).toEqual(['ice']);
});
it('a wrong construction and retry remain assisted, with no easier next problem', async () => {
  const { db, d } = await setup(); await d.enter('ice'); d.place(0); await d.submit();
  expect(d.view().solved).toBe(false); expect(d.view().activity?.prompt.capacity).toBe(5);
  placeFive(d); await d.submit();
  expect((await attempts(db)).map((a) => [a.assistance, a.wrongTries])).toEqual([['retry', 1]]);
});
it('a clue and a demonstrated answer can never produce independent evidence', async () => {
  const { db, d } = await setup(); await d.enter('ice'); await d.help();
  expect(d.view().hint).toBe('clue');
  await d.help(); expect(d.view().hint).toBe('guided');
  await d.submit(); await d.submit(); await d.help();
  expect(d.view().hint).toBe('show'); expect(d.view().activity?.scaffolds.revealedValue).toBe(5);
  expect(d.view().placements).toHaveLength(5);
  placeFive(d); await d.submit();
  expect((await attempts(db))[0]?.assistance).toBe('demonstrated');
});
it('letter placement is reversible and only Make magic submits the phonics answer', async () => {
  const { db, d } = await setup(); await d.enter('garden');
  const a = d.view().activity!;
  const wrong = a.options.find((o) => o.value !== String(a.prompt.word)[0])!;
  const right = a.options.find((o) => o.value === String(a.prompt.word)[0])!;
  d.plant('invented'); d.plant(wrong.id); d.plant(wrong.id);
  expect(d.view().letter).toBeNull();
  d.plant(wrong.id); await d.flush(); expect(await attempts(db)).toEqual([]);
  await d.submit(); expect(d.view().solved).toBe(false);
  d.plant(right.id); await d.submit();
  expect((await attempts(db))[0]).toMatchObject({ assistance: 'retry', wrongTries: 1 });
  await d.home(); expect(d.view().rewards).toEqual(['garden']);
});
it('leave and re-enter keep partial construction, item signature and assistance', async () => {
  const { db, d } = await setup(); await d.enter('ice'); d.place(3); d.place(4); await d.help();
  const signature = d.view().activity?.itemSignature;
  await d.home(); await d.enter('garden'); await d.home(); await d.enter('ice');
  expect(d.view().placements).toEqual([3,4]);
  expect(d.view().activity?.itemSignature).toBe(signature); expect(d.view().hint).toBe('clue');
  expect(await attempts(db)).toEqual([]);
});
it('a real close/reopen resumes a solved celebration without recording the answer again', async () => {
  const tmp = tempDir();
  try {
    const first = await setup(tmp.file); await first.d.enter('ice'); placeFive(first.d); await first.d.submit(); await first.d.flush(); first.d.dispose(); await first.db.close(); databases.splice(databases.indexOf(first.db), 1);
    const next = await setup(tmp.file);
    expect(next.d.view()).toMatchObject({ room: 'ice', solved: true });
    await next.d.submit(); expect((await attempts(next.db)).length).toBe(1);
    await next.d.home(); expect(next.d.view().rewards).toEqual(['ice']);
    next.d.dispose(); await next.db.close(); databases.splice(databases.indexOf(next.db), 1);
  } finally { tmp.cleanup(); }
});
it('a garden celebration preserves its picture after a fresh director opens', async () => {
  const { db, d, runtime, now } = await setup(); await d.enter('garden');
  const word = d.view().word;
  d.plant(d.view().activity!.options.find((o) => o.value === word[0])!.id); await d.submit(); await d.flush(); d.dispose();
  const reopened = createKingdomDirector(runtime, BASE, now, (base) => readRoyalCompletions(db, base)); await reopened.start();
  expect(reopened.view()).toMatchObject({ solved: true, room: 'garden', word });
});
it('failed atomic answer commits show save trouble, preserve the checkpoint, and retry once', async () => {
  let fail = false;
  const { db, d, runtime } = await setup(':memory:', { failBefore: (sql) => fail && /INSERT.*learning_events/i.test(sql) });
  await d.enter('ice'); placeFive(d); await d.flush(); fail = true;
  await d.submit(); expect(d.view()).toMatchObject({ error: true, solved: false });
  expect(await attempts(db)).toEqual([]);
  fail = false; await d.retry(); expect(d.view().error).toBe(false); await d.submit();
  expect((await attempts(db)).length).toBe(1);
  const integrity = await db.get<{ integrity_check: string }>('PRAGMA integrity_check'); expect(integrity?.integrity_check).toBe('ok');
  expect((await runtime.latestMission(BASE, 'crystal-bridge'))?.status).toBe('active'); // celebration still waits for the child
});
it('a failed optional play save cannot be ignored or turn into a learning submission', async () => {
  let fail = false;
  const { db, d } = await setup(':memory:', { failBefore: (sql) => fail && /learner_settings/i.test(sql) });
  await d.enter('ice'); fail = true; d.place(0);
  await expect(d.flush()).rejects.toThrow(); await d.submit();
  expect(d.view().error).toBe(true); expect(await attempts(db)).toEqual([]);
  fail = false; await d.retry(); expect(d.view().placements).toEqual([]);
});
it('restart creates a new learner generation and keeps old evidence and the other learner intact', async () => {
  const { db, d, runtime } = await setup(); await d.enter('ice'); placeFive(d); await d.submit(); await d.home();
  await runtime.putSetting(BASE, 'kingdom.motion', 'still'); await d.outfit('gold');
  const old = await attempts(db);
  await runtime.createLearner({ id: 'other-learner', themePack: 'other-theme' });
  await runtime.putSetting('other-learner', 'untouched', 'yes');
  await d.restart(); expect(d.view()).toMatchObject({ room: 'castle', rewards: [] });
  expect(await attempts(db)).toEqual(old);
  const fresh = (await runtime.settings(BASE))['kingdom.current']!;
  expect(fresh).not.toBe(BASE); expect(await attempts(db, fresh)).toEqual([]);
  expect(await runtime.settings(fresh)).toMatchObject({ 'kingdom.motion': 'still', 'kingdom.outfit': 'gold' });
  expect(await runtime.settings('other-learner')).toEqual({ untouched: 'yes' });
});
