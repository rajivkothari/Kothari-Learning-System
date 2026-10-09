/// <reference types="node" />
// Semantic audio: which sound happens when, not how it sounds through a speaker.
import fs from 'node:fs';
import path from 'node:path';

import manifest from '../../../../assets/themes/elevator-quest/audio/manifest.json';
import { NORMAL_TIMING, REDUCED_TIMING, createElevator, run, type ElevatorConfig, type ElevatorInput } from '../sim/elevator';
import { createCueMapper, type AudioCue } from './cues';
import { DEFAULT_AUDIO, gainFor } from './mix';
import { ELEVENLABS_V1, SLOT_SPECS, SOUND_PROFILES, SOUND_SLOTS } from './profile';

const NORMAL: ElevatorConfig = { minFloor: 1, maxFloor: 20, timing: NORMAL_TIMING };
const T = 5_000_000;

function cuesFor(config: ElevatorConfig, inputs: ElevatorInput[], from = 8) {
  const mapper = createCueMapper({ decelFadeMs: config.timing.decelMs });
  const { events, state } = run(config, createElevator(config, from, T), inputs);
  return { cues: mapper.map(events), mapper, events, state };
}

const label = (c: AudioCue) => (c.action === 'play' ? c.slot : `${c.action}:${c.slot}`);

describe('semantic audio sequence', () => {
  it('a normal trip sounds in the authentic order', () => {
    const { cues } = cuesFor(NORMAL, [{ type: 'press', floor: 15, at: T }, { type: 'tick', at: T + 60_000 }]);
    expect(cues.map(label)).toEqual([
      'floorButtonPress',
      'floorButtonActivate',
      'loopStart:doorMotor',
      'loopStop:doorMotor',
      'doorClosed',
      'motorStart',
      'loopStart:travelLoop',
      'loopStop:travelLoop',
      'deceleration',
      'arrivalStop',
      'arrivalChime',
      'loopStart:doorMotor',
      'loopStop:doorMotor',
      'doorOpened',
    ]);
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.at).toBeGreaterThanOrEqual(cues[i - 1]!.at);
  });

  it('the chime never precedes the arrival, and no travel sound outlives it', () => {
    const { cues, events, mapper } = cuesFor(NORMAL, [{ type: 'press', floor: 3, at: T }, { type: 'tick', at: T + 60_000 }], 12);
    const arrivedAt = events.find((e) => e.type === 'arrived')!.at;
    const chime = cues.find((c) => c.action === 'play' && c.slot === 'arrivalChime')!;
    expect(chime.at).toBeGreaterThan(arrivedAt);
    const travelStop = cues.find((c) => c.action === 'loopStop' && c.slot === 'travelLoop')!;
    expect(travelStop.at).toBeLessThanOrEqual(arrivedAt);
    expect(mapper.activeLoops()).toEqual([]);
  });

  it('the door motor sounds only while the doors move, including a reversal', () => {
    const { cues, mapper } = cuesFor(NORMAL, [
      { type: 'press', floor: 10, at: T },
      { type: 'doorClose', at: T + 50 },
      { type: 'doorOpen', at: T + 500 },
      { type: 'tick', at: T + 60_000 },
    ]);
    const doorMotor = cues.filter((c) => c.slot === 'doorMotor').map((c) => c.action);
    // closing (reversed into opening without a second start), then closing again, then opening at arrival
    expect(doorMotor.filter((a) => a === 'loopStart').length).toBe(doorMotor.filter((a) => a === 'loopStop').length);
    expect(mapper.activeLoops()).toEqual([]);
  });

  it('mashing a button does not stack identical sounds', () => {
    const presses: ElevatorInput[] = Array.from({ length: 20 }, (_, i) => ({ type: 'press', floor: 15, at: T + i * 25 }));
    const { cues } = cuesFor(NORMAL, [...presses, { type: 'tick', at: T + 60_000 }]);
    const clicks = cues.filter((c) => c.slot === 'floorButtonPress');
    expect(clicks.length).toBeLessThanOrEqual(Math.ceil((20 * 25) / 90) + 1);
    expect(cues.filter((c) => c.slot === 'floorButtonActivate')).toHaveLength(1);
    expect(cues.filter((c) => c.slot === 'arrivalChime')).toHaveLength(1);
    expect(cues.filter((c) => c.action === 'loopStart' && c.slot === 'travelLoop')).toHaveLength(1);
  });

  it('a dispatch by the machine registers the call without a button click', () => {
    const { cues } = cuesFor(NORMAL, [{ type: 'press', floor: 12, at: T, source: 'system' }, { type: 'tick', at: T + 60_000 }]);
    expect(cues.filter((c) => c.slot === 'floorButtonPress')).toHaveLength(0);
    expect(cues.filter((c) => c.slot === 'floorButtonActivate')).toHaveLength(1);
    expect(cues.filter((c) => c.slot === 'arrivalChime')).toHaveLength(1);
  });

  it('reduced motion produces the same semantic sequence', () => {
    const reduced: ElevatorConfig = { ...NORMAL, timing: REDUCED_TIMING };
    const inputs: ElevatorInput[] = [{ type: 'press', floor: 15, at: T }, { type: 'tick', at: T + 60_000 }];
    expect(cuesFor(reduced, inputs).cues.map(label)).toEqual(cuesFor(NORMAL, inputs).cues.map(label));
  });

  it('mute and quiet change loudness only: the cue sequence and the simulation are identical', () => {
    const inputs: ElevatorInput[] = [{ type: 'press', floor: 15, at: T }, { type: 'tick', at: T + 60_000 }];
    const a = cuesFor(NORMAL, inputs);
    const b = cuesFor(NORMAL, inputs);
    expect(b.cues).toEqual(a.cues);
    expect(b.state).toEqual(a.state);
    for (const profile of SOUND_PROFILES) {
      for (const slot of SOUND_SLOTS) {
        expect(gainFor(profile, slot, { output: 'muted', effects: 1 })).toBe(0);
        const quiet = gainFor(profile, slot, { output: 'quiet', effects: 1 });
        const normal = gainFor(profile, slot, { output: 'normal', effects: 1 });
        expect(quiet).toBeLessThanOrEqual(normal);
        if (SLOT_SPECS[slot].essential && profile.slots[slot]) expect(quiet).toBeGreaterThan(0);
        // No slot is ever pushed past its file's level: gains are trims, never boosts.
        expect(normal).toBeLessThanOrEqual(1);
      }
      expect(gainFor(profile, 'ambientMachinery', { output: 'quiet', effects: 1 })).toBe(0);
      expect(gainFor(profile, 'floorButtonPress', DEFAULT_AUDIO)).toBeGreaterThan(0);
    }
  });
});

