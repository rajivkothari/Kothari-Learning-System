/// <reference types="node" />
// The future world catalog validates, stays non-playable except Elevator Quest, carries no
// difficulty, and contains no protected franchise names.
import fs from 'node:fs';
import path from 'node:path';

import coreMissions from '../../../content/missions/core.json';
import corePack from '../../../content/packs/core.json';
import catalog from '../../../content/worlds/catalog.json';
import { ContentPackSchema, MissionPackSchema } from '../../engine';
import { PALETTES } from '../../presentation/design/tokens';
import { protectedNames } from '../content/ipGuard';
import { WorldSchema, validateWorldCatalog } from './worldCatalog';

const ctx = { pack: ContentPackSchema.parse(corePack), missions: MissionPackSchema.parse(coreMissions).missions, palettes: Object.keys(PALETTES) };
const codes = (raw: unknown) => validateWorldCatalog(raw, ctx).issues.map((i) => i.code);
const edit = (f: (c: typeof catalog) => void) => {
  const c = structuredClone(catalog);
  f(c);
  return c;
};
const world = (c: typeof catalog, id: string) => c.worlds.find((w) => w.id === id)! as (typeof catalog.worlds)[number] & Record<string, unknown>;

describe('world catalog', () => {
  it('validates', () => {
    expect(validateWorldCatalog(catalog, ctx).issues).toEqual([]);
  });

  it('only Elevator Quest is playable; the rest are architecture examples', () => {
    expect(catalog.worlds.filter((w) => w.status === 'playable').map((w) => w.id)).toEqual(['elevator-quest']);
    expect(catalog.worlds.length).toBeGreaterThanOrEqual(12);
    expect(codes(edit((c) => (world(c, 'builder-bay').status = 'playable')))).toEqual(expect.arrayContaining(['catalog.playableNeedsPack', 'catalog.playableNeedsMission', 'catalog.interactionNotBuilt']));
    expect(codes(edit((c) => (world(c, 'builder-bay').missions = ['positions-and-capacity'])))).toContain('catalog.conceptIsPlayable');
  });

  it('has no difficulty: the world sets the fantasy, the learner profile sets the challenge', () => {
    for (const key of ['difficulty', 'challenge', 'level', 'gradeLevel', 'ageRange']) {
      expect(WorldSchema.safeParse({ ...catalog.worlds[0], [key]: 'easy' }).success).toBe(false);
    }
  });

  it('rejects broken references and duplicates', () => {
    expect(codes(edit((c) => c.worlds.push(structuredClone(c.worlds[1]!))))).toContain('catalog.duplicateId');
    expect(codes(edit((c) => (world(c, 'builder-bay').portal.fromWorlds as string[]).push('nowhere')))).toContain('ref.unknownWorld');
    expect(codes(edit((c) => (world(c, 'builder-bay').portal.fromWorlds as string[]).push('builder-bay')))).toContain('catalog.selfPortal');
    expect(codes(edit((c) => (world(c, 'builder-bay').unlockRequirements = [{ kind: 'missionCompleted', missionId: 'no-such-mission' }])))).toContain('ref.unknownMission');
    expect(codes(edit((c) => (world(c, 'builder-bay').art.paletteId = 'no-palette' as never)))).toContain('ref.unknownPalette');
    expect(codes(edit((c) => (world(c, 'elevator-quest').curriculumAffinities = ['math.calculus'])))).toContain('ref.unknownSkillPrefix');
  });

  it('describes learners by archetype and interest only', () => {
    expect(codes(edit((c) => (world(c, 'magic-tower').association = { kind: 'primary', archetype: 'some-child' } as never)))[0]).toMatch(/^schema\./);
  });

  it('the name check catches franchise names, a capital Link, and lets ordinary words through', () => {
    expect(protectedNames('An original platformer, not Mario or Nintendo')).toEqual(['mario', 'nintendo']);
    expect(protectedNames('Block world, nothing like Minecraft by Mojang')).toEqual(['minecraft', 'mojang']);
    expect(protectedNames('Sky temple with a Triforce and a Hylian shield, Zelda style')).toEqual(['triforce', 'hylian', 'zelda']);
    expect(protectedNames('Link stands on the bridge')).toEqual(['link']);
    expect(protectedNames('a chain link fence, linked parts, the link cable')).toEqual([]);
    expect(protectedNames('floating ruins, turbines, banners, cubic terrain, a golf flag')).toEqual([]);
  });

  it('contains no protected franchise names in content', () => {
    // Franchise and brand names (content/ipGuard.ts). Content (catalog, theme copy, packs, art manifests) must stay generic.
    const root = path.join(__dirname, '../../../content');
    const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : d.name.endsWith('.json') ? [path.join(dir, d.name)] : []));
    const hits = files(root).filter((f) => protectedNames(fs.readFileSync(f, 'utf8')).length > 0);
    expect(hits.map((f) => path.relative(root, f))).toEqual([]);
  });
});
