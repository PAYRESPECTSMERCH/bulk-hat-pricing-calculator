/**
 * Cobra Digitize — Google Apps Script backend (v4 — fast Drive)
 * list / setStatus / moveRow / setCell (any column) / listFiles (recent, recursive)
 * / browse (one folder + subfolders) / deleteFile / upload (POST)
 *
 * SPEED: Drive reads now use the Drive Advanced Service (batched Drive.Files.list)
 * instead of per-file DriveApp calls. This is dramatically faster for the sidebar.
 *
 * ONE-TIME SETUP before this works:
 *   1. In the Apps Script editor, click "Services" (＋ next to Services in the left rail).
 *   2. Find "Drive API", pick version "v2", click Add.
 *   3. Paste all of this code, Save.
 *   4. ▶ Run the `authorize` function once (approve Drive access).
 *   5. Deploy → Manage deployments → Edit → New version.
 */
var SHEET_ID  = "1Lu4wSwQyc3dn4XTkbY3WXWKkF3SI3I-bI4O8TYm8hsI";   // default sheet (overridable by ?sheetId=)
var FOLDER_ID = "1HbzeuYC_WyEnltsaxPz5Wn0DJvAajcG0";   // artwork folder
var SHEET_TAB = "";
var FOLDER_MIME = "application/vnd.google-apps.folder";

