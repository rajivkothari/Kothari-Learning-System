// Elevator Quest's voice script (content/themes/elevator-quest/voice.json) is content: schema-validated,
// every stop announced by the name the game shows, every reused line word for word the same as its copy.
import voiceJson from '../../../content/themes/elevator-quest/voice.json';
import { FLOOR15, LINES, line } from '../elevator-quest/content/floor15';
import { BASEMENT, LANDINGS, landingFor } from '../elevator-quest/content/landings';
import { MAX_CHARS, VOICE, VOICE_CONTEXT, VOICE_CUES, VOICE_KEYS, announcement, floorWord, spokenName, validateVoiceScript, voiceKey, voiceLine } from '../elevator-quest/content/voice';

const codes = (raw: unknown) => validateVoiceScript(raw, VOICE_CONTEXT).issues.map((i) => i.code);
const edit = (f: (c: typeof voiceJson) => void) => {
  const c = structuredClone(voiceJson);
  f(c);
  return c;
};
const byId = (c: typeof voiceJson, id: string) => c.lines.find((l) => l.id === id)!;

describe('voice script', () => {
  it('is valid against the landings, the Floor 15 copy and the mission', () => {
    expect(validateVoiceScript(voiceJson, VOICE_CONTEXT).issues).toEqual([]);
  });

  it('has the three voices and only them, each line under its role', () => {
    expect(Object.keys(VOICE.roles).sort()).toEqual(['crew', 'elevator', 'lifty']);
    for (const l of VOICE.lines) expect(l.id.split('.')[0]).toBe(l.role);
  });

  it('announces all 21 stops, each by the floor number as a word and the name the game shows', () => {
    const arrivals = VOICE.lines.filter((l) => l.moment === 'arrival');
    expect(arrivals).toHaveLength(21);
    for (let floor = FLOOR15.floors.min; floor <= FLOOR15.floors.max; floor++) {
      const l = arrivals.find((a) => a.floor === floor)!;
      const shown = landingFor(LANDINGS, floor, { restored: () => true }).name;
      const [num, name] = l.text.replace(/\.$/, '').split('. ');
      expect(num).toBe(`Floor ${floorWord(floor)}`);
      // The sign says it in capitals; the voice says the same words.
      expect(name!.toUpperCase()).toBe(shown);
      expect(VOICE_CUES.arrival(floor)).toBe(voiceKey(l.id));
    }
    expect(VOICE.lines.find((l) => l.id === 'elevator.floor15')!.text).toBe('Floor fifteen. Primary Power.');
    expect(VOICE.lines.find((l) => l.place === BASEMENT)!.text).toBe('Basement one. Bowling.');
    expect(VOICE_CUES.arrival(BASEMENT)).toBe('voice.elevator.b1');
  });

  it('a line that reuses existing copy says exactly its words, so text and voice match', () => {
    const reused = VOICE.lines.filter((l) => l.onScreen === 'copy');
    expect(reused.length).toBeGreaterThanOrEqual(8);
    for (const l of reused) expect({ id: l.id, words: l.text }).toEqual({ id: l.id, words: line(l.copy!) });
    // Spot checks against what the director actually shows.
    expect(voiceLine(VOICE_CUES.intro!)!.text).toBe(LINES.intro);
    expect(voiceLine(VOICE_CUES.restored!)!.text).toBe(LINES.complete);
    expect(voiceLine(VOICE_CUES.rank!)!.text).toBe(LINES.rankEarned);
  });

  it('new words are short, never the only carrier (a caption shows them), and the announcer is the only voice the world alone explains', () => {
    for (const l of VOICE.lines) {
      expect(l.text.length).toBeLessThanOrEqual(MAX_CHARS[l.role]);
      if (l.role !== 'elevator') expect(['copy', 'caption']).toContain(l.onScreen);
    }
    expect(VOICE.lines.filter((l) => l.role === 'crew').every((l) => l.onScreen === 'caption')).toBe(true);
  });

  it('the director finds a line for every moment it plays', () => {
    const singles = [VOICE_CUES.depart('up'), VOICE_CUES.depart('down'), VOICE_CUES.express, VOICE_CUES.doorsOpening, VOICE_CUES.doorsClosing, VOICE_CUES.overload, VOICE_CUES.hallCall, VOICE_CUES.coldOpen, VOICE_CUES.intro, VOICE_CUES.wake, VOICE_CUES.crewFinale, VOICE_CUES.finale, VOICE_CUES.restored, VOICE_CUES.crewRestored, VOICE_CUES.rank, VOICE_CUES.rankAgain, VOICE_CUES.freeRide, VOICE_CUES.basementAside];
    for (const k of singles) expect(k).toMatch(/^voice\.(elevator|lifty|crew)\./);
    expect(VOICE_CUES.hallCallRadio.length).toBeGreaterThanOrEqual(1);
    // Three or four crew beats across the jobs, each opening a step of the mission.
    const beats = VOICE.lines.filter((l) => l.moment === 'crewBeat');
    expect(beats.length).toBeGreaterThanOrEqual(3);
    expect(beats.length).toBeLessThanOrEqual(4);
    for (const b of beats) expect(VOICE_CUES.beat(b.step!)[0]).toBe(voiceKey(b.id));
    expect(new Set(VOICE_KEYS).size).toBe(VOICE.lines.length);
  });

  it('builds announcements from the game names', () => {
    expect(spokenName('ROOFTOP GOLF')).toBe('Rooftop Golf');
    expect(announcement(7, 'PLATFORM HEIGHTS')).toBe('Floor seven. Platform Heights.');
    expect(announcement(BASEMENT, 'BOWLING')).toBe('Basement one. Bowling.');
  });

  it('rejects a wrong floor name, a missing stop, copy that drifted, and an uncaptioned story line', () => {
    expect(codes(edit((c) => (byId(c, 'elevator.floor15').text = 'Floor fifteen. Power Room.')))).toContain('voice.arrivalWords');
    expect(codes(edit((c) => (byId(c, 'elevator.floor3').text = 'Floor 3. Utility.')))).toContain('voice.arrivalWords');
    expect(codes(edit((c) => (c.lines = c.lines.filter((l) => l.id !== 'elevator.floor9'))))).toContain('voice.arrivalCount');
    expect(codes(edit((c) => (c.lines = c.lines.filter((l) => l.id !== 'elevator.b1'))))).toContain('voice.arrivalCount');
    expect(codes(edit((c) => (byId(c, 'lifty.intro').text = 'The power is down on Floor 15.')))).toContain('voice.copyMismatch');
    expect(codes(edit((c) => (byId(c, 'lifty.intro').copy = 'noSuchLine')))).toContain('voice.copyUnknown');
    expect(codes(edit((c) => (byId(c, 'crew.call1').onScreen = 'world')))).toContain('voice.uncaptioned');
  });

  it('rejects generic praise, placeholders, long lines, protected names, duplicates and misplaced roles', () => {
    expect(codes(edit((c) => (byId(c, 'crew.restored').text = 'Great job, engineer!')))).toContain('voice.genericPraise');
    expect(codes(edit((c) => (byId(c, 'crew.call2').text = 'Lift, come to Floor {floor}.')))).toContain('voice.placeholder');
    expect(codes(edit((c) => (byId(c, 'elevator.goingUp').text = 'Going up now, everybody, please stand clear of the doors.')))).toContain('voice.tooLong');
    expect(codes(edit((c) => (byId(c, 'crew.call3').text = 'Crew here. Like a Lego tower up here.')))).toContain('voice.protectedName');
    expect(codes(edit((c) => c.lines.push({ ...c.lines[0]! })))).toContain('voice.duplicateId');
    expect(codes(edit((c) => (byId(c, 'crew.call1').role = 'lifty')))).toEqual(expect.arrayContaining(['voice.idRole', 'voice.momentRole']));
    expect(codes(edit((c) => (byId(c, 'crew.beatClose').step = 'no-such-step')))).toContain('voice.beatStep');
    expect(codes(edit((c) => ((byId(c, 'crew.call1') as Record<string, unknown>).volume = 11)))[0]).toMatch(/^schema\./);
  });
});
