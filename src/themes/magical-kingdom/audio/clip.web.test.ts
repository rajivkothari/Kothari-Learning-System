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
