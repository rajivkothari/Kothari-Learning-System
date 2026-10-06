/// <reference types="node" />
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MIGRATIONS, MigrationError, checkMigrationList, migrate, type Migration } from './migrations';
import { openNodeDatabase } from './testing/nodeDatabase';

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  file = path.join(dir, 'app.db');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const tables = async (f: string) => {
  const db = openNodeDatabase(f);
  const rows = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  await db.close();
  return rows.map((r) => r.name);
};

describe('migrations', () => {
  it('creates the schema on a fresh database and records the version', async () => {
    const db = openNodeDatabase(file);
    expect(await migrate(db, 1000)).toEqual({ applied: [1], version: 1 });
    expect(await db.all('SELECT version, name, applied_at FROM schema_migrations')).toEqual([{ version: 1, name: 'learning-store', applied_at: 1000 }]);
    await db.close();
    expect(await tables(file)).toEqual(['derived_cache', 'learners', 'learning_events', 'mission_instances', 'progression_events', 'schema_migrations']);
  });

  it('is a no-op when reopened', async () => {
    const a = openNodeDatabase(file);
    await migrate(a, 1);
    await a.close();
    const b = openNodeDatabase(file);
    expect(await migrate(b, 2)).toEqual({ applied: [], version: 1 });
    await b.close();
  });

  it('applies only missing migrations to an existing database and keeps its data', async () => {
    const a = openNodeDatabase(file);
    await migrate(a, 1);
    await a.run("INSERT INTO learners (id, theme_pack, display_name, created_at) VALUES ('l1', 'pack', NULL, 1)");
    await a.close();
    const v2: Migration = { version: 2, name: 'add-note', statements: ['ALTER TABLE learners ADD COLUMN note TEXT'] };
    const b = openNodeDatabase(file);
    expect(await migrate(b, 2, [...MIGRATIONS, v2])).toEqual({ applied: [2], version: 2 });
    expect(await b.get('SELECT id, note FROM learners')).toEqual({ id: 'l1', note: null });
    await b.close();
  });

  it('rolls back a failing migration completely and does not record it', async () => {
    const a = openNodeDatabase(file);
    await migrate(a, 1);
    const broken: Migration = { version: 2, name: 'broken', statements: ['CREATE TABLE half_done (x INTEGER)', 'THIS IS NOT SQL'] };
    await expect(migrate(a, 2, [...MIGRATIONS, broken])).rejects.toThrow();
    expect(await a.all('SELECT version FROM schema_migrations')).toEqual([{ version: 1 }]);
    expect(await a.get("SELECT name FROM sqlite_master WHERE name = 'half_done'")).toBeNull();
    await a.close();
  });

  it('refuses edited migrations and databases newer than the app', async () => {
    const a = openNodeDatabase(file);
    await migrate(a, 1);
    await expect(migrate(a, 2, [{ ...MIGRATIONS[0]!, name: 'renamed' }])).rejects.toThrow(MigrationError);
    await a.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'future', 3)");
    await expect(migrate(a, 4)).rejects.toThrow(/newer than this app/);
    await a.close();
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
