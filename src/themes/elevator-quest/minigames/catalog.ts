// The mini-games in the building, without their screens (M9). Pure: the director reads it to know
// which landing offers which game; the registry (registry.ts) adds each game's screen.
//
// Cargo Commander's tiers (EC, cargo/tiers.ts): a new play session's instance id is chosen so the
// mission's pools (picked from the id) give the loads the learner's working tier calls for. A resumed
// session keeps its id, so its loads never change under it.
import coreMissions from '../../../../content/missions/core.json';
import twoDigitPack from '../../../../content/packs/two-digit.json';
import { MissionDefinitionSchema, type LearnerState, type MissionDefinition } from '../../../engine';
import { BASEMENT, type Place } from '../content/landings';
import { cargoActivities, chooseCargoSession } from './cargo/tiers';
import { LEVEL_MISSIONS, nextLevel } from './towerRescue/levels';
import { HOLE_MISSIONS, nextHoleFor } from './wordGolf/course';
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
  // Rooftop Word Golf: ten holes since D197, each its own mission (hole 1 is the original word-golf
  // mission). A new play session opens the first hole not finished; the hole map plays any open hole.
  { id: 'word-golf', floor: 20, missionId: 'word-golf', missions: HOLE_MISSIONS, chooseMission: (_learner, completed) => nextHoleFor(completed).mission, titleKey: 'wordGolf' },
  { id: 'cargo-commander', floor: 4, missionId: 'cargo-commander', titleKey: 'cargoCommander', chooseInstanceId: cargoInstanceFor },
  // Tower Rescue in the Relay Room, where the tower's power is routed: ten levels since D196, each its
  // own mission (the first is the original repair). A new play session opens the first level not
  // finished; the game's level map plays any open level (host.play).
  { id: 'tower-rescue', floor: 10, missionId: 'power-repair', missions: LEVEL_MISSIONS, chooseMission: (_learner, completed) => nextLevel(completed).mission, titleKey: 'towerRescue' },
  { id: 'express', floor: 1, missionId: 'express-route', titleKey: 'express' },
  // Strike Lab V0.1 (one bowling round) in B1, the basement bowling alley (D191).
  { id: 'strike', floor: 1, basement: true, missionId: 'strike-lab', titleKey: 'strike' },
];

export const MINI_GAME_IDS: readonly MiniGameId[] = MINI_GAMES.map((g) => g.id);

/** The game a landing offers, or null. `basement`: B1 (whose car stands at floor 1), not the lobby. */
export const miniGameAt = (floor: number, basement = false): MiniGameEntry | null => MINI_GAMES.find((g) => g.floor === floor && Boolean(g.basement) === basement) ?? null;

/** Where a game is, as a place: its floor, or B1. */
export const gamePlace = (g: Pick<MiniGameEntry, 'floor' | 'basement'>): Place => (g.basement ? BASEMENT : g.floor);

export const miniGameById = (id: string): MiniGameEntry | null => MINI_GAMES.find((g) => g.id === id) ?? null;

export const isMiniGameId = (id: unknown): id is MiniGameId => typeof id === 'string' && MINI_GAME_IDS.includes(id as MiniGameId);
