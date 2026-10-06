/// <reference types="node" />
// The theme boundary. Elevator Quest translates learning intents into a world; it never
// scores, never computes mastery, and never shows internal labels.
import fs from 'node:fs';
import path from 'node:path';

import { openNodeDatabase } from '../../persistence/testing/nodeDatabase';
import { openGameRuntime } from '../../runtime/gameRuntime';
import { FLOOR15, LINES, PROGRESS, misconceptionLine } from './content/floor15';
import { CONTENT, LEARNER, answerCorrectly, openSession, settled, tempDir, virtualTime } from './testing/headless';

const THEME = __dirname;
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []));

describe('Elevator Quest theme boundary', () => {
  it('theme code never scores or models learning itself', () => {
    const banned = /\b(evaluateResponse|checkResponse|createLearnerModel|deriveLearnerState|createProcessor|computeLevel|classifyWithView|applyCommand)\b/;
    const offenders = files(THEME)
      .filter((f) => !f.includes(`${path.sep}testing${path.sep}`))
      .filter((f) => banned.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(THEME, f));
    expect(offenders).toEqual([]);
  });

  it('child-facing copy never shows internal categories or tags', () => {
    const move = { start: 8, change: 7, direction: 'up' as const };
    const texts = [
      ...Object.values(LINES).flatMap((v) => (typeof v === 'string' ? [v] : typeof v === 'function' ? [String((v as (...a: unknown[]) => unknown)(move, 0, 'start'))] : Object.values(v))),
      ...PROGRESS.map((p) => p.label),
      ...['quantity.countedStartingPosition', 'quantity.countedOneExtra', 'quantity.reversedDirection', 'quantity.answeredWithChange'].map((t) => misconceptionLine(t, move, null) ?? ''),
    ];
    for (const t of texts) expect(t).not.toMatch(/stretch|mastery|encounter|practice|misconception|quantity\.|question \d|wrong!|oops|superstar/i);
  });

  it('the learning record is identical with or without the theme', async () => {
    // Theme-free: drive the runtime directly with the same instance and right answers.
    const plain = tempDir();
    const time = virtualTime();
    const db = openNodeDatabase(plain.file);
    const rt = await openGameRuntime(db, CONTENT, time);
    await rt.createLearner({ id: LEARNER, themePack: 'none' });
    await rt.startMission({ learnerId: LEARNER, missionId: FLOOR15.missionId, instanceId: 'same' });
    await rt.activate('same');
    for (let n = 0; n < 40; n++) {
      const { view, revision } = rt.currentView('same');
      if (view.status === 'completed') break;
      if (view.narrative) {
        await rt.acknowledge('same', { commandId: `p${n}`, basedOn: revision });
        continue;
      }
      const a = view.activity!.answer as { min: number; max: number };
      let right = a.min;
      for (let v = a.min; v <= a.max; v++) {
        const c = rt.check('same', { mode: 'value', value: v });
        if (c.ok && c.evaluation.correct) right = v;
      }
      await rt.submit('same', { commandId: `p${n}`, value: right, basedOn: revision });
    }
    const plainAttempts = (await db.all<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq")).map((r) => JSON.parse(r.payload));
    await db.close();
    plain.cleanup();

    // Themed: the same mission instance through the elevator.
    const themed = tempDir();
    const s = await openSession(themed.file, virtualTime(), { instanceId: 'same' });
    s.director.pressDoorOpen();
    await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    s.director.pressFloor(FLOOR15.repairFloor);
    await s.time.runUntil(() => s.view().overlay !== null);
    const themedAttempts = (await s.db.all<{ payload: string }>("SELECT payload FROM learning_events WHERE type = 'attempt' ORDER BY seq")).map((r) => JSON.parse(r.payload));
    s.director.dispose();
    await s.db.close();
    themed.cleanup();

    const essence = (a: Record<string, unknown>) => ({ id: a.id, itemSignature: a.itemSignature, skillIds: a.skillIds, challenge: a.challenge, outcome: a.outcome, assistance: a.assistance, wrongTries: a.wrongTries, transfer: a.transfer });
    expect(themedAttempts.map(essence)).toEqual(plainAttempts.map(essence));
  });
});
