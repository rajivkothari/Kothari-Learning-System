// Content the app ships for Elevator Quest: the theme-neutral packs (core math, then reading,
// composed into one) and missions, the mastery policy, and this theme's unlock catalog. Bundled
// JSON only; nothing is fetched.
import engineConfig from '../../../content/engine-config.json';
import coreMissions from '../../../content/missions/core.json';
import corePack from '../../../content/packs/core.json';
import readingPack from '../../../content/packs/reading.json';
import demoPlacement from '../../../content/placement/demo-start.json';
import { BUILT_IN_GENERATORS, ContentPackSchema, MissionPackSchema, PlacementSchema, buildSkillGraph, composeContentPacks, parseEngineConfig } from '../../engine';
import type { RuntimeContent } from '../../runtime/gameRuntime';
import { UNLOCK_RULES } from './content/floor15';

export function loadElevatorQuestContent(): RuntimeContent {
  const pack = composeContentPacks([ContentPackSchema.parse(corePack), ContentPackSchema.parse(readingPack)]);
  const graph = buildSkillGraph(pack.skills);
  if (!graph.ok) throw new Error(`Content skill graph is invalid: ${graph.issues.map((i) => i.message).join('; ')}`);
  return {
    pack,
    missions: MissionPackSchema.parse(coreMissions).missions,
    registry: BUILT_IN_GENERATORS,
    graph: graph.graph,
    policy: parseEngineConfig(engineConfig).masteryPolicy,
    missionsVersion: coreMissions.version,
    unlocks: UNLOCK_RULES,
    // An explicit assumption, not a claim about the learner: see content/placement/demo-start.json.
    placement: PlacementSchema.parse(demoPlacement),
  };
}
