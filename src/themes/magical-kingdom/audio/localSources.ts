import { VOICE_SOURCES } from './sources';
export function createLocalVoiceSources() {
  return {get:(key:string)=>VOICE_SOURCES[key],release:()=>{}};
}
