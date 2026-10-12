// A looping player for one bundled file (loop slots: ambience, travel, door motor). Native: an
// expo-audio player with loop on. expo-audio 57.0.5 (node_modules, checked 2026-10-12) loops on iOS by
// queueing the next copy of the item (AVQueuePlayer, actionAtItemEnd .advance) and on Android with
// ExoPlayer's REPEAT_MODE_ONE, both of which run straight on for a PCM WAV. Not checked on a device.
// The browser build plays loops through Web Audio instead (loopPlayer.web.ts): a looping <audio>
// element leaves about 9 ms of silence at every wrap (D194).
import { createAudioPlayer } from 'expo-audio';

export interface LoopPlayer {
  volume: number;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void> | void;
  remove(): void;
}

export function createLoopPlayer(source: number): LoopPlayer {
  const p = createAudioPlayer(source);
  p.loop = true;
  return p;
}
