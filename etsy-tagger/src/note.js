// The 🏷️ private-note mirror: one note per order, a clean comma-separated,
// importance-ordered list of tag NAMES with no item numbers (Matt's Option 1).
//
//   🏷️ SEND MOCKUP, DIGITIZE, IN PRODUCTION
//
// Ordering rule (enforced here): normal tags in importance order → DIGITIZE
// second-from-right → section tag far right.

import { IMPORTANCE, NOTE_EMOJI, NOTE_EMOJI_RE, SECTION_TAG_NAMES } from './config.js';

const DIGITIZE = 'DIGITIZE';

/** Is this private-order-note text our 🏷️ mirror note? */
export function isTagNote(text) {
  return NOTE_EMOJI_RE.test((text || '').trim());
}

/**
 * Parse tag names out of an existing note.
 * Handles the current format plus legacy `[TAGS] ...` and `🏷️ A | 1: B`.
 * Any token starting "DIGITIZE" (incl. "DIGITIZE (IN PROGRESS)") normalizes to
 * the single DIGITIZE tag — prevents duplicate-DIGITIZE on re-apply.
 */
export function parseNote(text) {
  if (!text) return [];
  let s = text.trim();
  if (!isTagNote(s) && !/^\[TAGS\]/i.test(s)) return [];
  s = s.replace(NOTE_EMOJI_RE, '').replace(/^\[TAGS\]/i, '').trim();
  // Legacy item-level format used " | " to separate order-level from per-item.
  s = s.split('|')[0];
  const out = [];
  for (let name of s.split(',')) {
    name = name.trim();
    if (!name) continue;
    if (/^DIGITIZE\b/i.test(name)) name = DIGITIZE;
    if (!out.some((n) => n.toUpperCase() === name.toUpperCase())) out.push(name);
  }
  return out;
}

/**
 * Order a set of tag names for display: normal tags by importance, then
 * DIGITIZE, then the section tag last. `sectionTag` is the CURRENT section
 * (any other section tag names in `names` are dropped — tags follow orders
 * between steps, so stale section tags are replaced, not accumulated).
 */
export function orderNames(names, sectionTag) {
  const set = new Set(names.map((n) => n.trim()).filter(Boolean));
  // Strip every section tag; we re-add only the current one.
  for (const s of SECTION_TAG_NAMES) set.delete(s);
  const hasDigitize = set.delete(DIGITIZE);

  const normals = [...set].sort((a, b) => {
    const ia = IMPORTANCE.has(a) ? IMPORTANCE.get(a) : Number.MAX_SAFE_INTEGER;
    const ib = IMPORTANCE.has(b) ? IMPORTANCE.get(b) : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });

  const ordered = [...normals];
  if (hasDigitize) ordered.push(DIGITIZE);
  if (sectionTag && SECTION_TAG_NAMES.has(sectionTag)) ordered.push(sectionTag);
  return ordered;
}

/** Build the note string from ordered names. Empty names → empty string. */
export function buildNote(orderedNames) {
  if (!orderedNames.length) return '';
  return `${NOTE_EMOJI} ${orderedNames.join(', ')}`;
}

/** True when two ordered name lists are identical (order-sensitive). */
export function sameNames(a, b) {
  if (a.length !== b.length) return false;
  return a.every((n, i) => n === b[i]);
}
