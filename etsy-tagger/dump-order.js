// One-off helper: print the raw JSON of one Etsy order so we can lock the exact
// field names for ORDERED / TRACKING / CUSTOMER NAME / SHIP TO (not documented
// in CLAUDE.md yet). Runs on your Mac against your saved session.
//
//   node dump-order.js 4069930782
//
// It prints the top-level keys plus the shipping/date-ish fields, then the full
// object. Review it before sharing — it contains buyer PII. You can paste me
// just the keys and the shipping/date fields; I don't need the personal values.

import fs from 'node:fs';
import { chromium } from 'playwright';
import { SETTINGS } from './src/config.js';
import { EtsyApi } from './src/etsy-api.js';

const orderId = process.argv[2];
if (!orderId) {
  console.error('Usage: node dump-order.js <orderId>');
  process.exit(2);
}
if (!fs.existsSync(SETTINGS.storageStatePath)) {
  console.error('No saved session. Run `npm run login` first.');
  process.exit(2);
}

const browser = await chromium.launch({ headless: SETTINGS.headless });
const context = await browser.newContext({ storageState: SETTINGS.storageStatePath });
const page = await context.newPage();

try {
  await page.goto(`${SETTINGS.origin}/your/orders/sold`, { waitUntil: 'domcontentloaded' });
  const api = new EtsyApi(context, page);
  if (!(await api.isLoggedIn())) throw new Error('Not logged in — run `npm run login`.');
  await api.refreshCsrf();

  const order = await api.readOrder(orderId);

  console.log('\n=== TOP-LEVEL KEYS ===');
  console.log(Object.keys(order).sort().join(', '));

  console.log('\n=== LIKELY SHIPPING / DATE / TRACKING FIELDS ===');
  for (const k of Object.keys(order).sort()) {
    if (/ship|address|recipient|name|track|date|tsz|time|created|state/i.test(k)) {
      const v = order[k];
      console.log(`${k}:`, typeof v === 'object' ? JSON.stringify(v) : v);
    }
  }

  console.log('\n=== FIRST TRANSACTION KEYS ===');
  const t0 = (order.transactions || [])[0] || {};
  console.log(Object.keys(t0).sort().join(', '));
  console.log('product keys:', Object.keys(t0.product || {}).sort().join(', '));

  console.log('\n=== FULL ORDER JSON (review before sharing — contains PII) ===');
  console.log(JSON.stringify(order, null, 2));
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
