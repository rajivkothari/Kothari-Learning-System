// expo-sqlite adapter for the Device Lab. Uses only the async API so database work
// never runs on the JS thread synchronously and never delays touch feedback.
import * as SQLite from 'expo-sqlite';

import { migrateLab, type SqlDriver } from './labRepository';

const LAB_DB_NAME = 'device-lab.db'; // separate from any future production database

let opening: Promise<SqlDriver> | null = null;

export function openLabDb(): Promise<SqlDriver> {
  if (!opening) {
    opening = (async () => {
      const db = await SQLite.openDatabaseAsync(LAB_DB_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL');
      const driver: SqlDriver = {
        exec: (sql) => db.execAsync(sql),
        run: async (sql, params = []) => {
          const r = await db.runAsync(sql, params);
          return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
        },
        getFirst: (sql, params = []) => db.getFirstAsync(sql, params),
      };
      await migrateLab(driver);
      return driver;
    })();
    opening.catch(() => {
      opening = null; // allow a retry after a failed open
    });
  }
  return opening;
}
