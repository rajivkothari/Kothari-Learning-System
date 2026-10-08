// Reading jobs (M8): the words for the reading pack's authored items, keyed by item id. Pure: no
// React, no Skia.
//
// The pack (content/packs/reading.json) says what is learned and scored: each item's id, its
// answer and its wrong answers with their likely misreadings. This catalog says what the learner
// reads and does: the note (source and sentences), the instruction line, the landing for an item
// answered by touching an object there, the names of the options for the card fallback, the key
// sentence(s) CLUE lights up, and the world's reaction when the job is done. Theme code never scores:
// it looks words up by the item id in the prompt.
//
// Three ways to answer (the activity's representation decides, the catalog repeats it so the words
// can be checked): "touch" an object on the open landing (choice; values are landing object ids),
// "ride" to a floor with the panel (a value 1..20), or "choose" a card (choice; values are card ids).
import { z } from 'zod';

import readingJson from '../../../../content/themes/elevator-quest/reading.json';
import type { Activity, ContentPack } from '../../../engine';
import { protectedNames } from '../../content/ipGuard';
import { fill } from '../../content/missionCopy';

export const READING_GENERATOR = 'literacy.authoredItem';
export const READING_MODES = ['touch', 'ride', 'choose'] as const;
export type ReadingMode = (typeof READING_MODES)[number];

/** How an activity's representation is answered in this theme. */
export const MODE_BY_REPRESENTATION: Readonly<Record<string, ReadingMode>> = { sceneObject: 'touch', numeral: 'ride', textCards: 'choose' };

/** A passage is short: 1 to 4 sentences, this many words in all. */
export const PASSAGE_WORDS = { min: 15, max: 60 } as const;

const Key = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const Line = z.string().min(3).max(120);
const ModeLines = z.object({ touch: Line, ride: Line, choose: Line }).strict();

const ReadingItemSchema = z
  .object({
    mode: z.enum(READING_MODES),
    /** touch only: the landing the job is answered on. */
    floor: z.number().int().optional(),
    /** Who or what the text is from, shown as the note's heading. */
    source: z.string().min(3).max(32),
    /** The text, one sentence per entry. */
    passage: z.array(z.string().min(3).max(140)).min(1).max(4),
    /** Index of the sentence CLUE lights up (the key sentence). */
    key: z.number().int().nonnegative(),
    /** The instruction line: what to do about the text. */
    ask: z.string().min(3).max(60),
    /** touch and choose: the name of every option value (the card fallback and accessibility labels). */
    options: z.record(Key, z.string().min(1).max(32)).optional(),
    /** The world's reaction once the job is done. */
    done: z.string().min(3).max(70),
  })
  .strict();

export const ReadingCopySchema = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.literal('elevator-quest'),
    /** The content pack whose items these words belong to. */
    pack: z.string().min(1),
    /** Lifty's and the note's own words around a reading job (READING_LINES says which, and their placeholders). */
    lines: z.record(z.string(), Line),
    /** Help kind (the reading policy's step kinds) -> the help line in each answer mode. */
    help: z.record(z.string(), ModeLines),
    /** Misconception tag -> Lifty's cue after that misreading. */
    misconceptions: z.record(z.string(), Line),
    items: z.record(Key, ReadingItemSchema),
  })
  .strict();

export type ReadingCopy = z.infer<typeof ReadingCopySchema>;
export type ReadingItem = z.infer<typeof ReadingItemSchema>;

export const READING: ReadingCopy = ReadingCopySchema.parse(readingJson);

/**
 * The lines a reading job needs, and the placeholders each may use:
 *   touched   a touched object that is not the one (its name): the consequence, never a verdict
 *   arrived   a ride that went somewhere else (the floor and its place name)
 *   again     a miss with no likely misreading to name (any mode: a touch, a ride, a card)
 *   noteOpen  the control that opens the folded note again; noteClose the note's control that folds it
 *   cards     the cards' group name for a screen reader (a card job, or a touch job whose landing
 *             cannot offer its things); the instruction stands over the cards
 */
export const READING_LINES: Readonly<Record<string, readonly string[]>> = {
  touched: ['label'],
  arrived: ['floor', 'place'],
  again: [],
  noteOpen: [],
  noteClose: [],
  cards: [],
};

