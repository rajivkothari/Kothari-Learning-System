import { createKingdomPlayback } from './playback';

function setup(){
  let open=true,time=0,active=0,max=0;
  const calls:{key:string;finish:()=>void;stop:jest.Mock}[]=[];
  const audio=createKingdomPlayback({isOpen:()=>open,hasSource:key=>!key.includes('missing'),now:()=>time,start(key,finish){active++;max=Math.max(max,active);let stopped=false;const stop=jest.fn(()=>{if(!stopped){active--;stopped=true;}});calls.push({key,finish,stop});return {stop};}});
  audio.setEnabled(true);
  return {audio,calls,gate:(value:boolean)=>{open=value;},tick:()=>{time+=100;},active:()=>active,max:()=>max};
}
test('drops pre-gesture requests without replaying them when the gate opens',()=>{const s=setup();s.gate(false);expect(s.audio.speak('hello')).toBe(false);expect(s.audio.play('place')).toBe(false);s.gate(true);expect(s.calls).toHaveLength(0);expect(s.audio.speak('hello')).toBe(true);});
test('rapid speech replaces the old clip and ignores its late finish',()=>{const s=setup();s.audio.speak('hello');s.audio.speak('next');expect(s.calls[0]!.stop).toHaveBeenCalledTimes(1);s.calls[0]!.finish();expect(s.active()).toBe(1);s.calls[1]!.finish();expect(s.active()).toBe(0);expect(s.max()).toBe(1);});
test('speech interrupts an effect and suppresses effects until it finishes',()=>{const s=setup();s.audio.play('place');s.audio.speak('hello');s.tick();expect(s.audio.play('place')).toBe(false);s.calls[1]!.finish();expect(s.audio.play('place')).toBe(true);expect(s.max()).toBe(1);});
test('mute stops immediately and drops new requests',()=>{const s=setup();s.audio.speak('hello');s.audio.setEnabled(false);expect(s.active()).toBe(0);expect(s.audio.speak('hello')).toBe(false);expect(s.audio.play('place')).toBe(false);s.audio.setEnabled(true);expect(s.calls).toHaveLength(1);});
test('hush and release clean resources; released audio cannot restart',()=>{const s=setup();s.audio.speak('hello');s.audio.hush();s.audio.speak('next');s.audio.release();s.audio.setEnabled(true);expect(s.audio.speak('hello')).toBe(false);expect(s.active()).toBe(0);});
test('unknown text stops old audio and has no fallback or service request',()=>{const s=setup();s.audio.speak('hello');expect(s.audio.speak('missing')).toBe(false);expect(s.calls).toHaveLength(1);expect(s.active()).toBe(0);});
test('decoder/start errors remain optional and allow later audio',()=>{let fail=true;const stop=jest.fn();const audio=createKingdomPlayback({isOpen:()=>true,hasSource:()=>true,now:()=>0,start(){if(fail)throw Error('decode');return {stop};}});audio.setEnabled(true);expect(audio.speak('hello')).toBe(false);fail=false;expect(audio.speak('hello')).toBe(true);audio.release();expect(stop).toHaveBeenCalledTimes(1);});
test('a synchronous completion cannot leave a stale active clip',()=>{const stop=jest.fn();const audio=createKingdomPlayback({isOpen:()=>true,hasSource:()=>true,now:()=>0,start(_,finish){finish();return {stop};}});audio.setEnabled(true);audio.speak('hello');expect(stop).toHaveBeenCalledTimes(1);audio.release();expect(stop).toHaveBeenCalledTimes(1);});
test('a sequence plays its recorded keys in order, skips missing ones, and any new request ends it',()=>{
  const timers:(()=>void)[]=[];const keys:string[]=[];const finishes:(()=>void)[]=[];
  const audio=createKingdomPlayback({isOpen:()=>true,hasSource:k=>!k.includes('missing'),now:()=>0,wait:(_ms,fn)=>{timers.push(fn);},start(key,finish){keys.push(key);finishes.push(finish);return {stop:()=>undefined};}});
  audio.setEnabled(true);
  expect(audio.sequence(['slot:a','slot:missing','effect:b','slot:c'])).toBe(true);
  finishes[0]!();timers.shift()!();finishes[1]!();timers.shift()!();
  expect(keys).toEqual(['slot:a','effect:b','slot:c']);
  audio.sequence(['slot:x','slot:y']);finishes[3]!();audio.slot('z');timers.shift()!();
  expect(keys).toEqual(['slot:a','effect:b','slot:c','slot:x','slot:z']);
  expect(audio.sequence(['slot:missing'])).toBe(false);
});
