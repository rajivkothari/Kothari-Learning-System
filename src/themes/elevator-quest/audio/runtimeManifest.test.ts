/// <reference types="node" />
// What a production build carries of the sound set (M9.1): the slim runtime manifest (runtime.json)
// instead of manifest.json, and only the files a production profile can play. The synthesized
// placeholders (pack "prototype", "bundle": "development") stay for the browser playtest build.
import fs from 'node:fs';
import path from 'node:path';

import manifestJson from '../../../../assets/themes/elevator-quest/audio/manifest.json';
import runtimeJson from '../../../../assets/themes/elevator-quest/audio/runtime.json';
import { AUDIO_MANIFEST, PRODUCTION_PROFILE, productionProfile, type AudioManifestFile } from './packs';
import { SOUND_SLOTS, type ElevatorSoundProfile } from './profile';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the generator is a plain Node script
const generator = require('../../../../scripts/generate-runtime-manifests.js') as { audioRuntime(m: unknown): unknown; generate(o: { check: boolean }): string[] };
const FULL = manifestJson as unknown as AudioManifestFile;
const hint = 'run: node scripts/generate-runtime-manifests.js';
/** Asset ids a require list names (the generated files are plain static requires). */
const listed = (file: string) => [...fs.readFileSync(file, 'utf8').matchAll(/^\s+'([a-z0-9-]+)': require\(/gm)].map((m) => m[1]!);
const NATIVE = new Set(listed(path.join(__dirname, 'assets.ts')));
const REVIEW = new Set(listed(path.join(__dirname, '../../../devtools/audioReviewSources.ts')));
const assetsOf = (p: ElevatorSoundProfile) => SOUND_SLOTS.flatMap((s) => (p.slots[s] ? [p.slots[s]!.asset] : []));

describe('runtime audio manifest', () => {
  it('is up to date with manifest.json', () => {
    expect({ stale: generator.generate({ check: true }), hint }).toEqual({ stale: [], hint });
    expect(runtimeJson).toEqual(generator.audioRuntime(manifestJson));
  });

  it('holds exactly what the game reads: pack status, and each file\'s pack, length and narration key', () => {
    expect(Object.keys(AUDIO_MANIFEST.assets).sort()).toEqual(Object.keys(FULL.assets).sort());
    for (const [id, p] of Object.entries(FULL.packs)) expect({ id, pack: AUDIO_MANIFEST.packs[id] }).toEqual({ id, pack: { status: p.status } });
    for (const [id, a] of Object.entries(FULL.assets)) {
      const want = { pack: a.pack, durationMs: a.durationMs, ...(a.narrationKey ? { narrationKey: a.narrationKey } : {}) };
      expect({ id, entry: AUDIO_MANIFEST.assets[id] }).toEqual({ id, entry: want });
    }
    // The full manifest's decisions come out the same from the slim one.
    expect(productionProfile(FULL)).toBe(PRODUCTION_PROFILE);
  });
});

describe('what a native production build carries', () => {
  it('every file the production profile plays is bundled', () => {
    for (const asset of assetsOf(PRODUCTION_PROFILE)) expect({ asset, native: NATIVE.has(asset) }).toEqual({ asset, native: true });
  });

  it('no development-only pack is bundled, and the browser playtest build still carries it for ?sound=placeholder', () => {
    const dev = Object.entries(FULL.assets).filter(([, a]) => FULL.packs[a.pack]?.bundle === 'development').map(([id]) => id);
    expect(dev.length).toBeGreaterThan(0);
    for (const id of dev) expect({ id, native: NATIVE.has(id), review: REVIEW.has(id) }).toEqual({ id, native: false, review: true });
    // A development-only pack is never what production plays: if the generated pack were withdrawn,
    // production would fall back to the placeholders, so this fails until the pack ships again.
    for (const asset of assetsOf(PRODUCTION_PROFILE)) expect({ asset, pack: FULL.assets[asset]!.pack, bundle: FULL.packs[FULL.assets[asset]!.pack]!.bundle }).toEqual({ asset, pack: FULL.assets[asset]!.pack, bundle: undefined });
  });
});
