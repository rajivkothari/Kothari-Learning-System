/// <reference types="node" />
// The Ice Palace bridge by ear: its instruction in words right for the number one, listening holds,
// reminders in the quiet and the nudge (the royal games' voice), counting aloud only when a number is
// recorded, and a reworded line that never plays an old take with other words.
import pending from '../../../../content/themes/magical-kingdom/recordings-pending.json';
import narration from '../../../../content/themes/magical-kingdom/narration-script.json';
import games from '../../../../content/themes/magical-kingdom/games-narration.json';
import learning from '../../../../content/themes/magical-kingdom/learning.json';
import { WORDS as W } from '../copy';
import { MAX_REMINDERS, REMIND_MS } from '../games/flow';
import { testAudio, testClock } from '../games/testing';
import { MAX_BRIDGE, bridgeGoal, countKey, createAdventureVoice, voiceKey } from './bridge';

/** What the kingdom has recorded today: the narration script's lines, by their words (audio/sources.ts is generated from it). */
const RECORDED = new Set(narration.lines.map((l) => voiceKey(l.text)));
const NUMBER = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Every bridge the kingdom's bridge activities can build: [length, stones already lit]. */
function bridges(): [number, number][] {
  type Range = [number, number];
  const out: [number, number][] = [];
  for (const a of learning.pack.activities as unknown as { id: string; params: { capacity?: Range; aboard?: Range } }[]) {
    if (!a.id.startsWith('bridge-') || !a.params.capacity) continue;
    const [lo, hi] = a.params.capacity;
    const [alo, ahi] = a.params.aboard ?? [0, 0];
    for (let t = lo; t <= hi; t++) for (let i = alo; i <= ahi; i++) if (t - i >= 1) out.push([t, i]);
  }
  return out;
}

function voice(options: { recorded?: (key: string) => boolean; whenReady?: boolean } = {}) {
  const clock = testClock();
  const a = testAudio({ recorded: options.recorded ?? ((k) => RECORDED.has(k) || k.startsWith('effect:')), whenReady: options.whenReady });
  let open = true;
  const v = createAdventureVoice({ audio: a.audio, wait: clock.wait, open: () => open });
  return { v, a, clock, close: () => { open = false; } };
}

