#!/usr/bin/env node
// Build-time check: developer-only code must not be in production child bundles.
//   npm run check:bundle            exports Android and iOS production bundles (no dev flags)
//   npm run check:bundle -- <dir>   checks an existing export directory instead
// Fails if any marker string from the developer tools or the Device Lab is found. As a sanity
// check it also confirms the markers ARE found in the web playtest export (dist-web) when present,
// so a renamed marker cannot make this check pass silently.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const MARKERS = [
  'kothari-devtools-bundle-marker', // src/devtools/DevToolsShell.tsx
  'Developer tools only act on test learners', // src/runtime/devSeed.ts
  'UI thread frames per second', // src/dev/device-lab/DeviceLabScreen.tsx
];

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.(js|hbc|bundle)$/.test(d.name) ? [path.join(dir, d.name)] : []));
}
function found(dir) {
  const hits = new Set();
  for (const f of files(dir)) {
    const text = fs.readFileSync(f).toString('latin1');
    for (const m of MARKERS) if (text.includes(m)) hits.add(m);
  }
  return [...hits];
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  const env = { ...process.env };
  for (const k of ['EXPO_PUBLIC_DEV_TOOLS', 'EXPO_PUBLIC_DEVICE_LAB', 'EXPO_PUBLIC_PLAYTEST']) delete env[k];
  for (const platform of ['android', 'ios']) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), `bundle-${platform}-`));
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const r = spawnSync(npx, ['expo', 'export', '--platform', platform, '--output-dir', out], { cwd: root, env, stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
    if (r.status !== 0) process.exit(r.status ?? 1);
    dirs.push(out);
  }
}

let bad = false;
for (const dir of dirs) {
  const hits = found(dir);
  console.log(`${hits.length ? 'FAIL' : 'ok  '} ${dir}${hits.length ? `: contains ${hits.join(', ')}` : ': no developer-only code'}`);
  bad ||= hits.length > 0;
}
const web = path.join(root, 'dist-web');
if (fs.existsSync(web)) {
  const hits = found(web);
  const missing = MARKERS.filter((m) => !hits.includes(m));
  console.log(`${missing.length ? 'FAIL' : 'ok  '} dist-web (playtest build) ${missing.length ? `is missing markers: ${missing.join(', ')}` : 'contains the developer tools, as intended'}`);
  bad ||= missing.length > 0;
}
process.exit(bad ? 1 : 0);
