# Cobra Digitize — UX/UI Audit & Redesign

*Senior product/design review of the vendor-facing digitizing queue, and the
v2 polish built from it. Reviewed as a pre-launch, top-tier product team would.*

---

## First impressions & visual hierarchy

**Problem.** v1 opens straight into a dense 10-column table with no summary. The
eye lands on data before it lands on *meaning* — a vendor can't tell at a glance
how many jobs need work vs. are done.
**Why it hurts.** The #1 job of this screen is "what do I work on next." Making
the user parse a table to answer that adds cognitive load on every visit.
**Recommendation.** Surface the summary before the detail: a row of **count
chips** (All · Queued · Send Mockup · Completed) that double as filters, plus a
clear screen title and live sync state.
**Priority: High.** *(Done in v2.)*

## Navigation & user flow

**Problem.** The only control was an All/Active/Completed segment. "Active"
hid the meaningful split between *Queued* and *Send Mockup*.
**Why it hurts.** Send-Mockup jobs are a different action ("send the customer a
proof") than Queued ("start punching"). Collapsing them buries a real state.
**Recommendation.** Promote each real status to a first-class filter with its
own live count, so the queue's shape reads instantly and one tap isolates any
stage.
**Priority: High.** *(Done in v2.)*

## Friction & unnecessary clicks

**Problem 1.** Changing a status used a tiny caret dropdown — hard to hit on a
phone (the primary vendor device).
**Recommendation.** Keep the popover on desktop, but on mobile open a
thumb-reachable **bottom action sheet** with large targets.
**Priority: High.** *(Done in v2.)*

**Problem 2.** Redundant data: DETAILS repeated the thread and placement text
already shown in their own columns, so the row read noisy.
**Recommendation.** De-duplicate at render — strip the thread/placement tail
from DETAILS and show it once, in its column.
**Priority: Medium.** *(Done in v2.)*

## Mobile & desktop responsiveness

**Problem.** v1 already swapped table→cards, good — but cards lacked a clear
tap target for status and the header controls wrapped awkwardly under 400px.
**Recommendation.** Card status pill becomes the sheet trigger; header collapses
to brand + actions; filter chips scroll horizontally rather than wrap.
**Priority: Medium.** *(Done in v2.)*

## Typography, spacing, color, consistency

**Problem.** Single hard-coded light theme; pure-grey neutrals; no dark mode for
vendors working evenings; white/cream thread dots were nearly invisible.
**Recommendation.** Token-based **light + dark** themes with a neutral carrying a
faint warm bias (thread/canvas world), a single Apple-blue action accent kept
separate from the semantic status colors, a fixed type scale with tabular
numerals for order numbers and sizes, and a hairline ring on every thread swatch
so white/cream read on any ground.
**Priority: High.** *(Done in v2.)*

## Buttons, forms, cards, tables, interactive elements

**Problem.** Interactive elements didn't always *look* interactive; no visible
keyboard focus; the refresh state wasn't obvious.
**Recommendation.** Consistent pill/button system, `:focus-visible` rings,
spinner on refresh, hover/press states on rows and chips, and a confirmation
**toast** on save.
**Priority: Medium.** *(Done in v2.)*

## Information architecture

**Problem.** Everything is one flat list. Completed work mixed into the working
set.
**Recommendation.** Sort by workflow stage (Send Mockup → Queued → Completed)
with completed always sinking to the bottom, plus filters to isolate a stage.
Next step on the roadmap: group headers per stage.
**Priority: Medium.** *(Sort done in v2; group headers = roadmap.)*

## Accessibility & usability

**Problem.** No focus states, color-only status encoding, small tap targets, no
reduced-motion handling.
**Recommendation.** Add text labels alongside color for every status, ARIA roles
on the filter tabs and status menus, ≥44px touch targets, visible focus, and
`prefers-reduced-motion` guards on all transitions. Contrast checked ≥ 4.5:1 in
both themes.
**Priority: High.** *(Done in v2.)*

## Conversion / engagement / retention (internal-tool lens)

For an internal + vendor tool, "conversion" = **task completion and trust**:
- **Optimistic updates + toast** make status changes feel instant and reliable →
  vendors trust the tool and keep using it instead of the raw sheet.
- **Live sync badge** ("Live · two-way sync") signals the data is real-time,
  reducing double-checking against the sheet.
- **Zero-training layout** (recognizable from the sheet) lowers onboarding cost
  for new vendors.

---

## Prioritized redesign roadmap

| # | Item | Priority | Status |
|---|------|----------|--------|
| 1 | Summary/count chips as filters | High | ✅ v2 |
| 2 | Light + dark themes, token system | High | ✅ v2 |
| 3 | Mobile bottom-sheet status picker | High | ✅ v2 |
| 4 | Accessibility pass (focus, ARIA, targets, motion) | High | ✅ v2 |
| 5 | De-dupe details, thread swatch ring | Medium | ✅ v2 |
| 6 | Stage sort + toast + focus states | Medium | ✅ v2 |
| 7 | Stage **group headers** in the list | Medium | ▢ next |
| 8 | **New Job** intake form → appends a sheet row | High | ▢ next |
| 9 | Upload finished stitch file against a job | High | ▢ next (Glide-friendly) |
| 10 | Per-vendor logins / assignment column | Medium | ▢ next |
| 11 | Saved views & bulk status change | Low | ▢ later |

## Wireframe notes — key screens

- **Queue (this screen):** app bar → title + sync → filter/count chips + search →
  sorted list. Completed collapsed to bottom; optional stage group headers.
- **Job detail (roadmap):** full-screen sheet — big design title, hat placement
  diagram (F/B/L/R dots on a cap silhouette), thread chips, folder button,
  status action, and an **Upload artwork** dropzone.
- **New Job (roadmap):** short form — Order, Details, placements, thread, 3D
  toggle, folder — writing a new row via Apps Script.

## Design system recommendation

- **Type:** system UI stack (SF/Segoe/Inter fallback — no webfont CDN needed).
  Scale 12 / 13.5 / 15 / 17 / 20 / 24; tabular-nums for order #s and sizes;
  balanced headings.
- **Neutrals (light):** canvas `#f5f5f7`, panel `#ffffff`, ink `#1d1d1f`, muted
  `#86868b`, hairline `#ececee`.
- **Neutrals (dark):** canvas `#0f1012`, panel `#1a1c1e`, ink `#f2f2f4`, muted
  `#98999e`, hairline `#2a2c2f`.
- **Accent (actions only):** `#0071e3` / dark `#0a84ff`. Brand mark gold
  `#e0a400`.
- **Semantic status:** Queued grey, Send Mockup amber, Completed green — always
  paired with a text label, never color alone.
- **Spacing:** 4-pt base; 14–20px card padding; 12px gaps.
- **Components:** rounded 10–18px, one elevation for cards, pill controls,
  `:focus-visible` ring, motion ≤ 250ms and reduced-motion-aware.

## Executes-this-well references

- **Linear** — status pills, keyboard-first, restrained palette, instant
  optimistic updates.
- **Things 3 / Apple Reminders** — calm list density, satisfying complete
  interaction, the mobile card feel.
- **Airtable / Glide** — sheet-backed views and mobile record cards (the natural
  home if you want vendor logins + uploads without custom backend work).
- **Stripe Dashboard** — summary-before-detail, tabular numerics, quiet color
  with semantic accents only where they carry meaning.
