// Landing identities: what each floor looks like beyond the doors. Data, not components: the
// catalog (content/themes/elevator-quest/landings.json) picks from a fixed vocabulary, and one
// renderer (ui/LandingLayer.tsx, geometry in ui/landingArt.ts) draws any combination.
// Pure: no React, no Skia.
import { z } from 'zod';

import landingsJson from '../../../../content/themes/elevator-quest/landings.json';
import type { ThemeTokens } from '../../../presentation/design/tokens';
import { SOUND_SLOTS, type SoundSlot } from '../audio/profile';

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
  // Themed destinations (D130): original designs, broad genre only.
  'platforms',
  'turbine',
  'blocks',
  'green',
] as const;
export const PROPS = ['bench', 'pot', 'toolboard', 'crate', 'cone', 'barrel', 'gauge', 'lamp', 'pipe', 'monitor', 'clipboard', 'cable', 'bin', 'trolley'] as const;
export const EMBLEMS = ['star', 'wrench', 'drop', 'box', 'fan', 'hex', 'gear', 'flask', 'eye', 'dial', 'wave', 'compass', 'plug', 'arrow', 'bolt', 'leaf', 'book', 'ring', 'globe', 'flag', 'stairs', 'swirl', 'cube'] as const;

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
export const HERO_SILHOUETTES = ['fan', 'machine', 'core', 'cabinets', 'telescope', 'desk', 'workbench', 'platforms', 'turbine', 'blocks'] as const satisfies readonly Silhouette[];

/**
 * The landing canvas's safe core (art/manifest.ts LANDING_CANVAS.safe, docs/ART_ASSET_SPEC.md):
 * every supported doorway shows it, so every touchable thing sits inside it. Repeated here so the
 * content stays free of the art pipeline; art.test.ts checks the two agree.
 */
export const CANVAS_SAFE = { x: 0.16, y: 0.08, w: 0.68, h: 0.84 } as const;

const Unit = z.number().min(0).max(1);
/** A box in normalized coordinates (0 to 1): landing canvas fractions, or door units on the vector landing. */
const NormBoxSchema = z.object({ x: Unit, y: Unit, w: z.number().gt(0).max(1), h: z.number().gt(0).max(1) }).strict();
/** A round part of the landing art, in canvas fractions (r in canvas widths: the canvas is square). */
const Disc = z.object({ x: Unit, y: Unit, r: z.number().gt(0).max(0.3) }).strict();
const ObjectId = z.string().regex(/^[a-z0-9-]+$/);
const ArtId = z.string().regex(/^landing\.[0-9]+\.[a-z0-9-]+$/);

/**
 * A named thing on a landing (D154 plan, "canonical landing objects"): what a learner can point at.
 * Exploration spots react through one; a read-and-touch job may make several its answer targets.
 */
const LandingObject = z
  .object({
    id: ObjectId,
    /** Spoken name, for screen readers and choice cards ("golf ball"). */
    name: z.string().min(3).max(40),
    /**
     * Where it is in the landing art, in canvas fractions (the same space as the art manifest's
     * `hit`), inside the safe core. Absent: not touchable on the art (the hero falls back to the
     * art's own `hit`).
     */
    box: NormBoxSchema.optional(),
    /** Measured on a draft or not at all yet: replaced when the art's boxes are measured. */
    provisional: z.literal(true).optional(),
    /** On the vector landing (door units), or "hero": the vector landing's touchable hero part. */
    vector: z.union([z.literal('hero'), NormBoxSchema]).optional(),
  })
  .strict();

/**
 * How a touched thing reacts. One short reaction, no physics, no loops (ACCESSIBILITY.md):
 *   spin    turns whole turns about its centre: a transparent prop, or a round disc of the art
 *   tilt    rocks about its pivot and returns (a prop)
 *   bounce  springs up and settles (the art stretched upward from its base, so nothing ghosts)
 *   lower   a hanging load is lowered and raised again (its rope stretches, the load moves)
 *   glow    a soft light comes up over it and fades
 *   lights  a row of lamps comes on one by one, then goes out together
 *   open    two states: a touch opens it, the next touch closes it (props: closed, open)
 *   putt    a ball rolls to a hole, drops in, and comes back to rest after a calm pause
 *   slide   a drawer slides out toward you and back (its strip of the art grows a little about its
 *           centre and settles, never below rest, so it always covers the original)
 * Where a reaction needs art that is missing (a prop that failed to load, the vector landing),
 * the thing glows instead: the touch always shows something, never a dead spot.
 */
