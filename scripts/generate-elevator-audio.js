#!/usr/bin/env node
// Generates the PROTOTYPE elevator sound set for Elevator Quest.
//
// Every file is synthesized procedurally from oscillators and seeded noise in this script.
// No recordings, no downloaded samples. These are placeholders meant to be mechanically
// plausible, NOT authentic recordings, and every asset is marked "replace" in the manifest.
//
// Usage: node scripts/generate-elevator-audio.js            the prototype WAVs, their manifest entries, and the require lists
//        node scripts/generate-elevator-audio.js --sources  only the require lists (after a pack's status changes)
// Output: assets/themes/elevator-quest/audio/*.wav (16-bit mono PCM, 22050 Hz) + manifest.json (the
// "prototype" pack; every other pack and asset in the manifest is kept as it is), and the two
// require lists generated from the manifest: approved packs in src/themes/elevator-quest/audio/assets.ts
// (production), pending packs in src/devtools/audioReviewSources.ts (browser playtest build only).
// Rejected packs are required from nowhere.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RATE = 22050;
const OUT = path.join(__dirname, '..', 'assets', 'themes', 'elevator-quest', 'audio');

// ---------- primitives ----------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buffer = (seconds) => new Float64Array(Math.round(seconds * RATE));

function noise(n, seed) {
  const r = rng(seed);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

/** One-pole low-pass. */
function lowpass(x, cutoff) {
  const a = Math.exp((-2 * Math.PI * cutoff) / RATE);
  const y = new Float64Array(x.length);
  let prev = 0;
  for (let i = 0; i < x.length; i++) prev = y[i] = (1 - a) * x[i] + a * prev;
  return y;
}

/** Steeper low-pass: cascaded one-pole stages. */
function lowpassN(x, cutoff, stages = 4) {
  let y = x;
  for (let i = 0; i < stages; i++) y = lowpass(y, cutoff);
  return y;
}

/** RBJ band-pass (constant peak gain). */
function bandpass(x, freq, q) {
  const w = (2 * Math.PI * freq) / RATE;
  const alpha = Math.sin(w) / (2 * q);
  const b0 = alpha;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w);
  const a2 = 1 - alpha;
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

function add(target, src, gain = 1, offsetSeconds = 0) {
  const off = Math.round(offsetSeconds * RATE);
  for (let i = 0; i < src.length && i + off < target.length; i++) if (i + off >= 0) target[i + off] += src[i] * gain;
  return target;
}

/** Sine with a frequency function f(t) and amplitude envelope env(t). Phase-continuous. */
function tone(seconds, f, env) {
  const out = buffer(seconds);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * f(t)) / RATE;
    out[i] = Math.sin(phase) * env(t);
  }
  return out;
}

const expDecay = (tau) => (t) => Math.exp(-t / tau);
const attackDecay = (attack, tau) => (t) => (t < attack ? t / attack : Math.exp(-(t - attack) / tau));

function envelope(x, env) {
  for (let i = 0; i < x.length; i++) x[i] *= env(i / RATE);
  return x;
}

/** Short fades at both ends so one-shots never click. */
function edges(x, inMs = 2, outMs = 8) {
  const a = Math.round((inMs / 1000) * RATE);
  const b = Math.round((outMs / 1000) * RATE);
  for (let i = 0; i < a && i < x.length; i++) x[i] *= i / a;
  for (let i = 0; i < b && i < x.length; i++) x[x.length - 1 - i] *= i / b;
  return x;
}

/** Make a loop seamless by crossfading its tail into its head. */
function seamless(x, fadeSeconds) {
  const n = Math.round(fadeSeconds * RATE);
  const out = x.slice(0, x.length - n);
  for (let i = 0; i < n; i++) {
    const w = i / n;
    out[i] = out[i] * w + x[x.length - n + i] * (1 - w);
  }
  return out;
}

function normalize(x, peakDb) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const target = Math.pow(10, peakDb / 20);
  const g = peak > 0 ? target / peak : 0;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

