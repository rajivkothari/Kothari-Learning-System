/// <reference types="node" />
// Guards the engine boundary (backs up the ESLint rules):
// - production engine files import only relative modules and "zod"
// - no clock, ambient randomness, network, storage, or platform globals
// - no theme or setting vocabulary: educational semantics only (real learner names never appear in tracked files at all)
import fs from 'node:fs';
import path from 'node:path';

const ENGINE = __dirname;

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return files(full);
    return /\.ts$/.test(e.name) ? [full] : [];
  });
}

const all = files(ENGINE);
const production = all.filter((f) => !/\.test\.ts$/.test(f) && !f.includes(`${path.sep}testing${path.sep}`));
const rel = (f: string) => path.relative(ENGINE, f);
/** Source with comments removed, so prose like "never uses Math.random" is not a violation. */
const code = (f: string) =>
  fs
    .readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const imports = (src: string) => [...src.matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]!);

describe('engine purity', () => {
  it('production files import only relative engine modules and zod', () => {
    const bad = production.flatMap((f) =>
      imports(fs.readFileSync(f, 'utf8'))
        .filter((s) => !(s === 'zod' || s.startsWith('./') || s.startsWith('../')))
        .map((s) => `${rel(f)} -> ${s}`),
    );
    expect(bad).toEqual([]);
  });

  it('relative imports never leave src/engine', () => {
    const bad = all.flatMap((f) =>
      imports(fs.readFileSync(f, 'utf8'))
        .filter((s) => s.startsWith('.'))
        .map((s) => path.resolve(path.dirname(f), s))
        .filter((target) => !target.startsWith(ENGINE) && !target.includes(`${path.sep}content${path.sep}`))
        .map((t) => `${rel(f)} -> ${t}`),
    );
    expect(bad).toEqual([]);
  });

  it('uses no clock, ambient randomness, network, or storage', () => {
    const banned = /\bDate\.now\b|new Date\(\s*\)|\bMath\.random\b|\bperformance\.now\b|\bfetch\(|XMLHttpRequest|WebSocket|localStorage|AsyncStorage|\bprocess\.env\b/;
    const bad = production.filter((f) => banned.test(code(f))).map(rel);
    expect(bad).toEqual([]);
  });

  it('knows no theme or setting vocabulary', () => {
    const themeWords = /elevator|(?<!Math\.)\bfloors?\b|castle|princess|robot|tower|dragon|puppy|mermaid/i;
    // Comments included: theme words should not appear anywhere in the engine. This file is excluded (it holds the list).
    const offenders = all.filter((f) => f !== __filename && themeWords.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
    const pack = fs.readFileSync(path.join(ENGINE, '../../content/fixtures/sample-pack.json'), 'utf8');
    expect(themeWords.test(pack)).toBe(false);
  });
});
