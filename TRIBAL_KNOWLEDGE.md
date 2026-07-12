# Tribal Knowledge

> The stuff that lives in Matt's head and scattered across the code, written
> down so a future teammate (or future Matt) can pick this up cold. If you read
> nothing else, read the **TL;DR** and **Gotchas** sections.

---

## TL;DR — what this repo actually is

The repo is named `bulk-hat-pricing-calculator`, but it's grown into **two
separate web apps** that happen to live in the same repo and share nothing but
hosting and a couple of PWA icons:

| App | Path | What it does | Who uses it |
|-----|------|--------------|-------------|
| **Headwear Bulk Pricing Calculator** | `/index.html` (site root) | Quote embroidery hat orders and see the internal cost/profit breakdown | Matt / internal (pricing quotes) |
| **Cobra Digitize** | `/cobra/` | Live production/digitizing job queue, mirrored from Google Sheets | Matt + outside vendors (digitizers, printers) |

Both are **single-file, no-build, static HTML apps** — plain HTML/CSS/JS in one
file, no framework, no bundler, no `npm install`. You edit the `.html` file and
it's live. That simplicity is intentional; keep it that way unless there's a
real reason not to.

The business behind it is **Apparel Hotline / merch** — custom embroidered hats
and printed apparel sold (originally) on Etsy, produced through a set of outside
vendors. Everything here exists to (a) price jobs and (b) keep vendors and Matt
looking at the same job status without giving them raw access to the sheets.

Hosting is **GitHub Pages** off this repo (`PAYRESPECTSMERCH/bulk-hat-pricing-calculator`).
Site root = the calculator; `/cobra/` = the queue. There's no CI, no deploy
step — push to the deployed branch and Pages serves it.

---

## Part 1 — Headwear Bulk Pricing Calculator (`/index.html`)

A one-page calculator: enter **quantity**, **number of embroidery locations**
(1–4), and **3D puff yes/no**, hit *GET PRICING*, and it shows the customer sale
price plus a full internal cost/profit breakdown.

### The pricing model (the actual business economics)

**Customer price** comes purely from a **quantity-tier table** — price per hat
drops as volume rises. These are the current tiers (editable in the UI, see
below):

| Qty | Price / hat |
|-----|-------------|
| 1–5 | $29 |
| 6–11 | $26 |
| 12–23 | $21 |
| 24–35 | $19 |
| 36–47 | $17 |
| 48–71 | $15 |
| 72–99 | $13 |
| 100+ (to 9999) | $11 |

Customer sale price = `pricePerHat × qty`. **The customer never sees the cost
breakdown** — only Sale Price and Price Per Hat. Everything below is internal.

**Internal cost assumptions** (hardcoded in the `costs` object near the top of
the `<script>`):

| Cost | Value | Applied |
|------|-------|---------|
| Blank hat | $4.00 | per hat |
| Embroidery (first location) | $2.50 | per hat |
| Each extra location | $1.50 | per hat, per location beyond the first |
| 3D puff | $3.50 | per hat (only if puff = Yes) |
| Packaging | $0.50 | per hat |
| Digitizing (first location) | $5.00 | **once per order (flat)** |
| Digitizing (extra location) | $2.50 | once per extra location (flat) |
| Shipping | $6.50 | **once per order (flat), internal-only — not charged to customer** |
| Etsy listing fee | $0.20 | once per order |
| Etsy transaction fee | 6.5% of sale price | once |
| Etsy payment processing | 3% of sale price + $0.25 | once |

**The single most important non-obvious rule:** **digitizing and shipping are
flat per-order costs, not per-hat.** That's *why* the margin explodes on large
runs — the $5 digitizing and $6.50 shipping get amortized across every hat. On a
1-hat order they're a huge chunk of cost; on a 100-hat order they're rounding
error. If you ever "simplify" the math to per-hat, you'll badly mis-price small
orders. Everything else (blank, embroidery, puff, packaging) scales per hat.

- Embroidery per hat = `$2.50 + (locations − 1) × $1.50`.
- Digitizing per order = `$5.00 + (locations − 1) × $2.50`.
- Etsy fees are calculated on the **customer sale price**, so they rise with the
  quote, not with cost.
