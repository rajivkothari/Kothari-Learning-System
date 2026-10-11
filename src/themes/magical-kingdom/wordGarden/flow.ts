// Word Garden: one mission, three magics, each a step up in reading.
//
//   sound  hear a letter sound, tap the letter that makes it (letters stay silent here: hearing every
//          letter first would turn it into sound matching).
//   blend  tap each letter of a short word to hear its sound (as often as wanted), then pick the
//          picture the sounds make.
//   spell  hear a word, build it from big letter tiles; each tile says its sound when placed, and the
//          word is checked when the last space fills. A placed tile can be taken back first.
//
// Only a tapped letter or picture (sound, blend) and a filled word (spell) are answers: the runtime
// records them and says right or wrong. Hearing the word again, tapping letters to hear them, placing
// and taking back tiles, and the celebrations record nothing. Help is the activity's policy: a stretched
// sound (clue), then a model (guided: a keyword picture, the sounds close together, or the middle
// letter placed), then SHOW ME after two misses (demonstrated). The runtime assigns the assistance.
//
// Pure: no React. The screen renders view() and calls the actions; tests drive it over a real runtime.
import type { MissionView, Response } from '../../../engine';
import type { GameRuntime } from '../../../runtime/gameRuntime';
import { ACTIVITIES, WORD_GARDEN, WORD_GARDEN_MISSION, slot, type LineKey, type WordGardenCopy } from './content';

export type Kind = 'sound' | 'blend' | 'spell';
export type Stage = 'loading' | 'play' | 'reward' | 'done' | 'failed';

export interface Task {
  kind: Kind;
  /** The item's signature: a resumed item keeps its play state only if this matches. */
  key: string;
  /** sound: the letter whose sound plays. blend, spell: the word the letters make (spoken, pictured). */
  target: string;
  /** sound: letters; blend: pictures. Empty for spell. */
  options: { id: string; value: string }[];
  /** spell: the tiles, in tray order. */
  tiles: string[];
  /** spell: where the word's middle (pattern) letter goes, for the guided help. */
  patternAt: number;
  pattern: string;
}

export interface GardenView {
  stage: Stage;
  /** 1-based magic number and how many there are. */
  magic: number;
  magics: number;
  task: Task | null;
  /** Options already tried wrong on this item: greyed, never sent twice. */
  tried: string[];
  /** blend: letter positions heard at least once. */
  heard: number[];
  /** spell: tile indexes placed, in slot order. */
  placed: number[];
  /** Help shown on this item, newest last (policy kinds). */
  help: string[];
  /** The next help the policy offers, or null (SHOW ME waits for two misses). */
  nextHelp: { kind: string; demonstrated: boolean } | null;
  /** SHOW ME: the option to tap, or the word to copy. */
  shown: { optionId: string | null; value: string | null } | null;
  /** The world's answer to the last right answer (reward and done). */
  reward: { kind: Kind; value: string } | null;
  line: LineKey;
  /** Bumps when the last answer was wrong: the screen shakes or springs the tiles back. */
  miss: number;
  busy: boolean;
}

export interface GardenAudio {
  /** Play one recorded slot (see content.slot). Missing clips are silent. */
  say(slotKey: string): void;
  effect(name: 'place' | 'remove' | 'success' | 'retry'): void;
  hush(): void;
}

interface PlaySave {
  v: 1;
  instance: string;
  key: string;
  heard: number[];
  placed: number[];
  tried: string[];
  reward: GardenView['reward'];
}

const SAVE_KEY = 'kingdom.play.word-garden';
const KIND_OF: Record<string, Kind> = { [ACTIVITIES.sound]: 'sound', [ACTIVITIES.blend]: 'blend', [ACTIVITIES.spell]: 'spell' };
const START_LINE: Record<Kind, LineKey> = { sound: 'sound', blend: 'blend', spell: 'spell' };
const RETRY_LINE: Record<Kind, LineKey> = { sound: 'retrySound', blend: 'retryBlend', spell: 'retrySpell' };
const HELP_LINE: Record<string, Record<Kind, LineKey>> = {
  highlightGiven: { sound: 'stretchSound', blend: 'stretchBlend', spell: 'stretchSpell' },
  guidedSteps: { sound: 'modelSound', blend: 'modelBlend', spell: 'modelSpell' },
  showAnswer: { sound: 'showSound', blend: 'showBlend', spell: 'showSpell' },
};

