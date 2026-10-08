// One-shot voice policy: which sound requests actually start a voice. Pure and deterministic
// (time is passed in), so the rules are tested without any audio device.
//
// - Per slot: a request within the slot's gapMs of its last start is dropped (rapid taps never pile up).
// - Per file: two slots that share a file never start it twice within ASSET_GAP_MS (no doubled, phasing copy).
// - Overall: at most MAX_ONE_SHOTS voices at once. A request over the cap is dropped, except an
//   essential one, which replaces the oldest non-essential voice (an arrival chime is never lost
//   behind four landing clicks).
// Dropped requests are never queued: a late sound is worse than no sound.

export const MAX_ONE_SHOTS = 4;
export const ASSET_GAP_MS = 120;
/** Shortest stop fade for a loop, so a loop never ends in a click. */
export const MIN_LOOP_FADE_MS = 80;

export interface VoiceRequest {
  slot: string;
  asset: string;
  /** Length of the file; the voice counts as sounding until it ends. */
  durationMs: number;
  essential: boolean;
  gapMs: number;
}

export type Admission = { play: true; voice: number; evict: number | null } | { play: false; reason: 'gap' | 'busy' };

export interface VoiceLimiter {
  admit(request: VoiceRequest, now: number): Admission;
  /** A voice stopped early (its player was paused or reused). */
  end(voice: number): void;
  sounding(now: number): number;
}

interface Voice {
  id: number;
  essential: boolean;
  startedAt: number;
  endsAt: number;
}

export function createVoiceLimiter(maxVoices = MAX_ONE_SHOTS): VoiceLimiter {
  const lastSlotStart = new Map<string, number>();
  const lastAssetStart = new Map<string, number>();
  let voices: Voice[] = [];
  let next = 1;
  const prune = (now: number) => (voices = voices.filter((v) => v.endsAt > now));

  return {
    admit(r, now) {
      prune(now);
      const slotAt = lastSlotStart.get(r.slot);
      if (slotAt !== undefined && now - slotAt < r.gapMs) return { play: false, reason: 'gap' };
      const assetAt = lastAssetStart.get(r.asset);
      if (assetAt !== undefined && now - assetAt < ASSET_GAP_MS) return { play: false, reason: 'gap' };
      let evict: number | null = null;
      if (voices.length >= maxVoices) {
        const victim = r.essential ? voices.filter((v) => !v.essential).sort((a, b) => a.startedAt - b.startedAt)[0] : undefined;
        if (!victim) return { play: false, reason: 'busy' };
        voices = voices.filter((v) => v !== victim);
        evict = victim.id;
      }
      const id = next++;
      voices.push({ id, essential: r.essential, startedAt: now, endsAt: now + Math.max(50, r.durationMs) });
      lastSlotStart.set(r.slot, now);
      lastAssetStart.set(r.asset, now);
      return { play: true, voice: id, evict };
    },
    end(voice) {
      voices = voices.filter((v) => v.id !== voice);
    },
    sounding(now) {
      return prune(now).length;
    },
  };
}

/** Players to keep for one file: enough for the overlaps its gap allows, never more than three. */
export function poolSizeFor(durationMs: number, gapMs: number): number {
  return Math.min(3, Math.max(1, Math.ceil(durationMs / Math.max(1, gapMs))));
}
