// Landing identities: what each floor looks like beyond the doors. Data, not components: the
// catalog (content/themes/elevator-quest/landings.json) picks from a fixed vocabulary, and one
// renderer (ui/LandingLayer.tsx, geometry in ui/landingArt.ts) draws any combination.
// Pure: no React, no Skia.
import { z } from 'zod';

import landingsJson from '../../../../content/themes/elevator-quest/landings.json';
import type { ThemeTokens } from '../../../presentation/design/tokens';

export const PATTERNS = ['plain', 'tile', 'stripe', 'panel', 'brick', 'mesh', 'grid', 'chevron', 'louver', 'dots', 'rib', 'wave'] as const;
export const SIGNAGE = ['plaque', 'stencil', 'lightbox', 'enamel', 'hanging'] as const;
export const DOORWAYS = ['none', 'plain', 'arch', 'double', 'hatch', 'glass', 'bulkhead'] as const;
export const WINDOWS = ['none', 'strip', 'porthole', 'panorama', 'skylight'] as const;
export const SILHOUETTES = [
  'desk',
  'workbench',
  'pipes',
  'shelves',
  'fan',
  'corridor',
  'machine',
  'flasks',
  'railing',
  'racks',
  'dish',
  'gantry',
  'switchgear',
  'ladder',
  'core',
  'planters',
  'cabinets',
  'telescope',
  'bridge',
  'mast',
] as const;
export const PROPS = ['bench', 'pot', 'toolboard', 'crate', 'cone', 'barrel', 'gauge', 'lamp', 'pipe', 'monitor', 'clipboard', 'cable', 'bin', 'trolley'] as const;
export const EMBLEMS = ['star', 'wrench', 'drop', 'box', 'fan', 'hex', 'gear', 'flask', 'eye', 'dial', 'wave', 'compass', 'plug', 'arrow', 'bolt', 'leaf', 'book', 'ring', 'globe', 'flag'] as const;

export type Pattern = (typeof PATTERNS)[number];
export type Signage = (typeof SIGNAGE)[number];
export type Doorway = (typeof DOORWAYS)[number];
export type WindowKind = (typeof WINDOWS)[number];
export type Silhouette = (typeof SILHOUETTES)[number];
export type Prop = (typeof PROPS)[number];
export type Emblem = (typeof EMBLEMS)[number];

const Look = z
  .object({
    /** Swatch names from the theme tokens (places.swatches). */
    wall: z.string().min(1),
    accent: z.string().min(1),
    trim: z.string().min(1),
    /** Light tint name from the theme tokens (places.light). */
    light: z.string().min(1),
    pattern: z.enum(PATTERNS),
    signage: z.enum(SIGNAGE),
    /** False: an unpowered sign (dark plate, dim lettering). */
    signLit: z.boolean().default(true),
    doorway: z.enum(DOORWAYS),
    silhouette: z.enum(SILHOUETTES),
    window: z.enum(WINDOWS),
    props: z.array(z.enum(PROPS)).max(3),
    emblem: z.enum(EMBLEMS),
  })
  .strict();

/** Silhouettes whose hero part can be touched and react (drawn in ui/landingArt.ts HERO). */
export const HERO_SILHOUETTES = ['fan', 'machine', 'core', 'cabinets', 'telescope'] as const satisfies readonly Silhouette[];

/**
 * Something on a landing a learner can inspect in free ride. Each spot has its own discovery key,
 * so a floor can hold more than one, and a later spot can depend on an earlier discovery without a
 * new shape of data. Exploration is play: it is never learning evidence or progression value.
 */
const ExploreSpot = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    /** What is touched. Today only the landing's hero part. */
    target: z.literal('hero'),
    /** World memory key, recorded once per learner on the first inspection. */
    discovery: z.string().regex(/^eq\.discovery\.[a-z0-9.-]+$/),
    /** Spoken name of the thing, for screen readers ("ventilation fan"). */
    object: z.string().min(3).max(40),
    /** Lifty, once, on the first inspection. Short. */
    line: z.string().min(10).max(110),
    /** The Engineer Log's fact once discovered. Short, plain, true. */
    fact: z.string().min(10).max(120),
  })
  .strict();

const LandingSchema = z
  .object({
    floor: z.number().int().min(1),
    id: z.string().regex(/^[a-z0-9-]+$/),
    /** The sign over the landing. Short, upper case. */
    name: z.string().min(2).max(16).regex(/^[A-Z0-9 ]+$/),
    look: Look,
    /** Optional per-state changes (Floor 15: dormant until its power is restored). */
    states: z.object({ dormant: Look.partial().strict() }).strict().optional(),
    /** Free-ride exploration on this landing (a few floors for now). */
    explore: z.array(ExploreSpot).min(1).max(3).optional(),
  })
  .strict();

