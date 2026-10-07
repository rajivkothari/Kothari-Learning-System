// The production art manifest: which illustrated layers exist, where each one goes, and whether
// it may be shown. Pure: no React, no React Native, no Skia, no I/O. The renderers (ui/art/*)
// read it through the lookups below; the images themselves come from a source registry
// (art/sources.ts) that maps an asset id to a bundled file.
//
// Rules (DECISIONS D131 to D134, docs/ART_ASSET_SPEC.md):
// - Art is presentation only. Nothing here decides gameplay, scores, or changes what is stored.
// - Every layer is optional. A floor, a cabin part, a Lifty pose or an object without usable art
//   is drawn by the vector system, which also stays the interaction geometry.
// - Important text (floor numbers, place names, objectives, Lifty's words, NEXT JOB) is never
//   baked into art. The native overlays draw it in door units, so art keeps those zones calm.
// - An asset is shown in production only when its rights record says approved and a person has
//   reviewed it. Concept images are references and never enter this manifest.
import { z } from 'zod';

import type { Landing } from '../content/landings';
import { OBJECT_VISUALS, type ObjectVisual } from '../content/objectives';
import { protectedNames } from '../../content/ipGuard';

export const ART_ROOT = 'assets/themes/elevator-quest/art';
export const ART_KINDS = ['cabin', 'landing', 'lifty', 'object', 'icon'] as const;
/** Cabin layers, back to front. Door leaves move with the doors; light sits over everything but the UI. */
export const CABIN_LAYERS = ['backing', 'ceiling', 'floor', 'inlay', 'wall-left', 'wall-right', 'frame-top', 'frame-left', 'frame-right', 'door-left', 'door-right', 'light'] as const;
/** Landing layers, back to front. Mission objects and the native overlays draw above them. */
export const LANDING_LAYERS = ['background', 'midground', 'moving', 'foreground', 'light'] as const;
/** Lifty's production poses (D137). ui/liftyPose.ts maps the director's moods onto them. */
export const LIFTY_POSES = ['neutral', 'help', 'thinking', 'success', 'concerned', 'quiet'] as const;
export type LiftyArtPose = (typeof LIFTY_POSES)[number];
export const ART_MOTIONS = ['spin', 'tilt', 'slide'] as const;
export const ART_FORMATS = ['webp', 'png'] as const;

export type ArtKind = (typeof ART_KINDS)[number];
export type CabinLayer = (typeof CABIN_LAYERS)[number];
export type LandingLayerName = (typeof LANDING_LAYERS)[number];

/** A rectangle in normalized coordinates (0 to 1) of whatever it is measured in. */
const Norm = z.number().min(0).max(1);
const NormBoxSchema = z.object({ x: Norm, y: Norm, w: z.number().gt(0).max(1), h: z.number().gt(0).max(1) }).strict();
const NormPoint = z.object({ x: Norm, y: Norm }).strict();
export type NormBox = z.infer<typeof NormBoxSchema>;

/** Who made it and on what terms. Mirrors the rights record (rights.json); the validator checks they agree. */
const Provenance = z
  .object({
    provider: z.string().min(2).max(80),
    aiGenerated: z.boolean(),
    humanReviewed: z.boolean(),
    license: z.string().min(2).max(160),
  })
  .strict();

/**
 * A moving piece (fan blade, motor wheel, turbine, golf flag, platform, crane hook). One cheap
 * reaction, no physics: spin turns about the pivot, tilt rocks and returns, slide moves sideways
 * and returns. `pivot` is in the piece's own image (0 to 1). Under Reduced Motion it stays at rest.
 */
const Motion = z
  .object({
    kind: z.enum(ART_MOTIONS),
    pivot: NormPoint,
    /** spin: turns; tilt: radians; slide: fraction of the doorway width. */
    amount: z.number().gt(0).max(3),
    /** touch: plays with the landing's reaction. arrival: plays once as the doors open. */
    trigger: z.enum(['touch', 'arrival']),
  })
  .strict();

const ArtEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z]+(\.[a-z0-9-]+)+$/),
    kind: z.enum(ART_KINDS),
    /** Path under ART_ROOT. Lower case, no spaces. */
    file: z.string().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)*\.(webp|png)$/),
    width: z.number().int().min(16).max(4096),
    height: z.number().int().min(16).max(4096),
    alpha: z.boolean(),
    provenance: Provenance,
    /** cabin: which cabin layer. landing: which landing layer. */
    layer: z.string().optional(),
    /** landing and icon: the floor. */
    floor: z.number().int().optional(),
    /** landing: shown in every state, or only while dormant / restored (Floor 15's power overlay). */
    state: z.enum(['any', 'dormant', 'restored']).default('any'),
    /** lifty: the pose. */
    pose: z.enum(LIFTY_POSES).optional(),
    /** object: the mission object it draws. */
    visual: z.enum(OBJECT_VISUALS).optional(),
    /** landing: where this (possibly trimmed) layer sits in the landing canvas. Default: the whole canvas. */
    rect: NormBoxSchema.optional(),
    /** landing background: the safe core in the canvas. Default: LANDING_CANVAS.safe. */
    safe: NormBoxSchema.optional(),
    /**
     * landing background: the ink for the native place name on the art's painted sign plate. The
     * art paints a plain plate in the sign zone; the name stays live text (D132). Default: light.
     */
    signInk: z.enum(['light', 'dark']).optional(),
    /** landing: parallax depth, 0 (fixed to the doorway) to 1 (moves the most). Default by layer. */
    depth: z.number().min(0).max(1).optional(),
    /** landing moving piece. */
    motion: Motion.optional(),
    /**
     * landing: a touch area for this floor's explore spot, in canvas coordinates, replacing the vector
     * hero's area while this art is shown. Labels and actions stay in landings.json.
     */
    hit: NormBoxSchema.optional(),
  })
  .strict();

const ManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.literal('elevator-quest'),
    assets: z.array(ArtEntrySchema),
  })
  .strict();

const Approval = z.enum(['pending', 'approved', 'rejected', 'reference-only']);
const RightsRecord = z
  .object({
    asset: z.string().min(3),
    source: z.string().min(2).max(200),
    /** The tool or the artist (a role, never a private person's details). */
    madeWith: z.string().min(2).max(120),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    aiGenerated: z.boolean(),
    humanReviewed: z.boolean(),
    license: z.string().min(2).max(160),
    modifications: z.string().max(300),
    approval: Approval,
    /** A role, for example "project owner". */
    approvedBy: z.string().max(80).optional(),
  })
  .strict();
const Reference = z
  .object({
    id: z.string().regex(/^[a-z]+(\.[a-z0-9-]+)+$/),
    description: z.string().min(5).max(300),
    /** What the image is for (a visual concept, a production reference). */
    purpose: z.string().min(5).max(120),
    source: z.string().min(2).max(200),
    aiGenerated: z.boolean(),
    humanReviewed: z.boolean(),
    /** Anything taken from a reference into production needs a person's review first. */
    humanReviewRequired: z.literal(true),
    approval: z.literal('reference-only'),
    inRepository: z.boolean(),
    thirdPartyReference: z.boolean(),
  })
  .strict();
const RightsSchema = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.literal('elevator-quest'),
    assets: z.array(RightsRecord),
    references: z.array(Reference),
  })
  .strict();

export type ArtEntry = z.infer<typeof ArtEntrySchema>;
export type ArtManifest = z.infer<typeof ManifestSchema>;
export type RightsManifest = z.infer<typeof RightsSchema>;
export type ArtMotion = z.infer<typeof Motion>;

// ---------- canvases (the spec an illustrator works to; docs/ART_ASSET_SPEC.md) ----------

/**
 * Landing canvas: square, cover-fitted into the doorway plus an overscan margin. The doorway's
 * aspect (width / height) runs from about 0.77 (tall iPad landscape) to 1.05 (Fire, iPad portrait),
 * so a square loses at most a quarter of its width or a twentieth of its height. The safe core is
 * what every supported doorway shows; the hero object, the mission objective and the landmark go
 * there. The reserved zones are where the native floor number, the place sign and mission objects
 * draw: art keeps them calm (plain wall, dark enough for white text).
 */
export const LANDING_CANVAS = {
  master: { width: 2048, height: 2048 },
  runtime: { width: 1024, height: 1024 },
  /** Door aspects the safe core is guaranteed for. Outside them (a 2/3 split view) the vector landing draws. */
  aspects: { min: 0.72, max: 1.12 },
  /** Extra image beyond the doorway on each side, as a fraction of the doorway width (for parallax). */
  overscan: 0.03,
  safe: { x: 0.16, y: 0.08, w: 0.68, h: 0.84 },
} as const;

