// How a reading job is answered on screen right now (M8). Pure: no React.
//
// The note opens first: the learner reads. Folded, the learner answers:
//   ride    on the floor panel, like a move job
//   choose  on the cards
//   touch   on the landing: the job's things are its answer targets, when EVERY one of them can be
//           touched on the landing as drawn now (its box on the art while the art shows, its place on
//           the vector landing otherwise, and within reach of the doorway's touch area). When even one
//           cannot (art pending or failed to decode, a thing painted outside the safe core, a split
//           view's small doorway), the whole job is answered with cards naming the same options. A job
//           never mixes the two: the same option ids and the same commands either way, so the
//           evidence is the same.
import type { LandingObjectEntry } from '../content/landings';
import type { DirectorView, ReadingView } from '../director/director';
import type { TouchTarget } from '../director/landingTouch';
import type { Box } from './layout';
import { placeHotspots, type LandingDrawn, type PlacedHotspot } from './touchAreas';

/**
 * Whether a read-and-touch job's things can all be touched now: true when every answer target got a
 * touch area, false when even one did not, null when there are no answer targets (no touch job here,
 * or the landing cannot be touched now: doors moving, the note open over it).
 */
export function answerReach(targets: readonly TouchTarget[], placed: readonly PlacedHotspot[]): boolean | null {
  const answers = targets.filter((t) => t.mode === 'answer');
  if (answers.length === 0) return null;
  return answers.every((t) => placed.some((p) => p.target.object.id === t.object.id));
}

/**
 * Whether a touch job can be answered on this landing as drawn now: every one of its options (all of
 * them, also after SHOW ME leaves only one to touch, so a job never changes surface halfway) is an
 * object here with a touch area within `limits`. Decided whether or not the doors are open, so the
 * cards never come and go with the doors.
 */
export function jobReach(optionIds: readonly string[], objects: readonly LandingObjectEntry[], drawn: LandingDrawn, limits: Box): boolean {
  const targets: TouchTarget[] = [];
  for (const id of optionIds) {
    const object = objects.find((o) => o.id === id);
    if (!object) return false;
    targets.push({ object, spot: null, mode: 'answer', inspected: false, open: false, label: object.name });
  }
  return answerReach(targets, placeHotspots(targets, drawn, [], limits)) === true;
}

/** The touch areas to offer: all of them, or, when a touch job cannot be touched whole, none of its answer targets. */
export function offeredHotspots(placed: readonly PlacedHotspot[], reach: boolean | null): readonly PlacedHotspot[] {
  return reach === false ? placed.filter((p) => p.target.mode !== 'answer') : placed;
}

/** The stages a reading job is on screen in: waiting for the answer, the answer under way, a miss's pause. */
export const readingOnScreen = (v: Pick<DirectorView, 'stage' | 'reading'>): ReadingView | null => (v.reading && (v.stage === 'task' || v.stage === 'riding' || v.stage === 'pause') ? v.reading : null);

export type ReadingSurface = 'note' | 'panel' | 'cards' | 'landing';

/**
 * What the reading job shows now: its note (open), or what it is answered with (folded). `reach`:
 * CabinScene's answer for the landing as drawn now (jobReach). Null while it is not known (the
 * landing drawn is not the job's): nothing to touch, and no cards either.
 */
export function readingSurface(reading: Pick<ReadingView, 'open' | 'mode'>, reach: boolean | null): ReadingSurface | null {
  if (reading.open) return 'note';
  if (reading.mode === 'ride') return 'panel';
  if (reading.mode === 'choose') return 'cards';
  return reach === true ? 'landing' : reach === false ? 'cards' : null;
}

/**
 * The landing targets a touch reaches now, as the screen passes them on: a reading job's answer
 * targets named as its note names them (the same words as the cards), and none while the note is open
 * over the landing (the note is read first; the things are touched once it is folded).
 */
export function readingTouch(targets: readonly TouchTarget[], reading: Pick<ReadingView, 'open' | 'options'> | null): readonly TouchTarget[] {
  if (!reading) return targets;
  if (reading.open) return targets.filter((t) => t.mode !== 'answer');
  return targets.map((t) => {
    if (t.mode !== 'answer') return t;
    const option = reading.options.find((o) => o.value === t.object.id);
    return option ? { ...t, label: option.label } : t;
  });
}
