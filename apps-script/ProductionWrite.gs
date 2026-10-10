/**
 * CF-014.2 Phase B – Production CREATE bridge, deliberately LOCKED by default.
 * Separate live approval is required on BOTH Cloudflare and Apps Script.
 * No test requests should be sent to this endpoint in production.
 */
function btProductionWritePost_(e) {
  function out(v) { return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON); }
  try {
    // CLOSE has an independent gate and verifier; CREATE remains unchanged.
    var rawBody = String(e && e.postData && e.postData.contents || '{}');
    var actionHint = '';
    try { actionHint = String(JSON.parse(rawBody).action || ''); } catch (_) {}
    if (actionHint === 'CLOSE_KVK') return btProductionClosePost_(e);
    // This is the first guard: do not parse a request or touch the database when locked.
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('BT_PRODUCTION_CREATE_ENABLED') !== 'YES_PRODUCTION_KVK_CREATE')
      return out({ok:false,code:'PRODUCTION_WRITES_LOCKED'});
    var secret = String(props.getProperty('BT_BRIDGE_SECRET') || '');
    if (secret.length < 32) return out({ok:false,code:'BRIDGE_NOT_CONFIGURED'});
    var data = JSON.parse(String(e && e.postData && e.postData.contents || '{}'));
    if (data.bridgeWrite !== 1 || data.action !== 'CREATE_KVK') return out({ok:false,code:'INVALID_ACTION'});
    var timestamp = String(data.timestamp || ''), nonce = String(data.nonce || '');
    var requestId = String(data.requestId || ''), story = String(data.story || '').trim();
    var startDate = String(data.startDate || ''), endDate = String(data.endDate || '');
    var signature = String(data.signature || '').toLowerCase();
    if (!/^\d{10}$/.test(timestamp) || Math.abs(Math.floor(Date.now()/1000)-Number(timestamp)) > 90 ||
        !/^[a-f0-9-]{36}$/i.test(nonce) || !/^[a-f0-9-]{36}$/i.test(requestId) ||
        !story || story.length > 160 || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !/^[a-f0-9]{64}$/.test(signature))
      return out({ok:false,code:'INVALID_REQUEST'});
    var message = [timestamp,nonce,'CREATE_KVK',requestId,story,startDate,endDate].join('\n');
    var bytes = Utilities.computeHmacSha256Signature(message,secret);
    var expected = bytes.map(function(b){return ('0'+(b & 255).toString(16)).slice(-2);}).join('');
    var diff = 0;
    for (var i=0;i<64;i++) diff |= expected.charCodeAt(i)^signature.charCodeAt(i);
    if (diff) return out({ok:false,code:'INVALID_SIGNATURE'});

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return out({ok:false,code:'CREATE_BUSY'});
    try {
      var ss = getDatabase_();
      var kvkSheet = ss.getSheetByName(BT.SHEETS.KVKS);
      var storySheet = ss.getSheetByName(BT.SHEETS.STORIES);
      if (!kvkSheet || !storySheet) return out({ok:false,code:'MISSING_SHEETS'});
      var audit = ss.getSheetByName('_BT_PRODUCTION_WRITE_AUDIT');
      if (!audit) {
        audit = ss.insertSheet('_BT_PRODUCTION_WRITE_AUDIT');
        audit.appendRow(['Timestamp','Request ID','Action','Payload Hash','Status','KvK ID','Message']);
      }
      var payloadHashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
        [story,startDate,endDate].join('\n'));
      var payloadHash = payloadHashBytes.map(function(b){return ('0'+(b & 255).toString(16)).slice(-2);}).join('');
      var entries = audit.getLastRow() > 1 ? audit.getRange(2,2,audit.getLastRow()-1,5).getValues() : [];
      for (var j=0;j<entries.length;j++) {
        if (String(entries[j][0]) !== requestId) continue;
        if (String(entries[j][2]) !== payloadHash) return out({ok:false,code:'REQUEST_ID_CONFLICT'});
        if (String(entries[j][3]) === 'COMPLETED') {
          var priorId = String(entries[j][4]);
          var priorRows = sheetToObjects_(kvkSheet);
          var prior = priorRows.filter(function(x){return String(x['KvK ID'])===priorId;})[0];
          if (!prior) return out({ok:false,code:'AUDIT_KVK_MISSING'});
          return out({ok:true,duplicate:true,kvk:{id:priorId,number:Number(prior['KvK Number']),seasonName:String(prior['Season Name']),startDate:startDate,endDate:endDate,status:String(prior['Status'])}});
        }
        return out({ok:false,code:'CREATE_STATUS_UNCERTAIN',message:'Check production audit and KvKs before retrying.'});
      }
      // Strict server-side checks: valid calendar dates, end after start, active catalog story.
      function validDate(v) {
        var d = new Date(v+'T00:00:00Z');
        return !isNaN(d.getTime()) && Utilities.formatDate(d,'UTC','yyyy-MM-dd')===v;
      }
      if (!validDate(startDate) || !validDate(endDate) || endDate < startDate)
        return out({ok:false,code:'INVALID_DATE_RANGE'});
      var allowed = sheetToObjects_(storySheet).some(function(r){
        return String(r['Active']||'').toUpperCase()!=='FALSE' && String(r['Story Name']||'').trim()===story;
      });
      if (!allowed) return out({ok:false,code:'INVALID_STORY'});
      var kvks = sheetToObjects_(kvkSheet);
      var number = Math.max.apply(null,[0].concat(kvks.map(function(r){return Number(r['KvK Number'])||0;})))+1;
      var id = '3903-KVK'+number;
      if (kvks.some(function(r){return String(r['KvK ID'])===id;})) return out({ok:false,code:'DUPLICATE_KVK'});
      var auditRow = audit.getLastRow()+1;
      audit.appendRow([new Date(),requestId,'CREATE_KVK',payloadHash,'PENDING',id,'']);
      SpreadsheetApp.flush();
      var seasonName = 'Season '+number+' - '+story;
      kvkSheet.appendRow([id,number,seasonName,new Date(startDate+'T12:00:00'),new Date(endDate+'T12:00:00'),'Planned','']);
      kvkSheet.getRange(kvkSheet.getLastRow(),4,1,2).setNumberFormat('yyyy-mm-dd');
      SpreadsheetApp.flush();
      audit.getRange(auditRow,5,1,3).setValues([['COMPLETED',id,'Created through signed Cloudflare gateway']]);
      return out({ok:true,duplicate:false,kvk:{id:id,number:number,seasonName:seasonName,startDate:startDate,endDate:endDate,status:'Planned'}});
    } finally { lock.releaseLock(); }
  } catch (error) {
    console.error('CF-014.2 production write error',error);
    return out({ok:false,code:'CREATE_STATUS_UNCERTAIN',message:'Check audit and KvKs before retrying.'});
  }
}


