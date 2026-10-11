// Word Garden copy and presentation data (content/themes/magical-kingdom/wordGarden.json). The engine
// sees item ids and values only; this file says what each id shows and says: the sound an item plays,
// the letters a word is built from, the picture for a value, and what the world does when it is right.
// Nothing here scores: right or wrong always comes from the runtime.
import { z } from 'zod';

import raw from '../../../../content/themes/magical-kingdom/wordGarden.json';
import learning from '../../../../content/themes/magical-kingdom/learning.json';
import { spellingTiles } from '../../../engine/generation/generators/spelling';
import type { IconKind } from '../ui/MagicArt';

const Text = z.string().min(1).max(120);
const Letter = z.string().regex(/^[a-z]$/);
const Word = z.string().regex(/^[a-z]{3}$/);

const Schema = z
  .object({
    schemaVersion: z.literal(1),
    labels: z.record(z.string(), Text),
    lines: z.record(z.string(), Text),
    sounds: z.record(Letter, z.object({ say: Text }).strict()),
    keywords: z.record(Letter, Word),
    words: z.record(Word, z.object({ reaction: Text }).strict()),
    /** Item id (authored item or spelling word id) -> the sound letter or the word it presents. */
    items: z.record(z.string(), z.union([Letter, Word])),
    recordings: z.object({ status: z.enum(['pending', 'recorded']), note: z.string().min(1).max(600) }).strict(),
  })
  .strict();

export type WordGardenCopy = z.infer<typeof Schema>;
export const LINE_KEYS = ['sound', 'blend', 'blendReady', 'spell', 'retrySound', 'retryBlend', 'retrySpell', 'retryOrder', 'stretchSound', 'stretchBlend', 'stretchSpell', 'modelSound', 'modelBlend', 'modelSpell', 'showSound', 'showBlend', 'showSpell', 'bloom', 'done'] as const;
export type LineKey = (typeof LINE_KEYS)[number];
const LABEL_KEYS = ['title', 'stage', 'hear', 'help', 'showMe', 'next', 'castle', 'letter', 'sound', 'tile', 'slot', 'placed', 'picture', 'retry'] as const;
/** Pictures the Word Garden can draw (MagicArt kinds). */
export const PICTURES: readonly IconKind[] = ['cat', 'sun', 'map', 'pig', 'hat'];

export const WORD_GARDEN_MISSION = 'word-garden';
export const ACTIVITIES = { sound: 'letter-sound', blend: 'blend-word', spell: 'spell-word' } as const;

type Activity = { id: string; generator: { id: string }; params: Record<string, unknown> };
const activity = (id: string) => (learning.pack.activities as unknown as Activity[]).find((a) => a.id === id);

/** Every problem with the copy against the kingdom pack; empty when the Word Garden can present every item. */
export function validateWordGarden(input: unknown): string[] {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  const c = parsed.data;
  const problems: string[] = [];
  for (const k of LINE_KEYS) if (!c.lines[k]) problems.push(`lines.${k} is missing`);
  for (const k of LABEL_KEYS) if (!c.labels[k]) problems.push(`labels.${k} is missing`);
  for (const [l, w] of Object.entries(c.keywords)) {
    if (!w.startsWith(l)) problems.push(`keyword ${w} does not start with ${l}`);
    if (!PICTURES.includes(w as IconKind)) problems.push(`keyword ${w} has no picture`);
  }
  for (const w of Object.keys(c.words)) if (!PICTURES.includes(w as IconKind)) problems.push(`word ${w} has no picture`);
  const sound = activity(ACTIVITIES.sound);
  const blend = activity(ACTIVITIES.blend);
  const spell = activity(ACTIVITIES.spell);
  if (!sound || !blend || !spell) return [...problems, 'a Word Garden activity is missing from the kingdom pack'];
  type Item = { id: string; correct: string; distractors: { value: string }[] };
  for (const it of sound.params.items as Item[]) {
    if (c.items[it.id] !== it.correct) problems.push(`sound item ${it.id} must present the sound of ${it.correct}`);
    for (const v of [it.correct, ...it.distractors.map((d) => d.value)]) if (!c.sounds[v]) problems.push(`letter ${v} has no sound`);
    if (!c.keywords[it.correct]) problems.push(`sound ${it.correct} has no keyword picture`);
  }
  for (const it of blend.params.items as Item[]) {
    // The letters on screen are the word the item blends.
    if (c.items[it.id] !== it.correct) problems.push(`blend item ${it.id} must show the letters of ${it.correct}`);
    for (const v of [it.correct, ...it.distractors.map((d) => d.value)]) if (!c.words[v]) problems.push(`picture ${v} is not a Word Garden word`);
  }
  const params = spell.params as Parameters<typeof spellingTiles>[1];
  for (const w of params.words) {
    if (c.items[w.id] !== w.word) problems.push(`spelling word ${w.id} must say ${w.word}`);
    if (!c.words[w.word]) problems.push(`spelling word ${w.word} has no picture`);
    for (const ch of spellingTiles(w, params)) if (!c.sounds[ch]) problems.push(`tile ${ch} (word ${w.id}) has no sound`);
  }
  return problems;
}

