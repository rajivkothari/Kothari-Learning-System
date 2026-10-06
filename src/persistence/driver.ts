// Minimal SQL interface the persistence layer is written against. Two implementations:
// expo-sqlite on device (expoDatabase.ts) and node:sqlite in tests (testing/nodeDatabase.ts).
// The pure engine never sees this: persistence translates between rows and engine types.

export type SqlValue = string | number | null;

export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<{ changes: number; lastInsertRowId: number }>;
  get<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
}

export interface SqlDatabase extends SqlExecutor {
  /**
   * Run `work` in one exclusive write transaction. Commits if it resolves, rolls back if it
   * throws. All statements inside must use `tx`. Callers serialize transactions (the
   * runtime's write queue): expo-sqlite fails concurrent writers with "database is locked".
   */
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Connection settings applied on every open. */
export const CONNECTION_PRAGMAS = ['PRAGMA journal_mode = WAL', 'PRAGMA foreign_keys = ON'];
