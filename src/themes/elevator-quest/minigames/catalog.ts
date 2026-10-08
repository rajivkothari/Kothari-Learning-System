// The mini-games in the building, without their screens (M9). Pure: the director reads it to know
// which landing offers which game; the registry (registry.ts) adds each game's screen.
//
// Cargo Commander's tiers (EC, cargo/tiers.ts): a new play session's instance id is chosen so the
// mission's pools (picked from the id) give the loads the learner's working tier calls for. A resumed
// session keeps its id, so its loads never change under it.
import coreMissions from '../../../../content/missions/core.json';
import twoDigitPack from '../../../../content/packs/two-digit.json';
import { MissionDefinitionSchema, type LearnerState, type MissionDefinition } from '../../../engine';
import { cargoActivities, chooseCargoSession } from './cargo/tiers';
import type { MiniGameEntry, MiniGameId } from './types';

let cargoMission: MissionDefinition | null | undefined;
/** The shipped cargo mission (parsed once, on the first new session). */
function shippedCargoMission(missionId: string): MissionDefinition | null {
  if (cargoMission === undefined) {
    const raw = (coreMissions.missions as unknown[]).find((m) => (m as { id?: string }).id === 'cargo-commander');
    cargoMission = raw ? MissionDefinitionSchema.parse(raw) : null;
  }
  return cargoMission && cargoMission.id === missionId ? cargoMission : null;
}

/** The instance id whose pools give the learner's planned tiers; `base` when the mission is not the shipped one. */
export function cargoInstanceFor(learner: LearnerState, base: string, missionId: string): string {
  const mission = shippedCargoMission(missionId);
  if (!mission) return base;
  return chooseCargoSession({ base, state: learner, mission, activities: cargoActivities(mission, twoDigitPack as { activities: { id: string; skills: string[] }[] }) }).instanceId;
}

export const MINI_GAMES: readonly MiniGameEntry[] = [
  { id: 'word-golf', floor: 20, missionId: 'word-golf', titleKey: 'wordGolf' },
  { id: 'cargo-commander', floor: 4, missionId: 'cargo-commander', titleKey: 'cargoCommander', chooseInstanceId: cargoInstanceFor },
];

export const MINI_GAME_IDS: readonly MiniGameId[] = MINI_GAMES.map((g) => g.id);

/** The game a landing offers, or null. */
export const miniGameAt = (floor: number): MiniGameEntry | null => MINI_GAMES.find((g) => g.floor === floor) ?? null;

export const miniGameById = (id: string): MiniGameEntry | null => MINI_GAMES.find((g) => g.id === id) ?? null;

export const isMiniGameId = (id: unknown): id is MiniGameId => typeof id === 'string' && MINI_GAME_IDS.includes(id as MiniGameId);
