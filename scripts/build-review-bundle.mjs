#!/usr/bin/env node
// Review bundles for external AI reviewers (docs/AI_REVIEW_BUNDLES.md): one or more plain Markdown
// files a reviewer can read top to bottom, with no archive to unpack. Developer tooling only: no
// dependencies, never imported by the app, and it changes nothing in the repository except its
// own output folder (.ai-review/, gitignored).
//
//   node scripts/build-review-bundle.mjs <bundle>                 an area: project, learning-engine, elevator-quest, word-golf
//   node scripts/build-review-bundle.mjs change --base <sha> [--head <sha>]
//   node scripts/build-review-bundle.mjs --list                   the bundles the config defines
//   options: --out <dir>  --max-part-bytes <n>
//
// Every bundle carries the branch, the HEAD (or --head) SHA, the time it was made, a manifest of the
// files in it, and each file under a "FILE: <path>" line. Only git-tracked text files are read, so
// dependencies, builds and screenshots never enter; the config's exclude list removes the rest of
// the noise (art and audio, lockfiles, generated manifests, private/). An area bundle reads the
// working tree and says when it has uncommitted changes; a change bundle reads git's objects, so it
// shows exactly <base>..<head>.
//
// Cross-platform: git runs through execFile (no shell), repository paths stay forward-slashed and
// are joined with path.join only to touch the disk, and line endings are written as \n.
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = 'scripts/review-bundles.json';
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, ...CONFIG_PATH.split('/')), 'utf8'));
const GENERATOR = 'scripts/build-review-bundle.mjs';

// ---------- git ----------

