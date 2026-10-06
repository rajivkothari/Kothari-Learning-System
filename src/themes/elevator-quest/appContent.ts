// Content the app ships for Elevator Quest: the theme-neutral core pack and missions, the
// mastery policy, and this theme's unlock catalog. Bundled JSON only; nothing is fetched.
import engineConfig from '../../../content/engine-config.json';
import coreMissions from '../../../content/missions/core.json';
import corePack from '../../../content/packs/core.json';
import { BUILT_IN_GENERATORS, ContentPackSchema, MissionPackSchema, buildSkillGraph, parseEngineConfig } from '../../engine';
import type { RuntimeContent } from '../../runtime/gameRuntime';
import { UNLOCK_RULES } from './content/floor15';

export function loadElevatorQuestContent(): RuntimeContent {
  const pack = ContentPackSchema.parse(corePack);
  const graph = buildSkillGraph(pack.skills);
  if (!graph.ok) throw new Error(`Core pack skill graph is invalid: ${graph.issues.map((i) => i.message).join('; ')}`);
  return {
    pack,
    missions: MissionPackSchema.parse(coreMissions).missions,
    registry: BUILT_IN_GENERATORS,
    graph: graph.graph,
    policy: parseEngineConfig(engineConfig).masteryPolicy,
    missionsVersion: coreMissions.version,
    unlocks: UNLOCK_RULES,
  };
}
