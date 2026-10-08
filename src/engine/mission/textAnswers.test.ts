// Text answers through the mission runtime (M9): the word-golf mission on the packs the app ships.
import coreMissions from '../../../content/missions/core.json';
import type { GeneratedItem } from '../content/item';
import { BUILT_IN_GENERATORS } from '../generation/registry';
import { SHIPPED_PACK, T0 } from '../testing/support';
import type { PresentationIntent } from './intents';
import { applyCommand, checkResponse, currentItem, describeMission, startMission, type MissionContext, type MissionState } from './runtime';
import { MissionPackSchema } from './schema';

const CTX: MissionContext = { pack: SHIPPED_PACK, registry: BUILT_IN_GENERATORS, missions: MissionPackSchema.parse(coreMissions).missions };
const of = <T extends PresentationIntent['type']>(intents: PresentationIntent[], type: T) => intents.filter((i): i is Extract<PresentationIntent, { type: T }> => i.type === type);

const begin = (seedBase = 'text-test'): MissionState => startMission(CTX, { instanceId: 'g1', missionId: 'word-golf', missionVersion: 1, learnerId: 'learner-a', seedBase, at: T0 }).state;
const wordOf = (s: MissionState) => (currentItem(CTX, s) as GeneratedItem).response.options.find((o) => o.correct)!.value as string;
const misspelled = (w: string) => `${w.slice(0, -1)}${w.endsWith('z') ? 'y' : 'z'}`;

