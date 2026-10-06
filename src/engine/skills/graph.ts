// Skill prerequisite graph. Validates structure and exposes a topological order so
// mastery can be derived prerequisites-first.
import type { SkillDefinition, SkillId } from './skill';

export type GraphIssue =
  | { code: 'duplicateSkill'; skillId: SkillId; message: string }
  | { code: 'missingPrerequisite'; skillId: SkillId; prerequisite: SkillId; message: string }
  | { code: 'selfPrerequisite'; skillId: SkillId; message: string }
  | { code: 'cycle'; cycle: SkillId[]; message: string };

export interface SkillGraph {
  readonly skills: ReadonlyMap<SkillId, SkillDefinition>;
  /** Every skill appears after all of its prerequisites. */
  readonly order: readonly SkillId[];
  prerequisitesOf(id: SkillId): readonly SkillId[];
  /** Skills that list `id` as a direct prerequisite. */
  dependentsOf(id: SkillId): readonly SkillId[];
  has(id: SkillId): boolean;
}

export type GraphResult = { ok: true; graph: SkillGraph } | { ok: false; issues: GraphIssue[] };

export function buildSkillGraph(definitions: readonly SkillDefinition[]): GraphResult {
  const issues: GraphIssue[] = [];
  const skills = new Map<SkillId, SkillDefinition>();

  for (const def of definitions) {
    if (skills.has(def.id)) {
      issues.push({ code: 'duplicateSkill', skillId: def.id, message: `Skill "${def.id}" is defined more than once` });
      continue;
    }
    skills.set(def.id, def);
  }

  for (const def of skills.values()) {
    for (const pre of def.prerequisites) {
      if (pre === def.id) {
        issues.push({ code: 'selfPrerequisite', skillId: def.id, message: `Skill "${def.id}" lists itself as a prerequisite` });
      } else if (!skills.has(pre)) {
        issues.push({
          code: 'missingPrerequisite',
          skillId: def.id,
          prerequisite: pre,
          message: `Skill "${def.id}" requires unknown skill "${pre}"`,
        });
      }
    }
  }

  // Depth-first search for cycles among known, non-self edges.
  const edges = (id: SkillId): SkillId[] =>
    (skills.get(id)?.prerequisites ?? []).filter((p) => p !== id && skills.has(p));
  const state = new Map<SkillId, 'visiting' | 'done'>();
  const order: SkillId[] = [];
  const reported = new Set<string>();

  const visit = (id: SkillId, stack: SkillId[]): void => {
    const s = state.get(id);
    if (s === 'done') return;
    if (s === 'visiting') {
      const cycle = [...stack.slice(stack.indexOf(id)), id];
      const key = [...cycle.slice(0, -1)].sort().join('|');
      if (!reported.has(key)) {
        reported.add(key);
        issues.push({ code: 'cycle', cycle, message: `Prerequisite cycle: ${cycle.join(' -> ')}` });
      }
      return;
    }
    state.set(id, 'visiting');
    for (const pre of edges(id)) visit(pre, [...stack, id]);
    state.set(id, 'done');
    order.push(id);
  };

  for (const id of [...skills.keys()].sort()) visit(id, []);

  if (issues.length > 0) return { ok: false, issues };

  const dependents = new Map<SkillId, SkillId[]>();
  for (const def of skills.values()) {
    for (const pre of def.prerequisites) {
      dependents.set(pre, [...(dependents.get(pre) ?? []), def.id]);
    }
  }

  return {
    ok: true,
    graph: {
      skills,
      order,
      prerequisitesOf: (id) => skills.get(id)?.prerequisites ?? [],
      dependentsOf: (id) => dependents.get(id) ?? [],
      has: (id) => skills.has(id),
    },
  };
}
