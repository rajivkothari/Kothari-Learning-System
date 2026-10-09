import { openAppDatabase } from '../../persistence/openAppDatabase';
import { openGameRuntime } from '../../runtime/gameRuntime';
import { loadKingdomContent } from './appContent';

/** Same KLS adapters; a separate file prevents either game's content cache or reset touching the other. */
export const KINGDOM_DB = 'kls-magical-kingdom.db';
export const DEFAULT_KINGDOM_LEARNER = 'learner-storyteller';
let opening: ReturnType<typeof open> | null = null;
async function open() {
  const db = await openAppDatabase(KINGDOM_DB);
  const runtime = await openGameRuntime(db, loadKingdomContent(), { now: () => Date.now() });
  return { db, runtime };
}
export function openKingdomServices() {
  opening ??= open();
  opening.catch(() => { opening = null; });
  return opening;
}
