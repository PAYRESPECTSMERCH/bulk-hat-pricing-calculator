// Map an Etsy order JSON → PAYRESPECTS ORDERS sheet rows (one per line item).
// Pure functions, no I/O. The ✅ fields come straight from documented order JSON;
// the ⚠️ fields (dates, tracking, customer, ship-to) use defensive multi-path
// lookups because their exact JSON keys aren't in CLAUDE.md yet — `dump-order.js`
// confirms them on the first real run and we lock the paths.

import { SECTION_STEPS } from './config.js';

const dec = (s) =>
  String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const firstDefined = (...vals) => {
  for (const v of vals) if (v != null && v !== '') return v;
  return '';
};

// --- TYPE classifier (tweakable) --------------------------------------------
export function classifyType(title, sku) {
  const s = `${title} ${sku}`.toUpperCase();
  if (/MOCK\s?NECK|MOCKECK/.test(s)) return 'MOCKNECK';
  if (/\b(HAT|CAP|TRUCKER|SNAPBACK|BEANIE|VISOR)\b|5\s*PANEL|OTTO|YUPOONG/.test(s)) return 'HAT';
  if (/HOODIE|SWEATSHIRT|CREWNECK|CREW NECK/.test(s)) return 'HOODIE';
  if (/\b(TEE|T-?SHIRT|SHIRT|JERSEY)\b|BELLA\s*CANVAS/.test(s)) return 'SHIRT';
  if (/\bTOTE\b/.test(s)) return 'TOTE';
  if (/\bSHORTS?\b/.test(s)) return 'SHORTS';
  if (/\b(LOUNGE|SET)\b/.test(s)) return 'SET';
  return '';
}

// --- Line-item field extraction ---------------------------------------------
function variationValue(variations, propRe) {
  for (const v of variations || []) {
    if (propRe.test(String(v.property || ''))) return dec(v.value);
  }
  return '';
}

function personalizationText(variations) {
  const out = [];
  for (const v of variations || []) {
    if (String(v.type || '').endsWith('_Personalization')) {
      const val = dec(v.value);
      if (val) out.push(val);
    }
  }
  return out.join(' | ');
}

// Bulk qty: max of listing quantity, any "Qty N" variation, and a number-first
// "N HATS/SETS" in the title.
export function bulkQty(t) {
  let q = Number(t.quantity) || 0;
  for (const v of t.variations || []) {
    if (/qty|quantity/i.test(String(v.property || ''))) {
      const m = String(v.value || '').match(/\d+/);
      if (m) q = Math.max(q, Number(m[0]));
    }
  }
  const title = String((t.product || {}).title || '');
  // number-first "60 HATS" / "30 SETS"
  const tm = title.match(/\b(\d+)\s*(?:hats?|sets?)\b/i);
  if (tm) q = Math.max(q, Number(tm[1]));
  // "QTY 60" / "Quantity 60" anywhere in the title
  const qm = title.match(/\bq(?:ty|uantity)\b\s*:?\s*(\d+)/i);
  if (qm) q = Math.max(q, Number(qm[1]));
  return q || 1;
}

// --- Order-level fields (defensive; confirmed via dump-order) ----------------
function orderedDate(order) {
  const raw = firstDefined(
    order.creation_tsz, order.created_tsz, order.create_timestamp,
    order.created_timestamp, order.order_date, order.created,
  );
  if (!raw) return '';
  const n = Number(raw);
  const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(raw);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function shipping(order) {
  const a =
    order.shipping_address ||
    order.ship_to ||
    (order.shipments && order.shipments[0] && order.shipments[0].address) ||
    order.destination ||
    {};
  const name = firstDefined(a.name, order.name, order.buyer_name, order.recipient_name);
  const line = [
    a.name,
    firstDefined(a.first_line, a.address1, a.line1),
    firstDefined(a.second_line, a.address2, a.line2),
    [a.city, firstDefined(a.state, a.province), firstDefined(a.zip, a.postal_code)]
      .filter(Boolean)
      .join(', '),
    firstDefined(a.country_name, a.country),
  ]
    .filter(Boolean)
    .join(' ');
  return { name: dec(name), shipTo: line.trim() };
}

function tracking(order) {
  const s = (order.shipments || [])[0] || {};
  return firstDefined(s.tracking_code, s.tracking_number, order.tracking_code, '');
}

function sectionFromState(order) {
  return SECTION_STEPS[String(order.order_state_id ?? '')] || '';
}

/**
 * Build one sheet row per line item.
 * @param order Etsy order JSON (as returned by EtsyApi.readOrder)
 * @param opts.section the dashboard section this order was harvested from (STATUS)
 * @returns array of row payload objects (keys match the Apps Script FIELD map)
 */
export function buildRows(order, { section = '' } = {}) {
  const orderId = String(order.order_id ?? order.__orderId ?? order.receipt_id ?? '');
  const ordered = orderedDate(order);
  const { name, shipTo } = shipping(order);
  const track = tracking(order);
  const status = firstDefined(section, sectionFromState(order));

  return (order.transactions || []).map((t) => {
    const p = t.product || {};
    const title = dec(p.title);
    const sku = dec(p.product_identifier);
    return {
      status,
      orderId: `#${orderId}`,
      ordered,
      itemName: title,
      type: classifyType(title, sku),
      sku,
      qty: bulkQty(t),
      color: variationValue(t.variations, /colou?r/i),
      size: variationValue(t.variations, /\bsize\b/i),
      details: personalizationText(t.variations),
      digitizeFolder: '', // filled by the COBRA bridge in a later pass
      vendor: '',
      shipBy: firstDefined(order.expected_ship_date, order.ship_by_date, ''),
      tracking: track,
      customerName: name,
      shipTo,
    };
  });
}
