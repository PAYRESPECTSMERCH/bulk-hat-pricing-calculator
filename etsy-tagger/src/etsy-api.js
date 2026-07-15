// Client for Etsy's internal (session-authenticated) API — the same endpoints
// the extension and the Claude automations used. All calls ride the saved
// browser session's cookies, so there is no separate token to manage beyond
// the per-page CSRF nonce.

import { SETTINGS } from './config.js';
import { log } from './logger.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class EtsyApi {
  /**
   * @param {import('playwright').BrowserContext} context
   * @param {import('playwright').Page} page  a page already on an etsy.com URL
   */
  constructor(context, page) {
    this.context = context;
    this.request = context.request;
    this.page = page;
    this.shopId = SETTINGS.shopId;
    this.csrf = null;
  }

  base() {
    return `${SETTINGS.origin}/api/v3/ajax/shop/${this.shopId}/mission-control`;
  }

  headers(extra = {}) {
    return {
      'x-csrf-token': this.csrf || '',
      'X-Requested-With': 'XMLHttpRequest',
      referer: `${SETTINGS.origin}/your/orders/sold`,
      origin: SETTINGS.origin,
      ...extra,
    };
  }

  /** Read the CSRF nonce (and confirm we're logged in) from the current page. */
  async refreshCsrf() {
    // The dashboard embeds <meta name="csrf_nonce" content="...">.
    const nonce = await this.page
      .locator('meta[name="csrf_nonce"]')
      .getAttribute('content')
      .catch(() => null);
    if (!nonce) {
      // Fall back to scanning the HTML (the meta may render late / be renamed).
      const html = await this.page.content();
      const m = html.match(/csrf_nonce"\s+content="([^"]+)"/) || html.match(/"csrf_nonce":"([^"]+)"/);
      if (m) this.csrf = m[1];
    } else {
      this.csrf = nonce;
    }
    // Opportunistically confirm the shop id from the page too.
    if (this.shopId === '22905049') {
      const html = await this.page.content();
      const sm = html.match(/api\/v3\/ajax\/shop\/(\d+)\//);
      if (sm) this.shopId = sm[1];
    }
    if (!this.csrf) throw new Error('Could not read csrf_nonce — is the saved session still logged in?');
    return this.csrf;
  }

  /** True if the current page looks like a signed-in dashboard (not a login wall). */
  async isLoggedIn() {
    const url = this.page.url();
    if (/\/signin|\/login/.test(url)) return false;
    const nonce = await this.page
      .locator('meta[name="csrf_nonce"]')
      .count()
      .catch(() => 0);
    return nonce > 0;
  }

  /**
   * Harvest order ids from a server-rendered progress-step page, following
   * ?page=1,2,3… until a page adds no new ids. Step pages paginate at ~20/page
   * and /completed at ~50 — always probe past a round number.
   */
  async harvestStepPage(pathname) {
    const ids = new Set();
    for (let page = 1; page <= 25; page++) {
      const url = `${SETTINGS.origin}${pathname}?page=${page}`;
      const resp = await this.request.get(url, { headers: this.headers() });
      if (!resp.ok()) {
        log.warn(`harvest ${pathname} page ${page} → HTTP ${resp.status()}`);
        break;
      }
      const html = await resp.text();
      const before = ids.size;
      for (const m of html.matchAll(/order_id=(\d{9,12})/g)) ids.add(m[1]);
      const added = ids.size - before;
      if (added === 0) break; // no new ids on this page → done
      await sleep(120);
    }
    return [...ids];
  }

  /** Read a full order object (transactions, notes, personalization, state). */
  async readOrder(orderId) {
    const url =
      `${this.base()}/orders/${orderId}` +
      `?objects_enabled_for_normalization%5Border_state%5D=true`;
    const resp = await this.request.get(url, { headers: this.headers() });
    if (!resp.ok()) throw new Error(`readOrder ${orderId} → HTTP ${resp.status()}`);
    const data = await resp.json();
    const order = data?.orders?.[0];
    if (!order) throw new Error(`readOrder ${orderId} → no order in response`);
    order.__orderId = String(orderId);
    order.__shopSenderId = SETTINGS.shopSenderId;
    return order;
  }

  /** Read the buyer↔shop conversation for an order (for SEND MOCKUP checks). */
  async readConvo(orderId) {
    const url = `${this.base()}/orders/convos/${orderId}`;
    const resp = await this.request.get(url, { headers: this.headers() });
    if (!resp.ok()) return null;
    return resp.json().catch(() => null);
  }

  /** Existing 🏷️-style private notes: [{ note, order_note_id, date }]. */
  static privateNotes(order) {
    return order?.notes?.private_order_notes || [];
  }

  async createNote(orderId, text) {
    const url = `${this.base()}/orders/notes/${orderId}`;
    const resp = await this.request.post(url, {
      headers: this.headers({ 'content-type': 'application/x-www-form-urlencoded' }),
      form: { note: text },
    });
    if (!resp.ok()) throw new Error(`createNote ${orderId} → HTTP ${resp.status()}`);
    await sleep(SETTINGS.throttleMs);
  }

  async deleteNote(orderNoteId) {
    const url = `${this.base()}/orders/notes/remove/${orderNoteId}`;
    const resp = await this.request.post(url, { headers: this.headers() });
    if (!resp.ok()) throw new Error(`deleteNote ${orderNoteId} → HTTP ${resp.status()}`);
    await sleep(SETTINGS.throttleMs);
  }

  /** Update = delete the old 🏷️ note (if any) then create the new one. */
  async updateTagNote(orderId, oldNoteId, text) {
    if (oldNoteId) await this.deleteNote(oldNoteId);
    if (text) await this.createNote(orderId, text);
  }
}
