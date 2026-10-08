// Mini-game words (M9): Word Golf clues and lines, Cargo Commander copy, the host words. Part of
// validate:content. The packs are the ones the app ships, composed as the app composes them.
import cargoJson from '../../../content/themes/elevator-quest/minigames/cargo.json';
import hostJson from '../../../content/themes/elevator-quest/minigames/host.json';
import wordGolfJson from '../../../content/themes/elevator-quest/minigames/wordGolf.json';
import { generateItem, BUILT_IN_GENERATORS, generatorKey } from '../../engine';
import { SHIPPED_PACK } from '../../engine/testing/support';
import { CARGO, cargoBrief, spellingWords, validateCargoCopy, validateHostCopy, validateWordGolf, wordClues, wordLeaks, wordStem, WORD_GOLF } from '../elevator-quest/content/minigames';
import { MINI_GAMES } from '../elevator-quest/minigames/catalog';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const codes = (r: { issues: { code: string }[] }) => [...new Set(r.issues.map((i) => i.code))].sort();

describe('Word Golf words', () => {
  it('the shipped words are valid against the shipped packs', () => {
    const r = validateWordGolf(wordGolfJson, { pack: SHIPPED_PACK });
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('there are 30 to 40 words, each in one activity, each with clues, ids that never contain the word', () => {
    const refs = spellingWords(SHIPPED_PACK);
    expect(refs.length).toBeGreaterThanOrEqual(30);
    expect(refs.length).toBeLessThanOrEqual(40);
    expect(new Set(refs.map((r) => r.id)).size).toBe(refs.length);
    for (const r of refs) {
      expect(r.id.includes(r.word)).toBe(false);
      expect(wordClues(r.id)).not.toBeNull();
    }
  });

  it('every item the word-golf activities can present finds its clues, and no clue says the word', () => {
    for (const a of SHIPPED_PACK.activities.filter((x) => x.generator.id === 'literacy.spelling')) {
      const g = BUILT_IN_GENERATORS.get(generatorKey(a.generator.id, a.generator.version))!;
      for (let i = 0; i < 60; i++) {
        const item = generateItem(g, a.params, `wg${i}`);
        const word = String(item.response.options.find((o) => o.correct)!.value);
        const clues = wordClues(item.prompt.wordId)!;
        for (const text of [clues.blank, clues.meaning, clues.phonics]) expect(text.toLowerCase().includes(word)).toBe(false);
      }
    }
  });

  it('finds a word, its stem, or a word spelled across neighbours', () => {
    expect(wordStem('gate')).toBe('gat');
    expect(wordStem('cab')).toBe('cab');
    expect(wordLeaks('Ride in the cabin.', 'cab')).toEqual(['cabin']);
    expect(wordLeaks('Open the gates.', 'gate')).toEqual(['gates']);
    expect(wordLeaks('Clap it: mag, net.', 'magnet')).toEqual(['mag net']);
    expect(wordLeaks('A thick wire rope.', 'cable')).toEqual([]);
  });

  it('refuses a clue that gives the word away, a line that names a word, a missing blank, gaps in coverage, and unknown entries', () => {
    const bad = clone(wordGolfJson) as typeof wordGolfJson & { words: Record<string, { blank: string; meaning: string; phonics: string }>; help: Record<string, unknown>; misconceptions: Record<string, string> };
    bad.words.w01!.meaning = 'Ride in the cab to the top.';
    bad.words.w19!.phonics = 'It rhymes with gates and plates.';
    bad.words.w02!.blank = 'Turn the nut tight.';
    bad.lines.spell = 'Spell it like you spell ship.';
    bad.words.zz9 = { blank: 'A ___ here.', meaning: 'Nothing at all here.', phonics: 'No sounds at all.' };
    delete (bad.words as Record<string, unknown>).w03;
    delete (bad.help as Record<string, unknown>).revealPattern;
    bad.help.countStrategy = { label: 'COUNT', line: 'Count it.' };
    delete (bad.misconceptions as Record<string, string | undefined>)['spelling.silentE'];
    bad.misconceptions['spelling.madeUp'] = 'Not a cause.';
    bad.words.w04!.meaning = 'A box — with sides.';
    bad.words.w05!.meaning = 'Ask Sam about it at the shop.';
    const r = validateWordGolf(bad, { pack: SHIPPED_PACK });
    expect(codes(r)).toEqual(
      expect.arrayContaining(['leak.word', 'leak.line', 'copy.blank', 'ref.unknownWord', 'missing.word', 'missing.help', 'ref.unknownHelp', 'missing.misconception', 'ref.unknownMisconception', 'copy.dash', 'copy.properNoun']),
    );
    expect(r.issues.filter((i) => i.code === 'leak.word').map((i) => i.path).sort()).toEqual(['words.w01.meaning', 'words.w02.blank', 'words.w04.meaning', 'words.w19.phonics']);
  });

  it('Lifty lines and labels fill their placeholders', () => {
    expect(WORD_GOLF.lines.holeDone.replace('{hole}', '2')).toBe('Hole 2 is done.');
    expect(Object.keys(WORD_GOLF.help).sort()).toEqual(['phonicsHint', 'revealPattern', 'showAnswer']);
  });
});

describe('Cargo Commander words', () => {
  it('the shipped copy is valid against the shipped packs', () => {
    const r = validateCargoCopy(cargoJson, { pack: SHIPPED_PACK });
    expect(r.issues).toEqual([]);
  });

  it('every item the cargo activities can present gets a full brief with its numbers marked, never the answer (except an exact load, whose target is given)', () => {
    for (const a of SHIPPED_PACK.activities.filter((x) => x.generator.id === 'quantity.twoDigit')) {
      const g = BUILT_IN_GENERATORS.get(generatorKey(a.generator.id, a.generator.version))!;
      for (let i = 0; i < 60; i++) {
        const item = generateItem(g, a.params, `cc${i}`);
        const brief = cargoBrief(item.prompt)!;
        expect(brief).not.toBeNull();
        expect(brief.text).not.toMatch(/[{}]/);
        const answer = Number(item.response.options.find((o) => o.correct)!.value);
        const numbers = (brief.text.match(/\d+/g) ?? []).map(Number);
        if (item.prompt.kind !== 'exactLoad') expect(numbers).not.toContain(answer);
        const marked = brief.marks.map(([s, e]) => brief.text.slice(s, e));
        for (const n of numbers) expect(marked).toContain(String(n));
      }
    }
  });

  it('refuses the answer outside SHOW ME, an unknown placeholder, capitals that are not emphasis words, and coverage gaps', () => {
    const bad = clone(cargoJson);
    bad.copy.briefs.twoDeliveries = 'Load the TOTAL: {answer} kg.';
    bad.copy.cues.right = 'Just right at {total} kg.';
    bad.copy.briefs.compare = 'Make them EQUAL: {heavy} kg and {light} kg.';
    delete (bad.helpLabels as Record<string, string | undefined>).jumpStrategy;
    (bad.helpLabels as Record<string, string>).countStrategy = 'COUNT';
    delete (bad.misconceptions as Record<string, string | undefined>)['quantity.forgotTheCarry'];
    (bad.misconceptions as Record<string, string>)['quantity.madeUp'] = 'Not a cause.';
    bad.copy.cues.notRight = 'That was wrong.';
    const r = validateCargoCopy(bad, { pack: SHIPPED_PACK });
    expect(codes(r)).toEqual(expect.arrayContaining(['leak.answer', 'copy.unknownPlaceholder', 'copy.emphasis', 'missing.help', 'ref.unknownHelp', 'missing.misconception', 'ref.unknownMisconception', 'copy.internal']));
  });

  it('the screen copy has the shape the Cargo Commander screen reads, and lines for weighing that never say the answer', () => {
    expect(CARGO.copy.cues.tooHeavy).toBe('Too heavy. Take something off.');
    expect(CARGO.copy.cues.notEnough).toBe('Not enough yet.');
    expect(cargoBrief({ kind: 'compare', a: 52, b: 27 })!.text).toBe('This pallet has 27 kg. The other pallet has 52 kg. Add MORE to make them the SAME.');
    expect(cargoBrief({ kind: 'nope' })).toBeNull();
  });
});

describe('mini-game host words', () => {
  it('name every game in the catalog', () => {
    const r = validateHostCopy(hostJson, { titleKeys: MINI_GAMES.map((g) => g.titleKey) });
    expect(r.issues).toEqual([]);
  });

  it('refuse a missing or unknown game', () => {
    const bad = clone(hostJson) as typeof hostJson & { entrance: Record<string, string> };
    delete (bad.entrance as Record<string, string | undefined>).wordGolf;
    bad.entrance.chess = 'PLAY CHESS';
    expect(codes(validateHostCopy(bad, { titleKeys: MINI_GAMES.map((g) => g.titleKey) }))).toEqual(['missing.game', 'ref.unknownGame']);
  });
});