export interface WordGardenFlow {
  view(): GardenView;
  subscribe(l: () => void): () => void;
  start(): Promise<void>;
  /** Say the item again (free: re-presenting the prompt is not help). */
  hear(): void;
  /** blend: hear one letter's sound. Never an answer. */
  tapLetter(index: number): void;
  /** sound, blend: the tapped letter or picture is the answer. */
  choose(optionId: string): Promise<void>;
  /** spell: place a tile in the next space; the last space checks the word. */
  place(tile: number): Promise<void>;
  /** spell: take the tile in a space back. */
  unplace(space: number): void;
  help(): Promise<void>;
  /** reward: on to the next magic. done: close the mission. */
  next(): Promise<void>;
  /** Save the play state now (leaving, app to background). */
  flush(): Promise<void>;
  dispose(): void;
}

export function createWordGardenFlow(opts: { runtime: GameRuntime; learnerId: string; now: () => number; audio: GardenAudio; copy?: WordGardenCopy; log?: (event: string, data?: Record<string, unknown>) => void }): WordGardenFlow {
  const { runtime, learnerId, now, audio } = opts;
  const copy = opts.copy ?? WORD_GARDEN;
  const log = opts.log ?? (() => undefined);
  const listeners = new Set<() => void>();
  let instance: string | null = null;
  let mission: MissionView | null = null;
  let revision = 0;
  let disposed = false;
  let saving: Promise<void> = Promise.resolve();
  let v: GardenView = { stage: 'loading', magic: 1, magics: 3, task: null, tried: [], heard: [], placed: [], help: [], nextHelp: null, shown: null, reward: null, line: 'sound', miss: 0, busy: false };
  const set = (patch: Partial<GardenView>) => {
    v = { ...v, ...patch };
    if (!disposed) for (const l of [...listeners]) l();
  };
  const command = (kind: string) => ({ commandId: `${instance}:wg:r${revision}:${kind}`, basedOn: revision });

  /** The task the runtime's activity presents, or null when it is not a Word Garden activity. */
  const taskOf = (m: MissionView): Task | null => {
    const a = m.activity;
    if (!a) return null;
    const kind = KIND_OF[a.activityId];
    if (!kind) return null;
    const id = String(kind === 'spell' ? a.prompt.wordId : a.prompt.item);
    const target = copy.items[id];
    if (!target) return null;
    return {
      kind,
      key: a.itemSignature,
      target,
      options: a.options.map((o) => ({ id: o.id, value: String(o.value) })),
      tiles: kind === 'spell' ? [...String(a.prompt.tiles)] : [],
      patternAt: typeof a.prompt.patternAt === 'number' ? a.prompt.patternAt : -1,
      pattern: typeof a.prompt.pattern === 'string' ? a.prompt.pattern : '',
    };
  };
  const magicOf = (m: MissionView) => Math.min(3, Math.floor((m.step?.index ?? 0) / 2) + 1);
  const helpOf = (m: MissionView): Pick<GardenView, 'help' | 'nextHelp' | 'shown'> => {
    const s = m.activity?.scaffolds;
    const next = s?.available[0];
    const demonstrated = s?.shown.some((x) => x.assistance === 'demonstrated') ?? false;
    return {
      help: s?.shown.map((x) => x.kind) ?? [],
      nextHelp: next ? { kind: next.kind, demonstrated: next.assistance === 'demonstrated' } : null,
      shown: demonstrated ? { optionId: s?.revealedOptionId ?? null, value: s?.revealedValue == null ? null : String(s.revealedValue) } : null,
    };
  };

  const persist = () => {
    if (!instance || disposed) return saving;
    const data: PlaySave = { v: 1, instance, key: v.task?.key ?? '', heard: v.heard, placed: v.placed, tried: v.tried, reward: v.reward };
    const text = JSON.stringify(data);
    // A play save is a convenience (the answers are safe in the runtime): never block play on it.
    saving = saving.then(() => runtime.putSetting(learnerId, SAVE_KEY, text)).catch((e: unknown) => log('wordGarden.saveFailed', { message: String(e) }));
    return saving;
  };

  /** Show what the mission is at now. `fresh` clears the play state for a new item. */
  const show = (m: MissionView, saved: PlaySave | null = null) => {
    mission = m;
    if (m.status === 'completed') {
      set({ stage: 'done', task: null, line: 'done' });
      return;
    }
    if (m.narrative) {
      const final = m.narrative.stepId === 'magic-restored';
      // The last celebration is the end screen: its button closes the mission (next()).
      set({ stage: final ? 'done' : 'reward', magic: magicOf(m), task: null, reward: saved?.reward ?? v.reward, line: final ? 'done' : 'bloom', help: [], nextHelp: null, shown: null });
      return;
    }
    const task = taskOf(m);
    if (!task) {
      log('wordGarden.unsupported', { activityId: m.activity?.activityId ?? null });
      set({ stage: 'failed', task: null });
      return;
    }
    const same = saved && saved.key === task.key;
    const tried = same ? saved.tried.filter((id) => task.options.some((o) => o.id === id)).slice(0, m.activity!.wrongTries) : [];
    const placed = same ? saved.placed.filter((i, n, all) => i >= 0 && i < task.tiles.length && all.indexOf(i) === n).slice(0, task.tiles.length - 1) : [];
    const heard = same ? saved.heard.filter((i) => i >= 0 && i < task.target.length) : [];
    set({ stage: 'play', magic: magicOf(m), task, tried, placed, heard, line: START_LINE[task.kind], ...helpOf(m) });
  };

  const say = (t: Task) => {
    if (t.kind === 'sound') audio.say(slot.sound(t.target));
    else if (t.kind === 'spell') audio.say(slot.word(t.target));
    else audio.say(slot.line('blend'));
  };

  async function guard(task: () => Promise<void>) {
    if (v.busy || disposed) return;
    set({ busy: true });
    try {
      await task();
    } catch (e) {
      log('wordGarden.failed', { message: String(e) });
      set({ stage: 'failed' });
    } finally {
      set({ busy: false });
    }
  }

  const answer = async (response: Response, reward: string) => {
    const t = v.task!;
    const input = response.mode === 'choice' ? { optionId: response.optionId } : { value: response.value };
    const res = await runtime.submit(instance!, { ...command('submit'), ...input });
    revision = res.revision;
    const result = res.intents.find((i) => i.type === 'RESPONSE_RESULT');
    const correct = result?.type === 'RESPONSE_RESULT' && result.correct;
    if (correct) {
      audio.effect('success');
      audio.say(t.kind === 'sound' ? slot.sound(t.target) : slot.word(t.target));
      set({ reward: { kind: t.kind, value: reward } });
      show(res.view);
    } else {
      audio.effect('retry');
      const order = result?.type === 'RESPONSE_RESULT' && result.misconception === 'spelling.letterOrder';
      const tried = response.mode === 'choice' && !v.tried.includes(response.optionId) ? [...v.tried, response.optionId] : v.tried;
      mission = res.view;
      // A wrong word springs its tiles back; the same item stays (a miss never makes it easier).
      set({ tried, placed: t.kind === 'spell' ? [] : v.placed, line: order ? 'retryOrder' : RETRY_LINE[t.kind], miss: v.miss + 1, ...helpOf(res.view) });
      if (res.view.activity?.itemSignature !== t.key) show(res.view);
    }
    await persist();
  };

  const flow: WordGardenFlow = {
    view: () => v,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    start: () =>
      guard(async () => {
        if (!(await runtime.getLearner(learnerId))) throw new Error(`no learner ${learnerId}`);
        let id = await runtime.findActiveMission(learnerId, WORD_GARDEN_MISSION);
        if (id && !(await runtime.missionCompatibility(id)).ok) {
          await runtime.abandonMission(id, { commandId: `${id}:incompatible` });
          id = null;
        }
        if (!id) {
          id = `word-garden-${learnerId}-${now().toString(36)}`;
          await runtime.startMission({ learnerId, missionId: WORD_GARDEN_MISSION, instanceId: id });
        }
        instance = id;
        const active = await runtime.activate(id);
        revision = active.revision;
        let saved: PlaySave | null = null;
        try {
          const raw = JSON.parse((await runtime.settings(learnerId))[SAVE_KEY] ?? 'null') as PlaySave | null;
          if (raw?.v === 1 && raw.instance === id) saved = raw;
        } catch {
          // An unreadable play save starts the item with an empty tray; the answers are in the runtime.
        }
        show(active.view, saved);
        if (v.task) say(v.task);
      }),

    hear() {
      if (v.stage === 'play' && v.task) say(v.task);
    },

    tapLetter(index) {
      const t = v.task;
      if (v.stage !== 'play' || !t || t.kind !== 'blend' || index < 0 || index >= t.target.length) return;
      audio.say(slot.sound(t.target[index]!));
      if (v.heard.includes(index)) return;
      const heard = [...v.heard, index];
      set({ heard, line: heard.length === t.target.length ? 'blendReady' : v.line });
      void persist();
    },

    choose: (optionId) =>
      guard(async () => {
        const t = v.task;
        if (v.stage !== 'play' || !t || t.kind === 'spell' || v.tried.includes(optionId)) return;
        const option = t.options.find((o) => o.id === optionId);
        if (!option) return;
        audio.effect('place');
        await answer({ mode: 'choice', optionId }, t.kind === 'sound' ? copy.keywords[t.target] ?? t.target : option.value);
      }),

    place: (tile) =>
      guard(async () => {
        const t = v.task;
        if (v.stage !== 'play' || !t || t.kind !== 'spell' || tile < 0 || tile >= t.tiles.length || v.placed.includes(tile)) return;
        const placed = [...v.placed, tile];
        audio.say(slot.sound(t.tiles[tile]!));
        set({ placed });
        if (placed.length < t.target.length) {
          await persist();
          return;
        }
        await answer({ mode: 'value', value: placed.map((i) => t.tiles[i]).join('') }, t.target);
      }),

    unplace(space) {
      if (v.stage !== 'play' || v.busy || !v.task || space < 0 || space >= v.placed.length) return;
      audio.effect('remove');
      set({ placed: v.placed.filter((_, i) => i !== space) });
      void persist();
    },

    help: () =>
      guard(async () => {
        const t = v.task;
        const step = mission?.activity?.scaffolds.available[0];
        if (v.stage !== 'play' || !t || !step) return;
        const res = await runtime.useScaffold(instance!, { ...command('help'), scaffoldStepId: step.stepId });
        revision = res.revision;
        mission = res.view;
        const h = helpOf(res.view);
        // SHOW ME on a word clears the tray so the child copies the shown word tile by tile.
        set({ ...h, line: HELP_LINE[step.kind]?.[t.kind] ?? v.line, placed: step.kind === 'showAnswer' && t.kind === 'spell' ? [] : v.placed });
        if (step.kind === 'highlightGiven') audio.say(t.kind === 'sound' ? slot.sound(t.target) : t.kind === 'blend' ? slot.segmented(t.target) : slot.segmented(t.target));
        else if (step.kind === 'guidedSteps') audio.say(t.kind === 'sound' ? slot.word(copy.keywords[t.target] ?? t.target) : t.kind === 'blend' ? slot.slow(t.target) : slot.sound(t.pattern));
        else audio.say(t.kind === 'sound' ? slot.sound(t.target) : slot.word(t.target));
        await persist();
      }),

    next: () =>
      guard(async () => {
        if (!instance || !mission) return;
        if (v.stage === 'reward' || (v.stage === 'done' && mission.narrative)) {
          const res = await runtime.acknowledge(instance, command('next'));
          revision = res.revision;
          set({ reward: res.view.status === 'completed' ? v.reward : null, heard: [], placed: [], tried: [] });
          show(res.view);
          await persist();
          if (v.task) say(v.task);
        }
      }),

    flush: () => persist(),

    dispose() {
      disposed = true;
      audio.hush();
      if (instance) runtime.deactivate(instance);
      listeners.clear();
    },
  };
  return flow;
}
