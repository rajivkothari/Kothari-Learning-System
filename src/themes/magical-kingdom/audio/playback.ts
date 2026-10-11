/** One local voice/effect at a time. Requests never wait for the gesture gate. */
export interface PlayingClip { stop(): void }
export interface PlaybackDependencies {
  isOpen(): boolean;
  hasSource(key: string): boolean;
  start(key: string, finished: () => void): PlayingClip;
  now(): number;
  /** Timer for the gap between chained clips (default setTimeout). */
  wait?(ms: number, fn: () => void): void;
}
export function createKingdomPlayback(deps: PlaybackDependencies) {
  let enabled=false, released=false, serial=0, clip:PlayingClip|null=null;
  let speaking=false, lastEffect=-Infinity;
  const hush=()=>{serial++;speaking=false;const old=clip;clip=null;try{old?.stop();}catch{/* Optional audio never interrupts play. */}};
  const wait=deps.wait??((ms:number,fn:()=>void)=>{setTimeout(fn,ms);});
  const start=(key:string,voice:boolean,then?:()=>void)=>{
    hush();
    if(released || !enabled || !deps.isOpen() || !deps.hasSource(key))return false;
    const current=serial; speaking=voice;
    try{
      const next=deps.start(key,()=>{if(current===serial){hush();then?.();}});
      if(current===serial)clip=next;else next.stop();
      return true;
    }catch{if(current===serial)hush();return false;}
  };
  return {
    setEnabled(value:boolean){enabled=value;if(!value)hush();},
    speak(text:string){return start(`voice:${text}`,true);},
    /** A Word Garden slot (sound, word, line). Unrecorded slots are silent. */
    slot(key:string){return start(`slot:${key}`,true);},
    /**
     * Full keys (`slot:…`, `effect:…`) one after another, `gapMs` apart. Unrecorded keys are skipped.
     * Any new request, hush or mute ends the chain.
     */
    sequence(keys:readonly string[],gapMs=250){
      const list=keys.filter((k)=>deps.hasSource(k));
      if(!list.length){hush();return false;}
      const run=(i:number):boolean=>start(list[i]!,!list[i]!.startsWith('effect:'),i+1<list.length?()=>{const s=serial;wait(gapMs,()=>{if(s===serial)run(i+1);});}:undefined);
      return run(0);
    },
    play(sound:string){
      if(speaking || released || !enabled || !deps.isOpen() || deps.now()-lastEffect<90)return false;
      lastEffect=deps.now();return start(`effect:${sound}`,false);
    },
    hush,
    release(){released=true;hush();},
  };
}
