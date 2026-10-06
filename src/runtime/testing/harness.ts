/// <reference types="node" />
// Test harness for the runtime: temp SQLite files, a deterministic clock, and helpers
// that find answers through the public preview API (as an optimistic UI would).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sampleMissions from '../../../content/fixtures/sample-missions.json';
import coreMissions from '../../../content/missions/core.json';
import demoPlacement from '../../../content/placement/demo-start.json';
import corePack from '../../../content/packs/core.json';
import { BUILT_IN_GENERATORS, ContentPackSchema, MissionPackSchema, PlacementSchema } from '../../engine';
import { MISSIONS, PACK, PACK_GRAPH, POLICY, T0, graphOf } from '../../engine/testing/support';
import type { SqlDatabase } from '../../persistence/driver';
import { openNodeDatabase, type FaultPlan } from '../../persistence/testing/nodeDatabase';
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

const CORE_PACK = ContentPackSchema.parse(corePack);

/** The theme-neutral core pack and missions the app ships (value answers). */
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

export function tempDir(): { file: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-'));
  return { file: path.join(dir, 'game.db'), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
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
