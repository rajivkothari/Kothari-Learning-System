#!/usr/bin/env node
// End-to-end check of the browser playtest build in a real Chromium (playwright-core).
//   npm run web:export && npm run web:e2e
// 1. Plays Floor 15 as a child would (default learner, normal game screen), with a page reload
//    mid-mission, answering the hall calls between jobs, to the in-world completion; reloads
//    again and checks the completion persisted (free ride, rank plate).
//    Each correct answer waits on NEXT JOB, which the script presses (at least five per run).
//    The run covers every job type: moves, the shaft map, two orders, a two-part trip, where did
//    the crew get on, the trip meter (FEWER/MORE/GO), the beacon, the express, and the encounter.
// 1b. Exploration: touches two landings, opens the Engineer Log, reloads, and finds the
//    discoveries still there.
// 2. Developer tools: enters a Concept Rescue on a test learner, works the test run, returns to
//    the real job, and checks the tools wrote no learning records doing so.
// 3. Opens the playtest report from the tools and checks it names the simulated viewport.
// 4. Art pipeline (development calibration art): the images load (no 404, no decode failure
//    reported), and the Floor 15 core is still touchable through the art's own touch area.
// The answers are read from Lifty's on-screen line (the givens), as a person would.
const path = require('node:path');
const { serve } = require('./serve-web');
const { launchBrowser, waitForStatus } = require('./lib/browser');

const step = (m) => console.log(`- ${m}`);

