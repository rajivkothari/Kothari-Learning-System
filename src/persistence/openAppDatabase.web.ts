// Platform adapter: the app's database in a browser (playtest/development target only).
// sql.js (SQLite as WebAssembly) in memory, saved to IndexedDB after every committed write.
// See sqljsDatabase.ts for the semantics and docs/WEB_PLAYTEST.md for why not expo-sqlite web.
import initSqlJs from 'sql.js';

import type { SqlDatabase } from './driver';
import { openSqlJsDatabase, type SqlJsStatic } from './sqljsDatabase';
import { SAVE_MOVED, deleteIndexedDbImage, indexedDbByteStore } from './web/indexedDbByteStore';

export const APP_STORAGE = 'sql.js + IndexedDB (this browser profile only)';

/** The wasm file is copied into public/ by scripts/prepare-web.js and served from the site root. */
const locateFile = (file: string) => `${globalThis.location?.pathname.replace(/[^/]*$/, '') ?? '/'}${file}`;

/**
 * Two tabs would each hold their own copy and overwrite each other's saves. The newest tab (or the
 * one reloaded last) takes the save over: it claims it on open and tells the other tabs, which show
 * a notice instead of playing on; and an older tab's save is refused anyway if the notice never
 * arrived (indexedDbByteStore.ts). This replaced a Web Lock that refused the second tab: a tab left
 * open somewhere blocked the game with no way forward from the new one, and plain http on a LAN
 * skipped the lock entirely.
 */
const pageToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const movedListeners = new Set<() => void>();
let moved = false;
function markMoved() {
  if (moved) return;
  moved = true;
  for (const l of movedListeners) l();
}

/** Called once when another tab of this browser takes the save over. Returns an unsubscribe. */
export function onSaveMoved(listener: () => void): () => void {
  movedListeners.add(listener);
  if (moved) listener();
  return () => movedListeners.delete(listener);
}

/** Take the save back in this tab: reloading opens and claims it again. */
export function takeSaveBack(): void {
  globalThis.location?.reload();
}

export async function openAppDatabase(name: string): Promise<SqlDatabase> {
  const SQL = (await initSqlJs({ locateFile })) as unknown as SqlJsStatic;
  const store = await indexedDbByteStore(name, pageToken);
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(`kothari-db:${name}`);
    channel.onmessage = (e: MessageEvent<{ claimed?: string }>) => {
      if (e.data?.claimed && e.data.claimed !== pageToken) {
        // A delayed announcement from an older tab cannot evict the current owner.
        // The write path still checks ownership atomically if this best-effort read fails.
        void store.ownsSave().then((owns) => { if (!owns) markMoved(); }).catch(() => undefined);
      }
    };
    channel.postMessage({ claimed: pageToken });
  }
  return openSqlJsDatabase(SQL, {
    load: store.load,
    save: (bytes) =>
      store.save(bytes).catch((e: unknown) => {
        if (e instanceof Error && e.message === SAVE_MOVED) markMoved();
        throw e;
      }),
  });
}

/** Developer reset of this browser's whole save for `name`. Reload the page afterwards. */
export async function wipeAppDatabase(name: string): Promise<boolean> {
  await deleteIndexedDbImage(name);
  return true;
}
