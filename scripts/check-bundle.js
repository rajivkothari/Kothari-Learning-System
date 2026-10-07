#!/usr/bin/env node
// Build-time check: developer-only code must not be in production child bundles.
//   npm run check:bundle            exports Android and iOS production bundles (no dev flags)
//   npm run check:bundle -- <dir>   checks an existing export directory instead
// Fails if any marker string from the developer tools or the Device Lab is found. As a sanity
// check it also confirms the markers ARE found in the web playtest export (dist-web) when present,
// so a renamed marker cannot make this check pass silently.
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const MARKERS = [
  'kothari-devtools-bundle-marker', // src/devtools/DevToolsShell.tsx
  'Developer tools only act on test learners', // src/runtime/devSeed.ts
  'UI thread frames per second', // src/dev/device-lab/DeviceLabScreen.tsx
  'assets/dev/art/', // development calibration art (src/devtools/artCalibrationSources.ts)
];

// Production art that is not approved (pending or rejected in rights.json) must never be bundled for
// production: it is required only from the developer tools' review list. Metro names every exported
// asset file by the MD5 of its contents (native: assets/<md5>, web: <name>.<md5>.<ext>), so a file
// is in an export exactly when its MD5 is in an exported file name.
const artManifest = JSON.parse(fs.readFileSync(path.join(root, 'content/themes/elevator-quest/art/manifest.json'), 'utf8'));
const artRights = JSON.parse(fs.readFileSync(path.join(root, 'content/themes/elevator-quest/art/rights.json'), 'utf8'));
const md5Of = (file) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
const UNAPPROVED_ART = artManifest.assets
  .map((a) => ({ id: a.id, approval: artRights.assets.find((r) => r.asset === a.id)?.approval, md5: md5Of(path.join(root, 'assets/themes/elevator-quest/art', a.file)) }))
  .filter((a) => a.approval !== 'approved');
// A known development-only image (calibration art), so the MD5 pattern is shown to work even when
// no art is pending.
const calibration = JSON.parse(fs.readFileSync(path.join(root, 'assets/dev/art/calibration.json'), 'utf8')).assets[0];
const CONTROL = { id: `calibration ${calibration.id}`, md5: md5Of(path.join(root, 'assets/dev/art', calibration.file)) };
function allNames(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? allNames(path.join(dir, d.name)) : [d.name]));
}
function unapprovedArt(dir) {
  const names = allNames(dir);
  return UNAPPROVED_ART.filter((a) => names.some((n) => n.includes(a.md5))).map((a) => a.id);
}

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
  const art = unapprovedArt(dir);
  console.log(`${art.length ? 'FAIL' : 'ok  '} ${dir}${art.length ? `: contains art not yet approved: ${art.join(', ')}` : `: no unapproved art (${UNAPPROVED_ART.length} pending or rejected)`}`);
  bad ||= art.length > 0;
}
const web = path.join(root, 'dist-web');
if (fs.existsSync(web)) {
  const hits = found(web);
  const missing = MARKERS.filter((m) => !hits.includes(m));
  console.log(`${missing.length ? 'FAIL' : 'ok  '} dist-web (playtest build) ${missing.length ? `is missing markers: ${missing.join(', ')}` : 'contains the developer tools, as intended'}`);
  bad ||= missing.length > 0;
  // Sanity check for the art pattern: the development build carries the calibration art and the
  // pending art (review mode), so the MD5 names are found where they should be.
  const names = allNames(web);
  const inWeb = (a) => names.some((n) => n.includes(a.md5));
  const missingArt = [CONTROL, ...UNAPPROVED_ART.filter((a) => a.approval === 'pending')].filter((a) => !inWeb(a)).map((a) => a.id);
  console.log(`${missingArt.length ? 'FAIL' : 'ok  '} dist-web ${missingArt.length ? `does not show art the pattern should find: ${missingArt.join(', ')}` : 'carries the calibration art and the pending art for review, so the pattern is live'}`);
  bad ||= missingArt.length > 0;
  // Rejected art is required from nowhere, not even the developer tools.
  const rejected = UNAPPROVED_ART.filter((a) => a.approval === 'rejected' && inWeb(a)).map((a) => a.id);
  console.log(`${rejected.length ? 'FAIL' : 'ok  '} dist-web ${rejected.length ? `contains rejected art: ${rejected.join(', ')}` : `carries no rejected art (${UNAPPROVED_ART.filter((a) => a.approval === 'rejected').length} rejected)`}`);
  bad ||= rejected.length > 0;
}
process.exit(bad ? 1 : 0);
