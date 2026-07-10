/**
 * Cobra Digitize — Google Apps Script backend
 * ------------------------------------------------------------------
 * Gives the /cobra web app LIVE data + two-way write-back, even for a
 * PRIVATE sheet (the script runs as you, the owner).
 *
 * SETUP (one time):
 *   1. Open your Cobra Digitizing Google Sheet.
 *   2. Extensions → Apps Script.
 *   3. Delete any starter code, paste this whole file, Save.
 *   4. Set SHEET_TAB below to the tab name if it isn't the first tab.
 *   5. Deploy → New deployment → type "Web app".
 *        - Execute as:  Me
 *        - Who has access:  Anyone
 *      Click Deploy, authorize, and COPY the /exec web-app URL.
 *   6. Paste that URL into CONFIG.APPS_SCRIPT_URL in cobra/index.html.
 *
 * Endpoints (all via GET so the browser can call them with no CORS
 * preflight):
 *   ?action=list                         -> { rows:[{row, values:[...]}, ...] }
 *   ?action=setStatus&row=<n>&status=<s> -> { ok:true }
 */

// Recommended: create a NEW standalone Apps Script project so this does not
// collide with the sheet's existing bound scripts. It targets the sheet by ID.
var SHEET_ID = "1Lu4wSwQyc3dn4XTkbY3WXWKkF3SI3I-bI4O8TYm8hsI";
var SHEET_TAB = "";   // "" = first tab, or e.g. "Sheet1"

function getSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  return SHEET_TAB ? ss.getSheetByName(SHEET_TAB) : ss.getSheets()[0];
}

// Find the header row (the one containing "STATUS") and map columns.
function headerInfo_(sh) {
  var scan = Math.min(sh.getLastRow(), 4);
  var values = sh.getRange(1, 1, scan, sh.getLastColumn()).getValues();
  for (var i = 0; i < values.length; i++) {
    var up = values[i].map(function (c) { return String(c).trim().toUpperCase(); });
    if (up.indexOf("STATUS") !== -1) {
      return {
        headerRow: i + 1,
        statusCol: up.indexOf("STATUS") + 1,
        timestampCol: up.indexOf("TIMESTAMP") + 1  // -1+1 = 0 if absent
      };
    }
  }
  return { headerRow: 1, statusCol: 1, timestampCol: 0 };
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "list";
  var sh = getSheet_();
  var info = headerInfo_(sh);

  if (action === "setStatus") {
    var row = parseInt(e.parameter.row, 10);
    var status = e.parameter.status != null ? e.parameter.status : "";
    if (!row || row <= info.headerRow) return json_({ ok: false, error: "bad row" });
    sh.getRange(row, info.statusCol).setValue(status);
    if (info.timestampCol > 0) {
      sh.getRange(row, info.timestampCol).setValue(new Date());
    }
    return json_({ ok: true, row: row, status: status });
  }

  if (action === "moveRow") {
    var from = parseInt(e.parameter.from, 10);
    var to = parseInt(e.parameter.to, 10);
    if (!from || !to || from <= info.headerRow || to <= info.headerRow || from === to) {
      return json_({ ok: false, error: "bad from/to" });
    }
    var lastCol = Math.max(sh.getLastColumn(), 10);
    var src = sh.getRange(from, 1, 1, lastCol);
    var vals = src.getValues();
    var rich = src.getRichTextValues();   // preserves hyperlinks in placement cells
    sh.deleteRow(from);
    var dest = to > from ? to - 1 : to;   // account for the removed row
    if (dest > sh.getLastRow()) {
      sh.insertRowAfter(sh.getLastRow());
      dest = sh.getLastRow();
    } else {
      sh.insertRowBefore(dest);
    }
    var tgt = sh.getRange(dest, 1, 1, lastCol);
    tgt.setValues(vals);
    tgt.setRichTextValues(rich);
    return json_({ ok: true, from: from, to: dest });
  }

  // action === "list"
  var lastRow = sh.getLastRow();
  var lastCol = Math.max(sh.getLastColumn(), 10);
  var rows = [];
  if (lastRow > info.headerRow) {
    var data = sh.getRange(info.headerRow + 1, 1, lastRow - info.headerRow, lastCol).getValues();
    for (var r = 0; r < data.length; r++) {
      var vals = data[r].map(function (v) { return v == null ? "" : String(v); });
      if (vals.some(function (v) { return v.trim() !== ""; })) {
        rows.push({ row: info.headerRow + 1 + r, values: vals });
      }
    }
  }
  return json_({ ok: true, rows: rows });
}

// Optional: also accept POST for the same actions.
function doPost(e) {
  var params = {};
  try { params = JSON.parse(e.postData.contents); } catch (err) {}
  return doGet({ parameter: params });
}
