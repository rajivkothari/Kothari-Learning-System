// A fake presentation layer. Proves the contract: two different fictions can render
// the same intents, without reading mastery math, option correctness, or the database.
// Theme words live only in this test file, never in the engine or the runtime.
import type { ActivityView, PresentationIntent } from '../engine';
import { correctOption, fakeClock, finish, open, tempDir, wrongOption } from './testing/harness';

interface Fiction {
  worldEvent(concept: string, value: number | string, correct: boolean): string;
}

const MACHINE: Fiction = {
  worldEvent: (concept, value, correct) =>
    concept === 'positionAfterMove' ? `car moves to floor ${value}${correct ? '' : ', doors stay shut'}` : `machine shows ${value}`,
};

const STORYBOOK: Fiction = {
  worldEvent: (concept, value, correct) => (concept === 'beginningSoundOfWord' ? `rune "${value}" ${correct ? 'glows' : 'flickers softly'}` : `page shows ${value}`),
};

/** Exhaustive over the contract: a new intent type fails to compile here. */
function render(fiction: Fiction, intent: PresentationIntent): string {
  switch (intent.type) {
    case 'MISSION_STARTED':
      return `open mission ${intent.missionId}`;
    case 'SHOW_NARRATIVE':
      return `play scene ${intent.narrative.eventKey}`;
    case 'SHOW_ACTIVITY':
      return `ask ${intent.activity.concept} with ${intent.activity.options.length} choices`;
    case 'RESPONSE_RESULT':
      return intent.correct ? 'cheer' : `gentle cue ${intent.feedbackKey}`;
    case 'WORLD_EVENT':
      return fiction.worldEvent(intent.concept, intent.appliedValue, intent.correct);
    case 'OFFER_SCAFFOLD':
      return `offer help ${intent.scaffold.kind}`;
    case 'SCAFFOLD_SHOWN':
      return `show help ${intent.scaffold.kind}`;
    case 'ITEM_REGENERATED':
      return 'fresh puzzle';
    case 'STEP_COMPLETE':
      return `step ${intent.stepId} done`;
    case 'MISSION_COMPLETE':
      return 'celebrate';
    case 'RESPONSE_REJECTED':
      return `ignore (${intent.reason})`;
    case 'PROGRESSION_UPGRADE':
      return `badge ${intent.upgrade.kind}`;
    case 'GAME_PROGRESS':
      return `progress ${intent.signal.kind}`;
  }
}

const activities = (intents: PresentationIntent[]): ActivityView[] =>
  intents.flatMap((i) => (i.type === 'SHOW_ACTIVITY' ? [i.activity] : []));

async function playWith(fiction: Fiction, missionId: string, learnerId: string) {
  const tmp = tempDir();
  const { db, rt } = await open(tmp.file, fakeClock());
  await rt.createLearner({ id: learnerId, themePack: 'theme.any' });
  const id = `instance-${missionId}`;
  const all: PresentationIntent[] = [...(await rt.startMission({ learnerId, missionId, instanceId: id })).intents];
  const view = await rt.view(id);
  if (view.narrative) all.push(...(await rt.acknowledge(id, { commandId: 'a0' })).intents);
  all.push(...(await rt.submit(id, { commandId: 'a1', optionId: await wrongOption(rt, id, true) })).intents);
  all.push(...(await rt.submit(id, { commandId: 'a2', optionId: await correctOption(rt, id) })).intents);
  all.push(...(await finish(rt, id, 'a')));
  await db.close();
  tmp.cleanup();
  return { intents: all, script: all.map((i) => render(fiction, i)) };
}

describe('presentation contract', () => {
  it('the machine fiction renders the quantity mission from intents alone', async () => {
    const { intents, script } = await playWith(MACHINE, 'positions-and-loads', 'learner-a');
    expect(script).toContain('open mission positions-and-loads');
    expect(script.some((s) => /^car moves to floor -?\d+, doors stay shut$/.test(s))).toBe(true);
    expect(script.some((s) => /^car moves to floor -?\d+$/.test(s))).toBe(true);
    expect(script).toContain('celebrate');
    for (const a of activities(intents)) for (const o of a.options) expect(Object.keys(o).sort()).toEqual(['id', 'value']);
  });

  it('the storybook fiction renders the literacy mission from the same contract', async () => {
    const { intents, script } = await playWith(STORYBOOK, 'first-sounds', 'learner-b');
    expect(script.some((s) => /^rune "[a-z]" flickers softly$/.test(s))).toBe(true);
    expect(script.some((s) => /^rune "[a-z]" glows$/.test(s))).toBe(true);
    expect(script).toContain('celebrate');
    for (const a of activities(intents)) for (const o of a.options) expect(o).not.toHaveProperty('correct');
  });

  it('intents carry no mastery internals the UI could misuse', async () => {
    const { intents } = await playWith(MACHINE, 'positions-and-loads', 'learner-a');
    const text = JSON.stringify(intents);
    for (const internal of ['independence', 'accuracy', 'retention', 'solvedSignatures', 'peakLevel', '"rate"']) expect(text).not.toContain(internal);
  });
});
