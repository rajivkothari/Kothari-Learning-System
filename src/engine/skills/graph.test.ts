import * as fc from 'fast-check';

import { PACK } from '../testing/support';
import { buildSkillGraph } from './graph';
import type { SkillDefinition } from './skill';

const skill = (id: string, prerequisites: string[] = []): SkillDefinition => ({
  id,
  domain: 'math',
  strand: 's',
  label: id,
  prerequisites,
  representations: [],
  tags: [],
});

describe('skill graph validation', () => {
  it('accepts the sample pack and orders prerequisites first', () => {
    const r = buildSkillGraph(PACK.skills);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const index = new Map(r.graph.order.map((id, i) => [id, i]));
    for (const s of PACK.skills) for (const p of s.prerequisites) expect(index.get(p)!).toBeLessThan(index.get(s.id)!);
    expect(r.graph.dependentsOf('math.count.within10')).toEqual(expect.arrayContaining(['math.count.within20', 'math.add.within10']));
  });

  it('spans early childhood to middle school without a grade ceiling', () => {
    const bands = PACK.skills.flatMap((s) => (s.gradeBand ? [s.gradeBand] : []));
    expect(Math.min(...bands.map((b) => b[0]))).toBe(-1);
    expect(Math.max(...bands.map((b) => b[1]))).toBe(8);
  });

  it('reports duplicates, missing and self prerequisites', () => {
    const r = buildSkillGraph([skill('m.a'), skill('m.a'), skill('m.b', ['m.zz']), skill('m.c', ['m.c'])]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.code).sort()).toEqual(['duplicateSkill', 'missingPrerequisite', 'selfPrerequisite']);
    expect(r.issues.find((i) => i.code === 'missingPrerequisite')?.message).toContain('"m.zz"');
  });

  it('reports a cycle with its path', () => {
    const r = buildSkillGraph([skill('m.a', ['m.c']), skill('m.b', ['m.a']), skill('m.c', ['m.b'])]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const cycle = r.issues.find((i) => i.code === 'cycle');
    expect(cycle).toBeDefined();
    expect(cycle?.message).toMatch(/m\.a -> .* -> m\.a|m\.b -> .* -> m\.b|m\.c -> .* -> m\.c/);
  });

  it('property: graphs whose edges only point to earlier skills are accepted', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 15 }).chain((n) => fc.tuple(fc.constant(n), fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1)), { maxLength: 40 }))), ([n, edges]) => {
        const prereqs = Array.from({ length: n }, () => new Set<string>());
        for (const [x, y] of edges) if (x !== y) prereqs[Math.max(x, y)]!.add(`g.s${Math.min(x, y)}`);
        const r = buildSkillGraph(prereqs.map((p, i) => skill(`g.s${i}`, [...p])));
        expect(r.ok).toBe(true);
      }),
    );
  });

  it('property: adding a back edge that closes a cycle is rejected', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 12 }), (n) => {
        // Chain s0 <- s1 <- ... <- s(n-1), then make s0 require s(n-1).
        const skills = Array.from({ length: n }, (_, i) => skill(`g.s${i}`, i === 0 ? [`g.s${n - 1}`] : [`g.s${i - 1}`]));
        const r = buildSkillGraph(skills);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.issues.some((i) => i.code === 'cycle')).toBe(true);
      }),
    );
  });
});
