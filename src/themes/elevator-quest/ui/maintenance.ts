// The free-ride maintenance panel's words, and where Floor 15's main power breaker stands on its
// landing. Pure (no React, no Skia): the screen draws what these return (D231).
import type { Direction, ElevatorPhase } from '../sim/elevator';

/** Engineering words for each machine phase: never the code's own names. */
export const PHASE_LABELS: Readonly<Record<ElevatorPhase, string>> = {
  idleOpen: 'DOORS OPEN',
  doorsClosing: 'SEALING DOORS',
  idleClosed: 'DOORS SEALED',
  departing: 'ENGAGING DRIVE',
  traveling: 'IN TRANSIT',
  decelerating: 'LEVELING',
  arrived: 'ARRIVED',
  doorsOpening: 'OPENING DOORS',
};

/** The readout's rows: state, direction and the car's position, as an engineer would read them. */
export function readoutRows(phase: ElevatorPhase, direction: Direction | null, floor: number | string): [string, string][] {
  return [
    ['STATE', PHASE_LABELS[phase]],
    ['DIR', direction === 'up' ? 'UP' : direction === 'down' ? 'DOWN' : 'STANDBY'],
    ['CAR POS', typeof floor === 'number' ? `FL ${floor}` : floor],
  ];
}

/**
 * The main power breaker on the repair floor's landing: a bolted conduit box low on the right of the
 * doorway, clear of the name sign, inside the door, never smaller than a readable box.
 */
export function breakerBox(door: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const w = Math.max(28, door.w * 0.17);
  const h = Math.max(40, door.h * 0.3);
  return { x: door.x + door.w - w - Math.max(6, door.w * 0.06), y: door.y + door.h - h - Math.max(8, door.h * 0.1), w, h };
}
