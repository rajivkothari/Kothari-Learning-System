/// <reference types="node" />
// Test-only content for the mini-game framework (M9): the shipped content plus two small test
// missions the framework's tests play, so they do not depend on the games' own missions (EC). The
// test missions use the reading pack's authored items: a value answer (a floor) and a choice (a
// card), its help ladder (a clue, then SHOW ME) and a fresh item after two misses. No Concept Rescue.
import { MissionDefinitionSchema, type MissionDefinition } from '../../../../engine';
import { openGameRuntime, type GameRuntime } from '../../../../runtime/gameRuntime';
import { openNodeDatabase } from '../../../../persistence/testing/nodeDatabase';
import type { SqlDatabase } from '../../../../persistence/driver';
import { CONTENT } from '../../testing/headless';
import { MINI_GAMES } from '../catalog';
import type { MiniGameEntry } from '../types';

export const TEST_MISSIONS: MissionDefinition[] = [
  MissionDefinitionSchema.parse({
    schemaVersion: 1,
    id: 'test-word-golf',
    version: 1,
    title: 'Framework test: two value items, then a choice',
    completionTier: 'low',
    steps: [
      { kind: 'activity', id: 'words', activityId: 'reading.details.ride', items: 2 },
      { kind: 'activity', id: 'pick', activityId: 'reading.vocabulary.cards', items: 1 },
    ],
  }),
  MissionDefinitionSchema.parse({
    schemaVersion: 1,
    id: 'test-cargo-commander',
    version: 1,
    title: 'Framework test: a story beat, then one value item',
    completionTier: 'low',
    steps: [
      { kind: 'narrative', id: 'brief', eventKey: 'cargo.brief' },
      { kind: 'activity', id: 'loads', activityId: 'reading.details.ride', items: 1 },
    ],
  }),
];

export const GAME_TEST_CONTENT: typeof CONTENT = { ...CONTENT, missions: [...CONTENT.missions, ...TEST_MISSIONS] };

/** The real catalog (ids, floors), each game on its test mission. */
export const TEST_CATALOG: readonly MiniGameEntry[] = MINI_GAMES.map((g) => ({ ...g, missionId: `test-${g.id}` }));
export const testGame = (id: MiniGameEntry['id']): MiniGameEntry => TEST_CATALOG.find((g) => g.id === id)!;

export async function openTestRuntime(file: string, clock: { now(): number }): Promise<{ db: SqlDatabase; rt: GameRuntime }> {
  const db = openNodeDatabase(file);
  return { db, rt: await openGameRuntime(db, GAME_TEST_CONTENT, clock) };
}

/** Everything learning or progression could have written (counts and the learner's state). */
export async function learningRows(db: SqlDatabase): Promise<{ events: number; progression: number; unlocks: number }> {
  const n = async (sql: string) => (await db.get<{ n: number }>(sql, []))?.n ?? 0;
  return {
    events: await n('SELECT COUNT(*) AS n FROM learning_events'),
    progression: await n('SELECT COUNT(*) AS n FROM progression_events'),
    unlocks: await n('SELECT COUNT(*) AS n FROM unlocks'),
  };
}
