/** One local voice/effect at a time. Requests never wait for the gesture gate. */
export interface PlayingClip { stop(): void }
export interface PlaybackDependencies {
  isOpen(): boolean;
  hasSource(key: string): boolean;
  start(key: string, finished: () => void): PlayingClip;
  now(): number;
}
export function createKingdomPlayback(deps: PlaybackDependencies) {
  let enabled=false, released=false, serial=0, clip:PlayingClip|null=null;
  let speaking=false, lastEffect=-Infinity;
  const hush=()=>{serial++;speaking=false;const old=clip;clip=null;try{old?.stop();}catch{/* Optional audio never interrupts play. */}};
  const start=(key:string,voice:boolean)=>{
    hush();
    if(released || !enabled || !deps.isOpen() || !deps.hasSource(key))return false;
    const current=serial; speaking=voice;
    try{
      const next=deps.start(key,()=>{if(current===serial)hush();});
      if(current===serial)clip=next;else next.stop();
      return true;
    }catch{if(current===serial)hush();return false;}
  };
  return {
    setEnabled(value:boolean){enabled=value;if(!value)hush();},
    speak(text:string){return start(`voice:${text}`,true);},
    play(sound:string){
      if(speaking || released || !enabled || !deps.isOpen() || deps.now()-lastEffect<90)return false;
      lastEffect=deps.now();return start(`effect:${sound}`,false);
    },
    hush,
    release(){released=true;hush();},
  };
}
