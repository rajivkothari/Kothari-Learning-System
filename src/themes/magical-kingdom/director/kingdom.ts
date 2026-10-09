import type { ActivityView, MissionView, Response } from '../../../engine';
import type { GameRuntime } from '../../../runtime/gameRuntime';
import { MISSIONS, THEME, type Adventure } from '../appContent';
import { WORDS as W } from '../copy';

export interface KingdomView {
  ready: boolean; room: 'castle' | Adventure; busy: boolean; error: boolean;
  activity: ActivityView | null; solved: boolean; placements: readonly number[]; letter: string | null;
  notice: string | null; hint: 'clue' | 'guided' | 'show' | null;
  target: number; word: string;
  rewards: readonly Adventure[]; outfit: 'lavender' | 'turquoise' | 'gold';
}
interface SavedPlay { v: 1; instance: string; signature: string; placements: number[]; letter: string | null; target: number; word: string }
export interface KingdomDirector {
  view(): KingdomView; subscribe(fn: () => void): () => void; start(): Promise<void>;
  enter(room: Adventure): Promise<void>; place(id: number): void; remove(id: number): void;
  plant(optionId: string): void; submit(): Promise<void>; help(): Promise<void>;
  home(): Promise<void>; retry(): Promise<void>; outfit(value: KingdomView['outfit']): Promise<void>;
  restart(): Promise<void>; flush(): Promise<void>; dispose(): void;
}

