// Minimal module declaration for sql.js (the package ships no TypeScript types).
// The adapter narrows the result to SqlJsStatic in sqljsDatabase.ts.
declare module 'sql.js' {
  interface InitOptions {
    locateFile?: (file: string) => string;
  }
  export default function initSqlJs(options?: InitOptions): Promise<unknown>;
}
