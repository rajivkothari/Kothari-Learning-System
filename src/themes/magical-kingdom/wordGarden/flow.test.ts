/// <reference types="node" />
// Word Garden over the real runtime (node:sqlite) and the shipped kingdom content: only a tapped
// letter or picture and a filled word are answers; hearing, tapping letters to hear them, placing and
// taking back tiles and the celebrations record nothing; help and misses keep their assistance;
// leaving, an app restart and a fresh director all resume the same item.
import raw from '../../../../content/themes/magical-kingdom/wordGarden.json';
import recordings from '../../../../content/themes/magical-kingdom/wordGarden.recordings.json';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadLearningEvents } from '../../../persistence/store';
import { openNodeDatabase } from '../../../persistence/testing/nodeDatabase';
import { openGameRuntime, type GameRuntime } from '../../../runtime/gameRuntime';
import { tempDir } from '../../../runtime/testing/harness';
import { THEME, loadKingdomContent } from '../appContent';
import { readRoyalCompletions, royalProgress } from '../wardrobe';
import { WORD_GARDEN, recordingList, validateWordGarden } from './content';
import { createWordGardenFlow, type GardenAudio, type WordGardenFlow } from './flow';

const LEARNER = 'learner-storyteller-test';
const content = loadKingdomContent();

async function world() {
  const tmp = tempDir();
  let time = 100_000;
  const now = () => ++time;
  let db = openNodeDatabase(tmp.file);
  let runtime: GameRuntime = await openGameRuntime(db, content, { now });
  await runtime.createLearner({ id: LEARNER, themePack: THEME });
  const said: string[] = [];
  const audio: GardenAudio = { say: (s) => said.push(...s), effect: () => undefined, hush: () => undefined };
  const open = async () => {
    const flow = createWordGardenFlow({ runtime, learnerId: LEARNER, now, audio });
    await flow.start();
    return flow;
  };
  /** The app is killed: memory gone, the database file reopened. */
  const restart = async () => {
    runtime.dropMemory();
    await db.close();
    db = openNodeDatabase(tmp.file);
    runtime = await openGameRuntime(db, content, { now });
  };
  const attempts = async () => (await loadLearningEvents(db, LEARNER)).flatMap((e) => (e.event.type === 'attempt' ? [e.event.attempt] : []));
  const rows = async () => (await attempts()).map((a) => [a.outcome, a.wrongTries, a.assistance]);
  return { open, restart, attempts, rows, said, db: () => db, done: async () => { await db.close(); tmp.cleanup(); } };
}

/** The test knows the answers from the copy (the flow never compares). */
const right = (f: WordGardenFlow) => {
  const t = f.view().task!;
  return t.options.find((o) => o.value === t.target)!.id;
};
const wrong = (f: WordGardenFlow) => {
  const t = f.view().task!;
  return t.options.filter((o) => o.value !== t.target && !f.view().tried.includes(o.id)).map((o) => o.id);
};
/** Tile indexes that spell `word` (each tile once). */
const tilesFor = (f: WordGardenFlow, word: string) => {
  const used: number[] = [];
  for (const ch of word) used.push(f.view().task!.tiles.findIndex((t, i) => t === ch && !used.includes(i)));
  return used;
};
const spell = async (f: WordGardenFlow, word: string) => {
  for (const i of tilesFor(f, word)) await f.place(i);
};
const solve = async (f: WordGardenFlow) => {
  const t = f.view().task!;
  if (t.kind === 'spell') await spell(f, t.target);
  else await f.choose(right(f));
};

