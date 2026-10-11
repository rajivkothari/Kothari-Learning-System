import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { PlayingClip } from './playback';
export function prepareAudio(){void setAudioModeAsync({playsInSilentMode:true,shouldPlayInBackground:false,interruptionMode:'mixWithOthers'}).catch(()=>undefined);}
export function createRecordedClip(source:number|{uri:string},volume:number,finished:()=>void):PlayingClip {
  const player=createAudioPlayer(source);let listener:{remove():void}|null=null,stopped=false;
  const stop=()=>{if(stopped)return;stopped=true;listener?.remove();try{player.pause();}finally{player.remove();}};
  try{listener=player.addListener('playbackStatusUpdate',status=>{if(status.didJustFinish || status.error)finished();});player.volume=volume;player.play();}catch(error){stop();throw error;}
  return {stop};
}
