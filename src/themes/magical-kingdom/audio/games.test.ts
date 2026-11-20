import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import script from '../../../../content/themes/magical-kingdom/games-narration.json';
import manifest from '../../../../assets/themes/magical-kingdom/audio/games-v2/manifest.json';

// The game narration: the script, the recorded batch (games-v2/manifest.json) and the registered sources agree.
// Nobody has listened to these takes yet: the defaults were picked by measurement (manifest.defaultTakeRule), so
// humanReviewed stays false until a person hears them.
const AUDIO = path.join(__dirname, '../../../../assets/themes/magical-kingdom/audio');
const sources = fs.readFileSync(path.join(__dirname, 'games.ts'), 'utf8');
const registered = [...sources.matchAll(/'game:([^']+)': require\('\.\.\/\.\.\/\.\.\/\.\.\/assets\/themes\/magical-kingdom\/audio\/([^']+)'\)/g)].map((m) => ({ id: m[1], file: m[2] }));

test('every clip in the script has one recording in the manifest, registered as game:<id>, with the same words', () => {
  const clips = new Map(manifest.clips.map((c) => [c.id, c]));
  expect(clips.size).toBe(manifest.clips.length);
  for (const line of script.clips) {
    const clip = clips.get(line.id);
    expect(clip).toBeDefined();
    expect(clip!.text).toBe(line.text);
    expect(clip!.kind).toBe(line.kind);
    expect(registered).toContainEqual({ id: line.id, file: clip!.file });
  }
  // Nothing recorded or registered that the script does not have.
  expect(manifest.clips.map((c) => c.id).sort()).toEqual(script.clips.map((c) => c.id).sort());
  expect(registered.map((r) => r.id).sort()).toEqual(script.clips.map((c) => c.id).sort());
  expect(sources).not.toMatch(/https?:\/\//);
});

test('each file is the one the manifest records, and no take is marked as heard', () => {
  expect(manifest.aiGenerated).toBe(true);
  expect(manifest.humanReviewed).toBe(false);
  expect(manifest.totals.clips).toBe(manifest.clips.length);
  for (const clip of manifest.clips) {
    const bytes = fs.readFileSync(path.join(AUDIO, clip.file));
    expect(bytes.length).toBe(clip.bytes);
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(clip.sha256);
    expect(clip.file).toBe(`games-v2/${clip.id}.mp3`);
    expect(clip.durationSeconds).toBeGreaterThan(0.3);
    expect(clip.aiGenerated).toBe(true);
    expect(clip.humanReviewed).toBe(false);
    // The chosen take and both alternates can be fetched again from the flow by their session ids.
    for (const take of [clip.chosen, ...clip.alternates]) {
      expect(take.flowId).toBe(manifest.flowId);
      expect(take.sessionId).toMatch(/^[A-Za-z0-9]{20}$/);
      expect(take.generationId).toMatch(/^[A-Za-z0-9]{20}$/);
    }
    expect(clip.alternates).toHaveLength(2);
  }
});
