// POST order rows to the PAYRESPECTS ORDERS Apps Script web app (JOB B write path).
import { SETTINGS } from './config.js';

/**
 * @param context Playwright BrowserContext (uses its request client)
 * @param rows    array of row payloads from order-row.buildRows()
 * @param opts.mode 'upsert' (default) or 'append'
 * @param opts.dryRun if true, the Apps Script computes + returns the rows but writes nothing
 */
export async function postRows(context, rows, { mode = 'upsert', dryRun = false } = {}) {
  if (!SETTINGS.sheet.execUrl) {
    throw new Error('PAYRESPECTS_SHEET_EXEC_URL is not set (see .env / apps-script setup).');
  }
  const resp = await context.request.post(SETTINGS.sheet.execUrl, {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({
      secret: SETTINGS.sheet.secret,
      gid: SETTINGS.sheet.gid,
      mode,
      dryRun,
      rows,
    }),
  });
  if (!resp.ok()) throw new Error(`sheet post → HTTP ${resp.status()}`);
  const out = await resp.json().catch(() => ({}));
  if (out && out.ok === false) throw new Error(`sheet post rejected: ${out.error}`);
  return out;
}
