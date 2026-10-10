import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { createAudioGate } from '../../elevator-quest/audio/audioGate';

// Reuse the project's recorded ElevenLabs effects. No network or new generation costs.
const sources = {
  place: require('../../../../assets/themes/elevator-quest/audio/elevenlabs-v2/el2-tile-place.wav'),
  remove: require('../../../../assets/themes/elevator-quest/audio/elevenlabs-v2/el2-tile-undo.wav'),
  success: require('../../../../assets/themes/elevator-quest/audio/elevenlabs-v1/el1-answer-right.wav'),
  retry: require('../../../../assets/themes/elevator-quest/audio/elevenlabs-v1/el1-answer-wrong.wav'),
  gift: require('../../../../assets/themes/elevator-quest/audio/elevenlabs-v1/el1-discovery.wav'),
};
export type KingdomSound = keyof typeof sources;
export function createKingdomEffects() {
  const gate = createAudioGate();
  let enabled = false, released = false, last = -Infinity, player: AudioPlayer | null = null;
  const stop = () => { if (player) { try { player.pause(); player.remove(); } catch { /* Optional sound never interrupts a save. */ } player=null; } };
  void setAudioModeAsync({playsInSilentMode:true,shouldPlayInBackground:false,interruptionMode:'mixWithOthers'}).catch(()=>undefined);
  return {
    setEnabled(value: boolean) { enabled=value; if(!value) stop(); },
    play(sound: KingdomSound) {
      const now=Date.now();
      if(released || !enabled || !gate.isOpen() || now-last<90) return;
      last=now; stop();
      try { player=createAudioPlayer(sources[sound]);player.volume=sound==='retry'?.28:.48;player.play(); } catch { stop(); }
    },
    release() { released=true;stop(); },
  };
}
