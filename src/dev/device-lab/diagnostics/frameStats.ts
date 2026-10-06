// Pure frame-time statistics. Fed by a UI-thread frame callback and by a JS-thread
// requestAnimationFrame loop. These are approximations of rendering health, not a
// profiler: they cannot see GPU work that finishes after the frame callback, and they
// do not include display latency. Use platform tools (gfxinfo, Instruments) for truth.

export interface FrameWindow {
  /** Frames observed in the window. */
  frames: number;
  /** Average frames per second over the window. */
  fps: number;
  /** Average frame interval in ms. */
  avgMs: number;
  /** 95th percentile frame interval in ms. */
  p95Ms: number;
  /** Worst frame interval in ms. */
  maxMs: number;
  /** Frames longer than the slow-frame threshold (default 2x a 60 Hz frame). */
  slowFrames: number;
}

export const SLOW_FRAME_MS = 33.4;

export function summarizeFrameIntervals(intervalsMs: readonly number[], slowMs = SLOW_FRAME_MS): FrameWindow {
  const valid = intervalsMs.filter((d) => Number.isFinite(d) && d > 0);
  if (valid.length === 0) {
    return { frames: 0, fps: 0, avgMs: 0, p95Ms: 0, maxMs: 0, slowFrames: 0 };
  }
  const total = valid.reduce((a, b) => a + b, 0);
  const sorted = [...valid].sort((a, b) => a - b);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    frames: valid.length,
    fps: (valid.length * 1000) / total,
    avgMs: total / valid.length,
    p95Ms: sorted[p95Index] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
    slowFrames: valid.filter((d) => d > slowMs).length,
  };
}

/** Rolling taps-per-second over the last `windowMs`, from tap timestamps in ms. */
export function tapsPerSecond(timestamps: readonly number[], now: number, windowMs = 1000): number {
  const recent = timestamps.filter((t) => now - t <= windowMs && t <= now);
  return (recent.length * 1000) / windowMs;
}

/** Simple running summary of latency samples (ms). Keeps the last `limit` samples. */
export function pushSample(samples: readonly number[], value: number, limit = 50): number[] {
  if (!Number.isFinite(value) || value < 0) return [...samples];
  const next = [...samples, value];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}
