import { createKingdomPlayback } from './playback';

function setup(){
  let open=true,time=0,active=0,max=0;
  const calls:{key:string;finish:()=>void;stop:jest.Mock}[]=[];let live=0;
  const audio=createKingdomPlayback({isOpen:()=>open,hasSource:key=>!key.includes('missing'),now:()=>time,start(key,finish){active++;max=Math.max(max,active);if(!key.startsWith('effect:'))live++;let stopped=false;const stop=jest.fn(()=>{if(!stopped){active--;if(!key.startsWith('effect:'))live--;stopped=true;}});calls.push({key,finish:()=>finish(true),stop});return {stop};}});
  audio.setEnabled(true);
  return {audio,calls,gate:(value:boolean)=>{open=value;},tick:()=>{time+=100;},active:()=>active,max:()=>max,voices:()=>live};
}
test('drops pre-gesture requests without replaying them when the gate opens',()=>{const s=setup();s.gate(false);expect(s.audio.speak('hello')).toBe(false);expect(s.audio.play('place')).toBe(false);s.gate(true);expect(s.calls).toHaveLength(0);expect(s.audio.speak('hello')).toBe(true);});
test('rapid speech replaces the old clip and ignores its late finish',()=>{const s=setup();s.audio.speak('hello');s.audio.speak('next');expect(s.calls[0]!.stop).toHaveBeenCalledTimes(1);s.calls[0]!.finish();expect(s.active()).toBe(1);s.calls[1]!.finish();expect(s.active()).toBe(0);expect(s.max()).toBe(1);});
test('an effect has its own channel: a voice that starts after it does not cut it; effects are refused while the voice speaks',()=>{
  const s=setup();
  // The tap's tick, then at once the voice that answers the tap: both sound, the tick is not stopped.
  expect(s.audio.play('place')).toBe(true);s.audio.speak('hello');
  expect(s.calls[0]!.stop).not.toHaveBeenCalled();expect([s.active(),s.voices()]).toEqual([2,1]);
  // While the voice speaks no new effect starts.
  s.tick();expect(s.audio.play('place')).toBe(false);
  // The tick ends by itself under the voice; the voice goes on.
  s.calls[0]!.finish();expect([s.active(),s.voices(),s.audio.busy()]).toEqual([1,1,true]);
  s.calls[1]!.finish();expect(s.audio.busy()).toBe(false);
  // One effect at a time: a newer one replaces the older. A sequence does not cut it either.
  s.tick();expect(s.audio.play('place')).toBe(true);s.tick();expect(s.audio.play('remove')).toBe(true);
  expect(s.calls[2]!.stop).toHaveBeenCalledTimes(1);
  s.audio.sequence(['effect:success','game:a']);expect(s.calls[3]!.stop).not.toHaveBeenCalled();
  // Sound off, hush and release cut the effect too.
  s.audio.setEnabled(false);expect(s.calls[3]!.stop).toHaveBeenCalledTimes(1);expect(s.active()).toBe(0);
  s.audio.setEnabled(true);s.tick();s.audio.play('place');s.audio.hush();expect(s.active()).toBe(0);
  s.tick();s.audio.play('place');s.audio.release();expect(s.active()).toBe(0);
  // An unrecorded effect and a late finish of a replaced one do nothing.
  const t=setup();expect(t.audio.play('missing')).toBe(false);t.tick();t.audio.play('place');t.tick();t.audio.play('remove');t.calls[0]!.finish();expect(t.audio.busy()).toBe(true);t.calls[1]!.finish();expect(t.audio.busy()).toBe(false);
});
test('mute stops immediately and drops new requests',()=>{const s=setup();s.audio.speak('hello');s.audio.setEnabled(false);expect(s.active()).toBe(0);expect(s.audio.speak('hello')).toBe(false);expect(s.audio.play('place')).toBe(false);s.audio.setEnabled(true);expect(s.calls).toHaveLength(1);});
test('hush and release clean resources; released audio cannot restart',()=>{const s=setup();s.audio.speak('hello');s.audio.hush();s.audio.speak('next');s.audio.release();s.audio.setEnabled(true);expect(s.audio.speak('hello')).toBe(false);expect(s.active()).toBe(0);});
test('unknown text stops old audio and has no fallback or service request',()=>{const s=setup();s.audio.speak('hello');expect(s.audio.speak('missing')).toBe(false);expect(s.calls).toHaveLength(1);expect(s.active()).toBe(0);});
test('decoder/start errors remain optional and allow later audio',()=>{let fail=true;const stop=jest.fn();const audio=createKingdomPlayback({isOpen:()=>true,hasSource:()=>true,now:()=>0,start(){if(fail)throw Error('decode');return {stop};}});audio.setEnabled(true);expect(audio.speak('hello')).toBe(false);fail=false;expect(audio.speak('hello')).toBe(true);audio.release();expect(stop).toHaveBeenCalledTimes(1);});
test('a synchronous completion cannot leave a stale active clip',()=>{const stop=jest.fn();const audio=createKingdomPlayback({isOpen:()=>true,hasSource:()=>true,now:()=>0,start(_,finish){finish(true);return {stop};}});audio.setEnabled(true);audio.speak('hello');expect(stop).toHaveBeenCalledTimes(1);audio.release();expect(stop).toHaveBeenCalledTimes(1);});
test('a sequence plays its recorded keys in order, skips missing ones, and any new request ends it',()=>{
  const timers:(()=>void)[]=[];const keys:string[]=[];const finishes:(()=>void)[]=[];
  const audio=createKingdomPlayback({isOpen:()=>true,hasSource:k=>!k.includes('missing'),now:()=>0,wait:(_ms,fn)=>{timers.push(fn);},start(key,finish){keys.push(key);finishes.push(()=>finish(true));return {stop:()=>undefined};}});
  audio.setEnabled(true);
  expect(audio.sequence(['slot:a','slot:missing','effect:b','slot:c'])).toBe(true);
  finishes[0]!();timers.shift()!();finishes[1]!();timers.shift()!();
  expect(keys).toEqual(['slot:a','effect:b','slot:c']);
  audio.sequence(['slot:x','slot:y']);finishes[3]!();audio.slot('z');timers.shift()!();
  expect(keys).toEqual(['slot:a','effect:b','slot:c','slot:x','slot:z']);
  expect(audio.sequence(['slot:missing'])).toBe(false);
});