export const REACTIONS = ['spin', 'tilt', 'bounce', 'lower', 'glow', 'lights', 'open', 'putt', 'slide'] as const;
export type Reaction = (typeof REACTIONS)[number];

/** A sound slot's name (audio/profile.ts SOUND_SLOTS; validateLandings checks it is one). */
const SoundName = z.custom<SoundSlot>((v) => typeof v === 'string' && /^[a-z][A-Za-z]{2,40}$/.test(v), { message: 'A sound slot name' });

/**
 * Something on a landing a learner can touch to watch it work (exploration). Each spot has its own
 * discovery key, so a floor can hold up to three, and a later spot can depend on an earlier
 * discovery without a new shape of data. Exploration is play: it is never learning evidence or
 * progression value.
 */
const ExploreSpot = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    /** What is touched: one of this landing's objects. */
    target: ObjectId,
    reaction: z.enum(REACTIONS),
    /** A transparent moving layer (art manifest id) the reaction moves. While it is missing the reaction uses the art itself, or glows. */
    prop: ArtId.optional(),
    /** open: the layer shown while open (over the closed one, or over the painted thing). */
    openProp: ArtId.optional(),
    /** spin: a round part of the art that turns about its centre. Only for round things, so nothing ghosts. */
    disc: Disc.optional(),
    /** spin: whole turns (negative: the other way). Default 1. */
    turns: z.number().int().min(-3).max(3).refine((n) => n !== 0).optional(),
    /** spin: more round parts that turn with it (a gear train), each its own whole turns. */
    linked: z.array(Disc.extend({ turns: z.number().int().min(-4).max(4).refine((n) => n !== 0) }).strict()).max(3).optional(),
    /** lower: the rope that pays out and the load that hangs from it (canvas fractions), and how far it goes. */
    hoist: z.object({ rope: NormBoxSchema, load: NormBoxSchema, drop: z.number().gt(0).max(0.1) }).strict().optional(),
    /** putt: the object the ball rolls to. */
    to: ObjectId.optional(),
    /** putt: where the ball drops in, in the art (canvas fractions). Default: the middle of the `to` object. */
    cup: z.object({ x: Unit, y: Unit }).strict().optional(),
    /** putt: the flag's strip of the art (canvas fractions, its left edge on the pole): it flutters as the ball drops in. */
    flag: NormBoxSchema.optional(),
    /** slide: the drawer's strip of the art (canvas fractions) that slides out and back. */
    slide: NormBoxSchema.optional(),
    /** The thing's own sound (a sound slot), played with every reaction. Default: the generic landing reaction. */
    sound: SoundName.optional(),
    /** open: the sound as it shuts again. Default: `sound`. */
    closeSound: SoundName.optional(),
    /** A short readable card the touch opens (the Archive's book). 2 or 3 short sentences. */
    card: z
      .object({
        title: z.string().min(3).max(32),
        lines: z.array(z.string().min(8).max(90)).min(2).max(3),
        close: z.string().min(3).max(24),
      })
      .strict()
      .optional(),
    /** What a touch does, for screen readers ("Putt the golf ball"). Default: "Inspect the <object>". */
    action: z.string().min(5).max(40).optional(),
    /** open: what a touch does while it is open ("Close the toolbox"). */
    closeAction: z.string().min(5).max(40).optional(),
    /** World memory key, recorded once per learner on the first inspection. */
    discovery: z.string().regex(/^eq\.discovery\.[a-z0-9.-]+$/),
    /**
     * Keys this same discovery had before the place moved floor (prototype saves). A learner who
     * holds one has already found the place. World memory is append-only, so nothing is rewritten.
     */
    legacy: z.array(z.string().regex(/^eq\.discovery\.[a-z0-9.-]+$/)).max(3).optional(),
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
    /**
     * service: a grounded engineering or building floor. destination: a surprising themed place
     * behind an ordinary door (D127, D130). Never a difficulty tier: the learner model decides challenge.
     */
    kind: z.enum(['service', 'destination']).default('service'),
    look: Look,
    /** Optional per-state changes (Floor 15: dormant until its power is restored). */
    states: z.object({ dormant: Look.partial().strict() }).strict().optional(),
    /** Named things on this landing (canonical ids shared with reading items and the art). */
    objects: z.array(LandingObject).min(1).max(6).optional(),
    /** Exploration on this landing: 1 to 3 things to touch. */
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
export type LandingObjectEntry = z.infer<typeof LandingObject>;
export type NormBox = z.infer<typeof NormBoxSchema>;
export type DiscEntry = z.infer<typeof Disc>;

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
    const objects = f.objects ?? [];
    const hasHero = (HERO_SILHOUETTES as readonly string[]).includes(f.look.silhouette);
    const objectIds = new Set<string>();
    objects.forEach((o, j) => {
      const op = `${at}.objects.${j}`;
      if (objectIds.has(o.id)) err('dup.object', `${op}.id`, `Object "${o.id}" appears twice on floor ${f.floor}`);
      objectIds.add(o.id);
      if (o.box && !inside(o.box, CANVAS_SAFE)) err('ref.safe', `${op}.box`, `"${o.id}" must sit inside the safe core, so every doorway shows it`);
      if (o.vector === 'hero' && !hasHero) err('ref.hero', `${op}.vector`, `Silhouette "${f.look.silhouette}" has no touchable hero part`);
      if (o.vector && o.vector !== 'hero' && !inside(o.vector, { x: 0, y: 0, w: 1, h: 1 })) err('ref.vector', `${op}.vector`, `"${o.id}" reaches outside the doorway`);
    });
    if (objects.filter((o) => o.vector === 'hero').length > 1) err('dup.hero', `${at}.objects`, 'Only one object is the vector hero');
    // Boxes may overlap (a toolbox on its workbench): the smaller thing is in front (touchTargets order).
    // But no box may hide another completely, or that object could never be touched.
    for (const p of objects) for (const q of objects) if (p !== q && p.box && q.box && inside(q.box, p.box) && area(q.box) >= area(p.box)) err('ref.hidden', `${at}.objects`, `"${q.id}" is hidden behind "${p.id}"`);
    const spotIds = new Set<string>();
    (f.explore ?? []).forEach((spot, j) => {
      const sp = `${at}.explore.${j}`;
      if (spotIds.has(spot.id)) err('dup.spot', `${sp}.id`, `Spot "${spot.id}" appears twice on floor ${f.floor}`);
      spotIds.add(spot.id);
      const target = objects.find((o) => o.id === spot.target);
      if (!target) err('ref.target', `${sp}.target`, `No object "${spot.target}" on floor ${f.floor}`);
      // Every spot can be touched on the vector landing too (no art, or art that failed): no dead spots.
      else if (!target.vector) err('missing.vector', `${sp}.target`, `"${target.id}" needs a place on the vector landing`);
      if (spots(catalog).filter((s) => s.prop && s.prop === spot.prop).length > 1) err('dup.prop', `${sp}.prop`, `Prop "${spot.prop}" moves for two spots`);
      for (const id of [spot.prop, spot.openProp]) if (id && !id.startsWith(`landing.${f.floor}.`)) err('ref.prop', `${sp}.prop`, `Prop "${id}" is not a floor ${f.floor} layer`);
      if (spot.reaction === 'putt') {
        const to = objects.find((o) => o.id === spot.to);
        if (!to || to.id === spot.target) err('ref.to', `${sp}.to`, 'A putt rolls to another object on this landing');
        else if (!to.vector || to.vector === 'hero' || (target?.box && !to.box)) err('ref.to', `${sp}.to`, `"${to.id}" needs a place wherever the ball does`);
      } else if (spot.to || spot.cup) err('ref.to', `${sp}.to`, 'Only a putt rolls to something');
      if (spot.cup && !inside({ ...spot.cup, w: 0, h: 0 }, CANVAS_SAFE)) err('ref.safe', `${sp}.cup`, 'The cup must sit inside the safe core');
      if (spot.flag && spot.reaction !== 'putt') err('ref.flag', `${sp}.flag`, 'Only a putt has a flag');
      if (spot.flag && !inside(spot.flag, CANVAS_SAFE)) err('ref.safe', `${sp}.flag`, 'The flag must sit inside the safe core');
      if (spot.slide && spot.reaction !== 'slide') err('ref.slide', `${sp}.slide`, 'Only a sliding thing has a drawer');
      if (spot.reaction === 'slide' && !spot.slide) err('missing.slide', sp, 'A slide needs its drawer (the strip of the art that slides)');
      if (spot.slide && !(inside(spot.slide, CANVAS_SAFE) && target?.box && inside(spot.slide, target.box))) err('ref.safe', `${sp}.slide`, 'The drawer must sit on its thing, inside the safe core');
      for (const [key, slot] of [['sound', spot.sound], ['closeSound', spot.closeSound]] as const) {
        if (slot !== undefined && !(SOUND_SLOTS as readonly string[]).includes(slot)) err('ref.sound', `${sp}.${key}`, `No sound slot "${slot}" (audio/profile.ts)`);
      }
      if (spot.closeSound && spot.reaction !== 'open') err('ref.sound', `${sp}.closeSound`, 'Only an opening thing has a closing sound');
      if (spot.disc && spot.reaction !== 'spin') err('ref.disc', `${sp}.disc`, 'Only a spin turns a disc');
      if (spot.linked && !spot.disc) err('ref.disc', `${sp}.linked`, 'Linked discs turn with a disc');
      for (const d of [...(spot.disc ? [spot.disc] : []), ...(spot.linked ?? [])]) {
        if (!inside({ x: d.x - d.r, y: d.y - d.r, w: d.r * 2, h: d.r * 2 }, CANVAS_SAFE)) err('ref.safe', `${sp}.disc`, 'A turning disc must sit inside the safe core');
      }
      if (spot.hoist && spot.reaction !== 'lower') err('ref.hoist', `${sp}.hoist`, 'Only a lowering moves a hoist');
      if (spot.reaction === 'lower' && !spot.hoist && !spot.prop) err('missing.hoist', sp, 'A lowering needs its rope and load, or a prop');
      if (spot.hoist && !(inside(spot.hoist.rope, CANVAS_SAFE) && inside({ ...spot.hoist.load, h: spot.hoist.load.h + spot.hoist.drop }, CANVAS_SAFE))) err('ref.safe', `${sp}.hoist`, 'A hoist must stay inside the safe core');
      if (spot.openProp && spot.reaction !== 'open') err('ref.open', `${sp}.openProp`, 'Only an opening thing has an open state');
      if (spot.closeAction && spot.reaction !== 'open') err('ref.open', `${sp}.closeAction`, 'Only an opening thing closes');
      for (const key of [spot.discovery, ...(spot.legacy ?? [])]) {
        if (seen.discovery.has(key)) err('dup.discovery', `${sp}.discovery`, `Discovery "${key}" appears twice`);
        seen.discovery.add(key);
      }
      const own = `eq.discovery.floor-${f.floor}`;
      if (spot.discovery !== own && !spot.discovery.startsWith(`${own}.`)) err('ref.discovery', `${sp}.discovery`, `Discovery keys on floor ${f.floor} are "${own}" or start with "${own}."`);
    });
  });
  for (let fl = ctx.minFloor; fl <= ctx.maxFloor; fl++) if (!seen.floor.has(fl)) err('missing.floor', 'floors', `No landing for floor ${fl}`);
  return { ok: issues.length === 0, issues, catalog: issues.length === 0 ? catalog : null };
}