- Margin shown = `profit / salePrice × 100`.

### The admin panel (edit pricing tiers)

The ⚙ *Edit Pricing Tiers* button reveals a hidden table where you can change the
qty breaks and per-hat prices on the fly, then *Apply Pricing Changes*.

**Gotcha:** those edits are **in-memory only**. There is no `localStorage`, no
persistence — reload the page and the tiers snap back to the hardcoded defaults
in the HTML. To change the *real* default tiers, edit the `<tr>` rows in
`index.html` (lines ~34–41). The admin panel is for what-if quoting, not for
saving new pricing.

### Known bugs / footguns in the calculator

- **Out-of-range qty crashes.** `priceTiers.find(...)` returns `undefined` if qty
  is `0`, blank, negative, non-numeric, or `> 9999`. The next line reads
  `priceTier.price` and throws — the calculator silently does nothing (check the
  console). The top tier's max is `9999`; an order of 10,000+ breaks it.
- The `costs` values are **not exposed in the admin panel** — only the tier
  table is editable in-UI. To change blank cost, fees, etc., you edit the code.
- The Etsy fee assumptions (6.5% / 3% + $0.25 / $0.20) are frozen in code from
  whenever this was written. If Etsy changes fees, or you sell somewhere else
  (Shopify), these are wrong and nobody will notice — they're buried.
- The calculator **is now a real installable/offline PWA**: `index.html` links
  `manifest.json`, sets theme-color/apple-touch-icon, and registers
  `service-worker.js`. The SW (cache `hat-pricing-cache-v2`) precaches the shell
  (HTML, manifest, both icons) and uses a **network-first** strategy — online
  users always get the latest version, offline users get the cached copy.
  *(Historical note: through mid-2026 this scaffolding existed but was never
  wired in — the manifest/SW were dead files. If offline caching ever "sticks"
  on a stale version, bump `CACHE_NAME` in `service-worker.js` to force a
  refresh.)*

---

## Part 2 — Cobra Digitize (`/cobra/`)

A vendor-facing, mobile-first **live job queue**. It mirrors Google Sheets: read
jobs, change a job's status, edit cells, attach artwork files from Google Drive
— and it writes straight back to the sheet. Vendors never touch the raw sheet.

### Architecture in one breath

```
Browser (cobra/index.html, one big file)
   │  fetch()  ?action=list / setStatus / setCell / moveRow / browse / upload …
   ▼
Google Apps Script Web App  (cobra/AppsScript.gs, deployed as /exec)
   │  runs "as Matt", so it can touch any sheet/folder Matt owns
   ▼
Google Sheets (jobs)  +  Google Drive (artwork folders)
```

- **Frontend:** `cobra/index.html` — ~1600 lines, everything (config, CSS, JS)
  in one file. No build.
- **Backend:** `cobra/AppsScript.gs` — pasted into the Google Sheet's Apps Script
  editor and deployed as a Web App. **This code is not deployed by pushing to
  git.** Git holds a *copy*; the running version lives in Google. See "Deploying
  the backend" below — this trips everyone up.
- **Docs:** `cobra/SETUP.md` (deploy/connect guide) and `cobra/UX-AUDIT.md` (the
  design rationale + roadmap).

### Reads have three fallback tiers

The app tries, in order, and stops at the first that works:

1. **Apps Script `/exec`** (`action=list`) → live data **with write-back**
   (`CAN_WRITE=true`). This is the real mode.
2. **Published-CSV** via `gviz/tq?...out:csv` if the Apps Script URL is missing
   or fails → live data **read-only** (`CAN_WRITE=false`). Requires the sheet be
   "Published to web."
3. **Built-in `SAMPLES`** → fake rows so the UI renders for a demo. Header reads
   "Sample data."

Once real data has loaded, if the network later fails the app **keeps the last
good data and shows an offline banner** — it will *never* downgrade a live
workbook back to sample rows (see `WBJOBS` cache in `load()`).

### The multi-workbook system (this is the big one)

