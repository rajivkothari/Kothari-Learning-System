// Mini-game words (M9): Word Golf (Floor 20), Cargo Commander (Floor 4) and the host around them.
// Pure: no React, no Skia. Child-facing text is data in content/themes/elevator-quest/minigames/;
// this file loads it, declares what each line may say, and validates it against the packs.
//
// - wordGolf.json: per spelling word (keyed by the pack's word id, never the word) a sentence with a
//   blank, a meaning clue and a sound hint; Lifty's lines; the help words; a line per misspelling cause.
//   No clue may contain its word or the word's stem (`leak.word`), and no line, label or help may name
//   any word the pack can ask for (`leak.line`): those show while any word is being spelled.
// - cargo.json: `copy` has the screen's CargoCopySchema shape (minigames/cargo/copy.ts), plus a line per
//   cause the two-digit generator can tag and the help labels. Placeholders are givens only; the answer
//   appears only in the SHOW ME hints (`leak.answer`).
// - host.json: the PLAY entrance, BACK TO ELEVATOR, loading and trouble words (FW's HostCopy shape).
//
// Copy rules are the reading words' rules (reading.copyProblems): no internal vocabulary, no dashes,
// plain characters, known placeholders only.
import { z } from 'zod';

import cargoJson from '../../../../content/themes/elevator-quest/minigames/cargo.json';
import hostJson from '../../../../content/themes/elevator-quest/minigames/host.json';
import wordGolfJson from '../../../../content/themes/elevator-quest/minigames/wordGolf.json';
import { BUILT_IN_GENERATORS, generatorKey, type Activity, type ContentPack } from '../../../engine';
import { fill } from '../../content/missionCopy';
import { copyProblems, midSentenceCapitals } from './reading';

export const SPELLING_GENERATOR = 'literacy.spelling';
export const TWO_DIGIT_GENERATOR = 'quantity.twoDigit';

export interface MiniGameCopyIssue {
  code: string;
  path: string;
  message: string;
}

const Text = z.string().min(1).max(140);
const Ids = z.string().regex(/^[a-z][a-z0-9-]*$/);
const parseIssues = (e: z.ZodError): MiniGameCopyIssue[] => e.issues.map((i) => ({ code: `schema.${i.code}`, path: i.path.join('.'), message: i.message }));
/** Ids and tags must never reach the screen. */
const IDS_IN_TEXT = /\b(spelling|cargo|quantity|literacy|ela|math)\.[a-z]/i;

// ---------------------------------------------------------------------------------------------
// Word Golf

/** Lifty's lines and the placeholders each may use. */
export const WORD_GOLF_LINES = {
  intro: [],
  listen: [],
  spell: [],
  tryAgain: [],
  spelled: [],
  spelledHelped: [],
  inCup: [],
  holeDone: ['hole'],
  courseDone: [],
  resume: [],
  fresh: [],
} as const satisfies Record<string, readonly string[]>;
export const WORD_GOLF_LABELS = {
  title: [],
  hole: ['hole'],
  check: [],
  clear: [],
  undo: [],
  hearAgain: [],
  help: [],
  nextHole: [],
  finish: [],
  back: [],
} as const satisfies Record<string, readonly string[]>;
/** Capitalised words a clue sentence may have inside it (no person's name slips in). */
const CLUE_NAMES = new Set(['Lifty', 'Floor']);
/** A clue is short: one or two plain sentences. */
export const CLUE_CHARS = { min: 10, max: 110 } as const;

const keyed = <T extends Record<string, readonly string[]>>(keys: T) => z.object(Object.fromEntries(Object.keys(keys).map((k) => [k, Text])) as Record<keyof T, typeof Text>).strict();

const WordClueSchema = z
  .object({
    /** A short sentence with "___" where the word goes. */
    blank: Text,
    /** What the word means, in other words. */
    meaning: Text,
    /** A sound or syllable hint: the SOUND HINT help step. */
    phonics: Text,
    /** Optional icon id for a picture clue. */
    picture: Ids.optional(),
  })
  .strict();

