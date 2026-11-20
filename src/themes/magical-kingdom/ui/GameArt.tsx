// The pieces of Ice Bowling and Garden Golf, drawn in code like the icons (MagicArt): a pin and a flag big
// enough to carry a letter, and the two balls. Lines and quadratic curves only (no SVG arcs).
import { Canvas, Circle, Group, Oval, Path } from './Vector';
import { magic as P } from './palette';

const PIN = 'M30 3 Q17 3 17 17 Q17 25 22 32 Q24 38 18 48 Q8 64 12 82 Q14 94 20 97 L40 97 Q46 94 48 82 Q52 64 42 48 Q36 38 38 32 Q43 25 43 17 Q43 3 30 3 Z';
/** Width of a pin or flag drawing for a given height, and where its letter's centre sits (fractions of width, height). */
export const PIN_SHAPE = { aspect: 0.6, letterX: 0.5, letterY: 0.68 };
export const FLAG_SHAPE = { aspect: 0.8, letterX: 0.54, letterY: 0.29 };

/** A bowling pin, 60 by 100 units. `dull`: tried, and so greyed. */
export function PinArt({ height, dull = false }: { height: number; dull?: boolean }) {
  return <Canvas style={{ width: height * PIN_SHAPE.aspect, height }} pointerEvents="none"><Group transform={[{ scale: height / 100 }]}>
    <Path path={PIN} color={dull ? P.stone : P.white} />
    <Path path="M22 32 Q30 35 38 32 M20.5 40 Q30 43 39.5 40" color={dull ? P.stoneEdge : P.berry} style="stroke" strokeWidth={4} strokeCap="round" />
    <Path path={PIN} color={P.stoneEdge} style="stroke" strokeWidth={2.5} />
  </Group></Canvas>;
}

/** A golf flag standing in its hole, 80 by 100 units: the letter goes on the pennant. */
export function FlagArt({ height, dull = false }: { height: number; dull?: boolean }) {
  return <Canvas style={{ width: height * FLAG_SHAPE.aspect, height }} pointerEvents="none"><Group transform={[{ scale: height / 100 }]}>
    <Oval x={0} y={85} width={30} height={11} color={P.ink} />
    <Path path="M14 91 L14 5" color={P.bark} style="stroke" strokeWidth={4} strokeCap="round" />
    <Path path="M15 7 L72 11 Q77 29 72 47 L15 51 Z" color={dull ? P.stone : P.paper} />
    <Path path="M15 7 L72 11 Q77 29 72 47 L15 51 Z" color={dull ? P.stoneEdge : P.berry} style="stroke" strokeWidth={3.5} />
  </Group></Canvas>;
}

/** The ball: a bowling ball with its three holes, or a golf ball. */
export function BallArt({ size, golf }: { size: number; golf: boolean }) {
  return <Canvas style={{ width: size, height: size }} pointerEvents="none"><Group transform={[{ scale: size / 64 }]}>
    {golf ? <>
      <Circle cx={32} cy={32} r={29} color={P.white} />
      <Circle cx={32} cy={32} r={29} color={P.stoneEdge} style="stroke" strokeWidth={3} />
      <Circle cx={24} cy={24} r={3} color={P.stone} /><Circle cx={36} cy={20} r={3} color={P.stone} /><Circle cx={44} cy={30} r={3} color={P.stone} /><Circle cx={30} cy={34} r={3} color={P.stone} /><Circle cx={40} cy={42} r={3} color={P.stone} /><Circle cx={22} cy={40} r={3} color={P.stone} />
    </> : <>
      <Circle cx={32} cy={32} r={30} color={P.deep} />
      <Path path="M12 26 Q16 12 30 9" color={P.lavender} style="stroke" strokeWidth={4} strokeCap="round" />
      <Circle cx={28} cy={24} r={4.5} color={P.ice} /><Circle cx={42} cy={22} r={4.5} color={P.ice} /><Circle cx={38} cy={36} r={4.5} color={P.ice} />
    </>}
  </Group></Canvas>;
}
