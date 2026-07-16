/**
 * PAYRESPECTS ORDERS — sheet sync web app.
 *
 * This is the write path for the Playwright tagger's JOB B. The Playwright job
 * POSTs order rows here; this script appends/updates them in the sheet. It runs
 * as you (Matt), so it already has permission to the sheet — no service account.
 *
 * SETUP (one time):
 *   1. Open the PAYRESPECTS ORDERS sheet → Extensions → Apps Script.
 *   2. Paste this whole file. Change SECRET below to a long random string.
 *   3. Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone.
 *   4. Copy the /exec URL. Put the URL + the SECRET into etsy-tagger/.env as
 *      PAYRESPECTS_SHEET_EXEC_URL and PAYRESPECTS_SHEET_SECRET.
 *   Re-deploy after edits via Manage deployments → Edit → New version (URL stays).
 */

var SHEET_ID = '1ysZPOFHIwNATn8rrUwiy9Y-G3-nbDwcUxMxoMUXTTys';
var SECRET = 'CHANGE-ME-to-a-long-random-string';   // must match PAYRESPECTS_SHEET_SECRET
var HEADER_ROW = 1;

// Column order (left → right) — must match the sheet exactly.
var COLS = ['STATUS', 'ORDER ID', 'ORDERED', 'ITEM NAME', 'TYPE', 'SKU', 'QTY',
  'COLOR', 'SIZE', 'DETAILS', 'DIGITIZE FOLDER', 'VENDOR', 'SHIP BY',
  'TRACKING NUMBER', 'CUSTOMER NAME', 'SHIP TO', 'ADDED'];

// Columns that get UPPERCASED. SHIP TO deliberately keeps its original case
// (matches how the live sheet already stores addresses).
var UPPER = { 'STATUS': 1, 'ITEM NAME': 1, 'TYPE': 1, 'COLOR': 1, 'SIZE': 1,
  'DETAILS': 1, 'VENDOR': 1, 'CUSTOMER NAME': 1 };

// Payload field name for each column.
var FIELD = { 'STATUS': 'status', 'ORDER ID': 'orderId', 'ORDERED': 'ordered',
  'ITEM NAME': 'itemName', 'TYPE': 'type', 'SKU': 'sku', 'QTY': 'qty',
  'COLOR': 'color', 'SIZE': 'size', 'DETAILS': 'details',
  'DIGITIZE FOLDER': 'digitizeFolder', 'VENDOR': 'vendor', 'SHIP BY': 'shipBy',
  'TRACKING NUMBER': 'tracking', 'CUSTOMER NAME': 'customerName',
  'SHIP TO': 'shipTo', 'ADDED': 'added' };

// On update, never overwrite these with a blank (they may be hand-filled).
var PRESERVE_IF_BLANK = ['STATUS', 'VENDOR', 'DIGITIZE FOLDER', 'TRACKING NUMBER', 'SHIP BY'];

function idx_(name) { return COLS.indexOf(name); }

function getSheet_(gid) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  if (gid) {
    var shs = ss.getSheets();
    for (var i = 0; i < shs.length; i++) {
      if (String(shs[i].getSheetId()) === String(gid)) return shs[i];
    }
  }
  return ss.getSheets()[0];
}

function key_(orderId, sku) {
  return String(orderId).replace(/\D/g, '') + '|' + String(sku).trim().toUpperCase();
}

function nowStamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy H:mm:ss');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function cellFor_(col, row) {
  var v = row[FIELD[col]];
  if (v == null) v = '';
  v = String(v);
  if (UPPER[col]) v = v.toUpperCase();
  return v;
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.secret !== SECRET) return json_({ ok: false, error: 'bad secret' });

    var sh = getSheet_(body.gid);
    var width = COLS.length;
    var last = sh.getLastRow();
    var data = last > HEADER_ROW ? sh.getRange(HEADER_ROW + 1, 1, last - HEADER_ROW, width).getValues() : [];

    var bOrder = idx_('ORDER ID'), bSku = idx_('SKU'), bAdded = idx_('ADDED');
    var keyToRow = {};
    for (var r = 0; r < data.length; r++) keyToRow[key_(data[r][bOrder], data[r][bSku])] = r;

    var mode = body.mode || 'upsert'; // 'upsert' | 'append'
    var dryRun = body.dryRun === true;
    var appended = 0, updated = 0, preview = [];

    (body.rows || []).forEach(function (row) {
      var values = COLS.map(function (c) { return cellFor_(c, row); });
      var k = key_(values[bOrder], values[bSku]);
      var existingIdx = keyToRow[k];

      if (existingIdx != null && mode !== 'append') {
        var cur = data[existingIdx];
        values[bAdded] = cur[bAdded] || nowStamp_();
        PRESERVE_IF_BLANK.forEach(function (c) {
          var ci = idx_(c);
          if (!values[ci] && cur[ci]) values[ci] = cur[ci];
        });
        if (!dryRun) sh.getRange(HEADER_ROW + 1 + existingIdx, 1, 1, width).setValues([values]);
        updated++;
      } else {
        values[bAdded] = nowStamp_();
        if (!dryRun) sh.appendRow(values);
        appended++;
      }
      preview.push(values);
    });

    return json_({ ok: true, appended: appended, updated: updated, dryRun: dryRun, preview: preview });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'payrespects-orders-sync', cols: COLS });
}
