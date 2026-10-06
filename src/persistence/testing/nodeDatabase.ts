/// <reference types="node" />
// node:sqlite implementation of SqlDatabase for tests and benchmarks (Node 22+).
// Real SQLite: same SQL, same constraints and triggers, real file persistence across
// close/reopen. Not exercised: expo-sqlite's native bindings (covered on device).
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

import { CONNECTION_PRAGMAS, type SqlDatabase, type SqlExecutor, type SqlValue } from '../driver';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

export interface FaultPlan {
  /** Throw before executing a statement matching this, simulating a crash mid-transaction. */
  failBefore?: (sql: string, params: readonly SqlValue[]) => boolean;
}

export function openNodeDatabase(file: string, faults: FaultPlan = {}): SqlDatabase {
  const db: DatabaseSyncType = new DatabaseSync(file);
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
    close: async () => db.close(),
  };
}