export const WordGolfCopySchema = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.literal('elevator-quest'),
    game: z.literal('word-golf'),
    /** The pack whose words these are. */
    pack: z.string().min(1),
    labels: keyed(WORD_GOLF_LABELS),
    lines: keyed(WORD_GOLF_LINES),
    /** Help kind (the spelling policy's) -> the control's label and Lifty's line. */
    help: z.record(z.string(), z.object({ label: Text, line: Text }).strict()),
    /** Misspelling cause (spelling.* tag) -> Lifty's line. Never the word. */
    misconceptions: z.record(z.string(), Text),
    /** Word id -> its clues. */
    words: z.record(z.string(), WordClueSchema),
  })
  .strict();
export type WordGolfCopy = z.infer<typeof WordGolfCopySchema>;
export type WordClues = z.infer<typeof WordClueSchema>;

export const WORD_GOLF: WordGolfCopy = WordGolfCopySchema.parse(wordGolfJson);

/** The clues for a word id (the item's `prompt.wordId`), or null. */
export function wordClues(wordId: unknown, copy: WordGolfCopy = WORD_GOLF): WordClues | null {
  return typeof wordId === 'string' ? (copy.words[wordId] ?? null) : null;
}
/** The narration key of a word (AA's recording: the word, a short sentence, the word). */
export const wordNarrationKey = (wordId: string): string => `word.${wordId}`;
export const wordGolfLine = (key: keyof typeof WORD_GOLF_LINES, vars: Record<string, string | number> = {}, copy: WordGolfCopy = WORD_GOLF): string => fill(copy.lines[key], vars);
export const wordGolfLabel = (key: keyof typeof WORD_GOLF_LABELS, vars: Record<string, string | number> = {}, copy: WordGolfCopy = WORD_GOLF): string => fill(copy.labels[key], vars);
export const wordGolfHelp = (kind: string, copy: WordGolfCopy = WORD_GOLF): { label: string; line: string } | null => copy.help[kind] ?? null;
export const spellingMisconceptionLine = (tag: string | null | undefined, copy: WordGolfCopy = WORD_GOLF): string | null => (tag ? (copy.misconceptions[tag] ?? null) : null);

export interface SpellingWordRef {
  activity: Activity;
  id: string;
  word: string;
}

/** Every spelling word in the pack, with the activity it belongs to. */
export function spellingWords(pack: ContentPack): SpellingWordRef[] {
  return pack.activities
    .filter((a) => a.generator.id === SPELLING_GENERATOR)
    .flatMap((activity) => {
      const words = (activity.params as { words?: unknown }).words;
      return Array.isArray(words) ? (words as { id: string; word: string }[]).map((w) => ({ activity, id: w.id, word: w.word })) : [];
    });
}

const tokens = (text: string) => text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
/** The part of a word a clue must not show either: the word without a final silent e ("gate" -> "gat"). */
export const wordStem = (word: string): string => (word.length >= 4 && word.endsWith('e') ? word.slice(0, -1) : word);

/**
 * How `text` gives `word` away, if it does: a word of the text containing the word or its stem
 * ("cabin" for cab, "gates" for gate), or two to four neighbouring words that spell it ("mag net").
 * Conservative on purpose: a clue that trips it is reworded.
 */
export function wordLeaks(text: string, word: string): string[] {
  const stem = wordStem(word);
  const words = tokens(text);
  const found = new Set<string>();
  for (const t of words) if (t.includes(stem)) found.add(t);
  for (let i = 0; i < words.length; i++) {
    let joined = words[i] as string;
    for (let j = i + 1; j < Math.min(words.length, i + 4); j++) {
      joined += words[j] as string;
      if (joined === word || joined === stem) found.add(words.slice(i, j + 1).join(' '));
    }
  }
  return [...found];
}

const helpKindsOf = (pack: ContentPack, generator: string): Set<string> => {
  const used = new Set(pack.activities.filter((a) => a.generator.id === generator).map((a) => a.scaffoldingPolicy));
  return new Set(pack.scaffoldingPolicies.filter((p) => used.has(p.id)).flatMap((p) => p.steps.map((s) => s.kind)));
};
const tagsOf = (pack: ContentPack, generator: string): Set<string> =>
  new Set(pack.activities.filter((a) => a.generator.id === generator).flatMap((a) => BUILT_IN_GENERATORS.get(generatorKey(a.generator.id, a.generator.version))?.misconceptions ?? []));

