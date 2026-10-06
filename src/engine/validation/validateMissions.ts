// Mission validation: schema, references into the content pack, and step sanity.
import type { ContentPack } from '../content/pack';
import { MissionPackSchema, missionKey, type MissionPack } from '../mission/schema';
import { formatPath, type ContentIssue } from './validateContent';

export interface MissionValidationReport {
  ok: boolean;
  issues: ContentIssue[];
  missions: MissionPack | null;
}

export function validateMissionPack(raw: unknown, pack: ContentPack): MissionValidationReport {
  const parsed = MissionPackSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      missions: null,
      issues: parsed.error.issues.map((i) => ({ severity: 'error', code: `schema.${i.code}`, path: formatPath(i.path), message: i.message })),
    };
  }
  const issues: ContentIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ severity: 'error', code, path, message });
  const keys = parsed.data.missions.map((m) => missionKey(m.id, m.version));
  keys.forEach((k, i) => {
    if (keys.indexOf(k) !== i) err('ref.duplicateMission', `missions[${i}]`, `Duplicate mission ${k}`);
  });
  parsed.data.missions.forEach((m, i) => {
    m.steps.forEach((step, j) => {
      const at = `missions[${i}].steps[${j}]`;
      if (step.kind === 'activity') {
        const activity = pack.activities.find((a) => a.id === step.activityId);
        if (!activity) err('ref.unknownActivity', `${at}.activityId`, `Unknown activity "${step.activityId}"`);
        else if (activity.challenge === 'masteryEncounter') err('ref.encounterStageAsActivity', `${at}.activityId`, `"${step.activityId}" is an encounter stage; use an encounter step`);
      }
      if (step.kind === 'encounter' && !pack.encounters.some((e) => e.id === step.encounterId)) {
        err('ref.unknownEncounter', `${at}.encounterId`, `Unknown encounter "${step.encounterId}"`);
      }
    });
  });
  return { ok: issues.length === 0, issues, missions: parsed.data };
}
