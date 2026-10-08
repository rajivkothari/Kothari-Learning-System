/// <reference types="node" />
import { openExpoDatabase } from './expoDatabase';
import { tempDir } from '../runtime/testing/harness';

const mockConnections: { closed: boolean; options?: { useNewConnection?: boolean } }[] = [];

// Exercise the native adapter's actual SQL with real separate SQLite connections.
// The bridge alone is substituted; each new connection starts with foreign keys OFF.
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async (file: string, options?: { useNewConnection?: boolean }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(file);
    db.exec('PRAGMA foreign_keys = OFF');
    const connection = { closed: false, options };
    mockConnections.push(connection);
    return {
      execAsync: async (sql: string) => db.exec(sql),
      runAsync: async (sql: string, params: (string | number | null)[]) => {
        const r = db.prepare(sql).run(...params);
        return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
      },
      getFirstAsync: async (sql: string, params: (string | number | null)[]) => db.prepare(sql).get(...params) ?? null,
      getAllAsync: async (sql: string, params: (string | number | null)[]) => db.prepare(sql).all(...params),
      closeAsync: async () => { db.close(); connection.closed = true; },
    };
  },
}));

it('native transactions enforce foreign keys, roll back failures, and close their isolated connections', async () => {
  const tmp = tempDir();
  mockConnections.length = 0;
  const db = await openExpoDatabase(tmp.file);
  try {
    await db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (parent_id INTEGER REFERENCES parent(id))');
    await expect(db.transaction(async (tx) => {
      await tx.run('INSERT INTO parent VALUES (1)');
      await tx.run('INSERT INTO child VALUES (2)');
    })).rejects.toThrow(/FOREIGN KEY/);
    expect(await db.all('SELECT * FROM parent')).toEqual([]);
    const result = await db.transaction(async (tx) => {
      await tx.run('INSERT INTO parent VALUES (1)');
      await tx.run('INSERT INTO child VALUES (1)');
      return tx.get<{ parent_id: number }>('SELECT * FROM child');
    });
    expect(result).toEqual({ parent_id: 1 });
    expect(mockConnections.slice(1)).toEqual([
      { closed: true, options: { useNewConnection: true } },
      { closed: true, options: { useNewConnection: true } },
    ]);
    expect(mockConnections[0]?.closed).toBe(false);
  } finally {
    await db.close();
    tmp.cleanup();
  }
});
