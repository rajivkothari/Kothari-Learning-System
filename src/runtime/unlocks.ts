// Content-defined in-game unlocks: ranks, cosmetics, systems. A theme supplies the
// catalog; the runtime only matches conditions against committed game-progress signals.
// No amounts, no balance, no time- or login-based conditions.
import { z } from 'zod';

import type { GameProgressSignal } from '../engine';
import type { UnlockGrant } from '../persistence/store';

export const UnlockRuleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
    /** First successful completion of this mission (any instance). */
    when: z.object({ missionCompleted: z.string().min(1) }).strict(),
  })
  .strict();
export type UnlockRule = z.infer<typeof UnlockRuleSchema>;

export function unlocksFor(rules: readonly UnlockRule[], signals: readonly GameProgressSignal[], at: number): UnlockGrant[] {
  const grants: UnlockGrant[] = [];
  for (const s of signals) {
    if (s.kind !== 'missionComplete') continue;
    for (const r of rules) if (r.when.missionCompleted === s.missionId) grants.push({ unlockId: r.id, source: `missionComplete:${s.missionId}`, at });
  }
  return grants;
}
