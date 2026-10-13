// Tower Rescue's levels (D196): ten short repairs, each a runtime mission of its own (missions/core.json,
// level words in towerRescue.json). Pure: no React. The catalog lists their missions; the flow reads a
// level's setup; the screen draws the level map.
//
// A level is the same loop every time (find the problem, fix it, RUN TEST), with a different machine
// problem. What the learner does at a step is decided by the step's activity (its generator), so a
// level is content, not code: a new level is a mission plus a level entry, using these stations.
//   cells    one power cell fills a gap exactly           quantity.fillToCapacity
//   pair     two power cells make an exact target         quantity.pairToTarget
//   dial     the missing setting of a dial that counts    quantity.missingInSequence
//   gears    a big gear (ten floors) and a small gear     quantity.tensAndOnes
//   route    floors up or down, once or twice             quantity.positionAfterMove, positionAfterTwoMoves
//   sensor   read a log, pick the floor it describes      literacy.authoredItem (repair.sensor-log)
//   checklist read a checklist, pick the step first       literacy.authoredItem (repair.checklist)
//   inspect  read a report, pick the failed system        literacy.authoredItem (repair.inspection)
import { TOWER_RESCUE, type TowerLevel, type TowerRescueCopy } from '../../content/minigames';

export type Station = 'cells' | 'pair' | 'dial' | 'gears' | 'route' | 'sensor' | 'checklist' | 'inspect';

const BY_GENERATOR: Record<string, Station> = {
  'quantity.fillToCapacity': 'cells',
  'quantity.pairToTarget': 'pair',
  'quantity.missingInSequence': 'dial',
  'quantity.tensAndOnes': 'gears',
  'quantity.positionAfterMove': 'route',
  'quantity.positionAfterTwoMoves': 'route',
};
const BY_ACTIVITY: Record<string, Station> = { 'repair.sensor-log': 'sensor', 'repair.checklist': 'checklist', 'repair.inspection': 'inspect' };

/**
 * Which station an item is, from its activity and its prompt (the engine's prompt fields tell the
 * generator apart: a pair has `count` and `target`, a dial `step`, gears `tens`, a route `change`).
 * Null when the item is none of them (wrong content): the game then says it cannot show it.
 */
export function stationFor(activityId: string, prompt: Readonly<Record<string, unknown>>): Station | null {
  const byActivity = BY_ACTIVITY[activityId];
  if (byActivity) return byActivity;
  if (typeof prompt.capacity === 'number' && typeof prompt.aboard === 'number') return 'cells';
  if (typeof prompt.target === 'number' && typeof prompt.count === 'number') return 'pair';
  if (typeof prompt.step === 'number' && typeof prompt.first === 'number') return 'dial';
  if (typeof prompt.tens === 'number' && typeof prompt.start === 'number') return 'gears';
  if (typeof prompt.change === 'number' && typeof prompt.start === 'number') return 'route';
  return null;
}
/** For tests: the generator each station comes from. */
export const STATION_GENERATORS = BY_GENERATOR;

export interface LevelInfo extends TowerLevel {
  /** 1-based number on the level map. */
  n: number;
}

export const levelsOf = (copy: TowerRescueCopy = TOWER_RESCUE): LevelInfo[] => copy.levels.map((l, i) => ({ ...l, n: i + 1 }));
export const LEVELS: readonly LevelInfo[] = levelsOf();
export const LEVEL_MISSIONS: readonly string[] = LEVELS.map((l) => l.mission);

/** The level a mission is, or the first level (an unknown mission plays as the original repair). */
export const levelOf = (missionId: string, levels: readonly LevelInfo[] = LEVELS): LevelInfo => levels.find((l) => l.mission === missionId) ?? levels[0]!;

/**
 * Which levels can be played: every finished one (to replay it) and the first one not finished yet.
 * Levels open in order; nothing is ever taken away.
 */
export function openLevels(finished: readonly string[], levels: readonly LevelInfo[] = LEVELS): Set<string> {
  const open = new Set<string>();
  for (const l of levels) {
    open.add(l.mission);
    if (!finished.includes(l.mission)) break;
  }
  for (const m of finished) if (levels.some((l) => l.mission === m)) open.add(m);
  return open;
}

/** A new play session's level: the first one not finished, or the last once every level is. */
export function nextLevel(finished: readonly string[], levels: readonly LevelInfo[] = LEVELS): LevelInfo {
  return levels.find((l) => !finished.includes(l.mission)) ?? levels[levels.length - 1]!;
}

/** The level after this one, or null after the last. */
export const levelAfter = (missionId: string, levels: readonly LevelInfo[] = LEVELS): LevelInfo | null => {
  const i = levels.findIndex((l) => l.mission === missionId);
  return i >= 0 && i + 1 < levels.length ? levels[i + 1]! : null;
};
