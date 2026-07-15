// Central configuration: constants, tag registry, rule inputs, Etsy endpoints.
// Everything a human might reasonably want to tweak lives here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

// --- Tiny .env loader (no dependency) ---------------------------------------
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const bool = (v, dflt) => (v == null || v === '' ? dflt : v === '1' || v === 'true');

// --- Runtime settings -------------------------------------------------------
export const SETTINGS = {
  shopId: process.env.ETSY_SHOP_ID || '22905049',
  shopSenderId: process.env.ETSY_SHOP_SENDER_ID || '288505356',
  // apply = actually write to Etsy. Default OFF (dry-run). CLI --apply overrides.
  apply: bool(process.env.ETSY_APPLY, false) || process.argv.includes('--apply'),
  headless: bool(process.env.ETSY_HEADLESS, true) && !process.argv.includes('--headed'),
  throttleMs: Number(process.env.ETSY_THROTTLE_MS || 350),
  cobraCsvUrl: process.env.COBRA_SHEET_CSV_URL || '',
  storageStatePath: path.join(ROOT, 'storageState.json'),
  autoTaggedPath: path.join(ROOT, 'state', 'autoTagged.json'),
  origin: 'https://www.etsy.com',
};

// --- Progress-step pages we sweep, and the section tag each implies ----------
// Step ids are Etsy's stable custom-step ids (see the extension's SECTION_STEPS).
// order_state_id on the order JSON maps to these directly and is more reliable
// than which tab we harvested from.
export const SECTION_STEPS = {
  '1233596522887': 'IN PRODUCTION',
  '1272457511245': 'ART & STITCH',
  '1278209011482': 'RAUL EMBROIDERY',
  '1272365687455': 'ALFREDO DTG',
  '1268105390664': 'SEND MOCKUP',
};
export const SECTION_TAG_NAMES = new Set(Object.values(SECTION_STEPS));

// Pages to harvest order ids from. `section` is the fallback hint when the order
// JSON's order_state_id doesn't map. New + Completed carry no section tag.
export const STEP_PAGES = [
  { path: '/your/orders/sold/new', section: null },
  ...Object.entries(SECTION_STEPS).map(([id, section]) => ({
    path: `/your/orders/sold/${id}`,
    section,
  })),
  { path: '/your/orders/sold/completed', section: null },
];

// --- Tag registry (name → color). Colors matter for a future dashboard; the
// note itself is just the names. Array ORDER = importance order (left → right),
// exactly like the extension's `tags` array. ------------------------------
export const TAGS = [
  { name: 'PRINTFUL', color: '#0F766E' },
  { name: 'PRINTIFY', color: '#1B9E5A' },
  { name: 'CUSTOM CAT', color: '#6D28D9' },
  { name: 'SEND MOCKUP', color: '#C2410C' },
  { name: 'ALFREDO DTG', color: '#185FA5' },
  { name: 'MOCKNECK', color: '#0891B2' },
  { name: 'EMBROIDERY ADD-ON', color: '#B45309' },
  { name: 'BULK ORDER', color: '#9C36B5' },
  { name: 'CAMO T-SHIRT', color: '#4D7C0F' },
  { name: 'CROP T-SHIRT', color: '#DB2777' },
  { name: 'SHORTS', color: '#0D9488' },
  { name: 'LOUNGE SET', color: '#7C3AED' },
  { name: 'OTTO CAP 31-069', color: '#2D8C6F' },
  { name: 'DIGITIZE', color: '#E8590C' },
  // Section tags (importance-wise they render far right, enforced in note.js):
  { name: 'IN PRODUCTION', color: '#374151' },
  { name: 'ART & STITCH', color: '#374151' },
  { name: 'RAUL EMBROIDERY', color: '#374151' },
  { name: 'ALFREDO DTG SECTION', color: '#374151' },
];

// Importance index for ordering the note. Lower = earlier (more important / left).
export const IMPORTANCE = new Map(TAGS.map((t, i) => [t.name, i]));

// The 🏷️ label prefix. \u{1F3F7} = label emoji; tolerate the VS-16 selector.
export const NOTE_EMOJI = '\u{1F3F7}️';
export const NOTE_EMOJI_RE = /^\u{1F3F7}️?/u;

// --- Rule matchers ----------------------------------------------------------
export const RULES = {
  // Strongest DIGITIZE signal — SKU (always DIGITIZE, regardless of title).
  alwaysDigitizeSkus: ['OTTO CAP 31-069 CUSTOM', 'OTTO - 5 PANEL'],
  // Embroidered-hat SKUs that DIGITIZE only when the title also says "Custom".
  embroideredHatSkuPrefixes: ['OTTO', 'YUPOONG'],
  // Titles that DIGITIZE on their own.
  digitizeTitleRe: /custom embroidered hat|custom hat|bulk order hats/i,
  customRe: /\bcustom\b/i,
  // SKU that also gets the OTTO CAP 31-069 tag (in addition to DIGITIZE).
  ottoCapSku: 'OTTO CAP 31-069 CUSTOM',
  // ALFREDO DTG (custom mocknecks).
  mockneckSkuPrefix: 'MOCKNECK',
  mockneckTitleRe: /mockneck/i,
  // PRINTIFY blanks.
  printifySku: 'BELLA CANVAS 3001',
  // Pre-designed hat names — these NEVER get DIGITIZE even on an always-digitize
  // SKU (the Dilly-Dally / OTTO-5-PANEL conflict → SKIP + flag for review).
  preDesignedRe: /\b(margs?|champagne|america|gameday|dilly\s*dally)\b/i,
  // is_private + blank-SKU add-on/fee charges that ride along — never tag, never
  // count toward BULK. (Fixes the "Extra design fee for 10 hats" BULK false pos.)
  addOnTitleRe: /\b(fee|shipping|location|rush|add.?on|tote)\b/i,
  // "Extra <color> Hats" private listings — ambiguous, SKIP + flag (needs Matt).
  extraHatsRe: /^extra\b.*\bhats?\b/i,
  // Mockup / proof language.
  mockupRe: /mock\s*-?\s*up|\bproof\b/i,
  // BULK threshold: strictly greater than this many units.
  bulkUnitThreshold: 6,
};
