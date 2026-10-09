import config from '../../../content/engine-config.json';
import raw from '../../../content/themes/magical-kingdom/learning.json';
import { BUILT_IN_GENERATORS, ContentPackSchema, MissionPackSchema, PlacementSchema, buildSkillGraph, parseEngineConfig } from '../../engine';
import type { RuntimeContent } from '../../runtime/gameRuntime';
import { validateMissionCopy, type CopyContract } from '../content/missionCopy';
import { WORDS as W } from './copy';

export const THEME = 'magical-kingdom';
export type Adventure = 'ice' | 'garden';
export const MISSIONS = { ice: ['crystal-bridge', 'crystal-bridge-varied'], garden: ['flower-letter'] } as const;

export function loadKingdomContent(): RuntimeContent {
  const pack = ContentPackSchema.parse(raw.pack);
  const missions = MissionPackSchema.parse(raw.missions).missions;
  const graph = buildSkillGraph(pack.skills);
  if (!graph.ok) throw new Error('Kingdom skill graph is invalid');
  // All mission-facing activity copy uses the existing KLS copy validator.
  const contract: CopyContract = { lines: { intro: [], retry: [], success: [], clue: [], guided: [], shown: [] }, praise: [], misconceptionVars: [], helpVars: [], helpJobs: [], rescueLines: {}, rescueFocusVars: [], replayLines: {}, replaySuggested: [] };
  for (const mission of missions) {
    const ice = mission.id.startsWith('crystal-bridge');
    const result = validateMissionCopy({ schemaVersion: 1, id: `${mission.id}.copy`, theme: THEME, missionId: mission.id, title: ice ? W.ice : W.garden, objective: ice ? W.iceIntro : W.gardenIntro,
      progress: mission.steps.map((s) => ({ stepId: s.id, label: s.kind === 'activity' ? (ice ? W.iceIntro : W.gardenIntro) : (ice ? W.iceSuccess : W.gardenSuccess) })),
      lines: { intro: ice ? W.iceIntro : W.gardenIntro, retry: ice ? W.iceRetry : W.gardenRetry, success: ice ? W.iceSuccess : W.gardenSuccess, clue: ice ? W.iceClue : W.gardenClue, guided: ice ? W.iceGuided : W.gardenGuided, shown: ice ? W.iceShown : W.gardenShown },
      praise: {}, misconceptions: {}, help: {
        highlightGiven: { label: W.help, line: ice ? W.iceClue : W.gardenClue },
        guidedSteps: { label: W.help, line: ice ? W.iceGuided : W.gardenGuided },
        showAnswer: { label: W.help, line: ice ? W.iceShown : W.gardenShown },
      }, rescue: { lines: {}, focus: {} }, pacing: { autoRideTimeScale: 1, successPauseMs: 0, successPauseReducedMs: 0 },
    }, { pack, mission, contract });
    if (!result.ok) throw new Error(`Kingdom copy: ${result.issues.map((i) => i.message).join('; ')}`);
  }
  return { pack, missions, registry: BUILT_IN_GENERATORS, graph: graph.graph, policy: parseEngineConfig(config).masteryPolicy, missionsVersion: raw.missions.version,
    placement: PlacementSchema.parse({ schemaVersion: 1, id: 'kingdom-k-start', source: 'assumption', unlockedSkills: ['literacy.sound.beginning'] }) };
}