const spots = (c: LandingCatalog) => c.floors.flatMap((f) => f.explore ?? []);
const area = (b: NormBox) => b.w * b.h;
const inside = (a: NormBox, b: NormBox) => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;

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

/** A landing's named objects (none on most floors). */
export function landingObjects(catalog: LandingCatalog, floor: number): LandingObjectEntry[] {
  return catalog.floors.find((f) => f.floor === floor)?.objects ?? [];
}

/** One object on a floor, or null. */
export function landingObject(catalog: LandingCatalog, floor: number, id: string): LandingObjectEntry | null {
  return landingObjects(catalog, floor).find((o) => o.id === id) ?? null;
}

/**
 * How long a landing reaction lasts. A new reaction on the same spot waits for the last one to end,
 * so rapid taps cannot turn a pulse into flicker (no flashing above 3 Hz, ever).
 */
export const REACTION_MS = { normal: 1200, reduced: 900 };

/**
 * A putt, in parts (ms): the roll, the drop into the cup, the calm pause with the ball in the hole,
 * and the ball settling back at rest. Under Reduced Motion the ball goes straight to the cup.
 */
export const PUTT_MS = {
  normal: { roll: 1300, drop: 250, rest: 1600, back: 450 },
  reduced: { roll: 250, drop: 0, rest: 1600, back: 0 },
} as const;
/** An opening thing (the toolbox): how long the lid takes, each way. */
export const OPEN_MS = { normal: 450, reduced: 120 } as const;

