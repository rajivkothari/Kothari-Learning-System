// Substituted for QuestArtLaunch in production bundles built without EXPO_PUBLIC_DEV_TOOLS=1
// (see metro.config.js): production always draws production art.
import type { ReactNode } from 'react';

export function QuestArtLaunch({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
