// Pure layout math for game surfaces. No React Native, Expo, or Skia imports,
// so any renderer (Skia today, something else later) can reuse it.
//
// Game content is authored in logical stage units, never device pixels.
// The stage is fitted into whatever space the window currently provides.

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type Arrangement = 'row' | 'column';

/** Logical stage used by the Device Lab scene. 16:10, matching Fire tablets. */
export const LAB_STAGE: Size = { width: 1600, height: 1000 };

/**
 * Minimum space in which gameplay is considered usable. Below this the UI shows
 * a "make the window bigger" treatment instead of shrinking targets further.
 * Values are starting guesses for tablet use, to tune on devices.
 */
export const MIN_USABLE: Size = { width: 480, height: 360 };

/** Landscape-ish windows put controls beside the stage, portrait-ish below it. */
export function chooseArrangement(window: Size): Arrangement {
  return window.width >= window.height ? 'row' : 'column';
}

export function availableArea(window: Size, insets: Insets): Size {
  return {
    width: Math.max(0, window.width - insets.left - insets.right),
    height: Math.max(0, window.height - insets.top - insets.bottom),
  };
}

export function isCompact(area: Size, min: Size = MIN_USABLE): boolean {
  return area.width < min.width || area.height < min.height;
}

export interface StageFit {
  /** Multiply logical units by this to get layout points. */
  scale: number;
  /** Where the logical stage sits inside the container, in points. */
  stage: Rect;
}

/**
 * Fit the logical stage inside a container ("contain"), centred. Space outside the
 * stage rect should be filled with environment art, never left as black bars.
 */
export function fitStage(container: Size, stage: Size = LAB_STAGE): StageFit {
  if (container.width <= 0 || container.height <= 0 || stage.width <= 0 || stage.height <= 0) {
    return { scale: 0, stage: { x: 0, y: 0, width: 0, height: 0 } };
  }
  const scale = Math.min(container.width / stage.width, container.height / stage.height);
  const width = stage.width * scale;
  const height = stage.height * scale;
  return {
    scale,
    stage: {
      x: (container.width - width) / 2,
      y: (container.height - height) / 2,
      width,
      height,
    },
  };
}

/** Convert a point in container points to logical stage units. */
export function toStage(fit: StageFit, point: { x: number; y: number }): { x: number; y: number } {
  if (fit.scale === 0) return { x: 0, y: 0 };
  return {
    x: (point.x - fit.stage.x) / fit.scale,
    y: (point.y - fit.stage.y) / fit.scale,
  };
}

/** Convert a point in logical stage units to container points. */
export function fromStage(fit: StageFit, point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: fit.stage.x + point.x * fit.scale,
    y: fit.stage.y + point.y * fit.scale,
  };
}

export function describeOrientation(window: Size): {
  orientation: 'landscape' | 'portrait' | 'square';
  aspect: number;
} {
  const aspect = window.height === 0 ? 0 : window.width / window.height;
  const orientation =
    Math.abs(window.width - window.height) < 1
      ? 'square'
      : window.width > window.height
        ? 'landscape'
        : 'portrait';
  return { orientation, aspect };
}
