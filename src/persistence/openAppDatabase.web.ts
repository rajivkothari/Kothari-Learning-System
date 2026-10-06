// Platform adapter: the app's database in a browser (playtest/development target only).
// sql.js (SQLite as WebAssembly) in memory, saved to IndexedDB after every committed write.
// See sqljsDatabase.ts for the semantics and docs/WEB_PLAYTEST.md for why not expo-sqlite web.
import initSqlJs from 'sql.js';

import type { SqlDatabase } from './driver';
import { openSqlJsDatabase, type SqlJsStatic } from './sqljsDatabase';
import { deleteIndexedDbImage, indexedDbByteStore } from './web/indexedDbByteStore';

export const APP_STORAGE = 'sql.js + IndexedDB (this browser profile only)';

/** The wasm file is copied into public/ by scripts/prepare-web.js and served from the site root. */
const locateFile = (file: string) => `${globalThis.location?.pathname.replace(/[^/]*$/, '') ?? '/'}${file}`;

let lockRelease: (() => void) | null = null;

/**
 * Two tabs would each hold their own copy and overwrite each other's saves. Hold a Web Lock
 * for the page's lifetime and refuse a second tab. Web Locks need a secure context
 * (https or localhost): over plain http on a LAN the check is skipped (documented).
 */
async function holdTabLock(name: string): Promise<void> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (!locks || lockRelease) return;
  await new Promise<void>((resolve, reject) => {
    void locks.request(`kothari-db:${name}`, { ifAvailable: true }, (lock) => {
      if (!lock) {
        reject(new Error('The game is already open in another tab of this browser. Close it, then reload.'));
        return undefined;
      }
      resolve();
      return new Promise<void>((release) => (lockRelease = release));
    });
  });
}

export async function openAppDatabase(name: string): Promise<SqlDatabase> {
  await holdTabLock(name);
  const SQL = (await initSqlJs({ locateFile })) as unknown as SqlJsStatic;
  return openSqlJsDatabase(SQL, await indexedDbByteStore(name));
}

/** Developer reset of this browser's whole save for `name`. Reload the page afterwards. */
export async function wipeAppDatabase(name: string): Promise<boolean> {
  await deleteIndexedDbImage(name);
  return true;
}