There isn't one queue — there are **four**, defined in the `WORKBOOKS` array at
the top of `cobra/index.html`:

| id | Name | Sheet | Purpose |
|----|------|-------|---------|
| `cobra` | Cobra Digitize | (default) | Embroidery digitizing queue |
| `artstitch` | Art & Stitch | separate sheet | Another digitizing vendor |
| `alfredo` | Alfredo Production | tab in a sheet | Print/production vendor |
| `raul` | Raul Production | tab in a sheet | Print/production vendor |

Critical facts about how workbooks work:

- **All four share ONE Apps Script deployment** (the same `/exec` URL is repeated
  in every workbook entry). They're told apart by passing `?sheetId=…&gid=…` on
  every request. The backend's `getSheet_()` opens whatever sheet/tab you ask
  for. This works only because the deployment **executes as Matt**, who has
  access to all of these sheets. One backend, many sheets.
- Each workbook carries its **own column layout, own status list (with colors,
  tiers, stages, ranks), and own artwork folder**. The UI is entirely
  config-driven off this array — the table, chips, parsing, and colors all come
  from the active workbook's definition. **To add a new vendor/queue, you add one
  object to `WORKBOOKS`** — you don't touch the backend at all.
- Column `type`s the UI understands: `status · order · badge3d · details · text ·
  thread · swatch · placement · folder`. Pick the right type and the cell renders
  and parses correctly.
- `gid` is the number after `#gid=` in a sheet tab's URL. `sheetId` is the long
  id in the sheet URL. Get both wrong and you silently load the wrong tab.

### Access modes / sharing links

Two URL params control what a visitor sees (parsed near the top of the script):

- `?v=<token>` — **vendor link.** Locks the app to one workbook, hides the
  workbook switcher and the "Today" overview. Each workbook has a `token`
  (e.g. Cobra = `c7k2xq9d`). **This is the link you send a vendor** so they only
  see their own queue.
- `?wb=<id>` — **owner deep link.** Opens on a specific workbook but leaves
  everything visible (switcher, etc.). For Matt.
- No param → opens the last-used workbook (remembered in `localStorage`
  `cobra-wb`), default `cobra`.

**Security reality check:** the vendor `token` is *cosmetic*, not security. The
Apps Script `/exec` URL, every `sheetId`, and every token are all sitting in the
client-side source of `cobra/index.html`, which is public on GitHub Pages.
Anyone who views source can hit the backend for any workbook. The deployment is
"Anyone can access." The only real lock available is the optional **PIN** (see
below). Treat these sheets as effectively readable/writable by anyone who finds
the URL. Don't put anything truly sensitive in them.

### Sheet-authoring conventions the UI depends on

The parsing is clever but **assumes the humans filling the sheet follow
conventions.** If a vendor types things differently, the UI quietly mis-parses.
Key ones (Cobra workbook):

- **Qty** is auto-extracted from the free-text `DETAILS` cell — it looks for
  `QTY 24`, `Qty: 24`, `qty-24`, etc. It's pulled out and shown as a badge, then
  stripped from the details text so it isn't shown twice.
- **Placement sizes** in FRONT/BACK/LEFT/RIGHT are pulled from patterns like
  `4.5" W` / `5" W` (number followed by W). The rest of the cell becomes the
  placement name (upper-cased, truncated ~24 chars).
- **Thread colors** → colored dots. The app matches **named colors** from a
  fixed dictionary (`COLORS`): navy, gold, royal blue, forest green, cream, etc.
  Multi-word colors ("yellow gold", "baby blue") are matched first. It shows up
  to 3 dots. A color it doesn't recognize just won't get a dot. Leading the cell
  with the literal word "thread" is fine — it's stripped.
- **Folder / Order / placement links:** the backend reads the **rich-text
  hyperlink** out of the cell (not the visible text). So "Digitize Folder" works
  by making the cell text a *link* to the Drive folder; "Order" cells link to the
  order. If someone pastes a bare URL as plain text instead of a hyperlink, no
  link surfaces.
