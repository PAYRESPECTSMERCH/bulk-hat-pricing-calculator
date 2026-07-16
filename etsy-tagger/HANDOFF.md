# Etsy Tagger → Playwright migration — HANDOFF BRIEF

**Read this first, then continue the build. Do NOT start from scratch — most of it is
already written on this branch.** This brief is the full context from the planning
session; the code it refers to lives in `etsy-tagger/`.

## The goal (Matt's words, distilled)

Replace **both** existing automations with **one buttoned-up Playwright background job**:
1. the **Chrome extension** ("Etsy Order Tags"), and
2. the **every-3-hours "etsy-auto-tag-sweep"** Claude-in-Chrome scheduled task.

New job requirements:
- Runs **on Matt's Mac**, scheduled via **launchd**, **every 2 hours**.
- **Headless / background** — no window Matt interacts with.
- Uses a **saved Etsy login session** (one-time manual login, cookies reused).
- **Clean, no red flags** to Etsy (jittered throttle, per-run write cap, auto-backoff).
- **Delete the extension and the old scheduled task — but ONLY after the Playwright
  version is verified working.** Keep them as the safety net until then.

## Where the code already is

- Repo: `payrespectsmerch/bulk-hat-pricing-calculator`
- Branch: `claude/etsy-tag-automation-refactor-os09r4`  (draft PR #17)
- Folder: `etsy-tagger/`

```
etsy-tagger/
  login.js                       one-time Etsy login → storageState.json (gitignored)
  run.js                         one full sweep (launchd runs this)
  dump-order.js                  print one order's raw JSON (to lock field names)  ← run this next
  test-order.js                  read order(s), preview the sheet row, dry-run by default
  src/config.js                  shop id, tags, rule matchers, step pages, sheet settings
  src/rules.js                   JOB A tagging brain (pure)
  src/note.js                    build/parse the 🏷️ note, importance ordering
  src/order-row.js               JOB B: Etsy order → PAYRESPECTS ORDERS row (pure)
  src/sheet.js                   POST rows to the Apps Script web app
  src/etsy-api.js                Etsy internal API client
  src/sweep.js                   JOB A orchestration
  src/state.js                   once-ever autoTagged guard
  src/cobra.js                   JOB C: read COBRA sheet
  apps-script/payrespects-orders-sync.gs   the sheet write path (deploy as web app)
  scripts/                       launchd schedule + installer
```

Status: JOB A (tagging) + JOB B mapping/write-path + test harness are built and unit-tested
(38 synthetic checks passing). JOB C/D still need finishing (see below). The mapping's
shipping/date fields use **defensive guesses** that must be confirmed with `dump-order.js`.

## IMMEDIATE NEXT STEPS (in order)

1. **Get set up** (on the Mac):
   ```bash
   cd etsy-tagger && npm install && npx playwright install chromium
   cp .env.example .env
   npm run login          # sign into Etsy once
   ```
2. **Lock the ⚠️ field names.** Run `node dump-order.js <realOrderId>` and read the
   "LIKELY SHIPPING / DATE / TRACKING FIELDS" block. Patch `src/order-row.js` so these
   map to the REAL keys (currently guessed):
   - **ORDERED** (order date) — `orderedDate()` tries `creation_tsz`/`created_tsz`/etc.
   - **SHIP BY** — `expected_ship_date` (CLAUDE.md warns it may not be on the object).
   - **CUSTOMER NAME + SHIP TO** — `shipping()` tries `shipping_address`/`ship_to`/etc.
   - VENDOR = blank for now (Matt will make it a dropdown later). TRACKING = blank for now.
3. **Deploy the write path.** Open the PAYRESPECTS ORDERS sheet → Extensions → Apps Script,
   paste `apps-script/payrespects-orders-sync.gs`, set `SECRET`, Deploy → Web app
   (Execute as Me, Anyone). Put the `/exec` URL + SECRET into `.env`
   (`PAYRESPECTS_SHEET_EXEC_URL`, `PAYRESPECTS_SHEET_SECRET`).
4. **Test one order end-to-end.**
   ```bash
   node test-order.js <id>            # DRY RUN — shows the 17-col row, writes nothing
   node test-order.js <id> --apply    # writes the row to PAYRESPECTS ORDERS
   ```
   Verify the row in the sheet with Matt. Tweak the mapping until it's right.
5. **Finish JOB C + JOB D** in the sweep (specs below), then run a full **dry-run** sweep:
   `npm run sweep` (writes nothing) → review → `npm run sweep:apply`.
6. **Schedule it:** `./scripts/install-schedule.sh` (edit the plist to every-2h:
   `StartInterval` 7200), confirm with `launchctl list | grep etsy-tagger`.
7. **Only then, decommission the old systems:** delete the every-3h scheduled task and
   remove/uninstall the Chrome extension. Not before step 6 is observed working.

## Key facts / IDs

- Etsy shop_id = **22905049**. Shop (Christina & Matt) sender_user_id = **288505356**.
- ⚠️ **SHOP-ID TRAP (CLAUDE.md 2026-07-15):** the old `api/v3/ajax/shop/(\d+)/` regex is
  DEAD and fails *silently* → `shop=undefined` → every order reads "untagged" → a naive
  sweep would re-tag ALL live orders and clobber Matt's notes. Hardcode 22905049, use
  `"shop_id":"?(\d{6,})"?` as backup, and **abort any run that reports ~0 tagged out of a
  full dashboard** (treat as a bug, never a finding — steady state is most orders tagged).
- Step pages (harvest order ids via `order_id=(\d{9,12})`, **paginate `?page=1,2,3…`**
  until a page adds no new ids; page size is 20, `/completed` is 50):
  `/your/orders/sold/new`, IN PRODUCTION `1233596522887`, ART & STITCH `1272457511245`,
  RAUL EMBROIDERY `1278209011482`, ALFREDO DTG `1272365687455`, SEND MOCKUP `1268105390664`,
  `/your/orders/sold/completed`. `order.order_state_id` maps straight to the section.
- Read order: `GET /api/v3/ajax/shop/{shop}/mission-control/orders/{orderId}?objects_enabled_for_normalization%5Border_state%5D=true`
- Create note: `POST .../orders/notes/{orderId}` body `note=<urlencoded>` (form-urlencoded).
  Delete note: `POST .../orders/notes/remove/{order_note_id}`. Update = delete+recreate.
  Throttle ~300ms (we use jittered 300–800ms + per-run write cap + abort on 429/403/captcha).
- Convos: `GET .../orders/convos/{orderId}` → `messages[]` (`sender_user_id`,
  `message_body`, `attachments[]`).
- Headers on all API calls: `x-csrf-token` (from `<meta name="csrf_nonce">`),
  `X-Requested-With: XMLHttpRequest`.

## JOB A — TAGGING (the 🏷️ private note)

One private note per order: `🏷️ NAME, NAME` — normal tags (importance order) →
**DIGITIZE second-from-right → SECTION tag far right**. Additive (never drop a name you
didn't add, except JOB C/D). Match rules against the **combined** title + SKU +
personalization text (the extension matches loosely; do the same). Per line item:

- **DIGITIZE**: SKU `OTTO CAP 31-069 CUSTOM` or `OTTO - 5 PANEL` (always); or OTTO/YUPOONG
  + "Custom" in title; or titles "Custom Hat" / "Custom Embroidered Hat" / "Bulk Order Hats".
  Pre-designed hats (Margs, Champagne, America, Gameday, Dilly Dally — no "Custom") get NOTHING.
- **OTTO CAP 31-069**: SKU `OTTO CAP 31-069 CUSTOM` — in addition to DIGITIZE (normal tag,
  lists before DIGITIZE).
- **ALFREDO DTG**: custom mocknecks (SKU starts MOCKNECK, or title has Mockneck + Custom).
- **PRINTIFY**: SKU `BELLA CANVAS 3001`.
- **SEND MOCKUP**: buyer notes/personalization/convo mention mockup/proof
  (`/mock\s*-?\s*up|\bproof\b/i`) AND not already sent (JOB D). Human-verify; flag if unsure.
- **BULK ORDER** (order-level, once per order): total units > 6, OR 2+ line items and nothing
  else tagged. Units = max(qty, "Qty N", number-first "N HATS/SETS").
- **is_private ADD-ON GUARD** (sweep-only; the extension can't see `is_private`): skip
  `is_private` + blank-SKU line items whose title matches `/fee|shipping|location|rush|add.?on|tote/i`
  — never tag, never count toward BULK (fixes the "Extra design fee for 10 hats" BULK bug).
- **SKIP + flag** (never auto-tag, list for Matt): pre-designed title on `OTTO - 5 PANEL`;
  "Extra <color> Hats" private listings; "Deposit" lines; misspelled private "mockecks".

## JOB B — PAYRESPECTS ORDERS sheet sync

- Sheet: **PAYRESPECTS ORDERS** id `1ysZPOFHIwNATn8rrUwiy9Y-G3-nbDwcUxMxoMUXTTys`,
  tab **gid 728848446**.
- **One row per line item.** Idempotency key = order id + SKU.
- 17 columns: `STATUS | ORDER ID | ORDERED | ITEM NAME | TYPE | SKU | QTY | COLOR | SIZE |
  DETAILS | DIGITIZE FOLDER | VENDOR | SHIP BY | TRACKING NUMBER | CUSTOMER NAME | SHIP TO | ADDED`.
- **Selective uppercase** (confirmed from live rows): UPPERCASE STATUS, ITEM NAME, TYPE,
  COLOR, SIZE, DETAILS, VENDOR, CUSTOMER NAME. **SHIP TO keeps its original case.**
  (This is NOT the old "everything uppercase" COPY PRODUCTION rule.)
- Mapping: STATUS = current section; ORDER ID = `#<id>`; ITEM NAME = product.title;
  TYPE = classifier (HAT/MOCKNECK/SHIRT/HOODIE/TOTE/…); SKU = product_identifier;
  QTY = bulk qty; COLOR/SIZE = variations; DETAILS = personalization text;
  DIGITIZE FOLDER = COBRA bridge (below); VENDOR/TRACKING = blank for now;
  ORDERED/SHIP BY/CUSTOMER NAME/SHIP TO = confirm keys via dump-order; ADDED = stamped by
  the Apps Script on write.
- **Mandatory convo read** (CLAUDE.md) before writing a row where COLOR/STYLE/THREAD/QTY are
  missing/unclear (especially private/blank-SKU bulk customs): GET the convo and extract; only
  write "(CHECK MESSAGES)" after actually reading it and coming up empty. *(Not yet wired into
  order-row.js — add it.)*
- **DIGITIZE FOLDER bridge (col K)** from the COBRA DIGITIZE sheet
  (`1Lu4wSwQyc3dn4XTkbY3WXWKkF3SI3I-bI4O8TYm8hsI`): match by digits-only order id; if the
  COBRA row has a Drive folder URL, set col K to it (don't overwrite a non-blank col K unless
  the URL changed). Read the COBRA sheet with FORMULA render to get raw URLs.

## JOB C — DIGITIZE tag lifecycle

Source of truth = COBRA DIGITIZE STATUS. **READY → the order's note must read
`DIGITIZE (IN PROGRESS)` (not plain DIGITIZE); COMPLETED → remove both digitize tokens.**
⚠️ **CLAUDE.md 2026-07-15:** COMPLETED/READY rows migrate OFF the "COBRA DIGITIZE" tab onto a
separate **"COBRA COMPLETED"** tab, so building DONE_SET from only the DIGITIZE tab makes it
permanently empty (silent no-op). **Read BOTH tabs.** If an id appears on both (READY on one,
COMPLETED on the other) → **skip + flag** (the branches conflict). Idempotent; remove-only in
this job; never touch a non-🏷️ note; drop the note entirely if a digitize token was the only name.

## JOB D — SEND MOCKUP cleanup

Remove the SEND MOCKUP token once a mockup was actually sent. **PROVEN rule (CLAUDE.md, 4
runs, zero false strips):** a mockup counts as SENT only when a **SHOP message
(sender_user_id 288505356) carries the mockup/proof wording AND the image attachment in the
SAME message.** Wording *near* an image is NOT enough (caused a false positive on …5030).
Also treat COBRA STATUS CUSTOMER APPROVED / READY / COMPLETED as superseding. If uncertain,
leave the tag and flag for Matt. Remove-only.

## Anti-flag measures (the "clean, no red flags" requirement)

- Reuse the human-logged-in session (storageState); run on the Mac's trusted IP.
- Jittered throttle (300–800ms+) between note writes; **per-run write cap** so the first
  backfill isn't one big burst; **auto-backoff** — stop the run on any 429/403/captcha.
- Every 2h is low volume (fine); the risk was always the write *burst*, now capped.

## Open questions for Matt (carry as SKIP + flag until answered)

1. Pre-designed design (Dilly Dally/Margs) on an `OTTO - 5 PANEL` blank — DIGITIZE or no label?
2. "Extra <color> Hats" private listings — DIGITIZE or stay bare?
3. "Deposit" lines on bulk hat jobs — BULK ORDER or bare (add `deposit` to the add-on guard)?
4. Private blank-SKU misspelled "mockecks" — should ALFREDO DTG match `/mock.?ecks?/i` regardless of "Custom"?
5. Does a physical-sample photo satisfy SEND MOCKUP, or only a digital proof? (order …0195)
6. What decides DIGITIZE on private blank-SKU bulk hat listings (new art vs. repeat)? Sweep can't know from Etsy — likely a COBRA lookup.
7. VENDOR column — the dropdown values Matt wants (left blank for now).

## Things the cloud session could NOT do (so this Mac session must)

- Read Etsy (needs the local logged-in session) — hence `dump-order.js` / `test-order.js`.
- Write to Google Sheets programmatically from the job (via the Apps Script web app).
- Delete the old scheduled task + uninstall the extension (do this LAST, after verification).