describe('Word Garden', () => {
  it('ships copy that presents every item, and names every clip still to record', () => {
    expect(validateWordGarden(raw)).toEqual([]);
    expect(validateWordGarden({ ...raw, items: { ...raw.items, 'blend-cat': 'hat' } })).toContain('blend item blend-cat must show the letters of cat');
    const { s: _s, ...noS } = raw.sounds;
    expect(validateWordGarden({ ...raw, sounds: noS }).some((p) => p.includes('letter s has no sound'))).toBe(true);
    const slots = recordingList().map((r) => r.slot);
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots).toEqual(expect.arrayContaining(['sound:s', 'sound:o', 'word:cat', 'word:hat', 'line:sound', 'reaction:pig']));
    // No phonetically right misspelling on any tray: CAT's tiles never include k.
    expect(slots).not.toContain('sound:k');
    expect(WORD_GARDEN.recordings.status).toBe('pending');
    // The committed checklist matches what the game plays and what is registered.
    const sources = [...fs.readFileSync(path.join(__dirname, '../audio/reading.ts'), 'utf8').matchAll(/'slot:([a-z]+:[a-zA-Z]+)'/g)].map((m) => m[1]);
    // Letter sounds play only after the owner auditions them (a generated phoneme can add a vowel: "puh").
    for (const c of recordings.clips) if (c.slot.startsWith('sound:') && sources.includes(c.slot)) expect((c as { audition?: string }).audition).toBe('approved');
    // Each generated file is the one recorded in the manifest.
    const files = (recordings.clips as { file?: string; bytes?: number; sha256?: string; candidates?: { file: string; bytes: number; sha256: string }[] }[]).flatMap((c) => [...(c.sha256 ? [c] : []), ...(c.candidates ?? [])]);
    expect(files.length).toBe(37);
    for (const c of files) {
      const bytes = fs.readFileSync(path.join(__dirname, '../../../../assets/themes/magical-kingdom/audio', c.file!));
      expect(bytes.length).toBe(c.bytes);
      expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(c.sha256);
    }
    expect(recordings.clips.map(({ slot, text, tier }) => ({ slot, text, tier }))).toEqual(recordingList());
    for (const c of recordings.clips) expect(c.status === 'recorded').toBe(sources.includes(c.slot));
  });

  it('three first-try magics: sound, blend, spell are three independent attempts; nothing else records', async () => {
    const w = await world();
    try {
      const f = await w.open();
      expect(f.view()).toMatchObject({ stage: 'play', magic: 1, task: { kind: 'sound' } });
      expect(w.said.at(-1)).toBe(`sound:${f.view().task!.target}`);
      f.hear();
      await f.choose(right(f));
      expect(f.view()).toMatchObject({ stage: 'reward', reward: { kind: 'sound' } });
      await f.next();
      expect(f.view()).toMatchObject({ stage: 'play', magic: 2, task: { kind: 'blend' } });
      // Tapping letters to hear them, as often as wanted, is never an answer.
      for (let n = 0; n < 3; n++) for (let i = 0; i < 3; i++) f.tapLetter(i);
      expect(f.view()).toMatchObject({ heard: [0, 1, 2], line: 'blendReady' });
      expect(await w.attempts()).toHaveLength(1);
      await f.choose(right(f));
      expect(f.view().reward).toMatchObject({ kind: 'blend', value: expect.any(String) });
      await f.next();
      expect(f.view()).toMatchObject({ magic: 3, task: { kind: 'spell' } });
      const t = f.view().task!;
      expect(t.tiles.length).toBe(5);
      // Placing and taking back tiles before the word is full is never an answer.
      const [a, b] = tilesFor(f, t.target);
      await f.place(a!);
      await f.place(b!);
      f.unplace(1);
      f.unplace(0);
      expect(f.view().placed).toEqual([]);
      expect(await w.attempts()).toHaveLength(2);
      await spell(f, t.target);
      expect(f.view()).toMatchObject({ stage: 'done', reward: { kind: 'spell', value: t.target } });
      await f.next();
      expect(f.view().stage).toBe('done');
      expect(await w.rows()).toEqual([
        ['correct', 0, 'independent'],
        ['correct', 0, 'independent'],
        ['correct', 0, 'independent'],
      ]);
      expect((await w.attempts()).map((x) => x.activityId)).toEqual(['letter-sound', 'blend-word', 'spell-word']);
      // A finished Word Garden counts toward the garden's royal gifts.
      expect(royalProgress(await readRoyalCompletions(w.db(), LEARNER)).garden).toBe(1);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('a wrong letter greys out, never sends twice, and the right one after it is a retry', async () => {
    const w = await world();
    try {
      const f = await w.open();
      const miss = wrong(f)[0]!;
      await f.choose(miss);
      expect(f.view()).toMatchObject({ stage: 'play', tried: [miss], line: 'retrySound', miss: 1 });
      await f.choose(miss);
      expect(await w.attempts()).toHaveLength(0);
      await f.choose(right(f));
      expect(await w.rows()).toEqual([['correct', 1, 'retry']]);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('a wrong word springs its tiles back; the authored wrong-order spelling gets an order hint', async () => {
    const w = await world();
    try {
      const f = await w.open();
      await solve(f);
      await f.next();
      await solve(f);
      await f.next();
      const word = f.view().task!.target;
      // The authored letter-order misspelling (last two swapped) carries its cause; another order does not.
      await spell(f, `${word[0]}${word[2]}${word[1]}`);
      expect(f.view()).toMatchObject({ stage: 'play', placed: [], miss: 1, line: 'retryOrder' });
      await spell(f, `${word[1]}${word[0]}${word[2]}`);
      expect(f.view()).toMatchObject({ placed: [], miss: 2, line: 'retrySpell' });
      expect(f.view().task!.target).toBe(word);
      await spell(f, word);
      expect((await w.rows()).at(-1)).toEqual(['correct', 2, 'retry']);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('help climbs stretched sound (clue), model (guided), then SHOW ME only after two misses (demonstrated)', async () => {
    const w = await world();
    try {
      const f = await w.open();
      const target = f.view().task!.target;
      await f.help();
      expect(f.view()).toMatchObject({ help: ['highlightGiven'], line: 'stretchSound' });
      await f.help();
      expect(f.view()).toMatchObject({ help: ['highlightGiven', 'guidedSteps'], line: 'modelSound' });
      expect(w.said.at(-1)).toBe(`word:${WORD_GARDEN.keywords[target]}`);
      expect(f.view().nextHelp).toBeNull();
      for (const id of wrong(f)) await f.choose(id);
      expect(f.view().nextHelp).toEqual({ kind: 'showAnswer', demonstrated: true });
      await f.help();
      expect(f.view().shown?.optionId).toBe(right(f));
      await f.choose(right(f));
      expect(await w.rows()).toEqual([['correct', 2, 'demonstrated']]);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('SHOW ME on a word shows it and the child copies it tile by tile (demonstrated)', async () => {
    const w = await world();
    try {
      const f = await w.open();
      await solve(f);
      await f.next();
      await solve(f);
      await f.next();
      const word = f.view().task!.target;
      await f.help();
      await f.help();
      const wrongWord = `${word[1]}${word[0]}${word[2]}`;
      await spell(f, wrongWord);
      await spell(f, wrongWord);
      await f.help();
      expect(f.view().shown?.value).toBe(word);
      await spell(f, word);
      expect((await w.rows()).at(-1)).toEqual(['correct', 2, 'demonstrated']);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('leaving, coming back and an app restart resume the same item with its tried letter, heard letters and placed tiles', async () => {
    const w = await world();
    try {
      let f = await w.open();
      const miss = wrong(f)[0]!;
      const key = f.view().task!.key;
      await f.choose(miss);
      await f.flush();
      f.dispose();
      f = await w.open();
      expect(f.view()).toMatchObject({ stage: 'play', tried: [miss] });
      expect(f.view().task!.key).toBe(key);
      await f.choose(right(f));
      // Mid-celebration: a new visit shows the same celebration.
      await f.flush();
      f.dispose();
      f = await w.open();
      expect(f.view()).toMatchObject({ stage: 'reward', reward: { kind: 'sound' } });
      await f.next();
      f.tapLetter(0);
      f.tapLetter(2);
      await f.flush();
      await w.restart();
      f = await w.open();
      expect(f.view()).toMatchObject({ stage: 'play', task: { kind: 'blend' }, heard: [0, 2] });
      await solve(f);
      await f.next();
      const t = f.view().task!;
      await f.place(tilesFor(f, t.target)[0]!);
      await f.flush();
      await w.restart();
      f = await w.open();
      expect(f.view().placed).toEqual([tilesFor(f, t.target)[0]]);
      await f.place(tilesFor(f, t.target)[1]!);
      await f.place(tilesFor(f, t.target)[2]!);
      expect(f.view().stage).toBe('done');
      expect(await w.rows()).toEqual([
        ['correct', 1, 'retry'],
        ['correct', 0, 'independent'],
        ['correct', 0, 'independent'],
      ]);
      f.dispose();
    } finally {
      await w.done();
    }
  });
});
