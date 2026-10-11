/// <reference types="node" />
// The temp-directory helper closes what a test left open before deleting it (Windows refuses to
// delete open files; elsewhere later writes to a deleted file are lost).
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { closeNodeDatabasesUnder, openNodeDatabase } from '../../persistence/testing/nodeDatabase';
import { fakeClock, open, tempDir } from './harness';

describe('tempDir cleanup', () => {
  it('closes every database still open in the directory, then deletes it', async () => {
    const tmp = tempDir();
    const left = await open(tmp.file, fakeClock()); // a runtime, never closed by the "test"
    await left.rt.createLearner({ id: 'learner-a', themePack: 'theme.any' });
    const second = openNodeDatabase(tmp.file); // a second connection on the same file
    await second.get('SELECT 1');
    tmp.cleanup();
    expect(fs.existsSync(tmp.dir)).toBe(false);
    await expect(left.db.get('SELECT 1')).rejects.toThrow(/not open/);
    await expect(left.db.close()).resolves.toBeUndefined(); // closing again is a no-op
    await expect(second.close()).resolves.toBeUndefined();
  });

  it('leaves databases in other directories open', async () => {
    const a = tempDir();
    const b = tempDir();
    const da = openNodeDatabase(a.file);
    const db = openNodeDatabase(b.file);
    a.cleanup();
    expect(await db.get<{ x: number }>('SELECT 1 AS x')).toEqual({ x: 1 });
    expect(closeNodeDatabasesUnder(b.dir)).toBe(1);
    await da.close();
    b.cleanup();
  });

  it('a connection that fails to close stays tracked, its error surfaces, and the directory is kept', async () => {
    const tmp = tempDir();
    const db = openNodeDatabase(tmp.file);
    await db.get('SELECT 1');
    const close = jest.spyOn(DatabaseSync.prototype, 'close').mockImplementationOnce(() => {
      throw new Error('disk went away');
    });
    try {
      expect(() => tmp.cleanup()).toThrow('disk went away');
      expect(fs.existsSync(tmp.dir)).toBe(true); // kept for diagnosis
      await expect(db.get('SELECT 1')).resolves.toBeTruthy(); // still open
      expect(closeNodeDatabasesUnder(tmp.dir)).toBe(1); // still tracked: the next sweep closes it
      expect(closeNodeDatabasesUnder(tmp.dir)).toBe(0); // and only then has it left the map
    } finally {
      close.mockRestore();
      tmp.cleanup();
    }
  });

  it('close() surfaces a failed close and keeps the connection tracked until it really closes', async () => {
    const tmp = tempDir();
    const db = openNodeDatabase(tmp.file);
    const close = jest.spyOn(DatabaseSync.prototype, 'close').mockImplementationOnce(() => {
      throw new Error('busy');
    });
    try {
      await expect(db.close()).rejects.toThrow('busy');
      expect(closeNodeDatabasesUnder(tmp.dir)).toBe(1); // still tracked, so the sweep closes it
    } finally {
      close.mockRestore();
      tmp.cleanup();
    }
  });
});
