// Abstract progression tiers. Not currency: a future reward system maps them.
export const VALUE_TIERS = ['none', 'low', 'normal', 'high'] as const;
export type ValueTier = (typeof VALUE_TIERS)[number];
export type EventTier = Exclude<ValueTier, 'none'>;

export function tierRank(t: ValueTier): number {
  return VALUE_TIERS.indexOf(t);
}

export function maxTier<T extends ValueTier>(a: T, b: T): T {
  return tierRank(a) >= tierRank(b) ? a : b;
}
