// Theme mission copy: the child-facing words a theme pack puts on a theme-neutral mission.
// Data, not code, so a future theme pack can replace every line without touching logic.
//
// Templates use {name} placeholders. Each theme declares a CONTRACT: which line keys it needs
// and which placeholders each line may use. The validator checks the copy against the contract,
// the mission, and the content pack (misconception tags, help kinds, step ids).
import { z } from 'zod';

import { stepActivityIds, type ContentPack, type MissionDefinition } from '../../engine';

const Id = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/);
const Template = z.string().min(1);

export const MissionCopySchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    theme: Id,
    missionId: z.string().min(1),
    title: z.string().min(1),
    objective: z.string().min(1),
    /** In-world checklist, one line per mission step, in mission order. */
    progress: z.array(z.object({ stepId: z.string().min(1), label: z.string().min(1) }).strict()).min(1),
    lines: z.record(z.string(), Template),
    praise: z.record(z.string(), Template),
    /** Misconception tag -> explanation in the theme's terms. */
    misconceptions: z.record(z.string(), Template),
    /**
     * Scaffold kind -> how that help looks and sounds in this theme. `jobs`: the same help in the
     * words of a particular kind of job (a theme's job key), used instead of `line` for that job.
     */
    help: z.record(z.string(), z.object({ label: z.string().min(1), line: Template, altLine: Template.optional(), jobs: z.record(z.string(), Template).optional() }).strict()),
    /** Concept Rescue: general lines plus misconception-specific framings. */
    rescue: z
      .object({
        lines: z.record(z.string(), Template),
        focus: z.record(z.string(), Template),
      })
      .strict(),
    unlocks: z
      .array(
        z
          .object({
            id: Id,
            label: z.string().min(1),
            when: z.object({ missionCompleted: z.string().min(1) }).strict(),
          })
          .strict(),
      )
      .default([]),
    /**
     * Success replay words by strategy key (src/presentation/reinforcement/strategy.ts). A
     * suggested strategy is offered, never attributed: its words may not say "you".
     */
    replay: z.record(z.string(), Template).default({}),
    /** Theme pacing knobs, tuned from playtests, never from learning state. */
    pacing: z
      .object({
        /** Duration multiplier for rides the game takes by itself (repositioning). 1 = same as a learner's ride. */
        autoRideTimeScale: z.number().min(0.3).max(1.5),
        successPauseMs: z.number().int().min(0).max(5000),
        successPauseReducedMs: z.number().int().min(0).max(5000),
      })
      .strict(),
  })
  .strict();
export type MissionCopy = z.infer<typeof MissionCopySchema>;

/** What a theme needs from its copy: required keys and the placeholders each may use. */
export interface CopyContract {
  lines: Record<string, readonly string[]>;
  praise: readonly string[];
  misconceptionVars: readonly string[];
  helpVars: readonly string[];
  /** Job keys a help entry may have its own words for (`help.<kind>.jobs.<job>`). */
  helpJobs: readonly string[];
  rescueLines: Record<string, readonly string[]>;
  rescueFocusVars: readonly string[];
  /** Success replay keys and their placeholders. */
  replayLines: Record<string, readonly string[]>;
  /** Replay keys whose strategy the learner was NOT seen using: no second-person claims. */
  replaySuggested: readonly string[];
}

export interface CopyIssue {
  code: string;
  path: string;
  message: string;
}

const placeholders = (t: string) => [...t.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]!);

