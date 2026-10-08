// Word Golf's colours, all from the design tokens (Engineer World): the rooftop at dusk, a mown green,
// wooden rails, steel posts, the safety-orange flag. Pure. Red is never used, not even for a miss.
import { ENGINEER_WORLD as T, celBands } from '../../../../presentation/design/tokens';

const S: Record<string, string> = T.places.swatches;
/** A named swatch (they are all defined in the tokens; tested by the design tests). */
const sw = (name: string) => S[name] ?? T.palette.metal;

export const GOLF = {
  green: celBands(sw('leaf'), T),
  fringe: celBands(sw('moss'), T),
  rail: celBands(sw('tan'), T),
  post: celBands(T.palette.metal, T),
  postCap: T.objects.hiVis,
  cup: T.palette.void,
  cupRim: sw('fog'),
  ball: T.palette.light,
  ballEdge: celBands(T.palette.metal, T).edge,
  shadow: T.palette.void,
  tee: sw('bone'),
  pole: sw('chalk'),
  flag: T.objects.body,
  flagShade: T.objects.bodyShade,
  flagMark: T.objects.mark,
  aim: T.palette.light,
  ring: T.palette.light,
  sky: { top: sw('midnight'), mid: sw('skyBlue'), low: sw('sky'), glow: T.places.light.warm ?? T.palette.light },
  skyline: { far: sw('charcoalBlue'), near: sw('navy'), window: T.places.light.warm ?? T.palette.light },
  roof: celBands(sw('concrete'), T),
  railing: celBands(T.palette.metal, T),
} as const;

export const INK = {
  text: T.palette.ink,
  dim: T.palette.inkMuted,
  card: T.palette.surface[2],
  cardEdge: T.palette.surface[3],
  plate: T.palette.surface[1],
  night: T.palette.void,
  accent: T.palette.accentPrimary,
  accentLabel: T.state.selected.label,
  clue: T.state.clue.ring,
  slot: T.palette.surface[0],
  tile: celBands(T.palette.paint, T),
  amber: celBands(T.palette.accentPrimary, T),
  steel: celBands(T.palette.metal, T),
} as const;
