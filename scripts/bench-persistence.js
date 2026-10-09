#!/usr/bin/env node
/* global __dirname */
// Persistence benchmark on a twelve-month learner history (src/runtime/bench/persistence.bench.ts).
//
//   node scripts/bench-persistence.js [--root <repo checkout>] [--out <dir>] [--tag <name>] [--days 365] [--runs 3]
//
// --root measures another checkout of this repository (for example a frozen baseline worktree) with
// this checkout's workload and reporting; the default is this checkout. Results: <out>/<tag>.md and
// <out>/<tag>.json. Environment is set here, not with shell syntax, so the command is the same on
// every shell. Timing numbers are this machine's (V8, node:sqlite, sql.js in Node), not a tablet's.
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const env = {
  ...process.env,
  BENCH: '1',
  BENCH_ROOT: path.resolve(opt('root', repo)),
  BENCH_OUT: path.resolve(opt('out', path.join(os.tmpdir(), 'bench-persistence'))),
  BENCH_TAG: opt('tag', 'run'),
  BENCH_DAYS: opt('days', '365'),
  BENCH_RUNS: opt('runs', '3'),
};

const jest = require.resolve('jest/bin/jest', { paths: [repo] });
const r = spawnSync(process.execPath, [jest, '--config', path.join(repo, 'jest.config.js'), '--selectProjects', 'bench', '--verbose=false', path.join(repo, 'src/runtime/bench/persistence.bench.ts')], {
  cwd: repo,
  env,
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
