// Which scene style the game draws (Concept D or the M5 cel scene) while the concept is under
// review. Normally the build default. The developer tools (browser only) supply an override so
// before/after captures come from one build. Removed with the cel scene after acceptance.
import { createContext, useContext, type ReactNode } from 'react';

import { DEFAULT_ART_STYLE, type ArtStyle } from '../config/flags';

const ArtStyleContext = createContext<ArtStyle | null>(null);

export function ArtStyleProvider({ style, children }: { style: ArtStyle; children: ReactNode }) {
  return <ArtStyleContext.Provider value={style}>{children}</ArtStyleContext.Provider>;
}

export function useArtStyle(): ArtStyle {
  return useContext(ArtStyleContext) ?? DEFAULT_ART_STYLE;
}