/** How far a depth-1 layer slides as the doors open, as a fraction of the doorway width. */
export const PARALLAX_MAX = 0.02;
export const DEFAULT_DEPTH: Record<LandingLayerName, number> = { background: 0.2, midground: 0.5, moving: 0.5, foreground: 1, light: 0 };

/** Lifty pose canvas: square, transparent, standing on a baseline, facing right (toward the panel). */
export const LIFTY_CANVAS = { master: { width: 1024, height: 1024 }, runtime: { width: 512, height: 512 }, baseline: 0.94, centerX: 0.5 } as const;
/** Mission object canvases: transparent, contain-fitted into the object slot, standing on its bottom edge. */
export const OBJECT_CANVAS = { standard: { width: 512, height: 320 }, wide: { width: 768, height: 320 }, baseline: 0.95 } as const;
/**
 * Cabin canvases (runtime). The backing is cover-fitted to the cabin and centred on the doorway.
 * All twelve parts together decode to about 15 MB, inside the cabin budget. Masters are drawn at
 * twice these sizes and exported down.
 */
export const CABIN_CANVAS = {
  backing: { width: 1536, height: 1152, doorCenter: { x: 0.5, y: 0.56 } },
  leaf: { width: 384, height: 768 },
  frameTop: { width: 768, height: 48 },
  frameSide: { width: 48, height: 768 },
  wall: { width: 192, height: 1152 },
  ceiling: { width: 1536, height: 96 },
  floor: { width: 1536, height: 192 },
  inlay: { width: 768, height: 192 },
  light: { width: 768, height: 576 },
} as const;
export const ICON_CANVAS = { width: 256, height: 256 } as const;

/**
 * Decoded-memory budget (RGBA, 4 bytes a pixel). Provisional: set from arithmetic, not measured on a
 * Fire tablet. The hardware gate (docs/DEVICE_LAB.md) measures it before more floors are added.
 */
export const ART_BUDGET = {
  perLandingBytes: 8 * 1024 * 1024,
  cabinBytes: 16 * 1024 * 1024,
  liftyPoseBytes: 1.25 * 1024 * 1024,
  objectBytes: 1 * 1024 * 1024,
  /** Landings held at once: the current floor and the likely next one. */
  landingWindow: 2,
} as const;

export const decodedBytes = (e: Pick<ArtEntry, 'width' | 'height'>) => e.width * e.height * 4;

// ---------- validation ----------

export interface ArtIssue {
  code: string;
  path: string;
  message: string;
}

export interface ArtContext {
  minFloor: number;
  maxFloor: number;
  /** Floors with a dormant state (Floor 15). */
  dormantFloors: readonly number[];
  /** Floors with an explore spot (only those may carry a hit area). */
  exploreFloors: readonly number[];
  /** The canvas zone where the live place sign draws (art/fit.ts reservedZone): no moving piece may cover it. */
  reserved?: { sign: NormBox };
}

/**
 * Checks beyond the schema: unique ids; each kind carries exactly its own keys; floors inside the
 * tower (never Floor 21); dormant/restored only where a floor has a dormant state; one asset per
 * slot; budgets; moving pieces only on the moving layer; hit areas only on explore floors; the
 * rights record exists and agrees; approval needs a human review; and no franchise names in ids,
 * files or provenance.
 */
