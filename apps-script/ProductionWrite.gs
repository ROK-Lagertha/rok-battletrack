/**
 * CF-014.2 Phase B – Production CREATE bridge, deliberately LOCKED by default.
 * Separate live approval is required on BOTH Cloudflare and Apps Script.
 * No test requests should be sent to this endpoint in production.
 */
function btProductionWritePost_(e) {
  function out(v) { return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON); }
  try {
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
