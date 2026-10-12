// Tower Rescue game feel (D193): the timings of what the screen plays, as data. Pure, so the beats,
// their sounds and the Reduced Motion versions are tested (feel.test.ts). Presentation only: nothing
// here decides right or wrong, and nothing here is evidence. The flow (flow.ts) stays the authority;
// the screen plays these beats around what the flow already decided.
//
// Feedback hierarchy:
//   micro        every touch: a press-in on touch-down (UI thread), a click
//   gameplay     a system checked, a cell seated, the socket's answer, the meter filling
//   celebration  the test run: relays, motor, the lift, the delivery, the room lighting up (once)

/** A sound at a moment (ms from the start of its sequence). Slots are audio/profile.ts semantic slots. */
export interface SoundBeat {
  at: number;
  slot: string;
  /** Loops: start (true) or stop (false). One-shots leave it out. */
  loop?: boolean;
}

/** Installing a power cell: anticipation (it lifts), travel (it flies to the socket), impact (it seats). */
export const INSTALL = {
  normal: { lift: 70, fly: 210, seat: 100 },
  reduced: { lift: 0, fly: 0, seat: 140 },
} as const;
/** How long the screen holds the old picture after the tap: the answer shows once the cell has seated. */
export const installHoldMs = (reduced: boolean) => {
  const t = reduced ? INSTALL.reduced : INSTALL.normal;
  return t.lift + t.fly + t.seat;
};

/** The socket's answer, from the moment the cell seats. */
export const RESULT = {
  normal: {
    /** Right: the meter fills from present to needed in this long, one gauge tick per step (at most five ticks). */
    fillMs: 440,
    /** Then the power runs down the line to the lift and its lamp comes on. */
    lineMs: 420,
    /** RUN TEST pops in once the meter is full (the power still runs up the line behind it). */
    runTestAt: 620,
    /** Wrong: the meter shows what the cell would make, then the safety switch trips and the cell pops back. */
    missFillMs: 380,
    ejectAt: 520,
    ejectMs: 320,
  },
  reduced: { fillMs: 0, lineMs: 0, runTestAt: 250, missFillMs: 0, ejectAt: 250, ejectMs: 0 },
} as const;

/** At most this many gauge ticks for one fill, whatever the gap (a gap of nine ticks five times). */
export const MAX_TICKS = 5;
/** Ticks never closer than this: the gauge tick's own gap (90 ms, audio/profile.ts) plus a margin, or one would be dropped. */
export const TICK_SPACING_MS = 96;
/** When the fill's ticks sound (ms from the start of the fill): evenly spread, never closer than the slot's gap. */
export function fillTicks(steps: number, fillMs: number): number[] {
  const n = Math.max(0, Math.min(MAX_TICKS, steps, Math.floor(fillMs / TICK_SPACING_MS)));
  if (n === 0 || fillMs <= 0) return [];
  const every = fillMs / n;
  return Array.from({ length: n }, (_, i) => Math.round(every * (i + 1)));
}

/** The sounds of a right install, from the tap. */
export function rightSounds(steps: number, reduced: boolean): SoundBeat[] {
  const hold = installHoldMs(reduced);
  const r = reduced ? RESULT.reduced : RESULT.normal;
  const pick: SoundBeat[] = reduced ? [] : [{ at: 0, slot: 'cratePick' }];
  return [
    ...pick,
    { at: hold, slot: 'cratePlace' },
    { at: hold + 90, slot: 'answerRight' },
    ...fillTicks(steps, r.fillMs).map((t) => ({ at: hold + 160 + t, slot: 'gaugeTick' })),
    { at: hold + 160 + r.fillMs + 60, slot: 'coreHum' },
  ];
}

/** The sounds of a wrong install, from the tap. */
export function wrongSounds(reduced: boolean): SoundBeat[] {
  const hold = installHoldMs(reduced);
  const r = reduced ? RESULT.reduced : RESULT.normal;
  const pick: SoundBeat[] = reduced ? [] : [{ at: 0, slot: 'cratePick' }];
  return [...pick, { at: hold, slot: 'cratePlace' }, { at: hold + 120, slot: 'answerWrong' }, ...(reduced ? [] : [{ at: hold + r.ejectAt, slot: 'tileUndo' }])];
}

