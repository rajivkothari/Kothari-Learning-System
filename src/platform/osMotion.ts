// Platform adapter: the OS "reduce motion" switch (iOS Reduce Motion, Android "Remove
// animations"). In the browser react-native-web reads the prefers-reduced-motion media query
// through the same API, so there is no .web variant. Null when it cannot be read in time.
import { AccessibilityInfo } from 'react-native';

export async function osPrefersReducedMotion(timeoutMs = 400): Promise<boolean | null> {
  try {
    return await Promise.race([AccessibilityInfo.isReduceMotionEnabled(), new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))]);
  } catch {
    return null;
  }
}
