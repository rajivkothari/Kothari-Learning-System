// IndexedDB ByteStore: keeps the browser playtest database image on this browser profile only.
// One object store, one key per database name. Nothing leaves the device.
import type { ByteStore } from '../sqljsDatabase';

const IDB_NAME = 'kothari-learning';
const STORE = 'sqlite-images';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function request<T>(idb: IDBDatabase, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    // Resolve on transaction completion, so a save is durable before we report success.
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? req.error ?? new Error('IndexedDB request failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Shown by an older tab whose save a newer tab took over. */
export const SAVE_MOVED = 'This game is now open in another tab of this browser. Play in that tab, or reload this one to play here.';

/**
 * `owner`: this page's token. Opening claims the save for it (the newest tab wins), and every save
 * checks, in the same IndexedDB transaction as the write, that the claim still holds. An older tab
 * therefore never overwrites a newer tab's progress: its next save fails with SAVE_MOVED and its
 * in-memory copy goes back to its last save (sqljsDatabase.ts). Readwrite transactions on one store
 * run one at a time across tabs, so a claim cannot land between the check and the write.
 */
export async function indexedDbByteStore(name: string, owner?: string): Promise<ByteStore & { clear(): Promise<void>; ownsSave(): Promise<boolean> }> {
  const idb = await openIdb();
  const ownerKey = `${name}#owner`;
  if (owner) await request(idb, 'readwrite', (s) => s.put(owner, ownerKey));
  return {
    // Notifications can arrive out of order. Only the durable claim decides who plays.
    ownsSave: async () => !owner || (await request<unknown>(idb, 'readonly', (s) => s.get(ownerKey))) === owner,
    load: async () => {
      const v = await request<unknown>(idb, 'readonly', (s) => s.get(name));
      return v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : null;
    },
    save: async (bytes) => {
      if (!owner) {
        await request(idb, 'readwrite', (s) => s.put(bytes, name));
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const tx = idb.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        let moved = false;
        const claim = store.get(ownerKey);
        claim.onsuccess = () => {
          if (claim.result === owner) store.put(bytes, name);
          else {
            moved = true;
            tx.abort();
          }
        };
        const fail = (e: DOMException | null, fallback: string) => reject(moved ? new Error(SAVE_MOVED) : (e ?? new Error(fallback)));
        tx.oncomplete = () => resolve();
        tx.onerror = () => fail(tx.error, 'IndexedDB request failed');
        tx.onabort = () => fail(tx.error, 'IndexedDB transaction aborted');
      });
    },
    clear: async () => {
      await request(idb, 'readwrite', (s) => s.delete(name));
    },
  };
}

/** Delete one saved database image (developer reset of the whole browser save). */
export async function deleteIndexedDbImage(name: string): Promise<void> {
  const store = await indexedDbByteStore(name);
  await store.clear();
}
