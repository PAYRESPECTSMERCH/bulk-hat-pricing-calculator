// Entrypoint for one sweep. Loads the saved session, runs the sweep, exits.
// Scheduled by launchd (see scripts/). Dry-run by default; --apply to write.

import fs from 'node:fs';
import { chromium } from 'playwright';
import { SETTINGS } from './src/config.js';
import { runSweep } from './src/sweep.js';
import { log } from './src/logger.js';

if (!fs.existsSync(SETTINGS.storageStatePath)) {
  log.error('No saved session (storageState.json). Run `npm run login` first.');
  process.exit(2);
}

const browser = await chromium.launch({ headless: SETTINGS.headless });
const context = await browser.newContext({ storageState: SETTINGS.storageStatePath });
const page = await context.newPage();

let code = 0;
try {
  const summary = await runSweep(context, page);
  if (summary.errors > 0) code = 1;
} catch (e) {
  log.error(e.stack || e.message);
  code = 1;
} finally {
  await browser.close();
}
process.exit(code);
