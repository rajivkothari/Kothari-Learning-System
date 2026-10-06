// Shared by the screenshot and end-to-end scripts: find a Chromium to drive with
// playwright-core (a dev dependency, no bundled browser download).
// Order: $CHROMIUM_PATH, Playwright's own browsers (PLAYWRIGHT_BROWSERS_PATH), installed Chrome.
const { chromium } = require('playwright-core');

async function launchBrowser() {
  const tries = [];
  if (process.env.CHROMIUM_PATH) tries.push({ executablePath: process.env.CHROMIUM_PATH });
  tries.push({}, { channel: 'chrome' }, { channel: 'msedge' });
  const errors = [];
  for (const opts of tries) {
    try {
      return await chromium.launch(opts);
    } catch (e) {
      errors.push(`${JSON.stringify(opts)}: ${String(e.message).split('\n')[0]}`);
    }
  }
  throw new Error(`No Chromium found. Install Google Chrome, or set CHROMIUM_PATH.\n${errors.join('\n')}`);
}

/** Wait for the developer panel's status line to say READY/FAILED for `label`. */
async function waitForStatus(page, label, timeoutMs = 90_000) {
  const loc = page.getByTestId('devtools-status');
  const end = Date.now() + timeoutMs;
  for (;;) {
    const text = (await loc.textContent().catch(() => '')) ?? '';
    if (text.startsWith(`READY ${label}`)) return text;
    if (text.startsWith('FAILED')) throw new Error(text);
    if (Date.now() > end) throw new Error(`Timed out waiting for READY ${label} (status: ${text})`);
    await page.waitForTimeout(200);
  }
}

module.exports = { launchBrowser, waitForStatus };
