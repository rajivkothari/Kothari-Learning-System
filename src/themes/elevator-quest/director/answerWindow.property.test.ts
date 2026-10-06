// Property test: random tapping on the real director (real runtime, real SQLite, virtual time).
// Invariant (audit P0): every panel answer comes from exactly one learner press accepted while that
// item's answer window was open, and no window produces two answers.
import * as fc from 'fast-check';

import { openSession, settled, tempDir, virtualTime } from '../testing/headless';

type Act = { kind: 'floor'; floor: number; via: 'panel' | 'shaft' } | { kind: 'open' } | { kind: 'close' } | { kind: 'help' } | { kind: 'wait'; ms: number };

const act: fc.Arbitrary<Act> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ kind: fc.constant('floor' as const), floor: fc.integer({ min: 1, max: 20 }), via: fc.constantFrom('panel' as const, 'shaft' as const) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('open' as const) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('close' as const) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('help' as const) }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('wait' as const), ms: fc.integer({ min: 0, max: 4000 }) }) },
);

describe('answer window under random tapping', () => {
  it('every answer traces back to one in-window press for that item', async () => {
    let run = 0;
    let answered = 0;
    await fc.assert(
      fc.asyncProperty(fc.array(act, { minLength: 10, maxLength: 80 }), async (acts) => {
        const tmp = tempDir();
        try {
          const s = await openSession(tmp.file, virtualTime(), { instanceId: `mash-${run++}` });
          s.director.pressDoorOpen();
          await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
          for (const a of acts) {
            if (a.kind === 'floor') s.director.pressFloor(a.floor, a.via);
            else if (a.kind === 'open') s.director.pressDoorOpen();
            else if (a.kind === 'close') s.director.pressDoorClose();
            else if (a.kind === 'help') s.director.requestHelp();
            await s.time.advance(a.kind === 'wait' ? a.ms : 30);
          }
          await s.time.advance(30_000);

          const entries = s.log.entries();
          const used = new Set<number>();
          entries.forEach((e, i) => {
            if (e.kind !== 'answer' || !('window' in e.data)) return; // cargo answers have no panel window
            const token = e.data.window as number | null;
            expect(token).not.toBeNull();
            expect(used.has(token!)).toBe(false);
            used.add(token!);
            answered++;
            const press = entries.slice(0, i).some((p) => p.kind === 'panel.press' && p.data.window === token && p.data.floor === e.data.value && p.data.accepted === true);
            expect(press).toBe(true);
          });
          // Nothing is waiting to answer anything once the car is left alone.
          if (s.view().stage === 'task') expect(s.view().elevator.lit).toEqual([]);
          s.director.dispose();
        } finally {
          tmp.cleanup();
        }
      }),
      { numRuns: 30 },
    );
    // The property is only meaningful if random tapping really answers jobs.
    expect(answered).toBeGreaterThan(10);
  }, 120_000);
});
