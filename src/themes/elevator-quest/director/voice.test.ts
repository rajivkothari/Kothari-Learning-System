// The tower's voices on the real director (docs/ELEVATOR_QUEST_VOICE.md, D210): which lines it asks
// for and when, captions only while a line plays, announcements on every ride, and a game that is
// exactly as it was when no line has a recording.
import { FLOOR15, LINES } from '../content/floor15';
import { BASEMENT } from '../content/landings';
import { VOICE_CUES, voiceLine } from '../content/voice';
import type { SpeechHook } from '../audio/speech';
import { fakeSpeech as timedSpeech } from '../testing/fakeSpeech';
import { answerCorrectly, openSession, settled, tempDir, virtualTime, type Session, type VirtualTime } from '../testing/headless';
import { liftyOwnWords } from './director';

/**
 * A speech hook on virtual time. `recorded` decides which keys have a recording (none by default);
 * each recorded line "plays" for `ms`. Records every request, and what actually started.
 */
function fakeSpeech(time: VirtualTime, opts: { recorded?: (key: string) => boolean; ms?: number } = {}) {
  const asked: string[][] = [];
  const started: string[][] = [];
  let current: { keys: string[]; onEnd?: () => void; timer: { cancel(): void } } | null = null;
  const stop = () => {
    const c = current;
    current = null;
    if (!c) return;
    c.timer.cancel();
    c.onEnd?.();
  };
  const hook: SpeechHook = {
    speak(keys, onEnd) {
      asked.push([...keys]);
      const list = keys.filter((k) => opts.recorded?.(k) ?? false);
      if (!list.length) return false;
      stop();
      const me = {
        keys: list,
        ...(onEnd ? { onEnd } : {}),
        timer: time.schedule(() => {
          if (current !== me) return;
          current = null;
          me.onEnd?.();
        }, (opts.ms ?? 1500) * list.length),
      };
      current = me;
      started.push(list);
      return true;
    },
    hush: stop,
  };
  return { hook, asked, started, speaking: () => current !== null, flat: () => asked.flat() };
}

const all = () => true;
const caption = (key: string | null) => LINES.radioCaption(voiceLine(key!)!.text);

