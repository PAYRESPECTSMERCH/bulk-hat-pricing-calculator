/**
 * Cobra Digitize — Google Apps Script backend (v2: + Drive file picker)
 * ------------------------------------------------------------------
 * New standalone project. Targets the sheet + artwork folder by ID.
 *
 * RE-DEPLOY after editing:
 *   Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.
 *   (First run with Drive access will ask you to re-authorize — allow it.)
 *
 * Endpoints (GET):
 *   ?action=list                              -> { rows:[{row, values, links}] }
 *   ?action=setStatus&row=&status=            -> { ok }
 *   ?action=moveRow&from=&to=                 -> { ok }
 *   ?action=listFiles[&q=]                    -> { files:[{id,name,url,thumb,size,mime,updated}] }
 *   ?action=setCell&row=&col=FRONT&text=&url= -> { ok }   (writes a link into a cell)
 */

var SHEET_ID  = "1Lu4wSwQyc3dn4XTkbY3WXWKkF3SI3I-bI4O8TYm8hsI";
var FOLDER_ID = "1HbzeuYC_WyEnltsaxPz5Wn0DJvAajcG0";   // artwork folder
var SHEET_TAB = "";   // "" = first tab

function getSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  return SHEET_TAB ? ss.getSheetByName(SHEET_TAB) : ss.getSheets()[0];
}

function headerInfo_(sh) {
  var scan = Math.min(sh.getLastRow(), 4);
  var values = sh.getRange(1, 1, scan, sh.getLastColumn()).getValues();
  for (var i = 0; i < values.length; i++) {
    var up = values[i].map(function (c) { return String(c).trim().toUpperCase(); });
    if (up.indexOf("STATUS") !== -1) {
      return {
        headerRow: i + 1,
        statusCol: up.indexOf("STATUS") + 1,
        timestampCol: up.indexOf("TIMESTAMP") + 1,
        cols: { FRONT: up.indexOf("FRONT") + 1, BACK: up.indexOf("BACK") + 1,
                LEFT: up.indexOf("LEFT") + 1, RIGHT: up.indexOf("RIGHT") + 1 }
      };
    }
  }
  return { headerRow: 1, statusCol: 1, timestampCol: 0, cols: {} };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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
    if (info.timestampCol > 0) sh.getRange(row, info.timestampCol).setValue(new Date());
    return json_({ ok: true });
  }

  if (action === "moveRow") {
    var from = parseInt(e.parameter.from, 10), to = parseInt(e.parameter.to, 10);
    if (!from || !to || from <= info.headerRow || to <= info.headerRow || from === to) return json_({ ok: false, error: "bad from/to" });
    var lc = Math.max(sh.getLastColumn(), 10);
    var src = sh.getRange(from, 1, 1, lc);
    var vals = src.getValues(), rich = src.getRichTextValues();
    sh.deleteRow(from);
    var dest = to > from ? to - 1 : to;
    if (dest > sh.getLastRow()) { sh.insertRowAfter(sh.getLastRow()); dest = sh.getLastRow(); }
    else sh.insertRowBefore(dest);
    var tgt = sh.getRange(dest, 1, 1, lc);
    tgt.setValues(vals); tgt.setRichTextValues(rich);
    return json_({ ok: true });
  }

  if (action === "setCell") {
    var row2 = parseInt(e.parameter.row, 10);
    var colName = String(e.parameter.col || "").toUpperCase();
    var col = info.cols[colName];
    var text = e.parameter.text || "";
    var url = e.parameter.url || "";
    if (!row2 || !col || row2 <= info.headerRow) return json_({ ok: false, error: "bad row/col" });
    var rt = SpreadsheetApp.newRichTextValue().setText(text);
    if (url) rt.setLinkUrl(url);
    sh.getRange(row2, col).setRichTextValue(rt.build());
    return json_({ ok: true });
  }

  if (action === "listFiles") {
    var folderId = e.parameter.folderId || FOLDER_ID;
    var q = String(e.parameter.q || "").toLowerCase();
    var folder = DriveApp.getFolderById(folderId);
    var it = folder.getFiles(), files = [];
    while (it.hasNext()) {
      var f = it.next(), name = f.getName();
      if (q && name.toLowerCase().indexOf(q) === -1) continue;
      files.push({
        id: f.getId(), name: name, url: f.getUrl(),
        thumb: "https://drive.google.com/thumbnail?id=" + f.getId() + "&sz=w240",
        size: f.getSize(), mime: f.getMimeType(), updated: f.getLastUpdated().getTime()
      });
    }
    files.sort(function (a, b) { return b.updated - a.updated; });
    return json_({ ok: true, files: files.slice(0, 40) });
  }

  // action === "list"
  var lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), 10), rows = [];
  if (lastRow > info.headerRow) {
    var range = sh.getRange(info.headerRow + 1, 1, lastRow - info.headerRow, lastCol);
    var data = range.getValues();
    var rich = range.getRichTextValues();
    var keys = { front: info.cols.FRONT, back: info.cols.BACK, left: info.cols.LEFT, right: info.cols.RIGHT };
    for (var r = 0; r < data.length; r++) {
      var vals = data[r].map(function (v) { return v == null ? "" : String(v); });
      if (!vals.some(function (v) { return v.trim() !== ""; })) continue;
      var links = {};
      for (var k in keys) {
        var ci = keys[k];
        if (ci > 0) { var u = rich[r][ci - 1] ? rich[r][ci - 1].getLinkUrl() : null; if (u) links[k] = u; }
      }
      rows.push({ row: info.headerRow + 1 + r, values: vals, links: links });
    }
  }
  return json_({ ok: true, rows: rows });
}

function doPost(e) { var p = {}; try { p = JSON.parse(e.postData.contents); } catch (err) {} return doGet({ parameter: p }); }