async function text(page) {
  return (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
}
async function waitText(page, re, ms = 40_000) {
  const end = Date.now() + ms;
  for (;;) {
    const t = await text(page);
    const m = t.match(re);
    if (m) return m;
    if (Date.now() > end) throw new Error(`timeout waiting for ${re}\n${t.slice(0, 600)}`);
    await page.waitForTimeout(200);
  }
}
const click = (page, label) => page.getByLabel(label, { exact: true }).first().click();

/** Work out the job from Lifty's line. */
function job(t) {
  let m;
  if ((m = t.match(/We're on Floor (\d+)\. The repair kit is (\d+) floors (up|down)/)) || (m = t.match(/Floor (\d+)\. The toolbox is (\d+) floors (up|down)/))) return { kind: 'panel', target: m[3] === 'up' ? +m[1] + +m[2] : +m[1] - +m[2], key: m[0] };
  if ((m = t.match(/We're at Floor (\d+)\. The spare parts are (\d+) floors (up|down)/))) return { kind: 'panel', target: m[3] === 'up' ? +m[1] + +m[2] : +m[1] - +m[2], key: m[0] };
  if ((m = t.match(/We're (\d+) floors (above|below) the beacon\." The beacon is on Floor (\d+)/))) return { kind: 'panel', target: m[2] === 'above' ? +m[3] + +m[1] : +m[3] - +m[1], key: m[0] };
  if ((m = t.match(/loading dock is (\d+) floors (above|below) Floor (\d+)/))) return { kind: 'panel', target: m[2] === 'above' ? +m[3] + +m[1] : +m[3] - +m[1], key: m[0] };
  if ((m = t.match(/It can carry (\d+) units\. (\d+) are already aboard/))) return { kind: 'cargo', target: +m[1] - +m[2], key: m[0] };
  // The wider arithmetic (D148).
  if ((m = t.match(/Two orders: (\d+) crates for the crew, (\d+) for the roof/))) return { kind: 'cargo', target: +m[1] + +m[2], key: m[0] };
  if ((m = t.match(/from Floor (\d+), go (\d+) floors (up|down), then (\d+) floors (up|down)/))) return { kind: 'panel', target: +m[1] + (m[3] === 'up' ? +m[2] : -m[2]) + (m[5] === 'up' ? +m[4] : -m[4]), key: m[0] };
  if ((m = t.match(/rode (\d+) floors (up|down) and got off here, on Floor (\d+)/))) return { kind: 'panel', target: m[2] === 'up' ? +m[3] - +m[1] : +m[3] + +m[1], key: m[0] };
  if ((m = t.match(/(\d+) floors at a time\. The repair kit is at stop (\d+)/))) return { kind: 'panel', target: +m[1] * +m[2], key: m[0] };
  if ((m = t.match(/We're on Floor (\d+)\. The crew is on Floor (\d+)\. How many floors/))) return { kind: 'meter', target: Math.abs(+m[2] - +m[1]), key: m[0] };
  if ((m = t.match(/We've got a call on Floor (\d+)/))) return { kind: 'panel', target: +m[1], key: m[0] };
  if (/Take us to Floor 15/.test(t)) return { kind: 'panel', target: 15, key: 'finale' };
  if (/Press DOOR OPEN to wake/.test(t)) return { kind: 'wake', key: 'wake' };
  return null;
}

/** The in-world completion: Lifty's rank line (first time) or the replay line. There is no card. */
const COMPLETE = /Engineer Rank 1\. Your Engineer Log is on the clipboard|is running again\. Ride anywhere/;

async function playToEnd(page, { reloadAfterJobs }) {
  let done = 0;
  let last = '';
  let reloaded = false;
  let nextJobs = 0;
  for (let guard = 0; guard < 1500; guard++) {
    await page.waitForTimeout(250);
    const t = await text(page);
    if (COMPLETE.test(t)) {
      if (nextJobs < 5) throw new Error(`expected a NEXT JOB after each job, saw ${nextJobs}`);
      return;
    }
    // A success waits for the child (D122): nothing moves on until NEXT JOB is pressed.
    if (/NEXT JOB/.test(t)) {
      await page.waitForTimeout(400);
      await click(page, 'NEXT JOB');
      nextJobs += 1;
      last = '';
      continue;
    }
    const j = job(t);
    if (!j || j.key === last) continue;
    last = j.key;
    await page.waitForTimeout(500);
    if (j.kind === 'wake') await click(page, 'DOOR OPEN');
    else if (j.kind === 'meter') {
      for (let i = 0; i < j.target; i++) await click(page, 'More floors');
      await click(page, 'GO');
    } else if (j.kind === 'cargo') {
      for (let i = 0; i < j.target; i++) await click(page, 'Load crate');
      await click(page, 'DOOR CLOSE');
    } else await click(page, `Floor ${j.target}`);
    done += 1;
    if (process.env.E2E_VERBOSE) step(`${j.kind} ${j.target ?? ''}: ${j.key}`);
    if (!reloaded && done === reloadAfterJobs) {
      // Wait for the commit, then reload: the save must bring us back to the next job.
      await page.waitForTimeout(9000);
      step(`reload after ${done} actions`);
      await page.reload({ waitUntil: 'load' });
      reloaded = true;
      last = '';
      await waitText(page, /Welcome back|We're on Floor|Floor \d+\. The toolbox|shaft map|beacon|loading dock|Load the car|got a call|Two orders|Two-part trip|got off here|Express service/);
    }
  }
  throw new Error('Mission did not complete');
}

(async () => {
  const server = await serve(path.join(__dirname, '..', 'dist-web'), 0);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launchBrowser();
  const failures = [];
  const errors = [];
  const check = async (name, fn) => {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      failures.push(name);
      console.log(`FAIL ${name}: ${e.message}`);
    }
  };

  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));

  await check('Floor 15 plays end to end in the browser, with a reload mid-mission', async () => {
    await page.goto(`${base}?open=quest`, { waitUntil: 'load' });
    await waitText(page, /Press DOOR OPEN to wake/);
    await playToEnd(page, { reloadAfterJobs: 4 });
  });

  await check('completion persists after a reload: free ride at the restored floor, with the rank plate', async () => {
    await page.reload({ waitUntil: 'load' });
    await waitText(page, /The lift is all yours/);
    await waitText(page, /ENGINEER RANK 1/);
    if (/MISSION COMPLETE/.test(await text(page))) throw new Error('a completion card is still shown');
  });

  await check('exploration: touch two landings, read them in the Engineer Log, and keep them after a reload', async () => {
    await click(page, 'Inspect the power core');
    await waitText(page, /Primary power\. The core is running again/);
    await click(page, 'Floor 6');
    await waitText(page, /Try tapping the traction motor wheel/);
    await click(page, 'Inspect the traction motor wheel');
    await waitText(page, /This motor turns the big wheel/);
    await page.waitForTimeout(1500); // let the world-memory write land
    await page.reload({ waitUntil: 'load' });
    await waitText(page, /The lift is all yours/);
    await click(page, 'Engineer Log');
    await waitText(page, /ENGINEER LOG/);
    await waitText(page, /The sheave moves the cables/);
    await waitText(page, /This core sends power/);
    if (/These fans move fresh air/.test(await text(page))) throw new Error('an undiscovered fact is shown');
    await click(page, 'CLOSE');
  });

  await check('start over from the options sheet: a fresh game after completion, still fresh after a reload (D143)', async () => {
    await click(page, 'Settings');
    await page.getByText('Start over (clear progress)', { exact: true }).click();
    await page.getByText('Press again to clear progress and start over', { exact: true }).click();
    await waitText(page, /Press DOOR OPEN to wake/);
    if (/ENGINEER RANK 1/.test(await text(page))) throw new Error('the rank plate survived the start over');
    await page.reload({ waitUntil: 'load' });
    await waitText(page, /Press DOOR OPEN to wake/);
    if (/The lift is all yours/.test(await text(page))) throw new Error('the finished save came back after a reload');
  });

  const dev = await context.newPage();
  dev.on('pageerror', (e) => errors.push(e.message));
  await check('the default learner is untouched by the developer tools, and test learners start empty', async () => {
    // Same browser profile, same save. The tools open a test learner, not the default one.
    await dev.goto(`${base}?open=devtools&preset=ipad&learner=learner-test-a`, { waitUntil: 'load' });
    await page.close(); // one tab at a time (the save is held by one page)
    await dev.reload({ waitUntil: 'load' });
    await waitForStatus(dev, 'game');
    await waitText(dev, /attempts\s+0 · mission completions 0/);
    await waitText(dev, /unlocks\s+none/);
  });

  await check('Concept Rescue runs from the tools, returns to the job, and the tools wrote no evidence', async () => {
    await dev.getByLabel('Enter rescue (general)', { exact: true }).click();
    await waitForStatus(dev, 'scenario:rescue-generic');
    await waitText(dev, /TEST RUN/);
    await waitText(dev, /Parallel example: start \d+/);
    await dev.getByLabel('Answer the test run', { exact: true }).click();
    await waitForStatus(dev, 'answer test run');
    await waitText(dev, /Now the real job/, 30_000);
    await waitText(dev, /attempts\s+0 · mission completions 0/);
  });

  await check('the playtest report opens on web and names the simulated viewport', async () => {
    await dev.getByLabel('Open playtest report', { exact: true }).click();
    await waitText(dev, /Playtest report \(developer only, local\)/);
    await waitText(dev, /\(simulated\)/);
    await waitText(dev, /browser: /);
  });

  await check('calibration art loads in the browser and the art-drawn landing stays touchable', async () => {
    const art = [];
    dev.on('response', (r) => {
      if (r.url().includes('/assets/dev/art/')) art.push(r.status());
    });
    await dev.goto(`${base}?open=devtools&preset=ipad&scenario=explore-15&art=calibration&overlay=hitboxes`, { waitUntil: 'load' });
    await waitForStatus(dev, 'scenario:explore-15');
    await dev.getByTestId('device-frame').getByLabel('Inspect the power core', { exact: true }).click();
    await waitText(dev, /Primary power\. The core is running again/);
    const status = await dev.getByTestId('art-status').textContent();
    if (/Missing or failed/.test(status)) throw new Error(`art failed to load: ${status}`);
    if (art.length < 10 || art.some((code) => code !== 200)) throw new Error(`calibration art requests: ${art.join(', ')}`);
  });

  await check('a newer tab takes over the save; the older tab stops saving and says where the game is', async () => {
    // One browser profile, two tabs: the newest tab plays; the older one never overwrites it.
    const profile = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    const older = await profile.newPage();
    older.on('pageerror', (e) => errors.push(e.message));
    await older.goto(`${base}?open=quest`, { waitUntil: 'load' });
    await waitText(older, /Press DOOR OPEN to wake/);
    const newer = await profile.newPage();
    newer.on('pageerror', (e) => errors.push(e.message));
    await newer.goto(`${base}?open=quest`, { waitUntil: 'load' });
    await waitText(newer, /Press DOOR OPEN to wake/);
    if (/Saving did not work/.test(await text(newer))) throw new Error('the newer tab was refused');
    // The older tab is told at once, stops, and offers to take the game back.
    await waitText(older, /The game is open in another tab/);
    await click(newer, 'DOOR OPEN');
    await waitText(newer, /We're on Floor|Floor \d+\. The toolbox|got a call/);
    if (/Saving did not work/.test(await text(newer))) throw new Error('the newer tab could not save');
    // PLAY HERE in the older tab reloads it and takes the save back; the newer tab is told in turn.
    await older.getByText('PLAY HERE', { exact: true }).click();
    await waitText(older, /We're on Floor|Floor \d+\. The toolbox|got a call/);
    await waitText(newer, /The game is open in another tab/);
    await profile.close();
  });

  await browser.close();
  server.close();
  const real = errors.filter((e) => !/play\(\) failed because the user didn't interact/.test(e));
  if (real.length) console.log(`page errors:\n${real.slice(0, 10).join('\n')}`);
  if (failures.length || real.length) process.exit(1);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
