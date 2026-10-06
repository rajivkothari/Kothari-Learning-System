/// <reference types="node" />
// The runtime and persistence layers serve every theme. They name none (audit: devSeed used to).
import fs from 'node:fs';
import path from 'node:path';

const THEME_WORDS = /elevator|floor ?15|lifty|magic[- ]tower|\beq\./i;

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'testing' || e.name === 'bench' ? [] : sources(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

it('runtime and persistence production code names no theme', () => {
  const files = [...sources(path.join(__dirname)), ...sources(path.join(__dirname, '../persistence'))];
  expect(files.length).toBeGreaterThan(8);
  expect(files.filter((f) => THEME_WORDS.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
});
