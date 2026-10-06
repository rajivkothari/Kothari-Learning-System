// LEARNING EVENT EVOLUTION: how stored attempt and completion payloads are read when their
// schema has moved on. Stored rows are append-only and never rewritten, so every reader must
// accept every version ever written.
//
// Contract (see docs/LEARNING_MODEL.md, "Evidence evolution"):
// - Adding an optional field, or a new enum value that old readers never see, keeps the version.
// - Anything else (a new required field, a renamed or retyped field, a changed meaning) bumps
//   schemaVersion and adds ONE upgrader from the previous version here. Upgraders are pure,
//   never consult content or a clock, and never change what an old record claimed happened.
// - A payload newer than this app, or one with no upgrade path, is refused with a typed error.
//   Nothing is rewritten, so installing a newer app reads it again.
import { AttemptEvidenceSchema } from './attempt';
import { CompletionRecordSchema } from './completion';
import type { LearningEvent } from '../progression/processor';

export type LearningEventType = LearningEvent['type'];
type Payload = Record<string, unknown>;

/** Upgrade a payload of version `n` (the key) to version n + 1. */
export type PayloadUpgrader = (payload: Payload) => Payload;

export interface EvolutionTable {
  current: Record<LearningEventType, number>;
  upgrades: Record<LearningEventType, Readonly<Record<number, PayloadUpgrader>>>;
}

/** The versions this build writes. Both are still at 1: no upgraders exist yet. */
export const LEARNING_EVENT_EVOLUTION: EvolutionTable = {
  current: { attempt: 1, completion: 1 },
  upgrades: { attempt: {}, completion: {} },
};

export class LearningEventVersionError extends Error {
  constructor(
    message: string,
    readonly reason: 'newerThanApp' | 'noUpgradePath' | 'malformed',
  ) {
    super(message);
    this.name = 'LearningEventVersionError';
  }
}

/** Bring a stored payload up to the current version. Pure. Throws LearningEventVersionError. */
export function upgradePayload(type: LearningEventType, raw: unknown, table: EvolutionTable = LEARNING_EVENT_EVOLUTION): Payload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new LearningEventVersionError(`${type} payload is not an object`, 'malformed');
  let payload = raw as Payload;
  let version = payload.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new LearningEventVersionError(`${type} payload has no valid schemaVersion`, 'malformed');
  const current = table.current[type];
  if (version > current) throw new LearningEventVersionError(`${type} payload is version ${version}; this app reads up to ${current}. Update the app.`, 'newerThanApp');
  while (version < current) {
    const step = table.upgrades[type][version];
    if (!step) throw new LearningEventVersionError(`No upgrade for ${type} payload version ${version}`, 'noUpgradePath');
    payload = step(payload);
    if (payload.schemaVersion !== version + 1) throw new LearningEventVersionError(`Upgrader for ${type} version ${version} must produce version ${version + 1}`, 'noUpgradePath');
    version += 1;
  }
  return payload;
}

/** Read one stored learning event: upgrade, then validate with the current schema. */
export function readLearningEvent(type: LearningEventType, raw: unknown, table: EvolutionTable = LEARNING_EVENT_EVOLUTION): LearningEvent {
  const payload = upgradePayload(type, raw, table);
  return type === 'attempt' ? { type, attempt: AttemptEvidenceSchema.parse(payload) } : { type, completion: CompletionRecordSchema.parse(payload) };
}
