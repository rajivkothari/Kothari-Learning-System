// Story beats that are voiced wait for their line instead of a fixed timer (docs/ELEVATOR_QUEST_VOICE.md
// "Code this needs"), up to a cap, and never when the clip is missing or sound is off. Taps stay
// immediate: nothing about the panel waits on speech.
import type { SpeechHook } from '../audio/speech';
import { FLOOR15, LINES } from '../content/floor15';
import { VOICE_CUES, VOICE_KEYS } from '../content/voice';
import { FAKE_GAP_MS, VOICE_PAD_MS, VOICE_RATE_CPS, estimatedMs, fakeSpeech as measuredSpeech } from '../testing/fakeSpeech';
import { answerCorrectly, openSession, settled, tempDir, virtualTime, type Session, type VirtualTime } from '../testing/headless';
import { SPEECH_TAIL_MS, SPEECH_WAIT_CAP_MS, SPEECH_WAIT_MARGIN_MS } from './director';

/** A speech hook on virtual time: `ms(key)` is a recording's length, or null for no recording. */
function fakeSpeech(time: VirtualTime, ms: (key: string) => number | null) {
  let current: { onEnd?: () => void; timer: { cancel(): void } } | null = null;
  const spoken: { keys: string[]; at: number }[] = [];
  const stop = () => {
    const c = current;
    current = null;
    if (!c) return;
    c.timer.cancel();
    c.onEnd?.();
  };
  const hook: SpeechHook = {
    speak(keys, onEnd) {
      const list = keys.filter((k) => ms(k) !== null);
      if (!list.length) return false;
      stop();
      const total = list.reduce((n, k) => n + ms(k)!, 0);
      const me = {
        ...(onEnd ? { onEnd } : {}),
        timer: time.schedule(() => {
          if (current !== me) return;
          current = null;
          me.onEnd?.();
        }, total),
      };
      current = me;
      spoken.push({ keys: list, at: time.now() });
      return true;
    },
    hush: stop,
  };
  return { hook, spoken };
}

/** When the restoration line appeared, and when free play opened, after pressing 15 at the finale. */
async function restoration(s: Session) {
  const marks: { complete: number | null; free: number | null } = { complete: null, free: null };
  const stop = s.director.subscribe((v) => {
    if (marks.complete === null && v.stage === 'complete' && v.lifty.line.includes(LINES.complete)) marks.complete = s.time.now();
    if (marks.free === null && v.stage === 'freeRide') marks.free = s.time.now();
  });
  s.director.pressFloor(FLOOR15.repairFloor);
  let opened: number | null = null;
  const stopDoors = s.director.subscribe((v) => {
    if (opened === null && v.stage === 'complete') opened = s.time.now();
  });
  await s.time.runUntil(() => s.view().stage === 'freeRide');
  stop();
  stopDoors();
  return { ...marks, opened: opened! };
}

async function toFinale(s: Session) {
  s.director.pressDoorOpen();
  await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
  while (s.view().stage !== 'finale') await answerCorrectly(s);
  await s.time.runUntil(settled(s));
}

