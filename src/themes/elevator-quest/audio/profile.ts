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
  'landingReaction', // fallback for a landing spot that names no sound of its own
  // Landing things (landings.json names them per spot; M8.1)
  'toolboxOpen',
  'toolboxClose',
  'fanStart',
  'gearTurn',
  'springBoing',
  'windmillTurn',
  'radioStatic',
  'craneLower',
  'coreHum',
  'drawerSlide',
  'bookOpen',
  'telescopeTurn',
  'golfPutt', // ONE composite: putter tap at 0 ms, roll to ~1300 ms, cup drop ~1300-1550 ms
  // Feedback (the director plays each once, where it begins)
  'answerRight', // subtle
  'answerWrong', // gentle and neutral, never punitive
  'discovery', // a first discovery: short curious flourish
] as const;
export type SoundSlot = (typeof SOUND_SLOTS)[number];

export type SoundCategory = 'interface' | 'elevator' | 'ambient' | 'dialogue' | 'music';

export interface SlotSpec {
  category: SoundCategory;
  loop: boolean;
  /** Essential confirmation: kept audible in quiet mode. Never the only carrier of information. */
  essential: boolean;
  /** One-shots: the shortest time between two starts of this slot. A request inside it is dropped, so taps never pile up. */
  gapMs: number;
}

const thing: SlotSpec = { category: 'elevator', loop: false, essential: false, gapMs: 250 };

export const SLOT_SPECS: Record<SoundSlot, SlotSpec> = {
  floorButtonPress: { category: 'interface', loop: false, essential: true, gapMs: 90 },
  floorButtonActivate: { category: 'interface', loop: false, essential: true, gapMs: 120 },
  doorButtonPress: { category: 'interface', loop: false, essential: true, gapMs: 90 },
  doorMotor: { category: 'elevator', loop: true, essential: false, gapMs: 0 },
  doorClosed: { category: 'elevator', loop: false, essential: false, gapMs: 200 },
  doorOpened: { category: 'elevator', loop: false, essential: false, gapMs: 200 },
  motorStart: { category: 'elevator', loop: false, essential: false, gapMs: 300 },
  travelLoop: { category: 'elevator', loop: true, essential: false, gapMs: 0 },
  deceleration: { category: 'elevator', loop: false, essential: false, gapMs: 300 },
  arrivalStop: { category: 'elevator', loop: false, essential: false, gapMs: 300 },
  arrivalChime: { category: 'elevator', loop: false, essential: true, gapMs: 600 },
  ambientMachinery: { category: 'ambient', loop: true, essential: false, gapMs: 0 },
  overloadTone: { category: 'elevator', loop: false, essential: true, gapMs: 800 },
  powerRestore: { category: 'music', loop: false, essential: false, gapMs: 2000 },
  completion: { category: 'music', loop: false, essential: true, gapMs: 2000 },
  landingReaction: { category: 'elevator', loop: false, essential: false, gapMs: 150 },
  toolboxOpen: thing,
  toolboxClose: thing,
  fanStart: thing,
  gearTurn: thing,
  springBoing: thing,
  windmillTurn: thing,
  radioStatic: thing,
  craneLower: thing,
  coreHum: thing,
  drawerSlide: thing,
  bookOpen: thing,
  telescopeTurn: thing,
  golfPutt: { category: 'elevator', loop: false, essential: false, gapMs: 1500 },
  answerRight: { category: 'interface', loop: false, essential: true, gapMs: 800 },
  answerWrong: { category: 'interface', loop: false, essential: false, gapMs: 800 },
  discovery: { category: 'music', loop: false, essential: false, gapMs: 1200 },
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
  /** Manifest pack whose rights status decides where this profile may play (see packs.ts). */
  pack: string;
  slots: Record<SoundSlot, SlotAsset | null>;
}

// Placeholder for every landing thing until the pack is approved: the same soft confirmation
// the landings used before M8.1, so the native production build sounds as it did.
const placeholderThing: SlotAsset = { asset: 'button-confirm', gain: 0.35 };

