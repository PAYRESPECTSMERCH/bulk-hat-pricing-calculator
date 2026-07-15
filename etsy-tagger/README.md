# Etsy Tagger (Playwright)

Background automation that replaces the **"Etsy Order Tags" Chrome extension**.
Instead of riding inside your logged-in Chrome and painting pills on the
dashboard, it runs as a scheduled, headless **Playwright** job on your Mac:
it reads your Etsy orders through Etsy's internal API, applies the same tagging
rules, and writes the clean `🏷️` private-note mirror back to each order.

> **The `🏷️` note is the source of truth** — same as the extension. Anything
> that reads those notes (a person, the old extension, a future dashboard)
> keeps working unchanged.

## What it does each run

1. Harvests order ids from every progress-step page (New, In Production, Art &
   Stitch, Raul, Alfredo DTG, Send Mockup, Completed) — **paginated**, so it
   never misses orders on page 2+.
2. Reads each order's full JSON (line items, SKUs, personalization, state).
3. Applies the rules (see below), **additively** merging with the existing note.
4. (Optional) Strips `DIGITIZE` from orders already marked READY/COMPLETED in the
   COBRA DIGITIZE sheet (**JOB C**).
5. Writes the updated note back (delete + recreate, throttled).

### Rules ported from the extension
- **DIGITIZE** — SKU `OTTO CAP 31-069 CUSTOM` / `OTTO - 5 PANEL`, embroidered-hat
  SKUs (OTTO/YUPOONG) with "Custom" in the title, or Custom-hat titles.
- **OTTO CAP 31-069** — added alongside DIGITIZE for that SKU.
- **ALFREDO DTG** — custom mocknecks.
- **PRINTIFY** — `BELLA CANVAS 3001`.
- **BULK ORDER** — > 6 units, or 2+ items with nothing else tagged.
- **Section tags** — from the order's `order_state_id`; they follow orders
  between steps (old section tag replaced, not accumulated).
- **Ordering** — normal tags (importance) → DIGITIZE second-from-right → section
  far right.

### Sweep-only smarts the extension couldn't do
- **`is_private` add-on/fee guard** — "Rush Shipping", "Side location", "Extra
  design fee for 10 hats", "Tote Bags" etc. are never tagged and never counted
  toward BULK (fixes the old "10 hats" BULK false-positive).
- **SKIP + flag** (logged, never auto-tagged) — the Dilly-Dally-on-`OTTO - 5
  PANEL` conflict and "Extra <color> Hats" private listings. These print under
  *NEEDS-MATT* at the end of each run.
- **SEND MOCKUP stays human-verified** — buyer mockup/proof language is *flagged*
  for you to confirm, never auto-applied (per your own hard-won notes).
- **Once-ever guard** — like the extension's `autoTagged`: if you manually pull a
  tag off a note, the sweep won't re-add it (state in `state/autoTagged.json`).

## Setup (on your Mac)

```bash
# 1. Put this folder at ~/Documents/etsy-tagger (or edit APP_DIR in
#    scripts/run-sweep.sh if you keep it elsewhere), then:
cd ~/Documents/etsy-tagger
npm install
npx playwright install chromium

# 2. Configure
cp .env.example .env          # tweak if needed; defaults match Matt's shop

# 3. Log into Etsy once (a real window opens — sign in, finish 2FA)
npm run login                 # saves storageState.json (gitignored)

# 4. Dry run — writes NOTHING, just logs what it would change
npm run sweep

# 5. When the dry-run output looks right, do it for real
npm run sweep:apply
```

### Schedule it (every 30 min, background)

```bash
./scripts/install-schedule.sh          # load the launchd job
launchctl list | grep etsy-tagger      # confirm it's loaded
./scripts/install-schedule.sh remove   # to stop it
```

Logs land in `logs/` (`sweep-YYYY-MM-DD.log`, plus launchd's stdout/stderr).

## Safety notes
- **Dry-run is the default.** Nothing writes to Etsy until you pass `--apply`
  (the scheduled job uses `--apply`; run `npm run sweep` any time to preview).
- **`storageState.json` is your live Etsy session — it is gitignored. Never
  commit it.**
- Etsy sessions expire. When a sweep logs *"Not logged in"*, just re-run
  `npm run login`.

## JOB C (optional): auto-remove DIGITIZE when digitized
Publish the COBRA DIGITIZE sheet as CSV (**File → Share → Publish to web →
CSV**) and paste that URL into `COBRA_SHEET_CSV_URL` in `.env`. The sweep then
strips `DIGITIZE` from any order whose STATUS is exactly `READY` or `COMPLETED`.
Leave it blank to skip JOB C.

## Layout
```
login.js                 one-time / occasional Etsy login → storageState.json
run.js                   entrypoint for one sweep (launchd runs this)
src/config.js            shop id, tag registry, rule matchers, step pages
src/rules.js             the tagging brain (pure functions, no I/O)
src/note.js              build/parse the 🏷️ note, importance ordering
src/etsy-api.js          Etsy internal API client (read/notes/convos/harvest)
src/sweep.js             orchestration
src/state.js             once-ever autoTagged guard
src/cobra.js             JOB C: read COBRA DIGITIZE sheet
scripts/                 launchd schedule + installer
```

## Not carried over from the extension (by design)
- **On-Etsy colored pills** and the popup tag-manager UI — those need a
  content-script running in your browser. This is a background job (your choice),
  so it manages the notes, not the on-page overlay.
- **Cross-browser sync backend** (`backend.gs`) — with one background job there's
  a single writer, so the per-browser sync it existed to reconcile is moot. The
  `🏷️` note remains the shared signal everyone reads.
