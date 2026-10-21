// How each floor looks beyond the doors. Pure data: no React, no Skia.
//
// A FloorLook is presentation only. It never changes what the simulation does, which floor
// the indicator shows, or what a destination means. The scene asks for the look of the floor
// the car is actually at (`elevator.floor`) and draws it when the doors open.
//
// Landings:
//   painted     the general landing: one wall paint, one accent stripe, the floor number
//               painted as a vector stencil. Floors cycle five paints so each reads as a place.
//   repairDeck  Floor 15, the mission's destination: a mechanical repair level. Unpowered
//               (emergency light only) until the mission restores it; lit afterwards.
import type { Hex, ThemeTokens } from '../../../presentation/design/tokens';

export type LandingKind = 'painted' | 'repairDeck';

export interface FloorLook {
  floor: number;
  landing: LandingKind;
  /** Wall paint behind the doors. Muted: never the indicator amber or the help cyan. */
  paint: Hex;
  /** A baseboard or stripe accent. */
  accent: Hex;
  /** Light temperature of the landing's practical light. */
  light: 'warm' | 'cool';
}

/** Landing wall paints: graphic, muted, each a different place. */
const PAINTS: Hex[] = ['#1E3A5C', '#24324A', '#1D4248', '#352E52', '#283D57'];
const ACCENTS: Hex[] = ['#B9895A', '#C9D3E0', '#7F93AE', '#A88A6A', '#9AA9BD'];

export function floorLook(floor: number, repairFloor: number): FloorLook {
  const i = ((floor % PAINTS.length) + PAINTS.length) % PAINTS.length;
  if (floor === repairFloor) return { floor, landing: 'repairDeck', paint: '#2A3344', accent: '#B98A3E', light: 'warm' };
  return { floor, landing: 'painted', paint: PAINTS[i]!, accent: ACCENTS[i]!, light: i % 2 === 0 ? 'warm' : 'cool' };
}

/** Colors a landing must never use for its paint, because they carry meaning elsewhere. */
export function reservedLandingColors(t: ThemeTokens): Hex[] {
  return [t.palette.accentPrimary, t.palette.accentSecondary, t.palette.danger, t.palette.warning, t.state.selected.ring, t.state.clue.ring];
}
