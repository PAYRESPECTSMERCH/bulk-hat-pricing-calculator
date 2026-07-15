// The tagging brain. Pure functions over an Etsy order JSON — no I/O — so the
// rules are easy to read, reason about, and (later) unit-test.
//
// Ports the extension's auto-rules PLUS the sweep-only intelligence the
// extension couldn't do (is_private add-on guard, the fee/add-on BULK fix,
// SKIP+flag for the documented rule conflicts).

import { RULES, SECTION_STEPS } from './config.js';

const dec = (s) =>
  String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

const startsWithAny = (sku, prefixes) =>
  prefixes.some((p) => sku.toUpperCase().startsWith(p.toUpperCase()));

/**
 * Classify one transaction (line item).
 * @returns {{ tags: string[], units: number, flags: string[] }}
 */
function classifyItem(t, idx) {
  const product = t.product || {};
  const sku = dec(product.product_identifier);
  const title = dec(product.title);
  const isPrivate = product.is_private === true;
  const qty = Number(t.quantity) || 0;
  const tags = [];
  const flags = [];

  // --- Guard 1: is_private blank-SKU add-on / fee charges — never tag, 0 units.
  if (isPrivate && !sku && RULES.addOnTitleRe.test(title)) {
    return { tags: [], units: 0, flags: [] };
  }

  // --- Guard 2: "Extra <color> Hats" private listings — ambiguous, SKIP + flag.
  if (isPrivate && !sku && RULES.extraHatsRe.test(title)) {
    flags.push(`item ${idx} SKIP+flag "Extra … Hats" private listing: "${title}" — DIGITIZE or bare? (needs Matt)`);
    return { tags: [], units: qty, flags };
  }

  // --- Units for BULK (max of quantity and a number-first "N HATS/SETS" in title)
  const titleUnitsMatch = title.match(/\b(\d+)\s*(hats?|sets?)\b/i);
  const titleUnits = titleUnitsMatch ? Number(titleUnitsMatch[1]) : 0;
  const units = Math.max(qty, titleUnits);

  // --- DIGITIZE decision ----------------------------------------------------
  let digitize = false;
  if (sku === 'OTTO CAP 31-069 CUSTOM') {
    digitize = true;
    tags.push('OTTO CAP 31-069'); // in addition to DIGITIZE
  } else if (RULES.alwaysDigitizeSkus.includes(sku)) {
    // e.g. OTTO - 5 PANEL. But a pre-designed title beats the SKU → SKIP + flag.
    if (RULES.preDesignedRe.test(title)) {
      flags.push(`item ${idx} SKIP+flag pre-designed title on always-DIGITIZE SKU "${sku}": "${title}" (needs Matt)`);
    } else {
      digitize = true;
    }
  } else if (startsWithAny(sku, RULES.embroideredHatSkuPrefixes) && RULES.customRe.test(title)) {
    digitize = true;
  } else if (RULES.digitizeTitleRe.test(title)) {
    digitize = true;
  } else if (
    (RULES.embroideredHatSkuPrefixes.some((p) => new RegExp(`\\b${p}\\b`, 'i').test(title)) ||
      startsWithAny(sku, RULES.embroideredHatSkuPrefixes)) &&
    RULES.customRe.test(title)
  ) {
    digitize = true;
  }
  if (digitize) tags.push('DIGITIZE');

  // --- ALFREDO DTG (custom mocknecks) --------------------------------------
  if (
    sku.toUpperCase().startsWith(RULES.mockneckSkuPrefix) ||
    (RULES.mockneckTitleRe.test(title) && RULES.customRe.test(title))
  ) {
    tags.push('ALFREDO DTG');
  }

  // --- PRINTIFY -------------------------------------------------------------
  if (sku === RULES.printifySku) tags.push('PRINTIFY');

  return { tags: [...new Set(tags)], units, flags };
}

/** Which section tag does this order currently belong to? Prefer order_state_id. */
export function sectionForOrder(order, hint) {
  const stateId = String(order.order_state_id ?? '');
  if (SECTION_STEPS[stateId]) return SECTION_STEPS[stateId];
  return hint || null;
}

/** Scan buyer-side text + shop convo for mockup/proof language (SEND MOCKUP candidate). */
export function detectSendMockup(order, convo) {
  const texts = [];
  if (order.note_from_buyer) texts.push(dec(order.note_from_buyer));
  for (const t of order.transactions || []) {
    for (const v of t.variations || []) {
      if (String(v.type || '').endsWith('_Personalization')) texts.push(dec(v.value));
    }
  }
  const buyerHit = texts.some((s) => RULES.mockupRe.test(s));
  // A shop-authored mockup message (mockup was SENT) — from our own user id.
  let shopHit = false;
  if (convo && Array.isArray(convo.messages)) {
    for (const m of convo.messages) {
      if (String(m.sender_user_id) === String(order.__shopSenderId) && RULES.mockupRe.test(dec(m.message_body))) {
        shopHit = true;
      }
    }
  }
  return { buyerHit, shopHit, candidate: buyerHit };
}

/**
 * Compute the additive tag set + section + flags for a whole order.
 * Does NOT decide removals (JOB C) or whether once-ever guards block a tag —
 * the sweep layers those on, because they need persisted state.
 *
 * @returns {{ orderId, itemTags: Map<number,string[]>, orderTags: string[],
 *            section: string|null, units: number, flags: string[],
 *            sendMockup: {buyerHit:boolean, shopHit:boolean, candidate:boolean} }}
 */
export function computeOrder(order, { sectionHint = null, convo = null } = {}) {
  const orderId = String(order.order_id ?? order.receipt_id ?? order.__orderId ?? '');
  const itemTags = new Map();
  const flags = [];
  let totalUnits = 0;
  let realItemCount = 0;

  const txns = order.transactions || [];
  txns.forEach((t, i) => {
    const idx = i + 1; // 1-based, display order (the item key)
    const { tags, units, flags: itemFlags } = classifyItem(t, idx);
    flags.push(...itemFlags);
    if (units > 0) {
      realItemCount += 1;
      totalUnits += units;
    }
    if (tags.length) itemTags.set(idx, tags);
  });

  // --- Order-level BULK ORDER ----------------------------------------------
  const orderTags = [];
  const anythingTagged = itemTags.size > 0;
  if (totalUnits > RULES.bulkUnitThreshold || (realItemCount >= 2 && !anythingTagged)) {
    orderTags.push('BULK ORDER');
  }

  const section = sectionForOrder(order, sectionHint);
  const sendMockup = detectSendMockup(order, convo);

  return { orderId, itemTags, orderTags, section, units: totalUnits, flags, sendMockup };
}

/** Flatten computed item + order tags into the unique name set for the note. */
export function unionNames(computed) {
  const set = new Set(computed.orderTags);
  for (const tags of computed.itemTags.values()) for (const name of tags) set.add(name);
  return [...set];
}
