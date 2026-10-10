import { createAudioGate } from '../../elevator-quest/audio/audioGate';
import { EFFECT_SOURCES } from './effects';
import { VOICE_SOURCES } from './sources';
import { createKingdomPlayback } from './playback';
import { createLocalVoiceSources } from './localSources';
import { createRecordedClip, prepareAudio } from './clip';

export function createKingdomAudio() {
  const gate=createAudioGate();
  const local=createLocalVoiceSources();
  const sources:Record<string,number>={...VOICE_SOURCES,...EFFECT_SOURCES};
  prepareAudio();
  const audio=createKingdomPlayback({
    isOpen:()=>gate.isOpen(), hasSource:key=>Object.hasOwn(sources,key), now:()=>Date.now(),
    start(key,finished){
      return createRecordedClip(key.startsWith('voice:')?local.get(key)!:sources[key]!,key.startsWith('voice:')?.65:key==='effect:retry'?.28:.48,finished);
    },
  });
  return {...audio,release(){audio.release();local.release();}};
}