- **"Needs artwork" logic:** a placement column that has *text* (a design named)
  but *no hyperlink* (no file attached) counts as "needs art." The Order cell
  shows a `filled/required` art badge, and there's a "Needs Art" filter. Once
  every required placement has a linked file (or the job is Done), it flips to
  "✓ art".
- **3D puff:** any non-empty value in the `3D` column shows a puff badge.

### Status system (tiers · stages · ranks)

Each status in a workbook has four properties that drive the whole UI:

- **`tier`**: `quiet` (normal grey/subtle pill) or `urgent` (loud colored fill).
  Urgent = "a human needs to do something," e.g. *Cannot Find Order*, *Design
  Questions*, *Update Artwork*, *Need to Order*, *Pull Inventory*.
- **`stage`**: `needs` → `active` → `waiting` → `done`. Drives the optional
  **stage grouping** view (group headers) and the "Needs Action / Active /
  Waiting / Done" buckets. `done` jobs always sink to the bottom.
- **`rank`**: sort order of the **filter chips** (lower = earlier). Not the row
  order — rows mirror the sheet.
- **`dot` / `fill`**: light + dark colors. These were hand-tuned to roughly match
  the color of each status's dropdown swatch in the actual Google Sheet, so the
  app "feels like the sheet." (Art & Stitch's colors are noted in-code as
  *placeholder defaults* — they haven't been matched to the real dropdown yet.)

Row order in the table is **not sorted** — `sortJobs()` deliberately returns the
list as-is to mirror the sheet's manual/drag order. Reordering rows in the app
calls `moveRow` and physically moves the row in the sheet.

### The backend (`cobra/AppsScript.gs`) — what each action does

`doGet` dispatches on `?action=`:

- `list` (default) — return all job rows + extracted hyperlinks.
- `setStatus` — write a status into a row; also stamps the TIMESTAMP column if
  present.
- `setCell` — write any column by header name (rich text, optional link URL).
- `moveRow` — delete + re-insert a row to reorder (preserves values *and* rich
  text links).
- `listFiles` — recent files across the artwork folder **tree** (attach picker).
  Capped: walks ≤ 12 folders, collects ≤ 200 files, returns the 40 most recent.
- `browse` — one folder's direct files + subfolders (with file counts), for
  navigation.
- `deleteFile` — trashes a Drive file.
- `doPost` handles `upload` — base64 file → Drive folder.

Two backend design notes worth knowing:
- **Speed depends on the Drive Advanced Service.** The code uses `Drive.Files.*`
  (batched v2 API) instead of `DriveApp` per-file calls — dramatically faster for
  the sidebar. If the Advanced Service isn't enabled, `Drive` is undefined and
  everything Drive-related throws. It **must** be added (Services → Drive API →
  v2) and `authorize()` run once.
- **Optional PIN.** Off by default. Set a Script Property named `PIN` and every
  request must include `&pin=…`. The frontend prompts for it once and stores it
  in `localStorage` (`cobra-pin`). This is the only real access control.

### Deploying the backend — READ THIS, it bites everyone

The Apps Script code in git is a **copy**. The live backend is the deployed
version inside Google. When you change `AppsScript.gs`:

1. Paste the new code into the sheet's Apps Script editor and **Save**.
2. **Deploy → Manage deployments → Edit (pencil) → Version: New version →
   Deploy.**

**Do NOT use "New deployment."** A new deployment mints a **new `/exec` URL**,
which instantly breaks **all four workbooks** (they all hardcode the old URL).
"Manage deployments → New version" keeps the URL stable. If the app suddenly
can't write, first suspect that someone created a fresh deployment and the URL
drifted — update the URL in every `WORKBOOKS` entry, or (better) re-point the
existing deployment.

### Write path, offline, undo (frontend behavior)

- **Optimistic UI + serialized write queue.** Editing a cell / changing status
  updates the screen *immediately*, then enqueues the write. The queue
  (`WQ`) runs one request at a time, **retries 3× with backoff** (700ms ×
  tries), then shows a "Save failed" toast. A "Saving… / Saved ✓" indicator
  reflects queue state. This is why it feels instant and survives flaky vendor
  connections.
- **Undo/redo** (`⌘Z`/`⌘⇧Z`, buttons in the header). Stack capped at 200. Covers
  field edits *and* row reorders. Each undo re-issues the corresponding sheet
  write.
- **Preview mode:** if the sheet isn't writable (read-only CSV mode or sample
  data), edits show a "Preview only — connect the sheet to save" toast and don't
  persist.
