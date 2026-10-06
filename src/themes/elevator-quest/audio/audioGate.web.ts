// Browser autoplay rules: audio may not start before the first user gesture on the page.
// The gate opens on the first pointer, touch, or key event. Until then the audio engine drops
// one-shot sounds and remembers which loops should be running, then starts them when it opens.
import type { AudioGate } from './audioGate';

let open = false;
const listeners = new Set<() => void>();
const EVENTS = ['pointerdown', 'touchend', 'keydown'] as const;

function openGate() {
  if (open) return;
  open = true;
  for (const e of EVENTS) globalThis.removeEventListener?.(e, openGate, true);
  for (const l of [...listeners]) l();
  listeners.clear();
}
for (const e of EVENTS) globalThis.addEventListener?.(e, openGate, true);

export function createAudioGate(): AudioGate {
  return {
    isOpen: () => open,
    onOpen: (l) => {
      if (open) {
        l();
        return () => undefined;
      }
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
