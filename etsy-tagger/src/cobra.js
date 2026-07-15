// JOB C support: read the COBRA DIGITIZE sheet and return the set of order ids
// whose STATUS is exactly READY or COMPLETED. Those orders get the DIGITIZE
// token stripped from their 🏷️ note (remove-only; never touches other tags).
//
// Sheet access is via a published CSV URL (File → Share → Publish to web → CSV),
// so the automation needs no Google credentials. Column A = STATUS, and an order
// id (9–12 digits) appears somewhere in the row (the ORDER column).

import { SETTINGS } from './config.js';
import { log } from './logger.js';

const DONE_STATUSES = new Set(['READY', 'COMPLETED']);

/** @returns {Promise<Set<string>>} order ids that are done-digitizing. */
export async function fetchDigitizedOrderIds(context) {
  if (!SETTINGS.cobraCsvUrl) return new Set();
  const done = new Set();
  try {
    const resp = await context.request.get(SETTINGS.cobraCsvUrl);
    if (!resp.ok()) {
      log.warn(`JOB C: COBRA sheet CSV → HTTP ${resp.status()} (skipping DIGITIZE removal)`);
      return done;
    }
    const csv = await resp.text();
    for (const line of csv.split('\n')) {
      const status = (line.split(',')[0] || '').replace(/"/g, '').trim().toUpperCase();
      if (!DONE_STATUSES.has(status)) continue;
      const m = line.match(/\b(\d{9,12})\b/);
      if (m) done.add(m[1]);
    }
    log.info(`JOB C: ${done.size} order(s) marked READY/COMPLETED in COBRA DIGITIZE`);
  } catch (e) {
    log.warn(`JOB C: failed to read COBRA sheet (${e.message}) — skipping DIGITIZE removal`);
  }
  return done;
}