export const LandingCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.string().min(1),
    floors: z.array(LandingSchema).min(1),
  })
  .strict();

export type LandingCatalog = z.infer<typeof LandingCatalogSchema>;
export type LandingEntry = z.infer<typeof LandingSchema>;
export type LandingLook = z.infer<typeof Look>;
export type ExploreSpotEntry = z.infer<typeof ExploreSpot>;

/** A landing resolved for drawing: names checked, state applied. */
export interface Landing {
  floor: number;
  id: string;
  name: string;
  state: 'normal' | 'dormant' | 'restored';
  look: LandingLook;
  /** True when no catalog entry exists for the floor (a plain service landing). */
  fallback: boolean;
}

export interface LandingIssue {
  code: string;
  path: string;
  message: string;
}

/** Content checks beyond the schema. */
export function validateLandings(raw: unknown, ctx: { tokens: ThemeTokens; minFloor: number; maxFloor: number }): { ok: boolean; issues: LandingIssue[]; catalog: LandingCatalog | null } {
  const parsed = LandingCatalogSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ code: `schema.${i.code}`, path: i.path.join('.'), message: i.message })), catalog: null };
  const catalog = parsed.data;
  const issues: LandingIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const { swatches, light } = ctx.tokens.places;

  const seen = { floor: new Set<number>(), id: new Set<string>(), name: new Set<string>(), full: new Set<string>(), discovery: new Set<string>() };
  catalog.floors.forEach((f, i) => {
    const at = `floors.${i}`;
    if (f.floor < ctx.minFloor || f.floor > ctx.maxFloor) err('ref.floor', `${at}.floor`, `Floor ${f.floor} is outside ${ctx.minFloor}..${ctx.maxFloor}`);
    if (seen.floor.has(f.floor)) err('dup.floor', `${at}.floor`, `Floor ${f.floor} appears twice`);
    if (seen.id.has(f.id)) err('dup.id', `${at}.id`, `Id "${f.id}" appears twice`);
    if (seen.name.has(f.name)) err('dup.name', `${at}.name`, `Name "${f.name}" appears twice`);
    seen.floor.add(f.floor);
    seen.id.add(f.id);
    seen.name.add(f.name);
    for (const [label, look] of [['look', f.look] as const, ...(f.states?.dormant ? [['states.dormant', f.states.dormant] as const] : [])]) {
      for (const key of ['wall', 'accent', 'trim'] as const) {
        const name = look[key];
        if (name !== undefined && !(name in swatches)) err('ref.swatch', `${at}.${label}.${key}`, `Unknown swatch "${name}"`);
      }
      if (look.light !== undefined && !(look.light in light)) err('ref.light', `${at}.${label}.light`, `Unknown light "${look.light}"`);
      if (look.props && new Set(look.props).size !== look.props.length) err('dup.prop', `${at}.${label}.props`, 'A prop appears twice');
    }
    const key = fullIdentity(f.look);
    if (seen.full.has(key)) err('dup.identity', at, 'Another floor has exactly the same look');
    seen.full.add(key);
    (f.explore ?? []).forEach((spot, j) => {
      const sp = `${at}.explore.${j}`;
      if (!(HERO_SILHOUETTES as readonly string[]).includes(f.look.silhouette)) err('ref.hero', sp, `Silhouette "${f.look.silhouette}" has no touchable hero part`);
      if (seen.discovery.has(spot.discovery)) err('dup.discovery', `${sp}.discovery`, `Discovery "${spot.discovery}" appears twice`);
      if (!spot.discovery.startsWith(`eq.discovery.floor-${f.floor}`)) err('ref.discovery', `${sp}.discovery`, `Discovery keys on floor ${f.floor} start with "eq.discovery.floor-${f.floor}"`);
      seen.discovery.add(spot.discovery);
    });
  });
  for (let fl = ctx.minFloor; fl <= ctx.maxFloor; fl++) if (!seen.floor.has(fl)) err('missing.floor', 'floors', `No landing for floor ${fl}`);
  return { ok: issues.length === 0, issues, catalog: issues.length === 0 ? catalog : null };
}

export function fullIdentity(look: LandingLook): string {
  return JSON.stringify([look.wall, look.accent, look.trim, look.light, look.pattern, look.signage, look.signLit, look.doorway, look.silhouette, look.window, [...look.props].sort(), look.emblem]);
}

