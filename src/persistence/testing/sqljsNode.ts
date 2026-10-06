/// <reference types="node" />
// sql.js in Node, for testing the browser persistence adapter with the same code the web build
// runs (only the ByteStore differs: memory here, IndexedDB in the browser).
import { openSqlJsDatabase, type ByteStore, type SqlJsStatic } from '../sqljsDatabase';
import type { SqlDatabase } from '../driver';

let sql: Promise<SqlJsStatic> | null = null;

export function loadSqlJs(): Promise<SqlJsStatic> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sql ??= (require('sql.js') as (o?: object) => Promise<SqlJsStatic>)();
  return sql;
}

export async function openSqlJsTestDatabase(store: ByteStore): Promise<SqlDatabase> {
  return openSqlJsDatabase(await loadSqlJs(), store);
}