function wav(x) {
  const data = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

// ---------- sounds ----------

/** A mechanical contact: a damped resonant tick plus a tiny body thump. */
function contact(seed, freq, seconds = 0.04) {
  const n = buffer(seconds);
  const tick = envelope(bandpass(noise(n.length, seed), freq, 6), expDecay(0.004));
  const body = tone(seconds, () => 180, expDecay(0.008));
  return add(add(n, tick, 1.0), body, 0.35);
}

const SOUNDS = {
  'button-click': {
    purpose: 'Floor and door button: mechanical press, then a softer release.',
    make: () => {
      const x = buffer(0.09);
      add(x, contact(11, 2600), 1);
      add(x, contact(12, 3100, 0.03), 0.45, 0.045);
      return normalize(edges(x, 0.5, 6), -4);
    },
  },
  'button-confirm': {
    purpose: 'Call registered: a short, quiet confirmation tone as the button lights.',
    make: () => normalize(edges(add(tone(0.16, () => 1175, attackDecay(0.004, 0.05)), tone(0.16, () => 2350, attackDecay(0.004, 0.03)), 0.15)), -14),
  },
  'door-motor-loop': {
    purpose: 'Door operator motor while the doors move (loop).',
    loop: true,
    make: () => {
      const s = 1.05;
      const hum = add(tone(s, () => 100, () => 1), tone(s, () => 200, () => 1), 0.4);
      const whir = lowpassN(bandpass(noise(hum.length, 21), 520, 3), 1100);
      const x = add(add(buffer(s), hum, 0.5), whir, 0.6);
      return normalize(seamless(x, 0.05), -10);
    },
  },
  'door-thud': {
    purpose: 'Doors meet and seal.',
    make: () => {
      const x = buffer(0.35);
      add(x, tone(0.35, (t) => 75 - 20 * t, expDecay(0.06)), 1);
      add(x, envelope(lowpass(noise(x.length, 31), 700), expDecay(0.03)), 0.6);
      add(x, contact(32, 1800, 0.03), 0.25, 0.005);
      return normalize(edges(x), -6);
    },
  },
  'door-settle': {
    purpose: 'Doors reach fully open and settle.',
    make: () => {
      const x = buffer(0.25);
      add(x, tone(0.25, () => 120, expDecay(0.04)), 0.8);
      add(x, envelope(lowpass(noise(x.length, 41), 1200), expDecay(0.02)), 0.4);
      return normalize(edges(x), -12);
    },
  },
  'motor-start': {
    purpose: 'Brake releases, motor engages and spins up.',
    make: () => {
      const s = 0.8;
      const x = buffer(s);
      add(x, contact(51, 1400, 0.05), 0.8);
      add(x, tone(s, (t) => 45 + 70 * Math.min(1, t / 0.7), (t) => Math.min(1, t / 0.5) * 0.9), 0.7, 0.05);
      add(x, tone(s, (t) => 90 + 140 * Math.min(1, t / 0.7), (t) => Math.min(1, t / 0.6) * 0.4), 0.4, 0.05);
      return normalize(edges(x, 1, 60), -8);
    },
  },
  'travel-loop': {
    purpose: 'Car moving through the shaft: motor hum, air, faint rail rumble (loop).',
    loop: true,
    make: () => {
      const s = 2.05;
      const x = buffer(s);
      add(x, tone(s, () => 110, () => 1), 0.45);
      add(x, tone(s, () => 220, () => 1), 0.18);
      add(x, tone(s, () => 330, () => 1), 0.07);
      add(x, lowpassN(noise(x.length, 61), 220), 3.5);
      add(x, lowpassN(bandpass(noise(x.length, 62), 1400, 1.5), 2200, 2), 0.04);
      return normalize(seamless(x, 0.05), -12);
    },
  },
  'motor-slow': {
    purpose: 'Motor winding down as the car approaches the floor.',
    make: () => {
      const s = 1.0;
      const x = buffer(s);
      add(x, tone(s, (t) => 110 - 60 * t, (t) => 1 - t), 0.6);
      add(x, tone(s, (t) => 220 - 120 * t, (t) => (1 - t) * 0.5), 0.3);
      add(x, envelope(lowpassN(noise(x.length, 71), 200), (t) => 1 - t), 2.2);
      return normalize(edges(x, 20, 40), -12);
    },
  },
  'arrival-stop': {
    purpose: 'Car levels and the brake sets.',
    make: () => {
      const x = buffer(0.4);
      add(x, tone(0.4, (t) => 60 - 15 * t, expDecay(0.07)), 1);
      add(x, contact(81, 1200, 0.05), 0.5, 0.02);
      add(x, envelope(lowpass(noise(x.length, 82), 500), expDecay(0.05)), 0.4);
      return normalize(edges(x), -7);
    },
  },
  'arrival-chime': {
    purpose: 'Arrival signal: a single struck-bell "ding".',
    make: () => {
      const s = 1.7;
      const f = 1318.5; // E6
      const partials = [
        [1, 1, 0.55],
        [2.0, 0.35, 0.3],
        [2.76, 0.22, 0.2],
        [5.4, 0.08, 0.08],
      ];
      const x = buffer(s);
      for (const [ratio, amp, tau] of partials) add(x, tone(s, () => f * ratio, attackDecay(0.002, tau * 1.6)), amp);
      return normalize(edges(x, 1, 80), -6);
    },
  },
  'ambient-machinery': {
    purpose: 'Very quiet machine-room bed under the scene (loop).',
    loop: true,
    make: () => {
      const s = 4.05;
      const x = buffer(s);
      add(x, tone(s, () => 50, () => 1), 0.3);
      add(x, tone(s, () => 100, () => 1), 0.08);
      add(x, lowpassN(noise(x.length, 91), 140), 5);
      add(x, lowpassN(bandpass(noise(x.length, 92), 900, 2), 1500, 2), 0.03);
      return normalize(seamless(x, 0.05), -18);
    },
  },
  'overload-tone': {
    purpose: 'Load warning: two soft, low tones. Calm, not an alarm.',
    make: () => {
      const x = buffer(0.7);
      const beep = () => edges(add(tone(0.22, () => 523.25, attackDecay(0.02, 0.12)), tone(0.22, () => 1046.5, attackDecay(0.02, 0.06)), 0.15), 2, 40);
      add(x, beep(), 1);
      add(x, beep(), 0.8, 0.3);
      return normalize(edges(x), -12);
    },
  },
  'power-restore': {
    purpose: 'Systems come back online: relays, rising hum that settles.',
    make: () => {
      const s = 2.0;
      const x = buffer(s);
      for (const [i, at] of [0, 0.18, 0.31].entries()) add(x, contact(100 + i, 1500 + 300 * i, 0.04), 0.6, at);
      add(x, tone(s, (t) => 55 + 55 * Math.min(1, t / 1.2), (t) => Math.min(1, t / 0.8) * (t > 1.5 ? Math.max(0, 1 - (t - 1.5) / 0.5) : 1)), 0.5, 0.25);
      add(x, tone(s, (t) => 110 + 110 * Math.min(1, t / 1.2), (t) => Math.min(1, t / 1.0) * (t > 1.5 ? Math.max(0, 1 - (t - 1.5) / 0.5) : 1) * 0.5), 0.3, 0.25);
      return normalize(edges(x, 1, 60), -9);
    },
  },
  completion: {
    purpose: 'Mission complete: a short, warm three-bell cue.',
    make: () => {
      const s = 1.9;
      const x = buffer(s);
      [523.25, 659.25, 783.99].forEach((f, i) => {
        add(x, tone(s, () => f, attackDecay(0.004, 0.6)), 0.6, i * 0.14);
        add(x, tone(s, () => f * 2, attackDecay(0.004, 0.25)), 0.15, i * 0.14);
      });
      return normalize(edges(x, 1, 80), -8);
    },
  },
};

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(OUT, 'manifest.json');
const PROTOTYPE_PACK = {
  label: 'Synthesized placeholders',
  status: 'approved',
  format: { container: 'wav', encoding: 'pcm_s16le', channels: 1, sampleRate: RATE },
  rights: 'Project-original, synthesized in this repository. No third-party rights.',
};

/** The two static require lists, generated from the manifest's pack statuses. */
function writeSources(manifest) {
  const status = (a) => manifest.packs[a.pack]?.status ?? 'rejected';
  const ids = (s) => Object.keys(manifest.assets).filter((id) => status(manifest.assets[id]) === s);
  const line = (prefix) => (id) => `  '${id}': require('${prefix}${manifest.assets[id].file}'),`;
  const production = [
    '// Production asset map for the elevator sound set: every file of an APPROVED pack (manifest.json).',
    '// Generated by scripts/generate-elevator-audio.js --sources; audio.test.ts keeps it in step with the',
    '// manifest. Metro bundles each file; nothing is fetched at runtime. Files of a pack pending review',
    '// are listed in src/devtools/audioReviewSources.ts instead, so production bundles never carry them.',
    'export const AUDIO_ASSETS: Record<string, number> = {',
    ...ids('approved').map(line('../../../../assets/themes/elevator-quest/audio/')),
    '};',
    '',
  ];
  const review = [
    '// Sound files PENDING rights review: static requires for the browser playtest build only.',
    '// Generated by scripts/generate-elevator-audio.js --sources from the pack statuses in',
    '// assets/themes/elevator-quest/audio/manifest.json. Only src/themes/elevator-quest/audio/activeSet.web.ts',
    '// imports this file, so native bundles never contain these files (npm run check:bundle proves it).',
    '// Approving a pack is the one-line status change in the manifest, then --sources moves its lines',
    '// to src/themes/elevator-quest/audio/assets.ts.',
    'export const AUDIO_REVIEW_SOURCES: Readonly<Record<string, number>> = {',
    ...ids('pending').map(line('../../assets/themes/elevator-quest/audio/')),
    '};',
    '',
  ];
  fs.writeFileSync(path.join(ROOT, 'src/themes/elevator-quest/audio/assets.ts'), production.join('\n'));
  fs.writeFileSync(path.join(ROOT, 'src/devtools/audioReviewSources.ts'), review.join('\n'));
  console.log(`Wrote the require lists: ${ids('approved').length} approved, ${ids('pending').length} pending, ${ids('rejected').length} rejected`);
}

function main() {
  const existing = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { packs: {}, assets: {} };
  if (process.argv.includes('--sources')) return writeSources(existing);
  fs.mkdirSync(OUT, { recursive: true });
  const prototype = {};
  for (const [id, sound] of Object.entries(SOUNDS)) {
    const file = `${id}.wav`;
    const samples = sound.make();
    fs.writeFileSync(path.join(OUT, file), wav(samples));
    prototype[id] = {
      file,
      pack: 'prototype',
      purpose: sound.purpose,
      loop: Boolean(sound.loop),
      durationMs: Math.round((samples.length / RATE) * 1000),
      source: 'Synthesized procedurally by scripts/generate-elevator-audio.js (oscillators and seeded noise). No recordings or third-party samples.',
      license: 'Project-original. Generated in this repository; no third-party rights.',
      authentic: false,
      prototype: true,
      replace: true,
    };
  }
  // Keep every other pack's entries exactly as they are (generated packs are not made here).
  const others = Object.fromEntries(Object.entries(existing.assets ?? {}).filter(([, a]) => a.pack && a.pack !== 'prototype'));
  const manifest = {
    note: existing.note ?? 'Elevator Quest sound sets.',
    packs: { ...(existing.packs ?? {}), prototype: PROTOTYPE_PACK },
    assets: { ...prototype, ...others },
  };
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(SOUNDS).length} sounds to ${path.relative(process.cwd(), OUT)}`);
  writeSources(manifest);
}

main();