/**
 * RUN TEST, the celebration, in steps. The screen moves through them; each step's picture is drawn
 * from its index (relays lit, motor turning, the car rising, at the top, doors open, delivered, the
 * room lit). `end`: when the screen tells the flow the test has played.
 */
export type TestStep = 'press' | 'relay1' | 'relay2' | 'relay3' | 'motor' | 'rise' | 'arrive' | 'doors' | 'deliver' | 'roomLit' | 'end';
export interface TestBeat {
  at: number;
  step: TestStep;
  sounds: SoundBeat[];
}

export const TEST_RUN: Record<'normal' | 'reduced', TestBeat[]> = {
  normal: [
    { at: 0, step: 'press', sounds: [{ at: 0, slot: 'doorButtonPress' }] },
    { at: 140, step: 'relay1', sounds: [{ at: 140, slot: 'gaugeTick' }] },
    { at: 260, step: 'relay2', sounds: [{ at: 260, slot: 'gaugeTick' }] },
    { at: 380, step: 'relay3', sounds: [{ at: 380, slot: 'gaugeTick' }] },
    { at: 520, step: 'motor', sounds: [{ at: 520, slot: 'motorStart' }] },
    { at: 700, step: 'rise', sounds: [{ at: 700, slot: 'travelLoop', loop: true }] },
    { at: 2200, step: 'arrive', sounds: [{ at: 2200, slot: 'travelLoop', loop: false }, { at: 2200, slot: 'arrivalStop' }, { at: 2330, slot: 'arrivalChime' }] },
    { at: 2450, step: 'doors', sounds: [{ at: 2850, slot: 'doorOpened' }] },
    { at: 2900, step: 'deliver', sounds: [{ at: 3050, slot: 'deliveryComplete' }] },
    { at: 3250, step: 'roomLit', sounds: [] },
    { at: 3700, step: 'end', sounds: [] },
  ],
  reduced: [
    { at: 0, step: 'press', sounds: [{ at: 0, slot: 'doorButtonPress' }] },
    { at: 150, step: 'motor', sounds: [{ at: 150, slot: 'motorStart' }] },
    { at: 550, step: 'deliver', sounds: [{ at: 550, slot: 'arrivalChime' }, { at: 800, slot: 'deliveryComplete' }] },
    { at: 900, step: 'roomLit', sounds: [] },
    { at: 1150, step: 'end', sounds: [] },
  ],
};

const ORDER: TestStep[] = ['press', 'relay1', 'relay2', 'relay3', 'motor', 'rise', 'arrive', 'doors', 'deliver', 'roomLit', 'end'];
/** Whether the test run has reached `step` (Reduced Motion skips steps: reaching a later one counts). */
export const reached = (current: TestStep | null, step: TestStep) => current !== null && ORDER.indexOf(current) >= ORDER.indexOf(step);
/** The car's travel in the normal run: from the motor's start to the arrival (ms). */
export const RISE_MS = 2200 - 700;
/** The doors open over this long, from the doors step. */
export const DOORS_MS = 380;

/** Ambient life while the player thinks: slow, low-contrast, never faster than these periods (ms). */
export const AMBIENT = {
  /** The monitor's trace scrolls once per period. */
  monitorMs: 3200,
  /** Status LEDs breathe (opacity only), staggered. */
  ledMs: 2600,
  /** A relay on the wall panel clicks over now and then (a light, no sound while the player reads). */
  relayEveryMs: 6500,
  /** The robot blinks now and then; a slow bob while idle. */
  blinkEveryMs: 4200,
  bobMs: 2400,
  /** A running motor's gear (a revealed running lift, or the repaired one). */
  gearMs: 6000,
  /** A running fan (only once it is known to be running: before that it would tell the answer). */
  fanMs: 1600,
} as const;

/** Every slot this game plays (registry preload; the tests check each is an approved, mapped slot). */
export const TOWER_RESCUE_SOUNDS = ['ambientMachinery', 'floorButtonPress', 'doorButtonPress', 'gaugeTick', 'fanStart', 'gearTurn', 'radioStatic', 'cratePick', 'cratePlace', 'answerRight', 'answerWrong', 'tileUndo', 'coreHum', 'motorStart', 'travelLoop', 'arrivalStop', 'arrivalChime', 'doorOpened', 'deliveryComplete'];