/**
 * Checks, as explicit relationships between the words and the pack:
 * - every spelling word in the pack has clues, no clues exist for an unknown id, and a word id is used
 *   by one activity only (`missing.word`, `ref.unknownWord`, `dup.word`)
 * - a blank has exactly one "___"; clues are 10 to 110 characters; copy rules on every string; a
 *   capitalised word inside a clue is Lifty or Floor (`copy.blank`, `copy.length`, `copy.*`, `copy.properNoun`)
 * - no clue contains its word or stem, and no line, label, help or cause line names any word of the
 *   pack (`leak.word`, `leak.line`)
 * - help words for every help kind the spelling policies offer and none for others (`missing.help`,
 *   `ref.unknownHelp`); a line for every cause the spelling generator can tag and none for others
 *   (`missing.misconception`, `ref.unknownMisconception`)
 */
export function validateWordGolf(raw: unknown, ctx: { pack: ContentPack }): { ok: boolean; issues: MiniGameCopyIssue[]; copy: WordGolfCopy | null } {
  const parsed = WordGolfCopySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parseIssues(parsed.error), copy: null };
  const copy = parsed.data;
  const issues: MiniGameCopyIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const checkCopy = (path: string, text: string, allowed: readonly string[] = []) => {
    for (const p of copyProblems(text, allowed)) err(p.code, path, p.message);
    if (IDS_IN_TEXT.test(text)) err('copy.internal', path, `An id in "${text}"`);
  };

  const refs = spellingWords(ctx.pack);
  if (refs.length === 0) err('ref.pack', 'pack', `Pack "${ctx.pack.id}" has no spelling words`);
  const byId = new Map<string, SpellingWordRef>();
  for (const ref of refs) {
    if (byId.has(ref.id)) err('dup.word', `words.${ref.id}`, `Word id "${ref.id}" is used by more than one activity`);
    byId.set(ref.id, ref);
    if (!copy.words[ref.id]) err('missing.word', `words.${ref.id}`, `No clues for word "${ref.id}" (activity "${ref.activity.id}")`);
  }
  const allWords = [...new Set(refs.map((r) => r.word))];

  for (const [id, clue] of Object.entries(copy.words)) {
    const at = `words.${id}`;
    const ref = byId.get(id);
    if (!ref) err('ref.unknownWord', at, `No spelling word "${id}" in pack "${ctx.pack.id}"`);
    if (clue.blank.split('___').length !== 2) err('copy.blank', `${at}.blank`, 'A blank sentence has exactly one "___" where the word goes');
    for (const field of ['blank', 'meaning', 'phonics'] as const) {
      const text = clue[field];
      const path = `${at}.${field}`;
      checkCopy(path, field === 'blank' ? text.replace('___', 'blank') : text);
      if (text.length < CLUE_CHARS.min || text.length > CLUE_CHARS.max) err('copy.length', path, `A clue is ${CLUE_CHARS.min} to ${CLUE_CHARS.max} characters (${text.length})`);
      for (const w of midSentenceCapitals(text)) if (!CLUE_NAMES.has(w)) err('copy.properNoun', path, `"${w}" is not a known name`);
      if (ref) for (const leak of wordLeaks(text, ref.word)) err('leak.word', path, `Gives the word away: "${leak}"`);
    }
  }

  // Lines that show while any word is up: never one of the words.
  const named = (text: string) => allWords.filter((w) => tokens(text).includes(w));
  const general: [string, string, readonly string[]][] = [
    ...Object.entries(copy.lines).map(([k, t]): [string, string, readonly string[]] => [`lines.${k}`, t, WORD_GOLF_LINES[k as keyof typeof WORD_GOLF_LINES]]),
    ...Object.entries(copy.labels).map(([k, t]): [string, string, readonly string[]] => [`labels.${k}`, t, WORD_GOLF_LABELS[k as keyof typeof WORD_GOLF_LABELS]]),
    ...Object.entries(copy.help).flatMap(([k, h]): [string, string, readonly string[]][] => [
      [`help.${k}.label`, h.label, []],
      [`help.${k}.line`, h.line, []],
    ]),
    ...Object.entries(copy.misconceptions).map(([k, t]): [string, string, readonly string[]] => [`misconceptions.${k}`, t, []]),
  ];
  for (const [path, text, allowed] of general) {
    checkCopy(path, text, allowed);
    for (const w of named(text)) err('leak.line', path, `Names the word "${w}", which a hole can ask for`);
  }

  const kinds = helpKindsOf(ctx.pack, SPELLING_GENERATOR);
  for (const k of kinds) if (!copy.help[k]) err('missing.help', `help.${k}`, `No words for help "${k}"`);
  for (const k of Object.keys(copy.help)) if (!kinds.has(k)) err('ref.unknownHelp', `help.${k}`, `No spelling policy offers help "${k}"`);
  const tags = tagsOf(ctx.pack, SPELLING_GENERATOR);
  for (const t of tags) if (!copy.misconceptions[t]) err('missing.misconception', `misconceptions.${t}`, `No line for "${t}"`);
  for (const t of Object.keys(copy.misconceptions)) if (!tags.has(t)) err('ref.unknownMisconception', `misconceptions.${t}`, `The spelling generator never tags "${t}"`);
  if (!ctx.pack.misconceptions.some((m) => m.id.startsWith('spelling.'))) err('ref.pack', 'misconceptions', 'The pack has no spelling causes');
  return { ok: issues.length === 0, issues, copy };
}