describe('voiced beats wait for their line', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('with nothing to hear (no recording, or sound off), the restoration keeps its 1.8 s and 2.8 s', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { speech: fakeSpeech(time, () => null).hook });
    await toFinale(s);
    const r = await restoration(s);
    expect(r.complete! - r.opened).toBe(1800);
    expect(r.free! - r.complete!).toBe(2800);
  });

  it('a missing clip is the same as no voice: only the lines with recordings are waited for', async () => {
    const time = virtualTime();
    // Everything recorded except the two restoration lines.
    const s = await openSession(tmp.file, time, { speech: fakeSpeech(time, (k) => (k === VOICE_CUES.restored || k === VOICE_CUES.crewRestored ? null : 500)).hook });
    await toFinale(s);
    const r = await restoration(s);
    expect(r.free! - r.complete!).toBe(2800);
  });

  it('the restoration waits for the arrival announcement, then the rank waits for the restoration lines', async () => {
    const time = virtualTime();
    // The arrival is long (4 s); Lifty's and the crew's restoration lines 3 s each.
    const sp = fakeSpeech(time, (k) => (k.startsWith('voice.elevator.floor') ? 4000 : k === VOICE_CUES.restored || k === VOICE_CUES.crewRestored ? 3000 : 400));
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    await toFinale(s);
    const r = await restoration(s);
    const arrival = sp.spoken.filter((x) => x.keys[0] === VOICE_CUES.arrival(FLOOR15.repairFloor)).at(-1)!;
    // Not over the announcement: after it ends (plus the tail), and later than the old 1.8 s.
    expect(r.complete!).toBe(arrival.at + 4000 + SPEECH_TAIL_MS);
    expect(r.complete! - r.opened).toBeGreaterThan(1800);
    const lines = sp.spoken.find((x) => x.keys[0] === VOICE_CUES.restored)!;
    expect(lines.keys).toEqual([VOICE_CUES.restored, VOICE_CUES.crewRestored]);
    expect(r.free!).toBe(lines.at + 6000 + SPEECH_TAIL_MS);
    expect(s.view().lifty.line).toBe(LINES.rankEarned);
  });

  it('a short line never shortens the beat: the old timer is the least it waits', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { speech: fakeSpeech(time, () => 300).hook });
    await toFinale(s);
    const r = await restoration(s);
    expect(r.free! - r.complete!).toBe(2800);
  });

  it('a clip that runs on is cut off by the cap: play is never held hostage', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { speech: fakeSpeech(time, (k) => (k === VOICE_CUES.restored ? 120_000 : 300)).hook });
    await toFinale(s);
    const r = await restoration(s);
    expect(r.free! - r.complete!).toBe(SPEECH_WAIT_CAP_MS);
  });

  it('the wake-up line finishes before the first call comes in (and with no voice, the old pause)', async () => {
    const firstCall = async (ms: (k: string) => number | null) => {
      const t = tempDir();
      const time = virtualTime();
      const s = await openSession(t.file, time, { speech: fakeSpeech(time, ms).hook, autoHallCalls: false });
      s.director.pressDoorOpen();
      const pressed = time.now();
      await s.time.runUntil(() => s.view().stage === 'call' || s.view().stage === 'task');
      const at = time.now() - pressed;
      await s.director.idle();
      s.director.dispose();
      await s.db.close();
      t.cleanup();
      return at;
    };
    const silent = await firstCall(() => null);
    const voiced = await firstCall((k) => (k === VOICE_CUES.doorsOpening ? 1000 : k === VOICE_CUES.wake ? 4000 : null));
    expect(silent).toBeLessThan(5000);
    expect(voiced).toBeGreaterThanOrEqual(5000 + SPEECH_TAIL_MS);
  });

  it('a voiced aside keeps the job\'s words back until it is said; unvoiced, the old 3.6 s', async () => {
    const aside = async (ms: (k: string) => number | null) => {
      const t = tempDir();
      const time = virtualTime();
      const s = await openSession(t.file, time, { speech: fakeSpeech(time, ms).hook });
      s.director.pressDoorOpen();
      await s.time.runUntil(() => settled(s)() && s.view().stage === 'task');
      const job = s.view().lifty.line;
      s.director.pressBasement();
      expect(s.view().lifty.line).toBe(LINES.basementLater);
      const at = time.now();
      await s.time.runUntil(() => s.view().lifty.line === job);
      const took = time.now() - at;
      await s.director.idle();
      s.director.dispose();
      await s.db.close();
      t.cleanup();
      return took;
    };
    expect(await aside(() => null)).toBe(3600);
    expect(await aside((k) => (k === VOICE_CUES.basementAside ? 5000 : null))).toBe(5000 + SPEECH_TAIL_MS);
  });

  it('taps stay immediate while a line speaks: a hall call\'s floor lights and the ride starts at once', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time, { speech: fakeSpeech(time, () => 30_000).hook, autoHallCalls: false });
    s.director.pressDoorOpen();
    await s.time.runUntil(() => s.view().stage === 'call', 60_000);
    const call = s.view().hallCall!;
    s.director.pressFloor(call);
    // Same tick: lit, the panel locked for the ride, nothing waiting on the voice.
    expect(s.view()).toMatchObject({ stage: 'reposition', hallCall: null });
    expect(s.view().elevator.destination).toBe(call);
  });
});

