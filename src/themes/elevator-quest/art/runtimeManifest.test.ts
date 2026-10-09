/// <reference types="node" />
// The runtime art manifest (art/runtime.json) is what production bundles carry instead of manifest.json
// and rights.json (M9.1). It must be exactly what the full files say once validated: every entry as the
// schema parses it, and each rights record's approval and review flag. Stale or hand-edited, this fails.
import manifestJson from '../../../../content/themes/elevator-quest/art/manifest.json';
import rightsJson from '../../../../content/themes/elevator-quest/art/rights.json';
import runtimeJson from '../../../../content/themes/elevator-quest/art/runtime.json';
import { ART_CONTEXT } from './catalog';
import { productionArt, validateArt } from './manifest';
import { PRODUCTION_ART, RUNTIME_ART } from './production';
import { ART_SOURCES } from './sources';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the generator is a plain Node script
const generator = require('../../../../scripts/generate-runtime-manifests.js') as { artRuntime(m: unknown, r: unknown): unknown; generate(o: { check: boolean }): string[] };
const hint = 'run: node scripts/generate-runtime-manifests.js';

describe('runtime art manifest', () => {
  const checked = validateArt(manifestJson, rightsJson, ART_CONTEXT);

  it('is up to date with manifest.json and rights.json', () => {
    expect({ stale: generator.generate({ check: true }), hint }).toEqual({ stale: [], hint });
    expect(runtimeJson).toEqual(generator.artRuntime(manifestJson, rightsJson));
  });

  it('holds every entry exactly as the schema parses it, and every approval', () => {
    expect(checked.issues).toEqual([]);
    expect(RUNTIME_ART.manifest.assets).toEqual(checked.manifest!.assets);
    expect(RUNTIME_ART.rights.assets).toEqual(checked.rights!.assets.map((r) => ({ asset: r.asset, approval: r.approval, humanReviewed: r.humanReviewed })));
  });

  it('gives production exactly the art the full manifest and rights would', () => {
    const full = productionArt(checked.manifest!, checked.rights!, ART_SOURCES);
    expect(PRODUCTION_ART.entries).toEqual(full.entries);
    for (const a of checked.manifest!.assets) expect({ id: a.id, source: PRODUCTION_ART.source(a.id) }).toEqual({ id: a.id, source: full.source(a.id) });
  });

  it('carries no rights text: no source, tool, date, licence terms, modifications or approver', () => {
    for (const r of RUNTIME_ART.rights.assets) expect(Object.keys(r).sort()).toEqual(['approval', 'asset', 'humanReviewed']);
    expect(Object.keys(runtimeJson).sort()).toEqual(['manifest', 'note', 'rights']);
  });
});
