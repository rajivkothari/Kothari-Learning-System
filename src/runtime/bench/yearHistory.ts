/// <reference types="node" />
// A synthetic, deterministic twelve-month learner history, played through the real GameRuntime
// (any SqlDatabase behind it). Not a test: a workload for the persistence benchmark and for the
// replay-equivalence tests. Shaped like the shipped game (content/missions/core.json):
//
// - Six play days a week (one day in seven off), one session a day.
// - Floor 15 (`positions-and-capacity`): about one run a day, sometimes left part way and resumed the
//   next day; two runs on some days. Misses (about one first answer in five), help (about one in
//   seven), and the first-miss correction (rescue, then a fresh job) as the shipped mission plays it.
// - Word Golf (three spelled words) and Cargo Commander (five deliveries) on alternate days, both on
//   the seventh day of each week: the session's in-flight note before every answer, game saves
//   (`eq.mg.<game>.save`) after putts and crate moves, the host record on entering and leaving.
// - World memory: a new discovery or tip on most of the first weeks (32 keys in all).
// - Settings: the sound and motion settings change about once a month.
//
// Only the public runtime API is used, the way the theme uses it. Randomness is a seeded PRNG.
import type { AnswerValue, ContentPack, MissionView } from '../../engine';
import type { GameRuntime, SubmitInput } from '../gameRuntime';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Small, fast, seeded PRNG (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What the workload did, by kind, so a caller can attribute writes and time. */
export type OpKind =
  | 'submit'
  | 'useScaffold'
  | 'acknowledge'
  | 'rescueAnswer'
  | 'startMission'
  | 'activate'
  | 'remember'
  | 'putSetting'
  | 'settings'
  | 'other';

export interface Hooks {
  /** Called around every runtime call the workload makes. */
  around?<T>(kind: OpKind, fn: () => Promise<T>): Promise<T>;
  /** Called at the end of every play day (index from 0). */
  endOfDay?(day: number): Promise<void> | void;
}

export interface Workload {
  rt: GameRuntime;
  pack: ContentPack;
  learnerId: string;
  clock: { set(t: number): void; now(): number };
  start: number;
  seed?: number;
  /** Prefix for new mission instance ids (play on top of an existing history needs its own). */
  idPrefix?: string;
  /** Remember new world-memory keys (default true). */
  memory?: boolean;
  hooks?: Hooks;
}

const MISSION = 'positions-and-capacity';
const GOLF = 'word-golf';
const CARGO = 'cargo-commander';
const MEMORY_KEYS = [...Array.from({ length: 28 }, (_, i) => `eq.discovery.spot-${i + 1}`), 'eq.tip.doorClose', 'eq.tip.directory', 'eq.tip.mg.word-golf', 'eq.tip.mg.cargo-commander'];

/** The right answer for the visible item (the runtime's pure check, as a test would find it). */
function rightAnswer(rt: GameRuntime, pack: ContentPack, id: string): { value: AnswerValue } | { optionId: string } {
  const activity = rt.currentView(id).view.activity;
  if (!activity) throw new Error('No item to answer');
  const a = activity.answer;
  if (a.mode === 'choice') {
    for (const o of activity.options) {
      const c = rt.check(id, { mode: 'choice', optionId: o.id });
      if (c.ok && c.evaluation.correct) return { optionId: o.id };
    }
  } else if (a.mode === 'text') {
    const params = pack.activities.find((x) => x.id === activity.activityId)?.params as { words?: { id: string; word: string }[] } | undefined;
    const word = params?.words?.find((w) => w.id === activity.prompt.wordId)?.word;
    if (word) return { value: word };
  } else {
    for (let v = a.min; v <= a.max; v++) {
      const c = rt.check(id, { mode: 'value', value: v });
      if (c.ok && c.evaluation.correct) return { value: v };
    }
  }
  throw new Error('No right answer found');
}

function wrongAnswer(rt: GameRuntime, pack: ContentPack, id: string): { value: AnswerValue } | { optionId: string } {
  const right = rightAnswer(rt, pack, id);
  if ('value' in right && typeof right.value === 'string') return { value: `${right.value.slice(0, -1)}${right.value.endsWith('z') ? 'y' : 'z'}` };
  if ('value' in right) {
    const a = rt.currentView(id).view.activity!.answer as { max: number };
    const v = right.value as number;
    return { value: v === a.max ? v - 1 : v + 1 };
  }
  const wrong = rt.currentView(id).view.activity!.options.find((o) => o.id !== right.optionId)!;
  return { optionId: wrong.id };
}

/**
 * Play twelve months (or `days`) for one learner. The learner must exist. Returns counts of what
 * was played. Deterministic for a given seed and content.
 */
export async function playYear(w: Workload, days = 365): Promise<{ playDays: number; commands: number; missions: number; golf: number; cargo: number }> {
  const { rt, pack, learnerId, clock } = w;
  const rand = prng(w.seed ?? 20261009);
  const around = <T>(kind: OpKind, fn: () => Promise<T>) => (w.hooks?.around ? w.hooks.around(kind, fn) : fn());
  const tick = (ms: number) => clock.set(clock.now() + ms);
  const counts = { playDays: 0, commands: 0, missions: 0, golf: 0, cargo: 0 };
  let memoryNext = 0;
  let serial = 0;

  /** Answer the visible item (or story, or rescue) once. Returns the new revision. */
  async function step(id: string, revision: number, opts: { missRate: number; helpRate: number; note?: string }): Promise<number> {
    const { view } = rt.currentView(id);
    const cmd = (k: string) => `${id}:c${(serial += 1)}:${k}`;
    tick(4_000 + Math.floor(rand() * 20_000));
    counts.commands += 1;
    if (view.narrative) return (await around('acknowledge', () => rt.acknowledge(id, { commandId: cmd('ack'), basedOn: revision }))).revision;
    const activity = view.activity!;
    if (activity.rescue && activity.rescue.status === 'active') {
      return (await around('rescueAnswer', () => rt.rescueAnswer(id, { commandId: cmd('rescue'), value: activity.rescue!.example.answer, basedOn: revision }))).revision;
    }
    const offer = activity.scaffolds.available[0];
    if (offer && activity.scaffolds.shown.length === 0 && rand() < opts.helpRate) {
      return (await around('useScaffold', () => rt.useScaffold(id, { commandId: cmd('help'), scaffoldStepId: offer.stepId, basedOn: revision }))).revision;
    }
    const miss = activity.wrongTries === 0 && rand() < opts.missRate;
    const answer = miss ? wrongAnswer(rt, pack, id) : rightAnswer(rt, pack, id);
    const commandId = cmd('submit');
    if (opts.note) {
      // The mini-game session's in-flight note, written before the answer (session.ts).
      const note = JSON.stringify({ v: 1, instanceId: id, commandId, basedOn: revision, response: 'value' in answer ? { mode: 'value', value: answer.value } : { mode: 'choice', optionId: answer.optionId }, evidence: 'independent' });
      await around('putSetting', () => rt.putSetting(learnerId, opts.note!, note));
    }
    const out = await around('submit', () => rt.submit(id, { commandId, basedOn: revision, ...answer } as SubmitInput));
    if (opts.note && miss) await around('putSetting', () => rt.putSetting(learnerId, opts.note!, ''));
    return out.revision;
  }

  async function open(missionId: string, prefix: string): Promise<{ id: string; revision: number }> {
    let id = await rt.findActiveMission(learnerId, missionId);
    if (!id) {
      id = `${w.idPrefix ?? ''}${prefix}-${(serial += 1).toString(36)}`;
      await around('startMission', () => rt.startMission({ learnerId, missionId, instanceId: id! }));
    }
    const a = await around('activate', () => rt.activate(id!));
    return { id, revision: a.revision };
  }

  /** Floor 15: play up to `jobs` steps of the current run (or a new one). */
  async function floor15(jobs: number) {
    const { id, revision: r0 } = await open(MISSION, 'f15');
    let revision = r0;
    let steps = 0;
    let lastStep = rt.currentView(id).view.step?.index ?? -1;
    for (let guard = 0; guard < 200; guard++) {
      const view: MissionView = rt.currentView(id).view;
      if (view.status !== 'active') {
        counts.missions += 1;
        break;
      }
      if ((view.step?.index ?? -1) !== lastStep) {
        lastStep = view.step?.index ?? -1;
        if ((steps += 1) > jobs) break;
      }
      revision = await step(id, revision, { missRate: 0.2, helpRate: 0.14 });
    }
    rt.deactivate(id);
  }

  async function miniGame(game: typeof GOLF | typeof CARGO) {
    const save = `eq.mg.${game}.save`;
    const inflight = `eq.mg.${game}.inflight`;
    await around('putSetting', () => rt.putSetting(learnerId, 'eq.mg.host', JSON.stringify({ v: 1, game, floor: game === GOLF ? 20 : 4 })));
    await around('settings', () => rt.settings(learnerId));
    const { id, revision: r0 } = await open(game, game);
    let revision = r0;
    let lastItem = '';
    for (let guard = 0; guard < 80; guard++) {
      const view = rt.currentView(id).view;
      if (view.status !== 'active') break;
      const key = view.activity?.itemSignature ?? '';
      if (key !== lastItem) {
        lastItem = key;
        // Play between answers: putts for a hole, crate moves for a delivery (each a game save).
        const moves = game === GOLF ? 2 + Math.floor(rand() * 5) : 3 + Math.floor(rand() * 4);
        for (let m = 0; m < moves; m++) {
          tick(3_000 + Math.floor(rand() * 6_000));
          const state = game === GOLF
            ? { v: 1, instanceId: id, state: { v: 1, game, hole: guard, phase: 'aim', ball: { x: rand(), y: rand() }, aim: rand(), power: rand(), lastPower: rand(), shots: m, movedAt: clock.now(), note: null, words: [key.slice(0, 12)], challengeKey: key, hints: [], shown: false } }
            : { v: 1, instanceId: id, state: { v: 1, cargo: { v: 1, key, load: { crates: [m % 3, (m + 1) % 3], sacks: m, boxes: m * 2 }, phase: 'loading', weighed: [], revisions: m, shown: false } } };
          await around('putSetting', () => rt.putSetting(learnerId, save, JSON.stringify(state)));
        }
      }
      revision = await step(id, revision, { missRate: game === GOLF ? 0.25 : 0.2, helpRate: 0.1, note: inflight });
      if (rt.currentView(id).view.activity?.itemSignature !== key) await around('putSetting', () => rt.putSetting(learnerId, inflight, ''));
    }
    await around('putSetting', () => rt.putSetting(learnerId, save, ''));
    await around('putSetting', () => rt.putSetting(learnerId, inflight, ''));
    rt.deactivate(id);
    await around('putSetting', () => rt.putSetting(learnerId, 'eq.mg.host', ''));
    if (game === GOLF) counts.golf += 1;
    else counts.cargo += 1;
  }

  for (let day = 0; day < days; day++) {
    if (day % 7 === 5) continue; // a day off each week
    counts.playDays += 1;
    clock.set(w.start + day * DAY_MS + 16 * 60 * 60 * 1000 + Math.floor(rand() * 3_600_000));
    await around('settings', () => rt.settings(learnerId));
    if (day % 30 === 3) {
      await around('putSetting', () => rt.putSetting(learnerId, 'motion', day % 60 === 3 ? 'reduced' : 'normal'));
      await around('putSetting', () => rt.putSetting(learnerId, 'output', 'speaker'));
      await around('putSetting', () => rt.putSetting(learnerId, 'effects', String(day % 90 !== 3)));
    }
    if (w.memory !== false && memoryNext < MEMORY_KEYS.length && rand() < 0.6) await around('remember', () => rt.remember(learnerId, MEMORY_KEYS[memoryNext++]!));
    const r = rand();
    await floor15(r < 0.15 ? 6 : 16); // most days a whole run; sometimes left part way
    if (r > 0.85) await floor15(16); // a second run on some days
    if (day % 7 === 6) {
      await miniGame(GOLF);
      await miniGame(CARGO);
    } else await miniGame(day % 2 === 0 ? GOLF : CARGO);
    await w.hooks?.endOfDay?.(day);
  }
  return counts;
}
