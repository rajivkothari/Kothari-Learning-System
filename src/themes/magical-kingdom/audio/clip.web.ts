import { Asset } from 'expo-asset';
import type { PlayingClip } from './playback';
export function prepareAudio(){}
/**
 * `rate` is the voice pace (1 = as recorded). Pitch is kept: a slower voice is not a lower one.
 * `finished(played)`: true when the clip sounded to its end; false when it could not (a load or decode error, a
 * play the browser refused). A clip that failed was not heard, and must never be reported as played out.
 */
export function createRecordedClip(source:number|{uri:string},volume:number,finished:(played:boolean)=>void,rate=1):PlayingClip {
  const uri=typeof source==='object'?source.uri:Asset.fromModule(source).uri;
  const audio=new Audio(uri);let stopped=false;
  const complete=()=>{if(!stopped)finished(true);};
  const failed=()=>{if(!stopped)finished(false);};
  audio.volume=volume;audio.addEventListener('ended',complete);audio.addEventListener('error',failed);
  if(rate!==1){
    // Browsers keep pitch by default; say so, with the prefixed names older engines used.
    const paced=audio as HTMLAudioElement&{mozPreservesPitch?:boolean;webkitPreservesPitch?:boolean};
    paced.preservesPitch=true;paced.mozPreservesPitch=true;paced.webkitPreservesPitch=true;
    // Loading a source resets playbackRate to defaultPlaybackRate, so set both.
    audio.defaultPlaybackRate=rate;audio.playbackRate=rate;
  }
  const stop=()=>{if(stopped)return;stopped=true;audio.removeEventListener('ended',complete);audio.removeEventListener('error',failed);audio.pause();audio.removeAttribute('src');audio.load();};
  // A deliberate pause can reject a pending play promise. Handle it before stop can run.
  try{void audio.play().catch(failed);}catch(error){stop();throw error;}
  return {stop};
}