describe('Ice Palace bridge', () => {
  it('says its instruction in words right for one, and every other bridge in the recorded words', () => {
    expect(bridgeGoal(1, 0)).toBe('Place 1 crystal on the bridge.');
    expect(bridgeGoal(3, 0)).toBe('Place 3 crystals on the bridge.');
    expect(bridgeGoal(7, 1)).toBe('1 stone is ready. Add 6 crystals.');
    expect(bridgeGoal(7, 2)).toBe('2 stones are ready. Add 5 crystals.');
    for (const [t, i] of bridges()) {
      const goal = bridgeGoal(t, i);
      expect(goal).not.toMatch(/\b1 crystals\b|\b1 stones\b|\b1 stones are\b/);
      // A line that kept its words is still recorded; a reworded one is waiting for its new take.
      const waiting = pending.rerecord.find((r) => r.text === goal);
      expect(RECORDED.has(voiceKey(goal)) || waiting !== undefined).toBe(true);
    }
  });

  it('lists every reworded line for re-recording, and never plays its old take, whose words differ', () => {
    for (const r of pending.rerecord) {
      // The old take is still in the recorded script, under its old words: it can only ever play for those words.
      expect(narration.lines.find((l) => l.id === r.id)?.text).toBe(r.was);
      expect(RECORDED.has(voiceKey(r.was))).toBe(true);
      expect(RECORDED.has(voiceKey(r.text))).toBe(false);
      expect(r.registerAs).toBe(voiceKey(r.text));
      // The words are exactly what the game prints for that bridge (the script keeps every repair the copy can say, as it did).
      const [, a, b] = r.id.split('.').map(Number);
      expect(r.id.startsWith('bridge.') ? bridgeGoal(a!, 0) : bridgeGoal(a! + b!, a!)).toBe(r.text);
    }
    // The game asks for the line on screen: with the real recordings, the one-crystal bridge says nothing.
    const { v, a } = voice();
    v.ask('item-1', [W.iceIntro, bridgeGoal(1, 0)]);
    expect(a.last()).toEqual([voiceKey(W.iceIntro), voiceKey('Place 1 crystal on the bridge.')]);
    const played = a.last().filter((k) => RECORDED.has(k));
    expect(played).toEqual([voiceKey(W.iceIntro)]);
    v.dispose();
  });

  it('lists the counting words as new clips, zero to the largest bridge, none recorded yet', () => {
    expect(pending.clips.map((c) => c.id)).toEqual(NUMBER.slice(0, MAX_BRIDGE + 1).map((_, n) => `count.${n}`));
    pending.clips.forEach((c, n) => {
      expect(c.text).toBe(NUMBER[n]);
      expect(c.registerAs).toBe(countKey(n));
    });
    // Not yet in the recorded game script (its test requires a recording for every clip there).
    const ids = new Set(games.clips.map((c) => c.id));
    for (const c of pending.clips) expect(ids.has(c.id)).toBe(false);
    for (const [t] of bridges()) expect(t).toBeLessThanOrEqual(MAX_BRIDGE);
  });

  it('counts aloud when a number is recorded, and plays only the chime when it is not', () => {
    const withNumbers = voice({ recorded: (k) => k.startsWith('game:count.') || k.startsWith('effect:') });
    withNumbers.v.placed(1);
    expect(withNumbers.a.last()).toEqual(['effect:place', 'game:count.1']);
    withNumbers.a.finish();
    withNumbers.v.placed(2);
    expect(withNumbers.a.last()).toEqual(['effect:place', 'game:count.2']);
    // Taken back: the count that remains.
    withNumbers.v.removed(1);
    expect(withNumbers.a.last()).toEqual(['effect:remove', 'game:count.1']);
    withNumbers.v.removed(0);
    expect(withNumbers.a.last()).toEqual(['effect:remove', 'game:count.0']);
    // Counting never holds anything.
    expect(withNumbers.v.view().listening).toBe(false);
    withNumbers.v.dispose();

    const today = voice();
    today.v.placed(1);
    today.v.removed(0);
    expect(today.a.said).toEqual([]);
    expect(today.a.effects).toEqual(['place', 'remove']);
    today.v.dispose();
  });

  it('holds while the instruction is said, repeats it by the ear and by reminders in the quiet, then nudges', () => {
    const { v, a, clock, close } = voice();
    const goal = bridgeGoal(5, 0);
    v.ask('item-1', [W.iceIntro, goal]);
    expect(v.view()).toEqual({ listening: true, nudge: false });
    // The ear says the instruction again and keeps the hold while the ask is still sounding.
    v.hear();
    expect(a.last()).toEqual([voiceKey(goal)]);
    expect(v.view().listening).toBe(true);
    a.finish();
    expect(v.view().listening).toBe(false);
    clock.advance(REMIND_MS - 1);
    expect(a.said).toHaveLength(2);
    clock.advance(1);
    expect(a.last()).toEqual([voiceKey(goal)]);
    expect(v.view().listening).toBe(false);
    a.finish();
    clock.advance(REMIND_MS);
    expect(a.said).toHaveLength(2 + MAX_REMINDERS);
    a.finish();
    expect(v.view().nudge).toBe(true);
    // A crystal placed is a touch: the nudge goes and the reminders start over.
    v.placed(1);
    expect(v.view().nudge).toBe(false);
    clock.advance(REMIND_MS);
    expect(a.said).toHaveLength(3 + MAX_REMINDERS);
    a.finish();
    // A miss: try again, then the instruction, held.
    v.retry([W.iceRetry, goal]);
    expect(a.last()).toEqual([voiceKey(W.iceRetry), voiceKey(goal)]);
    expect(v.view().listening).toBe(true);
    a.finish();
    // Solved: no reminders.
    close();
    v.say([W.iceSuccess]);
    a.finish();
    const said = a.said.length;
    clock.advance(REMIND_MS * 5);
    expect(a.said).toHaveLength(said);
    v.dispose();
    expect(clock.pending()).toBe(0);
  });

  it('in the browser an instruction that could not play is said at the first touch, with the hold', () => {
    const { v, a } = voice({ whenReady: true });
    a.silence(true);
    v.ask('item-1', [W.iceIntro, bridgeGoal(4, 0)]);
    expect(v.view().listening).toBe(false);
    a.touch();
    expect(v.view().listening).toBe(true);
    expect(a.said).toHaveLength(2);
    // A closing room hushes only its own speech.
    v.dispose();
    expect(a.hushes()).toBe(1);
  });
});
