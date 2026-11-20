#!/usr/bin/env node
// The Word Garden's letter sounds: what exists, an audition page, and the one way a sound becomes a
// production clip (docs/magical-kingdom/WORD_GARDEN.md, DECISIONS.md D188, D204, D205).
//
// Usage: node scripts/letter-sounds.js status
//          every letter sound: its candidates, whether it is approved, how, and whether it plays
//        node scripts/letter-sounds.js page
//          writes letter-sound-audition.html (gitignored) to listen to every candidate side by side
//        node scripts/letter-sounds.js library <dir>
//          <dir> is sounds/en-us/marin of a checkout of Open Letter Sounds (CC0). Each letter's WAV is
//          re-encoded (mp3 128 kbps mono 44.1 kHz, a fixed -4 dB) to
//          word-garden-phonemes-review/library.<letter>.mp3, with the library's licence text beside them
//          and the source, commit and hashes in wordGarden.recordings.json. Nothing in <dir> is executed.
//        node scripts/letter-sounds.js level
//          brings the kingdom-voice takes (sound.<letter>.takeN.mp3) up to about -27 dB mean, the level
//          of the recorded words, with one fixed gain each (no compression)
//        node scripts/letter-sounds.js approve <letter> <takeN|library|file.mp3> --heard|--owner
//          copies the take to word-garden-v1/sound.<letter>.mp3, marks it approved and registers it in
//          src/themes/magical-kingdom/audio/reading.ts. --heard: a person listened to this take and
//          approved it. --owner: the owner said to use it and nobody has listened yet. One of the two is
//          required, and it is written down as it is. Never stores a person's name or a file's old name.
//
// The script cannot hear. It measures and copies; only a person can say a sound is right.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const AUDIO = path.join(ROOT, 'assets', 'themes', 'magical-kingdom', 'audio');
const REVIEW = 'word-garden-phonemes-review';
const PRODUCTION = 'word-garden-v1';
const CHECKLIST = path.join(ROOT, 'content', 'themes', 'magical-kingdom', 'wordGarden.recordings.json');
const SOURCES = path.join(ROOT, 'src', 'themes', 'magical-kingdom', 'audio', 'reading.ts');
const PAGE = path.join(ROOT, 'letter-sound-audition.html');
const LIBRARY = { name: 'Open Letter Sounds', url: 'https://github.com/purplecomputerorg/openlettersounds', folder: 'sounds/en-us/marin', licence: 'CC0-1.0', licenceFile: `${REVIEW}/LICENSE.openlettersounds.txt` };
const LIBRARY_GAIN_DB = -4;
const WORD_LEVEL_DB = -27;
const PEAK_CEILING_DB = -1.5;
const APPROVALS = { heard: 'heard and approved by a person', owner: 'owner instruction, not yet heard by a person' };

const read = () => JSON.parse(fs.readFileSync(CHECKLIST, 'utf8'));
const write = (r) => fs.writeFileSync(CHECKLIST, `${JSON.stringify(r, null, 2)}\n`);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sounds = (r) => r.clips.filter((c) => c.slot.startsWith('sound:'));
const letterOf = (clip) => clip.slot.slice('sound:'.length);
const fail = (message) => { console.error(message); process.exit(1); };

function duration(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  return Math.round(Number(out.trim()) * 1000) / 1000;
}
/** Mean and peak level in dB (ffmpeg volumedetect). */
function levels(file) {
  const { stderr } = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const pick = (name) => Number((stderr.match(new RegExp(`${name}: (-?[0-9.]+) dB`)) ?? [])[1]);
  return { mean: pick('mean_volume'), peak: pick('max_volume') };
}
/** One fixed gain, then mp3 128 kbps mono 44.1 kHz with no encoder or date tags. */
function encode(from, to, gainDb) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', from, '-af', `volume=${gainDb}dB`, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-id3v2_version', '0', to]);
}
const measured = (file, relative) => ({ file: relative, durationSeconds: duration(file), bytes: fs.statSync(file).size, sha256: sha256(file) });

/** The commit a checkout is at, read from its files. No git command runs on a downloaded folder. */
function commitOf(dir) {
  for (let at = path.resolve(dir), i = 0; i < 8; i++, at = path.dirname(at)) {
    const head = path.join(at, '.git', 'HEAD');
    if (!fs.existsSync(head)) continue;
    const text = fs.readFileSync(head, 'utf8').trim();
    if (/^[0-9a-f]{40}$/.test(text)) return text;
    const ref = path.join(at, '.git', text.replace(/^ref: /, ''));
    return fs.existsSync(ref) ? fs.readFileSync(ref, 'utf8').trim() : null;
  }
  return null;
}