// No recording exists yet, so these lengths come from the script's own words: an unhurried
// VOICE_RATE_CPS characters a second (the pace its directions ask for) plus VOICE_PAD_MS of quiet a
// line (testing/fakeSpeech.ts estimatedMs). Once recordings exist the same waits are sized from their
// measured lengths in the audio manifest (SpeechHook.sequenceMs, audio/speech.test.ts).
describe('a beat waits for its whole sequence, sized from the sequence itself', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('the stated rate is an unhurried one, and no single line of the script outlasts the ceiling for one line', () => {
    expect({ VOICE_RATE_CPS, VOICE_PAD_MS }).toEqual({ VOICE_RATE_CPS: 13, VOICE_PAD_MS: 200 });
    const longest = VOICE_KEYS.map((k) => ({ k, ms: estimatedMs(k)! })).sort((a, b) => b.ms - a.ms)[0]!;
    expect(longest.ms).toBeLessThanOrEqual(SPEECH_WAIT_CAP_MS);
  });

  it('the restoration runs past nine seconds at that rate, and the rank still waits for the crew\'s thanks', async () => {
    const time = virtualTime();
    const sp = measuredSpeech(time, { ms: estimatedMs });
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    await toFinale(s);
    await time.advance(30_000); // the finale's lines are over
    const r = await restoration(s);
    const lines = sp.said.find((x) => x.keys[0] === VOICE_CUES.restored)!;
    expect(lines.keys).toEqual([VOICE_CUES.restored, VOICE_CUES.crewRestored]);
    const planned = lines.plannedEnd - lines.at;
    expect(planned).toBe(estimatedMs(VOICE_CUES.restored!)! + FAKE_GAP_MS + estimatedMs(VOICE_CUES.crewRestored!)!);
    // Longer than the old fixed limit for a whole sequence, which cut "Thanks for the lift, engineer" with the rank line.
    expect(planned).toBeGreaterThan(SPEECH_WAIT_CAP_MS);
    expect(lines).toMatchObject({ how: 'ended', endedAt: lines.plannedEnd });
    expect(r.free!).toBe(lines.plannedEnd + SPEECH_TAIL_MS);
    expect(sp.said.at(-1)!.keys).toEqual([VOICE_CUES.rank]);
  });

  it('every sequence the director waits on fits the wait it was given (a whole mission, the restoration, an aside)', async () => {
    const time = virtualTime();
    const sp = measuredSpeech(time, { ms: estimatedMs });
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    await toFinale(s);
    await time.advance(30_000);
    // An aside over nothing, then the restoration.
    s.director.pressBasement();
    await time.advance(15_000);
    await restoration(s);
    await time.advance(15_000);
    const waits = s.log.entries().filter((e) => e.kind === 'voice.wait').map((e) => e.data as { minMs: number; cap: number; keys: string[]; remaining: number | null });
    // The wake-up, the arrival at the restored floor, the restoration lines and the aside were all waited for.
    for (const key of [VOICE_CUES.wake, VOICE_CUES.arrival(FLOOR15.repairFloor), VOICE_CUES.crewRestored, VOICE_CUES.basementAside]) expect(waits.some((w) => w.keys.includes(key!))).toBe(true);
    for (const w of waits) {
      // The length was known, and the wait outlasts what is left of the sequence by the margin: the
      // line's end (plus its breath) always comes first, so no beat cuts the line it waits for.
      expect(w.remaining).not.toBeNull();
      expect(w.cap).toBeGreaterThanOrEqual(w.remaining! + SPEECH_WAIT_MARGIN_MS);
      expect(SPEECH_WAIT_MARGIN_MS).toBeGreaterThan(SPEECH_TAIL_MS);
    }
    // And in fact: nothing the director waited on was cut by the director's own next line.
    const waitedFor = sp.said.filter((x) => waits.some((w) => w.keys.join() === x.keys.join()));
    expect(waitedFor.length).toBeGreaterThanOrEqual(4);
    expect(waitedFor.filter((x) => x.how !== 'ended')).toEqual([]);
  });

  it('a stuck clip still cannot hold play: one line never counts for more than the ceiling, and the wait ends by itself', async () => {
    const time = virtualTime();
    // Lifty's restoration line never ends; the crew's is 3 s. The hook measures (a line counts for 9 s at most).
    const sp = measuredSpeech(time, { ms: (k) => (k === VOICE_CUES.restored ? 600_000 : k === VOICE_CUES.crewRestored ? 3000 : 300) });
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    await toFinale(s);
    await time.advance(5000);
    const r = await restoration(s);
    expect(r.free! - r.complete!).toBe(SPEECH_WAIT_CAP_MS + FAKE_GAP_MS + 3000 + SPEECH_WAIT_MARGIN_MS);
  });
});
