/// <reference types="node" />
// Counting wrappers for the persistence benchmark: what each runtime call writes, and what the
// browser adapter saves. They only observe; every call goes through unchanged.
import { performance } from 'node:perf_hooks';

import type { SqlDatabase, SqlExecutor, SqlValue } from '../../persistence/driver';

export interface WriteStats {
  transactions: number;
  statements: number;
  /** Characters of string parameters in write statements (a proxy for bytes written). */
  bytes: number;
  /** The same, for statements on derived_cache only. */
  cacheBytes: number;
  cacheWrites: number;
}

export const zeroStats = (): WriteStats => ({ transactions: 0, statements: 0, bytes: 0, cacheBytes: 0, cacheWrites: 0 });

const isWrite = (sql: string) => /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql);
const paramBytes = (params: readonly SqlValue[] = []) => params.reduce<number>((n, p) => n + (typeof p === 'string' ? p.length : 8), 0);

export function instrumentDb(db: SqlDatabase): { db: SqlDatabase; stats: WriteStats } {
  const stats = zeroStats();
  const wrap = (x: SqlExecutor): SqlExecutor => ({
    exec: (sql) => x.exec(sql),
    run: (sql, params) => {
      if (isWrite(sql)) {
        stats.statements += 1;
        const b = paramBytes(params);
        stats.bytes += b;
        if (sql.includes('derived_cache')) {
          stats.cacheBytes += b;
          stats.cacheWrites += 1;
        }
      }
      return x.run(sql, params);
    },
    get: (sql, params) => x.get(sql, params),
    all: (sql, params) => x.all(sql, params),
  });
  const outer = wrap(db);
  return {
    stats,
    db: {
      ...outer,
      // A write outside a transaction is its own transaction in every adapter.
      run: (sql, params) => {
        if (isWrite(sql)) stats.transactions += 1;
        return outer.run(sql, params);
      },
      transaction: (work) => {
        stats.transactions += 1;
        return db.transaction((tx) => work(wrap(tx)));
      },
      close: () => db.close(),
    },
  };
}

export interface SaveStats {
  saves: number;
  bytes: number;
  ms: number[];
  lastSize: number;
}

/** A memory ByteStore (browser adapter in Node) that counts saves, bytes and time per save. */
export function countingStore(initial: Uint8Array | null): { load(): Promise<Uint8Array | null>; save(b: Uint8Array): Promise<void>; stats: SaveStats; bytes(): Uint8Array | null } {
  let bytes = initial;
  const stats: SaveStats = { saves: 0, bytes: 0, ms: [], lastSize: initial?.length ?? 0 };
  return {
    stats,
    bytes: () => bytes,
    load: async () => (bytes ? new Uint8Array(bytes) : null),
    save: async (b) => {
      const t = performance.now();
      // IndexedDB stores a structured clone: a copy of the image is the least a save costs.
      bytes = new Uint8Array(b);
      stats.ms.push(performance.now() - t);
      stats.saves += 1;
      stats.bytes += b.length;
      stats.lastSize = b.length;
    },
  };
}

export function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}
