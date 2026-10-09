/// <reference types="node" />
// node:sqlite implementation of SqlDatabase for tests and benchmarks (Node 22+).
// Real SQLite: same SQL, same constraints and triggers, real file persistence across
// close/reopen. Not exercised: expo-sqlite's native bindings (covered on device).
import path from 'node:path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

import { CONNECTION_PRAGMAS, type SqlDatabase, type SqlExecutor, type SqlValue } from '../driver';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

export interface FaultPlan {
  /** Throw before executing a statement matching this, simulating a crash mid-transaction. */
  failBefore?: (sql: string, params: readonly SqlValue[]) => boolean;
}

/** Every connection opened here and not closed yet, so a test can close what it left open (closeNodeDatabasesUnder). */
const openConnections = new Map<DatabaseSyncType, string>();

/**
 * Close every connection still open on a file under `dir`. A temp directory must be deleted only
 * after its database files are closed: Windows refuses to delete an open file, and on any platform
 * a later write to a deleted file is silently lost. Returns how many were still open.
 */
export function closeNodeDatabasesUnder(dir: string): number {
  const prefix = path.resolve(dir) + path.sep;
  let closed = 0;
  for (const [db, file] of [...openConnections]) {
    if (!file.startsWith(prefix)) continue;
    openConnections.delete(db);
    db.close();
    closed += 1;
  }
  return closed;
}

export function openNodeDatabase(file: string, faults: FaultPlan = {}): SqlDatabase {
  const db: DatabaseSyncType = new DatabaseSync(file);
  openConnections.set(db, path.resolve(file));
  for (const pragma of CONNECTION_PRAGMAS) db.exec(pragma);
  let inTransaction = false;

  const check = (sql: string, params: readonly SqlValue[] = []) => {
    if (faults.failBefore?.(sql, params)) throw new Error(`Injected fault before: ${sql.trim().split('\n')[0]}`);
  };
  const exec: SqlExecutor = {
    exec: async (sql) => {
      check(sql);
      db.exec(sql);
    },
    run: async (sql, params: readonly SqlValue[] = []) => {
      check(sql, params);
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    get: async <T>(sql: string, params: readonly SqlValue[] = []) => {
      check(sql, params);
      return (db.prepare(sql).get(...params) ?? null) as T | null;
    },
    all: async <T>(sql: string, params: readonly SqlValue[] = []) => {
      check(sql, params);
      return db.prepare(sql).all(...params) as T[];
    },
  };

  return {
    ...exec,
    async transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      if (inTransaction) throw new Error('Nested transactions are not supported');
      inTransaction = true;
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await work(exec);
        db.exec('COMMIT');
        return result;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        inTransaction = false;
      }
    },
    close: async () => {
      // Closing twice is a no-op (the harness may have closed it already), as with expo-sqlite.
      if (!openConnections.delete(db)) return;
      db.close();
    },
  };
}
