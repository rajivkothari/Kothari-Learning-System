// COMPLETION RECORD: a durable fact that an activity instance, encounter, or mission
// play-through ended. Written in the same transaction as the attempt that ended it.
// Replays use these as explicit boundaries, so derived state never depends on
// guessing when an instance finished.
import { z } from 'zod';

export const CompletionKindSchema = z.enum(['activity', 'encounter', 'mission']);
export type CompletionKind = z.infer<typeof CompletionKindSchema>;

export const CompletionRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** Stable, derived from the instance: "completion:<kind>:<instanceId>". */
    id: z.string().min(1),
    learnerId: z.string().min(1),
    kind: CompletionKindSchema,
    /** Activity instance id, or the mission instance id for kind "mission". */
    instanceId: z.string().min(1),
    /** Activity, encounter, or mission id. */
    targetId: z.string().min(1),
    missionInstanceId: z.string().min(1).optional(),
    outcome: z.enum(['completed', 'abandoned']),
    occurredAt: z.number().int().nonnegative(),
  })
  .strict();
export type CompletionRecord = z.infer<typeof CompletionRecordSchema>;

export function completionId(kind: CompletionKind, instanceId: string): string {
  return `completion:${kind}:${instanceId}`;
}
