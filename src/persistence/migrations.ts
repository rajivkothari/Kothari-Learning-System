// Schema migrations: numbered, forward-only, each applied in its own transaction
// together with its schema_migrations row. Deterministic: no data-dependent branches.
//
// Never edit a shipped migration. Add a new one. The runner refuses to open a database
// whose recorded migration names differ from this list, or that is newer than the app.
import type { SqlDatabase } from './driver';

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

const appendOnly = (table: string) => [
  `CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END`,
  `CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END`,
];

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'learning-store',
    statements: [
      `CREATE TABLE learners (
        id TEXT PRIMARY KEY NOT NULL,
        theme_pack TEXT NOT NULL,
        display_name TEXT,
        created_at INTEGER NOT NULL
      )`,
      // Source of truth: attempts and completion records, in one ordered log.
      `CREATE TABLE learning_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        learner_id TEXT NOT NULL REFERENCES learners(id),
        type TEXT NOT NULL CHECK (type IN ('attempt', 'completion')),
        instance_id TEXT NOT NULL,
        mission_instance_id TEXT,
        occurred_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      )`,
      `CREATE INDEX learning_events_by_learner ON learning_events (learner_id, seq)`,
      ...appendOnly('learning_events'),
      // Resumable mission checkpoints. Mutable by design; revision guards concurrent writers.
      `CREATE TABLE mission_instances (
        id TEXT PRIMARY KEY NOT NULL,
        learner_id TEXT NOT NULL REFERENCES learners(id),
        mission_id TEXT NOT NULL,
        mission_version INTEGER NOT NULL,
        seed_base TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
        state TEXT NOT NULL,
        last_command_id TEXT,
        last_result TEXT,
        revision INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX mission_instances_by_learner ON mission_instances (learner_id, status)`,
      // Announced opportunity upgrades. Append-only: what was announced is never revoked.
      `CREATE TABLE progression_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        learner_id TEXT NOT NULL REFERENCES learners(id),
        opportunity_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        from_tier TEXT NOT NULL,
        to_tier TEXT NOT NULL,
        increment INTEGER NOT NULL,
        source_completion_id TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      )`,
      `CREATE INDEX progression_events_by_learner ON progression_events (learner_id, seq)`,
      ...appendOnly('progression_events'),
      // Derived, disposable, rebuildable.
      `CREATE TABLE derived_cache (
        learner_id TEXT PRIMARY KEY NOT NULL REFERENCES learners(id),
        cache_key TEXT NOT NULL,
        through_seq INTEGER NOT NULL,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    name: 'unlocks-and-settings',
    statements: [
      // In-game unlocks (ranks, cosmetics, systems). Granted once per learner, never revoked.
      // Not a currency: no amounts, no balance.
      `CREATE TABLE unlocks (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        learner_id TEXT NOT NULL REFERENCES learners(id),
        unlock_id TEXT NOT NULL,
        source TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        UNIQUE (learner_id, unlock_id)
      )`,
      ...appendOnly('unlocks'),
      // Per-learner access and sensory settings (motion, sound). Mutable by design; never
      // affects challenge. One row per key.
      `CREATE TABLE learner_settings (
        learner_id TEXT NOT NULL REFERENCES learners(id),
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (learner_id, key)
      )`,
    ],
  },
  {
    version: 3,
    name: 'mission-abandoned-status',
    statements: [
      // An active instance whose content can no longer be regenerated ends as "abandoned" (its
      // evidence stays). SQLite cannot alter a CHECK, so the checkpoint table is rebuilt. It is
      // mutable by design and nothing references it, so a copy keeps every row as it was.
      `CREATE TABLE mission_instances_v3 (
        id TEXT PRIMARY KEY NOT NULL,
        learner_id TEXT NOT NULL REFERENCES learners(id),
        mission_id TEXT NOT NULL,
        mission_version INTEGER NOT NULL,
        seed_base TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
        state TEXT NOT NULL,
        last_command_id TEXT,
        last_result TEXT,
        revision INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        updated_at INTEGER NOT NULL
      )`,
      `INSERT INTO mission_instances_v3 SELECT id, learner_id, mission_id, mission_version, seed_base, status, state, last_command_id, last_result, revision, started_at, completed_at, updated_at FROM mission_instances`,
      `DROP TABLE mission_instances`,
      `ALTER TABLE mission_instances_v3 RENAME TO mission_instances`,
      `CREATE INDEX mission_instances_by_learner ON mission_instances (learner_id, status)`,
    ],
  },
  {
    version: 4,
    name: 'world-memory',
    statements: [
      // What the world remembers about a learner's play that is NOT learning: places inspected,
      // one-time tips shown. Theme-namespaced keys ("<theme>.discovery.<place>"). Once per learner and
      // key, append-only, never evidence, never value, never a currency.
      `CREATE TABLE world_memory (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        learner_id TEXT NOT NULL REFERENCES learners(id),
        memory_key TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        UNIQUE (learner_id, memory_key)
      )`,
      ...appendOnly('world_memory'),
    ],
  },
];

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

export function checkMigrationList(migrations: readonly Migration[]): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new MigrationError(`Migration versions must be 1..n in order; found ${m.version} at position ${i}`);
  });
}

/** Apply missing migrations. `now` is recorded as applied_at (caller-supplied clock). */
export async function migrate(db: SqlDatabase, now: number, migrations: readonly Migration[] = MIGRATIONS): Promise<{ applied: number[]; version: number }> {
  checkMigrationList(migrations);
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
  const recorded = await db.all<{ version: number; name: string }>('SELECT version, name FROM schema_migrations ORDER BY version');
  for (const r of recorded) {
    const known = migrations[r.version - 1];
    if (!known) throw new MigrationError(`Database is at migration ${r.version}, newer than this app (${migrations.length}). Refusing to open.`);
    if (known.name !== r.name) throw new MigrationError(`Migration ${r.version} was "${r.name}" in this database but is "${known.name}" in code. Shipped migrations must never change.`);
  }
  const applied: number[] = [];
  for (const m of migrations.slice(recorded.length)) {
    await db.transaction(async (tx) => {
      for (const sql of m.statements) await tx.exec(sql);
      await tx.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [m.version, m.name, now]);
    });
    applied.push(m.version);
  }
  return { applied, version: migrations.length };
}
