// World catalog: the minimal data model for describing worlds and floors, playable or not.
//
// Portal principle: the WORLD decides the fantasy, the LEARNER PROFILE decides the challenge.
// A world never carries a difficulty. It can say which interactions suit it and which parts of
// the curriculum it tells good stories about (selection), never how hard those are or how they
// score. There is no "easy world" or "hard world".
//
// Only Elevator Quest is playable. Every other entry is a non-playable architecture example.
import { z } from 'zod';

import type { ContentPack, MissionDefinition } from '../../engine';

const Id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

/** Learner archetypes (docs/LEARNER_PROFILES.md). Never a name. */
export const ARCHETYPES = ['learner-engineer', 'learner-storyteller'] as const;

/** Interaction kinds a world may prefer. `implemented` ones exist in the app today. */
export const INTERACTIONS = {
  panelSelect: { implemented: true },
  scaleTap: { implemented: true },
  dragLoad: { implemented: true },
  tapToHear: { implemented: false },
  traceLetter: { implemented: false },
  sequenceCards: { implemented: false },
  routeOnMap: { implemented: false },
  assembleParts: { implemented: false },
  aimAndPower: { implemented: false },
  blockCode: { implemented: false },
  storyChoice: { implemented: false },
  sortAndMatch: { implemented: false },
} as const;
export type InteractionKind = keyof typeof INTERACTIONS;
const Interaction = z.enum(Object.keys(INTERACTIONS) as [InteractionKind, ...InteractionKind[]]);

const UnlockRequirement = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('always') }).strict(),
  z.object({ kind: z.literal('missionCompleted'), missionId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('worldVisited'), worldId: Id }).strict(),
  /** A parent turns it on in Parent Mode. Never purchasable. */
  z.object({ kind: z.literal('parentEnabled') }).strict(),
]);

export const WorldSchema = z
  .object({
    id: Id,
    displayName: z.string().min(1).max(40),
    status: z.enum(['playable', 'planned', 'concept']),
    /** Broad family, for art direction and the portal map. Not a subject and not a level. */
    themeFamily: z.enum(['engineering', 'storybook', 'science', 'sport', 'arts', 'social', 'seasonal', 'adventure']),
    art: z
      .object({
        /** A palette in the design system, once one exists for this world. */
        paletteId: z.string().min(1).nullable(),
        identity: z.string().min(1).max(200),
        lighting: z.enum(['warm', 'cool', 'mixed']),
      })
      .strict(),
    preferredInteractions: z.array(Interaction).min(1),
    /** Skill-id prefixes this world tells good stories about. Used for activity SELECTION only. */
    curriculumAffinities: z.array(z.string().regex(/^[a-z]+(\.[a-z0-9-]+)*$/)).min(1),
    /** Archetype and interest tags. Never names, ages, or diagnoses. */
    learnerAffinityTags: z.array(Id).default([]),
    unlockRequirements: z.array(UnlockRequirement).min(1),
    portal: z
      .object({
        availability: z.enum(['none', 'hidden', 'discoverable', 'open']),
        /** Worlds with a door to this one. */
        fromWorlds: z.array(Id).default([]),
      })
      .strict(),
    /** A home world for one archetype, or a shared world anyone may visit. */
    association: z.discriminatedUnion('kind', [z.object({ kind: z.literal('primary'), archetype: z.enum(ARCHETYPES) }).strict(), z.object({ kind: z.literal('shared') }).strict()]),
    /** Presentation hints only (reading load, visual busyness, voice). They never change the challenge. */
    presentation: z
      .object({
        readingLoad: z.enum(['none', 'light', 'moderate']),
        visualComplexity: z.enum(['calm', 'standard']),
        narrationFirst: z.boolean(),
      })
      .strict(),
    /** Playable worlds only: the theme pack and missions that make it real. */
    themePack: Id.optional(),
    missions: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type World = z.infer<typeof WorldSchema>;

export const WorldCatalogSchema = z.object({ schemaVersion: z.literal(1), worlds: z.array(WorldSchema).min(1) }).strict();
export type WorldCatalog = z.infer<typeof WorldCatalogSchema>;

export interface CatalogIssue {
  code: string;
  path: string;
  message: string;
}

/** Check a catalog against itself and the content it points at. */
export function validateWorldCatalog(raw: unknown, ctx: { pack: ContentPack; missions: readonly MissionDefinition[]; palettes: readonly string[] }): { ok: boolean; issues: CatalogIssue[]; catalog: WorldCatalog | null } {
  const parsed = WorldCatalogSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ code: `schema.${i.code}`, path: i.path.join('.'), message: i.message })), catalog: null };
  const catalog = parsed.data;
  const issues: CatalogIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const ids = catalog.worlds.map((w) => w.id);
  const known = new Set(ids);
  const missionIds = new Set(ctx.missions.map((m) => m.id));
  const skills = ctx.pack.skills.map((s) => s.id);

  for (const id of ids.filter((id, i) => ids.indexOf(id) !== i)) err('catalog.duplicateId', `worlds.${id}`, 'Duplicate world id');

  for (const w of catalog.worlds) {
    const at = `worlds.${w.id}`;
    for (const from of w.portal.fromWorlds) {
      if (!known.has(from)) err('ref.unknownWorld', `${at}.portal.fromWorlds`, `No world "${from}"`);
      if (from === w.id) err('catalog.selfPortal', `${at}.portal.fromWorlds`, 'A world cannot portal to itself');
    }
    if (w.portal.availability === 'none' && w.portal.fromWorlds.length > 0) err('catalog.portalClosed', `${at}.portal`, 'Portal is "none" but lists source worlds');
    for (const u of w.unlockRequirements) {
      if (u.kind === 'missionCompleted' && !missionIds.has(u.missionId)) err('ref.unknownMission', `${at}.unlockRequirements`, `No mission "${u.missionId}"`);
      if (u.kind === 'worldVisited' && !known.has(u.worldId)) err('ref.unknownWorld', `${at}.unlockRequirements`, `No world "${u.worldId}"`);
    }
    if (w.art.paletteId !== null && !ctx.palettes.includes(w.art.paletteId)) err('ref.unknownPalette', `${at}.art.paletteId`, `No palette "${w.art.paletteId}"`);

    if (w.status === 'playable') {
      if (!w.themePack) err('catalog.playableNeedsPack', at, 'A playable world needs a theme pack');
      if (w.missions.length === 0) err('catalog.playableNeedsMission', at, 'A playable world needs at least one mission');
      for (const m of w.missions) if (!missionIds.has(m)) err('ref.unknownMission', `${at}.missions`, `No mission "${m}"`);
      for (const i of w.preferredInteractions) if (!INTERACTIONS[i].implemented) err('catalog.interactionNotBuilt', `${at}.preferredInteractions`, `"${i}" is not built yet`);
      for (const prefix of w.curriculumAffinities) if (!skills.some((s) => s === prefix || s.startsWith(`${prefix}.`))) err('ref.unknownSkillPrefix', `${at}.curriculumAffinities`, `No skill under "${prefix}"`);
      if (w.art.paletteId === null) err('catalog.playableNeedsPalette', `${at}.art.paletteId`, 'A playable world needs a palette');
    } else if (w.themePack || w.missions.length > 0) {
      err('catalog.conceptIsPlayable', at, 'Only playable worlds name a theme pack or missions');
    }
  }
  return { ok: issues.length === 0, issues, catalog };
}