/**
 * CF-014.4 B2 – independent signed CLOSE bridge.
 * Remains disabled until BT_PRODUCTION_CLOSE_ENABLED=YES_PRODUCTION_KVK_CLOSE
 * is explicitly set in BOTH Worker and Apps Script.
 */
function btProductionClosePost_(e) {
  function out(v) { return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON); }
  try {
    var props=PropertiesService.getScriptProperties();
    if (props.getProperty('BT_PRODUCTION_CLOSE_ENABLED')!=='YES_PRODUCTION_KVK_CLOSE')
      return out({ok:false,code:'PRODUCTION_CLOSE_LOCKED'});
    var secret=String(props.getProperty('BT_BRIDGE_SECRET')||'');
    if(secret.length<32) return out({ok:false,code:'BRIDGE_NOT_CONFIGURED'});
    var data=JSON.parse(String(e&&e.postData&&e.postData.contents||'{}'));
    if(data.bridgeWrite!==1||data.action!=='CLOSE_KVK') return out({ok:false,code:'INVALID_ACTION'});
    var timestamp=String(data.timestamp||''),nonce=String(data.nonce||''),requestId=String(data.requestId||'');
    var kvkId=String(data.kvkId||''),result=String(data.result||''),actualEndDate=String(data.actualEndDate||'');
    var notes=String(data.notes||''),tags=data.tags,signature=String(data.signature||'').toLowerCase();
    if(!/^\d{10}$/.test(timestamp)||Math.abs(Math.floor(Date.now()/1000)-Number(timestamp))>90||
      !/^[a-f0-9-]{36}$/i.test(nonce)||!/^[a-f0-9-]{36}$/i.test(requestId)||
      !/^3903-KVK[1-9][0-9]{0,5}$/.test(kvkId)||['WIN','LOST','MANUAL'].indexOf(result)<0||
      !/^\d{4}-\d{2}-\d{2}$/.test(actualEndDate)||notes.length>2000||
      !Array.isArray(tags)||tags.length>4||!/^[a-f0-9]{64}$/.test(signature))
      return out({ok:false,code:'INVALID_REQUEST'});
    var allowed=['WITH_STAR','WITHOUT_STAR','ALLY_SURRENDERED','SURRENDERED'];
    if(tags.some(function(t){return allowed.indexOf(t)<0;})||
      tags.some(function(t,i){return tags.indexOf(t)!==i;})||
      (tags.indexOf('WITH_STAR')>=0&&tags.indexOf('WITHOUT_STAR')>=0))
      return out({ok:false,code:'INVALID_TAGS'});
    var message=[timestamp,nonce,'CLOSE_KVK',requestId,kvkId,result,actualEndDate,JSON.stringify(tags),notes].join('\n');
    var expected=Utilities.computeHmacSha256Signature(message,secret)
      .map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');
    var diff=0;for(var i=0;i<64;i++)diff|=expected.charCodeAt(i)^signature.charCodeAt(i);
    if(diff) return out({ok:false,code:'INVALID_SIGNATURE'});
    var parsedDate=new Date(actualEndDate+'T00:00:00Z');
    if(isNaN(parsedDate.getTime())||Utilities.formatDate(parsedDate,'UTC','yyyy-MM-dd')!==actualEndDate)
      return out({ok:false,code:'INVALID_DATE'});
    var lock=LockService.getScriptLock();
    if(!lock.tryLock(20000)) return out({ok:false,code:'CLOSE_BUSY'});
    try {
      var ss=getDatabase_(),sheet=ss.getSheetByName(BT.SHEETS.KVKS);
      if(!sheet) return out({ok:false,code:'KVK_SHEET_MISSING'});
      var audit=ss.getSheetByName('_BT_PRODUCTION_WRITE_AUDIT');
      if(!audit) {audit=ss.insertSheet('_BT_PRODUCTION_WRITE_AUDIT');
        audit.appendRow(['Timestamp','Request ID','Action','Payload Hash','Status','KvK ID','Message']);}
      var payloadHash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
        [kvkId,result,actualEndDate,JSON.stringify(tags),notes].join('\n'))
        .map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');
      var entries=audit.getLastRow()>1?audit.getRange(2,2,audit.getLastRow()-1,5).getValues():[];
      for(var j=0;j<entries.length;j++){
        if(String(entries[j][0])!==requestId)continue;
        if(String(entries[j][2])!==payloadHash||String(entries[j][1])!=='CLOSE_KVK')
          return out({ok:false,code:'REQUEST_ID_CONFLICT'});
        if(String(entries[j][3])==='COMPLETED')
          return out({ok:true,duplicate:true,kvk:{id:kvkId,status:'Closed',result:result,actualEndDate:actualEndDate,tags:tags,notes:notes}});
        return out({ok:false,code:'CLOSE_STATUS_UNCERTAIN',message:'Review production audit before retrying.'});
      }
      var values=sheet.getDataRange().getValues(),headers=values[0].map(String);
      var idCol=headers.indexOf('KvK ID'),statusCol=headers.indexOf('Status');
      var startCol=headers.indexOf('Start Scan Date'),endCol=headers.indexOf('End Scan Date');
      if([idCol,statusCol,startCol,endCol].some(function(n){return n<0;}))
        return out({ok:false,code:'KVK_SCHEMA_MISMATCH'});
      var rowIndex=-1;
      for(var k=1;k<values.length;k++)if(String(values[k][idCol]).trim()===kvkId){rowIndex=k;break;}
      if(rowIndex<1)return out({ok:false,code:'KVK_NOT_FOUND'});
      var status=String(values[rowIndex][statusCol]||'').trim().toLowerCase();
      if(['historical','completed','closed'].indexOf(status)>=0)
        return out({ok:false,code:'KVK_ALREADY_CLOSED'});
      if(status!=='active'&&status!=='planned')
        return out({ok:false,code:'KVK_STATUS_NOT_CLOSABLE'});
      function iso(v){return v instanceof Date?Utilities.formatDate(v,Session.getScriptTimeZone()||'Europe/Berlin','yyyy-MM-dd'):String(v||'').slice(0,10);}
      var startIso=iso(values[rowIndex][startCol]);
      if(startIso&&actualEndDate<startIso)return out({ok:false,code:'END_BEFORE_START'});
      // End Scan Date is immutable; reopening later relies on it.
      var required=['Actual End Date','Result','Closure Tags','Closure Notes','Closed At','Closed By'];
      required.forEach(function(name){if(headers.indexOf(name)<0){sheet.getRange(1,headers.length+1).setValue(name);headers.push(name);}});
      var auditRow=audit.getLastRow()+1;
      audit.appendRow([new Date(),requestId,'CLOSE_KVK',payloadHash,'PENDING',kvkId,'']);
      SpreadsheetApp.flush();
      var row=rowIndex+1;
      function put(name,v){sheet.getRange(row,headers.indexOf(name)+1).setValue(v);}
      put('Actual End Date',new Date(actualEndDate+'T12:00:00'));
      sheet.getRange(row,headers.indexOf('Actual End Date')+1).setNumberFormat('yyyy-mm-dd');
      put('Result',result);put('Closure Tags',JSON.stringify(tags));put('Closure Notes',notes);
      put('Closed At',new Date());put('Closed By','Discord Officer+Data (signed gateway)');
      put('Status','Closed');
      SpreadsheetApp.flush();
      audit.getRange(auditRow,5,1,3).setValues([['COMPLETED',kvkId,'Signed CLOSE; tags='+JSON.stringify(tags)+'; notes='+notes]]);
      return out({ok:true,duplicate:false,kvk:{id:kvkId,status:'Closed',result:result,actualEndDate:actualEndDate,tags:tags,notes:notes}});
    } finally {lock.releaseLock();}
  } catch(error){
    console.error('CF-014.4 production CLOSE error',error);
    return out({ok:false,code:'CLOSE_STATUS_UNCERTAIN',message:'Check audit and KvKs before retrying.'});
  }
}