// ---------------------------------------------------------------------------------------------
// Cargo Commander

/** Every line of the screen's copy and the placeholders it may use (the screen fills only these). */
export const CARGO_COPY_CONTRACT = {
  buttons: { weigh: [], next: [], finish: [], back: [], toolkit: [], toolkitClose: [], help: [], showMe: [] },
  briefs: {
    exactLoad: ['target'],
    capacityRemaining: ['capacity', 'loaded'],
    missingAmount: ['order', 'have'],
    twoDeliveries: ['a', 'b'],
    compare: ['heavy', 'light', 'a', 'b'],
    twoStep: ['capacity', 'a', 'b'],
  },
  cues: { start: [], weighing: [], tooHeavy: [], notEnough: [], notRight: [], right: [], delivered: [], allDone: [], resume: [], fresh: [], trouble: [], unsupported: [], full: [] },
  hints: {
    tensAndOnes: [],
    tensAndOnesEach: ['n', 'tens', 'tensValue', 'ones'],
    jumpUp: ['from', 'nextTen', 'to'],
    jumpAdd: ['a', 'tens', 'ones'],
    jumpCrates: ['target'],
    // SHOW ME (demonstrated) is the only place the answer is said.
    showFiller: ['tens', 'ones', 'answer'],
    showCrates: ['answer'],
  },
  labels: { dock: [], freight: [], scale: [], sack: [], box: [], tens: [], ones: [], aboard: [], maxPlate: ['capacity'], order: [], orderA: [], orderB: [], otherPallet: [], target: [], max: [], delivered: [] },
  a11y: {
    addSack: [],
    addBox: [],
    sacksAboard: ['count'],
    boxesAboard: ['count'],
    noSacks: [],
    noBoxes: [],
    loadCrate: ['weight'],
    unloadCrate: ['weight'],
    pallet: ['weight'],
    scale: ['low', 'high'],
    readoutHidden: [],
    readout: ['total'],
  },
  toolkit: { title: [], blocks: [], numberLine: [], workArea: [], clear: [], addTen: [], addOne: [], takeTen: [], takeOne: [], jumpTen: [], jumpOne: [], start: [], back: [], padHint: [] },
} as const satisfies Record<string, Record<string, readonly string[]>>;
type Contract = typeof CARGO_COPY_CONTRACT;
/** The two-digit kinds, and the brief each needs. */
export const CARGO_KINDS = Object.keys(CARGO_COPY_CONTRACT.briefs) as (keyof Contract['briefs'])[];

