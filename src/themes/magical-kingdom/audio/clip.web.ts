import { Asset } from 'expo-asset';
import type { PlayingClip } from './playback';
export function prepareAudio(){}
export function createRecordedClip(source:number|{uri:string},volume:number,finished:()=>void):PlayingClip {
  const uri=typeof source==='object'?source.uri:Asset.fromModule(source).uri;
  const audio=new Audio(uri);let stopped=false;
  const complete=()=>{if(!stopped)finished();};
  audio.volume=volume;audio.addEventListener('ended',complete);audio.addEventListener('error',complete);
  const stop=()=>{if(stopped)return;stopped=true;audio.removeEventListener('ended',complete);audio.removeEventListener('error',complete);audio.pause();audio.removeAttribute('src');audio.load();};
  // A deliberate pause can reject a pending play promise. Handle it before stop can run.
  try{void audio.play().catch(complete);}catch(error){stop();throw error;}
  return {stop};
}
