import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { PlayingClip } from './playback';
export function prepareAudio(){void setAudioModeAsync({playsInSilentMode:true,shouldPlayInBackground:false,interruptionMode:'mixWithOthers'}).catch(()=>undefined);}
/** `rate` is the voice pace (1 = as recorded). Pitch is kept: a slower voice is not a lower one. */
export function createRecordedClip(source:number|{uri:string},volume:number,finished:()=>void,rate=1):PlayingClip {
  const player=createAudioPlayer(source);let listener:{remove():void}|null=null,stopped=false;
  const stop=()=>{if(stopped)return;stopped=true;listener?.remove();try{player.pause();}finally{player.remove();}};
  try{
    listener=player.addListener('playbackStatusUpdate',status=>{if(status.didJustFinish || status.error)finished();});player.volume=volume;
    // The pace is a comfort: a player that cannot change it still plays the clip.
    if(rate!==1){try{player.shouldCorrectPitch=true;player.setPlaybackRate(rate);}catch{/* As recorded. */}}
    player.play();
  }catch(error){stop();throw error;}
  return {stop};
}
