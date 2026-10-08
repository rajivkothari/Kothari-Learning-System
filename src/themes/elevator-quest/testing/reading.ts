// Test-only helpers for reading jobs (M8): content with the first reading step pinned to known items,
// and the right or a wrong value of the job on now, found through the runtime's pure check (never
// from the prompt or the screen).
import { FLOOR15 } from '../content/floor15';
import { CONTENT, type Session } from './headless';

type Content = typeof CONTENT;
export type AuthoredItem = { id: string; correct: string | number; distractors: { value: string | number; misconception?: string }[] };

/** Every authored item in the shipped content. */
export const authoredItems = (content: Content = CONTENT): AuthoredItem[] => content.pack.activities.flatMap((a) => (a.params as { items?: AuthoredItem[] }).items ?? []);

/**
 * The shipped content with the mission's first reading step (read-1) pinned to one reading activity,
 * that activity holding only `items` (in order; two or more, so a fresh item can follow a second
 * miss). `swap`: an item whose authored answer trades places with its first wrong answer (to check
 * that nothing on screen depends on which option the content calls right).
 */
export function readingContent(activityId: string, items: readonly string[], swap: string | null = null): Content {
  const all = authoredItems();
  const pick = items.map((id) => {
    const item = all.find((i) => i.id === id);
    if (!item) throw new Error(`no authored item "${id}"`);
    if (id !== swap) return item;
    const [first, ...rest] = item.distractors;
    return { id, correct: first!.value, distractors: [{ value: item.correct }, ...rest] };
  });
  const pack = { ...CONTENT.pack, activities: CONTENT.pack.activities.map((a) => (a.id === activityId ? { ...a, params: { ...a.params, items: pick } } : a)) };
  const missions = CONTENT.missions.map((m) =>
    m.id !== FLOOR15.missionId ? m : { ...m, steps: m.steps.map((s) => (s.kind === 'activity' && s.id === 'read-1' ? { kind: 'activity' as const, id: s.id, activityId, items: s.items } : s)) },
  );
  return { ...CONTENT, pack, missions };
}

export const activityOf = (s: Session) => s.rt.currentView(s.director.instanceId()).view.activity!;

/** The right value of the job on now (a floor, or an option's value). */
export function rightValue(s: Session): string | number {
  const a = activityOf(s);
  const id = s.director.instanceId();
  if (a.answer.mode === 'value') {
    for (let v = a.answer.min; v <= a.answer.max; v++) {
      const c = s.rt.check(id, { mode: 'value', value: v });
      if (c.ok && c.evaluation.correct) return v;
    }
  } else {
    for (const o of a.options) {
      const c = s.rt.check(id, { mode: 'choice', optionId: o.id });
      if (c.ok && c.evaluation.correct) return String(o.value);
    }
  }
  throw new Error('unsolvable');
}

/** A wrong value of the job on now, not the car's floor; `not`: values to skip (a second, different miss). */
export function wrongValue(s: Session, not: readonly (string | number)[] = []): string | number {
  const right = rightValue(s);
  const a = activityOf(s);
  const spec = a.answer;
  const values: (string | number)[] = spec.mode === 'value' ? Array.from({ length: spec.max - spec.min + 1 }, (_, i) => spec.min + i) : a.options.map((o) => String(o.value));
  const v = values.find((x) => x !== right && !not.includes(x) && x !== s.view().elevator.floor);
  if (v === undefined) throw new Error('no wrong value');
  return v;
}

/** The misreading the content tags for a wrong value of the reading job on now (null when none). */
export const misreadingOf = (s: Session, wrong: string | number): string | null => authoredItems().find((i) => i.id === s.view().reading!.item)!.distractors.find((d) => d.value === wrong)?.misconception ?? null;