const run = (args, encoding = 'utf8') => execFileSync('git', args, { cwd: ROOT, encoding, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const lines = (s) => s.split(/\r?\n/).filter(Boolean);

function gitInfo(head) {
  const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const sha = run(['rev-parse', head]).trim();
  const dirty = lines(run(['status', '--porcelain'])).length;
  return { branch, sha, dirty };
}

// ---------- selection ----------

/** A glob (* within a folder, ** at any depth, ? one character) as a regular expression on repository paths. */
function globRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/';
      re += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
const matcher = (globs = []) => {
  const res = globs.map(globRegex);
  return (p) => res.some((r) => r.test(p));
};
const globalExclude = matcher(CONFIG.exclude);
const textExt = new Set(CONFIG.textExtensions);
const extOf = (p) => (p.includes('.') ? p.slice(p.lastIndexOf('.')).toLowerCase() : '');

/** Why a file is left out, or null when it goes in. */
function skipReason(p, buf) {
  if (!textExt.has(extOf(p))) return 'not a text type';
  if (buf.includes(0)) return 'binary content';
  if (buf.length > CONFIG.maxFileBytes) return `larger than ${CONFIG.maxFileBytes} bytes`;
  return null;
}

function kindOf(p) {
  if (CONFIG.rules.includes(p)) return 'rules';
  if (new RegExp(CONFIG.change.testPattern).test(p)) return 'test';
  if (p.startsWith('docs/') || p.endsWith('.md')) return 'doc';
  if (p.startsWith('content/')) return 'content';
  if (p.startsWith('src/') || p.startsWith('scripts/')) return 'source';
  return 'config';
}

// ---------- extracts (a section of a long doc) ----------

/** The lines from a heading to the next heading of the same or a higher level. */
function sectionOf(text, heading) {
  const all = text.split('\n');
  const start = all.findIndex((l) => l.trim() === heading.trim() || l.startsWith(`${heading} `) || l.startsWith(`${heading}(`));
  if (start < 0) return null;
  const level = heading.match(/^#+/)?.[0].length ?? 2;
  let end = all.length;
  for (let i = start + 1; i < all.length; i++) {
    const m = all[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return all.slice(start, end).join('\n').trimEnd();
}

/** The paragraphs (blank-line separated) that start with a pattern. */
function paragraphsOf(text, pattern) {
  const re = new RegExp(pattern);
  return text
    .split(/\n\s*\n/)
    .filter((para) => re.test(para.trimStart()))
    .join('\n\n');
}

// ---------- the document ----------

const LANG = { '.ts': 'ts', '.tsx': 'tsx', '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.json': 'json', '.md': 'markdown', '.yml': 'yaml', '.yaml': 'yaml', '.css': 'css', '.html': 'html', '.sql': 'sql', '.sh': 'sh' };

/** A fence longer than any run of backticks in the text, so no file can close it early. */
function fenceFor(text) {
  let longest = 0;
  for (const m of text.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

const countLines = (t) => (t.length === 0 ? 0 : t.split('\n').length);

/** One entry: a file (or a diff, or an extract) as it goes into the bundle. */
function entry(p, text, kind, note = null) {
  const body = text.replace(/\r\n?/g, '\n');
  return { path: p, kind, note, text: body, bytes: Buffer.byteLength(body, 'utf8'), lines: countLines(body) };
}

function section(e) {
  const fence = fenceFor(e.text);
  const lang = e.kind === 'diff' ? 'diff' : e.kind === 'extract' ? 'markdown' : (LANG[extOf(e.path)] ?? 'text');
  const meta = `kind: ${e.kind}, ${e.lines} lines, ${e.bytes} bytes${e.note ? `, ${e.note}` : ''}`;
  return `\n---\n\nFILE: ${e.path}\n(${meta})\n\n${fence}${lang}\n${e.text}${e.text.endsWith('\n') ? '' : '\n'}${fence}\n\nEND FILE: ${e.path}\n`;
}

const mdCell = (s) => String(s).replace(/\|/g, '\\|');

function header({ name, description, info, generated, entries, skipped, parts, extra = [] }) {
  const total = entries.reduce((n, e) => n + e.bytes, 0);
  const rows = [
    ['Bundle', name],
    ['Description', description],
    ['Branch', info.branch],
    ['SHA', info.sha],
    ...extra,
    ['Working tree', info.dirty === 0 ? 'clean' : `${info.dirty} uncommitted change(s) at generation time${name === 'change' ? ' (not part of this bundle: it reads git objects)' : ' (this bundle reads the working tree)'}`],
    ['Generated', generated],
    ['Generator', `${GENERATOR} (config ${CONFIG_PATH})`],
    ['Files', `${entries.length} (${total} bytes of text)`],
    ['Parts', String(parts)],
  ];
  const out = [
    `# AI review bundle: ${name}`,
    '',
    '| Field | Value |',
    '|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${mdCell(v)} |`),
    '',
    '## How to read this bundle',
    '',
    '- Plain Markdown, no archive. Every file starts with a line `FILE: <path>`, then a line with its kind, line count and size, then its full text in a fenced block, and ends with `END FILE: <path>`.',
    '- Paths are repository paths. A path in [brackets] is not a file in the repository: it is generated for this bundle (a git diff, or an extract of a longer document).',
    '- Kinds: rules (permanent project rules: read first), source, test, content (data the app ships), doc, config, diff, extract.',
    '- Binary files, dependencies, builds, lockfiles, screenshots, audio and generated manifests are never included; files the bundle asked for but left out are listed under "Left out" with the reason.',
    parts > 1 ? `- This bundle is split into ${parts} parts (files are never split). The manifest below says which part holds each file.` : '- This bundle is one file.',
    '',
    '## Manifest',
    '',
    '| # | Path | Kind | Lines | Bytes | Part |',
    '|---|---|---|---|---|---|',
    ...entries.map((e, i) => `| ${i + 1} | ${mdCell(e.path)} | ${e.kind} | ${e.lines} | ${e.bytes} | ${e.part} |`),
    '',
  ];
  if (skipped.length) out.push('## Left out', '', '| Path | Reason |', '|---|---|', ...skipped.map((s) => `| ${mdCell(s.path)} | ${s.reason} |`), '');
  return out.join('\n');
}

/** Split the entries into parts of at most maxPartBytes (a file is never split), and write them. */
function write({ name, slug, description, info, entries, skipped, extra, outDir, maxPartBytes }) {
  const generated = new Date().toISOString();
  const parts = [];
  let current = [];
  let size = 0;
  for (const e of entries) {
    const s = Buffer.byteLength(section(e), 'utf8');
    if (current.length && size + s > maxPartBytes) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(e);
    size += s;
  }
  if (current.length) parts.push(current);
  parts.forEach((p, i) => p.forEach((e) => (e.part = i + 1)));

  const dir = path.resolve(ROOT, outDir);
  fs.mkdirSync(dir, { recursive: true });
  // A bundle's earlier parts go first, so a shorter run never leaves stale parts behind.
  for (const f of fs.readdirSync(dir)) if (f === `${slug}.md` || (f.startsWith(`${slug}.part`) && f.endsWith('.md'))) fs.rmSync(path.join(dir, f));

  const files = [];
  parts.forEach((p, i) => {
    const file = parts.length === 1 ? `${slug}.md` : `${slug}.part${i + 1}-of-${parts.length}.md`;
    const top =
      i === 0
        ? header({ name, description, info, generated, entries, skipped, parts: parts.length, extra })
        : [`# AI review bundle: ${name} (part ${i + 1} of ${parts.length})`, '', `Branch ${info.branch}, SHA ${info.sha}, generated ${generated}. The manifest is in part 1.`, '', `Files in this part: ${p.length}.`, ''].join('\n');
    const text = `${top}${p.map(section).join('')}\n`;
    fs.writeFileSync(path.join(dir, file), text, 'utf8');
    files.push({ file: path.relative(ROOT, path.join(dir, file)).split(path.sep).join('/'), bytes: Buffer.byteLength(text, 'utf8'), count: p.length });
  });
  return files;
}

// ---------- area bundles ----------

function areaBundle(name, opts) {
  const def = CONFIG.bundles[name];
  const info = gitInfo('HEAD');
  const include = matcher(def.include);
  const exclude = matcher(def.exclude);
  const tracked = lines(run(['ls-files', '-z']).replace(/\0/g, '\n'));
  const order = (p) => {
    // Rules first, then the include list's order, then path order.
    const r = CONFIG.rules.indexOf(p);
    if (r >= 0) return r;
    const i = def.include.findIndex((g) => globRegex(g).test(p));
    return 100 + i;
  };
  const picked = tracked.filter((p) => include(p) && !exclude(p) && !globalExclude(p)).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  const entries = [];
  const skipped = [];
  for (const p of picked) {
    const buf = fs.readFileSync(path.join(ROOT, ...p.split('/')));
    const why = skipReason(p, buf);
    if (why) skipped.push({ path: p, reason: why });
    else entries.push(entry(p, buf.toString('utf8'), kindOf(p)));
  }
  for (const x of def.extracts ?? []) {
    const text = fs.readFileSync(path.join(ROOT, ...x.path.split('/')), 'utf8').replace(/\r\n?/g, '\n');
    const body = x.heading ? sectionOf(text, x.heading) : paragraphsOf(text, x.paragraphs);
    if (body) entries.push(entry(`[extract] ${x.path}: ${x.heading ?? x.paragraphs}`, body, 'extract', x.title));
    else skipped.push({ path: x.path, reason: `extract "${x.heading ?? x.paragraphs}" found nothing` });
  }
  return write({ name, slug: name, description: def.description, info, entries, skipped, outDir: opts.out, maxPartBytes: opts.maxPartBytes });
}

// ---------- change bundles ----------

const showAt = (rev, p) => run(['show', `${rev}:${p}`], 'buffer');
const stemOf = (p) => p.slice(p.lastIndexOf('/') + 1).replace(/(\.test)?\.[^.]+$/, '');
const noExt = (p) => p.replace(/\.(ts|tsx|js|mjs|cjs|json)$/, '');

/** The tests at <head> that are about the changed files: same name, or importing them by relative path. */
function relevantTests(head, changed, already) {
  const testRe = new RegExp(CONFIG.change.testPattern);
  const sources = changed.filter((p) => !testRe.test(p) && /\.(ts|tsx|js|mjs|cjs|json)$/.test(p));
  if (!sources.length) return [];
  const targets = new Set(sources.map(noExt));
  const stems = new Set(sources.map(stemOf));
  const tests = lines(run(['ls-tree', '-r', '--name-only', head])).filter((p) => testRe.test(p) && !already.has(p) && !globalExclude(p));
  const scored = [];
  for (const t of tests) {
    const dir = t.slice(0, t.lastIndexOf('/') + 1);
    let score = stems.has(stemOf(t)) ? 2 : 0;
    if (!score) {
      const text = showAt(head, t).toString('utf8');
      for (const m of text.matchAll(/(?:from|import|require\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const resolved = path.posix.normalize(path.posix.join(dir, m[1]));
        if (targets.has(noExt(resolved)) || targets.has(`${resolved}/index`)) {
          score = 1;
          break;
        }
      }
    }
    if (score) scored.push({ path: t, score, near: sources.some((s) => s.slice(0, s.lastIndexOf('/')) === t.slice(0, t.lastIndexOf('/'))) });
  }
  scored.sort((a, b) => b.score - a.score || Number(b.near) - Number(a.near) || a.path.localeCompare(b.path));
  return scored.slice(0, CONFIG.change.maxTests).map((s) => s.path);
}

function changeBundle(opts) {
  if (!opts.base) throw new Error('change needs --base <sha> (and optionally --head <sha>, default HEAD)');
  const head = opts.head ?? 'HEAD';
  const info = gitInfo(head);
  const base = run(['rev-parse', opts.base]).trim();
  const range = `${base.slice(0, 7)}..${info.sha.slice(0, 7)}`;
  const status = lines(run(['diff', '--name-status', '--no-renames', base, info.sha]));
  const changed = [];
  const deleted = [];
  for (const l of status) {
    const [code, p] = l.split('\t');
    if (code === 'D') deleted.push(p);
    else changed.push(p);
  }
  const commits = run(['log', '--no-color', '--format=%h %ad %s', '--date=short', `${base}..${info.sha}`]).trim();
  const stat = run(['diff', '--no-color', '--stat=200', base, info.sha]).trim();
  // The text diff only: binary files show as one line, excluded paths not at all.
  const diffPaths = changed.concat(deleted).filter((p) => !globalExclude(p) && textExt.has(extOf(p)));
  const diff = diffPaths.length ? run(['diff', '--no-color', '--no-ext-diff', '--find-renames', base, info.sha, '--', ...diffPaths]) : '';

  const entries = [];
  const skipped = [];
  const summary = [`Range: ${base} .. ${info.sha}`, '', 'Commits:', commits || '(none)', '', 'Diff stat (all files, including those left out below):', stat || '(none)', '', deleted.length ? `Deleted: ${deleted.join(', ')}` : 'Deleted: none'].join('\n');
  entries.push(entry(`[change summary] ${range}`, summary, 'diff', 'commits and diff stat'));
  entries.push(entry(`[git diff] ${range}`, diff || '(no text changes)', 'diff', 'text files only; binary and excluded files are in the stat above'));

  const seen = new Set();
  for (const p of CONFIG.rules) {
    entries.push(entry(p, showAt(info.sha, p).toString('utf8'), 'rules'));
    seen.add(p);
  }
  for (const p of changed) {
    if (seen.has(p)) continue;
    if (globalExclude(p)) {
      skipped.push({ path: p, reason: 'excluded by the config (asset, lockfile, generated or private)' });
      continue;
    }
    const buf = showAt(info.sha, p);
    const why = skipReason(p, buf) ?? (kindOf(p) === 'doc' && buf.length > CONFIG.change.fullDocMaxBytes ? `a long doc (${buf.length} bytes): its changes are in the git diff above` : null);
    if (why) skipped.push({ path: p, reason: why });
    else entries.push(entry(p, buf.toString('utf8'), kindOf(p), 'changed (full text at head)'));
    seen.add(p);
  }
  for (const t of relevantTests(info.sha, changed, seen)) {
    const buf = showAt(info.sha, t);
    const why = skipReason(t, buf);
    if (why) skipped.push({ path: t, reason: why });
    else entries.push(entry(t, buf.toString('utf8'), 'test', 'unchanged, tests a changed file'));
  }
  const description = `A change review: the commits and git diff from ${base.slice(0, 12)} to ${info.sha.slice(0, 12)}, every changed text file in full as it is at the head, the project rules, and the unchanged tests that cover the changed files (same name, or importing them).`;
  return write({ name: 'change', slug: `change-${range.replace('..', '_')}`, description, info, entries, skipped, extra: [['Base', base]], outDir: opts.out, maxPartBytes: opts.maxPartBytes });
}

// ---------- command line ----------

function parse(argv) {
  const opts = { out: CONFIG.outputDir, maxPartBytes: CONFIG.maxPartBytes, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--base') opts.base = value();
    else if (a === '--head') opts.head = value();
    else if (a === '--out') opts.out = value();
    else if (a === '--max-part-bytes') opts.maxPartBytes = Number(value());
    else if (a === '--list') opts.list = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else opts.positional.push(a);
  }
  return opts;
}

const USAGE = `Usage:
  node ${GENERATOR} <bundle>                       (${Object.keys(CONFIG.bundles).join(', ')})
  node ${GENERATOR} change --base <sha> [--head <sha>]
  node ${GENERATOR} --list
Options: --out <dir> (default ${CONFIG.outputDir}), --max-part-bytes <n> (default ${CONFIG.maxPartBytes})`;

function main() {
  const opts = parse(process.argv.slice(2));
  const name = opts.positional[0];
  if (opts.help || (!name && !opts.list)) {
    console.log(USAGE);
    return;
  }
  if (opts.list) {
    for (const [k, v] of Object.entries(CONFIG.bundles)) console.log(`${k.padEnd(16)} ${v.description}`);
    console.log(`${'change'.padEnd(16)} --base <sha> [--head <sha>]: a change review (diff, changed files, rules, relevant tests)`);
    return;
  }
  if (!Number.isFinite(opts.maxPartBytes) || opts.maxPartBytes < 10000) throw new Error('--max-part-bytes must be a number of at least 10000');
  let files;
  if (name === 'change') files = changeBundle(opts);
  else if (CONFIG.bundles[name]) files = areaBundle(name, opts);
  else throw new Error(`unknown bundle "${name}"\n${USAGE}`);
  const total = files.reduce((n, f) => n + f.bytes, 0);
  const count = files.reduce((n, f) => n + f.count, 0);
  for (const f of files) console.log(`${f.file}  ${f.count} files, ${f.bytes} bytes`);
  console.log(`${name}: ${count} files in ${files.length} part(s), ${total} bytes in all`);
}

try {
  main();
} catch (e) {
  console.error(`build-review-bundle: ${e.message}`);
  process.exitCode = 1;
}
