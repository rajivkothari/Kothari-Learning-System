// Browser loops through Web Audio (D194). A looping <audio> element (expo-audio's web player) leaves
// about 9 ms of digital silence at every wrap, measured in Chromium: a click in a hum. An
// AudioBufferSourceNode with loop on wraps sample-accurately. The file is the bundled asset the page
// already serves (same origin, nothing from the network); it is fetched and decoded once per player.
// Until it is decoded, play() is remembered and starts the loop as soon as it can.
import { Asset } from 'expo-asset';

import type { LoopPlayer } from './loopPlayer';

let shared: AudioContext | null = null;
const context = () => (shared ??= new AudioContext());

export function createLoopPlayer(source: number): LoopPlayer {
  const ctx = context();
  const gain = ctx.createGain();
  gain.gain.value = 1;
  gain.connect(ctx.destination);
  let buffer: AudioBuffer | null = null;
  let node: AudioBufferSourceNode | null = null;
  let wanted = false;
  let removed = false;
  /** Where in the file to start next (seconds), and when the running node started. */
  let offset = 0;
  let startedAt = 0;
  let volume = 1;

  const start = () => {
    if (!buffer || node || removed) return;
    void ctx.resume().catch(() => undefined);
    const n = ctx.createBufferSource();
    n.buffer = buffer;
    n.loop = true;
    n.connect(gain);
    n.start(0, offset % buffer.duration);
    startedAt = ctx.currentTime - (offset % buffer.duration);
    node = n;
  };
  const halt = () => {
    if (!node) return;
    if (buffer) offset = (ctx.currentTime - startedAt) % buffer.duration;
    try {
      node.stop();
    } catch {
      // already stopped
    }
    node.disconnect();
    node = null;
  };

  const uri = Asset.fromModule(source).uri;
  void fetch(uri)
    .then((r) => r.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then((decoded) => {
      buffer = decoded;
      if (wanted) start();
    })
    .catch(() => undefined);

  return {
    get volume() {
      return volume;
    },
    set volume(v: number) {
      volume = v;
      // A short ramp, so the engine's 40 ms fade steps never step audibly.
      gain.gain.setTargetAtTime(v, ctx.currentTime, 0.012);
    },
    play() {
      wanted = true;
      start();
    },
    pause() {
      wanted = false;
      halt();
    },
    seekTo(seconds: number) {
      const playing = node !== null;
      halt();
      offset = seconds;
      if (playing) start();
    },
    remove() {
      wanted = false;
      halt();
      removed = true;
      gain.disconnect();
    },
  };
}