async function wake(s: Session) {
  s.director.pressDoorOpen();
  expect(await s.time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
}

describe('voice: lines carry their keys to the session', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it('the cold open asks for the crew, then Lifty; with no recording the words are exactly the intro', async () => {
    const time = virtualTime();
    const sp = fakeSpeech(time);
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    expect(s.view().stage).toBe('intro');
    expect(s.view().lifty).toMatchObject({ line: LINES.intro, voice: [VOICE_CUES.coldOpen, VOICE_CUES.intro] });
    expect(sp.asked[0]).toEqual([VOICE_CUES.coldOpen, VOICE_CUES.intro]);
    expect(sp.started).toEqual([]);
  });

  it('with recordings the crew is captioned while it speaks; DOOR OPEN asks for the announcer, then Lifty', async () => {
    const time = virtualTime();
    const sp = fakeSpeech(time, { recorded: all });
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    // Lifty's own words first (the one instruction that moves the game on), the crew's caption after them.
    expect(s.view().lifty.line).toBe(`${LINES.intro} ${caption(VOICE_CUES.coldOpen)}`);
    expect(s.view().lifty.caption).toMatch(/^RADIO: Lift, this is the repair crew\./);
    expect(liftyOwnWords(s.view().lifty)).toBe(LINES.intro);
    s.director.pressDoorOpen();
    expect(sp.asked.at(-1)).toEqual([VOICE_CUES.doorsOpening, VOICE_CUES.wake]);
    // Lifty's own line is copy: no caption, the words are the same as without voice.
    expect(s.view().lifty.line).toBe(LINES.introDone);
  });

  it('hall calls come over the radio, in turn; the announcer names each stop and the way the car goes', async () => {
    const time = virtualTime();
    const sp = fakeSpeech(time);
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    await wake(s);
    const calls = () => sp.asked.filter((k) => k[0] === VOICE_CUES.hallCall);
    await answerCorrectly(s);
    await answerCorrectly(s);
    expect(calls().length).toBeGreaterThanOrEqual(2);
    expect(calls()[0]).toEqual([VOICE_CUES.hallCall, VOICE_CUES.hallCallRadio[0]]);
    expect(calls()[1]).toEqual([VOICE_CUES.hallCall, VOICE_CUES.hallCallRadio[1]]);
    // Each call rings the hall bell once (a slot, silent until a sound is chosen).
    expect(s.audio.filter((c) => c.action === 'play' && c.slot === 'hallCallBell').length).toBe(s.log.entries().filter((e) => e.kind === 'hallCall').length);
    // Every ride ended at a stop the announcer names, and began with its direction.
    const arrivals = sp.asked.filter((k) => k.length === 1 && /^voice\.elevator\.floor\d+$/.test(k[0]!));
    const departures = sp.asked.filter((k) => k[0] === VOICE_CUES.depart('up') || k[0] === VOICE_CUES.depart('down'));
    expect(arrivals.length).toBeGreaterThanOrEqual(3);
    expect(departures.length).toBe(arrivals.length);
    expect(arrivals.at(-1)).toEqual([VOICE_CUES.arrival(s.view().elevator.floor)]);
  });

  it('an announcement never cuts a story line: it is dropped, not queued', async () => {
    const time = virtualTime();
    // Only the crew is recorded, and it talks for a long time.
    const sp = fakeSpeech(time, { recorded: (k) => k.startsWith('voice.crew.'), ms: 60_000 });
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    s.director.pressDoorOpen();
    // The radio call for the first job is still speaking when the car departs and arrives.
    await s.time.runUntil(() => s.view().stage === 'reposition' && s.view().elevator.phase === 'doorsOpening', 30_000);
    expect(sp.speaking()).toBe(true);
    const announced = sp.started.filter((k) => k[0]!.startsWith('voice.elevator.'));
    expect(announced).toEqual([]);
    const dropped = s.log.entries().filter((e) => e.kind === 'voice.dropped').map((e) => (e.data.keys as string[])[0]);
    expect(dropped).toEqual([VOICE_CUES.depart(s.view().elevator.floor > 1 ? 'up' : 'down'), VOICE_CUES.arrival(s.view().elevator.floor)]);
    // Nothing comes back later.
    await s.time.advance(90_000);
    expect(sp.started.filter((k) => k[0] === VOICE_CUES.arrival(s.view().elevator.floor))).toEqual([]);
  });

  it('a crew beat opens its step once, with the step\'s first words', async () => {
    const time = virtualTime();
    const sp = fakeSpeech(time, { recorded: all, ms: 200 });
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    await wake(s);
    for (let guard = 0; guard < 20 && s.view().task?.stepId !== 'two-groups'; guard++) await answerCorrectly(s);
    expect(s.view().task?.stepId).toBe('two-groups');
    const beat = VOICE_CUES.beat('two-groups');
    expect(beat).toHaveLength(1);
    expect(sp.flat().filter((k) => k === beat[0])).toHaveLength(1);
    // Said with the job's own words: the request that carried it is the job's voice.
    expect(s.view().lifty.voice).toEqual(beat);
  });

  it('free rides: the announcer still names every stop (D210), Lifty says nothing on the ride', async () => {
    const time = virtualTime();
    const sp = fakeSpeech(time, { recorded: all, ms: 100 });
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    await wake(s);
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    expect(sp.flat()).toContain(VOICE_CUES.crewFinale);
    s.director.pressFloor(FLOOR15.repairFloor);
    await s.time.runUntil(() => s.view().stage === 'freeRide');
    expect(sp.asked).toContainEqual([VOICE_CUES.restored, VOICE_CUES.crewRestored]);
    expect(sp.asked).toContainEqual([VOICE_CUES.rank]);
    await s.time.advance(20_000);
    const before = sp.asked.length;
    s.director.pressFloor(3);
    expect(await s.time.runUntil(() => s.view().elevator.floor === 3 && s.view().elevator.phase === 'idleOpen')).toBe(true);
    await s.time.advance(3000);
    const ride = sp.asked.slice(before);
    expect(ride).toEqual([[VOICE_CUES.depart('down')], [VOICE_CUES.arrival(3)]]);
    expect(VOICE_CUES.arrival(BASEMENT)).toBe('voice.elevator.b1');
  });
});

