import { z } from 'zod';
import raw from '../../../content/themes/magical-kingdom/wardrobe.json';
import type { SqlExecutor } from '../../persistence/driver';
import { MISSIONS, type Adventure } from './appContent';

const slotSchema = z.enum(['outfit', 'crown', 'bow', 'wings', 'wand']);
const itemSchema = z.object({ id: z.string(), slot: slotSchema, label: z.string().min(1).max(40), goal: z.string().min(1).max(60), room: z.enum(['ice','garden']).optional(), count: z.number().int().min(0) });
export const WARDROBE = { ...raw, items: z.array(itemSchema).parse(raw.items) };
export type WardrobeSlot = z.infer<typeof slotSchema>;
export type Look = Record<WardrobeSlot, string>;
export type RoyalProgress = { ice: number; garden: number; total: number };
export interface RoyalCompletion { id: string; missionId: string; learnerId: string }
export type CompletionReader = (baseLearner: string) => Promise<readonly RoyalCompletion[]>;
export const DEFAULT_LOOK: Look = { outfit: 'outfit-lavender', crown: 'crown-gold', bow: 'bow-turquoise', wings: 'wings-none', wand: 'wand-none' };
export const EMPTY_PROGRESS: RoyalProgress = { ice: 0, garden: 0, total: 0 };
export const ROYAL_SLOTS: WardrobeSlot[] = ['outfit','crown','bow','wings','wand'];
export function available(item: (typeof WARDROBE.items)[number], progress: RoyalProgress): boolean { return (item.room ? progress[item.room] : progress.total) >= item.count; }
export function unlockedItems(progress: RoyalProgress): string[] { return WARDROBE.items.filter((i) => available(i, progress)).map((i) => i.id); }
export function restoreLook(rawLook: unknown, progress: RoyalProgress): Look {
  const value = rawLook && typeof rawLook === 'object' ? rawLook as Record<string, unknown> : {};
  return Object.fromEntries(ROYAL_SLOTS.map((slot) => [slot, WARDROBE.items.find((i) => i.slot === slot && i.id === value[slot] && available(i, progress))?.id ?? DEFAULT_LOOK[slot]])) as Look;
}
export function royalProgress(rows: readonly RoyalCompletion[]): RoyalProgress {
  const progress = { ...EMPTY_PROGRESS };
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    const room = (['ice','garden'] as Adventure[]).find((r) => (MISSIONS[r] as readonly string[]).includes(row.missionId));
    if (!room) continue;
    seen.add(row.id); progress[room]++; progress.total++;
  }
  return progress;
}
/** Cosmetic-only read of committed completed missions, across this archetype's new-book generations. */
export function readRoyalCompletions(db: SqlExecutor, base: string): Promise<RoyalCompletion[]> {
  const family = `${base}-g-`;
  return db.all<RoyalCompletion>(`SELECT id, mission_id AS missionId, learner_id AS learnerId FROM mission_instances WHERE status = 'completed' AND (learner_id = ? OR substr(learner_id, 1, ?) = ?) ORDER BY started_at, id`, [base, family.length, family]);
}