/** Fill a template. Unknown placeholders are a content error, caught by validation; at runtime they stay visible. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export function validateMissionCopy(raw: unknown, ctx: { pack: ContentPack; mission: MissionDefinition; contract: CopyContract }): { ok: boolean; issues: CopyIssue[]; copy: MissionCopy | null } {
  const parsed = MissionCopySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ code: `schema.${i.code}`, path: i.path.join('.'), message: i.message })), copy: null };
  const copy = parsed.data;
  const issues: CopyIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const checkVars = (path: string, template: string, allowed: readonly string[]) => {
    for (const p of placeholders(template)) if (!allowed.includes(p)) err('copy.unknownPlaceholder', path, `"{${p}}" is not available here (allowed: ${allowed.join(', ') || 'none'})`);
  };

  if (copy.missionId !== ctx.mission.id) err('ref.mission', 'missionId', `Copy is for "${copy.missionId}", not "${ctx.mission.id}"`);

  // Checklist: every mission step exactly once, in order, nothing unknown.
  const stepIds = ctx.mission.steps.map((s) => s.id);
  const listed = copy.progress.map((p) => p.stepId);
  for (const id of listed) if (!stepIds.includes(id)) err('ref.unknownStep', 'progress', `Unknown mission step "${id}"`);
  for (const id of stepIds) if (!listed.includes(id)) err('copy.missingStep', 'progress', `No checklist line for step "${id}"`);
  if (new Set(listed).size !== listed.length) err('copy.duplicateId', 'progress', 'A step appears twice in the checklist');
  if (listed.join() !== stepIds.filter((s) => listed.includes(s)).join()) err('copy.order', 'progress', 'Checklist order differs from the mission');

  // Required lines and their placeholders.
  for (const [key, vars] of Object.entries(ctx.contract.lines)) {
    const t = copy.lines[key];
    if (!t) err('copy.missingLine', `lines.${key}`, 'Required line is missing');
    else checkVars(`lines.${key}`, t, vars);
  }
  for (const key of Object.keys(copy.lines)) if (!(key in ctx.contract.lines)) err('copy.unknownLine', `lines.${key}`, 'Line is not part of the theme contract');
  for (const key of ctx.contract.praise) if (!copy.praise[key]) err('copy.missingLine', `praise.${key}`, 'Required praise line is missing');
  for (const [key, t] of Object.entries(copy.praise)) checkVars(`praise.${key}`, t, []);

  // Everything the mission can produce must have words.
  const activities = new Set<string>();
  for (const step of ctx.mission.steps) {
    if (step.kind === 'activity') stepActivityIds(step).forEach((a) => activities.add(a));
    if (step.kind === 'encounter') ctx.pack.encounters.find((e) => e.id === step.encounterId)?.stages.forEach((a) => activities.add(a));
  }
  const used = ctx.pack.activities.filter((a) => activities.has(a.id));
  const policies = new Set(used.map((a) => a.scaffoldingPolicy));
  for (const e of ctx.pack.encounters) if (used.some((a) => e.stages.includes(a.id))) policies.add(e.scaffoldingPolicy);
  const kinds = new Set(ctx.pack.scaffoldingPolicies.filter((p) => policies.has(p.id)).flatMap((p) => p.steps.map((s) => s.kind)));
  for (const kind of kinds) if (!copy.help[kind]) err('copy.missingHelp', `help.${kind}`, `The mission can offer "${kind}" help but the copy has no words for it`);
  for (const [kind, h] of Object.entries(copy.help)) {
    if (!kinds.has(kind)) err('ref.unknownHelp', `help.${kind}`, 'No policy used by this mission has this help kind');
    checkVars(`help.${kind}.line`, h.line, ctx.contract.helpVars);
    if (h.altLine) checkVars(`help.${kind}.altLine`, h.altLine, ctx.contract.helpVars);
    for (const [job, t] of Object.entries(h.jobs ?? {})) {
      if (!ctx.contract.helpJobs.includes(job)) err('copy.unknownJob', `help.${kind}.jobs.${job}`, `"${job}" is not a job this theme has (${ctx.contract.helpJobs.join(', ')})`);
      checkVars(`help.${kind}.jobs.${job}`, t, ctx.contract.helpVars);
    }
  }
  const catalog = new Set(ctx.pack.misconceptions.map((m) => m.id));
  for (const [tag, t] of Object.entries(copy.misconceptions)) {
    if (!catalog.has(tag)) err('ref.unknownMisconception', `misconceptions.${tag}`, 'Not in the content pack misconception catalog');
    checkVars(`misconceptions.${tag}`, t, ctx.contract.misconceptionVars);
  }

  // Concept Rescue words, when any used policy can rescue.
  const rescues = ctx.pack.scaffoldingPolicies.some((p) => policies.has(p.id) && p.conceptRescue);
  if (rescues) {
    for (const [key, vars] of Object.entries(ctx.contract.rescueLines)) {
      const t = copy.rescue.lines[key];
      if (!t) err('copy.missingLine', `rescue.lines.${key}`, 'Required rescue line is missing');
      else checkVars(`rescue.lines.${key}`, t, vars);
    }
  }
  for (const [tag, t] of Object.entries(copy.rescue.focus)) {
    if (!catalog.has(tag)) err('ref.unknownMisconception', `rescue.focus.${tag}`, 'Not in the content pack misconception catalog');
    checkVars(`rescue.focus.${tag}`, t, ctx.contract.rescueFocusVars);
  }

  // Success replay: every key, known placeholders, and no claims about the learner in suggestions.
  for (const [key, vars] of Object.entries(ctx.contract.replayLines)) {
    const t = copy.replay[key];
    if (!t) err('copy.missingLine', `replay.${key}`, 'Required replay line is missing');
    else checkVars(`replay.${key}`, t, vars);
  }
  for (const key of Object.keys(copy.replay)) if (!(key in ctx.contract.replayLines)) err('copy.unknownLine', `replay.${key}`, 'Line is not part of the theme contract');
  for (const key of ctx.contract.replaySuggested) {
    const t = copy.replay[key];
    if (t && /\b(you|your|you've|you're)\b/i.test(t)) err('copy.claimsUnobserved', `replay.${key}`, 'A suggested strategy must not say the learner used it');
  }

  // Unlocks: unique, for this mission.
  const unlockIds = copy.unlocks.map((u) => u.id);
  if (new Set(unlockIds).size !== unlockIds.length) err('copy.duplicateId', 'unlocks', 'Duplicate unlock id');
  for (const u of copy.unlocks) if (u.when.missionCompleted !== ctx.mission.id) err('ref.mission', `unlocks.${u.id}`, 'Unlock condition names another mission');

  return { ok: issues.length === 0, issues, copy };
}

/** Misconception tags the mission's generators can actually emit (to require words for them). */
export function emittableMisconceptions(pack: ContentPack, mission: MissionDefinition, registryMisconceptions: (generatorKey: string) => readonly string[]): string[] {
  const activities = new Set<string>();
  for (const step of mission.steps) {
    if (step.kind === 'activity') stepActivityIds(step).forEach((a) => activities.add(a));
    if (step.kind === 'encounter') pack.encounters.find((e) => e.id === step.encounterId)?.stages.forEach((a) => activities.add(a));
  }
  const tags = new Set<string>();
  for (const a of pack.activities) if (activities.has(a.id)) for (const t of registryMisconceptions(`${a.generator.id}@${a.generator.version}`)) tags.add(t);
  return [...tags].sort();
}