describe('voice: a caption never outlives its voice, and never pushes the job down', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it("while the crew's clip plays the job's words come first; when it ends the line is the job's own words again", async () => {
    const time = virtualTime();
    const sp = timedSpeech(time, { ms: () => 1500 });
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    // Every line shown: Lifty's own words always lead, whatever is captioned after them.
    s.director.subscribe((v) => {
      if (v.lifty.caption) expect(v.lifty.line).toBe([liftyOwnWords(v.lifty), v.lifty.caption].filter(Boolean).join(' '));
      else expect(liftyOwnWords(v.lifty)).toBe(v.lifty.line);
    });
    await wake(s);
    // The job waits, settled, with its beat still on the radio (reachStep stops the moment it is offered).
    for (let guard = 0; guard < 20 && s.view().task?.stepId !== 'two-groups'; guard++) await answerCorrectly(s);
    const beat = caption(VOICE_CUES.beat('two-groups')[0]!);
    expect(sp.now()).toEqual(VOICE_CUES.beat('two-groups'));
    const voiced = s.view().lifty;
    expect(voiced.caption).toBe(beat);
    expect(voiced.line.endsWith(` ${beat}`)).toBe(true);
    const job = liftyOwnWords(voiced);
    // The numbers the job turns on are at the front, not after a 98-character radio call.
    expect(job).toMatch(/\d/);
    expect(voiced.line.startsWith(job)).toBe(true);
    // The clip ends: no caption is left in front of, or behind, the job. (It used to stay until Lifty spoke again.)
    await time.advance(1500);
    expect(sp.speaking()).toBe(false);
    expect(s.view().lifty).toMatchObject({ line: job, mood: voiced.mood, seq: voiced.seq });
    expect(s.view().lifty.caption).toBeUndefined();
    await time.advance(20_000);
    expect(s.view().lifty.line).toBe(job);
    expect(s.view().lifty.line).not.toMatch(/RADIO/);
  });

  it('an aside said over a captioned line brings back Lifty\'s own words, not the caption its voice ended', async () => {
    const time = virtualTime();
    const sp = timedSpeech(time, { ms: () => 1500 });
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    await wake(s);
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    // The finale opens with the crew on the radio: its caption follows Lifty's line.
    expect(sp.now()).toEqual([VOICE_CUES.crewFinale, VOICE_CUES.finale]);
    expect(s.view().lifty.line).toBe(`${LINES.finale} ${caption(VOICE_CUES.crewFinale)}`);
    // B1 while a job waits is only a word from Lifty (D194): it takes the voice, then the line she was saying comes back.
    s.director.pressBasement();
    expect(s.view().lifty.line).toBe(LINES.basementLater);
    expect(sp.now()).toEqual([VOICE_CUES.basementAside]);
    await time.advance(10_000);
    expect(sp.speaking()).toBe(false);
    expect(s.view().lifty.line).toBe(LINES.finale);
  });

  it('Lifty going quiet keeps a crew caption only while the crew speaks', async () => {
    const time = virtualTime();
    const sp = timedSpeech(time, { ms: (k) => (k.startsWith('voice.crew.') ? 3000 : null) });
    const s = await openSession(tmp.file, time, { speech: sp.hook, autoHallCalls: false });
    s.director.pressDoorOpen();
    expect(await time.runUntil(() => s.view().stage === 'call')).toBe(true);
    const call = caption(VOICE_CUES.hallCallRadio[0]!);
    expect(s.view().lifty.line).toBe(`${LINES.hallCall(s.view().hallCall!)} ${call}`);
    // The call is taken: Lifty has nothing more to say, the crew is still on the radio.
    s.director.pressFloor(s.view().hallCall!);
    expect(s.view().lifty).toMatchObject({ line: call, caption: call });
    expect(liftyOwnWords(s.view().lifty)).toBe('');
  });
});

describe('voice: with no recording the game is exactly as it was', () => {
  it('a whole mission, the restoration and a free ride: the same words, stages and sounds at the same moments', async () => {
    const run = async (speech: boolean) => {
      const tmp = tempDir();
      const time = virtualTime();
      const sp = fakeSpeech(time);
      const s = await openSession(tmp.file, time, { instanceId: 'floor15-same', ...(speech ? { speech: sp.hook } : {}) });
      const seen: string[] = [];
      s.director.subscribe((v) => seen.push(`${time.now()}|${v.stage}|${v.success}|${v.elevator.phase}|${v.elevator.floor}|${v.lifty.line}|${v.lifty.mood}`));
      await wake(s);
      while (s.view().stage !== 'finale') await answerCorrectly(s);
      s.director.pressFloor(FLOOR15.repairFloor);
      await s.time.runUntil(() => s.view().stage === 'freeRide');
      await s.time.advance(15_000);
      s.director.pressFloor(4);
      await s.time.runUntil(() => s.view().elevator.floor === 4 && s.view().elevator.phase === 'idleOpen');
      await s.time.advance(5000);
      const audio = s.audio.map((c) => `${c.at}|${c.action}|${c.slot}`);
      await s.director.idle();
      s.director.dispose();
      await s.db.close();
      tmp.cleanup();
      return { seen, audio, asked: sp.asked.length };
    };
    const without = await run(false);
    const silent = await run(true);
    expect(silent.asked).toBeGreaterThan(40);
    expect(silent.seen).toEqual(without.seen);
    expect(silent.audio).toEqual(without.audio);
  }, 120_000);
});
