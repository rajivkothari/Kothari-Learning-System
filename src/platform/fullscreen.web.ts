// Browser: a tablet browser's bars take height the game's layout counts on (a Fire HD 8 in landscape
// keeps about 520 of its 600 points). Full screen gives it back. Offered only where the browser
// supports it and the page is not already full screen or opened from the home screen.
type Doc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null };
type Root = HTMLElement & { webkitRequestFullscreen?: () => void };

function standalone(): boolean {
  const nav = globalThis.navigator as Navigator & { standalone?: boolean };
  return nav?.standalone === true || globalThis.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches === true;
}

export function canGoFullscreen(): boolean {
  const d = globalThis.document as Doc | undefined;
  if (!d) return false;
  const enabled = d.fullscreenEnabled || d.webkitFullscreenEnabled;
  const already = d.fullscreenElement || d.webkitFullscreenElement;
  return Boolean(enabled) && !already && !standalone();
}

/** Call from a tap (browsers allow full screen only in response to one). */
export function goFullscreen(): void {
  const el = globalThis.document?.documentElement as Root | undefined;
  if (!el) return;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else el.webkitRequestFullscreen?.();
}
