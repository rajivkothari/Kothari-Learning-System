#!/usr/bin/env node
// Real browser play: no injected game state and no keyboard answers. Local screenshots + SQLite evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');
const { launchBrowser } = require('./lib/browser');
const { serve } = require('./serve-web');
const root = path.join(__dirname, '..');
const output = path.join(root, 'qa/magical-kingdom-v02');
const shots = path.join(output, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const layouts = [
  { id: 'ipad-landscape', width: 1180, height: 820 },
  { id: 'ipad-portrait', width: 820, height: 1180 },
  { id: 'fire-landscape', width: 960, height: 600 },
  { id: 'fire-portrait', width: 600, height: 960 },
];

async function saveRows(page, SQL, dbName = 'kls-magical-kingdom.db') {
  const bytes = await page.evaluate(async (name) => {
    const db = await new Promise((resolve, reject) => { const q = indexedDB.open('kothari-learning', 1); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
    const bytes = await new Promise((resolve, reject) => { const q = db.transaction('sqlite-images', 'readonly').objectStore('sqlite-images').get(name); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
    db.close(); return bytes ? Array.from(new Uint8Array(bytes)) : null;
  }, dbName);
  if (!bytes) return { attempts: [], rows: 0, integrity: null };
  const db = new SQL.Database(new Uint8Array(bytes));
  const rows = db.exec('SELECT type, payload FROM learning_events ORDER BY seq')[0]?.values ?? [];
  const attempts = rows.filter((r) => r[0] === 'attempt').map((r) => JSON.parse(r[1]));
  const integrity = db.exec('PRAGMA integrity_check')[0].values[0][0];
  db.close(); return { attempts, rows: rows.length, integrity };
}
async function tap(page, label) {
  const target = page.getByRole('button', { name: label, exact: true });
  await touch(page, target);
}
async function touch(page, target) {
  for (let i = 0; i < 100 && (await target.getAttribute('aria-disabled')) === 'true'; i++) await page.waitForTimeout(20);
  const box = await target.boundingBox(); assert(box);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(350);
}
async function drag(page, token, zone) {
  const a = await token.boundingBox(), b = await zone.boundingBox();
  assert(a && b, 'drag geometry exists');
  const cdp = await page.context().newCDPSession(page);
  const from = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 16; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / 16, y: from.y + (to.y - from.y) * i / 16 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(350);
}
async function waitRoom(page, room) {
  if (room === 'castle') await page.getByTestId('door-ice').waitFor();
  else await page.getByTestId(room === 'ice' ? 'bridge-dropzone' : 'flower-dropzone').waitFor();
  await page.waitForTimeout(180);
}
async function checkTargets(page) {
  return page.getByRole('button').evaluateAll((els) => els.filter((e) => e.getAttribute('aria-disabled') !== 'true').map((e) => ({ label: e.getAttribute('aria-label'), box: { x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height } })).filter((x) => x.box.w < 63 || x.box.h < 63 || x.box.x < 0 || x.box.y < 0 || x.box.x + x.box.w > innerWidth + 1 || x.box.y + x.box.h > innerHeight + 1));
}
async function screenshot(page, name) {
  await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => undefined))));
  // Browser vectors avoid per-icon GL contexts. Confirm visible geometry exists before capture.
  const vectors = await page.locator('svg').evaluateAll((icons) => icons.map((c) => ({ w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height, pieces: c.querySelectorAll('path,circle,ellipse,rect').length })));
  assert(vectors.length > 0 && vectors.every((v) => v.w > 0 && v.h > 0 && v.pieces > 0), `vector geometry exists in ${name}`);
  await page.screenshot({ path: path.join(shots, name + '.png') });
}

async function equip(page,id){ const item=page.getByTestId(`wardrobe-${id}`);await item.scrollIntoViewIfNeeded();await touch(page,item); }
async function solve(page,room){
  if(room==='ice'){
    const n=Number(await page.getByTestId('bridge-goal').textContent());
    assert.equal(await page.getByRole('button',{name:/^Place crystal/}).count(),n);
    const instruction=await page.getByTestId('activity-instruction').textContent();
    const initial=Number(/^(\d+) stones/.exec(instruction)?.[1]??0);
    assert.equal(await page.locator('[data-testid^="socket-"]').count(),n+initial,'exact bridge capacity');
    for(let i=0;i<n;i++) await touch(page,page.getByTestId(`crystal-${i}`));
  }else{
    const word=/in (\w+)\./.exec(await page.getByTestId('activity-instruction').textContent())[1];
    await touch(page,page.getByTestId(`letter-${word[0]}`));
  }
  await touch(page,page.getByTestId('make-magic'));
}
(async()=>{
  const server=await serve(path.join(root,'dist-web'),8094),browser=await launchBrowser(),SQL=await initSqlJs(),results=[];
  let activePage;
  try{
    for(const layout of layouts){
      const ctx=await browser.newContext({viewport:{width:layout.width,height:layout.height},hasTouch:true,reducedMotion:'reduce'});
      await ctx.addInitScript(()=>{
        window.__audioPlays=0;window.__audioMax=0;const active=new Set();
        const play=HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play=function(){window.__audioPlays++;active.add(this);window.__audioMax=Math.max(window.__audioMax,active.size);this.addEventListener('ended',()=>active.delete(this),{once:true});return play.call(this);};
        const pause=HTMLMediaElement.prototype.pause;
        HTMLMediaElement.prototype.pause=function(){active.delete(this);return pause.call(this);};
      });
      const page=await ctx.newPage();activePage=page;const errors=[],external=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!/^(http:\/\/127\.0\.0\.1:8094\/|data:|blob:)/.test(r.url()))external.push(r.url());});
      await page.goto('http://127.0.0.1:8094/?open=kingdom');await waitRoom(page,'castle');
      const targets={castle:await checkTargets(page)};await screenshot(page,`${layout.id}-castle`);
      await touch(page,page.getByTestId('door-dress'));await page.getByTestId('wardrobe-screen').waitFor();
      await equip(page,'outfit-starlight');assert.match(await page.getByTestId('wardrobe-screen').getByTestId('princess-look').getAttribute('aria-label'),/outfit-lavender/);
      await tap(page,'Bows');await equip(page,'bow-pink');await tap(page,'Crowns');await equip(page,'crown-crystal');
      await tap(page,'Outfits');await screenshot(page,`${layout.id}-wardrobe-locked`);await tap(page,'Done dressing');
      assert.equal((await saveRows(page,SQL)).rows,0);
      await touch(page,page.getByTestId('door-ice'));await waitRoom(page,'ice');targets.ice=await checkTargets(page);
      assert.equal(await page.locator('[data-testid^="socket-"]').count(),5);assert.equal(await page.getByRole('button',{name:/^Place crystal/}).count(),5);
      await screenshot(page,`${layout.id}-five-spaces`);
      await drag(page,page.getByTestId('crystal-0'),page.getByTestId('bridge-dropzone'));await touch(page,page.getByTestId('crystal-1'));
      await page.reload();await waitRoom(page,'ice');assert.equal(await page.getByTestId('bridge-dropzone').getAttribute('aria-label'),'Crystals on the bridge: 2');
      await touch(page,page.getByTestId('socket-0'));await touch(page,page.getByTestId('make-magic'));
      await page.getByText('Count each glowing crystal. Add one or take one back.',{exact:true}).waitFor();
      for(const i of [0,2,3,4]) await touch(page,page.getByTestId(`crystal-${i}`));
      await touch(page,page.getByTestId('make-magic'));await tap(page,'Collect my royal gifts');await waitRoom(page,'castle');
      await screenshot(page,`${layout.id}-winter-gift`);await tap(page,'Open my wardrobe');await equip(page,'outfit-winter');
      await tap(page,'Crowns');await equip(page,'crown-crystal');await tap(page,'Wands');await equip(page,'wand-crystal');
      await screenshot(page,`${layout.id}-winter-look`);await tap(page,'Done dressing');
      assert.equal((await saveRows(page,SQL)).attempts.length,1);
      await touch(page,page.getByTestId('door-garden'));await waitRoom(page,'garden');targets.garden=await checkTargets(page);
      const word=/in (\w+)\./.exec(await page.getByTestId('activity-instruction').textContent())[1];
      const options=await page.getByRole('button',{name:/^Plant letter/}).all();
      const wrong=(await Promise.all(options.map(async e=>({e,label:await e.getAttribute('aria-label')})))).find(x=>!x.label.endsWith(word[0].toUpperCase())).e;
      await drag(page,wrong,page.getByTestId('flower-dropzone'));await touch(page,page.getByTestId('make-magic'));await tap(page,'Help me');
      await touch(page,page.getByTestId(`letter-${word[0]}`));await tap(page,'Take the letter back');await solve(page,'garden');
      await screenshot(page,`${layout.id}-garden-bloom`);await tap(page,'Collect my royal gifts');await tap(page,'Open my wardrobe');await equip(page,'outfit-garden');await screenshot(page,`${layout.id}-garden-look`);await tap(page,'Done dressing');
      // Replay is a real three-part quest; only the final acknowledgement earns a mission gift.
      await touch(page,page.getByTestId('door-ice'));await waitRoom(page,'ice');
      for(let stage=1;stage<=3;stage++){
        await page.getByText(`Adventure ${stage} of 3`,{exact:true}).waitFor();
        if(stage===2){assert.match(await page.getByTestId('activity-instruction').textContent(),/^\d+ stones are ready/);targets.repair=await checkTargets(page);await screenshot(page,`${layout.id}-repair-bridge`);}
        await solve(page,'ice');await tap(page,stage<3?'Next bridge':'Collect my royal gifts');
      }
      await page.getByText('A royal gift for you!',{exact:true}).waitFor();await tap(page,'Back to castle');
      await touch(page,page.getByTestId('door-garden'));await waitRoom(page,'garden');
      for(let stage=1;stage<=3;stage++){await page.getByText(`Adventure ${stage} of 3`,{exact:true}).waitFor();await solve(page,'garden');await tap(page,stage<3?'Next flower':'Collect my royal gifts');}
      await tap(page,'Open my wardrobe');await equip(page,'outfit-starlight');await tap(page,'Crowns');await equip(page,'crown-moon');await tap(page,'Wings');await equip(page,'wings-butterfly');await tap(page,'Wands');await equip(page,'wand-star');
      const look=await page.getByTestId('wardrobe-screen').getByTestId('princess-look').getAttribute('aria-label');assert.match(look,/outfit-starlight/);assert.match(look,/wings-butterfly/);
      await screenshot(page,`${layout.id}-starlight-look`);await tap(page,'Done dressing');
      await page.reload();await waitRoom(page,'castle');await touch(page,page.getByTestId('door-dress'));assert.equal(await page.getByTestId('wardrobe-screen').getByTestId('princess-look').getAttribute('aria-label'),look);await tap(page,'Done dressing');
      const before=await saveRows(page,SQL);assert.equal(before.attempts.length,8);assert.equal(before.attempts[0].assistance,'retry');assert.equal(before.attempts[1].assistance,'clue');
      await tap(page,'Comfort');await tap(page,'Sound off');await tap(page,'Done');await touch(page,page.getByTestId('door-ice'));await waitRoom(page,'ice');
      const mutedCount=await page.evaluate(()=>window.__audioPlays);await touch(page,page.getByTestId('crystal-0'));await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__audioPlays),mutedCount,'mute stops recorded effects');
      await tap(page,'Castle');await tap(page,'Comfort');await tap(page,'Sound on');await tap(page,'New adventure book');await tap(page,'Keep this book');await tap(page,'Done');
      await ctx.setOffline(true);await touch(page,page.getByTestId('door-ice'));await waitRoom(page,'ice');await tap(page,'Castle');await ctx.setOffline(false);
      await tap(page,'Comfort');await tap(page,'New adventure book');await tap(page,'Begin new book');await waitRoom(page,'castle');
      await touch(page,page.getByTestId('door-dress'));assert.equal(await page.getByTestId('wardrobe-screen').getByTestId('princess-look').getAttribute('aria-label'),look);await tap(page,'Done dressing');
      assert.equal((await saveRows(page,SQL)).attempts.length,8);
      await touch(page,page.getByTestId('door-ice'));await waitRoom(page,'ice');await touch(page,page.getByTestId('make-magic'));await touch(page,page.getByTestId('make-magic'));await tap(page,'Help me');await tap(page,'Help me');await tap(page,'Show me');
      await touch(page,page.getByTestId('make-magic'));await tap(page,'Collect my royal gifts');await waitRoom(page,'castle');await tap(page,'Back to castle');
      const complete=await saveRows(page,SQL);assert.equal(complete.attempts.length,9);assert.equal(complete.attempts.at(-1).assistance,'demonstrated');assert.equal(complete.integrity,'ok');
      const audio=await page.evaluate(()=>({plays:window.__audioPlays,maxConcurrent:window.__audioMax}));assert(audio.plays>0);assert(audio.maxConcurrent<=1);
      await tap(page,'Leave kingdom');await page.getByRole('button',{name:/MAGICAL KINGDOM/}).waitFor();assert.equal((await saveRows(page,SQL,'kothari-learning.db')).rows,0);
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert(Object.values(targets).every(x=>x.length===0),JSON.stringify(targets));
      results.push({layout,targets,audio,attempts:complete.attempts.map(a=>({assistance:a.assistance,outcome:a.outcome})),integrity:complete.integrity,pageErrors:errors,nonlocalRequests:external,passed:true});
      console.log(`PASS ${layout.id}: outfits, locked items, earned gifts, exact bridge, repair, three-stage quests, mute, reload, offline, restart, evidence`);await ctx.close();
    }
    fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({browser:browser.version(),results},null,2));
  }catch(e){if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:path.join(shots,'failure.png')});console.error(await activePage.locator('body').innerText());}throw e;}
  finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