const section = <S extends Record<string, readonly string[]>>(s: S) => keyed(s);
export const CargoCopySchema = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.literal('elevator-quest'),
    game: z.literal('cargo-commander'),
    pack: z.string().min(1),
    note: z.string().optional(),
    copy: z
      .object({
        title: Text,
        buttons: section(CARGO_COPY_CONTRACT.buttons),
        unit: Text,
        /** Words the screen marks wherever they appear (weight and underline, never colour alone). */
        emphasis: z.array(z.string().regex(/^[A-Z]+$/)).max(12),
        briefs: section(CARGO_COPY_CONTRACT.briefs),
        cues: section(CARGO_COPY_CONTRACT.cues),
        hints: section(CARGO_COPY_CONTRACT.hints),
        labels: section(CARGO_COPY_CONTRACT.labels),
        a11y: section(CARGO_COPY_CONTRACT.a11y),
        toolkit: section(CARGO_COPY_CONTRACT.toolkit),
      })
      .strict(),
    /** Help kind (the cargo policy's) -> the help control's label. */
    helpLabels: z.record(z.string(), Text),
    /** Cause (quantity.* tag the two-digit generator emits) -> Lifty's line after a load with that slip. */
    misconceptions: z.record(z.string(), Text),
  })
  .strict();
export type CargoCopyFile = z.infer<typeof CargoCopySchema>;
export type CargoScreenCopy = CargoCopyFile['copy'];

export const CARGO: CargoCopyFile = CargoCopySchema.parse(cargoJson);

/** A job's brief for an item's prompt, with the ranges to mark (numbers and emphasis words). Never the answer. */
export function cargoBrief(prompt: Readonly<Record<string, string | number | boolean>>, copy: CargoCopyFile = CARGO): { text: string; marks: [number, number][] } | null {
  const kind = prompt.kind;
  if (typeof kind !== 'string' || !(kind in copy.copy.briefs)) return null;
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(prompt)) if (typeof v === 'number') vars[k] = v;
  if (typeof prompt.a === 'number' && typeof prompt.b === 'number') Object.assign(vars, { heavy: Math.max(prompt.a, prompt.b), light: Math.min(prompt.a, prompt.b) });
  const text = fill(copy.copy.briefs[kind as keyof CargoScreenCopy['briefs']], vars);
  if (/\{[a-zA-Z]+\}/.test(text)) return null;
  const marks = [...text.matchAll(new RegExp(`\\b(\\d+|${copy.copy.emphasis.join('|') || '(?!)'})\\b`, 'g'))].map((m): [number, number] => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
  return { text, marks };
}
export const cargoMisconceptionLine = (tag: string | null | undefined, copy: CargoCopyFile = CARGO): string | null => (tag ? (copy.misconceptions[tag] ?? null) : null);

/**
 * Checks: the schema (every line the screen reads, nothing else); copy rules and known placeholders per
 * line (`copy.*`); the answer only in the SHOW ME hints (`leak.answer`, by the contract); a brief for
 * every kind the pack's two-digit activities use (`missing.brief`); upper-case words in a brief are
 * emphasis words (`copy.emphasis`); a help label for every help kind the cargo policies offer and none
 * for others (`missing.help`, `ref.unknownHelp`); a line for every cause the generator can tag and none
 * for others (`missing.misconception`, `ref.unknownMisconception`).
 */