/** A reading line filled with its values (READING_LINES); the key itself if the copy has none. */
export function readingLine(key: string, vars: Record<string, string | number> = {}, copy: ReadingCopy = READING): string {
  return fill(copy.lines[key] ?? key, vars);
}

/** Help words for a reading job, by help kind and mode (CLUE, SHOW ME); null when there are none. */
export function readingHelpLine(kind: string, mode: ReadingMode, vars: Record<string, string | number> = {}, copy: ReadingCopy = READING): string | null {
  const t = copy.help[kind]?.[mode];
  return t ? fill(t, vars) : null;
}

/** Lifty's cue after a misreading the item tagged; null when the tag has no words. */
export const readingMisconceptionLine = (tag: string | null | undefined, copy: ReadingCopy = READING): string | null => (tag ? (copy.misconceptions[tag] ?? null) : null);

/** The words for an item id (from the prompt), or null when the catalog has none. */
export function readingItem(copy: ReadingCopy, itemId: unknown): ReadingItem | null {
  return typeof itemId === 'string' ? (copy.items[itemId] ?? null) : null;
}

export const passageWords = (item: Pick<ReadingItem, 'passage'>): number => item.passage.join(' ').split(/\s+/).filter(Boolean).length;

/** Placeholders a help line may use, by help kind and mode. Anything else is a content error. */
export const HELP_PLACEHOLDERS: Readonly<Record<string, Readonly<Record<ReadingMode, readonly string[]>>>> = {
  showAnswer: { touch: ['label'], ride: ['revealed'], choose: ['label'] },
};

export interface AuthoredItemRef {
  activity: Activity;
  id: string;
  correct: number | string;
  distractors: { value: number | string; misconception?: string }[];
}

/** Every authored item in the pack, with the activity it belongs to. */
export function authoredItems(pack: ContentPack): AuthoredItemRef[] {
  return pack.activities
    .filter((a) => a.generator.id === READING_GENERATOR)
    .flatMap((activity) => {
      const items = (activity.params as { items?: unknown }).items;
      return Array.isArray(items) ? (items as Omit<AuthoredItemRef, 'activity'>[]).map((i) => ({ activity, id: i.id, correct: i.correct, distractors: i.distractors })) : [];
    });
}

export interface ReadingIssue {
  code: string;
  path: string;
  message: string;
}

export interface ReadingContext {
  /** The pack the items come from (the reading pack, or a pack composed with it). */
  pack: ContentPack;
  /** The floors a ride can go to. */
  floors: { min: number; max: number };
  /** The landing object ids on a floor, or null when the floor has no objects to touch. */
  objectsOn: (floor: number) => readonly string[] | null;
  /** Misconception tags that need words (everything the reading generator can emit). */
  tags: readonly string[];
  /** Capitalised words allowed inside a sentence: place names, Lifty, Floor. Anything else is flagged, so no person's name slips in. */
  names: ReadonlySet<string>;
}

const INTERNAL = /\b(practice|stretch|mastery|encounter|misconception|evidence|xp|points|score|correct|wrong|oops|superstar|question \d)\b|\b(reading|quantity|literacy|eq)\.[a-z]/i;
const ALLOWED_CHARS = /^[A-Za-z0-9 .,!?'":;(){}-]+$/;
const placeholders = (t: string) => [...t.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]!);

/** Child-facing copy rules shared by every reading string. */
export function copyProblems(text: string, allowedPlaceholders: readonly string[] = []): { code: string; message: string }[] {
  const out: { code: string; message: string }[] = [];
  if (INTERNAL.test(text)) out.push({ code: 'copy.internal', message: `Internal vocabulary in "${text}"` });
  const names = protectedNames(text);
  if (names.length > 0) out.push({ code: 'copy.protectedName', message: `Protected name(s) ${names.join(', ')} in "${text}"` });
  if (/[\u2012-\u2015]|\s-+\s/.test(text)) out.push({ code: 'copy.dash', message: `Use a full stop or comma, not a dash: "${text}"` });
  if (!ALLOWED_CHARS.test(text)) out.push({ code: 'copy.characters', message: `Plain letters, digits and basic punctuation only (straight quotes): "${text}"` });
  for (const p of placeholders(text)) if (!allowedPlaceholders.includes(p)) out.push({ code: 'copy.unknownPlaceholder', message: `"{${p}}" is not available here` });
  return out;
}

