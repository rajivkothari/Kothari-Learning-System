// Skia paths from SVG path data: arcs and curves the same way on every platform (and in the test
// stand-in, which only knows simple paths). An unreadable path is an empty one, never a crash.
import { Skia, type SkPath } from '@shopify/react-native-skia';

export const svgPath = (d: string): SkPath => Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();
