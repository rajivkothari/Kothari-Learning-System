/// <reference types="node" />
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MIGRATIONS, MigrationError, checkMigrationList, migrate, type Migration } from './migrations';
import { closeNodeDatabasesUnder, openNodeDatabase } from './testing/nodeDatabase';

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  file = path.join(dir, 'app.db');
});
afterEach(() => {
  closeNodeDatabasesUnder(dir); // close before deleting (Windows refuses to delete open files)
  fs.rmSync(dir, { recursive: true, force: true });
});

const tables = async (f: string) => {
  const db = openNodeDatabase(f);
  const rows = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  await db.close();
  return rows.map((r) => r.name);
};

describe('migrations', () => {
  it('creates the schema on a fresh database and records the version', async () => {
    const db = openNodeDatabase(file);
    expect(await migrate(db, 1000)).toEqual({ applied: [1, 2, 3, 4], version: 4 });
    expect(await db.all('SELECT version, name, applied_at FROM schema_migrations')).toEqual([
      { version: 1, name: 'learning-store', applied_at: 1000 },
      { version: 2, name: 'unlocks-and-settings', applied_at: 1000 },
      { version: 3, name: 'mission-abandoned-status', applied_at: 1000 },
      { version: 4, name: 'world-memory', applied_at: 1000 },
    ]);
    await db.close();
    expect(await tables(file)).toEqual(['derived_cache', 'learner_settings', 'learners', 'learning_events', 'mission_instances', 'progression_events', 'schema_migrations', 'unlocks', 'world_memory']);
  });

  it('is a no-op when reopened', async () => {
    const a = openNodeDatabase(file);
    await migrate(a, 1);
    await a.close();
    const b = openNodeDatabase(file);
    expect(await migrate(b, 2)).toEqual({ applied: [], version: 4 });
    await b.close();
  });

  it('applies only missing migrations to an existing database and keeps its data', async () => {
    const a = openNodeDatabase(file);
    await migrate(a, 1);
    await a.run("INSERT INTO learners (id, theme_pack, display_name, created_at) VALUES ('l1', 'pack', NULL, 1)");
    await a.close();
    const next: Migration = { version: 5, name: 'add-note', statements: ['ALTER TABLE learners ADD COLUMN note TEXT'] };
    const b = openNodeDatabase(file);
    expect(await migrate(b, 2, [...MIGRATIONS, next])).toEqual({ applied: [5], version: 5 });
    expect(await b.get('SELECT id, note FROM learners')).toEqual({ id: 'l1', note: null });
    await b.close();
  });

  it('rolls back a failing migration completely and does not record it', async () => {
    const a = openNodeDatabase(file);
    await migrate(a, 1);
    const broken: Migration = { version: 5, name: 'broken', statements: ['CREATE TABLE half_done (x INTEGER)', 'THIS IS NOT SQL'] };
    await expect(migrate(a, 2, [...MIGRATIONS, broken])).rejects.toThrow();
    expect(await a.all('SELECT version FROM schema_migrations')).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]);
    expect(await a.get("SELECT name FROM sqlite_master WHERE name = 'half_done'")).toBeNull();
    await a.close();
  });

  it('refuses edited migrations and databases newer than the app', async () => {
    const a = openNodeDatabase(file);
    await migrate(a, 1);
    await expect(migrate(a, 2, [{ ...MIGRATIONS[0]!, name: 'renamed' }])).rejects.toThrow(MigrationError);
    await a.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (5, 'future', 3)");
    await expect(migrate(a, 4)).rejects.toThrow(/newer than this app/);
    await a.close();
  });

  it('upgrades a version-1 database to version 2 without touching its data', async () => {
    const a = openNodeDatabase(file);
    await migrate(a, 1, MIGRATIONS.slice(0, 1));
    await a.run("INSERT INTO learners (id, theme_pack, display_name, created_at) VALUES ('l1', 'pack', NULL, 1)");
    await a.run("INSERT INTO learning_events (id, learner_id, type, instance_id, occurred_at, payload) VALUES ('e1', 'l1', 'attempt', 'i1', 1, '{}')");
    await a.close();
    const b = openNodeDatabase(file);
    expect(await migrate(b, 2, MIGRATIONS.slice(0, 2))).toEqual({ applied: [2], version: 2 });
    expect(await b.get('SELECT id FROM learning_events')).toEqual({ id: 'e1' });
    await b.run("INSERT INTO unlocks (id, learner_id, unlock_id, source, occurred_at) VALUES ('l1|u1', 'l1', 'u1', 'test', 2)");
    await expect(b.run("INSERT INTO unlocks (id, learner_id, unlock_id, source, occurred_at) VALUES ('other', 'l1', 'u1', 'test', 3)")).rejects.toThrow(/UNIQUE/);
    await expect(b.run('DELETE FROM unlocks')).rejects.toThrow(/append-only/);
    await b.close();
  });

  it('upgrades a version-2 database to version 3: every checkpoint kept, and "abandoned" allowed', async () => {
    const a = openNodeDatabase(file);
    await migrate(a, 1, MIGRATIONS.slice(0, 2));
    await a.run("INSERT INTO learners (id, theme_pack, display_name, created_at) VALUES ('l1', 'pack', NULL, 1)");
    const row = (id: string, status: string) =>
      a.run(
        `INSERT INTO mission_instances (id, learner_id, mission_id, mission_version, seed_base, status, state, last_command_id, last_result, revision, started_at, completed_at, updated_at)
         VALUES (?, 'l1', 'm', 1, ?, ?, '{"x":1}', 'c7', '[]', 7, 5, NULL, 9)`,
        [id, id, status],
      );
    await row('i1', 'active');
    await row('i2', 'completed');
    await expect(a.run("UPDATE mission_instances SET status = 'abandoned' WHERE id = 'i1'")).rejects.toThrow(/CHECK/);
    const before = await a.all('SELECT * FROM mission_instances ORDER BY id');
    await a.close();
    const b = openNodeDatabase(file);
    expect(await migrate(b, 2, MIGRATIONS.slice(0, 3))).toEqual({ applied: [3], version: 3 });
    expect(await b.all('SELECT * FROM mission_instances ORDER BY id')).toEqual(before);
    await b.run("UPDATE mission_instances SET status = 'abandoned' WHERE id = 'i1'");
    await expect(b.run("UPDATE mission_instances SET status = 'lost' WHERE id = 'i1'")).rejects.toThrow(/CHECK/);
    await expect(b.run("INSERT INTO mission_instances (id, learner_id, mission_id, mission_version, seed_base, status, state, revision, started_at, updated_at) VALUES ('i3', 'nobody', 'm', 1, 's', 'active', '{}', 1, 1, 1)")).rejects.toThrow(/FOREIGN KEY/);
    expect(await b.get("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'mission_instances_by_learner'")).toEqual({ name: 'mission_instances_by_learner' });
    await b.close();
  });

  it('upgrades a version-3 database to version 4: world memory is once per learner and key, and append-only', async () => {
    const a = openNodeDatabase(file);
    await migrate(a, 1, MIGRATIONS.slice(0, 3));
    await a.run("INSERT INTO learners (id, theme_pack, display_name, created_at) VALUES ('l1', 'pack', NULL, 1)");
    await a.close();
    const b = openNodeDatabase(file);
    expect(await migrate(b, 2)).toEqual({ applied: [4], version: 4 });
    await b.run("INSERT INTO world_memory (id, learner_id, memory_key, occurred_at) VALUES ('l1|k', 'l1', 'k', 1)");
    await expect(b.run("INSERT INTO world_memory (id, learner_id, memory_key, occurred_at) VALUES ('other', 'l1', 'k', 2)")).rejects.toThrow(/UNIQUE/);
    await expect(b.run("UPDATE world_memory SET occurred_at = 3")).rejects.toThrow(/append-only/);
    await expect(b.run('DELETE FROM world_memory')).rejects.toThrow(/append-only/);
    await expect(b.run("INSERT INTO world_memory (id, learner_id, memory_key, occurred_at) VALUES ('x', 'nobody', 'k', 2)")).rejects.toThrow(/FOREIGN KEY/);
    await b.close();
  });

  it('rejects gaps in the migration list', () => {
    expect(() => checkMigrationList([MIGRATIONS[0]!, { version: 3, name: 'gap', statements: [] }])).toThrow(MigrationError);
  });

  it('enforces append-only learning and progression logs in the database itself', async () => {
    const db = openNodeDatabase(file);
    await migrate(db, 1);
    await db.run("INSERT INTO learners (id, theme_pack, display_name, created_at) VALUES ('l1', 'pack', NULL, 1)");
    await db.run("INSERT INTO learning_events (id, learner_id, type, instance_id, occurred_at, payload) VALUES ('e1', 'l1', 'attempt', 'i1', 1, '{}')");
    await expect(db.run("UPDATE learning_events SET payload = 'x' WHERE id = 'e1'")).rejects.toThrow(/append-only/);
    await expect(db.run("DELETE FROM learning_events WHERE id = 'e1'")).rejects.toThrow(/append-only/);
    await expect(db.run("INSERT INTO learning_events (id, learner_id, type, instance_id, occurred_at, payload) VALUES ('e1', 'l1', 'attempt', 'i1', 1, '{}')")).rejects.toThrow(/UNIQUE/);
    await expect(db.run("INSERT INTO learning_events (id, learner_id, type, instance_id, occurred_at, payload) VALUES ('e2', 'nobody', 'attempt', 'i1', 1, '{}')")).rejects.toThrow(/FOREIGN KEY/);
    await db.close();
  });
});
