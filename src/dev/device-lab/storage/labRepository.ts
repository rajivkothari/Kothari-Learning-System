// SQL for the Device Lab durability test, written against a tiny driver interface so
// the same statements run against expo-sqlite on device and node:sqlite in Jest.
// This is a storage-stack probe only. It is NOT the future attempts table or token ledger.

export type SqlParam = string | number | null;

export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirst<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
}

export interface LabSummary {
  launches: number;
  events: number;
  tapEvents: number;
  lastEventAt: number | null;
  journalMode: string;
}

export const LAB_SCHEMA_VERSION = 1;

export async function migrateLab(db: SqlDriver): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS lab_meta (
      key   TEXT PRIMARY KEY NOT NULL,
      value INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lab_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      kind       TEXT    NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  await db.run(
    `INSERT INTO lab_meta (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [LAB_SCHEMA_VERSION],
  );
}

/** Atomically increments and returns the launch counter. */
export async function recordLaunch(db: SqlDriver): Promise<number> {
  await db.run(
    `INSERT INTO lab_meta (key, value) VALUES ('launches', 1)
     ON CONFLICT(key) DO UPDATE SET value = value + 1`,
  );
  const row = await db.getFirst<{ value: number }>(`SELECT value FROM lab_meta WHERE key = 'launches'`);
  return row?.value ?? 0;
}

export async function recordEvent(db: SqlDriver, kind: string, now: number): Promise<number> {
  const result = await db.run(`INSERT INTO lab_events (kind, created_at) VALUES (?, ?)`, [kind, now]);
  return result.lastInsertRowId;
}

export async function readSummary(db: SqlDriver): Promise<LabSummary> {
  const launches = await db.getFirst<{ value: number }>(`SELECT value FROM lab_meta WHERE key = 'launches'`);
  const counts = await db.getFirst<{ events: number; taps: number | null; last: number | null }>(
    `SELECT COUNT(*) AS events,
            SUM(CASE WHEN kind = 'tap' THEN 1 ELSE 0 END) AS taps,
            MAX(created_at) AS last
     FROM lab_events`,
  );
  const journal = await db.getFirst<{ journal_mode: string }>(`PRAGMA journal_mode`);
  return {
    launches: launches?.value ?? 0,
    events: counts?.events ?? 0,
    tapEvents: counts?.taps ?? 0,
    lastEventAt: counts?.last ?? null,
    journalMode: journal?.journal_mode ?? 'unknown',
  };
}

/** Clears events but keeps the launch counter, so restart persistence stays visible. */
export async function clearEvents(db: SqlDriver): Promise<void> {
  await db.run(`DELETE FROM lab_events`);
}
