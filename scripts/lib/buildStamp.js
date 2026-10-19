// Build stamp for browser builds: which commit, which channel, when. scripts/web.js passes it to
// Expo as EXPO_PUBLIC_BUILD_* (shown by src/config/buildInfo.ts) and writes it to version.json in
// the export, so a deployed site can be checked from outside the app.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** BUILD_SHA and BUILD_CHANNEL in the environment win (the deploy workflow sets them). */
function buildStamp(root, env = process.env) {
  let sha = env.BUILD_SHA || git(root, ['rev-parse', 'HEAD']) || 'unknown';
  if (!env.BUILD_SHA && sha !== 'unknown' && git(root, ['status', '--porcelain', '--untracked-files=no'])) sha += '-dirty';
  return { sha, channel: env.BUILD_CHANNEL || 'local', time: new Date().toISOString() };
}

function stampEnv(stamp) {
  return { EXPO_PUBLIC_BUILD_SHA: stamp.sha, EXPO_PUBLIC_BUILD_CHANNEL: stamp.channel, EXPO_PUBLIC_BUILD_TIME: stamp.time };
}

// Cloudflare Pages reads _headers from the export's root. Any other static server ignores it.
// index.html and the unhashed files (the two .wasm files, version.json) keep Pages' default
// "max-age=0, must-revalidate" with an ETag, so a new deploy is picked up on the next load.
// Expo's bundles are named by content hash, so they can be cached for good.
const HEADERS = `/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer

/_expo/static/*
  Cache-Control: public, max-age=31536000, immutable

/version.json
  Cache-Control: no-store
`;

function writeSiteFiles(dir, stamp) {
  fs.writeFileSync(path.join(dir, '_headers'), HEADERS);
  fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify(stamp, null, 2) + '\n');
}

module.exports = { buildStamp, stampEnv, writeSiteFiles, HEADERS };
