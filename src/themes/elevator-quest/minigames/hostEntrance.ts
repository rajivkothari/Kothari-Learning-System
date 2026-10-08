// When a landing offers its mini-game (M9). Pure: the director checks openGame() with it and the
// screen draws the PLAY button from it, so the two always agree (like director/landingTouch.ts).
//
// The entrance shows on a game's landing (catalog.ts: Word Golf on 20, Cargo Commander on 4) when
// the doors stand open there with nothing waiting to ride, and the learner is free to go and play:
//   freeRide              exploring the building
//   call                  between jobs: a hall call waits (a ride, never an answer)
//   success (review)      between jobs: the success has settled and NEXT JOB waits
//   task                  a job waits whose answer is elsewhere (the panel, the shaft map, the trip
//                         meter, another landing's things)
// Never during the intro, a correction (its pause or its board), the finale, the cargo bay, a ride,
// a save in flight, an error, the Engineer Log or a landing card, a reading job's note open or its
// cards up, or a read-and-touch job answered on this very landing. A game already open hides it.
import type { DirectorView } from '../director/director';
import { miniGameAt } from './catalog';
import type { MiniGameEntry } from './types';

export type EntranceState = Pick<DirectorView, 'stage' | 'success' | 'elevator' | 'power' | 'saving' | 'logOpen' | 'card' | 'rescueReady' | 'answerTargets' | 'miniGame'> & {
  reading: Pick<NonNullable<DirectorView['reading']>, 'open' | 'mode'> | null;
};

/** The game the open landing offers now, or null. */
export function gameEntrance(v: EntranceState): MiniGameEntry | null {
  if (v.miniGame || v.power !== 'on' || v.saving) return null;
  const e = v.elevator;
  if (e.phase !== 'idleOpen' || e.destination !== null) return null;
  const game = miniGameAt(e.floor);
  if (!game) return null;
  if (v.logOpen || v.card || v.rescueReady) return null;
  // A read-and-touch job answered on this landing: its things are the answer, the landing is busy.
  if (v.answerTargets?.floor === e.floor) return null;
  // A reading job's note open over the landing, or its cards over the cabin.
  if (v.reading && (v.reading.open || v.reading.mode === 'choose')) return null;
  switch (v.stage) {
    case 'freeRide':
    case 'call':
    case 'task':
      return game;
    case 'success':
      return v.success === 'review' ? game : null;
    default:
      return null;
  }
}
