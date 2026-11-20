/// <reference types="node" />
// Word Garden over the real runtime (node:sqlite) and the shipped kingdom content: only a tapped
// letter or picture and a filled word are answers; hearing, tapping letters to hear them, placing and
// taking back tiles and the celebrations record nothing; help and misses keep their assistance;
// leaving, an app restart and a fresh director all resume the same item. Voice and timing as the royal
// games: listening holds on the first ask and after a miss, reminders only in the quiet, the nudge, the
// first ask at the browser's first touch, and a play save that never holds back the next tap.
import raw from '../../../../content/themes/magical-kingdom/wordGarden.json';
import recordings from '../../../../content/themes/magical-kingdom/wordGarden.recordings.json';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_REMINDERS, REMIND_MS, SPEECH_CAP_MS } from '../games/flow';
import { LEARNER, testAudio, testClock, testWorld } from '../games/testing';
import { readRoyalCompletions, royalProgress } from '../wardrobe';
import { WORD_GARDEN, recordingList, validateWordGarden } from './content';
import { createWordGardenFlow, idleGardenView, type WordGardenFlow } from './flow';

/**
 * A learner over the real runtime, a clock the test moves and an audio double. `recorded: false` is a garden
 * with nothing that can play (the evidence tests): every say reports at once and nothing holds.
 */
