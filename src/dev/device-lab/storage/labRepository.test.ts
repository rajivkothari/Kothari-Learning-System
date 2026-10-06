/**
 * @jest-environment node
 */
/// <reference types="node" />
// Runs the Device Lab SQL against a real SQLite engine (Node's built-in node:sqlite),
// using a file database to mimic "close the app, reopen it".
// This does not exercise expo-sqlite's native bindings. On-device behaviour is
// covered by the physical test plan in docs/DEVICE_LAB.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { clearEvents, migrateLab, readSummary, recordEvent, recordLaunch, type SqlDriver } from './labRepository';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

function nodeDriver(file: string): { driver: SqlDriver; close: () => void } {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  const driver: SqlDriver = {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params = []) {
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getFirst<T>(sql: string, params: (string | number | null)[] = []) {
      const row = db.prepare(sql).get(...params);
      return (row ?? null) as T | null;
    },
  };
  return { driver, close: () => db.close() };
}

describe('Device Lab storage repository', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-db-'));
    file = path.join(dir, 'device-lab.db');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('persists launches and events across close and reopen', async () => {
    const first = nodeDriver(file);
    await migrateLab(first.driver);
    expect(await recordLaunch(first.driver)).toBe(1);
    await recordEvent(first.driver, 'tap', 1000);
    await recordEvent(first.driver, 'tap', 2000);
    await recordEvent(first.driver, 'audio', 3000);
    first.close();

    const second = nodeDriver(file);
    await migrateLab(second.driver); // idempotent on an existing database
    expect(await recordLaunch(second.driver)).toBe(2);
    const summary = await readSummary(second.driver);
    expect(summary).toMatchObject({ launches: 2, events: 3, tapEvents: 2, lastEventAt: 3000, journalMode: 'wal' });
    second.close();
  });

  it('clears events without resetting the launch counter', async () => {
    const { driver, close } = nodeDriver(file);
    await migrateLab(driver);
    await recordLaunch(driver);
    await recordEvent(driver, 'tap', 1);
    await clearEvents(driver);
    const summary = await readSummary(driver);
    expect(summary.events).toBe(0);
    expect(summary.tapEvents).toBe(0);
    expect(summary.launches).toBe(1);
    close();
  });

  it('assigns increasing ids to events', async () => {
    const { driver, close } = nodeDriver(file);
    await migrateLab(driver);
    const a = await recordEvent(driver, 'tap', 1);
    const b = await recordEvent(driver, 'tap', 2);
    expect(b).toBeGreaterThan(a);
    close();
  });
});
