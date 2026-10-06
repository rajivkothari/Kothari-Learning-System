// Build-time feature flags. EXPO_PUBLIC_* values are inlined by Metro at bundle time.

/**
 * Developer-only Device Lab. On in development builds, and in release builds only
 * when EXPO_PUBLIC_DEVICE_LAB=1 is set at build time (needed for honest
 * performance measurement, since debug builds are much slower).
 */
export const DEVICE_LAB_ENABLED: boolean = __DEV__ || process.env.EXPO_PUBLIC_DEVICE_LAB === '1';

/**
 * Developer-only playtest report (Floor 15). On in development builds, and in release builds
 * only when EXPO_PUBLIC_PLAYTEST=1. Opened with a 2-second long-press on the mission checklist,
 * so it never clutters the child's screen.
 */
export const PLAYTEST_ENABLED: boolean = __DEV__ || process.env.EXPO_PUBLIC_PLAYTEST === '1';

/**
 * Developer tools (viewport simulator, jump-to-state, test learners, resets). On in development
 * builds, and in release builds only when EXPO_PUBLIC_DEV_TOOLS=1 (the web playtest export sets
 * it). Production child builds have neither, and metro.config.js also swaps the tools for an
 * empty stub so their code is not in the bundle at all (checked by scripts/check-bundle.js).
 */
export const DEV_TOOLS_ENABLED: boolean = devToolsEnabled({ dev: __DEV__, flag: process.env.EXPO_PUBLIC_DEV_TOOLS });

export function devToolsEnabled(env: { dev: boolean; flag: string | undefined }): boolean {
  return env.dev || env.flag === '1';
}

/** Show the developer launcher instead of opening the game directly. */
export const LAUNCHER_ENABLED: boolean = DEVICE_LAB_ENABLED || DEV_TOOLS_ENABLED;