async function world(options: { recorded?: boolean; whenReady?: boolean } = {}) {
  const w = await testWorld();
  const clock = testClock();
  const a = testAudio({ whenReady: options.whenReady, recorded: options.recorded === false ? () => false : undefined });
  /** Every key said, in order, in one list. */
  const said: string[] = [];
  const say = a.audio.say;
  a.audio.say = (keys, gap, onEnd) => {
    said.push(...keys);
    say(keys, gap, onEnd);
  };
  const open = async () => {
    const flow = createWordGardenFlow({ runtime: w.runtime(), learnerId: LEARNER, now: w.now, audio: a.audio, wait: clock.wait });
    await flow.start();
    return flow;
  };
  return { ...w, clock, a, open, said };
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
  it('ships copy that presents every item, and a checklist equal to the clips that play and their files', () => {
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
    // A letter sound plays only once scripts/letter-sounds.js has approved it (a generated phoneme can add a vowel: "puh").
    // The 16 here are the Open Letter Sounds takes, approved on the owner's instruction: nobody has listened to
    // one yet, and the checklist must keep saying so until a person does (approve <letter> <take> --heard).
    for (const c of recordings.clips as { slot: string; audition?: string; approval?: string; humanReviewed?: boolean }[]) {
      if (!c.slot.startsWith('sound:') || !sources.includes(c.slot)) continue;
      expect(c.audition).toBe('approved');
      expect(c.approval).toBe(c.humanReviewed ? 'heard and approved by a person' : 'owner instruction, not yet heard by a person');
    }
    expect(recordings.clips.filter((c) => c.slot.startsWith('sound:') && (c as { humanReviewed?: boolean }).humanReviewed).length).toBe(0);
    // Each file is the one recorded in the manifest: 17 kingdom-voice words and lines, 20 kingdom-voice letter
    // sound candidates (level-matched, not used), 16 library candidates, the 16 production copies of those, and
    // 48 candidates from the eleven_v4 batch (jo-v4.<letter>.take1-3, three a letter, not approved, not heard).
    const files = (recordings.clips as { file?: string; bytes?: number; sha256?: string; candidates?: { file: string; bytes: number; sha256: string }[] }[]).flatMap((c) => [...(c.sha256 ? [c] : []), ...(c.candidates ?? [])]);
    expect(files.length).toBe(117);
    for (const c of files) {
      const bytes = fs.readFileSync(path.join(__dirname, '../../../../assets/themes/magical-kingdom/audio', c.file!));
      expect(bytes.length).toBe(c.bytes);
      expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(c.sha256);
    }
    expect(recordings.clips.map(({ slot, text, tier }) => ({ slot, text, tier }))).toEqual(recordingList());
    for (const c of recordings.clips) expect(c.status === 'recorded').toBe(sources.includes(c.slot));
  });

  it('three first-try magics: sound, blend, spell are three independent attempts; nothing else records', async () => {
    const w = await world({ recorded: false });
    try {
      expect(idleGardenView()).toMatchObject({ stage: 'loading', listening: false, nudge: false });
      const f = await w.open();
      expect(f.view()).toMatchObject({ stage: 'play', magic: 1, task: { kind: 'sound' } });
      expect(w.said.at(-1)).toBe(`slot:sound:${f.view().task!.target}`);
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
    const w = await world({ recorded: false });
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
    const w = await world({ recorded: false });
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
    const w = await world({ recorded: false });
    try {
      const f = await w.open();
      const target = f.view().task!.target;
      await f.help();
      expect(f.view()).toMatchObject({ help: ['highlightGiven'], line: 'stretchSound' });
      await f.help();
      expect(f.view()).toMatchObject({ help: ['highlightGiven', 'guidedSteps'], line: 'modelSound' });
      expect(w.said.at(-1)).toBe(`slot:word:${WORD_GARDEN.keywords[target]}`);
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
    const w = await world({ recorded: false });
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
    const w = await world({ recorded: false });
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

  it('the letters and Help are held while the ask is said; the ear still works; a miss says listen again with the ask and holds again', async () => {
    const w = await world();
    try {
      const f = await w.open();
      const t = f.view().task!;
      expect(f.view()).toMatchObject({ stage: 'play', listening: true, nudge: false });
      expect(w.a.last()).toEqual(['slot:line:sound', `slot:sound:${t.target}`]);
      // Taps while the garden is talking do nothing and record nothing.
      await f.choose(right(f));
      await f.choose(wrong(f)[0]!);
      await f.help();
      expect(f.view()).toMatchObject({ tried: [], help: [], listening: true });
      expect(await w.attempts()).toHaveLength(0);
      // The ear starts the ask again and keeps the hold.
      f.hear();
      expect(w.a.said).toHaveLength(2);
      expect(f.view().listening).toBe(true);
      w.a.finish();
      expect(f.view().listening).toBe(false);
      const miss = wrong(f)[0]!;
      await f.choose(miss);
      expect(f.view()).toMatchObject({ tried: [miss], line: 'retrySound', listening: true });
      expect(w.a.last()).toEqual(['effect:retry', 'slot:line:retrySound', `slot:sound:${t.target}`]);
      // A quick second tap during "listen again" is not an answer.
      await f.choose(right(f));
      expect(await w.attempts()).toHaveLength(0);
      w.a.finish();
      await f.choose(right(f));
      expect(await w.rows()).toEqual([['correct', 1, 'retry']]);
      // The celebration does not hold.
      expect(f.view()).toMatchObject({ stage: 'reward', listening: false });
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('a clip that never reports its end holds for the cap at most', async () => {
    const w = await world();
    try {
      const f = await w.open();
      w.a.lose();
      w.clock.advance(SPEECH_CAP_MS - 1);
      expect(f.view().listening).toBe(true);
      w.clock.advance(1);
      expect(f.view().listening).toBe(false);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('reminds twice in the quiet with the short ask, then the ear glows until the next touch; never over a clip, never in a celebration', async () => {
    const w = await world();
    try {
      const f = await w.open();
      const ask = w.a.last();
      // No reminder while the ask is still being said.
      w.clock.advance(REMIND_MS * 2);
      expect(w.a.said).toHaveLength(1);
      w.a.finish();
      w.clock.advance(REMIND_MS - 1);
      expect(w.a.said).toHaveLength(1);
      w.clock.advance(1);
      expect(w.a.said).toHaveLength(2);
      expect(w.a.last()).toEqual(ask);
      // A reminder does not hold the letters.
      expect(f.view()).toMatchObject({ listening: false, nudge: false });
      w.a.finish();
      // Someone else's clip: the reminder waits for the quiet.
      w.a.others(true);
      w.clock.advance(REMIND_MS * 2);
      expect(w.a.said).toHaveLength(2);
      w.a.others(false);
      w.clock.advance(REMIND_MS);
      expect(w.a.said).toHaveLength(1 + MAX_REMINDERS);
      expect(f.view().nudge).toBe(false);
      w.a.finish();
      expect(f.view().nudge).toBe(true);
      w.clock.advance(REMIND_MS * 5);
      expect(w.a.said).toHaveLength(1 + MAX_REMINDERS);
      // The ear is a touch: the nudge goes, and the count starts over in the next quiet.
      f.hear();
      expect(f.view().nudge).toBe(false);
      w.a.finish();
      w.clock.advance(REMIND_MS);
      expect(w.a.said).toHaveLength(3 + MAX_REMINDERS);
      w.a.finish();
      await f.choose(right(f));
      w.a.finish();
      expect(f.view().stage).toBe('reward');
      const said = w.a.said.length;
      w.clock.advance(REMIND_MS * 5);
      expect(w.a.said).toHaveLength(said);
      expect(f.view().nudge).toBe(false);
      // The next magic asks with a hold again.
      await f.next();
      expect(f.view()).toMatchObject({ stage: 'play', task: { kind: 'blend' }, listening: true });
      expect(w.a.last()).toEqual(['slot:line:blend']);
      w.a.finish();
      // Blend letters are held during the ask, then each says its sound; once all are heard the reminder is "say them fast".
      for (let i = 0; i < 3; i++) {
        f.tapLetter(i);
        w.a.finish();
      }
      w.clock.advance(REMIND_MS);
      expect(w.a.last()).toEqual(['slot:line:blendReady']);
      f.dispose();
      expect(w.clock.pending()).toBe(0);
    } finally {
      await w.done();
    }
  });

  it('in the browser an ask that could not play is said at the first touch, and holds the letters then', async () => {
    const w = await world({ whenReady: true });
    try {
      w.a.silence(true);
      const f = await w.open();
      expect(f.view().listening).toBe(false);
      expect(w.a.waiting()).toBe(1);
      w.a.touch();
      expect(f.view().listening).toBe(true);
      expect(w.a.said).toHaveLength(2);
      expect(w.a.last()).toEqual(w.a.said[0]);
      w.a.finish();
      expect(f.view().listening).toBe(false);
      f.dispose();
    } finally {
      await w.done();
    }
  });

  it('the play save is never awaited: a slow save holds back no tap, and a closing garden hushes only its own speech', async () => {
    const w = await world({ recorded: false });
    try {
      const f = await w.open();
      await solve(f);
      await f.next();
      await solve(f);
      await f.next();
      const word = f.view().task!.target;
      // From here every save hangs: the garden plays on.
      const rt = w.runtime();
      const put = rt.putSetting.bind(rt);
      const held: (() => void)[] = [];
      rt.putSetting = (...args: Parameters<typeof put>) => new Promise<void>((resolve) => held.push(() => void put(...args).then(resolve)));
      const [a, b, c] = tilesFor(f, word);
      await f.place(a!);
      await f.place(b!);
      expect(f.view().placed).toEqual([a, b]);
      f.unplace(1);
      await f.place(b!);
      await f.place(c!);
      expect(f.view()).toMatchObject({ stage: 'done', reward: { kind: 'spell', value: word } });
      expect(held.length).toBeGreaterThan(0);
      for (const go of held) go();
      expect(await w.rows()).toHaveLength(3);
      f.dispose();
      expect(w.a.hushes()).toBe(0);
    } finally {
      await w.done();
    }
  });
});