/** Thin second-game director. All evaluation, assistance, evidence and transactions belong to KLS. */
export function createKingdomDirector(runtime: GameRuntime, baseLearner: string, now: () => number): KingdomDirector {
  let learner = baseLearner;
  let instance: string | null = null;
  let mission: MissionView | null = null;
  let revision = 0;
  let pending: Promise<void> = Promise.resolve();
  let disposed = false;
  const listeners = new Set<() => void>();
  let v: KingdomView = { ready: false, room: 'castle', busy: false, error: false, activity: null, solved: false, placements: [], letter: null, notice: null, hint: null, rewards: [], outfit: 'lavender', target: 5, word: 'sun' };
  const update = (change: Partial<KingdomView>) => { v = { ...v, ...change }; if (!disposed) listeners.forEach((f) => f()); };
  const reflect = () => update({ activity: mission?.activity ?? null, solved: !!mission?.narrative || mission?.status === 'completed', ...(mission?.activity ? { target: Number(mission.activity.prompt.capacity ?? 5), word: String(mission.activity.prompt.word ?? 'sun') } : {}) });
  const command = (kind: string) => ({ commandId: `${instance}:kingdom:r${revision}:${kind}`, basedOn: revision });
  const accept = (result: { view: MissionView; revision: number }) => { mission = result.view; revision = result.revision; reflect(); };
  const setting = (key: string, value: string) => runtime.putSetting(learner, `kingdom.${key}`, value);

  async function guard(task: () => Promise<void>): Promise<void> {
    if (v.busy || v.error || disposed) return;
    update({ busy: true });
    try { await pending; await task(); } catch { update({ error: true }); }
    finally { update({ busy: false }); }
  }
  function savePlay() {
    if (!instance || !v.activity) return;
    const data: SavedPlay = { v: 1, instance, signature: v.activity.itemSignature, placements: [...v.placements], letter: v.letter, target: v.target, word: v.word };
    const activeLearner = learner;
    const text = JSON.stringify(data);
    pending = pending.then(() => runtime.putSetting(activeLearner, `kingdom.play.${v.room}`, text));
    // No silent save failures: stop answering and offer a durable reload.
    void pending.catch(() => update({ error: true }));
  }
  async function rewards() {
    const earned: Adventure[] = [];
    for (const room of ['ice', 'garden'] as const) {
      for (const id of MISSIONS[room]) if ((await runtime.latestMission(learner, id))?.status === 'completed') { earned.push(room); break; }
    }
    update({ rewards: earned });
  }
  async function openRoom(room: Adventure) {
    if (instance) runtime.deactivate(instance);
    let id: string | null = null;
    for (const m of MISSIONS[room]) {
      const active = await runtime.findActiveMission(learner, m);
      if (!active) continue;
      const compatible = await runtime.missionCompatibility(active);
      if (compatible.ok) { id = active; break; }
      await runtime.abandonMission(active, { commandId: `${active}:incompatible` });
    }
    if (!id) {
      // A calm first bridge always uses five. Replays vary 1–10; mistakes never lower the challenge.
      const missionId = room === 'ice' && v.rewards.includes('ice') ? MISSIONS.ice[1] : MISSIONS[room][0];
      id = `kingdom-${room}-${learner}-${now().toString(36)}`;
      await runtime.startMission({ learnerId: learner, missionId, instanceId: id });
    }
    instance = id;
    accept(await runtime.activate(id));
    const stored = await runtime.settings(learner);
    let saved: SavedPlay | null = null;
    try { saved = JSON.parse(stored[`kingdom.play.${room}`] ?? 'null') as SavedPlay | null; } catch { /* An invalid optional play save starts with an empty tray; the academic checkpoint remains. */ }
    const valid = saved?.v === 1 && saved.instance === id && (saved.signature === mission?.activity?.itemSignature || !!mission?.narrative);
    const placements = valid && Array.isArray(saved?.placements) ? [...new Set(saved.placements.filter((x) => Number.isInteger(x) && x >= 0 && x < 10))] : [];
    const letter = valid && mission?.activity?.options.some((o) => o.id === saved?.letter) ? saved!.letter : null;
    await setting('room', room);
    update({ room, placements, letter, notice: null, hint: helpStage(mission?.activity ?? null), ...(valid && mission?.narrative ? { target: Number.isInteger(saved?.target) && saved!.target >= 1 && saved!.target <= 10 ? saved!.target : 5, word: ['sun','cat','fox','bee'].includes(saved?.word ?? '') ? saved!.word : 'sun' } : {}) });
    reflect();
  }
  function helpStage(a: ActivityView | null): KingdomView['hint'] {
    const last = a?.scaffolds.shown.at(-1);
    return last?.assistance === 'demonstrated' ? 'show' : last?.assistance === 'guided' ? 'guided' : last ? 'clue' : null;
  }
  const d: KingdomDirector = {
    view: () => v,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async start() {
      await guard(async () => {
        if (!(await runtime.getLearner(baseLearner))) await runtime.createLearner({ id: baseLearner, themePack: THEME });
        learner = (await runtime.settings(baseLearner))['kingdom.current'] ?? baseLearner;
        const stored = await runtime.settings(learner);
        update({ outfit: stored['kingdom.outfit'] === 'gold' || stored['kingdom.outfit'] === 'turquoise' ? stored['kingdom.outfit'] : 'lavender' });
        await rewards();
        if (stored['kingdom.room'] === 'ice' || stored['kingdom.room'] === 'garden') await openRoom(stored['kingdom.room']);
        update({ ready: true });
      });
    },
    enter: (room) => guard(() => openRoom(room)),
    place(id) {
      if (v.room !== 'ice' || !v.activity || v.busy || v.error || v.solved || !Number.isInteger(id) || id < 0 || id > 9 || v.placements.includes(id)) return;
      update({ placements: [...v.placements, id], notice: null }); savePlay();
    },
    remove(id) {
      if (!v.activity || v.busy || v.error || v.solved || !v.placements.includes(id)) return;
      update({ placements: v.placements.filter((x) => x !== id), notice: null }); savePlay();
    },
    plant(optionId) {
      if (v.room !== 'garden' || v.busy || v.error || v.solved || !v.activity?.options.some((o) => o.id === optionId)) return;
      update({ letter: v.letter === optionId ? null : optionId, notice: null }); savePlay();
    },
    submit: () => guard(async () => {
      if (!instance || !v.activity || (v.room === 'garden' && !v.letter)) return;
      const response: Response = v.room === 'ice' ? { mode: 'value', value: v.placements.length } : { mode: 'choice', optionId: v.letter! };
      const input = response.mode === 'value' ? { value: response.value } : { optionId: response.optionId };
      const result = await runtime.submit(instance, { ...command('submit'), ...input });
      accept(result);
      const responseResult = result.intents.find((i) => i.type === 'RESPONSE_RESULT');
      if (responseResult?.type === 'RESPONSE_RESULT') update({ notice: responseResult.correct ? null : (v.room === 'ice' ? W.iceRetry : W.gardenRetry) });
    }),
    help: () => guard(async () => {
      const step = v.activity?.scaffolds.available[0];
      if (!instance || !step) return;
      accept(await runtime.useScaffold(instance, { ...command('help'), scaffoldStepId: step.stepId }));
      update({ hint: helpStage(mission?.activity ?? null), notice: null });
      if (v.hint === 'show' && v.activity) {
        const revealed = v.activity.scaffolds.revealedValue;
        if (v.room === 'ice' && typeof revealed === 'number' && Number.isInteger(revealed) && revealed >= 0 && revealed <= 10) update({ placements: Array.from({ length: revealed }, (_, i) => i) });
        if (v.room === 'garden') update({ letter: v.activity.options.find((o) => o.value === revealed)?.id ?? null });
        savePlay(); // A demonstration places the objects; only the child's later submit can record an attempt.
      }
    }),
    home: () => guard(async () => {
      if (instance && mission?.narrative) accept(await runtime.acknowledge(instance, command('finish')));
      await setting('room', 'castle');
      if (instance) runtime.deactivate(instance);
      instance = null; mission = null;
      await rewards();
      update({ room: 'castle', activity: null, solved: false, placements: [], letter: null, hint: null, notice: null });
    }),
    async retry() {
      update({ error: false }); pending = Promise.resolve();
      if (!v.ready) { await d.start(); return; }
      await guard(async () => { if (v.room !== 'castle') await openRoom(v.room); else await rewards(); });
    },
    outfit: (outfit) => guard(async () => { await setting('outfit', outfit); update({ outfit }); }),
    restart: () => guard(async () => {
      if (instance) runtime.deactivate(instance);
      const fresh = `${baseLearner}-g-${now().toString(36)}`;
      const stored = await runtime.settings(learner);
      await runtime.createLearner({ id: fresh, themePack: THEME });
      // Keep comfort and cosmetic choices. Activate the generation only after those writes succeed.
      for (const key of ['kingdom.quiet', 'kingdom.motion', 'kingdom.outfit']) if (stored[key] !== undefined) await runtime.putSetting(fresh, key, stored[key]!);
      await runtime.putSetting(baseLearner, 'kingdom.current', fresh);
      learner = fresh; instance = null; mission = null;
      update({ room: 'castle', activity: null, solved: false, placements: [], letter: null, notice: null, hint: null, rewards: [] });
    }),
    flush: () => pending,
    dispose() { disposed = true; if (instance) runtime.deactivate(instance); listeners.clear(); },
  };
  return d;
}
