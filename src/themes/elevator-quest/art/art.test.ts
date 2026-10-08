// The art pipeline's architecture (not its pixels): the manifest and rights record validate, the
// lookups pick the right layers or fall back to vectors, and the crop math keeps the safe core,
// the native overlays and the touch areas where they belong for every doorway shape.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import calibrationJson from '../../../../assets/dev/art/calibration.json';
import manifestJson from '../../../../content/themes/elevator-quest/art/manifest.json';
import rightsJson from '../../../../content/themes/elevator-quest/art/rights.json';
import { LANDINGS } from '../content/landings';
import { cabinGeometry } from '../ui/cabinGeometry';
import { NUMBER_ZONE, OBJECT_SLOT, OBJECT_SLOT_WIDE, SIGN_ZONE, heroPose } from '../ui/landingArt';
import { computeLayout } from '../ui/layout';
import { ART_CONTEXT, ART_MANIFEST, ART_RIGHTS, PRODUCTION_ART } from './catalog';
import { alwaysVisible, cabinArtBoxes, canvasBoxInDoor, canvasToScreen, contain, cover, doorOfAspect, landingArtFits, landingPlacement, parallaxOffset, reservedZone, toDoorUnits, visibleCanvas, type Rect } from './fit';
import { CABIN_CANVAS, CABIN_LAYERS, CABIN_REQUIRED, DEFAULT_DEPTH, LIFTY_POSES, LANDING_CANVAS, PARALLAX_MAX, cabinLayers, calibrationArt, iconArt, reviewArt, landingArtFloors, landingLayers, landingWindow, liftyArt, objectArt, productionArt, validateArt, type ArtEntry, type ArtManifest, type ArtSet, type RightsManifest } from './manifest';
import { ART_SOURCES } from './sources';
import { LIFTY_HOVER, POSE_MOOD, hoverAmplitude, liftyArtPose } from '../ui/liftyPose';

const provenance = { provider: 'test fixture', aiGenerated: true, humanReviewed: true, license: 'Project-owned.' };
const rec = (asset: string, over: Partial<RightsManifest['assets'][number]> = {}): RightsManifest['assets'][number] => ({ asset, source: 'test fixture', madeWith: 'image tool', date: '2026-10-07', aiGenerated: true, humanReviewed: true, license: 'Project-owned.', modifications: '', approval: 'approved', approvedBy: 'project owner', ...over });
const entry = (over: Partial<ArtEntry> & Pick<ArtEntry, 'id' | 'kind' | 'file'>): ArtEntry => ({ width: 512, height: 512, alpha: true, provenance, state: 'any', ...over });

