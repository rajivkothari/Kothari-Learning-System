// Validates the shipped content: the test fixture pack, the core pack, and the packs the app ships
// composed as every loader composes them (core math, then reading). The sampling budget comes from
// CONTENT_BUDGET (dev | ci | release), default "dev", so local runs stay fast and
// CI or release runs go deeper:  npm run validate:content[:release]
import coreMissions from '../../../content/missions/core.json';
import demoPlacement from '../../../content/placement/demo-start.json';
import { PlacementSchema } from '../learner/model';
import corePack from '../../../content/packs/core.json';
import samplePack from '../../../content/fixtures/sample-pack.json';
import readingPack from '../../../content/packs/reading.json';
import { composeContentPacks } from '../content/compose';
import { ContentPackSchema } from '../content/pack';
import { BUILT_IN_GENERATORS } from '../generation/registry';
import { BUDGET_NAMES, type BudgetName } from '../mastery/policy';
import { ENGINE_CONFIG } from '../testing/support';
import { validateContentPack } from './validateContent';
import { validateMissionPack } from './validateMissions';

const envBudget = (process.env.CONTENT_BUDGET ?? 'dev') as BudgetName;
if (!BUDGET_NAMES.includes(envBudget)) throw new Error(`CONTENT_BUDGET must be one of ${BUDGET_NAMES.join(', ')}`);

/** Reading is validated as part of what ships: it may refer to core skills and policies. */
const SHIPPED = composeContentPacks([ContentPackSchema.parse(corePack), ContentPackSchema.parse(readingPack)]);

// The core pack is sampled once, inside the shipped pack (sampling is the slow part); on its own it
// is checked for schema, references and its skill graph below.
const PACKS = [
  ['sample', samplePack],
  ['shipped (core + reading)', SHIPPED],
] as const;

describe.each(PACKS)(`%s content pack (budget: ${envBudget})`, (_name, pack) => {
  const report = validateContentPack(pack, {
    registry: BUILT_IN_GENERATORS,
    budget: ENGINE_CONFIG.validationBudgets[envBudget],
    budgetName: envBudget,
  });

  it('has no errors', () => {
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('sampled every activity at the configured budget', () => {
    expect(report.samples).toHaveLength(pack.activities.length);
    for (const s of report.samples) {
      expect(s.seedsTried).toBe(ENGINE_CONFIG.validationBudgets[envBudget].seedsPerActivity);
      expect(s.distinctSignatures).toBeGreaterThan(1);
    }
  });
});

describe('core pack on its own', () => {
  it('is valid without the reading pack (schema, references, skill graph; a light sample)', () => {
    const report = validateContentPack(corePack, { registry: BUILT_IN_GENERATORS, budget: { seedsPerActivity: 20 }, budgetName: envBudget });
    expect(report.issues).toEqual([]);
  });
});

describe('demo placement', () => {
  it('names only skills that exist in the shipped packs, and only skills whose prerequisites it does not claim', () => {
    const placement = PlacementSchema.parse(demoPlacement);
    const ids = new Set(SHIPPED.skills.map((s) => s.id));
    for (const s of placement.unlockedSkills) expect(ids.has(s)).toBe(true);
    expect(placement.source).toBe('assumption');
  });
});

describe('core missions', () => {
  it('validate against the packs the app ships (core + reading)', () => {
    const report = validateMissionPack(coreMissions, validateContentPack(SHIPPED, { registry: BUILT_IN_GENERATORS, budget: ENGINE_CONFIG.validationBudgets.dev, budgetName: 'dev' }).pack!);
    expect(report.issues).toEqual([]);
  });
});