export function validateArt(rawManifest: unknown, rawRights: unknown, ctx: ArtContext): { ok: boolean; issues: ArtIssue[]; manifest: ArtManifest | null; rights: RightsManifest | null } {
  const m = ManifestSchema.safeParse(rawManifest);
  const r = RightsSchema.safeParse(rawRights);
  const issues: ArtIssue[] = [];
  if (!m.success) issues.push(...m.error.issues.map((i) => ({ code: `schema.${i.code}`, path: `manifest.${i.path.join('.')}`, message: i.message })));
  if (!r.success) issues.push(...r.error.issues.map((i) => ({ code: `schema.${i.code}`, path: `rights.${i.path.join('.')}`, message: i.message })));
  if (!m.success || !r.success) return { ok: false, issues, manifest: null, rights: null };
  const manifest = m.data;
  const rights = r.data;
  const err = (code: string, path: string, message: string) => issues.push({ code, path, message });

  const ids = new Set<string>();
  const slots = new Set<string>();
  const landingBytes = new Map<string, number>();
  let cabinBytes = 0;
  manifest.assets.forEach((a, i) => {
    const at = `assets.${i}`;
    if (ids.has(a.id)) err('dup.id', at, `Duplicate asset id "${a.id}"`);
    ids.add(a.id);
    const names = protectedNames([a.id, a.file, a.provenance.provider, a.provenance.license].join(' '));
    if (names.length) err('ip.name', at, `Names a protected property: ${names.join(', ')}`);
    if (!a.file.startsWith(`${a.kind === 'object' ? 'objects' : a.kind === 'icon' ? 'icons' : a.kind === 'landing' ? 'landings' : a.kind}/`)) err('ref.folder', `${at}.file`, `A ${a.kind} asset lives in its own folder`);

    const extra = (keys: (keyof ArtEntry)[]) => keys.filter((k) => a[k] !== undefined && !(k === 'state' && a.state === 'any'));
    const only = (allowed: (keyof ArtEntry)[]) => {
      const all: (keyof ArtEntry)[] = ['layer', 'floor', 'pose', 'visual', 'rect', 'safe', 'depth', 'motion', 'hit', 'state', 'signInk'];
      for (const k of extra(all.filter((k) => !allowed.includes(k)))) err('ref.key', `${at}.${k}`, `"${k}" does not apply to a ${a.kind} asset`);
    };
    let slot = '';
    switch (a.kind) {
      case 'cabin':
        only(['layer']);
        if (!(CABIN_LAYERS as readonly string[]).includes(a.layer ?? '')) err('ref.layer', `${at}.layer`, `Unknown cabin layer "${a.layer}"`);
        slot = `cabin:${a.layer}`;
        cabinBytes += decodedBytes(a);
        break;
      case 'landing': {
        only(['layer', 'floor', 'state', 'rect', 'safe', 'depth', 'motion', 'hit', 'signInk']);
        if (!(LANDING_LAYERS as readonly string[]).includes(a.layer ?? '')) err('ref.layer', `${at}.layer`, `Unknown landing layer "${a.layer}"`);
        if (a.floor === undefined || a.floor < ctx.minFloor || a.floor > ctx.maxFloor) err('ref.floor', `${at}.floor`, `Floor ${a.floor} is outside ${ctx.minFloor}..${ctx.maxFloor}`);
        if (a.state !== 'any' && !ctx.dormantFloors.includes(a.floor ?? -1)) err('ref.state', `${at}.state`, `Floor ${a.floor} has no dormant or restored state`);
        if (a.motion && a.layer !== 'moving') err('ref.motion', `${at}.motion`, 'Only a moving-layer piece moves');
        if (a.layer === 'moving' && !a.motion) err('missing.motion', at, 'A moving-layer piece needs a motion (pivot, kind, amount, trigger)');
        if (a.layer === 'moving' && !a.rect) err('missing.rect', at, 'A moving piece needs its place in the canvas');
        if (a.safe && a.layer !== 'background') err('ref.safe', `${at}.safe`, 'Only a background declares the safe core');
        if (a.signInk && a.layer !== 'background') err('ref.signInk', `${at}.signInk`, 'Only a background paints the sign plate');
        if (a.hit && !ctx.exploreFloors.includes(a.floor ?? -1)) err('ref.hit', `${at}.hit`, `Floor ${a.floor} has nothing to touch`);
        if (a.rect && (a.rect.x + a.rect.w > 1.0001 || a.rect.y + a.rect.h > 1.0001)) err('ref.rect', `${at}.rect`, 'The layer reaches outside the canvas');
        const safe = a.safe ?? LANDING_CANVAS.safe;
        if (a.hit && !inside(a.hit, safe)) err('ref.hit', `${at}.hit`, 'A touch area must sit inside the safe core');
        if (a.layer === 'moving' && a.rect && !inside(a.rect, safe)) err('ref.safe', `${at}.rect`, 'A moving piece must sit inside the safe core');
        if (a.layer === 'moving' && a.rect && ctx.reserved && overlaps(a.rect, ctx.reserved.sign)) err('ref.reserved', `${at}.rect`, 'A moving piece would cover the place sign');
        slot = `landing:${a.floor}:${a.state}:${a.layer}:${a.layer === 'moving' ? a.id : ''}`;
        const key = `${a.floor}:${a.state}`;
        landingBytes.set(key, (landingBytes.get(key) ?? 0) + decodedBytes(a));
        break;
      }
      case 'lifty':
        only(['pose']);
        if (!a.pose) err('missing.pose', at, 'A Lifty image needs its pose');
        if (!a.alpha) err('ref.alpha', at, 'Lifty is drawn over the cabin: it needs transparency');
        if (decodedBytes(a) > ART_BUDGET.liftyPoseBytes) err('budget.lifty', at, `${a.width}x${a.height} is over the Lifty pose budget`);
        slot = `lifty:${a.pose}`;
        break;
      case 'object':
        only(['visual']);
        if (!a.visual) err('missing.visual', at, 'An object image names the mission object it draws');
        if (!a.alpha) err('ref.alpha', at, 'A mission object stands on a landing: it needs transparency');
        if (decodedBytes(a) > ART_BUDGET.objectBytes) err('budget.object', at, `${a.width}x${a.height} is over the object budget`);
        slot = `object:${a.visual}`;
        break;
      case 'icon':
        only(['floor']);
        if (a.floor === undefined || a.floor < ctx.minFloor || a.floor > ctx.maxFloor) err('ref.floor', `${at}.floor`, `Floor ${a.floor} is outside ${ctx.minFloor}..${ctx.maxFloor}`);
        slot = `icon:${a.floor}`;
        break;
    }
    if (slots.has(slot)) err('dup.slot', at, `Two assets fill ${slot}`);
    slots.add(slot);

    const rec = rights.assets.find((x) => x.asset === a.id);
    if (!rec) err('missing.rights', at, `No rights record for "${a.id}"`);
    else {
      if (rec.aiGenerated !== a.provenance.aiGenerated || rec.humanReviewed !== a.provenance.humanReviewed || rec.license !== a.provenance.license) err('rights.mismatch', at, 'Provenance and the rights record disagree');
      if (rec.approval === 'reference-only') err('rights.reference', at, 'A reference image is never a production asset');
    }
  });
  // An explore floor with landing art carries its own touch area, so the hotspot covers what is drawn.
  for (const floor of ctx.exploreFloors) {
    const art = manifest.assets.filter((a) => a.kind === 'landing' && a.floor === floor);
    if (art.some((a) => a.layer === 'background') && !art.some((a) => a.hit)) err('missing.hit', `floor.${floor}`, `Floor ${floor} has something to touch: its art needs a hit box`);
  }
  for (const [key, bytes] of landingBytes) {
    const [floor, state] = key.split(':');
    // A state overlay is shown with the floor's base layers: count both.
    const total = bytes + (state === 'any' ? 0 : (landingBytes.get(`${floor}:any`) ?? 0));
    if (total > ART_BUDGET.perLandingBytes) err('budget.landing', `floor.${floor}`, `Floor ${floor} (${state}) decodes to ${(total / 1048576).toFixed(1)} MB, over the landing budget`);
  }
  if (cabinBytes > ART_BUDGET.cabinBytes) err('budget.cabin', 'cabin', `The cabin decodes to ${(cabinBytes / 1048576).toFixed(1)} MB, over budget`);

  rights.assets.forEach((rec, i) => {
    const at = `rights.assets.${i}`;
    if (!ids.has(rec.asset)) err('ref.asset', at, `Rights record for unknown asset "${rec.asset}"`);
    if (rec.approval === 'approved' && !rec.humanReviewed) err('rights.review', at, 'Approval needs a human review');
    if (rec.approval === 'approved' && !rec.approvedBy) err('rights.approver', at, 'Approval names who approved it (a role)');
    const names = protectedNames([rec.source, rec.madeWith, rec.modifications].join(' '));
    if (names.length) err('ip.name', at, `Names a protected property: ${names.join(', ')}`);
  });
  rights.references.forEach((ref, i) => {
    if (ids.has(ref.id)) err('rights.reference', `rights.references.${i}`, 'A reference image is never a production asset');
    if (ref.thirdPartyReference) err('rights.thirdParty', `rights.references.${i}`, 'Third-party reference images are not used (D126)');
  });
  return { ok: issues.length === 0, issues, manifest: issues.length === 0 ? manifest : null, rights: issues.length === 0 ? rights : null };
}