function status() {
  const r = read();
  const registered = fs.readFileSync(SOURCES, 'utf8');
  console.log(r.status);
  for (const clip of sounds(r)) {
    const takes = (clip.candidates ?? []).map((c) => path.basename(c.file).replace(/^(sound|library)\.[a-z]\./, (m, kind) => (kind === 'library' ? 'library.' : '')).replace(/\.mp3$/, ''));
    const plays = registered.includes(`'slot:${clip.slot}'`);
    console.log(`${letterOf(clip)}  ${clip.text.padEnd(24)} ${clip.audition.padEnd(9)} ${plays ? 'plays ' : 'silent'}  ${clip.audition === 'approved' ? `${clip.take}: ${clip.approval}` : `candidates: ${takes.join(', ') || 'none'}`}`);
  }
  const approved = sounds(r).filter((c) => c.audition === 'approved');
  console.log(`${approved.length} of ${sounds(r).length} approved, ${approved.filter((c) => c.humanReviewed).length} heard by a person.`);
}

function page() {
  const r = read();
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const rows = sounds(r).map((clip) => {
    const letter = letterOf(clip);
    const takes = (clip.candidates ?? []).map((c) => {
      const take = path.basename(c.file).startsWith('library.') ? 'library' : path.basename(c.file).split('.')[2];
      return `<div class="take"><b>${esc(take)}</b> <audio controls preload="none" src="${esc(path.posix.join('assets/themes/magical-kingdom/audio', c.file))}"></audio> <code>node scripts/letter-sounds.js approve ${letter} ${esc(take)} --heard</code></div>`;
    });
    return `<section><h2>${esc(letter)} <small>${esc(clip.text)}</small></h2><p>${esc(clip.audition)}${clip.approval ? `: ${esc(clip.approval)}` : ''}</p>${takes.join('') || '<p>No take yet.</p>'}</section>`;
  });
  fs.writeFileSync(PAGE, `<!doctype html><meta charset="utf-8"><title>Letter sound audition</title>
<style>body{font:16px/1.4 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#392852}section{border-top:1px solid #DAC49B;padding:.5rem 0}h2{margin:.2rem 0}small{font-weight:400;color:#635376}.take{display:flex;gap:1rem;align-items:center;margin:.3rem 0}code{font-size:13px}</style>
<h1>Letter sound audition</h1>
<p>${esc(r.phonemeReview.rule)}</p>
<p>Listen to each take, then run the command beside the one that is right. Open this file from the repository folder so the sounds load.</p>
${rows.join('\n')}
`);
  console.log(`Wrote ${path.relative(ROOT, PAGE)} (not tracked). Open it in a browser from the repository folder.`);
}

function library(dir) {
  if (!dir || !fs.existsSync(path.join(dir, 'sounds.json'))) fail('library <dir>: <dir> must be sounds/en-us/marin of an Open Letter Sounds checkout (it holds sounds.json).');
  const licence = path.join(dir, '..', '..', 'LICENSE');
  if (!fs.existsSync(licence) || !fs.readFileSync(licence, 'utf8').includes('CC0 1.0 Universal')) fail('library: sounds/LICENSE is missing or is not CC0 1.0. Nothing copied.');
  const commit = commitOf(dir);
  if (!commit) fail('library: cannot tell which commit this checkout is at. Nothing copied.');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'sounds.json'), 'utf8'));
  const r = read();
  fs.copyFileSync(licence, path.join(AUDIO, LIBRARY.licenceFile));
  for (const clip of sounds(r)) {
    const letter = letterOf(clip);
    const entry = index.find((e) => e.letter === letter);
    const wav = path.join(dir, `${letter}.wav`);
    if (!entry || entry.file !== `${letter}.wav` || !fs.existsSync(wav)) fail(`library: no sound for ${letter}.`);
    const relative = `${REVIEW}/library.${letter}.mp3`;
    encode(wav, path.join(AUDIO, relative), LIBRARY_GAIN_DB);
    const candidate = { ...measured(path.join(AUDIO, relative), relative), source: 'library', sourceFile: `${LIBRARY.folder}/${letter}.wav`, sourceSha256: sha256(wav), ipa: entry.ipa, gainDb: LIBRARY_GAIN_DB };
    clip.candidates = [...(clip.candidates ?? []).filter((c) => c.file !== relative), candidate];
  }
  r.phonemeReview.library = {
    ...LIBRARY, commit, added: new Date().toISOString().slice(0, 10), licenceSha256: sha256(path.join(AUDIO, LIBRARY.licenceFile)),
    voice: 'Synthetic (the library says: OpenAI gpt-audio-1.5, voice marin). Only the library\'s sounds/ folder is CC0; its code is MIT and is not used.',
    processing: `Each WAV (16 bit mono 24 kHz) re-encoded to mp3 128 kbps mono 44.1 kHz with a fixed ${LIBRARY_GAIN_DB} dB gain (ffmpeg, no other change).`,
  };
  write(r);
  console.log(`Copied ${sounds(r).length} library sounds at commit ${commit} into ${REVIEW}/. Not playing until approved.`);
}

