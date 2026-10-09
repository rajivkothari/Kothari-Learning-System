#!/usr/bin/env node
// Real browser play: no injected game state and no keyboard answers. Local screenshots + SQLite evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');
const { launchBrowser } = require('./lib/browser');
const { serve } = require('./serve-web');
const root = path.join(__dirname, '..');
const output = path.join(root, 'qa/magical-kingdom');
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

(async () => {
  const server = await serve(path.join(root, 'dist-web'), 8094);
  const browser = await launchBrowser();
  const SQL = await initSqlJs();
  const results = [];
  let activePage;
  try {
    for (const layout of layouts) {
      const ctx = await browser.newContext({ viewport: { width: layout.width, height: layout.height }, hasTouch: true, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      activePage = page;
      const errors = [], external = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:8094/') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
      await page.goto('http://127.0.0.1:8094/?open=kingdom'); await waitRoom(page, 'castle');
      const targets = { castle: await checkTargets(page) };
      await screenshot(page, `${layout.id}-castle`);
      await tap(page, 'Hear it'); // Exercise the optional control; this does not verify audible voice quality.
      await tap(page, 'Wake the castle stars'); await tap(page, 'Make the castle flowers dance');
      await touch(page, page.getByTestId('door-dress')); await tap(page, 'Lavender'); await tap(page, 'Turquoise'); await tap(page, 'Gold'); await tap(page, 'Done');
      await page.waitForTimeout(120);
      assert.equal((await saveRows(page, SQL)).rows, 0, 'decorations and dress-up are never evidence');
      await touch(page, page.getByTestId('door-ice')); await waitRoom(page, 'ice');
      targets.ice = await checkTargets(page); await screenshot(page, `${layout.id}-ice`);
      await tap(page, 'Hear it');
      assert.equal(await page.getByTestId('bridge-goal').textContent(), '5');
      // A real drag, then a tap; no evidence yet. Partial state survives a reload.
      await drag(page, page.getByTestId('crystal-0'), page.getByTestId('bridge-dropzone'));
      await page.getByRole('button', { name: 'Take crystal 1 back', exact: true }).waitFor();
      await touch(page, page.getByTestId('crystal-1')); await page.waitForTimeout(220);
      assert.equal((await saveRows(page, SQL)).attempts.length, 0);
      await page.reload(); await waitRoom(page, 'ice');
      assert.equal(await page.getByTestId('bridge-dropzone').getAttribute('aria-label'), 'Crystals on the bridge: 2');
      await touch(page, page.getByTestId('socket-0'));
      assert.equal(await page.getByTestId('bridge-dropzone').getAttribute('aria-label'), 'Crystals on the bridge: 1');
      // Explicit incorrect attempt then retry: assistance must not say independent.
      await touch(page, page.getByTestId('make-magic')); await page.getByText('Count each glowing crystal. Add one or take one back.', { exact: true }).waitFor();
      for (const i of [0,2,3,4]) await touch(page, page.getByTestId(`crystal-${i}`));
      await screenshot(page, `${layout.id}-ice-filled`);
      await touch(page, page.getByTestId('make-magic')); await page.getByRole('button', { name: 'Back to castle', exact: true }).waitFor();
      await page.waitForTimeout(200); await screenshot(page, `${layout.id}-ice-complete`);
      const iceRows = await saveRows(page, SQL); assert.equal(iceRows.attempts.length, 1); assert.equal(iceRows.attempts[0].assistance, 'retry');
      await page.reload(); await waitRoom(page, 'ice');
      await tap(page, 'Back to castle'); await waitRoom(page, 'castle');
      assert.equal((await saveRows(page, SQL)).attempts.length, 1, 'celebration restore never resubmits');
      await touch(page, page.getByTestId('door-garden')); await waitRoom(page, 'garden');
      targets.garden = await checkTargets(page); await screenshot(page, `${layout.id}-garden`);
      await tap(page, 'Hear it');
      const instruction = await page.getByTestId('activity-instruction').textContent();
      const word = /in (\w+)\./.exec(instruction)[1];
      const right = word[0];
      const letters = await page.getByRole('button', { name: /^Plant letter/ }).evaluateAll((es) => es.map((e) => e.getAttribute('aria-label').slice(-1).toLowerCase()));
      const wrong = letters.find((l) => l !== right);
      await drag(page, page.getByTestId(`letter-${wrong}`), page.getByTestId('flower-dropzone'));
      assert.equal((await page.getByTestId('planted-letter').textContent()).toLowerCase(), wrong);
      await touch(page, page.getByTestId('make-magic')); await page.getByText('Listen to the word. Try its first sound again.', { exact: true }).waitFor();
      await tap(page, 'Help me'); await page.waitForTimeout(120);
      await page.getByText('Say the word slowly. Listen at the beginning.', { exact: true }).waitFor();
      await touch(page, page.getByTestId(`letter-${right}`));
      await tap(page, 'Take the letter back');
      assert.equal(await page.getByTestId('planted-letter').textContent(), '?', 'letter can be taken back before submitting');
      await touch(page, page.getByTestId(`letter-${right}`));
      await screenshot(page, `${layout.id}-garden-planted`);
      await touch(page, page.getByTestId('make-magic')); await page.getByRole('button', { name: 'Back to castle', exact: true }).waitFor();
      await screenshot(page, `${layout.id}-garden-complete`);
      await tap(page, 'Back to castle'); await waitRoom(page, 'castle');
      const complete = await saveRows(page, SQL);
      assert.equal(complete.attempts.length, 2); assert.equal(complete.attempts[1].assistance, 'clue'); assert.equal(complete.integrity, 'ok');
      // Offline play after loading: browser has no service-worker claim. No fresh network fetch is needed during play.
      await ctx.setOffline(true); await touch(page, page.getByTestId('door-ice')); await waitRoom(page, 'ice'); await tap(page, 'Castle'); await waitRoom(page, 'castle'); await ctx.setOffline(false);
      // Restart is two intentional taps and creates a generation, preserving old evidence.
      await tap(page, 'Comfort'); await tap(page, 'Gentle motion'); await tap(page, 'Still pictures'); await tap(page, 'Sound off'); await tap(page, 'Sound on'); await tap(page, 'New adventure book'); await tap(page, 'Keep this book'); await tap(page, 'Done');
      assert.equal((await saveRows(page, SQL)).attempts.length, 2, 'cancelling restart retains the current adventures');
      await tap(page, 'Comfort'); await tap(page, 'New adventure book'); await tap(page, 'Begin new book'); await waitRoom(page, 'castle');
      assert.equal((await saveRows(page, SQL)).attempts.length, 2);
      await touch(page, page.getByTestId('door-ice')); await waitRoom(page, 'ice');
      for (let i = 0; i < 5; i++) await touch(page, page.getByTestId(`crystal-${i}`));
      await touch(page, page.getByTestId('make-magic')); await page.getByRole('button', { name: 'Back to castle', exact: true }).waitFor();
      const independent = await saveRows(page, SQL); assert.equal(independent.attempts.length, 3); assert.equal(independent.attempts[2].assistance, 'independent');
      await tap(page, 'Back to castle'); await waitRoom(page, 'castle');
      await touch(page, page.getByTestId('door-ice')); await waitRoom(page, 'ice');
      await touch(page, page.getByTestId('make-magic')); await touch(page, page.getByTestId('make-magic'));
      await tap(page, 'Help me'); await tap(page, 'Help me'); await tap(page, 'Show me');
      const demonstratedCount = Number(await page.getByTestId('bridge-goal').textContent());
      assert.equal(await page.getByTestId('bridge-dropzone').getAttribute('aria-label'), `Crystals on the bridge: ${demonstratedCount}`);
      await screenshot(page, `${layout.id}-demonstrated`);
      await touch(page, page.getByTestId('make-magic')); await page.getByRole('button', { name: 'Back to castle', exact: true }).waitFor();
      const demonstrated = await saveRows(page, SQL); assert.equal(demonstrated.attempts.length, 4); assert.equal(demonstrated.attempts[3].assistance, 'demonstrated');
      await tap(page, 'Back to castle'); await waitRoom(page, 'castle');
      await tap(page, 'Leave kingdom'); await page.getByRole('button', { name: /MAGICAL KINGDOM/ }).waitFor();
      assert.equal((await saveRows(page, SQL, 'kothari-learning.db')).rows, 0, 'Elevator save never opened or modified by kingdom');
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      assert.deepEqual(targets, { castle: [], ice: [], garden: [] }, 'touch targets fit and are at least 64px');
      results.push({ layout, targets, attempts: demonstrated.attempts.map((a) => ({ assistance: a.assistance, outcome: a.outcome, wrongTries: a.wrongTries })), integrity: complete.integrity, pageErrors: errors, nonlocalRequests: external, passed: true });
      console.log(`PASS ${layout.id}: drag, tap, mistakes, help, reload, offline play, restart, exit, evidence isolation`);
      await ctx.close();
    }
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ browser: browser.version(), results }, null, 2));
  } catch (e) {
    if (activePage && !activePage.isClosed()) {
      await activePage.screenshot({ path: path.join(shots, 'failure.png') });
      console.error('PAGE AT FAILURE:', await activePage.locator('body').innerText());
      console.error('TOUCH TARGETS:', await activePage.getByRole('button').evaluateAll((es) => es.map((e) => { const r=e.getBoundingClientRect(); return {label:e.getAttribute('aria-label'),disabled:e.getAttribute('aria-disabled'),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,160)}; })));
    }
    throw e;
  } finally { await browser.close(); await new Promise((r) => server.close(r)); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
