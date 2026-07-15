// One-time (and occasional) login helper. Opens a REAL browser window, lets you
// sign into Etsy by hand (handles 2FA / captcha because a human does it), then
// saves the session cookies to storageState.json for the background sweeps.
//
//   npm run login
//
// Re-run this whenever a sweep reports "Not logged in" — Etsy sessions expire.

import { chromium } from 'playwright';
import { SETTINGS } from './src/config.js';

const { origin, storageStatePath } = SETTINGS;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

console.log('\nOpening Etsy. Sign in (and finish any 2FA), then come back here.');
await page.goto(`${origin}/your/orders/sold`, { waitUntil: 'domcontentloaded' });

console.log('Waiting until you reach the Sold Orders dashboard…');
// Wait for the signed-in dashboard: the csrf_nonce meta only exists when logged in.
await page
  .waitForFunction(() => !!document.querySelector('meta[name="csrf_nonce"]'), null, { timeout: 300000 })
  .catch(() => {
    console.error('Timed out waiting for login. Nothing saved. Run `npm run login` again.');
  });

const loggedIn = await page.locator('meta[name="csrf_nonce"]').count();
if (loggedIn > 0) {
  await context.storageState({ path: storageStatePath });
  console.log(`\n✅ Saved session → ${storageStatePath}`);
  console.log('You can close this window. The background sweep will reuse this session.');
} else {
  console.log('\n⚠️  Did not detect a signed-in dashboard; session NOT saved.');
}

await browser.close();
