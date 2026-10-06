// expo-sqlite implementation of SqlDatabase. The only persistence file that imports a
// native module. API checked against expo-sqlite 57.0.4 type definitions (2026-10-06):
// withExclusiveTransactionAsync(task: (txn) => Promise<void>) runs every statement on txn.
import * as SQLite from 'expo-sqlite';

import { CONNECTION_PRAGMAS, type SqlDatabase, type SqlExecutor, type SqlValue } from './driver';

type ExpoExecutor = Pick<SQLite.SQLiteDatabase, 'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

function wrap(db: ExpoExecutor): SqlExecutor {
  const p = (params?: readonly SqlValue[]) => [...(params ?? [])];
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params) => {
      const r = await db.runAsync(sql, p(params));
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    get: (sql, params) => db.getFirstAsync(sql, p(params)),
    all: (sql, params) => db.getAllAsync(sql, p(params)),
  };
}

export async function openExpoDatabase(name: string): Promise<SqlDatabase> {
  const db = await SQLite.openDatabaseAsync(name);
  for (const pragma of CONNECTION_PRAGMAS) await db.execAsync(pragma);
  const base = wrap(db);
  return {
    ...base,
    async transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      let result: T | undefined;
      await db.withExclusiveTransactionAsync(async (txn) => {
        result = await work(wrap(txn));
      });
      return result as T;
    },
    close: () => db.closeAsync(),
  };
}
