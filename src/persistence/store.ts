// Repositories: translate between SQLite rows and pure-engine records. Every write is
// idempotent by a stable id (INSERT OR IGNORE on a UNIQUE id), so a retried commit can
// never duplicate attempts, completions, or announced upgrades.
import {
  AttemptEvidenceSchema,
  CompletionRecordSchema,
  learningEventId,
  type LearningEvent,
  type MissionState,
  type OpportunityUpgrade,
  type PresentationIntent,
} from '../engine';
import type { SqlExecutor } from './driver';

export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyError';
  }
}

// ---------- learners ----------

export interface LearnerRecord {
  id: string;
  themePack: string;
  /** Entered on device at runtime. Never stored in source, fixtures, or tests. */
  displayName: string | null;
  createdAt: number;
}

export async function insertLearner(tx: SqlExecutor, l: LearnerRecord): Promise<boolean> {
  const r = await tx.run('INSERT OR IGNORE INTO learners (id, theme_pack, display_name, created_at) VALUES (?, ?, ?, ?)', [l.id, l.themePack, l.displayName, l.createdAt]);
  return r.changes === 1;
}

export async function getLearner(db: SqlExecutor, id: string): Promise<LearnerRecord | null> {
  const row = await db.get<{ id: string; theme_pack: string; display_name: string | null; created_at: number }>('SELECT * FROM learners WHERE id = ?', [id]);
  return row ? { id: row.id, themePack: row.theme_pack, displayName: row.display_name, createdAt: row.created_at } : null;
}

// ---------- learning events (source of truth) ----------

