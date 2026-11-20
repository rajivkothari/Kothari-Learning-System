import { createAudioGate } from '../../elevator-quest/audio/audioGate';
import { EFFECT_SOURCES } from './effects';
import { GAME_SOURCES } from './games';
import { READING_SOURCES } from './reading';
import { VOICE_SOURCES } from './sources';
import { createKingdomPlayback } from './playback';
import { createLocalVoiceSources } from './localSources';
import { createRecordedClip, prepareAudio } from './clip';

/** The Comfort voice pace: every spoken clip a little slower, pitch kept. On unless Comfort turns it off (setting `kingdom.voice`). */
export const SLOW_VOICE = 0.88;
/** Speech: kingdom narration, Word Garden slots and game clips. Effects are everything else. */
const isSpeech = (key: string) => key.startsWith('voice:') || key.startsWith('slot:') || key.startsWith('game:');

export function createKingdomAudio() {
  const gate=createAudioGate();
  const local=createLocalVoiceSources();
  const sources:Record<string,number>={...VOICE_SOURCES,...EFFECT_SOURCES,...READING_SOURCES,...GAME_SOURCES};
  let rate=SLOW_VOICE;
  prepareAudio();
  const audio=createKingdomPlayback({
    isOpen:()=>gate.isOpen(), hasSource:key=>Object.hasOwn(sources,key), now:()=>Date.now(),
    start(key,finished){
      // Speech plays at one level and at the voice pace; effects sit under it and keep their own speed.
      const speech=isSpeech(key);
      return createRecordedClip(key.startsWith('voice:')?local.get(key)!:sources[key]!,speech?.65:key==='effect:retry'?.28:.48,finished,speech?rate:1);
    },
  });
  return {
    ...audio,
    /** The pace of every spoken clip from now on (SLOW_VOICE, or 1 for the recorded pace). The clip sounding now keeps its pace. */
    setVoiceRate(value:number){rate=Number.isFinite(value)?Math.min(1.25,Math.max(.5,value)):SLOW_VOICE;},
    voiceRate:()=>rate,
    /**
     * In the browser sound waits for a first touch. When it is waiting now, `fn` runs at that touch (the
     * gate's onOpen), so an ask that could not play can be said then. When sound is already allowed there
     * is nothing to wait for and `fn` never runs. Returns a cancel.
     */
    whenReady(fn:()=>void):()=>void{return gate.isOpen()?()=>undefined:gate.onOpen(fn);},
    release(){audio.release();local.release();},
  };
}