/** Prototype "modern office" profile. Every asset is a synthesized placeholder (see manifest). */
export const PROTOTYPE_MODERN: ElevatorSoundProfile = {
  id: 'prototype-modern',
  label: 'Modern traction elevator (synthesized prototype)',
  pack: 'prototype',
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
    landingReaction: placeholderThing,
    toolboxOpen: placeholderThing,
    toolboxClose: placeholderThing,
    fanStart: placeholderThing,
    gearTurn: placeholderThing,
    springBoing: placeholderThing,
    windmillTurn: placeholderThing,
    radioStatic: placeholderThing,
    craneLower: placeholderThing,
    coreHum: placeholderThing,
    drawerSlide: placeholderThing,
    bookOpen: placeholderThing,
    telescopeTurn: placeholderThing,
    golfPutt: placeholderThing,
    // No placeholder: answers and discoveries stayed silent before M8.1 and stay so here.
    answerRight: null,
    answerWrong: null,
    discovery: null,
  },
};

/**
 * The generated pack (M8.1): one coherent set made with ElevenLabs Sound Effects v2, trimmed and
 * loudness-normalized (see the manifest for prompts and processing). Its rights are PENDING until
 * the account's plan is confirmed, so only the browser playtest build plays it (activeSet.web.ts).
 * Deceleration is silent on purpose: the travel loop fades out over the slow-down instead.
 */
export const ELEVENLABS_V1: ElevatorSoundProfile = {
  id: 'elevenlabs-v1',
  label: 'Warm mechanical elevator (generated pack v1)',
  pack: 'elevenlabs-v1',
  slots: {
    floorButtonPress: { asset: 'el1-button-press', gain: 0.8 },
    floorButtonActivate: { asset: 'el1-button-light', gain: 0.45 },
    doorButtonPress: { asset: 'el1-button-press', gain: 0.7 },
    doorMotor: { asset: 'el1-door-slide', gain: 0.7 },
    doorClosed: { asset: 'el1-door-meet', gain: 0.75 },
    doorOpened: { asset: 'el1-door-stop', gain: 0.6 },
    motorStart: { asset: 'el1-brake-release', gain: 0.55 },
    travelLoop: { asset: 'el1-car-travel', gain: 0.7 },
    deceleration: null,
    arrivalStop: { asset: 'el1-brake-set', gain: 0.65 },
    arrivalChime: { asset: 'el1-chime', gain: 0.75 },
    ambientMachinery: { asset: 'el1-machine-room', gain: 0.6 },
    overloadTone: { asset: 'el1-answer-wrong', gain: 0.6 },
    powerRestore: { asset: 'el1-power-up', gain: 0.7 },
    completion: { asset: 'el1-mission-complete', gain: 0.75 },
    landingReaction: { asset: 'el1-gear-turn', gain: 0.45 },
    toolboxOpen: { asset: 'el1-toolbox-open', gain: 0.65 },
    toolboxClose: { asset: 'el1-toolbox-close', gain: 0.65 },
    fanStart: { asset: 'el1-fan-start', gain: 0.6 },
    gearTurn: { asset: 'el1-gear-turn', gain: 0.65 },
    springBoing: { asset: 'el1-spring-boing', gain: 0.6 },
    windmillTurn: { asset: 'el1-windmill-turn', gain: 0.6 },
    radioStatic: { asset: 'el1-radio-static', gain: 0.5 },
    craneLower: { asset: 'el1-crane-lower', gain: 0.6 },
    coreHum: { asset: 'el1-core-hum', gain: 0.6 },
    drawerSlide: { asset: 'el1-drawer-slide', gain: 0.65 },
    bookOpen: { asset: 'el1-book-open', gain: 0.65 },
    telescopeTurn: { asset: 'el1-telescope-turn', gain: 0.65 },
    golfPutt: { asset: 'el1-golf-putt', gain: 1 }, // a sparse sound: its peaks already reach the -3 dBTP ceiling
    answerRight: { asset: 'el1-answer-right', gain: 0.6 },
    answerWrong: { asset: 'el1-answer-wrong', gain: 0.55 },
    discovery: { asset: 'el1-discovery', gain: 0.6 },
  },
};

export const SOUND_PROFILES: readonly ElevatorSoundProfile[] = [PROTOTYPE_MODERN, ELEVENLABS_V1];
