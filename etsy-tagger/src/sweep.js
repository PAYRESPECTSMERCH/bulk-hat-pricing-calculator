// Orchestrates one full sweep:
//   1. harvest order ids from every progress-step page (paginated)
//   2. read the COBRA sheet for JOB C (which orders are done digitizing)
//   3. for each order: read it, run the rules, apply the once-ever guard,
//      merge additively with the existing 🏷️ note, strip DIGITIZE if digitized,
//      re-order, and (unless dry-run) write the note back.
//
// Dry-run is the DEFAULT: it logs exactly what it WOULD change and writes
// nothing. Pass --apply (or ETSY_APPLY=1) to actually mutate Etsy notes.

import { SETTINGS, STEP_PAGES } from './config.js';
import { log } from './logger.js';
import { EtsyApi } from './etsy-api.js';
import { AutoTagged } from './state.js';
import { fetchDigitizedOrderIds } from './cobra.js';
import { computeOrder, unionNames } from './rules.js';
import { parseNote, isTagNote, orderNames, buildNote } from './note.js';

export async function runSweep(context, page) {
  const api = new EtsyApi(context, page);

  await page.goto(`${SETTINGS.origin}/your/orders/sold`, { waitUntil: 'domcontentloaded' });
  if (!(await api.isLoggedIn())) {
    throw new Error('Not logged in to Etsy. Run `npm run login` to refresh the saved session.');
  }
  await api.refreshCsrf();
  log.info(`Logged in. shop=${api.shopId} mode=${SETTINGS.apply ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}`);

  // 1. Harvest ids + remember a section hint per order.
  const sectionHint = new Map();
  const allIds = new Set();
  for (const { path, section } of STEP_PAGES) {
    const ids = await api.harvestStepPage(path);
    for (const id of ids) {
      allIds.add(id);
      if (section && !sectionHint.has(id)) sectionHint.set(id, section);
    }
    log.info(`harvested ${ids.length} order(s) from ${path}${section ? ` (${section})` : ''}`);
  }
  log.info(`Total distinct orders to process: ${allIds.size}`);

  // 2. JOB C: which orders are done digitizing?
  const digitized = await fetchDigitizedOrderIds(context);

  // 3. Process each order.
  const autoTagged = new AutoTagged();
  const summary = { processed: 0, changed: 0, skipped: 0, errors: 0, flags: [] };

  for (const orderId of allIds) {
    try {
      const order = await api.readOrder(orderId);
      const computed = computeOrder(order, { sectionHint: sectionHint.get(orderId) || null });

      // Existing 🏷️ note (the canonical one, if any).
      const notes = EtsyApi.privateNotes(order);
      const tagNote = notes.find((n) => isTagNote(n.note)) || null;
      const existingNames = tagNote ? parseNote(tagNote.note) : [];

      // Once-ever guard: only auto-ADD tags for items/bulk not seen before.
      const additions = new Set();
      for (const [idx, tags] of computed.itemTags) {
        const key = `${orderId}#${idx}`;
        if (autoTagged.has(key)) continue; // manual removal stays removed
        for (const t of tags) additions.add(t);
        autoTagged.mark(key);
      }
      if (computed.orderTags.includes('BULK ORDER')) {
        const bulkKey = `${orderId}#bulk`;
        if (!autoTagged.has(bulkKey)) {
          additions.add('BULK ORDER');
          autoTagged.mark(bulkKey);
        }
      }

      // Merge additively with whatever is already on the note.
      const desired = new Set([...existingNames, ...additions]);

      // JOB C: strip DIGITIZE once the order is digitized (remove-only).
      if (digitized.has(orderId)) desired.delete('DIGITIZE');

      // Order + build. Section tag is applied every sweep (follows the order).
      const ordered = orderNames([...desired], computed.section);
      const newNote = buildNote(ordered);
      const oldNote = tagNote ? tagNote.note.trim() : '';

      // Collect SEND MOCKUP candidates + rule-conflict flags (human-verified).
      if (computed.sendMockup.candidate && !existingNames.includes('SEND MOCKUP')) {
        summary.flags.push(`${orderId}: buyer mentions mockup/proof → SEND MOCKUP? (verify convo)`);
      }
      for (const f of computed.flags) summary.flags.push(`${orderId}: ${f}`);

      summary.processed += 1;

      if (newNote === oldNote) {
        summary.skipped += 1;
        continue;
      }

      const verb = SETTINGS.apply ? 'WRITE' : 'WOULD WRITE';
      log.info(`${verb} ${orderId}: "${oldNote || '(none)'}" → "${newNote || '(delete note)'}"`);
      summary.changed += 1;

      if (SETTINGS.apply) {
        await api.updateTagNote(orderId, tagNote?.order_note_id, newNote);
      }
    } catch (e) {
      summary.errors += 1;
      log.error(`order ${orderId}: ${e.message}`);
    }
  }

  if (SETTINGS.apply) autoTagged.save();

  // Final report.
  log.info(
    `Done. processed=${summary.processed} changed=${summary.changed} ` +
      `unchanged=${summary.skipped} errors=${summary.errors} flags=${summary.flags.length}`,
  );
  if (summary.flags.length) {
    log.info('--- NEEDS-MATT / verify (no action taken) ---');
    for (const f of summary.flags) log.flag(f);
  }
  return summary;
}
