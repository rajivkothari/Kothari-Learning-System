// Native: Skia draws with its own GPU context and JSI objects, not CanvasKit, so there is nothing
// to release here. The browser build's fixes are in skiaRelease.web.ts (M9.1).
export function installSkiaRelease(): boolean {
  return false;
}
