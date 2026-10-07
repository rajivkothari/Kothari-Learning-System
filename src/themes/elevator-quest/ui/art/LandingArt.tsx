// A landing drawn from production art: background, midground, moving pieces, foreground and light,
// cover-fitted into the doorway plus its overscan (art/fit.ts). Until the background image has
// loaded, or if it never does, the vector landing draws instead, so a floor is never half art.
//
// Motion stays cheap and restrained: layers settle sideways by depth as the doors open (parallax,
// off under Reduced Motion or in the developer settings), and each moving piece plays one reaction,
// with the landing's touch reaction or with the doors opening. No loops, no physics, no shaders.
// Mission objects, the floor number and the place sign draw above the art, in door units.
import { Group, Image, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Easing, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { canvasToScreen, landingPlacement, parallaxOffset, type Rect } from '../../art/fit';
import { DEFAULT_DEPTH, type ArtEntry, type LandingLayerName } from '../../art/manifest';
import type { Landing } from '../../content/landings';
import { REACTION_MS, heroPose } from '../landingArt';
import { ObjectLayer, type LandingObject } from '../LandingLayer';
import { useArt } from './ArtContext';
import { useArtImage } from './ArtSlot';

const FULL = { x: 0, y: 0, w: 1, h: 1 };

export function LandingArt({
  layers,
  landing,
  door,
  doorOpen,
  reaction,
  reducedMotion,
  objects,
  fallback,
  onReady,
}: {
  layers: readonly ArtEntry[];
  landing: Landing;
  door: Rect;
  /** The doors' open fraction (0 shut, 1 open), on the UI thread. */
  doorOpen: SharedValue<number>;
  reaction: number;
  reducedMotion: boolean;
  objects: readonly LandingObject[];
  fallback: ReactNode;
  /** Whether the art is showing (the background has loaded), so touch areas follow what is drawn. */
  onReady?: (ready: boolean) => void;
}) {
  const { parallax } = useArt();
  const background = layers.find((l) => l.layer === 'background' && l.state === 'any') ?? null;
  const bgImage = useArtImage(background);
  const ready = bgImage !== null;
  useEffect(() => onReady?.(ready), [onReady, ready]);
  const placement = useMemo(() => landingPlacement(door, background ? { width: background.width, height: background.height } : undefined), [door, background]);
  const still = reducedMotion || !parallax;

  // Touch reaction progress (1 is rest), as the vector landing does it.
  const progress = useSharedValue(1);
  useEffect(() => progress.set(1), [progress, landing]);
  useEffect(() => {
    if (reaction === 0) return;
    progress.set(0);
    progress.set(withTiming(1, { duration: REACTION_MS[reducedMotion ? 'reduced' : 'normal'], easing: Easing.linear }));
  }, [progress, reaction, reducedMotion]);

  if (!ready || !background) return <>{fallback}</>;
  return (
    <Group>
      <Piece entry={background} image={bgImage} rect={canvasToScreen(placement, FULL)} doorW={door.w} doorOpen={doorOpen} still={still} progress={progress} reduced={reducedMotion} />
      {layers
        .filter((l) => l !== background)
        .map((l) => (
          <LoadedPiece key={l.id} entry={l} rect={canvasToScreen(placement, l.rect ?? FULL)} doorW={door.w} doorOpen={doorOpen} still={still} progress={progress} reduced={reducedMotion} />
        ))}
      {objects.map((o) => (
        <ObjectLayer key={o.id} object={o} door={door} reduced={reducedMotion} />
      ))}
    </Group>
  );
}

interface PieceProps {
  entry: ArtEntry;
  rect: Rect;
  doorW: number;
  doorOpen: SharedValue<number>;
  still: boolean;
  progress: SharedValue<number>;
  reduced: boolean;
}

/** A layer that loads its own image (and simply is not drawn until it has). */
function LoadedPiece(props: PieceProps) {
  const image = useArtImage(props.entry);
  return image ? <Piece {...props} image={image} /> : null;
}

function Piece({ entry, image, rect, doorW, doorOpen, still, progress, reduced }: PieceProps & { image: SkImage }) {
  const depth = entry.depth ?? DEFAULT_DEPTH[entry.layer as LandingLayerName] ?? 0;
  const motion = entry.motion ?? null;
  const kind = motion?.kind ?? 'tilt';
  const amount = motion?.amount ?? 0;
  const byDoors = motion?.trigger === 'arrival';
  const origin = useMemo(() => (motion ? { x: rect.x + motion.pivot.x * rect.w, y: rect.y + motion.pivot.y * rect.h } : { x: rect.x, y: rect.y }), [motion, rect]);
  const transform = useDerivedValue(() => {
    const dx = parallaxOffset(depth, doorOpen.get(), doorW, still);
    if (!motion) return [{ translateX: dx }];
    // An arrival piece plays its one reaction while the doors open; a touch piece with the landing's reaction.
    const pose = heroPose({ motion: kind, amount, base: 1 }, byDoors ? doorOpen.get() : progress.get(), reduced);
    return [{ translateX: dx + pose.dx * doorW }, { translateX: origin.x }, { translateY: origin.y }, { rotate: pose.rotate }, { translateX: -origin.x }, { translateY: -origin.y }];
  });
  return (
    <Group transform={transform}>
      <Image image={image} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fit="cover" />
    </Group>
  );
}
