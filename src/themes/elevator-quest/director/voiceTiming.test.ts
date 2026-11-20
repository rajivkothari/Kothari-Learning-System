// Story beats that are voiced wait for their line instead of a fixed timer (docs/ELEVATOR_QUEST_VOICE.md
// "Code this needs"), up to a cap, and never when the clip is missing or sound is off. Taps stay
// immediate: nothing about the panel waits on speech.
import type { SpeechHook } from '../audio/speech';
import { FLOOR15, LINES } from '../content/floor15';
import { VOICE_CUES } from '../content/voice';
import { answerCorrectly, openSession, settled, tempDir, virtualTime, type Session, type VirtualTime } from '../testing/headless';
import { SPEECH_TAIL_MS, SPEECH_WAIT_CAP_MS } from './director';

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