const overlaps = (a: NormBox, b: NormBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: NormBox, b: NormBox) => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;

// ---------- the usable set and lookups ----------

/** What a bundler gives for an image: a module number (native), a URL, or an asset object (web). */
export type ArtSource = number | string | object;

/**
 * The art a renderer may draw: entries whose image resolves and, in production, whose rights record
 * says approved. `source` returns what Skia's useImage takes.
 */
export interface ArtSet {
  readonly entries: readonly ArtEntry[];
  source(id: string): ArtSource | null;
}

export const EMPTY_ART: ArtSet = { entries: [], source: () => null };

/** Production: approved and reviewed entries that have a bundled file. */
export function productionArt(manifest: ArtManifest, rights: RightsManifest, sources: Readonly<Record<string, ArtSource>>): ArtSet {
  const ok = (id: string) => {
    const rec = rights.assets.find((r) => r.asset === id);
    return rec?.approval === 'approved' && rec.humanReviewed && sources[id] !== undefined;
  };
  return { entries: manifest.assets.filter((a) => ok(a.id)), source: (id) => (ok(id) ? sources[id]! : null) };
}

/** Development calibration art: shown without approval, never bundled in production (src/devtools). */
export function calibrationArt(manifest: ArtManifest, sources: Readonly<Record<string, ArtSource>>): ArtSet {
  return { entries: manifest.assets.filter((a) => sources[a.id] !== undefined), source: (id) => sources[id] ?? null };
}

