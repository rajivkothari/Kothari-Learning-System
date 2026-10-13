// Tower Rescue's game feel as data (D193): every sound is an approved slot the production profile
// plays; no slot repeats inside its own gap (a dropped sound); no more than two sounds start together;
// Reduced Motion is shorter and plays fewer sounds; the beats run in order and end the test run.
import { PRODUCTION_PROFILE } from '../../audio/packs';
import { SLOT_SPECS, SOUND_SLOTS, type SoundSlot } from '../../audio/profile';
import { AMBIENT, CHOOSE, INSTALL, RESULT, TEST_RUN, TOWER_RESCUE_SOUNDS, chooseSounds, fillTicks, installHoldMs, reached, rightSounds, testSounds, wrongSounds, type SoundBeat } from './feel';

const oneShots = (beats: SoundBeat[]) => beats.filter((b) => b.loop === undefined);
const runSounds = (reduced: boolean) => TEST_RUN[reduced ? 'reduced' : 'normal'].flatMap((b) => b.sounds);

/** Same slot again inside its gap would be dropped by the audio engine: never schedule that. */
function respectsGaps(beats: SoundBeat[]) {
  const last = new Map<string, number>();
  for (const b of oneShots(beats).sort((a, c) => a.at - c.at)) {
    const prev = last.get(b.slot);
    if (prev !== undefined) expect(b.at - prev).toBeGreaterThanOrEqual(SLOT_SPECS[b.slot as SoundSlot].gapMs);
    last.set(b.slot, b.at);
  }
}
/** Layered, not piled: at most two one-shots start within any 100 ms. */
function noPileUps(beats: SoundBeat[]) {
  const at = oneShots(beats).map((b) => b.at).sort((a, b) => a - b);
  for (let i = 0; i + 2 < at.length; i++) expect(at[i + 2]! - at[i]!).toBeGreaterThanOrEqual(100);
}

describe('Tower Rescue feel (D193)', () => {
  it('plays only approved, mapped slots, and preloads every one it plays', () => {
    const played = new Set([...rightSounds(5, false), ...rightSounds(5, true), ...wrongSounds(false), ...wrongSounds(true), ...runSounds(false), ...runSounds(true)].map((b) => b.slot));
    for (const slot of [...played, ...TOWER_RESCUE_SOUNDS]) {
      expect((SOUND_SLOTS as readonly string[]).includes(slot)).toBe(true);
      expect({ slot, mapped: PRODUCTION_PROFILE.slots[slot as SoundSlot] !== null }).toEqual({ slot, mapped: true });
    }
    for (const slot of played) expect(TOWER_RESCUE_SOUNDS).toContain(slot);
  });

  it('install: anticipation, travel, impact; the answer sounds on the seat, never before', () => {
    const hold = installHoldMs(false);
    expect(hold).toBe(INSTALL.normal.lift + INSTALL.normal.fly + INSTALL.normal.seat);
    expect(hold).toBeLessThanOrEqual(450); // the cell is home before the hand is back
    for (const beats of [rightSounds(5, false), wrongSounds(false)]) {
      expect(beats[0]).toEqual({ at: 0, slot: 'cratePick' });
      expect(beats.find((b) => b.slot === 'cratePlace')!.at).toBe(hold);
      for (const b of beats.filter((x) => x.slot === 'answerRight' || x.slot === 'answerWrong')) expect(b.at).toBeGreaterThan(hold);
      respectsGaps(beats);
      noPileUps(beats);
    }
    // The meter ticks: one per step up to five, evenly spread, inside the fill.
    expect(fillTicks(3, 480)).toEqual([160, 320, 480]);
    expect(fillTicks(12, 480)).toHaveLength(5);
    expect(fillTicks(12, RESULT.normal.fillMs).length).toBeLessThanOrEqual(Math.floor(RESULT.normal.fillMs / 96));
    expect(fillTicks(0, 480)).toEqual([]);
    // RUN TEST waits for the meter: it never pops in before the fill is done.
    expect(RESULT.normal.runTestAt).toBeGreaterThanOrEqual(160 + RESULT.normal.fillMs);
  });

  it('the test run: in order, sounds spaced, the payoff inside four seconds; Reduced Motion shorter and quieter', () => {
    for (const reduced of [false, true]) {
      const beats = TEST_RUN[reduced ? 'reduced' : 'normal'];
      expect(beats.map((b) => b.at)).toEqual([...beats.map((b) => b.at)].sort((a, b) => a - b));
      expect(beats[0]!.step).toBe('press');
      expect(beats.at(-1)!.step).toBe('end');
      respectsGaps(runSounds(reduced));
      noPileUps(runSounds(reduced));
      // A loop that starts also stops.
      const loops = runSounds(reduced).filter((b) => b.loop !== undefined);
      expect(loops.filter((b) => b.loop).length).toBe(loops.filter((b) => !b.loop).length);
    }
    expect(TEST_RUN.normal.at(-1)!.at).toBeLessThanOrEqual(4000);
    expect(TEST_RUN.reduced.at(-1)!.at).toBeLessThan(TEST_RUN.normal.at(-1)!.at / 2);
    expect(oneShots(runSounds(true)).length).toBeLessThan(oneShots(runSounds(false)).length);
    expect(installHoldMs(true)).toBeLessThan(installHoldMs(false));
    expect(rightSounds(5, true).some((b) => b.slot === 'cratePick')).toBe(false);
  });

  it('the levels (D196): a fans test spins the fans up instead of riding a car; every other payoff plays the lift run', () => {
    for (const reduced of [false, true]) {
      const beats = TEST_RUN[reduced ? 'reduced' : 'normal'];
      const fans = beats.flatMap((b) => testSounds('fans', b));
      // Where the lift run starts its motor, the fans spin up.
      expect(fans.some((s) => s.slot === 'fanStart')).toBe(beats.some((b) => b.sounds.some((s) => s.slot === 'motorStart')));
      for (const gone of ['motorStart', 'travelLoop', 'arrivalStop', 'arrivalChime', 'doorOpened']) expect(fans.some((s) => s.slot === gone)).toBe(false);
      for (const s of fans) expect(TOWER_RESCUE_SOUNDS).toContain(s.slot);
      respectsGaps(fans);
      noPileUps(fans);
      for (const payoff of ['lift', 'route', 'chief'] as const) expect(beats.flatMap((b) => testSounds(payoff, b))).toEqual(beats.flatMap((b) => b.sounds));
    }
    // A pick at a dial, a floor or a report answers at once; a wrong one is one soft sound, never a buzzer run.
    expect(chooseSounds(true)[0]).toEqual({ at: 0, slot: 'answerRight' });
    expect(chooseSounds(false)).toEqual([{ at: 0, slot: 'answerWrong' }]);
    expect(CHOOSE.reduced.stepDoneMs).toBeLessThan(CHOOSE.normal.stepDoneMs);
    // The fans' test turn stays under three blade passes a second (three blades).
    expect(3 / (AMBIENT.fanTestMs / 1000)).toBeLessThan(3);
    expect(AMBIENT.fanTestMs).toBeLessThan(AMBIENT.fanMs);
  });

  it('reached(): a later step counts as reaching an earlier one (Reduced Motion skips steps)', () => {
    expect(reached(null, 'press')).toBe(false);
    expect(reached('relay3', 'relay1')).toBe(true);
    expect(reached('deliver', 'motor')).toBe(true);
    expect(reached('motor', 'deliver')).toBe(false);
    expect(reached('end', 'roomLit')).toBe(true);
  });
});
