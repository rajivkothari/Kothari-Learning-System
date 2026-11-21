// The open-source pictures shipped in the app are exactly the files their manifest records: the pinned
// commit, the published 256 px PNG, unchanged, with the licence text beside them (docs/THIRD_PARTY_ASSETS.md).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import manifest from '../../../../assets/themes/magical-kingdom/pictures/manifest.json';
import { PICTURES, pictureOf } from './pictures';

const DIR = path.join(__dirname, '../../../../assets/themes/magical-kingdom/pictures');
const sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, file))).digest('hex');

describe('Magical Kingdom pictures', () => {
  it('ships each picture as published, at the pinned commit, with its licence', () => {
    expect(manifest.licence).toBe('MIT');
    expect(manifest.commit).toBe('1ffb34c752ecf5d402f04cfb4b392c77f57c54bc');
    const licence = fs.readFileSync(path.join(DIR, manifest.licenceFile), 'utf8');
    expect(licence).toContain('MIT License');
    expect(licence).toContain('Copyright (c) Microsoft Corporation.');
    expect(sha256(manifest.licenceFile)).toBe(manifest.licenceSha256);
    expect(manifest.pictures).toHaveLength(36);
    for (const p of manifest.pictures) {
      const bytes = fs.readFileSync(path.join(DIR, p.file));
      expect(bytes.length).toBe(p.bytes);
      expect(sha256(p.file)).toBe(p.sha256);
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([256, 256]);
      expect(p.source).toBe(`assets/${p.name}/3D/${p.name.toLowerCase().replaceAll(' ', '_')}_3d.png`);
    }
    // Nothing else sits in the folder unrecorded.
    expect(fs.readdirSync(DIR).sort()).toEqual([manifest.licenceFile, 'manifest.json', ...manifest.pictures.map((p) => p.file)].sort());
  });

  it('maps every recorded picture, and only those, to its file', () => {
    expect(Object.keys(PICTURES).sort()).toEqual(manifest.pictures.map((p) => p.id).sort());
    // In this plain-Node project a required image is its repository path (jest.assetTransformer.js).
    for (const p of manifest.pictures) expect(pictureOf(p.id)).toBe(`assets/themes/magical-kingdom/pictures/${p.file}`);
    // No emoji reads as these words: they stay code-drawn, as do the chests, the gem and the controls.
    for (const kind of ['sun', 'bun', 'chest', 'chestOpen', 'gem', 'check', 'arrow', 'again', 'toString']) expect(pictureOf(kind)).toBeUndefined();
  });
});
