// Validates the shipped sample content pack. The sampling budget comes from
// CONTENT_BUDGET (dev | ci | release), default "dev", so local runs stay fast and
// CI or release runs go deeper:  npm run validate:content[:release]
import samplePack from '../../../content/fixtures/sample-pack.json';
import { BUILT_IN_GENERATORS } from '../generation/registry';
import { BUDGET_NAMES, type BudgetName } from '../mastery/policy';
import { ENGINE_CONFIG } from '../testing/support';
import { validateContentPack } from './validateContent';

const envBudget = (process.env.CONTENT_BUDGET ?? 'dev') as BudgetName;
if (!BUDGET_NAMES.includes(envBudget)) throw new Error(`CONTENT_BUDGET must be one of ${BUDGET_NAMES.join(', ')}`);

describe(`sample content pack (budget: ${envBudget})`, () => {
  const report = validateContentPack(samplePack, {
    registry: BUILT_IN_GENERATORS,
    budget: ENGINE_CONFIG.validationBudgets[envBudget],
    budgetName: envBudget,
  });

  it('has no errors', () => {
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('sampled every activity at the configured budget', () => {
    expect(report.samples).toHaveLength(samplePack.activities.length);
    for (const s of report.samples) {
      expect(s.seedsTried).toBe(ENGINE_CONFIG.validationBudgets[envBudget].seedsPerActivity);
      expect(s.distinctSignatures).toBeGreaterThan(1);
    }
  });
});