/** How long a reaction of this kind runs: touches on the same spot meanwhile are ignored. */
export function reactionMs(reaction: Reaction, motion: 'normal' | 'reduced'): number {
  if (reaction === 'putt') {
    const p = PUTT_MS[motion];
    return p.roll + p.drop + p.rest + p.back;
  }
  if (reaction === 'open') return OPEN_MS[motion];
  return REACTION_MS[motion];
}

/** What a touch on a spot does, for screen readers: the object and the action. */
export function spotLabel(spot: Pick<ExploreSpotEntry, 'object' | 'action' | 'closeAction'>, state: { inspected: boolean; open: boolean }): string {
  if (state.open && spot.closeAction) return spot.closeAction;
  if (!state.inspected) return spot.action ?? `Inspect the ${spot.object}`;
  return `${spot.object}, inspected. ${spot.action ? `${spot.action}.` : 'Touch it again to watch it work.'}`;
}

/** Layers explore spots move (their motion comes from the spot): the art validator's `spotProps`. */
export function spotProps(catalog: LandingCatalog): string[] {
  return spots(catalog).flatMap((s) => [s.prop, s.openProp].filter((id): id is string => Boolean(id)));
}

/**
 * Floors where every spot's object carries its own box: their art needs no `hit` (the art
 * validator's `boxedFloors`). A spot without a box (Floor 15's core) uses the art's `hit`.
 */
