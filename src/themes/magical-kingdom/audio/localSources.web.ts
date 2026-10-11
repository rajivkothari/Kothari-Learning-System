import { Asset } from 'expo-asset';
import { VOICE_SOURCES } from './sources';

/** Warm local export assets without playback. Blobs support offline play after page load. */
export function createLocalVoiceSources() {
  const cached:Record<string,number|{uri:string}>={...VOICE_SOURCES};
  const pending=Object.entries(VOICE_SOURCES),urls:string[]=[];
  const abort=new AbortController();let released=false;
  const worker=async()=>{
    while(!released && pending.length){
      const [key,module]=pending.shift()!;
      try{
        const uri=new URL(Asset.fromModule(module).uri,globalThis.location.href);
        if(uri.origin!==globalThis.location.origin)continue;
        const response=await fetch(uri.href,{signal:abort.signal});if(!response.ok)continue;
        const blob=await response.blob();if(released)return;
        const url=URL.createObjectURL(blob);urls.push(url);cached[key]={uri:url};
      }catch{/* Text and gestures remain usable when an optional clip cannot load. */}
    }
  };
  for(let i=0;i<4;i++)void worker();
  return {get:(key:string)=>cached[key],release:()=>{released=true;abort.abort();for(const url of urls)URL.revokeObjectURL(url);}};
}
