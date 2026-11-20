// The mix under speech: effects and ambience step back while a voice speaks; taps and speech do not;
// the voice volume scales everything spoken. Pure: the engine applies it (audioEngine.test.tsx).
import { DEFAULT_AUDIO, DUCK_UNDER_SPEECH, gainFor, narrationGain, voiceVolume } from './mix';
import { ELEVENLABS_V1, SLOT_SPECS, SOUND_SLOTS } from './profile';

describe('ducking under speech', () => {
  it('the ambient bed steps back most, the machinery and stingers a little, taps not at all', () => {
    expect(DUCK_UNDER_SPEECH.ambient).toBeLessThan(DUCK_UNDER_SPEECH.elevator);
    expect(DUCK_UNDER_SPEECH.elevator).toBeLessThan(1);
    expect(DUCK_UNDER_SPEECH.music).toBeLessThan(1);
    expect(DUCK_UNDER_SPEECH.interface).toBe(1);
    expect(DUCK_UNDER_SPEECH.dialogue).toBe(1);
  });

  it('every slot is the same or quieter under speech, never louder; a tap is unchanged', () => {
    for (const slot of SOUND_SLOTS) {
      const plain = gainFor(ELEVENLABS_V1, slot, DEFAULT_AUDIO);
      const ducked = gainFor(ELEVENLABS_V1, slot, DEFAULT_AUDIO, true);
      expect({ slot, quieter: ducked <= plain }).toEqual({ slot, quieter: true });
      if (SLOT_SPECS[slot].category === 'interface') expect(ducked).toBe(plain);
    }
    expect(gainFor(ELEVENLABS_V1, 'ambientMachinery', DEFAULT_AUDIO, true)).toBeCloseTo(gainFor(ELEVENLABS_V1, 'ambientMachinery', DEFAULT_AUDIO) * DUCK_UNDER_SPEECH.ambient, 2);
    expect(gainFor(ELEVENLABS_V1, 'floorButtonPress', DEFAULT_AUDIO, true)).toBe(gainFor(ELEVENLABS_V1, 'floorButtonPress', DEFAULT_AUDIO));
  });

  it('mute is still silence under speech', () => {
    for (const slot of SOUND_SLOTS) expect(gainFor(ELEVENLABS_V1, slot, { output: 'muted', effects: 1 }, true)).toBe(0);
  });
});

describe('voice volume', () => {
  it('scales everything spoken, within 0..1, and defaults to full', () => {
    expect(voiceVolume({ output: 'normal', effects: 1 })).toBe(1);
    expect(narrationGain({ ...DEFAULT_AUDIO, voice: 0.5 })).toBeCloseTo(narrationGain(DEFAULT_AUDIO) * 0.5, 3);
    expect(narrationGain({ ...DEFAULT_AUDIO, voice: 0 })).toBe(0);
    expect(narrationGain({ ...DEFAULT_AUDIO, voice: 4 })).toBe(narrationGain(DEFAULT_AUDIO));
    expect(narrationGain({ ...DEFAULT_AUDIO, output: 'muted', voice: 1 })).toBe(0);
  });

  it('does not touch the effects: the effects volume and the voice volume are separate dials', () => {
    expect(gainFor(ELEVENLABS_V1, 'arrivalChime', { ...DEFAULT_AUDIO, voice: 0 })).toBe(gainFor(ELEVENLABS_V1, 'arrivalChime', DEFAULT_AUDIO));
  });
});