export function boxedFloors(catalog: LandingCatalog): number[] {
  return catalog.floors.filter((f) => f.explore?.length && f.explore.every((s) => f.objects?.find((o) => o.id === s.target)?.box)).map((f) => f.floor);
}

/** Whether a learner holding these world-memory keys has found this spot (its key, or a legacy one). */
export function spotDiscovered(spot: Pick<ExploreSpotEntry, 'discovery' | 'legacy'>, keys: ReadonlySet<string> | readonly string[]): boolean {
  const has = (k: string) => (Array.isArray(keys) ? (keys as readonly string[]).includes(k) : (keys as ReadonlySet<string>).has(k));
  return has(spot.discovery) || (spot.legacy ?? []).some(has);
}

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
    const found = (entry.explore ?? []).filter((s) => spotDiscovered(s, known));
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

/** One line of the building directory: every floor by number, name and emblem. Information only. */
export interface DirectoryRow {
  floor: number;
  name: string;
  emblem: Emblem;
  kind: 'service' | 'destination';
}

/** The building directory, top floor first (as a lobby directory reads). Floor 15 shows its dormant name state through `landingFor`. */
export function directoryRows(catalog: LandingCatalog, min: number, max: number, ctx: LandingContext): DirectoryRow[] {
  const rows: DirectoryRow[] = [];
  for (let floor = max; floor >= min; floor--) {
    const l = landingFor(catalog, floor, ctx);
    rows.push({ floor, name: l.name, emblem: l.look.emblem, kind: catalog.floors.find((f) => f.floor === floor)?.kind ?? 'service' });
  }
  return rows;
}