- **Mobile UX** is a first-class concern (vendors work on phones): bottom action
  sheet for status, ≥44px tap targets, pull-to-refresh, swipe actions,
  tap-to-edit, skeleton loaders, native momentum scroll. See `UX-AUDIT.md` for
  the reasoning behind each.

### localStorage keys (so you know what state is client-side)

`cobra-wb` (active workbook), `cobra-theme` (auto/light/dark, default dark),
`cobra-grouped` + `cobra-gcol` (stage-grouping on/off + collapsed groups),
`cobra-pin`, `cobra-rh` (row height), plus per-workbook column widths.

---

## Gotchas — the greatest hits

1. **Repo name lies.** It's two apps; the calculator is just the older one.
2. **Digitizing + shipping are per-order, not per-hat.** This is the whole reason
   small orders are expensive and big ones are cheap. Never make it per-hat.
3. **Backend code isn't deployed by git.** You paste it into Apps Script and
   "Manage deployments → New version." Git is only a backup copy.
4. **Never "New deployment" the backend** — it changes the `/exec` URL and breaks
   all four workbooks at once.
5. **All 4 workbooks share one backend URL**, differentiated by `sheetId`/`gid`.
   Change vendors/queues by editing the `WORKBOOKS` array, not the backend.
6. **Vendor `?v=token` links are cosmetic, not secure.** Everything is in public
   client source. The PIN is the only real lock. Keep sheets non-sensitive.
7. **Drive Advanced Service (v2) must be enabled** in Apps Script or the sidebar
   and file features throw.
8. **Sheet parsing relies on human conventions** — `QTY 24` in details, `4.5" W`
   sizes, recognized color names, and **real hyperlinks** (not pasted text) for
   folders/orders. Off-format data quietly mis-renders.
9. **Calculator admin edits don't persist** — reload wipes them. Edit the HTML for
   real default changes. And **qty outside 1–9999 crashes** the calc.
10. **Calculator PWA is live** — it links its manifest and registers a
    network-first service worker (`hat-pricing-cache-v2`). To ship an update to
    already-installed users, bump `CACHE_NAME` in `service-worker.js`.

---

## Roadmap / unfinished ideas (from `cobra/UX-AUDIT.md`)

Already shipped: count-chip filters, light/dark themes, mobile status sheet,
accessibility pass, de-duped details, stage sort + toast, stage group headers.

Not yet built (in rough priority):

- **New Job intake form** → appends a row to the sheet (currently jobs are born
  in the sheet, not the app).
- **Upload finished stitch file against a job** (partially there via the attach
  flow; a proper per-job dropzone is the goal).
- **Per-vendor logins / an assignment column** — right now "auth" is just the
  token link.
- Saved views & bulk status change.
- If custom-backend upkeep ever gets annoying, `UX-AUDIT.md` flags **Glide /
  Airtable** as the natural sheet-backed home for logins + uploads without
  maintaining Apps Script.

---

## Quick reference — "where do I change…?"

| I want to change… | Edit this |
|-------------------|-----------|
| Hat price tiers (permanently) | `index.html`, the `<tr>` rows ~34–41 |
| Internal costs / Etsy fees | `index.html`, the `costs` object ~73 |
| Add a vendor / queue | `cobra/index.html`, add to `WORKBOOKS` array |
| A status's color / stage / order | that workbook's `statuses` in `WORKBOOKS` |
| Which columns show + how they parse | that workbook's `columns` (set `type`) |
| Recognized thread color names | `cobra/index.html`, the `COLORS` dictionary |
| Backend behavior (reads/writes/Drive) | `cobra/AppsScript.gs` → **redeploy as new version** |
| Turn on an access PIN | Apps Script → Project Settings → Script Property `PIN` |
| Deploy anything | `git push` (Pages) for frontend; Apps Script redeploy for backend |
