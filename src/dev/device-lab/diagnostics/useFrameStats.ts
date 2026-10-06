// Lightweight frame monitoring for physical-device runs.
// UI thread: Reanimated frame callback intervals (what animations experience).
// JS thread: requestAnimationFrame intervals (what React and game logic experience).
// Both are approximations. They do not see GPU completion or display latency.
import { useEffect } from 'react';
import { runOnJS, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { labStore, pressSignal } from '../labStore';
import { pushSample, summarizeFrameIntervals } from './frameStats';

const REPORT_EVERY_MS = 1000;

function reportUi(intervals: number[]): void {
  labStore.set({ uiFrames: summarizeFrameIntervals(intervals) });
}

function reportPressLatency(ms: number): void {
  labStore.set((s) => ({ pressToFrameMs: pushSample(s.pressToFrameMs, ms) }));
}

export function useFrameStats(enabled: boolean): void {
  const intervals = useSharedValue<number[]>([]);
  const elapsed = useSharedValue(0);

  const callback = useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt !== null && dt > 0) {
      intervals.modify((arr) => {
        'worklet';
        arr.push(dt);
        return arr;
      });
      elapsed.set(elapsed.get() + dt);
    }
    if (pressSignal.get() > 0) {
      // Frame timestamps and _getAnimationTimestamp share the animation clock.
      // A frame whose vsync started just before the event can give a small negative
      // number: the update still landed in that frame, so clamp to 0.
      const latency = Math.max(0, info.timestamp - pressSignal.get());
      pressSignal.set(0);
      if (latency < 1000) runOnJS(reportPressLatency)(latency);
    }
    if (elapsed.get() >= REPORT_EVERY_MS) {
      const batch = intervals.get().slice();
      intervals.set([]);
      elapsed.set(0);
      runOnJS(reportUi)(batch);
    }
  }, enabled);

  useEffect(() => {
    callback.setActive(enabled);
  }, [callback, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = 0;
    let acc: number[] = [];
    let sum = 0;
    const loop = (t: number) => {
      if (last > 0) {
        const dt = t - last;
        acc.push(dt);
        sum += dt;
        if (sum >= REPORT_EVERY_MS) {
          labStore.set({ jsFrames: summarizeFrameIntervals(acc) });
          acc = [];
          sum = 0;
        }
      }
      last = t;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
}