// Allow the dashboard to target any workbook by passing ?sheetId=... (multi-workbook switcher).
function getSheet_(e) {
  var id = (e && e.parameter && e.parameter.sheetId) ? e.parameter.sheetId : SHEET_ID;
  var ss = SpreadsheetApp.openById(id);
  return SHEET_TAB ? ss.getSheetByName(SHEET_TAB) : ss.getSheets()[0];
}
// Map EVERY header cell -> its column index, so setCell works for any workbook's columns.
function headerInfo_(sh) {
  var scan = Math.min(sh.getLastRow(), 4);
  var values = sh.getRange(1, 1, scan, sh.getLastColumn()).getValues();
  for (var i = 0; i < values.length; i++) {
    var up = values[i].map(function (c) { return String(c).trim().toUpperCase(); });
    if (up.indexOf("STATUS") !== -1) {
      var cols = {};
      for (var c = 0; c < up.length; c++) { if (up[c] !== "") cols[up[c]] = c + 1; }
      return { headerRow: i + 1, statusCol: up.indexOf("STATUS") + 1, timestampCol: up.indexOf("TIMESTAMP") + 1,
        cols: cols, headers: up };
    }
  }
  return { headerRow: 1, statusCol: 1, timestampCol: 0, cols: {}, headers: [] };
}
// Header names whose cells carry Drive/URL hyperlinks worth returning to the client.
function linkCols_(info) {
  var out = {};
  var want = ["ORDER","FRONT","BACK","LEFT","RIGHT","DIGITIZE FOLDER","DIGITIZED FOLDERS"];
  for (var k in info.cols) { if (want.indexOf(k) !== -1) out[linkKey_(k)] = info.cols[k]; }
  return out;
}
function linkKey_(header) {
  if (header === "ORDER") return "order";
  if (header === "FRONT") return "front";
  if (header === "BACK") return "back";
  if (header === "LEFT") return "left";
  if (header === "RIGHT") return "right";
  return "folder"; // DIGITIZE FOLDER / DIGITIZED FOLDERS
}
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// Build a file object from a Drive v2 API resource (fast — no extra round-trips).
function fileRes_(f){
  return { id:f.id, name:f.title, url:f.alternateLink||("https://drive.google.com/file/d/"+f.id+"/view"),
    thumb:"https://drive.google.com/thumbnail?id="+f.id+"&sz=w240",
    size:f.fileSize?Number(f.fileSize):0, mime:f.mimeType,
    updated:f.modifiedDate?new Date(f.modifiedDate).getTime():0 };
}
function q_(s){ return String(s).replace(/'/g,"\\'"); }

// List direct children of a folder via the Advanced Drive Service (one paged query).
function listChildren_(folderId, onlyFolders, max){
  var out=[], token=null, want=max||400;
  var base = "'"+q_(folderId)+"' in parents and trashed=false";
  base += onlyFolders ? (" and mimeType='"+FOLDER_MIME+"'") : (" and mimeType!='"+FOLDER_MIME+"'");
  do{
    var res=Drive.Files.list({ q:base, maxResults:Math.min(1000,want-out.length),
      orderBy: onlyFolders?"title":"modifiedDate desc", pageToken:token,
      fields:"nextPageToken,items(id,title,mimeType,fileSize,modifiedDate,alternateLink)" });
    (res.items||[]).forEach(function(f){ out.push(f); });
    token=res.nextPageToken;
  } while(token && out.length<want);
  return out;
}
// Fast count of files directly in a folder (ids only, capped).
function countFiles_(folderId, cap){
  var res=Drive.Files.list({ q:"'"+q_(folderId)+"' in parents and trashed=false and mimeType!='"+FOLDER_MIME+"'",
    maxResults:cap||500, fields:"items(id)" });
  return (res.items||[]).length;
}

// ▶ RUN THIS ONCE to grant Drive access + confirm the Advanced Service is on.
function authorize(){ Logger.log("OK: " + Drive.Files.get(FOLDER_ID).title); }

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "list";
  var sh = getSheet_(e), info = headerInfo_(sh);

  if (action === "setStatus") {
    var row=parseInt(e.parameter.row,10), status=e.parameter.status!=null?e.parameter.status:"";
    if(!row||row<=info.headerRow) return json_({ok:false});
    sh.getRange(row,info.statusCol).setValue(status);
    if(info.timestampCol>0) sh.getRange(row,info.timestampCol).setValue(new Date());
    return json_({ok:true});
  }
  if (action === "moveRow") {
    var from=parseInt(e.parameter.from,10), to=parseInt(e.parameter.to,10);
    if(!from||!to||from<=info.headerRow||to<=info.headerRow||from===to) return json_({ok:false});
    var lc=Math.max(sh.getLastColumn(),10), src=sh.getRange(from,1,1,lc);
    var vals=src.getValues(), rich=src.getRichTextValues();
    sh.deleteRow(from);
    var dest=to>from?to-1:to;
    if(dest>sh.getLastRow()){ sh.insertRowAfter(sh.getLastRow()); dest=sh.getLastRow(); } else sh.insertRowBefore(dest);
    var t=sh.getRange(dest,1,1,lc); t.setValues(vals); t.setRichTextValues(rich);
    return json_({ok:true});
  }
  if (action === "setCell") {
    var r2=parseInt(e.parameter.row,10), col=info.cols[String(e.parameter.col||"").toUpperCase()];
    var text=e.parameter.text||"", url=e.parameter.url||"";
    if(!r2||!col||r2<=info.headerRow) return json_({ok:false, error:"bad row/col"});
    var rt=SpreadsheetApp.newRichTextValue().setText(text); if(url) rt.setLinkUrl(url);
    sh.getRange(r2,col).setRichTextValue(rt.build());
    return json_({ok:true});
  }
  if (action === "listFiles") {   // recent files across the artwork folder tree (attach picker)
    var q=String(e.parameter.q||"").toLowerCase();
    var files=[], queue=[e.parameter.folderId||FOLDER_ID], seen=0, MAXF=12;
    while(queue.length && files.length<200 && seen<MAXF){
      var fid0=queue.shift(); seen++;
      listChildren_(fid0, false, 200).forEach(function(f){
        if(q && String(f.title).toLowerCase().indexOf(q)===-1) return; files.push(fileRes_(f)); });
      listChildren_(fid0, true, 200).forEach(function(sf){ queue.push(sf.id); });
    }
    files.sort(function(a,b){return b.updated-a.updated;});
    return json_({ok:true, files:files.slice(0,40)});
  }
  if (action === "browse") {      // one folder: its direct files + subfolders (navigation)
    var fid=e.parameter.folderId||FOLDER_ID;
    var meta=Drive.Files.get(fid);
    var files=listChildren_(fid, false, 300).map(fileRes_);
    var folders=listChildren_(fid, true, 300).map(function(sf){
      return { id:sf.id, name:sf.title, count:countFiles_(sf.id, 500) }; });
    folders.sort(function(a,b){return a.name.toLowerCase()<b.name.toLowerCase()?-1:1;});
    var parent=(meta.parents&&meta.parents.length)?meta.parents[0].id:"";
    return json_({ok:true, folder:{id:fid,name:meta.title,parent:parent}, folders:folders, files:files});
  }
  if (action === "deleteFile") {
    var id=e.parameter.id; if(!id) return json_({ok:false});
    Drive.Files.update({ labels:{ trashed:true } }, id);
    return json_({ok:true});
  }

  // action === "list"
  var lastRow=sh.getLastRow(), lastCol=Math.max(sh.getLastColumn(),10), rows=[];
  if(lastRow>info.headerRow){
    var range=sh.getRange(info.headerRow+1,1,lastRow-info.headerRow,lastCol);
    var data=range.getValues(), rich=range.getRichTextValues();
    var keys=linkCols_(info);   // {front,back,left,right,order,folder} present only for this sheet's headers
    for(var r=0;r<data.length;r++){
      var vals=data[r].map(function(v){return v==null?"":String(v);});
      if(!vals.some(function(v){return v.trim()!=="";})) continue;
      var links={};
      for(var k in keys){ var ci=keys[k]; if(ci>0){ var u=rich[r][ci-1]?rich[r][ci-1].getLinkUrl():null; if(u) links[k]=u; } }
      rows.push({row:info.headerRow+1+r, values:vals, links:links});
    }
  }
  return json_({ok:true, rows:rows});
}

function doPost(e) {
  var p={}; try{ p=JSON.parse(e.postData.contents); }catch(err){}
  if (p.action === "upload") {
    var fid=p.folderId||FOLDER_ID;
    var blob=Utilities.newBlob(Utilities.base64Decode(p.data), p.mime||"application/octet-stream", p.name||"upload");
    var meta=Drive.Files.insert({ title:p.name||"upload", parents:[{id:fid}] }, blob);
    return json_({ok:true, file:fileRes_(meta)});
  }
  return doGet({ parameter: p });
}
