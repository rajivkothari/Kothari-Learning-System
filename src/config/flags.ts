// Build-time feature flags. EXPO_PUBLIC_* values are inlined by Metro at bundle time.

/**
 * Developer-only Device Lab. On in development builds, and in release builds only
 * when EXPO_PUBLIC_DEVICE_LAB=1 is set at build time (needed for honest
 * performance measurement, since debug builds are much slower).
 */
export const DEVICE_LAB_ENABLED: boolean = __DEV__ || process.env.EXPO_PUBLIC_DEVICE_LAB === '1';
