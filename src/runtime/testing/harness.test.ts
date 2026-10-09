/// <reference types="node" />
// The temp-directory helper closes what a test left open before deleting it (Windows refuses to
// delete open files; elsewhere later writes to a deleted file are lost).
import fs from 'node:fs';

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
});
