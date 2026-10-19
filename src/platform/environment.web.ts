// Browser: the user agent, so a report says which browser it came from. Simulated viewports
// are added by the developer shell (see src/presentation/viewport.tsx).
import { buildLabel } from '../config/buildInfo';

export const IS_BROWSER = true;

export function environmentDescription(): string {
  const build = buildLabel();
  return `browser: ${globalThis.navigator?.userAgent ?? 'unknown'}${build ? ` · ${build}` : ''}`;
}
