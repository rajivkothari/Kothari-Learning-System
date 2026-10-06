// Browser: developer launch parameters from the page URL (query string). Read-only.
export function launchParams(): Record<string, string> {
  const out: Record<string, string> = {};
  const search = globalThis.location?.search ?? '';
  new URLSearchParams(search).forEach((v, k) => (out[k] = v));
  return out;
}
