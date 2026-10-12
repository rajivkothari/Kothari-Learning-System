const fs=require('node:fs'),path=require('node:path');
const {launchBrowser}=require('../../../scripts/lib/browser');
(async()=>{
 const browser=await launchBrowser(),out=__dirname,results=[];
 try{
  const ctx=await browser.newContext({viewport:{width:1300,height:1800},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
  for(const orientation of ['landscape','portrait'])for(const state of ['powered','install','delivery']){
   await page.goto('http://127.0.0.1:8100/review/tower-rescue/phase2-v01/index.html?orientation='+orientation+'&state='+state);
   await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
   await page.evaluate(()=>Promise.all(Array.from(document.images).map(im=>im.decode())));
   const broken=await page.evaluate(()=>Array.from(document.images).filter(im=>!im.naturalWidth).map(im=>im.src));
   if(broken.length)throw Error('Broken images: '+broken);
   const file='mockup-fire-'+orientation+(state==='powered'?'':'-'+state)+'.png';
   const bounds=await page.locator('#screen').boundingBox();
   await page.screenshot({path:path.join(out,file),clip:{x:Math.round(bounds.x),y:Math.round(bounds.y),width:bounds.width,height:bounds.height}});
   const boxes=await page.evaluate(()=>Array.from(document.querySelectorAll('#screen .room,#screen .console,#screen .system,#screen .guide,#screen .bay,#screen .run')).map(el=>{const b=el.getBoundingClientRect(),s=document.querySelector('#screen').getBoundingClientRect();return {class:el.className,x:b.x-s.x,y:b.y-s.y,width:b.width,height:b.height}}));
   results.push({orientation,state,file,width:bounds.width,height:bounds.height,brokenImages:broken,boxes});
  }
  await page.goto('http://127.0.0.1:8100/review/tower-rescue/phase2-v01/index.html?view=contact');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.evaluate(()=>Promise.all(Array.from(document.images).map(im=>im.decode())));
  const tiles=await page.locator('.tile').count();if(tiles!==19)throw Error('Wrong contact count: '+tiles);
  await page.locator('main').screenshot({path:path.join(out,'contact-sheet.png')});
  await page.goto('http://127.0.0.1:8100/review/tower-rescue/phase2-v01/index.html');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  await page.getByRole('button',{name:'Fire portrait',exact:true}).click();
  await page.getByRole('button',{name:'Repair',exact:true}).click();
  const controls=await page.locator('#screen').getAttribute('class');
  if(!controls.includes('portrait install'))throw Error('Review controls did not update');
  if(errors.length)throw Error(JSON.stringify(errors));
  fs.writeFileSync(path.join(out,'browser-review.json'),JSON.stringify({type:'Browser-only art composition review; no gameplay integration',pageErrors:errors,contactTiles:tiles,controls,results},null,2)+'\n');
  console.log(JSON.stringify({screens:results.length,contactTiles:tiles,pageErrors:errors,controls}));
  await ctx.close();
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