function level() {
  const r = read();
  let changed = 0;
  for (const clip of sounds(r)) {
    for (const c of clip.candidates ?? []) {
      if (!/\/sound\.[a-z]\.take\d+\.mp3$/.test(c.file)) continue;
      const file = path.join(AUDIO, c.file);
      const before = levels(file);
      const gain = Math.round(Math.min(WORD_LEVEL_DB - before.mean, PEAK_CEILING_DB - before.peak) * 10) / 10;
      if (Math.abs(gain) < 0.5) continue;
      const next = `${file}.leveled.mp3`;
      encode(file, next, gain);
      fs.renameSync(next, file);
      Object.assign(c, measured(file, c.file), { gainDb: Math.round(((c.gainDb ?? 0) + gain) * 10) / 10, meanDb: levels(file).mean });
      changed++;
      console.log(`${c.file}: ${before.mean} dB mean, gain ${gain} dB, now ${c.meanDb} dB`);
    }
  }
  if (changed) {
    r.phonemeReview.leveling = `Kingdom-voice takes brought to about ${WORD_LEVEL_DB} dB mean (ffmpeg volumedetect), the level of the recorded words, each with one fixed gain (gainDb, no compression, peak at most ${PEAK_CEILING_DB} dB), re-encoded mp3 128 kbps mono 44.1 kHz.`;
    write(r);
  }
  console.log(`${changed} take${changed === 1 ? '' : 's'} leveled.`);
}

function approve(letter, take, flags) {
  const how = flags.includes('--heard') === flags.includes('--owner') ? null : flags.includes('--heard') ? 'heard' : 'owner';
  if (!letter || !take || !how) fail('approve <letter> <takeN|library|file.mp3> --heard|--owner  (say exactly one: --heard if a person listened to this take, --owner if the owner said to use it unheard)');
  const r = read();
  const clip = sounds(r).find((c) => letterOf(c) === letter);
  if (!clip) fail(`approve: the Word Garden has no sound for "${letter}".`);
  let from, label;
  if (take === 'library' || /^take\d+$/.test(take)) {
    const relative = take === 'library' ? `${REVIEW}/library.${letter}.mp3` : `${REVIEW}/sound.${letter}.${take}.mp3`;
    const candidate = (clip.candidates ?? []).find((c) => c.file === relative);
    if (!candidate) fail(`approve: ${letter} has no candidate ${take}.`);
    from = path.join(AUDIO, relative);
    if (sha256(from) !== candidate.sha256) fail(`approve: ${relative} is not the file the checklist records.`);
    label = take;
  } else {
    if (!take.endsWith('.mp3') || !fs.existsSync(take)) fail(`approve: ${take} is not a take name or an mp3 file.`);
    from = take;
    label = 'file'; // the file's own name is never stored: it could carry a person's name
  }
  const relative = `${PRODUCTION}/sound.${letter}.mp3`;
  fs.copyFileSync(from, path.join(AUDIO, relative));
  Object.assign(clip, { status: 'recorded', audition: 'approved', approval: APPROVALS[how], humanReviewed: how === 'heard', take: label, approvedOn: new Date().toISOString().slice(0, 10), ...measured(path.join(AUDIO, relative), relative) });
  const all = sounds(r);
  const approved = all.filter((c) => c.audition === 'approved');
  const heard = approved.filter((c) => c.humanReviewed).length;
  r.status = `lines and words recorded; letter sounds: ${approved.length} of ${all.length} approved, ${heard} heard by a person${approved.length - heard ? `, ${approved.length - heard} on the owner's instruction and not yet heard` : ''}`;
  write(r);
  const line = `  'slot:sound:${letter}': require('../../../../assets/themes/magical-kingdom/audio/${relative}'),\n`;
  const source = fs.readFileSync(SOURCES, 'utf8');
  if (!source.includes(`'slot:sound:${letter}'`)) {
    const end = source.lastIndexOf('};');
    if (end < 0) fail('approve: cannot find the end of READING_SOURCES in audio/reading.ts.');
    fs.writeFileSync(SOURCES, source.slice(0, end) + line + source.slice(end));
  }
  console.log(`${letter}: ${label} approved (${APPROVALS[how]}) and registered as slot:sound:${letter}.`);
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'status') status();
else if (command === 'page') page();
else if (command === 'library') library(rest[0]);
else if (command === 'level') level();
else if (command === 'approve') approve(rest[0], rest[1], rest.slice(2));
else fail('Usage: node scripts/letter-sounds.js status | page | library <dir> | level | approve <letter> <takeN|library|file.mp3> --heard|--owner');