/** A small, valid art pack: Floor 15 base + restored overlay, a moving piece, a cabin, Lifty, an object. */
function pack(): { manifest: ArtManifest; rights: RightsManifest } {
  const assets: ArtEntry[] = [
    entry({ id: 'landing.15.background', kind: 'landing', file: 'landings/15/background.webp', width: 1024, height: 1024, alpha: false, layer: 'background', floor: 15 }),
    entry({ id: 'landing.15.light-restored', kind: 'landing', file: 'landings/15/light-restored.webp', layer: 'light', floor: 15, state: 'restored' }),
    entry({ id: 'landing.15.light-dormant', kind: 'landing', file: 'landings/15/light-dormant.webp', layer: 'light', floor: 15, state: 'dormant' }),
    entry({ id: 'landing.15.core', kind: 'landing', file: 'landings/15/core.webp', width: 256, height: 512, layer: 'moving', floor: 15, rect: { x: 0.18, y: 0.3, w: 0.1, h: 0.4 }, motion: { kind: 'tilt', pivot: { x: 0.5, y: 1 }, amount: 0.1, trigger: 'touch' }, hit: { x: 0.17, y: 0.28, w: 0.13, h: 0.44 } }),
    entry({ id: 'landing.20.background', kind: 'landing', file: 'landings/20/background.webp', width: 1024, height: 1024, alpha: false, layer: 'background', floor: 20 }),
    entry({ id: 'landing.20.flag', kind: 'landing', file: 'landings/20/flag.webp', width: 128, height: 256, layer: 'moving', floor: 20, rect: { x: 0.7, y: 0.4, w: 0.1, h: 0.3 }, motion: { kind: 'tilt', pivot: { x: 0, y: 1 }, amount: 0.12, trigger: 'arrival' } }),
    entry({ id: 'cabin.backing', kind: 'cabin', file: 'cabin/backing.webp', width: 1536, height: 1152, alpha: false, layer: 'backing' }),
    entry({ id: 'cabin.door-left', kind: 'cabin', file: 'cabin/door-left.webp', width: 384, height: 768, alpha: false, layer: 'door-left' }),
    entry({ id: 'cabin.door-right', kind: 'cabin', file: 'cabin/door-right.webp', width: 384, height: 768, alpha: false, layer: 'door-right' }),
    entry({ id: 'lifty.neutral', kind: 'lifty', file: 'lifty/neutral.webp', pose: 'neutral' }),
    entry({ id: 'lifty.help', kind: 'lifty', file: 'lifty/help.webp', pose: 'help' }),
    entry({ id: 'object.repair-kit', kind: 'object', file: 'objects/repair-kit.webp', width: 512, height: 320, visual: 'repairKit' }),
    // Last, so the index-based cases above keep their assets.
    entry({ id: 'cabin.frame-top', kind: 'cabin', file: 'cabin/frame-top.webp', width: 1792, height: 56, layer: 'frame-top' }),
    entry({ id: 'cabin.frame-left', kind: 'cabin', file: 'cabin/frame-left.webp', width: 56, height: 1792, layer: 'frame-left' }),
    entry({ id: 'cabin.frame-right', kind: 'cabin', file: 'cabin/frame-right.webp', width: 56, height: 1792, layer: 'frame-right' }),
  ];
  return { manifest: { schemaVersion: 1, theme: 'elevator-quest', assets }, rights: { schemaVersion: 1, theme: 'elevator-quest', assets: assets.map((a) => rec(a.id)), references: [] } };
}
const sourcesFor = (m: ArtManifest) => Object.fromEntries(m.assets.map((a, i) => [a.id, i + 1]));
/** Ids the developer tools' review list requires. */
const reviewListed = () => [...fs.readFileSync(path.join(__dirname, '../../../../src/devtools/artReviewSources.ts'), 'utf8').matchAll(/^\s+'([a-z0-9.-]+)': require\(/gm)].map((m) => m[1]!);
const codes = (f: (p: ReturnType<typeof pack>) => void) => {
  const p = pack();
  f(p);
  return validateArt(p.manifest, p.rights, ART_CONTEXT).issues.map((i) => i.code);
};

describe('art manifest', () => {
  it('the shipped manifest and rights record validate; only approved art is bundled for production', () => {
    expect(validateArt(manifestJson, rightsJson, ART_CONTEXT).issues).toEqual([]);
    const approval = (id: string) => ART_RIGHTS.assets.find((r) => r.asset === id)?.approval;
    // Production sources hold approved art and nothing else; production draws exactly those.
    expect(Object.keys(ART_SOURCES).sort()).toEqual(ART_MANIFEST.assets.filter((a) => approval(a.id) === 'approved').map((a) => a.id).sort());
    expect(PRODUCTION_ART.entries.map((e) => e.id).sort()).toEqual(Object.keys(ART_SOURCES).sort());
    // Art pending review is required only from the developer tools' review list, with its own file.
    const review = [...fs.readFileSync(path.join(__dirname, '../../../../src/devtools/artReviewSources.ts'), 'utf8').matchAll(/^\s+'([a-z0-9.-]+)': require\('\.\.\/\.\.\/assets\/themes\/elevator-quest\/art\/([^']+)'\),$/gm)].map((m) => [m[1], m[2]]);
    expect(review.sort()).toEqual(ART_MANIFEST.assets.filter((a) => approval(a.id) === 'pending').map((a) => [a.id, a.file]).sort());
    // Rejected art is required from neither list.
    const rejected = ART_MANIFEST.assets.filter((a) => approval(a.id) === 'rejected').map((a) => a.id);
    expect(rejected).toEqual(['lifty.quiet-rejected']);
    for (const id of rejected) expect([ART_SOURCES[id], reviewListed().includes(id)]).toEqual([undefined, false]);
  });

  it('every approved file is required from the production registry and resolves to its own file; no calibration art ships (M8.1)', () => {
    const registry = fs.readFileSync(path.join(__dirname, 'sources.ts'), 'utf8');
    for (const a of ART_MANIFEST.assets.filter((x) => ART_RIGHTS.assets.find((r) => r.asset === x.id)?.approval === 'approved')) {
      // One static require per approved file, naming the manifest's own file, and the file is on disk.
      expect({ id: a.id, required: registry.includes(`'${a.id}': require('../../../../assets/themes/elevator-quest/art/${a.file}'),`) }).toEqual({ id: a.id, required: true });
      expect({ id: a.id, onDisk: fs.existsSync(path.join(__dirname, '../../../../assets/themes/elevator-quest/art', a.file)) }).toEqual({ id: a.id, onDisk: true });
      // The theme project reads a required image as its path: production resolves the asset to that file.
      expect(PRODUCTION_ART.source(a.id)).toBe(`assets/themes/elevator-quest/art/${a.file}`);
    }
    // Calibration patterns (assets/dev/art) are development tools, never production art.
    expect(registry).not.toMatch(/assets\/dev\//);
    expect(Object.values(ART_SOURCES).filter((s) => String(s).includes('assets/dev/'))).toEqual([]);
    for (const a of ART_MANIFEST.assets) expect({ id: a.id, calibration: a.provenance.provider.includes('Calibration') }).toEqual({ id: a.id, calibration: false });
    // And no production file is a copy of a calibration pattern (compared by content).
    const md5 = (file: string) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
    const calibration = new Set((calibrationJson as ArtManifest).assets.map((a) => md5(path.join(__dirname, '../../../../assets/dev/art', a.file))));
    expect(calibration.size).toBeGreaterThan(0);
    expect(ART_MANIFEST.assets.filter((a) => calibration.has(md5(path.join(__dirname, '../../../../assets/themes/elevator-quest/art', a.file)))).map((a) => a.id)).toEqual([]);
  });

  it('review shows approved and pending art, never rejected art; production shows only approved', () => {
    const p = pack();
    const rights = { ...p.rights, assets: p.rights.assets.map((r, i) => (i === 0 ? { ...r, approval: 'pending' as const, humanReviewed: false, approvedBy: undefined } : i === 1 ? { ...r, approval: 'rejected' as const } : r)) };
    const sources = sourcesFor(p.manifest);
    const review = reviewArt(p.manifest, rights, sources);
    expect(review.source(p.manifest.assets[0]!.id)).not.toBeNull();
    expect(review.source(p.manifest.assets[1]!.id)).toBeNull();
    expect(productionArt(p.manifest, rights, sources).source(p.manifest.assets[0]!.id)).toBeNull();
  });

  it('every bundled source has a manifest entry and an existing file', () => {
    for (const a of ART_MANIFEST.assets) expect(fs.existsSync(path.join(__dirname, '../../../../assets/themes/elevator-quest/art', a.file))).toBe(true);
  });

  it('the development calibration set validates, matches its files and its require list, and covers the proof floors', () => {
    const cal = calibrationJson as ArtManifest;
    const stub: RightsManifest = { schemaVersion: 1, theme: 'elevator-quest', assets: cal.assets.map((a) => rec(a.id, { source: a.provenance.provider, madeWith: 'generator', aiGenerated: false, humanReviewed: false, license: a.provenance.license, approval: 'pending', approvedBy: undefined as never })), references: [] };
    for (const r of stub.assets) delete (r as { approvedBy?: string }).approvedBy;
    const checked = validateArt(cal, stub, ART_CONTEXT);
    expect(checked.issues).toEqual([]);
    const root = path.join(__dirname, '../../../../');
    for (const a of cal.assets) expect(fs.existsSync(path.join(root, 'assets/dev/art', a.file))).toBe(true);
    const listed = [...fs.readFileSync(path.join(root, 'src/devtools/artCalibrationSources.ts'), 'utf8').matchAll(/^\s+'([a-z0-9.-]+)': require\('\.\.\/\.\.\/assets\/dev\/art\/([^']+)'\),$/gm)].map((m) => [m[1], m[2]]);
    expect(listed).toEqual(cal.assets.map((a) => [a.id, a.file]));
    // Floor 15 both ways, the four destinations, the whole cabin, every Lifty pose and object.
    const set = calibrationArt(checked.manifest!, Object.fromEntries(cal.assets.map((a) => [a.id, 1])));
    for (const f of [7, 9, 13, 20]) expect(landingLayers(set, f, 'normal')!.map((l) => l.layer)).toEqual(['background', 'moving']);
    expect(landingLayers(set, 15, 'dormant')!.map((l) => l.id)).toContain('landing.15.light-dormant');
    expect(landingLayers(set, 15, 'restored')!.map((l) => l.id)).toContain('landing.15.light-restored');
    expect(Object.keys(cabinLayers(set)!).sort()).toEqual([...CABIN_LAYERS].sort());
    for (const pose of LIFTY_POSES) expect(liftyArt(set, pose)!.pose).toBe(pose);
    // No production asset is a calibration pattern, and production never sees calibration files.
    expect(ART_MANIFEST.assets.some((a) => a.provenance.provider.includes('Calibration'))).toBe(false);
  });

  it('the concept pack is a reference only: never approved, never an asset', () => {
    for (const r of rightsJson.references) expect(r).toMatchObject({ approval: 'reference-only', thirdPartyReference: false, humanReviewRequired: true, inRepository: false });
    // The concept pack, the six asset sheets and the first back wall: OpenAI image generation via ChatGPT, for this project.
    expect(rightsJson.references.map((r) => r.id)).toEqual(['concept.elevator-quest.pack-2026-10', ...['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `concept.elevator-quest.asset-sheet-${x}`), 'concept.elevator-quest.back-wall-first']);
    for (const r of rightsJson.references) expect(r).toMatchObject({ aiGenerated: true, source: expect.stringMatching(/OpenAI image generation via ChatGPT/) });
    expect(codes((p) => p.rights.references.push({ id: 'landing.15.background', description: 'A concept used as an asset', purpose: 'visual concept', source: 'test', aiGenerated: true, humanReviewed: false, humanReviewRequired: true, approval: 'reference-only', inRepository: false, thirdPartyReference: false }))).toContain('rights.reference');
    expect(codes((p) => (p.rights.assets[0]!.approval = 'reference-only'))).toContain('rights.reference');
  });

  it('a valid pack validates', () => {
    const p = pack();
    expect(validateArt(p.manifest, p.rights, ART_CONTEXT).issues).toEqual([]);
  });

  it('refuses floors outside the tower (no Floor 21), dormant art on a floor without that state, and duplicate slots', () => {
    expect(codes((p) => (p.manifest.assets[0]!.floor = 21))).toContain('ref.floor');
    expect(codes((p) => (p.manifest.assets[4]!.floor = 0))).toContain('ref.floor');
    expect(codes((p) => (p.manifest.assets[1]!.floor = 20))).toContain('ref.state');
    expect(codes((p) => p.manifest.assets.push({ ...p.manifest.assets[9]!, id: 'lifty.neutral-2', file: 'lifty/neutral-2.webp' }))).toContain('dup.slot');
    expect(codes((p) => p.manifest.assets.push({ ...p.manifest.assets[0]! }))).toEqual(expect.arrayContaining(['dup.id', 'dup.slot']));
  });

  it('refuses keys that do not belong to the kind, and an asset outside its folder', () => {
    expect(codes((p) => (p.manifest.assets[9]!.floor = 3))).toContain('ref.key');
    expect(codes((p) => (p.manifest.assets[6]!.layer = 'roof'))).toContain('ref.layer');
    expect(codes((p) => (p.manifest.assets[11]!.file = 'landings/repair-kit.webp'))).toContain('ref.folder');
  });

  it('moving pieces need a pivot and a place inside the safe core; touch areas only where there is something to touch', () => {
    expect(codes((p) => delete p.manifest.assets[3]!.motion)).toContain('missing.motion');
    expect(codes((p) => delete p.manifest.assets[3]!.rect)).toContain('missing.rect');
    expect(codes((p) => (p.manifest.assets[3]!.rect = { x: 0.01, y: 0.3, w: 0.2, h: 0.5 }))).toContain('ref.safe');
    // A layer never reaches outside the canvas.
    expect(codes((p) => (p.manifest.assets[3]!.rect = { x: 0.9, y: 0.3, w: 0.2, h: 0.2 }))).toContain('ref.rect');
    expect(codes((p) => (p.manifest.assets[0]!.motion = { kind: 'spin', pivot: { x: 0.5, y: 0.5 }, amount: 1, trigger: 'touch' }))).toContain('ref.motion');
    // A moving piece may not cover the place sign; the middle of the wall is the scene's (D136).
    expect(codes((p) => (p.manifest.assets[5]!.rect = { x: 0.6, y: 0.12, w: 0.15, h: 0.15 }))).toContain('ref.reserved');
    expect(codes((p) => (p.manifest.assets[5]!.rect = { x: 0.45, y: 0.4, w: 0.1, h: 0.1 }))).not.toContain('ref.reserved');
    // Floor 20 has a spot since M8 (the putt): a hit is still refused where there is nothing to touch.
    const within = (ctx: Partial<typeof ART_CONTEXT>, f: (p: ReturnType<typeof pack>) => void = () => {}) => {
      const p = pack();
      f(p);
      return validateArt(p.manifest, p.rights, { ...ART_CONTEXT, ...ctx }).issues.map((i) => i.code);
    };
    expect(within({ exploreFloors: [15] }, (p) => (p.manifest.assets[4]!.hit = { x: 0.3, y: 0.3, w: 0.2, h: 0.2 }))).toContain('ref.hit');
    // A floor whose spots carry their own boxes (landings.json) needs no hit; a spot's prop needs no motion of its own.
    expect(within({ exploreFloors: [15, 20], boxedFloors: [20] })).toEqual([]);
    expect(within({ exploreFloors: [15, 20], boxedFloors: [] })).toContain('missing.hit');
    expect(codes((p) => delete p.manifest.assets[5]!.motion)).toContain('missing.motion');
    expect(within({ spotProps: ['landing.20.flag'] }, (p) => delete p.manifest.assets[5]!.motion)).toEqual([]);
    expect(codes((p) => (p.manifest.assets[3]!.hit = { x: 0.02, y: 0.3, w: 0.2, h: 0.2 }))).toContain('ref.hit');
    expect(codes((p) => delete p.manifest.assets[3]!.hit)).toContain('missing.hit');
  });

  it('Lifty poses and mission objects are transparent and within budget; a landing stays within its memory budget', () => {
    expect(codes((p) => (p.manifest.assets[9]!.alpha = false))).toContain('ref.alpha');
    expect(codes((p) => Object.assign(p.manifest.assets[9]!, { width: 1024, height: 1024 }))).toContain('budget.lifty');
    expect(codes((p) => Object.assign(p.manifest.assets[11]!, { width: 1024, height: 1024 }))).toContain('budget.object');
    expect(codes((p) => Object.assign(p.manifest.assets[0]!, { width: 2048, height: 2048 }))).toContain('budget.landing');
  });

  it('rights: every asset has a record that agrees; approval needs a person; no third-party references', () => {
    expect(codes((p) => p.rights.assets.pop())).toContain('missing.rights');
    expect(codes((p) => (p.rights.assets[0]!.aiGenerated = false))).toContain('rights.mismatch');
    expect(codes((p) => (p.rights.assets[0]!.humanReviewed = false))).toEqual(expect.arrayContaining(['rights.mismatch', 'rights.review']));
    expect(codes((p) => delete p.rights.assets[0]!.approvedBy)).toContain('rights.approver');
    expect(codes((p) => p.rights.references.push({ id: 'concept.other', description: 'Someone else picture', purpose: 'visual concept', source: 'web', aiGenerated: false, humanReviewed: false, humanReviewRequired: true, approval: 'reference-only', inRepository: false, thirdPartyReference: true }))).toContain('rights.thirdParty');
  });

  it('a sign plate belongs to a background and sits inside the safe core, so every doorway shows the name (D150)', () => {
    expect(codes((p) => (p.manifest.assets[0]!.sign = { x: 0.3, y: 0.1, w: 0.4, h: 0.08 }))).toEqual([]);
    expect(codes((p) => (p.manifest.assets[0]!.sign = { x: 0.3, y: 0.02, w: 0.4, h: 0.1 }))).toContain('ref.sign');
    expect(codes((p) => (p.manifest.assets[1]!.sign = { x: 0.3, y: 0.1, w: 0.4, h: 0.08 }))).toContain('ref.sign');
    expect(codes((p) => (p.manifest.assets[9]!.sign = { x: 0.3, y: 0.1, w: 0.4, h: 0.08 }))).toContain('ref.key');
    // A state background covers its base: it must paint the same plate in the same ink.
    const plate = { x: 0.3, y: 0.1, w: 0.4, h: 0.08 };
    const withRestored = (sign: typeof plate, signInk: 'light' | 'dark') => (p: ReturnType<typeof pack>) => {
      Object.assign(p.manifest.assets[0]!, { sign: plate, signInk: 'light' });
      p.manifest.assets.push(entry({ id: 'landing.15.background-restored', kind: 'landing', file: 'landings/15/background-restored.webp', width: 1024, height: 1024, alpha: false, layer: 'background', floor: 15, state: 'restored', sign, signInk }));
      p.rights.assets.push(rec('landing.15.background-restored'));
    };
    expect(codes(withRestored(plate, 'light'))).not.toContain('ref.sign');
    expect(codes(withRestored({ ...plate, y: 0.12 }, 'light'))).toContain('ref.sign');
    expect(codes(withRestored(plate, 'dark'))).toContain('ref.sign');
  });

  it('refuses franchise names in ids, files and provenance', () => {
    expect(codes((p) => (p.manifest.assets[4]!.id = 'landing.20.mario-green'))).toContain('ip.name');
    expect(codes((p) => (p.manifest.assets[4]!.provenance.provider = 'Minecraft texture pack'))).toContain('ip.name');
    expect(codes((p) => (p.rights.assets[0]!.modifications = 'Added a Triforce to the banner'))).toContain('ip.name');
  });
});

/** Approved by the project owner after reviewing them (D145). */
const D145_APPROVED = ['cabin.backing', 'cabin.ceiling', 'cabin.floor', 'cabin.wall-left', 'cabin.wall-right', 'cabin.frame-top', 'cabin.frame-left', 'cabin.frame-right', 'cabin.door-left', 'cabin.door-right', 'lifty.neutral'];
/** Approved by the owner's instruction for M8.1 (2026-10-08) after an agent audit of each file. */
const M81_APPROVED_BY = 'project owner, by instruction for M8.1 (2026-10-08), after an agent audit';
const M81_POSES = ['lifty.quiet', 'lifty.success', 'lifty.help', 'lifty.concerned', 'lifty.thinking'];
const M81_LANDINGS = [
  ...['landing.1.background', 'landing.7.background', 'landing.9.background', 'landing.13.background', 'landing.15.background', 'landing.15.background-restored', 'landing.20.background'],
  ...['landing.2.background', 'landing.5.background', 'landing.6.background', 'landing.11.background', 'landing.17.background', 'landing.18.background'],
];
const M81_PROPS = ['landing.2.toolbox', 'landing.2.toolbox-open', 'landing.18.telescope', 'landing.20.ball'];
const M81_APPROVED = [...M81_POSES, ...M81_LANDINGS, ...M81_PROPS];

describe('art lookups', () => {
  const p = pack();
  const set = productionArt(p.manifest, p.rights, sourcesFor(p.manifest));

  it('production shows only approved, reviewed, bundled art', () => {
    expect(set.entries).toHaveLength(p.manifest.assets.length);
    const pending = { ...p.rights, assets: p.rights.assets.map((r) => (r.asset === 'landing.20.background' ? { ...r, approval: 'pending' as const } : r)) };
    const withPending = productionArt(p.manifest, pending, sourcesFor(p.manifest));
    expect(withPending.source('landing.20.background')).toBeNull();
    expect(landingLayers(withPending, 20, 'normal')).toBeNull();
    const missing = productionArt(p.manifest, p.rights, { ...sourcesFor(p.manifest), 'cabin.backing': undefined as never });
    expect(cabinLayers(missing)).toBeNull();
    // Calibration art (development) needs no approval but still needs a file.
    expect(calibrationArt(p.manifest, { 'lifty.neutral': 1 }).entries.map((e) => e.id)).toEqual(['lifty.neutral']);
  });

  it('Floor 15: the base layers in every state, with the power overlay for the state it is in', () => {
    expect(landingLayers(set, 15, 'dormant')!.map((a) => a.id)).toEqual(['landing.15.background', 'landing.15.core', 'landing.15.light-dormant']);
    expect(landingLayers(set, 15, 'restored')!.map((a) => a.id)).toEqual(['landing.15.background', 'landing.15.core', 'landing.15.light-restored']);
  });

  it('a floor without a background is drawn by vectors; so is every floor of an empty set', () => {
    expect(landingLayers(set, 9, 'normal')).toBeNull();
    const empty = productionArt(ART_MANIFEST, ART_RIGHTS, {});
    expect(empty.entries).toEqual([]);
    for (let f = 1; f <= 20; f++) expect(landingLayers(empty, f, 'normal')).toBeNull();
    // Production: the floors without landing art (3, 4, 8, 10, 12, 14, 16 and 19) keep their vector
    // landing; no mission object or directory icon art exists yet.
    for (const f of [3, 4, 8, 10, 12, 14, 16, 19]) expect({ f, layers: landingLayers(PRODUCTION_ART, f, 'normal') }).toEqual({ f, layers: null });
    for (const s of [empty, PRODUCTION_ART]) {
      expect(objectArt(s, 'repairKit')).toBeNull();
      expect(iconArt(s, 7)).toBeNull();
    }
    expect(cabinLayers(empty)).toBeNull();
    expect(liftyArt(empty, 'neutral')).toBeNull();
  });

  it('Lifty falls back to the neutral image for a pose without art; objects and cabin resolve by slot', () => {
    expect(liftyArt(set, 'help')!.id).toBe('lifty.help');
    expect(liftyArt(set, 'thinking')!.id).toBe('lifty.neutral');
    // Some poses without the neutral one: vectors throughout, unless the developer tools force a pose.
    const partial: ArtSet = { entries: set.entries.filter((a) => a.kind === 'lifty' && a.pose === 'help'), source: () => 1 };
    for (const pose of LIFTY_POSES) expect(liftyArt(partial, pose)).toBeNull();
    expect(liftyArt(partial, 'help', true)!.id).toBe('lifty.help');
    expect(liftyArt(partial, 'quiet', true)).toBeNull();
    expect(objectArt(set, 'repairKit')!.id).toBe('object.repair-kit');
    expect(objectArt(set, 'beacon')).toBeNull();
    expect(Object.keys(cabinLayers(set)!).sort()).toEqual(['backing', 'door-left', 'door-right', 'frame-left', 'frame-right', 'frame-top']);
    // All or nothing (D142): without any one of the six, the whole vector cabin draws. Only the
    // developer inspection toggle shows pieces on their own.
    expect([...CABIN_REQUIRED].sort()).toEqual(['backing', 'door-left', 'door-right', 'frame-left', 'frame-right', 'frame-top']);
    for (const layer of CABIN_REQUIRED) {
      const without: ArtSet = { entries: set.entries.filter((a) => !(a.kind === 'cabin' && a.layer === layer)), source: set.source };
      expect({ layer, cabin: cabinLayers(without) }).toEqual({ layer, cabin: null });
      expect(cabinLayers(without, true)).not.toBeNull();
    }
    const lone = calibrationArt(p.manifest, { 'cabin.backing': 1 });
    expect(cabinLayers(lone)).toBeNull();
    expect(Object.keys(cabinLayers(lone, true)!)).toEqual(['backing']);
  });

  it('a complete pending cabin shows in Review, never in Production; one rejected piece sends Review back to vectors', () => {
    const p = pack();
    const sources = sourcesFor(p.manifest);
    const pending: RightsManifest = { ...p.rights, assets: p.rights.assets.map((r) => (r.asset.startsWith('cabin.') ? { ...r, approval: 'pending' as const, humanReviewed: false, approvedBy: undefined } : r)) };
    expect(cabinLayers(reviewArt(p.manifest, pending, sources))).not.toBeNull();
    expect(cabinLayers(productionArt(p.manifest, pending, sources))).toBeNull();
    const oneRejected: RightsManifest = { ...pending, assets: pending.assets.map((r) => (r.asset === 'cabin.frame-left' ? { ...r, approval: 'rejected' as const } : r)) };
    expect(cabinLayers(reviewArt(p.manifest, oneRejected, sources))).toBeNull();
    // Lifty art waits for neutral in Production too.
    const noNeutral: RightsManifest = { ...p.rights, assets: p.rights.assets.map((r) => (r.asset === 'lifty.neutral' ? { ...r, approval: 'pending' as const, humanReviewed: false, approvedBy: undefined } : r)) };
    expect(liftyArt(productionArt(p.manifest, noNeutral, sources), 'help')).toBeNull();
    expect(liftyArt(reviewArt(p.manifest, noNeutral, sources), 'help')!.id).toBe('lifty.help');
  });

  it('the owner-approved cabin and Lifty neutral draw in Production; a missing piece still falls back to vectors (D145)', () => {
    for (const id of D145_APPROVED) expect(ART_RIGHTS.assets.find((r) => r.asset === id)).toMatchObject({ approval: 'approved', humanReviewed: true, approvedBy: 'project owner' });
    // The production registry: the D145 eleven and the M8.1 set, nothing else.
    expect(Object.keys(ART_SOURCES).sort()).toEqual([...D145_APPROVED, ...M81_APPROVED].sort());
    // Each registry line bundles the manifest's own file.
    for (const id of D145_APPROVED) expect(PRODUCTION_ART.source(id)).toBe(`assets/themes/elevator-quest/art/${ART_MANIFEST.assets.find((a) => a.id === id)!.file}`);
    // Production and Review draw the same cabin: the six required pieces, plus the ceiling, floor and
    // side walls; the inlay and light overlay have no art and stay unpainted.
    for (const set of [PRODUCTION_ART, reviewArt(ART_MANIFEST, ART_RIGHTS, ART_SOURCES)]) {
      expect(Object.keys(cabinLayers(set) ?? {}).sort()).toEqual([...CABIN_REQUIRED, 'ceiling', 'floor', 'wall-left', 'wall-right'].sort());
    }
    // The vector fallback is intact: without one required piece the whole cabin is vectors again,
    // and without the neutral pose so is Lifty, in every pose (D141).
    const without = (id: string) => productionArt(ART_MANIFEST, ART_RIGHTS, Object.fromEntries(Object.entries(ART_SOURCES).filter(([k]) => k !== id)));
    for (const layer of CABIN_REQUIRED) expect({ layer, cabin: cabinLayers(without(`cabin.${layer}`)) }).toEqual({ layer, cabin: null });
    expect(cabinLayers(without('cabin.floor'))).not.toBeNull(); // an optional part only falls back itself
    for (const pose of LIFTY_POSES) expect({ pose, art: liftyArt(without('lifty.neutral'), pose) }).toEqual({ pose, art: null });
  });

  it('the rejected procedural Quiet never shows in Review or Production, not even forced from the pose picker (owner decision, D142)', () => {
    expect(ART_RIGHTS.assets.find((r) => r.asset === 'lifty.quiet-rejected')).toMatchObject({ approval: 'rejected', humanReviewed: true });
    // Even with a source for every file, the rejected one is left out: Quiet is the new candidate (D147).
    const everything = Object.fromEntries(ART_MANIFEST.assets.map((a, i) => [a.id, i + 1]));
    for (const set of [reviewArt(ART_MANIFEST, ART_RIGHTS, everything), productionArt(ART_MANIFEST, ART_RIGHTS, everything), PRODUCTION_ART]) {
      expect(set.entries.map((e) => e.id)).not.toContain('lifty.quiet-rejected');
      expect(liftyArt(set, 'quiet', true)?.id).not.toBe('lifty.quiet-rejected');
    }
  });

  it('the M8.1 approval: every pending candidate approved by the owner\'s instruction, recorded as such; nothing left in Review only', () => {
    // Exactly these twenty-two: Lifty's five poses (D147), the landing backgrounds (D150, D157) and the moving props (D156).
    expect(ART_RIGHTS.assets.filter((r) => r.approvedBy === M81_APPROVED_BY).map((r) => r.asset).sort()).toEqual([...M81_APPROVED].sort());
    for (const id of M81_APPROVED) {
      // The validator needs a human decision for approval; the record names whose and on what basis.
      expect(ART_RIGHTS.assets.find((r) => r.asset === id)).toMatchObject({ approval: 'approved', humanReviewed: true, aiGenerated: true, approvedBy: M81_APPROVED_BY });
      expect(ART_MANIFEST.assets.find((a) => a.id === id)!.provenance).toMatchObject({ humanReviewed: true, aiGenerated: true });
      expect(PRODUCTION_ART.source(id)).toBe(`assets/themes/elevator-quest/art/${ART_MANIFEST.assets.find((a) => a.id === id)!.file}`);
    }
    // Nothing is pending any more, so the developer review list is empty and Review draws what Production draws.
    expect(ART_RIGHTS.assets.filter((r) => r.approval === 'pending')).toEqual([]);
    expect(reviewListed()).toEqual([]);
    expect(reviewArt(ART_MANIFEST, ART_RIGHTS, ART_SOURCES).entries.map((e) => e.id)).toEqual(PRODUCTION_ART.entries.map((e) => e.id));
    // The rejected procedural Quiet stays rejected (D142, D147).
    expect(ART_RIGHTS.assets.find((r) => r.asset === 'lifty.quiet-rejected')).toMatchObject({ approval: 'rejected' });
  });

  it("Lifty's six poses draw in Production, each for its own mood; a pose without its file shows the neutral master (D147, M8.1)", () => {
    for (const pose of LIFTY_POSES) {
      for (const set of [PRODUCTION_ART, reviewArt(ART_MANIFEST, ART_RIGHTS, ART_SOURCES)]) expect({ pose, art: liftyArt(set, pose)!.id }).toEqual({ pose, art: `lifty.${pose}` });
    }
    expect(M81_POSES.map((id) => ART_MANIFEST.assets.find((a) => a.id === id)!.pose).sort()).toEqual(LIFTY_POSES.filter((p) => p !== 'neutral').sort());
    // A pose whose file is missing (or fails to load) falls back to the neutral master, never to a different robot.
    const noHelp = productionArt(ART_MANIFEST, ART_RIGHTS, Object.fromEntries(Object.entries(ART_SOURCES).filter(([k]) => k !== 'lifty.help')));
    expect(liftyArt(noHelp, 'help')!.id).toBe('lifty.neutral');
    expect(liftyArt(noHelp, 'quiet')!.id).toBe('lifty.quiet');
  });

  it('the illustrated landings draw in Production; Floor 15 swaps its whole scene when restored (D150, D157, M8.1)', () => {
    const illustrated = [1, 2, 5, 6, 7, 9, 11, 13, 15, 17, 18, 20];
    expect(landingArtFloors(PRODUCTION_ART)).toEqual(illustrated);
    for (const f of illustrated.filter((fl) => fl !== 15)) {
      // The background first, then the floor's props, all of the base state.
      const ids = landingLayers(PRODUCTION_ART, f, 'normal')!.map((a) => a.id);
      expect(ids[0]).toBe(`landing.${f}.background`);
      expect([...ids].sort()).toEqual([...M81_LANDINGS, ...M81_PROPS].filter((id) => id.startsWith(`landing.${f}.`)).sort());
    }
    expect(landingLayers(PRODUCTION_ART, 2, 'normal')!.map((a) => a.id)).toEqual(['landing.2.background', 'landing.2.toolbox', 'landing.2.toolbox-open']);
    expect(landingLayers(PRODUCTION_ART, 18, 'normal')!.map((a) => a.id)).toEqual(['landing.18.background', 'landing.18.telescope']);
    expect(landingLayers(PRODUCTION_ART, 20, 'normal')!.map((a) => a.id)).toEqual(['landing.20.background', 'landing.20.ball']);
    // Floor 18 is painted with an empty telescope fork: the background and its tube are approved together or not at all.
    const approval = (id: string) => ART_RIGHTS.assets.find((r) => r.asset === id)?.approval;
    expect(approval('landing.18.background')).toBe(approval('landing.18.telescope'));
    // The dormant scene is the base (the state most of the mission sees); the restored scene covers it.
    expect(landingLayers(PRODUCTION_ART, 15, 'dormant')!.map((a) => a.id)).toEqual(['landing.15.background']);
    expect(landingLayers(PRODUCTION_ART, 15, 'restored')!.map((a) => a.id)).toEqual(['landing.15.background', 'landing.15.background-restored']);
    expect(landingLayers(PRODUCTION_ART, 15, 'dormant')![0]!.hit).toBeDefined();
    for (const id of [...M81_LANDINGS, ...M81_PROPS]) {
      const a = ART_MANIFEST.assets.find((x) => x.id === id)!;
      // Each painted plate carries the live name: its face and the ink that reads on it.
      if (a.layer === 'background') expect(a).toMatchObject({ alpha: false, sign: expect.any(Object), signInk: expect.stringMatching(/^(light|dark)$/) });
      // A prop is a transparent moving layer with its own place in the canvas.
      else expect(a).toMatchObject({ layer: 'moving', alpha: true, rect: expect.any(Object) });
    }
    // The vector landing stays the fallback: a floor whose background is missing is vectors again, props and all.
    const noBackground = productionArt(ART_MANIFEST, ART_RIGHTS, Object.fromEntries(Object.entries(ART_SOURCES).filter(([k]) => k !== 'landing.20.background')));
    expect(landingLayers(noBackground, 20, 'normal')).toBeNull();
  });

  it('a prop an explore spot moves sits over its painted thing, in register with the scene (M8)', () => {
    const spots = LANDINGS.floors.flatMap((f) => (f.explore ?? []).map((s) => ({ floor: f.floor, spot: s, object: f.objects?.find((o) => o.id === s.target) })));
    const props = spots.flatMap(({ floor, spot, object }) => [spot.prop, spot.openProp].flatMap((id) => {
      const entry = id ? ART_MANIFEST.assets.find((a) => a.id === id) : undefined;
      return entry ? [{ floor, entry, object }] : [];
    }));
    // The Floor 2 toolbox (closed and open), the Floor 18 telescope and the Floor 20 golf ball, at least.
    expect(props.map((p) => p.entry.id)).toEqual(expect.arrayContaining(['landing.2.toolbox', 'landing.2.toolbox-open', 'landing.18.telescope', 'landing.20.ball']));
    const centre = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const within = (pt: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) => pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
    for (const { floor, entry, object } of props) {
      const rect = entry.rect!;
      // Inside the canvas and its floor's safe core (the validator refuses the rest; this pins the shipped files).
      expect({ id: entry.id, inCanvas: rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= 1 && rect.y + rect.h <= 1 }).toEqual({ id: entry.id, inCanvas: true });
      expect(entry.floor).toBe(floor);
      // Over the object it moves: the touched thing's box holds the middle of the prop.
      expect({ id: entry.id, over: object?.box ? within(centre(rect), object.box) : true }).toEqual({ id: entry.id, over: true });
      // Drawn with the background's parallax, so a prop painted in register never slides off its place as the doors open.
      const background = ART_MANIFEST.assets.find((a) => a.kind === 'landing' && a.floor === floor && a.layer === 'background' && a.state === 'any')!;
      expect(entry.depth ?? DEFAULT_DEPTH.moving).toBe(background.depth ?? DEFAULT_DEPTH.background);
    }
  });

  it('a rejected asset fills no slot, so its replacement validates beside it (D147)', () => {
    const issues = codes((p) => {
      p.manifest.assets.push(entry({ id: 'lifty.neutral-old', kind: 'lifty', file: 'lifty/neutral-old.webp', pose: 'neutral' }));
      p.rights.assets.push(rec('lifty.neutral-old', { approval: 'rejected' }));
    });
    expect(issues).not.toContain('dup.slot');
    // Two live assets in one slot are still refused.
    expect(
      codes((p) => {
        p.manifest.assets.push(entry({ id: 'lifty.neutral-two', kind: 'lifty', file: 'lifty/neutral-two.webp', pose: 'neutral' }));
        p.rights.assets.push(rec('lifty.neutral-two', { approval: 'pending', humanReviewed: false, approvedBy: undefined }));
      }),
    ).toContain('dup.slot');
  });

  it('holds at most the current floor and the next', () => {
    expect(landingWindow(3, 10)).toEqual([3, 10]);
    expect(landingWindow(3, null)).toEqual([3]);
    expect(landingWindow(3, 3)).toEqual([3]);
  });
});

describe('art placement', () => {
  it('frame strips keep their full thickness on every screen, so the profile is never cropped; only the length is (D142)', () => {
    const SCREENS = [[1180, 820], [820, 1180], [960, 600], [600, 960], [1280, 800], [1366, 1024], [1133, 744], [694, 768], [590, 820], [375, 820], [320, 1024], [504, 820]] as const;
    for (const [w, h] of SCREENS) {
      const l = computeLayout({ width: w, height: h }, { top: 0, right: 0, bottom: 0, left: 0 });
      const g = cabinGeometry(l.cabin, l.bandHeight);
      const boxes = cabinArtBoxes(g, l.cabin, CABIN_CANVAS.backing.doorCenter);
      for (const [layer, img] of [['frame-top', CABIN_CANVAS.frameTop], ['frame-left', CABIN_CANVAS.frameSide], ['frame-right', CABIN_CANVAS.frameSide]] as const) {
        const { box, focus } = boxes[layer];
        const r = cover(box, img, focus);
        const [drawn, wanted] = layer === 'frame-top' ? [r.h, box.h] : [r.w, box.w];
        expect({ screen: [w, h], layer, thicknessKept: Math.abs(drawn - wanted) < 0.01 }).toEqual({ screen: [w, h], layer, thicknessKept: true });
      }
    }
  });

  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

  it('cover and contain scale uniformly: never a stretch', () => {
    for (const box of [{ x: 0, y: 0, w: 300, h: 400 }, { x: 10, y: 20, w: 500, h: 200 }])
      for (const img of [{ width: 1024, height: 1024 }, { width: 512, height: 320 }]) {
        const c = cover(box, img);
        expect(near(c.w / c.h, img.width / img.height)).toBe(true);
        expect(c.x <= box.x + 1e-9 && c.y <= box.y + 1e-9 && c.x + c.w >= box.x + box.w - 1e-9 && c.y + c.h >= box.y + box.h - 1e-9).toBe(true);
        const k = contain(box, img);
        expect(near(k.w / k.h, img.width / img.height)).toBe(true);
        expect(k.x >= box.x - 1e-9 && k.x + k.w <= box.x + box.w + 1e-9 && near(k.y + k.h, box.y + box.h)).toBe(true);
      }
  });

  it('the safe core is in view at every supported doorway shape, with parallax at its widest', () => {
    const always = alwaysVisible();
    const safe = LANDING_CANVAS.safe;
    expect(safe.x).toBeGreaterThanOrEqual(always.x - 1e-9);
    expect(safe.y).toBeGreaterThanOrEqual(always.y - 1e-9);
    expect(safe.x + safe.w).toBeLessThanOrEqual(always.x + always.w + 1e-9);
    expect(safe.y + safe.h).toBeLessThanOrEqual(always.y + always.h + 1e-9);
    // The overscan covers the parallax shift: the image never shows an edge inside the doorway.
    expect(LANDING_CANVAS.overscan).toBeGreaterThanOrEqual(PARALLAX_MAX);
    for (const a of [0.72, 0.85, 1, 1.12]) {
      const door = doorOfAspect(a);
      const pl = landingPlacement(door);
      for (const dx of [0, parallaxOffset(1, 0, door.w, false)]) {
        expect(pl.x + dx).toBeLessThanOrEqual(door.x + 1e-9);
        expect(pl.x + dx + pl.w).toBeGreaterThanOrEqual(door.x + door.w - 1e-9);
      }
    }
  });

  it('every real layout either fits the art or falls back to vectors', () => {
    const sizes: [number, number][] = [[960, 600], [600, 960], [1280, 800], [1080, 810], [810, 1080], [1180, 820], [820, 1180], [1366, 1024], [1024, 1366], [694, 768], [507, 1024], [320, 1024], [504, 820]];
    const fits: boolean[] = [];
    for (const [w, h] of sizes) {
      const l = computeLayout({ width: w, height: h }, { top: 0, right: 0, bottom: 0, left: 0 });
      const g = cabinGeometry(l.cabin, l.bandHeight);
      fits.push(landingArtFits(g.door));
      if (!landingArtFits(g.door)) continue;
      const v = visibleCanvas({ x: g.door.x, y: g.door.y, w: g.door.w, h: g.door.h }, landingPlacement(g.door));
      const safe = LANDING_CANVAS.safe;
      expect(v.x <= safe.x + 1e-6 && v.x + v.w >= safe.x + safe.w - 1e-6 && v.y <= safe.y + 1e-6 && v.y + v.h >= safe.y + safe.h - 1e-6).toBe(true);
    }
    // The iPad 2/3 split view is the one layout whose doorway is too tall for the canvas.
    expect(fits.filter((f) => !f)).toHaveLength(1);
  });

  it('the native overlays (number, sign, object slot) reserve calm zones that sit inside the canvas', () => {
    for (const zone of [NUMBER_ZONE, SIGN_ZONE, OBJECT_SLOT, OBJECT_SLOT_WIDE]) {
      const r = reservedZone(zone);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1);
      expect(r.y + r.h).toBeLessThanOrEqual(1);
      // A zone grows only by the crop variation, never past the safe core's side bands.
      expect(r.w).toBeGreaterThanOrEqual(zone.w * 0.68);
    }
  });

  it('a touch area in canvas coordinates maps into door units the hotspot can use', () => {
    const door: Rect = { x: 100, y: 50, w: 352, h: 415 };
    const pl = landingPlacement(door);
    const hit = toDoorUnits(canvasToScreen(pl, { x: 0.18, y: 0.3, w: 0.22, h: 0.5 }), door);
    expect(hit.x).toBeGreaterThan(0);
    expect(hit.x + hit.w).toBeLessThan(1);
    expect(hit.y + hit.h).toBeLessThan(1);
  });

  it('every painted sign plate stays inside the doorway at every supported shape, tall enough for the name (D150)', () => {
    const plates = ART_MANIFEST.assets.filter((a) => a.kind === 'landing' && a.sign);
    expect(plates.length).toBeGreaterThanOrEqual(7);
    for (const a of plates)
      for (let k = 0; k <= 8; k++) {
        const aspect = LANDING_CANVAS.aspects.min + ((LANDING_CANVAS.aspects.max - LANDING_CANVAS.aspects.min) * k) / 8;
        const box = canvasBoxInDoor(doorOfAspect(aspect), a, a.sign!);
        expect({ id: a.id, aspect, inside: box.x >= 0 && box.y >= 0 && box.x + box.w <= 1 && box.y + box.h <= 1, tall: box.h >= 0.06 }).toEqual({ id: a.id, aspect, inside: true, tall: true });
      }
  });

  it("a moving piece's place in the canvas has its image's shape, so the cover fit never crops or bends it (M8)", () => {
    const pieces = ART_MANIFEST.assets.filter((a) => a.kind === 'landing' && a.layer === 'moving');
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    // The landing canvas is square, so canvas fractions compare directly with the image's pixels.
    for (const a of pieces) expect({ id: a.id, off: Math.abs(a.rect!.w / a.rect!.h / (a.width / a.height) - 1) < 0.01 }).toEqual({ id: a.id, off: true });
  });

  it('parallax settles as the doors open and is off under Reduced Motion', () => {
    expect(parallaxOffset(1, 0, 400, false)).toBeCloseTo(PARALLAX_MAX * 400);
    expect(parallaxOffset(1, 1, 400, false)).toBe(0);
    expect(parallaxOffset(0.5, 0.5, 400, false)).toBeCloseTo(0.25 * PARALLAX_MAX * 400);
    for (const open of [0, 0.3, 1]) expect(parallaxOffset(1, open, 400, true)).toBe(0);
  });

  it('cabin layers cover their regions and the door leaves split the doorway at its middle', () => {
    for (const [w, h] of [[703, 796], [560, 576], [889, 1000], [304, 518]] as const) {
      const g = cabinGeometry({ width: w, height: h }, 60);
      const boxes = cabinArtBoxes(g, { width: w, height: h }, CABIN_CANVAS.backing.doorCenter);
      expect(Object.keys(boxes).sort()).toEqual([...CABIN_LAYERS].sort());
      expect(boxes['door-left'].box.x + boxes['door-left'].box.w).toBeCloseTo(boxes['door-right'].box.x);
      expect(boxes['door-left'].box.w + boxes['door-right'].box.w).toBeCloseTo(g.door.w);
      const backing = cover(boxes.backing.box, CABIN_CANVAS.backing, boxes.backing.focus, boxes.backing.target);
      // It covers the visible back wall: between the side walls, from the ceiling down to the floor (D144).
      const wall = { x: g.sideInset, y: g.ceiling.h, r: w - g.sideInset, b: g.floorY };
      expect(backing.x <= wall.x + 1e-6 && backing.y <= wall.y + 1e-6 && backing.x + backing.w >= wall.r - 1e-6 && backing.y + backing.h >= wall.b - 1e-6).toBe(true);
      // The backing's door centre sits on the real doorway's centre when the crop allows.
      const painted = { x: backing.x + CABIN_CANVAS.backing.doorCenter.x * backing.w, y: backing.y + CABIN_CANVAS.backing.doorCenter.y * backing.h };
      const box = boxes.backing.box;
      const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
      const clamped = near(backing.x, box.x) || near(backing.x + backing.w, box.x + box.w) || near(backing.y, box.y) || near(backing.y + backing.h, box.y + box.h);
      if (!clamped) expect([painted.x, painted.y]).toEqual([expect.closeTo(g.door.x + g.door.w / 2, 3), expect.closeTo(g.door.y + g.door.h / 2, 3)]);
      else expect(Math.abs(painted.x - (g.door.x + g.door.w / 2))).toBeLessThan(w * 0.25);
      for (const layer of CABIN_LAYERS) expect(boxes[layer].box.w).toBeGreaterThan(0);
    }
  });
});

describe('art motion', () => {
  it('moving pieces hold still under Reduced Motion and come back to rest', () => {
    for (const kind of ['spin', 'tilt', 'slide'] as const)
      for (const p of [0, 0.3, 0.5, 0.9, 1]) {
        const still = heroPose({ motion: kind, amount: kind === 'spin' ? 1 : 0.2, base: 1 }, p, true);
        expect([still.rotate, still.dx]).toEqual([0, 0]);
        const end = heroPose({ motion: kind, amount: kind === 'spin' ? 1 : 0.2, base: 1 }, 1, false);
        expect(kind === 'spin' ? (end.rotate / (Math.PI * 2)) % 1 : end.rotate).toBeCloseTo(0);
        expect(end.dx).toBeCloseTo(0);
      }
  });

  it('Lifty: six production poses, mapped from the moods; announcements and silent rides are Quiet (D137)', () => {
    expect([...LIFTY_POSES]).toEqual(['neutral', 'help', 'thinking', 'success', 'concerned', 'quiet']);
    expect(liftyArtPose('neutral', false, true)).toBe('neutral');
    expect(liftyArtPose('helping', false, true)).toBe('help');
    expect(liftyArtPose('thinking', false, true)).toBe('thinking');
    expect(liftyArtPose('satisfied', false, true)).toBe('success');
    expect(liftyArtPose('concerned', false, true)).toBe('concerned');
    expect(liftyArtPose('systemCheck', false, true)).toBe('quiet');
    expect(liftyArtPose('thinking', true, false)).toBe('quiet');
    expect(liftyArtPose('helping', true, true)).toBe('help');
    // Every pose has a vector mood to fall back to, and the round trip holds for the non-quiet poses.
    for (const pose of LIFTY_POSES) expect(liftyArtPose(POSE_MOOD[pose], false, true)).toBe(pose);
  });

  it("Lifty's hover is slow and small, and off under Reduced Motion", () => {
    expect(1000 / LIFTY_HOVER.cycleMs).toBeLessThanOrEqual(0.5);
    for (const size of [48, 96, 140, 400]) {
      expect(hoverAmplitude(size, false)).toBeLessThanOrEqual(3);
      expect(hoverAmplitude(size, false)).toBeGreaterThan(0);
      expect(hoverAmplitude(size, true)).toBe(0);
    }
  });
});

describe('art context boundary', () => {
  it('useArt() is read only outside Skia canvases (context does not reach Skia children)', () => {
    const ui = path.join(__dirname, '../ui');
    const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.tsx$/.test(d.name) && !d.name.endsWith('.test.tsx') ? [path.join(dir, d.name)] : []));
    const callers = files(ui)
      .filter((f) => /useArt\(\)/.test(fs.readFileSync(f, 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')))
      .map((f) => path.relative(ui, f))
      .sort();
    // Each reads it before its canvas and passes it in: the cabin, the directory sheet, the emblem, Lifty.
    expect(callers).toEqual(['CabinScene.tsx', 'Directory.tsx', 'EngineerLog.tsx', 'GameScreen.tsx', 'Lifty.tsx']);
  });
});

describe('Skia canvases on the web', () => {
  it('a Canvas gets one style object, never an array (Skia web writes it onto the DOM element)', () => {
    const ui = path.join(__dirname, '../ui');
    const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.tsx$/.test(d.name) && !d.name.endsWith('.test.tsx') ? [path.join(dir, d.name)] : []));
    const offenders = files(ui).filter((f) => /<Canvas[^>]*style=\{\[/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(ui, f));
    expect(offenders).toEqual([]);
  });
});
