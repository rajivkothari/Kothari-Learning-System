#!/usr/bin/env node
// Browser playtest build (development target; iPad and Fire stay authoritative).
//   node scripts/web.js playtest   dev server with developer tools (http://localhost:8081)
//   node scripts/web.js export     static playtest build in dist-web/ (developer tools included)
// Sets the build flags in a way that also works on Windows, copies the wasm files into
// public/, then runs the Expo CLI. Extra arguments are passed through (e.g. --port 8082).
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const [mode, ...rest] = process.argv.slice(2);
const env = { ...process.env, EXPO_PUBLIC_DEV_TOOLS: '1', EXPO_PUBLIC_PLAYTEST: '1', EXPO_PUBLIC_DEVICE_LAB: '1' };

const prep = spawnSync(process.execPath, [path.join(__dirname, 'prepare-web.js')], { stdio: 'inherit', cwd: root });
if (prep.status !== 0) process.exit(prep.status ?? 1);

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
let args;
if (mode === 'playtest') args = ['expo', 'start', '--web', ...rest];
else if (mode === 'export') args = ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-web', '--clear', ...rest];
else {
  console.error('usage: node scripts/web.js playtest|export [expo args]');
  process.exit(2);
}
const r = spawnSync(npx, args, { stdio: 'inherit', cwd: root, env, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
