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

export async function indexedDbByteStore(name: string): Promise<ByteStore & { clear(): Promise<void> }> {
  const idb = await openIdb();
  return {
    load: async () => {
      const v = await request<unknown>(idb, 'readonly', (s) => s.get(name));
      return v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : null;
    },
    save: async (bytes) => {
      await request(idb, 'readwrite', (s) => s.put(bytes, name));
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
