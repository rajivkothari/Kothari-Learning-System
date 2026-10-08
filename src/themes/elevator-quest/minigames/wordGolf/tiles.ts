// The spelling tray: letter tiles and the answer slots. Pure and immutable: every move returns a new
// tray, and a move that cannot happen (a used tile, a full row, an empty slot) returns the same tray,
// so a rapid double tap can never place a tile twice or take two letters back.
//
// The tiles come from the item's prompt (`tiles`: the word's letters plus a few others, already
// shuffled by the generator from its seed). The tray never knows the word: it only builds the
// learner's attempt. Whether the attempt is right is the runtime's answer (session.submit).

export interface Tile {
  id: number;
  letter: string;
}

export interface Tray {
  tiles: readonly Tile[];
  /** The tile id in each answer slot, or null. */
  slots: readonly (number | null)[];
  /** Slots in the order they were filled, so UNDO takes back the latest letter. */
  order: readonly number[];
}

/** Letters only, lower case (the generator's alphabet). Anything else in a prompt is dropped. */
const letters = (s: string) => [...s.toLowerCase()].filter((c) => c >= 'a' && c <= 'z');

export function createTray(tiles: string, length: number): Tray {
  const ls = letters(tiles);
  const n = Math.max(1, Math.min(12, Math.floor(Number.isFinite(length) ? length : ls.length)));
  return { tiles: ls.map((letter, id) => ({ id, letter })), slots: Array.from({ length: n }, () => null), order: [] };
}

export const isUsed = (t: Tray, tileId: number) => t.slots.includes(tileId);
export const filled = (t: Tray) => t.slots.filter((s) => s !== null).length;
export const isFull = (t: Tray) => t.slots.every((s) => s !== null);
export const isEmpty = (t: Tray) => t.slots.every((s) => s === null);

/** The letter in a slot, or null. */
export function slotLetter(t: Tray, slot: number): string | null {
  const id = t.slots[slot];
  return id === null || id === undefined ? null : (t.tiles[id]?.letter ?? null);
}

/** Put a tile in the first empty slot. A used tile or a full row: no change. */
export function placeTile(t: Tray, tileId: number): Tray {
  if (!t.tiles.some((x) => x.id === tileId) || isUsed(t, tileId)) return t;
  const at = t.slots.indexOf(null);
  if (at < 0) return t;
  const slots = t.slots.slice();
  slots[at] = tileId;
  return { ...t, slots, order: [...t.order, at] };
}

/** Take a slot's letter back to its tile. An empty slot: no change. */
export function removeSlot(t: Tray, slot: number): Tray {
  if (t.slots[slot] === null || t.slots[slot] === undefined) return t;
  const slots = t.slots.slice();
  slots[slot] = null;
  return { ...t, slots, order: t.order.filter((s) => s !== slot) };
}

/** UNDO: take back the letter placed last. Nothing placed: no change. */
export function undo(t: Tray): Tray {
  const last = t.order[t.order.length - 1];
  return last === undefined ? t : removeSlot(t, last);
}

/** CLEAR: every letter back. */
export function clear(t: Tray): Tray {
  return isEmpty(t) ? t : { ...t, slots: t.slots.map(() => null), order: [] };
}

/** The learner's word, once every slot holds a letter; else null. */
export function attempt(t: Tray): string | null {
  if (!isFull(t)) return null;
  return t.slots.map((id) => t.tiles[id!]!.letter).join('');
}

/** The tile that would go next for a letter (the first unused one), or null. For SHOW ME's model only. */
export function firstFreeTile(t: Tray, letter: string): number | null {
  return t.tiles.find((x) => x.letter === letter && !isUsed(t, x.id))?.id ?? null;
}
