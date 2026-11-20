import { createRecordedClip } from './clip.web';
jest.mock('expo-asset',()=>({Asset:{fromModule:()=>({uri:'/local.mp3'})}}));

test('a pending browser play rejected by deliberate cancellation is handled',async()=>{
  const original=globalThis.Audio,finished=jest.fn();let reject:(error:Error)=>void=()=>{};
  const pending=new Promise<void>((_,r)=>{reject=r;});
  const element={volume:0,addEventListener:jest.fn(),removeEventListener:jest.fn(),play:()=>pending,pause:()=>reject(new Error('play interrupted')),removeAttribute:jest.fn(),load:jest.fn()};
  globalThis.Audio=jest.fn(()=>element) as unknown as typeof Audio;
  try{const clip=createRecordedClip({uri:'blob:local'},.65,finished);clip.stop();await Promise.resolve();expect(finished).not.toHaveBeenCalled();expect(element.removeAttribute).toHaveBeenCalledWith('src');}finally{globalThis.Audio=original;}
});
test('an active browser play failure finishes optional audio',async()=>{
  const original=globalThis.Audio,finished=jest.fn();
  const element={volume:0,addEventListener:jest.fn(),removeEventListener:jest.fn(),play:()=>Promise.reject(new Error('decode failed')),pause:jest.fn(),removeAttribute:jest.fn(),load:jest.fn()};
  globalThis.Audio=jest.fn(()=>element) as unknown as typeof Audio;
  try{const clip=createRecordedClip({uri:'blob:local'},.65,finished);await Promise.resolve();expect(finished).toHaveBeenCalledTimes(1);clip.stop();}finally{globalThis.Audio=original;}
});
test('speech plays at the voice pace with its pitch kept; a clip at the recorded pace is left alone',()=>{
  const original=globalThis.Audio;
  const make=()=>({volume:0,playbackRate:1,defaultPlaybackRate:1,preservesPitch:undefined as boolean|undefined,addEventListener:jest.fn(),removeEventListener:jest.fn(),play:()=>Promise.resolve(),pause:jest.fn(),removeAttribute:jest.fn(),load:jest.fn()});
  const slow=make(),plain=make();
  try{
    globalThis.Audio=jest.fn(()=>slow) as unknown as typeof Audio;
    createRecordedClip({uri:'blob:voice'},.65,jest.fn(),.88).stop();
    expect(slow).toMatchObject({volume:.65,playbackRate:.88,defaultPlaybackRate:.88,preservesPitch:true});
    globalThis.Audio=jest.fn(()=>plain) as unknown as typeof Audio;
    createRecordedClip({uri:'blob:effect'},.48,jest.fn()).stop();
    expect(plain).toMatchObject({volume:.48,playbackRate:1,defaultPlaybackRate:1,preservesPitch:undefined});
  }finally{globalThis.Audio=original;}
});
