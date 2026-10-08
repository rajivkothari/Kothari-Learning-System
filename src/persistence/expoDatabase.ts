// expo-sqlite implementation of SqlDatabase. The only persistence file that imports a
// native module. The transaction has its own connection, as in Expo's exclusive helper,
// but enables per-connection foreign keys before BEGIN (inside BEGIN would be a no-op).
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
      const txn = await SQLite.openDatabaseAsync(name, { useNewConnection: true });
      try {
        for (const pragma of CONNECTION_PRAGMAS) await txn.execAsync(pragma);
        await txn.execAsync('BEGIN IMMEDIATE');
        try {
          const result = await work(wrap(txn));
          await txn.execAsync('COMMIT');
          return result;
        } catch (e) {
          await txn.execAsync('ROLLBACK');
          throw e;
        }
      } finally {
        await txn.closeAsync();
      }
    },
    close: () => db.closeAsync(),
  };
}
