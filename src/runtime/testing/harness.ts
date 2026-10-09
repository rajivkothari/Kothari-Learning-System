/// <reference types="node" />
// Test harness for the runtime: temp SQLite files, a deterministic clock, and helpers
// that find answers through the public preview API (as an optimistic UI would).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sampleMissions from '../../../content/fixtures/sample-missions.json';
import coreMissions from '../../../content/missions/core.json';
import demoPlacement from '../../../content/placement/demo-start.json';
import { BUILT_IN_GENERATORS, MissionPackSchema, PlacementSchema, type AnswerValue } from '../../engine';
import { MISSIONS, PACK, PACK_GRAPH, POLICY, SHIPPED_PACK, T0, graphOf } from '../../engine/testing/support';
import type { SqlDatabase } from '../../persistence/driver';
import { closeNodeDatabasesUnder, openNodeDatabase, type FaultPlan } from '../../persistence/testing/nodeDatabase';
import { openGameRuntime, type GameRuntime, type RuntimeContent } from '../gameRuntime';

export const CONTENT: RuntimeContent = {
  pack: PACK,
  missions: MISSIONS,
  registry: BUILT_IN_GENERATORS,
  graph: PACK_GRAPH,
  policy: POLICY,
  missionsVersion: sampleMissions.version,
  unlocks: [
    { id: 'test.rank-1', when: { missionCompleted: 'positions-and-loads' } },
    { id: 'test.panel', when: { missionCompleted: 'positions-and-loads' } },
  ],
};

/** The packs the app ships, composed in the app's order: core math, reading, spelling, two-digit math. */
const CORE_PACK = SHIPPED_PACK;

/** The theme-neutral packs and missions the app ships (value answers; the reading jobs also take choices). */
export const CORE_CONTENT: RuntimeContent = {
  pack: CORE_PACK,
  missions: MissionPackSchema.parse(coreMissions).missions,
  registry: BUILT_IN_GENERATORS,
  graph: graphOf(CORE_PACK.skills),
  policy: POLICY,
  missionsVersion: coreMissions.version,
  unlocks: [{ id: 'test.core-badge', when: { missionCompleted: 'positions-and-capacity' } }],
  placement: PlacementSchema.parse(demoPlacement),
};

/**
 * A temp directory for one test database. `cleanup` first closes every connection the test left
 * open on a file in it (node:sqlite keeps the file and its -wal/-shm open until then), then
 * deletes the directory: deleting open files fails on Windows and loses later writes elsewhere.
 */
export function tempDir(): { file: string; dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-'));
  return {
    file: path.join(dir, 'game.db'),
    dir,
    cleanup: () => {
      closeNodeDatabasesUnder(dir);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Advances one second per call. Shared across reopen so time keeps moving forward. */
export function fakeClock(start = T0, stepMs = 1000) {
  let t = start;
  return {
    now: () => (t += stepMs),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

export interface Opened {
  db: SqlDatabase;
  rt: GameRuntime;
}

export async function open(file: string, clock: { now(): number }, faults?: FaultPlan, content: RuntimeContent = CONTENT): Promise<Opened> {
  const db = openNodeDatabase(file, faults);
  return { db, rt: await openGameRuntime(db, content, clock) };
}

export async function correctOption(rt: GameRuntime, instanceId: string): Promise<string> {
  const view = await rt.view(instanceId);
  for (const o of view.activity?.options ?? []) {
    if ((await rt.preview(instanceId, o.id))?.correct) return o.id;
  }
  throw new Error('No correct option found');
}

export async function wrongOption(rt: GameRuntime, instanceId: string, tagged: boolean): Promise<string> {
  const view = await rt.view(instanceId);
  let fallback: string | null = null;
  for (const o of view.activity?.options ?? []) {
    const p = await rt.preview(instanceId, o.id);
    if (p && !p.correct) {
      fallback ??= o.id;
      if (tagged === (p.misconception !== null)) return o.id;
    }
  }
  if (fallback) return fallback;
  throw new Error('No wrong option found');
}

/** An answer as `submit` takes it: a value (value mode) or a listed option (choice mode). */
export type Answer = { value: AnswerValue } | { optionId: string };

/**
 * The right answer for the visible item, found through the runtime's pure, in-memory check (as a
 * UI never would, but a test may): a value in value mode, a listed option in choice mode (an
 * authored reading item). The mission must be active.
 */
export function rightAnswer(rt: GameRuntime, instanceId: string): Answer {
  const activity = rt.currentView(instanceId).view.activity;
  if (!activity) throw new Error('No item to answer');
  const a = activity.answer;
  if (a.mode === 'choice') {
    for (const o of activity.options) {
      const c = rt.check(instanceId, { mode: 'choice', optionId: o.id });
      if (c.ok && c.evaluation.correct) return { optionId: o.id };
    }
  } else if (a.mode === 'text') {
    // A spelling word is never in the prompt: a test looks it up in the pack by the prompt's word id.
    const params = CORE_PACK.activities.find((x) => x.id === activity.activityId)?.params as { words?: { id: string; word: string }[] } | undefined;
    const word = params?.words?.find((w) => w.id === activity.prompt.wordId)?.word;
    if (word && rt.check(instanceId, { mode: 'value', value: word }).ok) return { value: word };
  } else {
    for (let v = a.min; v <= a.max; v++) {
      const c = rt.check(instanceId, { mode: 'value', value: v });
      if (c.ok && c.evaluation.correct) return { value: v };
    }
  }
  throw new Error('No right answer found');
}

/** A wrong answer for the visible item: one past the right value (one below at the top), or the first wrong listed option. */
export function wrongAnswer(rt: GameRuntime, instanceId: string): Answer {
  const right = rightAnswer(rt, instanceId);
  if ('value' in right && typeof right.value === 'string') {
    // A text answer: the word with its last letter changed.
    const w = right.value;
    return { value: `${w.slice(0, -1)}${w.endsWith('z') ? 'y' : 'z'}` };
  }
  if ('value' in right) {
    const a = rt.currentView(instanceId).view.activity!.answer as { max: number };
    const v = right.value as number;
    return { value: v === a.max ? v - 1 : v + 1 };
  }
  const wrong = rt.currentView(instanceId).view.activity!.options.find((o) => o.id !== right.optionId);
  if (!wrong) throw new Error('No wrong option found');
  return { optionId: wrong.id };
}

/** Play the current mission to the end with correct answers. Returns all intents. */
export async function finish(rt: GameRuntime, instanceId: string, prefix: string) {
  const intents = [];
  for (let n = 0; n < 50; n++) {
    const view = await rt.view(instanceId);
    if (view.status === 'completed') return intents;
    const out = view.narrative
      ? await rt.acknowledge(instanceId, { commandId: `${prefix}-${n}` })
      : await rt.submit(instanceId, { commandId: `${prefix}-${n}`, optionId: await correctOption(rt, instanceId) });
    intents.push(...out.intents);
  }
  throw new Error('Mission did not finish');
}

export async function count(db: SqlDatabase, sql: string, params: (string | number)[] = []): Promise<number> {
  return (await db.get<{ n: number }>(sql, params))?.n ?? 0;
}
