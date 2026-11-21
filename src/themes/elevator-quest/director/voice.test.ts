// The tower's voices on the real director (docs/ELEVATOR_QUEST_VOICE.md, D210): which lines it asks
// for and when, captions only while a line plays, announcements on every ride, and a game that is
// exactly as it was when no line has a recording.
import { FLOOR15, LINES } from '../content/floor15';
import { BASEMENT } from '../content/landings';
import { VOICE_CUES, voiceLine } from '../content/voice';
import type { SpeechHook } from '../audio/speech';
import { isMoving } from '../sim/elevator';
import { estimatedMs, fakeSpeech as timedSpeech, roleOf } from '../testing/fakeSpeech';
import { answerCorrectly, openSession, settled, tempDir, virtualTime, type Session, type VirtualTime } from '../testing/headless';
import { FOLLOW_GAP_MS, SPEECH_WAIT_CAP_MS, liftyOwnWords } from './director';

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

  it('an announcement never cuts a story line while the car stands: it is dropped, not queued', async () => {
    const time = virtualTime();
    // The crew talks for a long time; the announcer has recordings too.
    const sp = timedSpeech(time, { ms: (k) => (k.startsWith('voice.crew.') ? 60_000 : 1000) });
    const s = await openSession(tmp.file, time, { speech: sp.hook, autoHallCalls: false });
    s.director.pressDoorOpen();
    expect(await s.time.runUntil(() => s.view().stage === 'call')).toBe(true);
    await time.advance(1500); // "Hall call." is over; the crew's radio call is speaking
    expect(sp.now()).toContain(VOICE_CUES.hallCallRadio[0]);
    const before = sp.said.length;
    // DOOR CLOSE moves the doors and would be announced: under the crew's call it is dropped.
    s.director.pressDoorClose();
    expect(s.view().elevator.phase).toBe('doorsClosing');
    expect(sp.said.length).toBe(before);
    expect(s.log.entries().filter((e) => e.kind === 'voice.dropped').map((e) => (e.data.keys as string[])[0])).toEqual([VOICE_CUES.doorsClosing]);
    // Nothing comes back later.
    await time.advance(30_000);
    expect(sp.said.filter((x) => x.keys[0] === VOICE_CUES.doorsClosing)).toEqual([]);
    expect(sp.now()).toContain(VOICE_CUES.hallCallRadio[0]);
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

describe('voice: the ride belongs to the Elevator (D210, D213): Lifty and the crew are never heard over it', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  /** Every view update while the car moves: what was speaking, and what Lifty's bubble showed. */
  function watchRides(s: Session, sp: ReturnType<typeof timedSpeech>) {
    const moving: { speaking: string[]; line: string }[] = [];
    s.director.subscribe((v) => {
      if (isMoving(v.elevator)) moving.push({ speaking: sp.now(), line: v.lifty.line });
    });
    return moving;
  }
  const story = (keys: readonly string[]) => keys.some((k) => roleOf(k) !== 'elevator');

  it('a radio call still speaking when the car departs fades out there; "Going up" is heard; its words stay readable for the ride', async () => {
    const time = virtualTime();
    const sp = timedSpeech(time, { ms: (k) => (k.startsWith('voice.crew.') ? 60_000 : 1000) });
    const s = await openSession(tmp.file, time, { speech: sp.hook, autoHallCalls: false });
    const moving = watchRides(s, sp);
    s.director.pressDoorOpen();
    expect(await s.time.runUntil(() => s.view().stage === 'call')).toBe(true);
    const call = sp.said.at(-1)!;
    expect(call.keys).toEqual([VOICE_CUES.hallCall, VOICE_CUES.hallCallRadio[0]]);
    const radio = caption(VOICE_CUES.hallCallRadio[0]!);
    const floor = s.view().hallCall!;
    const direction = floor > s.view().elevator.floor ? 'up' : 'down';
    // The learner presses at once: the ride was chosen, and it never waits for the crew.
    s.director.pressFloor(floor);
    expect(await s.time.runUntil(() => isMoving(s.view().elevator))).toBe(true);
    const departed = s.log.entries().find((e) => e.kind === 'elevator.depart')!.t;
    // The crew's call stopped at the departure (a hush: the engine fades it), not before and not after.
    expect(call).toMatchObject({ how: 'hushed', endedAt: departed });
    expect(s.log.entries().filter((e) => e.kind === 'voice.cut').map((e) => e.data)).toEqual([{ why: 'ride', caption: true }]);
    // The Elevator announced the way it goes, in the same moment, instead of being dropped under the crew.
    expect(sp.said.at(-1)).toMatchObject({ keys: [VOICE_CUES.depart(direction)], at: departed });
    expect(s.log.entries().filter((e) => e.kind === 'voice.dropped')).toEqual([]);
    expect(await s.time.runUntil(() => s.view().elevator.floor === floor && s.view().elevator.phase === 'idleOpen')).toBe(true);
    // Over the whole ride: no voice but the Elevator's, and the crew's words on screen to read.
    expect(moving.length).toBeGreaterThan(5);
    expect(moving.filter((m) => story(m.speaking))).toEqual([]);
    expect(new Set(moving.map((m) => m.line))).toEqual(new Set([radio]));
    // At the stop the announcer names it, and the caption has made way for the job.
    expect(sp.said.map((x) => x.keys)).toContainEqual([VOICE_CUES.arrival(floor)]);
    expect(s.view().lifty.line).not.toMatch(/RADIO/);
    expect(s.view().lifty.caption).toBeUndefined();
  });

  it('departure never waits on speech: the car leaves at the same moment with a long line speaking as with none', async () => {
    const departAfterPress = async (ms: (k: string) => number | null) => {
      const t = tempDir();
      const time = virtualTime();
      const s = await openSession(t.file, time, { speech: timedSpeech(time, { ms }).hook, autoHallCalls: false });
      s.director.pressDoorOpen();
      await s.time.runUntil(() => s.view().stage === 'call');
      const pressed = time.now();
      s.director.pressFloor(s.view().hallCall!);
      await s.time.runUntil(() => isMoving(s.view().elevator));
      const at = s.log.entries().find((e) => e.kind === 'elevator.depart')!.t - pressed;
      await s.director.idle();
      s.director.dispose();
      await s.db.close();
      t.cleanup();
      return at;
    };
    const silent = await departAfterPress(() => null);
    expect(await departAfterPress((k) => (k.startsWith('voice.crew.') ? 60_000 : 1000))).toBe(silent);
  });

  it('free play: the rank line is still speaking when a floor is pressed; it fades at departure, "Going down" is heard, nothing of Lifty\'s is heard or left on screen', async () => {
    const time = virtualTime();
    const sp = timedSpeech(time, { ms: estimatedMs });
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    await wake(s);
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    await time.advance(30_000);
    s.director.pressFloor(FLOOR15.repairFloor);
    expect(await time.runUntil(() => s.view().stage === 'freeRide')).toBe(true);
    expect(s.view().lifty.line).toBe(LINES.rankEarned);
    expect(sp.now()).toEqual([VOICE_CUES.rank]);
    const rank = sp.said.at(-1)!;
    // The panel is free the moment free play opens: a floor is pressed half a second in.
    await time.advance(500);
    const moving = watchRides(s, sp);
    s.director.pressFloor(3);
    // Until the car leaves Lifty finishes what the screen still shows.
    expect(sp.now()).toEqual([VOICE_CUES.rank]);
    expect(s.view().lifty.line).toBe(LINES.rankEarned);
    expect(await time.runUntil(() => s.view().elevator.floor === 3 && s.view().elevator.phase === 'idleOpen')).toBe(true);
    const departed = s.log.entries().filter((e) => e.kind === 'elevator.depart').at(-1)!.t;
    expect(rank).toMatchObject({ how: 'hushed', endedAt: departed });
    expect(moving.filter((m) => story(m.speaking))).toEqual([]);
    expect(moving.every((m) => m.line === '')).toBe(true);
    const announced = sp.said.filter((x) => x.at >= departed).map((x) => x.keys);
    expect(announced).toEqual([[VOICE_CUES.depart('down')], [VOICE_CUES.arrival(3)]]);
    expect(s.log.entries().filter((e) => e.kind === 'voice.dropped' && e.t >= departed)).toEqual([]);
  });

  it('a whole mission played quickly, every line recorded: no view of a moving car has Lifty or the crew speaking', async () => {
    const time = virtualTime();
    const sp = timedSpeech(time, { ms: estimatedMs });
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    const moving = watchRides(s, sp);
    await wake(s);
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    s.director.pressFloor(FLOOR15.repairFloor);
    expect(await time.runUntil(() => s.view().stage === 'freeRide')).toBe(true);
    expect(moving.length).toBeGreaterThan(100);
    expect(moving.filter((m) => story(m.speaking))).toEqual([]);
    // And no departure announcement was lost under a story line.
    const dropped = s.log.entries().filter((e) => e.kind === 'voice.dropped').map((e) => (e.data.keys as string[])[0]);
    expect(dropped.filter((k) => k === VOICE_CUES.depart('up') || k === VOICE_CUES.depart('down'))).toEqual([]);
  });

  it('Lifty going quiet takes a story line with no caption with it (never a voice with none of its words on screen)', async () => {
    const time = virtualTime();
    const sp = timedSpeech(time, { ms: estimatedMs });
    const s = await openSession(tmp.file, time, { speech: sp.hook });
    await wake(s);
    while (s.view().stage !== 'finale') await answerCorrectly(s);
    await time.advance(30_000);
    s.director.pressFloor(FLOOR15.repairFloor);
    expect(await time.runUntil(() => s.view().stage === 'freeRide')).toBe(true);
    await time.advance(500);
    expect(sp.now()).toEqual([VOICE_CUES.rank]);
    // The panel's B1 button in free play: the ride starts, and Lifty has nothing to say on it (quiet()).
    s.director.pressBasement();
    expect(s.view().express).toEqual({ to: BASEMENT });
    expect(s.view().lifty.line).toBe('');
    // The rank line is Lifty's own copy: no caption stands for it, so it stops with its words, before the car moves.
    expect(isMoving(s.view().elevator)).toBe(false);
    expect(sp.speaking()).toBe(false);
    expect(sp.said.at(-1)).toMatchObject({ keys: [VOICE_CUES.rank], how: 'hushed' });
  });
});

describe("voice: the toolbox beat (D214): the crew at the call, Lifty's reply with the job", () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());
  const [crewBeat, reply] = VOICE_CUES.beat('start-unknown') as [string, string];
  /** A mission whose toolbox job is on another floor, so it comes by a hall call (the usual case; pinned so the test does not depend on test order). */
  const instanceId = 'toolbox-a';

  it('the script still has the two lines, the crew first', () => {
    expect([voiceLine(crewBeat)!.role, voiceLine(reply)!.role]).toEqual(['crew', 'lifty']);
    expect(VOICE_CUES.isBeatReply(reply)).toBe(true);
    expect(VOICE_CUES.isBeatReply(crewBeat)).toBe(false);
  });

  it('the call button pressed early: the crew is cut by the ride, and Lifty\'s reply is still said, whole, after the Elevator names the stop', async () => {
    const time = virtualTime();
    const sp = timedSpeech(time, { ms: estimatedMs });
    // The harness presses each hall call 400 ms after it is offered.
    const s = await openSession(tmp.file, time, { speech: sp.hook, instanceId });
    await wake(s);
    for (let guard = 0; guard < 20 && s.view().task?.stepId !== 'start-unknown'; guard++) await answerCorrectly(s);
    expect(s.view().task?.stepId).toBe('start-unknown');
    const floor = s.view().elevator.floor;
    const job = liftyOwnWords(s.view().lifty);
    expect(job).not.toBe('');
    // The learner reads the job; nothing is pressed while Lifty speaks.
    const shown = new Set<string>();
    s.director.subscribe((v) => shown.add(v.lifty.line));
    await time.advance(15_000);
    // The call: the announcer and the crew only (a beat as short as the others), cut at the departure.
    const call = sp.said.find((x) => x.keys.includes(crewBeat))!;
    expect(call.keys).toEqual([VOICE_CUES.hallCall, crewBeat]);
    expect(call.plannedEnd - call.at).toBeLessThan(SPEECH_WAIT_CAP_MS);
    expect(call.how).toBe('hushed');
    // The stop is named whole, then Lifty, a breath later, by herself: the job's first words did not cut her.
    const arrival = sp.said.filter((x) => x.keys[0] === VOICE_CUES.arrival(floor)).at(-1)!;
    expect(arrival.how).toBe('ended');
    const quip = sp.said.find((x) => x.keys.includes(reply))!;
    expect(quip).toMatchObject({ keys: [reply], at: arrival.endedAt! + FOLLOW_GAP_MS, how: 'ended' });
    expect(sp.flat().filter((k) => k === reply)).toHaveLength(1);
    // Her new words were captioned after the job's while she spoke, and the job's own words are back.
    expect(shown).toContain(`${job} ${voiceLine(reply)!.text}`);
    expect(s.view().lifty.line).toBe(job);
  });

  it('another announcement taking the voice from the first: Lifty follows the last one, and never starts inside the hand-over', async () => {
    const time = virtualTime();
    const sp = timedSpeech(time, { ms: estimatedMs });
    const s = await openSession(tmp.file, time, { speech: sp.hook, instanceId });
    // The moment the job opens (the stop is still being named), the learner presses DOOR CLOSE: "Doors closing."
    let pressed = false;
    s.director.subscribe((v) => {
      if (pressed || v.stage !== 'task' || v.task?.stepId !== 'start-unknown') return;
      pressed = true;
      time.schedule(() => s.director.pressDoorClose(), 50);
    });
    await wake(s);
    for (let guard = 0; guard < 20 && s.view().task?.stepId !== 'start-unknown'; guard++) await answerCorrectly(s);
    await time.advance(15_000);
    const tail = sp.said.slice(-3);
    expect(tail.map((x) => [x.keys, x.how])).toEqual([
      [[VOICE_CUES.arrival(s.view().elevator.floor)], 'replaced'],
      [[VOICE_CUES.doorsClosing], 'ended'],
      [[reply], 'ended'],
    ]);
    expect(tail[2]!.at).toBe(tail[1]!.endedAt! + FOLLOW_GAP_MS);
    // The voice is free again afterwards: the next announcement is said.
    s.director.pressDoorOpen();
    expect(sp.now()).toEqual([VOICE_CUES.doorsOpening]);
  });

  it('a learner who waits hears the crew out at the call, then Lifty at the job', async () => {
    const time = virtualTime();
    const sp = timedSpeech(time, { ms: estimatedMs });
    const s = await openSession(tmp.file, time, { speech: sp.hook, instanceId, autoHallCalls: false });
    // Each hall call is taken twelve seconds after it is offered: after everything on the radio.
    let answering: number | null = null;
    s.director.subscribe((v) => {
      if (v.stage !== 'call' || v.hallCall === null || answering === v.hallCall) return;
      const floor = (answering = v.hallCall);
      time.schedule(() => {
        answering = null;
        if (s.view().stage === 'call' && s.view().hallCall === floor) s.director.pressFloor(floor);
      }, 12_000);
    });
    await wake(s);
    for (let guard = 0; guard < 20 && s.view().task?.stepId !== 'start-unknown'; guard++) await answerCorrectly(s);
    expect(s.view().task?.stepId).toBe('start-unknown');
    await time.advance(15_000);
    const call = sp.said.find((x) => x.keys.includes(crewBeat))!;
    expect(call).toMatchObject({ keys: [VOICE_CUES.hallCall, crewBeat], how: 'ended' });
    expect(sp.said.find((x) => x.keys.includes(reply))).toMatchObject({ keys: [reply], how: 'ended' });
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
