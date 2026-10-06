// How a floor button looks in each state. Pure: tested without rendering.
//
// Hardware, not app chips: a steel bezel, a recessed face, an engraved number, and a lamp
// ring behind the face. States, in priority order:
//   disabled  - dim face, muted number, no lamp
//   selected  - the call is registered: warm lamp ring and lit face (stays lit until serviced)
//   current   - the car is stopped here: a small cool-white position lamp above the number and a
//               brighter rim. Never the amber of "selected", so the two cannot be confused.
//   clue      - a cyan ring OUTSIDE the bezel. Points at a given, never fills the button.
//   idle      - dark face, white number.
// "Serviced" is a transition, not a state: when a lit call is answered the lamp fades out over
// the light ramp instead of snapping off (motion tokens; shorter under reduced motion).
import { celBands, type Hex, type ThemeTokens } from '../../../presentation/design/tokens';

export interface ButtonFlags {
  lit: boolean;
  current: boolean;
  clue: boolean;
  disabled: boolean;
}

export interface ButtonLook {
  state: 'disabled' | 'selected' | 'current' | 'idle';
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
    positionLamp: false,
    opacity: 1,
  };
  if (f.disabled) {
    return { ...base, state: 'disabled', face: t.state.idle.face, faceShade: celBands(t.state.idle.face, t).shadow, label: t.state.disabled.label, lamp: 0, clueRing: null, opacity: t.state.disabled.opacity };
  }
  if (f.lit) {
    return { ...base, state: 'selected', face: t.state.selected.face, faceShade: celBands(t.state.selected.face, t).shadow, label: t.state.selected.label, lamp: t.state.selected.glow, positionLamp: f.current };
  }
  if (f.current) {
    return { ...base, state: 'current', face: t.state.idle.face, faceShade: celBands(t.state.idle.face, t).shadow, rim: t.state.current.rim, label: t.state.idle.label, lamp: 0, positionLamp: true };
  }
  return { ...base, state: 'idle', face: t.state.idle.face, faceShade: celBands(t.state.idle.face, t).shadow, label: t.state.idle.label, lamp: 0 };
}
