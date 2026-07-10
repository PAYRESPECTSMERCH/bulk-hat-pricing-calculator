# Cobra Digitize — Setup

A clean, Apple-style web app that mirrors the **Cobra Digitizing** Google Sheet.
It reads jobs live and (optionally) lets vendors change a job's **status** and
have it save straight back to the sheet.

Live app path once deployed: `…/cobra/`

---

## Option A — Two-way sync (recommended)

Vendors can flip a job between **Queued / Send Mockup / Completed** in the app
and it writes back to the sheet. Works even though the sheet is private.

1. Open the Cobra Digitizing Google Sheet.
2. **Extensions → Apps Script**.
3. Delete the starter code, paste the entire contents of
   [`AppsScript.gs`](./AppsScript.gs), and **Save**.
   - If your jobs aren't on the first tab, set `SHEET_TAB` at the top.
4. **Turn on the fast Drive service (one time):** in the Apps Script editor,
   click **Services** (the ＋ in the left rail) → find **Drive API**, choose
   version **v2**, click **Add**. This makes the sidebar load much faster.
5. **Deploy → New deployment → Web app**
   - **Execute as:** Me
   - **Who has access:** Anyone
   - **Deploy**, authorize when prompted, then **copy the `/exec` URL**.
6. In [`index.html`](./index.html), set:
   ```js
   APPS_SCRIPT_URL: "https://script.google.com/macros/s/XXXXX/exec",
   ```
7. Reload the app. The header should read **"Live · two-way sync."**

> Re-deploying after code edits: use **Deploy → Manage deployments → Edit →
> New version** so the URL stays the same.

---

## Option B — Read-only live mirror (no code)

Shows live jobs but no write-back.

1. In the sheet: **File → Share → Publish to web → Publish.**
2. Make sure `SHEET_ID` in `index.html` matches your sheet (it already does),
   and leave `APPS_SCRIPT_URL` blank.
3. Reload — the header reads **"Live (read-only)."**

---

## Option C — Do nothing

With no connection configured, the app shows built-in **sample rows** so you can
preview the design. The header reads **"Sample data."**

---

## How columns are read

The app expects the sheet's existing columns, in this order:

| Col | Meaning |
|----|----|
| STATUS | mirrors the sheet's dropdown: blank = Unassigned, plus `READY`, `SEND MOCKUP`, `WAITING ON CUSTOMER APPROVAL`, `DESIGN QUESTIONS`, `UPDATE ARTWORK`, `CUSTOMER APPROVED`, `CANNOT FIND ORDER DETAILS`, `HELP FIND ORDER #`, `COMPLETED`, `REVIEW DETAILS` — each with the same color as in the sheet |
| ORDER | order number or name |
| 3D | any value = 3D-puff badge |
| DETAILS | free-text job description (Qty is auto-extracted) |
| FRONT / BACK / LEFT / RIGHT | placement text; sizes like `5" W` are pulled out |
| THREAD | written colors → color dots (e.g. "Navy / Gold") |
| DIGITIZE FOLDER | becomes a link into Google Drive |
| TIMESTAMP | auto-stamped when status is changed from the app |

Nothing about the sheet's structure needs to change — the app adapts to it.
