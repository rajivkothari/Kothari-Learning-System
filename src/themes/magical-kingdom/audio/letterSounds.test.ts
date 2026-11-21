/// <reference types="node" />
// The letter sounds that ship (Open Letter Sounds, CC0): their licence text travels with them, and the
// Treasure Chests say a letter's sound only where one is registered.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import checklist from '../../../../content/themes/magical-kingdom/wordGarden.recordings.json';
import { CHOICE_GAMES } from '../games/choiceContent';

const AUDIO = path.join(__dirname, '../../../../assets/themes/magical-kingdom/audio');
const sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('the library\'s licence text sits beside the letter sounds that ship, unchanged', () => {
  const licence = checklist.phonemeReview.library.licenceSha256;
  expect(sha256(path.join(AUDIO, 'word-garden-phonemes-review', 'LICENSE.openlettersounds.txt'))).toBe(licence);
  // word-garden-v1 holds the copies the app plays: the licence must be in that folder too, not only beside the review takes.
  expect(sha256(path.join(AUDIO, 'word-garden-v1', 'LICENSE.openlettersounds.txt'))).toBe(licence);
  expect(fs.readFileSync(path.join(AUDIO, 'word-garden-v1', 'LICENSE.openlettersounds.txt'), 'utf8')).toContain('CC0 1.0 Universal');
});

test('every chest letter has its sound but f, which has no library take in the review folder yet', () => {
  const letters = [...new Set(CHOICE_GAMES.sets.flat())].sort();
  // reading.ts is the registry (it requires the recordings, so it is read here as text, as the other audio tests do).
  const registry = fs.readFileSync(path.join(__dirname, 'reading.ts'), 'utf8');
  const silent = letters.filter((l) => !registry.includes(`'slot:sound:${l}': require(`));
  // f: Treasure Chests' set b f m says nothing for f on a right answer or in guided help (the word and the
  // line are still said). A take is added only through `node scripts/letter-sounds.js approve`, from a take that
  // exists: when f is recorded and approved, this list becomes empty.
  expect(silent).toEqual(['f']);
  expect(fs.existsSync(path.join(AUDIO, 'word-garden-phonemes-review', 'library.f.mp3'))).toBe(false);
});
