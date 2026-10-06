// Simulation events -> semantic audio cues. Pure and deterministic.
//
// The mapper keeps a little state so the sound stays sane under mashing:
// - mechanical clicks are rate-limited (one per CLICK_GAP_MS), so ten taps are not ten stacked clicks
// - a loop is started at most once and always stopped by the event that ends it
// - the arrival chime can only follow an arrival, and the travel loop never outlives it
import type { ElevatorEvent } from '../sim/elevator';
import type { SoundSlot } from './profile';

export type AudioCue =
  | { at: number; action: 'play'; slot: SoundSlot }
  | { at: number; action: 'loopStart'; slot: SoundSlot }
  | { at: number; action: 'loopStop'; slot: SoundSlot; fadeMs: number };

export const CLICK_GAP_MS = 90;

export interface CueMapper {
  map(events: readonly ElevatorEvent[]): AudioCue[];
  /** Non-elevator cues (completion, overload) go through here so loops stay consistent. */
  extra(cue: AudioCue): AudioCue[];
  activeLoops(): SoundSlot[];
}

export function createCueMapper(options: { decelFadeMs: number }): CueMapper {
  const loops = new Set<SoundSlot>();
  let lastClickAt = -Infinity;
  let arrivedSinceTravel = false;

  const start = (slot: SoundSlot, at: number): AudioCue[] => {
    if (loops.has(slot)) return [];
    loops.add(slot);
    return [{ at, action: 'loopStart', slot }];
  };
  const stop = (slot: SoundSlot, at: number, fadeMs = 0): AudioCue[] => {
    if (!loops.has(slot)) return [];
    loops.delete(slot);
    return [{ at, action: 'loopStop', slot, fadeMs }];
  };
  const click = (slot: SoundSlot, at: number): AudioCue[] => {
    if (at - lastClickAt < CLICK_GAP_MS) return [];
    lastClickAt = at;
    return [{ at, action: 'play', slot }];
  };

  function one(e: ElevatorEvent): AudioCue[] {
    switch (e.type) {
      case 'buttonPressed':
        // A dispatch from the machine registers a call without anyone pushing a button.
        return e.source === 'system' ? [] : click('floorButtonPress', e.at);
      case 'buttonLit':
        return [{ at: e.at, action: 'play', slot: 'floorButtonActivate' }];
      case 'doorButton':
        return click('doorButtonPress', e.at);
      case 'doorsClosing':
      case 'doorsOpening':
        return start('doorMotor', e.at);
      case 'doorsClosed':
        return [...stop('doorMotor', e.at), { at: e.at, action: 'play', slot: 'doorClosed' }];
      case 'doorsOpened':
        return [...stop('doorMotor', e.at), { at: e.at, action: 'play', slot: 'doorOpened' }];
      case 'departing':
        arrivedSinceTravel = false;
        return [{ at: e.at, action: 'play', slot: 'motorStart' }];
      case 'travelStarted':
        return start('travelLoop', e.at);
      case 'decelerating':
        return [...stop('travelLoop', e.at, options.decelFadeMs), { at: e.at, action: 'play', slot: 'deceleration' }];
      case 'arrived':
        arrivedSinceTravel = true;
        return [...stop('travelLoop', e.at), { at: e.at, action: 'play', slot: 'arrivalStop' }];
      case 'chime':
        return arrivedSinceTravel ? [{ at: e.at, action: 'play', slot: 'arrivalChime' }] : [];
      case 'floorPassed':
      case 'buttonCleared':
        return [];
    }
  }

  return {
    map: (events) => events.flatMap(one),
    extra: (cue) => {
      if (cue.action === 'loopStart') return start(cue.slot, cue.at);
      if (cue.action === 'loopStop') return stop(cue.slot, cue.at, cue.fadeMs);
      return [cue];
    },
    activeLoops: () => [...loops],
  };
}
