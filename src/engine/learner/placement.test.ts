// A starting-capability assumption lets a skill be played. It never claims its prerequisites.
import corePack from '../../../content/packs/core.json';
import demoPlacement from '../../../content/placement/demo-start.json';
import { ContentPackSchema } from '../content/pack';
import { deriveLearnerState } from '../progression/processor';
import { HOUR, POLICY, T0, attemptFactory, graphOf, successes } from '../testing/support';
import { PlacementSchema } from './model';

const pack = ContentPackSchema.parse(corePack);
const graph = graphOf(pack.skills);
const placement = PlacementSchema.parse(demoPlacement);
const make = attemptFactory({ skillIds: ['math.add.within20'], learnerId: 'learner-a' });
const evidence = successes(make, 6, T0, HOUR, { representation: 'numeral' });

describe('placement (starting-capability assumption)', () => {
  it('without it, a skill with unmet prerequisites stays locked whatever the evidence', () => {
    const s = deriveLearnerState({ graph, policy: POLICY, attempts: evidence });
    expect(s.skills['math.add.within20']!.level).toBe('locked');
  });

  it('with it, the placed skill progresses on its own evidence', () => {
    const s = deriveLearnerState({ graph, policy: POLICY, attempts: evidence, placement });
    expect(s.skills['math.add.within20']!.unlocked).toBe(true);
    expect(['practicing', 'proficient']).toContain(s.skills['math.add.within20']!.level);
  });

  it('never raises or unlocks the prerequisites it skipped', () => {
    const without = deriveLearnerState({ graph, policy: POLICY, attempts: [] });
    const withIt = deriveLearnerState({ graph, policy: POLICY, attempts: evidence, placement });
    for (const pre of ['math.count.within10', 'math.count.within20', 'math.add.within10', 'math.sub.within10']) {
      expect(withIt.skills[pre]!.peakLevel).toBe(without.skills[pre]!.peakLevel);
      expect(withIt.skills[pre]!.dimensions.accuracy.scored).toBe(0);
    }
  });
});
