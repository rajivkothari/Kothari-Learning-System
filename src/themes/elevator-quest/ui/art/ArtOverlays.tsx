// Development overlays over the cabin, for lining art up: the doorway, the landing image's bounds
// and its safe core, the zones art keeps calm for the native overlays (floor number, sign, mission
// object slot), and every touch area. Outlines only, drawn last, never touchable. The developer
// tools turn them on; production never does.
import { DashPathEffect, Group, Rect } from '@shopify/react-native-skia';

import { canvasToScreen, type Rect as R } from '../../art/fit';
import type { NormBox } from '../../art/manifest';
import { eq } from '../palette';
import type { ArtOverlays } from './ArtContext';

interface Props {
  overlays: ArtOverlays;
  door: R;
  /** Where the landing canvas is (or would be) drawn. */
  placement: R;
  /** Landing art is showing (else the canvas bounds are where art would go). */
  artShown: boolean;
  /** The doorway shape is inside the art's supported range. */
  fits: boolean;
  /** Door-unit zones kept calm for native overlays. */
  zones: readonly NormBox[];
  /** Touch areas in cabin coordinates. */
  hits: readonly { x: number; y: number; width: number; height: number }[];
  safe: NormBox;
}

export function ArtOverlayLayer({ overlays, door, placement, artShown, fits, zones, hits, safe }: Props) {
  const core = canvasToScreen(placement, safe);
  return (
    <Group>
      {overlays.doorway ? (
        <Group>
          <Outline r={door} color={fits ? eq.cyan : eq.amber} width={2} />
          <Outline r={placement} color={eq.cyan} width={1} dashed={!artShown} />
          <Outline r={core} color={eq.ok} width={2} dashed />
        </Group>
      ) : null}
      {overlays.safe
        ? zones.map((z, i) => <Outline key={i} r={{ x: door.x + z.x * door.w, y: door.y + z.y * door.h, w: z.w * door.w, h: z.h * door.h }} color={eq.amber} width={1.5} dashed />)
        : null}
      {overlays.hitboxes ? hits.map((b, i) => <Outline key={i} r={{ x: b.x, y: b.y, w: b.width, h: b.height }} color={eq.coolWhite} width={2} />) : null}
    </Group>
  );
}

function Outline({ r, color, width, dashed = false }: { r: R; color: string; width: number; dashed?: boolean }) {
  return (
    <Rect x={r.x} y={r.y} width={r.w} height={r.h} color={color} style="stroke" strokeWidth={width}>
      {dashed ? <DashPathEffect intervals={[6, 4]} /> : null}
    </Rect>
  );
}