/**
 * A landing's layers for its state, back to front, or null when the floor has no background (then
 * the whole floor is drawn as vectors: a floor is never half art and half vector). Base layers
 * (state "any") come first in each layer; a state overlay (Floor 15 restored) draws above its base.
 */
export function landingLayers(set: ArtSet, floor: number, state: Landing['state']): ArtEntry[] | null {
  const want = (a: ArtEntry) => a.kind === 'landing' && a.floor === floor && (a.state === 'any' || a.state === state);
  const mine = set.entries.filter(want);
  if (!mine.some((a) => a.layer === 'background' && a.state === 'any')) return null;
  const order = (a: ArtEntry) => LANDING_LAYERS.indexOf(a.layer as LandingLayerName) * 2 + (a.state === 'any' ? 0 : 1);
  return [...mine].sort((a, b) => order(a) - order(b));
}

/** The cabin's layers, or null when its required parts are missing (then the vector cabin draws). */
export const CABIN_REQUIRED: readonly CabinLayer[] = ['backing', 'door-left', 'door-right'];
export function cabinLayers(set: ArtSet): Partial<Record<CabinLayer, ArtEntry>> | null {
  const out: Partial<Record<CabinLayer, ArtEntry>> = {};
  for (const a of set.entries) if (a.kind === 'cabin') out[a.layer as CabinLayer] = a;
  return CABIN_REQUIRED.every((l) => out[l]) ? out : null;
}

/** Lifty's image for a pose; a missing pose falls back to the neutral image, then to vectors. */
export function liftyArt(set: ArtSet, pose: LiftyArtPose): ArtEntry | null {
  const find = (p: LiftyArtPose) => set.entries.find((a) => a.kind === 'lifty' && a.pose === p) ?? null;
  return find(pose) ?? find('neutral');
}

export function objectArt(set: ArtSet, visual: ObjectVisual): ArtEntry | null {
  return set.entries.find((a) => a.kind === 'object' && a.visual === visual) ?? null;
}

export function iconArt(set: ArtSet, floor: number): ArtEntry | null {
  return set.entries.find((a) => a.kind === 'icon' && a.floor === floor) ?? null;
}

/** Which floors have landing art: the current one and the likely next are what to keep loaded. */
export function landingArtFloors(set: ArtSet): number[] {
  return [...new Set(set.entries.filter((a) => a.kind === 'landing' && a.layer === 'background').map((a) => a.floor!))].sort((a, b) => a - b);
}

/** Floors whose landing art to hold: the car's floor and its destination (or the next call). */
export function landingWindow(current: number, next: number | null): number[] {
  return next === null || next === current ? [current] : [current, next].slice(0, ART_BUDGET.landingWindow);
}
