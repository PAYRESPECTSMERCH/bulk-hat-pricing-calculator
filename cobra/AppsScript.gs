/**
 * Cobra Digitize — Google Apps Script backend (v3)
 * list / setStatus / moveRow / setCell (any column) / listFiles (recent, recursive)
 * / browse (one folder + subfolders) / deleteFile / upload (POST)
 *
 * RE-DEPLOY: paste all of this, Save, ▶ Run the `authorize` function once
 * (approve Drive), then Deploy → Manage deployments → Edit → New version.
 */
var SHEET_ID  = "1Lu4wSwQyc3dn4XTkbY3WXWKkF3SI3I-bI4O8TYm8hsI";
var FOLDER_ID = "1HbzeuYC_WyEnltsaxPz5Wn0DJvAajcG0";   // artwork folder
var SHEET_TAB = "";

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
      return { headerRow: i + 1, statusCol: up.indexOf("STATUS") + 1, timestampCol: up.indexOf("TIMESTAMP") + 1,
        cols: { FRONT: up.indexOf("FRONT")+1, BACK: up.indexOf("BACK")+1, LEFT: up.indexOf("LEFT")+1, RIGHT: up.indexOf("RIGHT")+1,
                ORDER: up.indexOf("ORDER")+1, DETAILS: up.indexOf("DETAILS")+1, THREAD: up.indexOf("THREAD")+1, FOLDER: up.indexOf("DIGITIZE FOLDER")+1 } };
    }
  }
  return { headerRow: 1, statusCol: 1, timestampCol: 0, cols: {} };
}
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fileObj_(f){ return { id:f.getId(), name:f.getName(), url:"https://drive.google.com/file/d/"+f.getId()+"/view",
  thumb:"https://drive.google.com/thumbnail?id="+f.getId()+"&sz=w240", size:f.getSize(), mime:f.getMimeType(), updated:f.getLastUpdated().getTime() }; }

// ▶ RUN THIS ONCE to grant Drive access.
function authorize(){ Logger.log("OK: " + DriveApp.getFolderById(FOLDER_ID).getName()); }

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "list";
  var sh = getSheet_(), info = headerInfo_(sh);

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
    var files=[], queue=[DriveApp.getFolderById(e.parameter.folderId||FOLDER_ID)], scanned=0, MAX=800;
    while(queue.length && scanned<MAX){
      var fo=queue.shift(), fit=fo.getFiles();
      while(fit.hasNext() && scanned<MAX){ var f=fit.next(); scanned++;
        if(q && f.getName().toLowerCase().indexOf(q)===-1) continue; files.push(fileObj_(f)); }
      var subs=fo.getFolders(); while(subs.hasNext()) queue.push(subs.next());
    }
    files.sort(function(a,b){return b.updated-a.updated;});
    return json_({ok:true, files:files.slice(0,40)});
  }
  if (action === "browse") {      // one folder: its direct files + subfolders (navigation)
    var fid=e.parameter.folderId||FOLDER_ID, folder=DriveApp.getFolderById(fid);
    var files=[], it=folder.getFiles(), n=0; while(it.hasNext()&&n<300){ files.push(fileObj_(it.next())); n++; }
    files.sort(function(a,b){return b.updated-a.updated;});
    var folders=[], fs=folder.getFolders(), m=0; while(fs.hasNext()&&m<300){ var sf=fs.next(); var c=0, cit=sf.getFiles(); while(cit.hasNext()&&c<200){cit.next();c++;} folders.push({id:sf.getId(),name:sf.getName(),count:c}); m++; }
    folders.sort(function(a,b){return a.name.toLowerCase()<b.name.toLowerCase()?-1:1;});
    var parent=""; var pit=folder.getParents(); if(pit.hasNext()) parent=pit.next().getId();
    return json_({ok:true, folder:{id:fid,name:folder.getName(),parent:parent}, folders:folders, files:files});
  }
  if (action === "deleteFile") {
    var id=e.parameter.id; if(!id) return json_({ok:false});
    DriveApp.getFileById(id).setTrashed(true);
    return json_({ok:true});
  }

  // action === "list"
  var lastRow=sh.getLastRow(), lastCol=Math.max(sh.getLastColumn(),10), rows=[];
  if(lastRow>info.headerRow){
    var range=sh.getRange(info.headerRow+1,1,lastRow-info.headerRow,lastCol);
    var data=range.getValues(), rich=range.getRichTextValues();
    var keys={front:info.cols.FRONT,back:info.cols.BACK,left:info.cols.LEFT,right:info.cols.RIGHT,order:info.cols.ORDER,folder:info.cols.FOLDER};
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
    var file=DriveApp.getFolderById(fid).createFile(blob);
    return json_({ok:true, file:fileObj_(file)});
  }
  return doGet({ parameter: p });
}
