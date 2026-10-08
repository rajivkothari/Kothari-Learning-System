// Cargo Commander's colours: token roles only (src/presentation/design/tokens.ts), in cel bands.
// The warehouse is khaki ribbed metal with bone trim and soot edges; the freight cab is the deep navy
// paint with brass; crates are wood with a cream enamel plate. Yellow is the capacity line's genuine
// warning (overload); nothing here is red, and a wrong load is never coloured as an error.
import { celBands } from '../../../../presentation/design/tokens';
import { TOKENS as T } from '../../ui/palette';

const S = T.places.swatches;
export const wall = celBands(S.khaki!, T);
export const trim = celBands(S.bone!, T);
export const floor = celBands(S.concrete!, T);
export const wood = celBands(S.tan!, T);
export const woodDark = celBands(S.rust!, T);
export const brass = celBands(S.brass!, T);
export const navy = celBands(T.palette.paint, T);
export const steel = celBands(T.palette.metal, T);
export const sackCloth = celBands(S.sand!, T);
export const boxCard = celBands(S.cream!, T);

export const CC = {
  soot: S.soot!,
  ink: T.objects.ink,
  enamel: T.objects.mark,
  text: T.palette.ink,
  textDim: T.palette.inkMuted,
  surface: T.palette.surface[1],
  surfaceHigh: T.palette.surface[3],
  void: T.palette.void,
  /** The scale's needle sweep and its tens: the cool working light. */
  sweep: T.palette.light,
  /** The capacity line and the zone past it: a genuine warning. */
  warning: T.palette.warning,
  /** A right load: steady green rim and a check. */
  ok: T.palette.success,
  /** After a miss: Lifty's warm amber, never red. */
  caution: T.palette.accentPrimary,
  /** The target mark: the equipment hi-vis, not feedback. */
  mark: T.objects.hiVis,
  clue: T.state.clue.ring,
  warmLight: T.places.light.warm!,
} as const;
