// What the open landing's objects do when touched, right now. Pure: the director checks a touch
// with it and the screen draws its hotspots from it, so the two always agree.
//
//   explore  free ride: the thing reacts every time; the first touch is a discovery (world memory)
//            and Lifty says one line. Never evidence, never value.
//   quiet    between jobs, with the doors open and no job waiting for an answer here (a hall call
//            waiting, a success waiting on NEXT JOB): the thing reacts, and that is all. Lifty's
//            words stay on the job and nothing is remembered, so a touch can never get in the
//            job's way or be mistaken for progress.
//   answer   a read-and-touch job made some of this landing's objects its answer targets: a touch
//            answers the job, only while that job's answer window is open (the director decides).
//
// Nothing reacts while a job is waiting for an answer on this landing (unless its objects are the
// answer), with the doors moving or shut, behind the Engineer Log or a reading card, or at the
// dormant Floor 15.
import { FLOOR15 } from '../content/floor15';
import { LANDINGS, exploreSpots, landingObjects, spotDiscovered, spotLabel, type ExploreSpotEntry, type LandingCatalog, type LandingObjectEntry } from '../content/landings';
import type { DirectorView } from './director';

export type TouchMode = 'explore' | 'quiet' | 'answer';

export interface TouchTarget {
  object: LandingObjectEntry;
  /** The exploration spot it belongs to (null for an answer target that is no spot). */
  spot: ExploreSpotEntry | null;
  mode: TouchMode;
  /** Found before (world memory). Always false for answer targets. */
  inspected: boolean;
  /** A two-state thing (the toolbox) that is open now. */
  open: boolean;
  /** What a touch does, for screen readers: the object and the action. */
  label: string;
}

export type TouchState = Pick<DirectorView, 'stage' | 'success' | 'elevator' | 'logOpen' | 'card' | 'floor15Restored' | 'discoveries' | 'answerTargets' | 'opened' | 'power'>;

/** The key of an open thing in `view.opened`. */
export const spotKey = (floor: number, spotId: string) => `${floor}/${spotId}`;

/** How the open landing's objects behave now, or null when nothing on it can be touched. */
export function touchMode(v: TouchState): TouchMode | null {
  if (v.elevator.phase !== 'idleOpen' || v.logOpen || v.card || v.power === 'off') return null;
  const floor = v.elevator.floor;
  if (v.answerTargets) return v.answerTargets.floor === floor ? 'answer' : null;
  if (floor === FLOOR15.repairFloor && !v.floor15Restored) return null;
  if (v.stage === 'freeRide') return 'explore';
  if (v.stage === 'call' || (v.stage === 'success' && v.success === 'review')) return 'quiet';
  return null;
}

/** The things on the open landing a touch reaches now, largest first (smaller things sit in front). */
export function touchTargets(v: TouchState, catalog: LandingCatalog = LANDINGS): TouchTarget[] {
  const mode = touchMode(v);
  if (!mode) return [];
  const floor = v.elevator.floor;
  const objects = landingObjects(catalog, floor);
  const targets: TouchTarget[] =
    mode === 'answer'
      ? (v.answerTargets?.objects ?? []).flatMap((id) => {
          const object = objects.find((o) => o.id === id);
          return object ? [{ object, spot: null, mode, inspected: false, open: false, label: object.name }] : [];
        })
      : exploreSpots(catalog, floor).flatMap((spot) => {
          const object = objects.find((o) => o.id === spot.target);
          if (!object) return [];
          const inspected = spotDiscovered(spot, v.discoveries);
          const open = v.opened.includes(spotKey(floor, spot.id));
          return [{ object, spot, mode, inspected, open, label: spotLabel(spot, { inspected, open }) }];
        });
  const size = (t: TouchTarget) => (t.object.box ? t.object.box.w * t.object.box.h : 1);
  return [...targets].sort((a, b) => size(b) - size(a));
}
