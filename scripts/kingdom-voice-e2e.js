// Audio acceptance in a real touch browser. No injected learning state.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {launchBrowser}=require('./lib/browser'),{serve}=require('./serve-web');
const root=path.join(__dirname,'..'),out=path.join(root,'qa/magical-kingdom-voice-v1');
const manifest=require('../assets/themes/magical-kingdom/audio/manifest.json');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(f=>f.isDirectory()?walk(path.join(d,f.name)):[path.join(d,f.name)]);
const files=walk(path.join(root,'dist-web'));
const assets=manifest.clips.map(c=>{const md5=crypto.createHash('md5').update(fs.readFileSync(path.join(root,'assets/themes/magical-kingdom/audio',c.file))).digest('hex');const file=files.find(f=>path.basename(f).includes(md5));assert(file,`exported ${c.id}`);return {...c,url:'/'+path.relative(path.join(root,'dist-web'),file).split(path.sep).join('/')};});
async function tap(page,name){const box=await page.getByRole('button',{name,exact:true}).boundingBox();assert(box);await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await page.waitForTimeout(180);}
(async()=>{
  const server=await serve(path.join(root,'dist-web'),8097),browser=await launchBrowser();const results=[];
  try{
    for(const [id,width,height] of [['ipad-landscape',1180,820],['ipad-portrait',820,1180],['fire-landscape',960,600],['fire-portrait',600,960]]){
      const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,reducedMotion:'reduce'});
      await ctx.addInitScript(({clips})=>{
        const hashes=Object.fromEntries(clips.map(c=>[c.sha256,c.id]));
        window.__voiceBlobs={};window.__voicePlays=[];window.__voiceErrors=[];window.__voicePeak=0;window.__voiceActive=0;window.__voiceRevoked=0;
        const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
        URL.createObjectURL=function(blob){const url=create.call(URL,blob);void blob.arrayBuffer().then(b=>crypto.subtle.digest('SHA-256',b)).then(h=>{const hash=Array.from(new Uint8Array(h),v=>v.toString(16).padStart(2,'0')).join('');if(hashes[hash])window.__voiceBlobs[url]=hashes[hash];});return url;};
        URL.revokeObjectURL=function(url){if(window.__voiceBlobs[url])window.__voiceRevoked++;return revoke.call(URL,url);};
        const active=new Set(),play=HTMLMediaElement.prototype.play,pause=HTMLMediaElement.prototype.pause;
        const update=()=>{window.__voiceActive=active.size;window.__voicePeak=Math.max(window.__voicePeak,active.size);};
        HTMLMediaElement.prototype.play=function(){window.__voicePlays.push({id:window.__voiceBlobs[this.src]||null,src:this.src});active.add(this);update();this.addEventListener('ended',()=>{active.delete(this);update();},{once:true});this.addEventListener('error',()=>window.__voiceErrors.push(this.error?.message||'media error'),{once:true});return play.call(this);};
        HTMLMediaElement.prototype.pause=function(){active.delete(this);update();return pause.call(this);};
      },{clips:assets});
      const page=await ctx.newPage(),errors=[],external=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!/^(http:\/\/127\.0\.0\.1:8097\/|blob:|data:)/.test(r.url()))external.push(r.url());});
      await page.goto('http://127.0.0.1:8097/?open=kingdom');await page.getByTestId('door-ice').waitFor();
      await page.waitForFunction(()=>Object.keys(window.__voiceBlobs).length===67);
      assert.equal(await page.evaluate(()=>window.__voicePlays.length),0,'silent before first gesture');
      const decoded=await page.evaluate(async clips=>{const audio=new AudioContext();try{return await Promise.all(clips.map(async c=>{const response=await fetch(c.url);assertOk(response.ok);const buffer=await audio.decodeAudioData(await response.arrayBuffer());return {id:c.id,duration:buffer.duration,channels:buffer.numberOfChannels,sampleRate:buffer.sampleRate};}));}finally{await audio.close();}function assertOk(ok){if(!ok)throw Error('missing MP3');}},assets);
      assert(decoded.every(c=>c.duration>.3&&c.channels>0),'all 67 MP3s decode');
      await tap(page,'Hear it');await page.waitForFunction(()=>window.__voicePlays.at(-1)?.id==='guide');
      await tap(page,'Hear it');await page.waitForFunction(()=>window.__voiceActive===0);
      await tap(page,'Ice Palace');await page.getByTestId('bridge-dropzone').waitFor();await page.waitForFunction(()=>window.__voicePlays.at(-1)?.id==='iceIntro');
      await tap(page,'Hear it');await page.waitForFunction(()=>window.__voicePlays.at(-1)?.id==='bridge.5');
      await tap(page,'Comfort');await tap(page,'Sound off');assert.equal(await page.evaluate(()=>window.__voiceActive),0,'mute stops speech');await tap(page,'Done');
      const muted=await page.evaluate(()=>window.__voicePlays.length);await tap(page,'Hear it');assert.equal(await page.evaluate(()=>window.__voicePlays.length),muted);
      await tap(page,'Comfort');await tap(page,'Sound on');await tap(page,'Done');
      await ctx.setOffline(true);await tap(page,'Hear it');await page.waitForFunction(()=>window.__voicePlays.at(-1)?.id==='bridge.5');
      await tap(page,'Castle');await tap(page,'Royal Garden');await page.getByTestId('flower-dropzone').waitFor();await tap(page,'Hear it');await page.waitForFunction(()=>window.__voicePlays.at(-1)?.id?.startsWith('garden.'));
      await ctx.setOffline(false);await tap(page,'Castle');await tap(page,'Hear it');await tap(page,'Leave kingdom');
      await page.getByRole('button',{name:/MAGICAL KINGDOM/}).waitFor();assert.equal(await page.evaluate(()=>window.__voiceActive),0,'exit stops speech');
      const audio=await page.evaluate(()=>({peak:window.__voicePeak,revoked:window.__voiceRevoked,errors:window.__voiceErrors,played:window.__voicePlays.map(p=>p.id)}));
      assert(audio.peak<=1);assert.equal(audio.revoked,67,'exit releases every preloaded blob');assert.deepEqual(audio.errors,[]);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
      results.push({layout:{id,width,height},decoded,audio,pageErrors:errors,nonlocalRequests:external,passed:true});console.log(`PASS ${id}: 67 MP3s decoded; recorded guide/goals; rapid replay; mute; offline; exit; peak ${audio.peak}`);await ctx.close();
    }
    fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'audio-browser-results.json'),JSON.stringify({browser:browser.version(),results},null,2));
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