/** Capitalised words that do not start a sentence (after . ! ? : or an opening quote). */
export function midSentenceCapitals(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?:])\s+/)) {
    const words = sentence.replace(/^["']+/, '').split(/\s+/).slice(1);
    for (const w of words) {
      const bare = w.replace(/^["'(]+|[^A-Za-z]+$/g, '').replace(/'s$/, '');
      if (/^[A-Z]/.test(bare)) out.push(bare);
    }
  }
  return out;
}

/**
 * Checks, as explicit relationships between the words and the pack: every authored item has words
 * and no words exist for an unknown item; the mode matches how the activity is answered; a touch
 * item names a landing that has objects and every option is an object there; a ride item's answer
 * and wrong floors are real floors; choice items name every option and nothing else; passages have
 * 1 to 4 sentences of 15 to 60 words in all and the CLUE sentences exist; the instruction says what to
 * do (Touch, Ride, or a question for cards); copy rules (no internal vocabulary, protected names,
 * dashes, odd characters or unknown placeholders; capitalised words inside a sentence are known names);
 * help words for every help kind the reading policies can offer; and words for every misconception tag.
 */
export function validateReading(raw: unknown, ctx: ReadingContext): { ok: boolean; issues: ReadingIssue[]; copy: ReadingCopy | null } {
  const parsed = ReadingCopySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ code: `schema.${i.code}`, path: i.path.join('.'), message: i.message })), copy: null };
  const copy = parsed.data;
  const issues: ReadingIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const checkCopy = (path: string, text: string, allowed: readonly string[] = []) => {
    for (const p of copyProblems(text, allowed)) err(p.code, path, p.message);
    for (const w of midSentenceCapitals(text)) if (!ctx.names.has(w)) err('copy.properNoun', path, `"${w}" is not a known place or name`);
  };

  const refs = authoredItems(ctx.pack);
  if (refs.length === 0) err('ref.pack', 'pack', `Pack "${ctx.pack.id}" has no authored items for these words`);
  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref.id)) err('dup.item', `items.${ref.id}`, `Item id "${ref.id}" is used by more than one activity`);
    seen.add(ref.id);
    if (!copy.items[ref.id]) err('missing.item', `items.${ref.id}`, `No words for item "${ref.id}" (activity "${ref.activity.id}")`);
  }
  for (const id of Object.keys(copy.items)) if (!seen.has(id)) err('ref.unknownItem', `items.${id}`, `No authored item "${id}" in the pack`);

  for (const ref of refs) {
    const item = copy.items[ref.id];
    if (!item) continue;
    const at = `items.${ref.id}`;
    const mode = MODE_BY_REPRESENTATION[ref.activity.representation];
    if (!mode) err('ref.representation', at, `Activity "${ref.activity.id}" uses representation "${ref.activity.representation}", which has no reading mode`);
    else if (mode !== item.mode) err('ref.mode', at, `Activity "${ref.activity.id}" is answered by "${mode}", the words say "${item.mode}"`);
    const valueMode = ref.activity.answer.mode === 'value';
    if (valueMode !== (item.mode === 'ride')) err('ref.mode', at, `A ride is answered with a value, touch and cards with a choice ("${ref.activity.id}" takes a ${ref.activity.answer.mode})`);

    const values = [ref.correct, ...ref.distractors.map((d) => d.value)];
    if (item.mode === 'ride') {
      if (item.floor !== undefined) err('ref.floor', `${at}.floor`, 'A ride item has no landing of its own');
      if (item.options) err('ref.option', `${at}.options`, 'A ride item has no options to name');
      for (const v of values) {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < ctx.floors.min || v > ctx.floors.max) err('ref.floor', at, `${String(v)} is not a floor (${ctx.floors.min} to ${ctx.floors.max})`);
      }
      if (ref.activity.answer.mode === 'value' && (ref.activity.answer.min < ctx.floors.min || ref.activity.answer.max > ctx.floors.max)) err('ref.floor', at, `Activity "${ref.activity.id}" accepts floors outside the tower`);
      if (!/\bRide\b/.test(item.ask)) err('copy.ask', `${at}.ask`, 'A ride item says "Ride"');
    } else {
      const names = item.options ?? {};
      for (const v of values) if (!(String(v) in names)) err('missing.option', `${at}.options`, `No name for option "${String(v)}"`);
      for (const k of Object.keys(names)) if (!values.some((v) => String(v) === k)) err('ref.option', `${at}.options.${k}`, `"${k}" is not an option of this item`);
      for (const [k, label] of Object.entries(names)) checkCopy(`${at}.options.${k}`, label);
      if (item.mode === 'touch') {
        if (item.floor === undefined) err('missing.floor', `${at}.floor`, 'A touch item names the landing it is answered on');
        else {
          const objects = item.floor >= ctx.floors.min && item.floor <= ctx.floors.max ? ctx.objectsOn(item.floor) : null;
          if (!objects) err('ref.floor', `${at}.floor`, `Floor ${item.floor} has no objects to touch`);
          else for (const v of values) if (!objects.includes(String(v))) err('ref.object', at, `"${String(v)}" is not an object on Floor ${item.floor}`);
        }
        if (!/\bTouch\b/.test(item.ask)) err('copy.ask', `${at}.ask`, 'A touch item says "Touch"');
      } else {
        if (item.floor !== undefined) err('ref.floor', `${at}.floor`, 'A card item has no landing of its own');
        if (!item.ask.endsWith('?')) err('copy.ask', `${at}.ask`, 'A card item asks a question');
      }
    }

    const words = passageWords(item);
    if (words < PASSAGE_WORDS.min || words > PASSAGE_WORDS.max) err('copy.length', `${at}.passage`, `${words} words; a passage has ${PASSAGE_WORDS.min} to ${PASSAGE_WORDS.max}`);
    item.passage.forEach((s, i) => {
      if (!/^["A-Z0-9]/.test(s) || !/[.!?]["]?$/.test(s) || /[.!?]["]?\s+["A-Z]/.test(s)) err('copy.sentence', `${at}.passage.${i}`, `"${s}" is not one whole sentence`);
      checkCopy(`${at}.passage.${i}`, s);
    });
    if (item.key >= item.passage.length) err('ref.key', `${at}.key`, `Sentence ${item.key} does not exist`);
    checkCopy(`${at}.source`, item.source);
    checkCopy(`${at}.ask`, item.ask);
    checkCopy(`${at}.done`, item.done);
  }

  // Lifty's and the note's lines: every one READING_LINES names, nothing else, known placeholders only.
  for (const [key, vars] of Object.entries(READING_LINES)) {
    const t = copy.lines[key];
    if (!t) err('missing.line', `lines.${key}`, 'Required reading line is missing');
    else checkCopy(`lines.${key}`, t, vars);
  }
  for (const key of Object.keys(copy.lines)) if (!(key in READING_LINES)) err('ref.unknownLine', `lines.${key}`, 'Not a reading line');

  // Help words for every help kind the reading policies can offer, and nothing else.
  const policies = new Set(refs.map((r) => r.activity.scaffoldingPolicy));
  const kinds = new Set(ctx.pack.scaffoldingPolicies.filter((p) => policies.has(p.id)).flatMap((p) => p.steps.map((s) => s.kind)));
  for (const kind of kinds) if (!copy.help[kind]) err('missing.help', `help.${kind}`, `The reading policy can offer "${kind}" but there are no words for it`);
  for (const [kind, lines] of Object.entries(copy.help)) {
    if (!kinds.has(kind)) err('ref.unknownHelp', `help.${kind}`, 'No reading policy offers this help kind');
    for (const mode of READING_MODES) checkCopy(`help.${kind}.${mode}`, lines[mode], HELP_PLACEHOLDERS[kind]?.[mode] ?? []);
  }
  if (refs.some((r) => ctx.pack.scaffoldingPolicies.find((p) => p.id === r.activity.scaffoldingPolicy)?.conceptRescue)) err('ref.rescue', 'help', 'Reading policies have no Concept Rescue: the rescue board is for counting');

  // Misconception words: every tag the generator can emit, each one in the pack's catalog.
  const catalog = new Set(ctx.pack.misconceptions.map((m) => m.id));
  for (const tag of ctx.tags) if (!copy.misconceptions[tag]) err('missing.misconception', `misconceptions.${tag}`, 'No words for a misreading the items can show');
  for (const [tag, line] of Object.entries(copy.misconceptions)) {
    if (!catalog.has(tag)) err('ref.unknownMisconception', `misconceptions.${tag}`, 'Not in the content pack misconception catalog');
    checkCopy(`misconceptions.${tag}`, line);
  }

  return { ok: issues.length === 0, issues, copy };
}
