// Platform adapter: the browser e2e probe (hostProbe.web.ts). Native apps have none.
import type { Floor15Session } from '../sessionCore';

/** Install the read-only e2e probe for this session; returns its removal. A no-op outside the browser build. */
export function installProbe(_session: Floor15Session): () => void {
  return () => {};
}
