// Elevator Quest colors, from the shared design system (Engineer World tokens). Components keep
// the short `eq.*` names; every value resolves to a token role, so a palette change happens in
// one place: src/presentation/design/tokens.ts.
import { Platform, type TextStyle } from 'react-native';

import { ENGINEER_WORLD as T, celBands, type TypeRole } from '../../../presentation/design/tokens';
import { LINE_HEIGHT, lineHeightFor } from './textRoles';

const metal = celBands(T.palette.metal, T);
const paint = celBands(T.palette.paint, T);

export const TOKENS = T;

export const eq = {
  night: T.palette.void,
  charcoal: T.palette.surface[1],
  charcoalLight: T.palette.surface[2],
  surfaceHigh: T.palette.surface[3],
  recess: T.palette.surface[0],
  steelDark: metal.shadow,
  steel: metal.base,
  steelLight: metal.light,
  steelEdge: metal.edge,
  brushedA: metal.base,
  brushedB: metal.shadow,
  glass: T.palette.light,
  deepBlue: paint.shadow,
  deepBlueLight: paint.base,
  navyLight: paint.light,
  amber: T.palette.accentPrimary,
  amberSoft: T.state.selected.label,
  amberDim: T.state.selected.face,
  cyan: T.palette.accentSecondary,
  coolWhite: T.palette.light,
  text: T.palette.ink,
  textDim: T.palette.inkMuted,
  ok: T.palette.success,
  /** Genuine warnings only (overload). Never for a wrong answer. */
  warning: T.palette.warning,
  /** Lifty's concern and wrong-floor feedback: warm amber, never red. */
  caution: T.palette.accentPrimary,
  clue: T.state.clue.ring,
} as const;

export const FONT_MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** A type role as a React Native text style. Story World swaps `display` only. */
export function typeStyle(role: TypeRole, scale = 1): TextStyle {
  return {
    fontFamily: Platform.select({ ios: role.family.ios, android: role.family.android, default: role.family.web }),
    fontWeight: role.weight,
    fontSize: Math.round(role.size * scale),
    lineHeight: Math.round(role.lineHeight * scale),
    letterSpacing: role.letterSpacing,
    textTransform: role.uppercase ? 'uppercase' : 'none',
  };
}

export const DISPLAY = (scale = 1) => typeStyle(T.type.display, scale);
export const UI = (scale = 1) => typeStyle(T.type.ui, scale);
export const READING = (scale = 1) => typeStyle(T.type.reading, scale);

// ---- Reading sizes (M8.1) ----
// The sizes themselves are roles in ui/textRoles.ts, chosen per window by the layout (GameLayout.text).
// These turn a role's size into a style; components never set a reading size as a literal.
export { TEXT_FLOOR, lineHeightFor, type TextSizes } from './textRoles';

/** Words in the reading face at `size` (the question, a passage, Lifty's words, a card). */
export const readingAt = (size: number, role: keyof typeof LINE_HEIGHT = 'passage'): TextStyle => ({ ...READING(), fontSize: size, lineHeight: lineHeightFor(size, role) });
/** A label in the UI face (uppercase, spaced) at `size`. */
export const labelAt = (size: number): TextStyle => ({ ...UI(), fontSize: size, lineHeight: lineHeightFor(size, 'label') });

/**
 * Marked words (a reading job's emphasis, a math job's numbers and directions): heavier, a warm light
 * accent and an underline, so the mark never rests on colour alone.
 */
export const MARKED: TextStyle = { fontWeight: '900', color: T.state.selected.label, textDecorationLine: 'underline', textDecorationColor: T.palette.accentPrimary };
/** Numbers and direction words in Lifty's job line: heavier and the warm light accent (weight is the non-colour cue). */
export const GIVEN: TextStyle = { fontWeight: '900', color: T.state.selected.label };
