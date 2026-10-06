#!/usr/bin/env node
// Fails if any installed native Android module declares a Google Play Services,
// Firebase, Play Core, Play Billing, or Play Integrity dependency. Fire OS has no
// Google Play Services. Run after adding any native dependency: npm run check:fire
//
// Scope: Gradle files and AndroidManifest.xml of every package with an android/
// folder in node_modules. It cannot see dependencies added later by config plugins
// at prebuild time; `expo prebuild` output is checked separately in the device plan.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const NODE_MODULES = path.join(ROOT, 'node_modules');

const FORBIDDEN = [
  /com\.google\.android\.gms/,
  /play-services-/,
  /com\.google\.firebase/,
  /firebase-/,
  /com\.google\.android\.play:/,
  /billingclient/,
  /play-integrity|playintegrity/i,
  /com\.google\.android\.ump/,
];

function packageDirs() {
  const dirs = [];
  const visit = (dir, depth) => {
    if (depth > 3 || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.bin') continue;
      const full = path.join(dir, entry.name);
      if (entry.name.startsWith('@')) {
        visit(full, depth);
        continue;
      }
      if (fs.existsSync(path.join(full, 'package.json'))) {
        dirs.push(full);
        visit(path.join(full, 'node_modules'), depth + 1);
      }
    }
  };
  visit(NODE_MODULES, 0);
  return dirs;
}

function androidFiles(pkgDir) {
  const androidDir = path.join(pkgDir, 'android');
  if (!fs.existsSync(androidDir)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'build' || entry.name === '.gradle') continue;
        walk(full);
      } else if (/\.(gradle|kts|toml)$/.test(entry.name) || entry.name === 'AndroidManifest.xml') {
        out.push(full);
      }
    }
  };
  walk(androidDir);
  return out;
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

const findings = [];
const natives = [];
for (const dir of packageDirs()) {
  const files = androidFiles(dir);
  if (files.length === 0) continue;
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  natives.push(`${pkg.name}@${pkg.version}`);
  for (const file of files) {
    const text = stripComments(fs.readFileSync(file, 'utf8'));
    text.split('\n').forEach((line, i) => {
      if (FORBIDDEN.some((re) => re.test(line))) {
        findings.push(`${pkg.name}@${pkg.version}: ${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
      }
    });
  }
}

console.log(`Native Android modules scanned (${natives.length}):`);
natives.sort().forEach((n) => console.log(`  ${n}`));
if (findings.length > 0) {
  console.error('\nGoogle Play Services / Firebase references found (Fire OS risk):');
  findings.forEach((f) => console.error(`  ${f}`));
  process.exit(1);
}
console.log('\nNo Google Play Services, Firebase, Play Core, Billing, or Integrity dependencies found.');