describe('sound assets', () => {
  const dir = path.join(__dirname, '../../../../assets/themes/elevator-quest/audio');
  const assets = manifest.assets as Record<string, { file: string; pack: string; source: string; license: string; prototype: boolean; replace: boolean; authentic: boolean; loop: boolean }>;

  it('every profile slot resolves to a manifest entry of its own packs, with a file, a source, and a license', () => {
    for (const profile of SOUND_PROFILES) {
      const packs = [profile.pack, ...(profile.extraPacks ?? [])];
      for (const slot of SOUND_SLOTS) {
        const spec = profile.slots[slot];
        if (!spec) continue;
        const entry = assets[spec.asset];
        expect({ profile: profile.id, slot, found: Boolean(entry) }).toEqual({ profile: profile.id, slot, found: true });
        expect({ slot, ownPack: packs.includes(entry!.pack) }).toEqual({ slot, ownPack: true });
        expect(fs.existsSync(path.join(dir, entry!.file))).toBe(true);
        expect(entry!.source.length).toBeGreaterThan(10);
        expect(entry!.license.length).toBeGreaterThan(5);
        expect({ slot, loop: entry!.loop }).toEqual({ slot, loop: SLOT_SPECS[slot].loop });
      }
    }
  });

  it('the generated pack gives every slot its own sound except deceleration (the travel loop fades instead)', () => {
    const silent = SOUND_SLOTS.filter((s) => !ELEVENLABS_V1.slots[s]);
    expect(silent).toEqual(['deceleration']);
  });

  it('no synthesized placeholder is presented as an authentic recording', () => {
    for (const [id, a] of Object.entries(assets)) {
      if (/synthesi/i.test(a.source)) expect({ id, authentic: a.authentic, replace: a.replace }).toEqual({ id, authentic: false, replace: true });
      // Generated sound is not a recording either.
      if (a.pack !== 'prototype') expect({ id, authentic: a.authentic }).toEqual({ id, authentic: false });
    }
  });

  it('the require lists match the pack statuses: approved files in assets.ts, pending files only in the review list', () => {
    const status = (pack: string) => (manifest.packs as Record<string, { status: string }>)[pack]?.status ?? 'rejected';
    const listed = (file: string, prefix: string) =>
      [...fs.readFileSync(file, 'utf8').matchAll(/^\s+'([a-z0-9-]+)': require\('([^']+)'\),$/gm)].map((m) => [m[1]!, m[2]!.replace(prefix, '')] as const).sort();
    const expected = (s: string) => Object.entries(assets).filter(([, a]) => status(a.pack) === s).map(([id, a]) => [id, a.file] as const).sort();
    const production = listed(path.join(__dirname, 'assets.ts'), '../../../../assets/themes/elevator-quest/audio/');
    const review = listed(path.join(__dirname, '../../../devtools/audioReviewSources.ts'), '../../assets/themes/elevator-quest/audio/');
    const hint = 'run: node scripts/generate-elevator-audio.js --sources';
    expect({ production, hint }).toEqual({ production: expected('approved'), hint });
    expect({ review, hint }).toEqual({ review: expected('pending'), hint });
    expect(fs.readFileSync(path.join(__dirname, 'assets.ts'), 'utf8')).not.toContain('eslint-disable');
  });
});