/** A playback whose clips and gap timers the test finishes by hand. */
function chain(){
  let open=true,active=0,max=0,time=0,fail:string|null=null;
  const timers:(()=>void)[]=[];const keys:string[]=[];const finishes:((played:boolean)=>void)[]=[];
  const audio=createKingdomPlayback({isOpen:()=>open,hasSource:k=>!k.includes('missing'),now:()=>time,wait:(_ms,fn)=>{timers.push(fn);},start(key,finish){if(key===fail)throw Error('decode');active++;max=Math.max(max,active);keys.push(key);let stopped=false;finishes.push(finish);return {stop(){if(!stopped){stopped=true;active--;}}};}});
  audio.setEnabled(true);
  const ends:boolean[]=[];
  return {audio,keys,ends,end:(ok:boolean)=>{ends.push(ok);},finish:(i=finishes.length-1)=>finishes[i]!(true),refuse:(i=finishes.length-1)=>finishes[i]!(false),gap:()=>timers.shift()!(),gaps:()=>timers.length,gate:(v:boolean)=>{open=v;},tick:(ms=100)=>{time+=ms;},failOn:(k:string|null)=>{fail=k;},active:()=>active,max:()=>max};
}
test('a sequence reports true exactly once, when its last clip finishes by itself',()=>{
  const s=chain();
  expect(s.audio.sequence(['game:a','game:missing','game:b','slot:missing'],400,s.end)).toBe(true);
  s.finish();expect(s.ends).toEqual([]);s.gap();
  expect(s.keys).toEqual(['game:a','game:b']);
  s.finish();expect(s.ends).toEqual([true]);
  // A repeated finish from the player, or a later hush, reports nothing more.
  s.finish();s.finish(0);s.audio.hush();s.audio.release();
  expect(s.ends).toEqual([true]);expect(s.gaps()).toBe(0);
});
test('a sequence that is cut reports false exactly once: a new request, hush, mute, release',()=>{
  const cuts:((s:ReturnType<typeof chain>)=>void)[]=[s=>{s.audio.speak('hello');},s=>{s.audio.slot('word:cat');},s=>{s.audio.sequence(['game:z']);},s=>{s.audio.hush();},s=>{s.audio.setEnabled(false);},s=>{s.audio.release();}];
  for(const cut of cuts)for(const inGap of [false,true]){
    const s=chain();s.audio.sequence(['game:a','game:b'],400,s.end);
    if(inGap)s.finish();
    cut(s);expect(s.ends).toEqual([false]);
    // The gap timer of the cut sequence, a late finish and another hush do nothing.
    if(inGap)s.gap();s.finish(0);s.audio.hush();
    expect(s.ends).toEqual([false]);expect(s.keys.filter(k=>k==='game:b')).toEqual([]);expect(s.max()).toBe(1);
  }
});
test('a sequence that cannot play reports false at once, before it returns false',()=>{
  const nothing=chain();expect(nothing.audio.sequence(['game:missing','slot:missing'],400,nothing.end)).toBe(false);expect(nothing.ends).toEqual([false]);
  const empty=chain();expect(empty.audio.sequence([],400,empty.end)).toBe(false);expect(empty.ends).toEqual([false]);
  const gated=chain();gated.gate(false);expect(gated.audio.sequence(['game:a'],400,gated.end)).toBe(false);expect(gated.ends).toEqual([false]);
  // Nothing is kept for when the gate opens: the caller asks again (whenReady).
  gated.gate(true);expect(gated.keys).toEqual([]);expect(gated.audio.sequence(['game:a'],400,gated.end)).toBe(true);
  const quiet=chain();quiet.audio.setEnabled(false);expect(quiet.audio.sequence(['game:a'],400,quiet.end)).toBe(false);expect(quiet.ends).toEqual([false]);
  const gone=chain();gone.audio.release();expect(gone.audio.sequence(['game:a'],400,gone.end)).toBe(false);expect(gone.ends).toEqual([false]);
  const broken=chain();broken.failOn('game:a');expect(broken.audio.sequence(['game:a','game:b'],400,broken.end)).toBe(false);expect(broken.ends).toEqual([false]);expect(broken.keys).toEqual([]);
  // The report arrives before sequence returns.
  const order:string[]=[];const s=chain();s.gate(false);order.push(String(s.audio.sequence(['game:a'],400,()=>order.unshift('report'))));expect(order).toEqual(['report','false']);
  // A request that cannot play still cuts what was playing.
  const over=chain();over.audio.sequence(['game:a'],400,over.end);expect(over.audio.sequence(['game:missing'],400,over.end)).toBe(false);expect(over.ends).toEqual([false,false]);expect(over.active()).toBe(0);
});
test('a clip that will not start in the middle of a sequence cuts it',()=>{
  const s=chain();s.audio.sequence(['game:a','game:b','game:c'],400,s.end);
  s.failOn('game:b');s.finish();s.gap();
  expect(s.ends).toEqual([false]);expect(s.audio.busy()).toBe(false);expect(s.keys).toEqual(['game:a']);
});
test('a clip that fails while playing was not heard: the sequence ends there at once and reports false, never true',()=>{
  // The browser refuses every play, or a file will not decode: nothing sounded, so nothing was heard.
  const first=chain();first.audio.sequence(['game:a','game:b'],400,first.end);
  first.refuse();
  expect(first.ends).toEqual([false]);expect([first.audio.busy(),first.gaps(),first.active()]).toEqual([false,0,0]);expect(first.keys).toEqual(['game:a']);
  // The last clip failing is not a finish either.
  const last=chain();last.audio.sequence(['game:a','game:b'],400,last.end);
  last.finish();last.gap();last.refuse();
  expect(last.ends).toEqual([false]);expect(last.audio.busy()).toBe(false);
  // A late report from the failed clip, and whatever is asked next, are unaffected.
  last.refuse();last.finish();expect(last.ends).toEqual([false]);
  expect(last.audio.sequence(['game:c'],400,last.end)).toBe(true);last.finish();expect(last.ends).toEqual([false,true]);
  // A single clip that fails just ends.
  const one=chain();one.audio.speak('hello');one.refuse();expect(one.audio.busy()).toBe(false);
});
test('effects are refused while a sequence runs, gaps and its own effect clips included',()=>{
  const s=chain();s.audio.sequence(['effect:success','game:a','game:b'],400,s.end);
  s.tick();expect(s.audio.play('place')).toBe(false);
  s.finish();s.tick();expect(s.audio.play('place')).toBe(false);
  s.gap();s.finish();s.tick();expect(s.audio.play('place')).toBe(false);
  s.gap();s.finish();expect(s.ends).toEqual([true]);
  s.tick();expect(s.audio.play('place')).toBe(true);
  expect(s.keys).toEqual(['effect:success','game:a','game:b','effect:place']);expect(s.max()).toBe(1);
});
test('busy is true through a sequence and its gaps and through a single clip, and false in the quiet',()=>{
  const s=chain();expect(s.audio.busy()).toBe(false);
  s.audio.sequence(['game:a','game:b'],400,s.end);expect(s.audio.busy()).toBe(true);
  s.finish();expect(s.audio.busy()).toBe(true);
  s.gap();expect(s.audio.busy()).toBe(true);
  s.finish();expect(s.audio.busy()).toBe(false);
  s.audio.speak('hello');expect(s.audio.busy()).toBe(true);s.finish();expect(s.audio.busy()).toBe(false);
  s.tick();s.audio.play('place');expect(s.audio.busy()).toBe(true);s.audio.hush();expect(s.audio.busy()).toBe(false);
});
test('an end report may ask for more speech without two clips sounding at once',()=>{
  const s=chain();const said:boolean[]=[];
  // When cut, the first sequence asks again; the request that cut it still plays alone.
  s.audio.sequence(['game:a'],400,ok=>{said.push(ok);if(!ok)s.audio.sequence(['game:again'],400,s.end);});
  expect(s.audio.sequence(['game:b'],400,s.end)).toBe(true);
  expect(said).toEqual([false]);expect(s.ends).toEqual([false]);expect(s.active()).toBe(1);expect(s.max()).toBe(1);expect(s.keys.at(-1)).toBe('game:b');
  // When it finishes by itself, the report can start the next thing.
  const t=chain();t.audio.sequence(['game:a'],400,ok=>{if(ok)t.audio.sequence(['game:next'],400,t.end);});
  t.finish();expect(t.keys).toEqual(['game:a','game:next']);t.finish();expect(t.ends).toEqual([true]);expect(t.max()).toBe(1);
});
test('has says whether a key is recorded, whatever the gate or the sound setting, and plays nothing',()=>{
  const s=setup();s.gate(false);s.audio.setEnabled(false);
  expect([s.audio.has('game:line.rhyme.ask.cat'),s.audio.has('game:missing')]).toEqual([true,false]);
  expect(s.calls).toHaveLength(0);
});