const problems = validateWordGarden(raw);
if (problems.length) throw new Error(`Word Garden copy: ${problems.join('; ')}`);
export const WORD_GARDEN = Schema.parse(raw);

export const fillCopy = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (whole, k: string) => String(vars[k] ?? whole));

/** Audio slots. Clips are looked up by slot; a slot with no recording plays nothing (text stays on screen). */
export const slot = {
  sound: (letter: string) => `sound:${letter}`,
  word: (word: string) => `word:${word}`,
  line: (key: LineKey) => `line:${key}`,
  reaction: (word: string) => `reaction:${word}`,
};

/** Lines a child needs to play alone: what to do, what to try after a miss, SHOW ME, and the rewards. */
const REQUIRED_LINES: readonly LineKey[] = ['sound', 'blend', 'blendReady', 'spell', 'retrySound', 'retryBlend', 'retrySpell', 'retryOrder', 'showSound', 'showBlend', 'showSpell', 'bloom', 'done'];

export interface Recording {
  slot: string;
  /** What to say. For a sound: the phoneme and its keyword (record the phoneme only). */
  text: string;
  /** required: needed for a first playtest without an adult reading aloud. later: help framing and reaction lines; the game shows them as text. */
  tier: 'required' | 'later';
}

/**
 * Every clip the Word Garden plays, derived from what its three activities can present: the letter
 * sounds of the sound items, the blend words and every spelling tile; the spoken target and keyword
 * words; the lines; the reactions of the target words. The recording session's checklist.
 */
export function recordingList(copy: WordGardenCopy = WORD_GARDEN): Recording[] {
  type Item = { correct: string; distractors: { value: string }[] };
  const sound = activity(ACTIVITIES.sound)!.params.items as Item[];
  const blend = activity(ACTIVITIES.blend)!.params.items as Item[];
  const params = activity(ACTIVITIES.spell)!.params as Parameters<typeof spellingTiles>[1];
  const letters = new Set<string>();
  for (const it of sound) for (const v of [it.correct, ...it.distractors.map((d) => d.value)]) letters.add(v);
  for (const it of blend) for (const ch of it.correct) letters.add(ch);
  for (const w of params.words) for (const ch of spellingTiles(w, params)) letters.add(ch);
  const targets = [...new Set([...blend.map((i) => i.correct), ...params.words.map((w) => w.word)])];
  const words = [...new Set([...targets, ...sound.map((i) => copy.keywords[i.correct]!)])];
  return [
    ...[...letters].sort().map((l) => ({ slot: slot.sound(l), text: copy.sounds[l]!.say, tier: 'required' as const })),
    ...words.map((w) => ({ slot: slot.word(w), text: w, tier: 'required' as const })),
    ...LINE_KEYS.map((k) => ({ slot: slot.line(k), text: copy.lines[k]!, tier: REQUIRED_LINES.includes(k) ? ('required' as const) : ('later' as const) })),
    ...targets.map((w) => ({ slot: slot.reaction(w), text: copy.words[w]!.reaction, tier: 'later' as const })),
  ];
}
