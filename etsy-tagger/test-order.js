// Test harness for JOB B: read one or more real orders, build the sheet rows,
// show them, and (optionally) write them to PAYRESPECTS ORDERS.
//
//   node test-order.js 4069930782 4070032916          # preview only, no writes
//   node test-order.js 4069930782 --apply             # actually write the row(s)
//
// Without --apply it does a DRY RUN: if the sheet exec URL is configured it asks
// the Apps Script to compute the rows and return them WITHOUT writing; otherwise
// it just prints what it built locally. Safe to run repeatedly.

import fs from 'node:fs';
import { chromium } from 'playwright';
import { SETTINGS } from './src/config.js';
import { EtsyApi } from './src/etsy-api.js';
import { buildRows } from './src/order-row.js';
import { postRows } from './src/sheet.js';

const ids = process.argv.slice(2).filter((a) => /^\d{9,12}$/.test(a));
const apply = process.argv.includes('--apply');
if (!ids.length) {
  console.error('Usage: node test-order.js <orderId> [<orderId> ...] [--apply]');
  process.exit(2);
}
if (!fs.existsSync(SETTINGS.storageStatePath)) {
  console.error('No saved session. Run `npm run login` first.');
  process.exit(2);
}

const COLS = ['status', 'orderId', 'ordered', 'itemName', 'type', 'sku', 'qty', 'color',
  'size', 'details', 'digitizeFolder', 'vendor', 'shipBy', 'tracking', 'customerName', 'shipTo'];

function showRow(row) {
  for (const c of COLS) {
    const v = row[c] == null ? '' : String(row[c]);
    console.log(`   ${c.padEnd(14)} : ${v.length > 90 ? v.slice(0, 90) + '…' : v}`);
  }
}

const browser = await chromium.launch({ headless: SETTINGS.headless });
const context = await browser.newContext({ storageState: SETTINGS.storageStatePath });
const page = await context.newPage();

try {
  await page.goto(`${SETTINGS.origin}/your/orders/sold`, { waitUntil: 'domcontentloaded' });
  const api = new EtsyApi(context, page);
  if (!(await api.isLoggedIn())) throw new Error('Not logged in — run `npm run login`.');
  await api.refreshCsrf();
  console.log(`shop=${api.shopId} mode=${apply ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}\n`);

  const allRows = [];
  for (const id of ids) {
    const order = await api.readOrder(id);
    const rows = buildRows(order);
    console.log(`Order ${id} → ${rows.length} row(s):`);
    rows.forEach((r, i) => {
      console.log(` [line item ${i + 1}]`);
      showRow(r);
    });
    console.log('');
    allRows.push(...rows);
  }

  if (!SETTINGS.sheet.execUrl) {
    console.log('PAYRESPECTS_SHEET_EXEC_URL not set — printed rows only, nothing sent.');
    console.log('Deploy apps-script/payrespects-orders-sync.gs and set the URL to write.');
  } else {
    const res = await postRows(context, allRows, { mode: 'upsert', dryRun: !apply });
    console.log(
      `Sheet ${apply ? 'WRITE' : 'DRY-RUN'}: appended=${res.appended} updated=${res.updated}` +
        (apply ? '' : ' (nothing written — remove --apply guard by passing --apply to write)'),
    );
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