/** A neutral service landing, for any floor the catalog does not describe. */
export const FALLBACK_LOOK: LandingLook = {
  wall: 'slate',
  accent: 'fog',
  trim: 'soot',
  light: 'cool',
  pattern: 'plain',
  signage: 'stencil',
  signLit: true,
  doorway: 'none',
  silhouette: 'corridor',
  window: 'none',
  props: [],
  emblem: 'hex',
};

export interface LandingContext {
  /** Floors that have a dormant state show it until restored (Floor 15 before its power is back). */
  restored: (floor: number) => boolean;
}

export function landingFor(catalog: LandingCatalog, floor: number, ctx: LandingContext): Landing {
  const entry = catalog.floors.find((f) => f.floor === floor);
  if (!entry) return { floor, id: `service-${floor}`, name: 'SERVICE LEVEL', state: 'normal', look: FALLBACK_LOOK, fallback: true };
  const dormant = entry.states?.dormant;
  if (!dormant) return { floor, id: entry.id, name: entry.name, state: 'normal', look: entry.look, fallback: false };
  if (ctx.restored(floor)) return { floor, id: entry.id, name: entry.name, state: 'restored', look: entry.look, fallback: false };
  return { floor, id: entry.id, name: entry.name, state: 'dormant', look: { ...entry.look, ...dormant }, fallback: false };
}

export const LANDINGS: LandingCatalog = LandingCatalogSchema.parse(landingsJson);

/** Granted with the first Floor 15 completion (content/themes/elevator-quest/floor15.json). */
export const FLOOR15_RESTORED_UNLOCK = 'eq.landing.floor-15-restored';
/** Granted by the same completion before the restore unlock existed (M4 to M6 saves). */
const LEGACY_RESTORE_SIGNAL = 'eq.rank.engineer-1';

/** Floor 15's power is back for this learner: durable, from the unlock inventory. */
export function floor15Restored(unlockIds: readonly string[]): boolean {
  return unlockIds.includes(FLOOR15_RESTORED_UNLOCK) || unlockIds.includes(LEGACY_RESTORE_SIGNAL);
}

/** Accessibility text for a landing: the floor number and the place's name. */
export function landingLabel(l: Landing): string {
  const place = l.name.charAt(0) + l.name.slice(1).toLowerCase();
  const state = l.state === 'dormant' ? ', power off' : l.state === 'restored' ? ', power on' : '';
  return `Landing: floor ${l.floor}, ${place}${state}`;
}

// ---------- exploration and the Engineer Log ----------

/** The inspectable spots on a floor (none on most floors). */
export function exploreSpots(catalog: LandingCatalog, floor: number): ExploreSpotEntry[] {
  return catalog.floors.find((f) => f.floor === floor)?.explore ?? [];
}

/**
 * How long a landing reaction lasts. A new reaction on the same spot waits for the last one to end,
 * so rapid taps cannot turn a pulse into flicker (no flashing above 3 Hz, ever).
 */
export const REACTION_MS = { normal: 1200, reduced: 900 };

/** Floors with something to explore, low to high. */
export function explorableFloors(catalog: LandingCatalog): number[] {
  return catalog.floors.filter((f) => f.explore?.length).map((f) => f.floor).sort((a, b) => a - b);
}

export interface LogRow {
  floor: number;
  name: string;
  emblem: Emblem;
  inspected: boolean;
  /** Only once discovered: an undiscovered row never shows its fact. */
  fact: string | null;
  /** A system state the place shows in the log (Floor 15's power). Null when the place has none. */
  system: 'powered' | 'unpowered' | null;
}

/**
 * The Engineer Log: places with something to explore, and what the learner found. No scores, no
 * percentages, no levels. A floor counts as inspected once its first spot is discovered.
 */
export function engineerLog(catalog: LandingCatalog, memories: readonly string[], ctx: LandingContext): LogRow[] {
  const known = new Set(memories);
  return explorableFloors(catalog).map((floor) => {
    const entry = catalog.floors.find((f) => f.floor === floor)!;
    const found = (entry.explore ?? []).filter((s) => known.has(s.discovery));
    return {
      floor,
      name: entry.name,
      emblem: entry.look.emblem,
      inspected: found.length > 0,
      fact: found[0]?.fact ?? null,
      system: entry.states?.dormant ? (ctx.restored(floor) ? 'powered' : 'unpowered') : null,
    };
  });
}
