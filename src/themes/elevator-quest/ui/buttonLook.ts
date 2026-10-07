// How a floor button looks in each state. Pure: tested without rendering.
//
// Hardware, not app chips: a steel bezel, a recessed face, an engraved number, and a lamp
// ring behind the face. States, in priority order:
//   disabled  - dim face, muted number, no lamp
//   selected  - the call is registered: warm lamp ring and lit face (stays lit until serviced)
//   current   - the car is stopped here: a small cool-white position lamp above the number and a
//               brighter rim. Never the amber of "selected", so the two cannot be confused.
//   call      - a hall call waits here: a dashed cool-white ring outside the bezel, a CALL tab,
//               and a slow breath (0.5 Hz; still under reduced motion). Shape, word and motion,
//               never color alone. Not an answer: the button is the only one that can light.
//   clue      - a cyan ring OUTSIDE the bezel. Points at a given, never fills the button.
//   idle      - dark face, white number.
// A small service dot marks a floor whose landing has been inspected (exploration). Quiet on purpose:
// the panel stays a believable panel.
// "Serviced" is a transition, not a state: when a lit call is answered the lamp fades out over
// the light ramp instead of snapping off (motion tokens; shorter under reduced motion).
import { celBands, type Hex, type ThemeTokens } from '../../../presentation/design/tokens';

export interface ButtonFlags {
  lit: boolean;
  current: boolean;
  clue: boolean;
  disabled: boolean;
  /** A hall call waits on this floor. */
  call?: boolean;
  /** This floor's landing has been inspected. */
  serviced?: boolean;
}

export interface ButtonLook {
  state: 'disabled' | 'selected' | 'call' | 'current' | 'idle';
  face: Hex;
  faceShade: Hex;
  bezel: Hex;
  bezelLight: Hex;
  rim: Hex;
  label: Hex;
  /** Lamp ring behind the face: 0 off .. 1 fully lit. */
  lamp: number;
  lampColor: Hex;
  positionLamp: boolean;
  clueRing: Hex | null;
  /** Hall call: dashed ring color (with the CALL tab and the slow breath). */
  callRing: Hex | null;
  serviceDot: Hex | null;
  opacity: number;
}

export function buttonLook(f: ButtonFlags, t: ThemeTokens): ButtonLook {
  const metal = celBands(t.palette.metal, t);
  const base = {
    bezel: metal.base,
    bezelLight: metal.light,
    rim: metal.edge,
    lampColor: t.state.selected.ring,
    clueRing: f.clue && !f.disabled ? t.state.clue.ring : null,
    callRing: null,
    serviceDot: f.serviced ? t.state.service.dot : null,
    positionLamp: false,
    opacity: 1,
  };
  if (f.disabled) {
    return { ...base, state: 'disabled', face: t.state.idle.face, faceShade: celBands(t.state.idle.face, t).shadow, label: t.state.disabled.label, lamp: 0, clueRing: null, opacity: t.state.disabled.opacity };
  }
  if (f.lit) {
    return { ...base, state: 'selected', face: t.state.selected.face, faceShade: celBands(t.state.selected.face, t).shadow, label: t.state.selected.label, lamp: t.state.selected.glow, positionLamp: f.current };
  }
  if (f.call) {
    return { ...base, state: 'call', face: t.state.idle.face, faceShade: celBands(t.state.idle.face, t).shadow, label: t.state.idle.label, lamp: 0, callRing: t.state.call.ring };
  }
  if (f.current) {
    return { ...base, state: 'current', face: t.state.idle.face, faceShade: celBands(t.state.idle.face, t).shadow, rim: t.state.current.rim, label: t.state.idle.label, lamp: 0, positionLamp: true };
  }
  return { ...base, state: 'idle', face: t.state.idle.face, faceShade: celBands(t.state.idle.face, t).shadow, label: t.state.idle.label, lamp: 0 };
}

/**
 * The hall-call ring's opacity at time `ms`: a slow breath at the token rate (0.5 Hz), never below
 * 0.55, so it reads as waiting, not flashing. Reduced motion: still, fully on.
 */
export function callBreath(ms: number, pulseHz: number, reduced: boolean): number {
  'worklet';
  if (reduced) return 1;
  return 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(2 * Math.PI * pulseHz * (ms / 1000)));
}

/** How long the panel power sweep lasts when Floor 15 comes back. */
export const SWEEP_MS = { normal: 1600, reduced: 900 };

/**
 * Panel power sweep: lamp brightness (0..0.8) for a button at height `pos` (0 bottom row, 1 top)
 * at sweep progress `t` (0..1). Each lamp turns on once, bottom to top, then all fade together:
 * one on and one off per lamp, so nothing flashes. Reduced motion: every lamp on at once, then off.
 */
export function sweepLamp(t: number, pos: number, reduced: boolean): number {
  'worklet';
  if (t <= 0 || t >= 1) return 0;
  const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
  if (reduced) return 0.6 * fade;
  const on = Math.min(1, Math.max(0, (t - pos * 0.5) / 0.15));
  return 0.8 * on * fade;
}
