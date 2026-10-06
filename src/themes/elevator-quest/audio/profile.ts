// Elevator sound profiles: semantic slots -> concrete assets. Game logic and the simulation
// only ever name SLOTS; a profile decides what each slot sounds like. Swapping the whole
// elevator's character (modern office, old hydraulic, high-speed tower) means adding a
// profile, not touching logic. Asset ids resolve through the audio manifest.

export const SOUND_SLOTS = [
  'floorButtonPress', // mechanical click of a floor button
  'floorButtonActivate', // soft confirmation when a call registers (button lights)
  'doorButtonPress', // click of Door Open / Door Close
  'doorMotor', // loop while the doors move
  'doorClosed', // doors meet and seal
  'doorOpened', // doors settle fully open
  'motorStart', // brake release and motor engaging
  'travelLoop', // loop while the car moves
  'deceleration', // motor winding down into the floor
  'arrivalStop', // car levels and stops
  'arrivalChime', // arrival signal
  'ambientMachinery', // quiet machine-room loop
  'overloadTone', // calm load-warning tone (never an alarm)
  'powerRestore', // systems coming back online at mission completion
  'completion', // short completion cue
] as const;
export type SoundSlot = (typeof SOUND_SLOTS)[number];

export type SoundCategory = 'interface' | 'elevator' | 'ambient' | 'dialogue' | 'music';

export interface SlotSpec {
  category: SoundCategory;
  loop: boolean;
  /** Essential confirmation: kept audible in quiet mode. Never the only carrier of information. */
  essential: boolean;
}

export const SLOT_SPECS: Record<SoundSlot, SlotSpec> = {
  floorButtonPress: { category: 'interface', loop: false, essential: true },
  floorButtonActivate: { category: 'interface', loop: false, essential: true },
  doorButtonPress: { category: 'interface', loop: false, essential: true },
  doorMotor: { category: 'elevator', loop: true, essential: false },
  doorClosed: { category: 'elevator', loop: false, essential: false },
  doorOpened: { category: 'elevator', loop: false, essential: false },
  motorStart: { category: 'elevator', loop: false, essential: false },
  travelLoop: { category: 'elevator', loop: true, essential: false },
  deceleration: { category: 'elevator', loop: false, essential: false },
  arrivalStop: { category: 'elevator', loop: false, essential: false },
  arrivalChime: { category: 'elevator', loop: false, essential: true },
  ambientMachinery: { category: 'ambient', loop: true, essential: false },
  overloadTone: { category: 'elevator', loop: false, essential: true },
  powerRestore: { category: 'music', loop: false, essential: false },
  completion: { category: 'music', loop: false, essential: true },
};

export interface SlotAsset {
  /** Key in the audio manifest. */
  asset: string;
  /** Per-profile trim, 0..1. */
  gain: number;
}

export interface ElevatorSoundProfile {
  id: string;
  label: string;
  slots: Record<SoundSlot, SlotAsset | null>;
}

/** Prototype "modern office" profile. Every asset is a synthesized placeholder (see manifest). */
export const PROTOTYPE_MODERN: ElevatorSoundProfile = {
  id: 'prototype-modern',
  label: 'Modern traction elevator (synthesized prototype)',
  slots: {
    floorButtonPress: { asset: 'button-click', gain: 0.9 },
    floorButtonActivate: { asset: 'button-confirm', gain: 0.5 },
    doorButtonPress: { asset: 'button-click', gain: 0.8 },
    doorMotor: { asset: 'door-motor-loop', gain: 0.45 },
    doorClosed: { asset: 'door-thud', gain: 0.7 },
    doorOpened: { asset: 'door-settle', gain: 0.45 },
    motorStart: { asset: 'motor-start', gain: 0.6 },
    travelLoop: { asset: 'travel-loop', gain: 0.5 },
    deceleration: { asset: 'motor-slow', gain: 0.55 },
    arrivalStop: { asset: 'arrival-stop', gain: 0.6 },
    arrivalChime: { asset: 'arrival-chime', gain: 0.75 },
    ambientMachinery: { asset: 'ambient-machinery', gain: 0.22 },
    overloadTone: { asset: 'overload-tone', gain: 0.55 },
    powerRestore: { asset: 'power-restore', gain: 0.6 },
    completion: { asset: 'completion', gain: 0.6 },
  },
};
