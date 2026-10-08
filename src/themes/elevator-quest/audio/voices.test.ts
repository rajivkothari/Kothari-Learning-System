// The one-shot voice policy: rapid taps never pile up, an essential cue is never lost, nothing is queued.
import { ELEVENLABS_V1, SLOT_SPECS, type SoundSlot } from './profile';
import { ASSET_GAP_MS, MAX_ONE_SHOTS, createVoiceLimiter, poolSizeFor, type VoiceRequest } from './voices';

const req = (slot: SoundSlot, durationMs = 600): VoiceRequest => ({ slot, asset: ELEVENLABS_V1.slots[slot]!.asset, durationMs, essential: SLOT_SPECS[slot].essential, gapMs: SLOT_SPECS[slot].gapMs });

describe('one-shot voice policy', () => {
  it('a slot cannot restart inside its gap: twenty taps in a second start only a few sounds', () => {
    const v = createVoiceLimiter();
    let started = 0;
    for (let t = 0; t < 1000; t += 50) if (v.admit(req('toolboxOpen', 100), t).play) started += 1;
    expect(started).toBe(Math.ceil(1000 / SLOT_SPECS.toolboxOpen.gapMs));
  });

  it('a right answer, a wrong answer and a discovery each sound once even when asked twice', () => {
    for (const slot of ['answerRight', 'answerWrong', 'discovery', 'golfPutt'] as const) {
      const v = createVoiceLimiter();
      expect(v.admit(req(slot), 0).play).toBe(true);
      expect(v.admit(req(slot), 16).play).toBe(false);
      expect(v.admit(req(slot), SLOT_SPECS[slot].gapMs).play).toBe(true);
    }
  });

  it('two slots sharing a file never start it twice at once', () => {
    const v = createVoiceLimiter();
    expect(v.admit(req('answerWrong'), 0).play).toBe(true);
    // overloadTone uses the same file as answerWrong in the generated pack
    expect(v.admit({ ...req('overloadTone'), asset: ELEVENLABS_V1.slots.answerWrong!.asset }, 10).play).toBe(false);
    expect(v.admit({ ...req('overloadTone'), asset: ELEVENLABS_V1.slots.answerWrong!.asset }, ASSET_GAP_MS).play).toBe(true);
  });

  it(`no more than ${MAX_ONE_SHOTS} one-shots sound at once; extra non-essential ones are dropped, not queued`, () => {
    const v = createVoiceLimiter();
    const things: SoundSlot[] = ['toolboxOpen', 'fanStart', 'gearTurn', 'springBoing', 'windmillTurn', 'radioStatic', 'craneLower'];
    const started = things.filter((slot, i) => v.admit(req(slot, 1000), i * 10).play);
    expect(started).toHaveLength(MAX_ONE_SHOTS);
    expect(v.sounding(100)).toBe(MAX_ONE_SHOTS);
    // Nothing waits: once they have ended, a dropped sound does not appear by itself.
    expect(v.sounding(2000)).toBe(0);
    expect(v.admit(req('bookOpen', 500), 2000).play).toBe(true);
  });

  it('an essential cue replaces the oldest non-essential voice instead of being lost', () => {
    const v = createVoiceLimiter();
    const first = v.admit(req('toolboxOpen', 2000), 0);
    for (const [i, slot] of (['fanStart', 'gearTurn', 'springBoing'] as const).entries()) v.admit(req(slot, 2000), 10 + i);
    const chime = v.admit(req('arrivalChime', 1800), 50);
    expect(chime.play).toBe(true);
    expect(chime.play && chime.evict).toBe(first.play ? first.voice : -1);
    expect(v.sounding(60)).toBe(MAX_ONE_SHOTS);
  });

  it('a voice that stops early frees its place', () => {
    const v = createVoiceLimiter(1);
    const a = v.admit(req('toolboxOpen', 5000), 0);
    expect(v.admit(req('fanStart', 500), 300).play).toBe(false);
    if (a.play) v.end(a.voice);
    expect(v.admit(req('fanStart', 500), 400).play).toBe(true);
  });

  it('keeps few players per file: enough for the overlaps its gap allows, at most three', () => {
    expect(poolSizeFor(365, SLOT_SPECS.floorButtonPress.gapMs)).toBe(3);
    expect(poolSizeFor(600, SLOT_SPECS.answerRight.gapMs)).toBe(1);
    expect(poolSizeFor(5000, 1)).toBe(3);
  });
});
