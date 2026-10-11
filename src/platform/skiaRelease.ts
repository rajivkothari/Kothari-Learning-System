// Native: Skia draws with its own GPU context and JSI objects, not CanvasKit, so there is nothing
// to release here. The browser build's fixes are in skiaRelease.web.ts (M9.1), which returns the
// same result type.

/** What installSkiaRelease did. All three browser patches install together or not at all. */
export interface SkiaReleaseResult {
  /** True only when this call installed all three patches. */
  installed: boolean;
  /**
   * installed; native (nothing to do); already-installed; unsupported-version (react-native-skia
   * is not in the web file's SUPPORTED_SKIA_VERSIONS, or its version could not be read);
   * missing-symbols (a private symbol a patch needs is gone); failed (applying threw and was undone).
   */
  status: 'installed' | 'native' | 'already-installed' | 'unsupported-version' | 'missing-symbols' | 'failed';
  /** The react-native-skia version read (web only; null when unreadable). */
  version?: string | null;
  /** The private symbols the preflight did not find (status missing-symbols). */
  missing?: string[];
}

export function installSkiaRelease(): SkiaReleaseResult {
  return { installed: false, status: 'native' };
}