export async function appendLearningEvents(tx: SqlExecutor, learnerId: string, events: readonly LearningEvent[]): Promise<{ inserted: number }> {
  let inserted = 0;
  for (const e of events) {
    const isAttempt = e.type === 'attempt';
    const body = isAttempt ? e.attempt : e.completion;
    if (body.learnerId !== learnerId) throw new Error(`Event ${learningEventId(e)} belongs to another learner`);
    const r = await tx.run(
      `INSERT OR IGNORE INTO learning_events (id, learner_id, type, instance_id, mission_instance_id, occurred_at, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        learningEventId(e),
        learnerId,
        e.type,
        isAttempt ? e.attempt.activityInstanceId : e.completion.instanceId,
        body.missionInstanceId ?? null,
        body.occurredAt,
        JSON.stringify(body),
      ],
    );
    inserted += r.changes;
  }
  return { inserted };
}

export interface StoredEvent {
  seq: number;
  event: LearningEvent;
}

/** Events in insertion order (seq). Payloads are re-validated on load. */
export async function loadLearningEvents(db: SqlExecutor, learnerId: string, afterSeq = 0): Promise<StoredEvent[]> {
  const rows = await db.all<{ seq: number; type: 'attempt' | 'completion'; payload: string }>(
    'SELECT seq, type, payload FROM learning_events WHERE learner_id = ? AND seq > ? ORDER BY seq',
    [learnerId, afterSeq],
  );
  return rows.map((r) => {
    const raw: unknown = JSON.parse(r.payload);
    const event: LearningEvent = r.type === 'attempt' ? { type: 'attempt', attempt: AttemptEvidenceSchema.parse(raw) } : { type: 'completion', completion: CompletionRecordSchema.parse(raw) };
    return { seq: r.seq, event };
  });
}

export async function maxEventSeq(db: SqlExecutor, learnerId: string): Promise<number> {
  const row = await db.get<{ m: number | null }>('SELECT MAX(seq) AS m FROM learning_events WHERE learner_id = ?', [learnerId]);
  return row?.m ?? 0;
}

// ---------- mission instances (checkpoints) ----------

export interface MissionRow {
  state: MissionState;
  lastCommandId: string | null;
  /** Intents produced by the last command, returned again if that command is retried. */
  lastResult: PresentationIntent[] | null;
  revision: number;
}

export async function insertMissionInstance(tx: SqlExecutor, state: MissionState, intents: readonly PresentationIntent[], now: number): Promise<boolean> {
  const r = await tx.run(
    `INSERT OR IGNORE INTO mission_instances
      (id, learner_id, mission_id, mission_version, seed_base, status, state, last_command_id, last_result, revision, started_at, completed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, ?)`,
    [state.instanceId, state.learnerId, state.missionId, state.missionVersion, state.seedBase, state.status, JSON.stringify(state), JSON.stringify(intents), state.startedAt, state.completedAt, now],
  );
  return r.changes === 1;
}

export async function getMissionInstance(db: SqlExecutor, id: string): Promise<MissionRow | null> {
  const row = await db.get<{ state: string; last_command_id: string | null; last_result: string | null; revision: number }>(
    'SELECT state, last_command_id, last_result, revision FROM mission_instances WHERE id = ?',
    [id],
  );
  if (!row) return null;
  return {
    state: JSON.parse(row.state) as MissionState,
    lastCommandId: row.last_command_id,
    lastResult: row.last_result ? (JSON.parse(row.last_result) as PresentationIntent[]) : null,
    revision: row.revision,
  };
}

export async function updateMissionInstance(
  tx: SqlExecutor,
  args: { state: MissionState; expectedRevision: number; commandId: string; intents: readonly PresentationIntent[]; now: number },
): Promise<void> {
  const r = await tx.run(
    `UPDATE mission_instances
       SET state = ?, status = ?, completed_at = ?, last_command_id = ?, last_result = ?, revision = revision + 1, updated_at = ?
     WHERE id = ? AND revision = ?`,
    [JSON.stringify(args.state), args.state.status, args.state.completedAt, args.commandId, JSON.stringify(args.intents), args.now, args.state.instanceId, args.expectedRevision],
  );
  if (r.changes !== 1) throw new ConcurrencyError(`Mission ${args.state.instanceId} changed underneath this command (revision ${args.expectedRevision})`);
}

export async function listMissionInstances(db: SqlExecutor, learnerId: string, status?: 'active' | 'completed'): Promise<{ id: string; missionId: string; status: string }[]> {
  const rows = await db.all<{ id: string; mission_id: string; status: string }>(
    `SELECT id, mission_id, status FROM mission_instances WHERE learner_id = ? ${status ? 'AND status = ?' : ''} ORDER BY started_at, id`,
    status ? [learnerId, status] : [learnerId],
  );
  return rows.map((r) => ({ id: r.id, missionId: r.mission_id, status: r.status }));
}

// ---------- announced progression upgrades ----------

export function progressionEventId(learnerId: string, u: Pick<OpportunityUpgrade, 'key' | 'toTier'>): string {
  return `${learnerId}|${u.key}->${u.toTier}`;
}

/** Returns only the upgrades that were newly recorded (never announced before). */
export async function appendProgressionEvents(tx: SqlExecutor, learnerId: string, upgrades: readonly OpportunityUpgrade[]): Promise<OpportunityUpgrade[]> {
  const fresh: OpportunityUpgrade[] = [];
  for (const u of upgrades) {
    const r = await tx.run(
      `INSERT OR IGNORE INTO progression_events
        (id, learner_id, opportunity_key, kind, from_tier, to_tier, increment, source_completion_id, occurred_at, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [progressionEventId(learnerId, u), learnerId, u.key, u.kind, u.fromTier, u.toTier, u.increment, u.sourceCompletionId, u.at, JSON.stringify(u)],
    );
    if (r.changes === 1) fresh.push(u);
  }
  return fresh;
}

export async function listProgressionEvents(db: SqlExecutor, learnerId: string): Promise<OpportunityUpgrade[]> {
  const rows = await db.all<{ payload: string }>('SELECT payload FROM progression_events WHERE learner_id = ? ORDER BY seq', [learnerId]);
  return rows.map((r) => JSON.parse(r.payload) as OpportunityUpgrade);
}

// ---------- derived cache (not authoritative) ----------

export interface CacheRow {
  cacheKey: string;
  throughSeq: number;
  state: string;
}

export async function getCache(db: SqlExecutor, learnerId: string): Promise<CacheRow | null> {
  const row = await db.get<{ cache_key: string; through_seq: number; state: string }>('SELECT cache_key, through_seq, state FROM derived_cache WHERE learner_id = ?', [learnerId]);
  return row ? { cacheKey: row.cache_key, throughSeq: row.through_seq, state: row.state } : null;
}

export async function putCache(tx: SqlExecutor, learnerId: string, row: CacheRow, now: number): Promise<void> {
  await tx.run('INSERT OR REPLACE INTO derived_cache (learner_id, cache_key, through_seq, state, updated_at) VALUES (?, ?, ?, ?, ?)', [learnerId, row.cacheKey, row.throughSeq, row.state, now]);
}

export async function deleteCache(tx: SqlExecutor, learnerId: string): Promise<void> {
  await tx.run('DELETE FROM derived_cache WHERE learner_id = ?', [learnerId]);
}

// ---------- unlocks (append-only, once per learner) ----------

export interface UnlockGrant {
  unlockId: string;
  /** What earned it, e.g. "missionComplete:<missionId>". */
  source: string;
  at: number;
}

export function unlockRowId(learnerId: string, unlockId: string): string {
  return `${learnerId}|${unlockId}`;
}

/** Returns only the grants that were newly recorded. Re-earning is a no-op. */
export async function appendUnlocks(tx: SqlExecutor, learnerId: string, grants: readonly UnlockGrant[]): Promise<UnlockGrant[]> {
  const fresh: UnlockGrant[] = [];
  for (const g of grants) {
    const r = await tx.run('INSERT OR IGNORE INTO unlocks (id, learner_id, unlock_id, source, occurred_at) VALUES (?, ?, ?, ?, ?)', [unlockRowId(learnerId, g.unlockId), learnerId, g.unlockId, g.source, g.at]);
    if (r.changes === 1) fresh.push(g);
  }
  return fresh;
}

export async function listUnlocks(db: SqlExecutor, learnerId: string): Promise<UnlockGrant[]> {
  const rows = await db.all<{ unlock_id: string; source: string; occurred_at: number }>('SELECT unlock_id, source, occurred_at FROM unlocks WHERE learner_id = ? ORDER BY seq', [learnerId]);
  return rows.map((r) => ({ unlockId: r.unlock_id, source: r.source, at: r.occurred_at }));
}

// ---------- learner settings (mutable, never affect challenge) ----------

export async function getSettings(db: SqlExecutor, learnerId: string): Promise<Record<string, string>> {
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM learner_settings WHERE learner_id = ?', [learnerId]);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function putSetting(tx: SqlExecutor, learnerId: string, key: string, value: string, now: number): Promise<void> {
  await tx.run('INSERT OR REPLACE INTO learner_settings (learner_id, key, value, updated_at) VALUES (?, ?, ?, ?)', [learnerId, key, value, now]);
}
