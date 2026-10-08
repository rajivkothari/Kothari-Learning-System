// What the open landing's objects do when touched, right now. Pure: the director checks a touch
// with it and the screen draws its hotspots from it, so the two always agree.
//
//   explore  free ride: the thing reacts every time; the first touch is a discovery (world memory)
//            and Lifty says one line. Never evidence, never value.
//   quiet    the mission is on and its answer is not on this landing (D161): a hall call waiting, a
//            math job (panel, shaft map, trip meter, cargo), a ride or card reading job with its note
//            folded, a miss's pause, the success up to NEXT JOB. The thing reacts (its motion and its
//            sound), and that is all: no discovery, no Lifty line, nothing remembered, never an
//            answer, so a touch can never get in the job's way or be mistaken for progress.
//   answer   a read-and-touch job made some of this landing's objects its answer targets: a touch
//            answers the job, only while that job's answer window is open (the director decides).
//            The other things on that landing stay still meanwhile (a touch there is never an answer).
//
// Nothing reacts with the doors moving or shut, behind the Engineer Log or a reading card, with a
// reading job's note open over the landing, at the dormant Floor 15, or in the stages where the
// screen belongs to something else (the intro, a correction's board, the finale, loading, errors).
import { FLOOR15 } from '../content/floor15';
import { LANDINGS, exploreSpots, landingObjects, spotDiscovered, spotLabel, type ExploreSpotEntry, type LandingCatalog, type LandingObjectEntry } from '../content/landings';
import type { DirectorView, Stage } from './director';

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

export type TouchState = Pick<DirectorView, 'stage' | 'success' | 'elevator' | 'logOpen' | 'card' | 'floor15Restored' | 'discoveries' | 'answerTargets' | 'opened' | 'power'> & {
  /** The reading job on now: while its note is open over the landing, nothing there reacts. */
  reading: Pick<NonNullable<DirectorView['reading']>, 'open'> | null;
};

/** Stages with the mission on and its answer elsewhere: the landing's things react quietly. */
export const QUIET_STAGES: readonly Stage[] = ['call', 'task', 'cargo', 'pause', 'success'];

/** The key of an open thing in `view.opened`. */
export const spotKey = (floor: number, spotId: string) => `${floor}/${spotId}`;

/** How the open landing's objects behave now, or null when nothing on it can be touched. */
export function touchMode(v: TouchState): TouchMode | null {
  if (v.elevator.phase !== 'idleOpen' || v.logOpen || v.card || v.power === 'off') return null;
  const floor = v.elevator.floor;
  // A touch job's own landing: its things are the answer (the screen offers them once the note is folded).
  if (v.answerTargets?.floor === floor) return 'answer';
  if (v.reading?.open) return null;
  if (floor === FLOOR15.repairFloor && !v.floor15Restored) return null;
  // A touch job waits on another landing: exploring stops, the things here only react.
  if (v.answerTargets) return 'quiet';
  if (v.stage === 'freeRide') return 'explore';
  return QUIET_STAGES.includes(v.stage) ? 'quiet' : null;
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
