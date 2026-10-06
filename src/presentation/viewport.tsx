// The window the game lays itself out in. Normally the real window. The developer viewport
// simulator (browser only) supplies a simulated size instead, and the game runs its real
// responsive layout for that size: nothing is scaled down with CSS.
import { createContext, useContext, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

export interface Viewport {
  width: number;
  height: number;
  /** Set only by the simulator, e.g. "Fire HD 8 landscape (simulated)". */
  label?: string;
}

const ViewportContext = createContext<Viewport | null>(null);

export function ViewportProvider({ viewport, children }: { viewport: Viewport; children: ReactNode }) {
  return <ViewportContext.Provider value={viewport}>{children}</ViewportContext.Provider>;
}

export function useViewport(): Viewport {
  const simulated = useContext(ViewportContext);
  const window = useWindowDimensions();
  return simulated ?? { width: window.width, height: window.height };
}