export function validateCargoCopy(raw: unknown, ctx: { pack: ContentPack }): { ok: boolean; issues: MiniGameCopyIssue[]; copy: CargoCopyFile | null } {
  const parsed = CargoCopySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parseIssues(parsed.error), copy: null };
  const file = parsed.data;
  const issues: MiniGameCopyIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const checkCopy = (path: string, text: string, allowed: readonly string[] = []) => {
    for (const p of copyProblems(text, allowed)) err(p.code === 'copy.unknownPlaceholder' && text.includes('{answer}') ? 'leak.answer' : p.code, path, p.message);
    if (IDS_IN_TEXT.test(text)) err('copy.internal', path, `An id in "${text}"`);
  };
  checkCopy('copy.title', file.copy.title);
  checkCopy('copy.unit', file.copy.unit);
  for (const [name, lines] of Object.entries(CARGO_COPY_CONTRACT)) {
    const got = file.copy[name as keyof Contract] as Record<string, string>;
    for (const [key, allowed] of Object.entries(lines)) checkCopy(`copy.${name}.${key}`, got[key] ?? '', allowed);
  }
  const used = new Set(ctx.pack.activities.filter((a) => a.generator.id === TWO_DIGIT_GENERATOR).map((a) => (a.params as { kind?: string }).kind));
  for (const k of used) if (!k || !(k in file.copy.briefs)) err('missing.brief', `copy.briefs.${String(k)}`, `No brief for kind "${String(k)}"`);
  for (const [k, brief] of Object.entries(file.copy.briefs)) {
    for (const w of brief.match(/\b[A-Z]{3,}\b/g) ?? []) if (!file.copy.emphasis.includes(w)) err('copy.emphasis', `copy.briefs.${k}`, `"${w}" is set in capitals but is not an emphasis word`);
  }
  for (const [k, t] of Object.entries(file.helpLabels)) checkCopy(`helpLabels.${k}`, t);
  for (const [k, t] of Object.entries(file.misconceptions)) checkCopy(`misconceptions.${k}`, t);
  const kinds = helpKindsOf(ctx.pack, TWO_DIGIT_GENERATOR);
  for (const k of kinds) if (!file.helpLabels[k]) err('missing.help', `helpLabels.${k}`, `No label for help "${k}"`);
  for (const k of Object.keys(file.helpLabels)) if (!kinds.has(k)) err('ref.unknownHelp', `helpLabels.${k}`, `No cargo policy offers help "${k}"`);
  const tags = tagsOf(ctx.pack, TWO_DIGIT_GENERATOR);
  for (const t of tags) if (!file.misconceptions[t]) err('missing.misconception', `misconceptions.${t}`, `No line for "${t}"`);
  for (const t of Object.keys(file.misconceptions)) if (!tags.has(t)) err('ref.unknownMisconception', `misconceptions.${t}`, `The two-digit generator never tags "${t}"`);
  return { ok: issues.length === 0, issues, copy: file };
}

// ---------------------------------------------------------------------------------------------
// Host (FW): the entrance on the landing, BACK TO ELEVATOR, loading and trouble.

const byTitleKey = z.record(z.string(), Text);
export const HostCopySchema = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.literal('elevator-quest'),
    note: z.string().optional(),
    /** The game's name, by the catalog's titleKey. */
    games: byTitleKey,
    /** The landing's PLAY button, by titleKey. */
    entrance: byTitleKey,
    /** The same button when an unfinished game waits, by titleKey. */
    resume: byTitleKey,
    /** The entrance's word where the window has no room for the game's name. */
    play: Text,
    /** For screen readers: what the entrance does. */
    entranceHint: Text,
    back: Text,
    /** For screen readers: what BACK TO ELEVATOR does. */
    backHint: Text,
    loading: Text,
    missing: Text,
    trouble: Text,
    placeholder: Text,
  })
  .strict();
export type HostCopyFile = z.infer<typeof HostCopySchema>;
export const MINI_GAME_HOST: HostCopyFile = HostCopySchema.parse(hostJson);

/** Checks: words for every game's titleKey in games, entrance and resume, and for no other (`missing.game`, `ref.unknownGame`); copy rules. */
export function validateHostCopy(raw: unknown, ctx: { titleKeys: readonly string[] }): { ok: boolean; issues: MiniGameCopyIssue[]; copy: HostCopyFile | null } {
  const parsed = HostCopySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parseIssues(parsed.error), copy: null };
  const copy = parsed.data;
  const issues: MiniGameCopyIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ code, path, message });
  for (const name of ['games', 'entrance', 'resume'] as const) {
    for (const k of ctx.titleKeys) if (!copy[name][k]) err('missing.game', `${name}.${k}`, `No words for game "${k}"`);
    for (const [k, t] of Object.entries(copy[name])) {
      if (!ctx.titleKeys.includes(k)) err('ref.unknownGame', `${name}.${k}`, `No game "${k}" in the catalog`);
      for (const p of copyProblems(t)) err(p.code, `${name}.${k}`, p.message);
    }
  }
  for (const key of ['play', 'entranceHint', 'back', 'backHint', 'loading', 'missing', 'trouble', 'placeholder'] as const) for (const p of copyProblems(copy[key])) err(p.code, key, p.message);
  return { ok: issues.length === 0, issues, copy };
}
