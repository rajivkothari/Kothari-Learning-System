#!/usr/bin/env node
// Run a command with environment variables set, the same way on every shell (POSIX `FOO=1 cmd`
// does not work in Windows cmd or PowerShell). No dependency.
//
//   node scripts/run-with-env.js NAME=value [NAME=value ...] -- <command> [args ...]
//
// Used by package.json scripts. Inside `npm run`, node_modules/.bin is on PATH, so <command> can
// be a local tool (jest, expo). Exits with the command's exit code.
const { spawnSync } = require('node:child_process');

const argv = process.argv.slice(2);
const split = argv.indexOf('--');
if (split < 1 || split === argv.length - 1) {
  console.error('usage: node scripts/run-with-env.js NAME=value [...] -- <command> [args ...]');
  process.exit(2);
}
const env = { ...process.env };
for (const pair of argv.slice(0, split)) {
  const eq = pair.indexOf('=');
  if (eq < 1) {
    console.error(`run-with-env: expected NAME=value, got "${pair}"`);
    process.exit(2);
  }
  env[pair.slice(0, eq)] = pair.slice(eq + 1);
}
const [command, ...args] = argv.slice(split + 1);
// Windows resolves npm's .cmd shims only through a shell.
const r = spawnSync(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
if (r.error) {
  console.error(`run-with-env: ${r.error.message}`);
  process.exit(1);
}
process.exit(r.status ?? 1);
