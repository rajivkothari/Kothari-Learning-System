/**
 * @jest-environment node
 */
/// <reference types="node" />
// Belt and braces for the ESLint rules: the Device Lab must stay removable and
// must never import the learning engine, and layout math must stay framework-free.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

function importsOf(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const specs = [...src.matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]!);
  return specs;
}

describe('architecture boundaries', () => {
  it('Device Lab never imports the learning engine', () => {
    const offenders = sourceFiles(path.join(ROOT, 'src/dev')).flatMap((f) =>
      importsOf(f)
        .filter((s) => /(^|\/)engine(\/|$)/.test(s))
        .map((s) => `${path.relative(ROOT, f)} -> ${s}`),
    );
    expect(offenders).toEqual([]);
  });

  it('nothing outside App.tsx imports the Device Lab', () => {
    const files = sourceFiles(path.join(ROOT, 'src')).filter((f) => !f.includes(`${path.sep}dev${path.sep}`));
    const offenders = files.flatMap((f) =>
      importsOf(f)
        .filter((s) => s.includes('device-lab'))
        .map((s) => `${path.relative(ROOT, f)} -> ${s}`),
    );
    expect(offenders).toEqual([]);
  });

  it('layout math and engine code import no UI framework', () => {
    const files = [...sourceFiles(path.join(ROOT, 'src/presentation/layout')), ...sourceFiles(path.join(ROOT, 'src/engine'))];
    const framework = /^(react|react-native|expo|@shopify\/react-native-skia|react-native-|@expo\/|expo-)/;
    const offenders = files.flatMap((f) =>
      importsOf(f)
        .filter((s) => framework.test(s))
        .map((s) => `${path.relative(ROOT, f)} -> ${s}`),
    );
    expect(offenders).toEqual([]);
  });
});
