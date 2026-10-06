// sql.js implementation of SqlDatabase: real SQLite (compiled to WebAssembly) running in
// memory, with the whole database image saved to a ByteStore after every committed write.
// Used for the browser playtest build (the store is IndexedDB there) and tested in Node with
// an in-memory store. Same SQL, migrations, constraints, and append-only triggers as native.
//
// Semantics, compared with expo-sqlite on device:
// - One connection. Transactions are exclusive by construction: a write queue runs one at a
//   time, and reads outside a transaction wait for the running one, so they never see
//   uncommitted rows.
// - A transaction resolves only after the new image is saved. If the save fails, the
//   in-memory database is restored from the last saved image and the transaction rejects,
//   so "committed" always means "durable" (as on device).
// - journal_mode is not WAL (there is no file system to share): the image is the database.
// - Saving writes the whole image (a few hundred KB for a playtest). Fine for one learner's
//   history in a browser, not a design for large data.
//
// sql.js API used (checked against sql.js 1.14.2 source, 2026-10-06): new SQL.Database(bytes?),
// db.exec(sql), db.prepare(sql) -> stmt.bind/step/getAsObject/free, db.getRowsModified(),
// db.export() (closes and reopens the database, so connection pragmas are re-applied).
import type { SqlDatabase, SqlExecutor, SqlValue } from './driver';

/** The subset of sql.js this adapter uses. */
export interface SqlJsStatement {
  bind(values: SqlValue[]): boolean;
  step(): boolean;
  getAsObject(): Record<string, SqlValue>;
  free(): boolean;
}
export interface SqlJsDb {
  exec(sql: string): unknown;
  prepare(sql: string): SqlJsStatement;
  getRowsModified(): number;
  export(): Uint8Array;
  close(): void;
}
export interface SqlJsStatic {
  Database: new (data?: Uint8Array | null) => SqlJsDb;
}

/** Where the database image lives between sessions (IndexedDB in browsers, memory in tests). */
export interface ByteStore {
  load(): Promise<Uint8Array | null>;
  save(bytes: Uint8Array): Promise<void>;
}

/** Applied on every open and after every save. No WAL: the saved image is the whole database. */
export const SQLJS_PRAGMAS = ['PRAGMA foreign_keys = ON'];

export function memoryByteStore(initial: Uint8Array | null = null): ByteStore & { bytes(): Uint8Array | null; failNextSave(): void } {
  let bytes = initial;
  let fail = false;
  return {
    load: async () => (bytes ? new Uint8Array(bytes) : null),
    save: async (b) => {
      if (fail) {
        fail = false;
        throw new Error('Injected save failure');
      }
      bytes = new Uint8Array(b);
    },
    bytes: () => bytes,
    failNextSave: () => void (fail = true),
  };
}

export async function openSqlJsDatabase(SQL: SqlJsStatic, store: ByteStore): Promise<SqlDatabase> {
  let lastSaved = await store.load();
  let db = new SQL.Database(lastSaved);
  const applyPragmas = () => SQLJS_PRAGMAS.forEach((p) => db.exec(p));
  applyPragmas();
  let closed = false;

  // One lane for everything: a transaction holds it for its whole duration.
  let lane: Promise<unknown> = Promise.resolve();
  const inLane = <T>(task: () => Promise<T>): Promise<T> => {
    const run = lane.then(task, task);
    lane = run.catch(() => undefined);
    return run;
  };

  const rows = (sql: string, params: readonly SqlValue[] = []): Record<string, SqlValue>[] => {
    if (closed) throw new Error('Database is closed');
    const stmt = db.prepare(sql);
    try {
      stmt.bind([...params]);
      const out: Record<string, SqlValue>[] = [];
      while (stmt.step()) out.push(stmt.getAsObject());
      return out;
    } finally {
      stmt.free();
    }
  };
  const lastId = () => Number(rows('SELECT last_insert_rowid() AS id')[0]?.id ?? 0);

  // Direct executor: used inside a transaction (already in the lane).
  const direct: SqlExecutor = {
    exec: async (sql) => {
      if (closed) throw new Error('Database is closed');
      db.exec(sql);
    },
    run: async (sql, params) => {
      rows(sql, params);
      return { changes: db.getRowsModified(), lastInsertRowId: lastId() };
    },
    get: async <T>(sql: string, params?: readonly SqlValue[]) => (rows(sql, params)[0] ?? null) as T | null,
    all: async <T>(sql: string, params?: readonly SqlValue[]) => rows(sql, params) as T[],
  };

  async function persist() {
    const image = db.export();
    applyPragmas(); // export() closed and reopened the connection
    try {
      await store.save(image);
      lastSaved = image;
    } catch (e) {
      // Not durable, so not committed: go back to the last saved image.
      db.close();
      db = new SQL.Database(lastSaved);
      applyPragmas();
      throw e;
    }
  }

  async function transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return inLane(async () => {
      db.exec('BEGIN IMMEDIATE');
      let result: T;
      try {
        result = await work(direct);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      await persist();
      return result;
    });
  }

  return {
    // Reads wait for a running transaction; writes outside one are their own transaction.
    exec: (sql) => transaction((tx) => tx.exec(sql)),
    run: (sql, params) => transaction((tx) => tx.run(sql, params)),
    get: <T>(sql: string, params?: readonly SqlValue[]) => inLane(() => direct.get<T>(sql, params)),
    all: <T>(sql: string, params?: readonly SqlValue[]) => inLane(() => direct.all<T>(sql, params)),
    transaction,
    close: () =>
      inLane(async () => {
        closed = true;
        db.close();
      }),
  };
}