describe('text answers in a mission', () => {
  it('a hole presents a word to spell: a text answer, no options, and never the word in the prompt', () => {
    const view = describeMission(CTX, begin()).activity!;
    expect(view.answer.mode).toBe('text');
    expect(view.options).toEqual([]);
    expect(view.concept).toBe('spelling');
    expect(Object.keys(view.prompt).sort()).toEqual(['length', 'pattern', 'patternAt', 'syllables', 'tiles', 'wordId']);
    const word = wordOf(begin());
    for (const v of Object.values(view.prompt)) if (typeof v === 'string') expect(v.includes(word)).toBe(false);
  });

  it('compares ignoring case and anything that is not a letter, and agrees with the committed result', () => {
    const s = begin();
    const word = wordOf(s);
    for (const value of [word, word.toUpperCase(), ` ${word} `, [...word].join('-'), misspelled(word)]) {
      const check = checkResponse(CTX, s, { mode: 'value', value });
      const committed = applyCommand(CTX, s, { type: 'submit', commandId: `t-${value}`, value, at: T0 + 2 });
      const result = of(committed.intents, 'RESPONSE_RESULT')[0]!;
      expect(check.ok).toBe(true);
      if (check.ok) expect(result.correct).toBe(check.evaluation.correct);
      expect(result.correct).toBe(value !== misspelled(word));
    }
    const right = applyCommand(CTX, s, { type: 'submit', commandId: 'right', value: word.toUpperCase(), at: T0 + 2 });
    expect(of(right.intents, 'RESPONSE_RESULT')[0]).toMatchObject({ correct: true, value: word });
    expect(right.events.find((e) => e.type === 'attempt')).toMatchObject({ attempt: { outcome: 'correct', assistance: 'independent', skillIds: [expect.stringMatching(/^ela\.spelling\./)] } });
  });

  it('refuses a number, an empty or letterless answer, a choice, or one longer than asked for, without counting a try', () => {
    const s = begin();
    for (const [cmd, reason] of [
      [{ value: 7 }, 'invalidResponse'],
      [{ value: '' }, 'outOfRange'],
      [{ value: ' 42 ' }, 'outOfRange'],
      [{ value: 'abcdefghijklmnopqrstuvwxyz' }, 'outOfRange'],
      [{ value: 'a'.repeat(80) }, 'outOfRange'],
      [{ optionId: 'a' }, 'invalidResponse'],
    ] as const) {
      const r = applyCommand(CTX, s, { type: 'submit', commandId: `bad-${JSON.stringify(cmd)}`, at: T0 + 2, ...cmd } as never);
      expect(r.intents).toEqual([{ type: 'RESPONSE_REJECTED', reason }]);
      expect(r.state.item!.wrongTries).toBe(0);
      expect(r.events).toEqual([]);
    }
  });

  it('a known misspelling carries its cause', () => {
    const s = begin();
    const item = currentItem(CTX, s) as GeneratedItem;
    const tagged = item.diagnostics[0]!;
    const r = applyCommand(CTX, s, { type: 'submit', commandId: 'm', value: String(tagged.value).toUpperCase(), at: T0 + 2 });
    expect(of(r.intents, 'RESPONSE_RESULT')[0]).toMatchObject({ correct: false, value: tagged.value, misconception: tagged.misconception, retryAllowed: true });
  });

  it('the help ladder: a sound hint (clue), a part of the word (guided), then SHOW ME (the word, demonstrated); a right answer after it is never independent', () => {
    let s = begin('ladder');
    const word = wordOf(s);
    let n = 0;
    const miss = () => (s = applyCommand(CTX, s, { type: 'submit', commandId: `x${n++}`, value: misspelled(word), at: T0 + 2 + n }).state);
    const take = (expectKind: string) => {
      const offer = describeMission(CTX, s).activity!.scaffolds.available[0]!;
      expect(offer.kind).toBe(expectKind);
      const r = applyCommand(CTX, s, { type: 'useScaffold', commandId: `h${n++}`, scaffoldStepId: offer.stepId, at: T0 + 2 + n });
      s = r.state;
      return of(r.intents, 'SCAFFOLD_SHOWN')[0]!;
    };
    // The sound hint can be asked for before any miss.
    expect(describeMission(CTX, s).activity!.scaffolds.available).toEqual([{ stepId: 'sound-hint', kind: 'phonicsHint', assistance: 'clue', mode: 'available' }]);
    expect(take('phonicsHint').revealedValue).toBeNull();
    miss();
    miss();
    expect(take('revealPattern')).toMatchObject({ scaffold: { stepId: 'show-part', assistance: 'guided' }, revealedValue: null });
    expect(describeMission(CTX, s).activity!.scaffolds.available).toEqual([]); // SHOW ME waits for the third miss
    miss();
    const shown = take('showAnswer');
    expect(shown).toMatchObject({ scaffold: { stepId: 'show-word', assistance: 'demonstrated' }, revealedValue: word });
    const done = applyCommand(CTX, s, { type: 'submit', commandId: 'solve', value: word, at: T0 + 50 });
    expect(done.events.find((e) => e.type === 'attempt')).toMatchObject({ attempt: { outcome: 'correct', assistance: 'demonstrated', wrongTries: 3 } });
  });

  it('a fourth miss resolves the word as missed and brings a different word', () => {
    let s = begin('fresh');
    const word = wordOf(s);
    const sig = s.item!.signature;
    let r = applyCommand(CTX, s, { type: 'submit', commandId: 'a', value: misspelled(word), at: T0 + 2 });
    for (let i = 0; i < 3; i++) r = applyCommand(CTX, (s = r.state), { type: 'submit', commandId: `b${i}`, value: misspelled(word), at: T0 + 3 + i });
    expect(of(r.intents, 'ITEM_REGENERATED')).toHaveLength(1);
    expect(r.events.find((e) => e.type === 'attempt')).toMatchObject({ attempt: { outcome: 'incorrect', wrongTries: 3 } });
    expect(r.state.item!.signature).not.toBe(sig);
    expect(wordOf(r.state)).not.toBe(word);
  });

  it('three right words finish the mission: one completion record, nothing else asked', () => {
    let s = begin('finish');
    const kinds = new Set<string>();
    for (let i = 0; i < 3; i++) {
      kinds.add(describeMission(CTX, s).activity!.activityId);
      const r = applyCommand(CTX, s, { type: 'submit', commandId: `w${i}`, value: wordOf(s), at: T0 + 10 + i });
      s = r.state;
      if (i === 2) expect(r.events.filter((e) => e.type === 'completion').map((e) => (e.type === 'completion' ? e.completion.kind : null))).toEqual(['activity', 'mission']);
    }
    expect(s.status).toBe('completed');
    expect(kinds.size).toBe(3);
  });
});
