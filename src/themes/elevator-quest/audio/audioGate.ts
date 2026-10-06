// Platform adapter: when sound may start. Native apps may play at once.
// The browser build resolves audioGate.web.ts (autoplay rules need a user gesture first).
export interface AudioGate {
  isOpen(): boolean;
  /** Called once when sound becomes allowed (immediately if it already is). */
  onOpen(listener: () => void): () => void;
}

export function createAudioGate(): AudioGate {
  return { isOpen: () => true, onOpen: (l) => (l(), () => undefined) };
}
