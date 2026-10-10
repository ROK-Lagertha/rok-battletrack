/** CF-014.1: isolated signed read-only KvK management bridge. */
function btBridgeGet_(e) {
  function output(x) { return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON); }
  try {
    var p = e.parameter || {};
    var secret = PropertiesService.getScriptProperties().getProperty('BT_BRIDGE_SECRET') || '';
    if (secret.length < 32) return output({ok:false,code:'BRIDGE_NOT_CONFIGURED'});
    var action = String(p.action || '');
    var timestamp = String(p.timestamp || '');
    var nonce = String(p.nonce || '');
    var signature = String(p.signature || '').toLowerCase();
    if (['kvkManagement','kvkComparison','reopenEligibility'].indexOf(action) === -1 || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9-]{36}$/i.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return output({ok:false,code:'INVALID_REQUEST'});
    if (Math.abs(Math.floor(Date.now()/1000)-Number(timestamp)) > 90) return output({ok:false,code:'EXPIRED_REQUEST'});
    var kvkId = String(p.kvkId || '');
    if ((action === 'kvkComparison' || action === 'reopenEligibility') && !/^3903-KVK[1-9][0-9]{0,5}$/.test(kvkId)) return output({ok:false,code:'INVALID_KVK'});
    if (action === 'kvkManagement' && kvkId) return output({ok:false,code:'INVALID_REQUEST'});
    var signedMessage = timestamp+'\n'+nonce+'\n'+action+((action === 'kvkComparison' || action === 'reopenEligibility') ? '\n'+kvkId : '');
    var bytes = Utilities.computeHmacSha256Signature(signedMessage, secret);
    var expected = bytes.map(function(b){return ('0'+(b & 255).toString(16)).slice(-2);}).join('');
    var diff = 0;
    for (var i=0;i<64;i++) diff |= expected.charCodeAt(i)^signature.charCodeAt(i);
    if (diff !== 0) return output({ok:false,code:'INVALID_SIGNATURE'});
    var cache = CacheService.getScriptCache();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return output({ok:false,code:'BRIDGE_BUSY'});
    try {
      var replayKey = 'btbridge_'+nonce;
      if (cache.get(replayKey)) return output({ok:false,code:'REPLAY'});
      cache.put(replayKey,'1',180);
    } finally { lock.releaseLock(); }
    if (action === 'kvkComparison') return output(btReadKvkComparison_(kvkId));
    if (action === 'reopenEligibility') return output(btReadReopenEligibility_(kvkId));
    var ss = getDatabase_();
    var kvkSheet = ss.getSheetByName(BT.SHEETS.KVKS);
    var storySheet = ss.getSheetByName(BT.SHEETS.STORIES);
    if (!kvkSheet || !storySheet) throw new Error('Missing KvK data sheets');
    var kvks = sheetToObjects_(kvkSheet);
    var stories = sheetToObjects_(storySheet).filter(function(r){return String(r['Active']||'').toUpperCase() !== 'FALSE';}).map(function(r){return {name:String(r['Story Name']||'').trim(),baseStory:String(r['Base Story']||'').trim(),variant:String(r['Variant']||'').trim()};}).filter(function(r){return r.name;});
    var nextNumber = Math.max.apply(null,[0].concat(kvks.map(function(r){return Number(r['KvK Number'])||0;})))+1;
    var items = kvks.map(function(r){return {id:String(r['KvK ID']||''),number:Number(r['KvK Number'])||0,seasonName:String(r['Season Name']||''),startDate:formatAdminDate_(r['Start Scan Date']),endDate:formatAdminDate_(r['End Scan Date']),status:String(r['Status']||'')};}).sort(function(a,b){return b.number-a.number;});
    return output({ok:true,nextNumber:nextNumber,nextKvkId:'3903-KVK'+nextNumber,stories:stories,kvks:items});
  } catch (err) {
    console.error('CF-014 bridge error',err);
    return output({ok:false,code:'BRIDGE_ERROR'});
  }
}

/** CF-014.5 E.2: strictly read-only eligibility check. Never creates sheets or writes audit. */
function btReadReopenEligibility_(kvkId) {
  function deny(code, detail) { return {ok:true,stage:'CF-014.5-PHASE-E2',mode:'READ_ONLY',writesEnabled:false,
    kvkId:kvkId,eligible:false,code:code,reason:detail}; }
  if (!/^3903-KVK[1-9][0-9]{0,5}$/.test(kvkId)) return deny('INVALID_KVK','Invalid KvK ID.');
  var ss=getDatabase_(), sheet=ss.getSheetByName(BT.SHEETS.KVKS);
  var audit=ss.getSheetByName('_BT_PRODUCTION_WRITE_AUDIT');
  if(!sheet) return deny('KVK_SHEET_MISSING','The existing KvKs sheet was not found. No changes were made.');
  if(!audit) return deny('AUDIT_NOT_INITIALIZED','The production write audit sheet does not exist yet. Eligibility cannot be confirmed without signed CLOSE history. No changes were made.');
  var values=sheet.getDataRange().getValues();
  if(!values.length) return deny('KVK_SCHEMA_MISMATCH','KvK table is empty.');
  var headers=values[0].map(String), required=['KvK ID','Status','End Scan Date','Actual End Date','Closed At','Closed By'];
  if(required.some(function(h){return headers.indexOf(h)<0;}))
    return deny('KVK_SCHEMA_MISMATCH','Required KvK columns are missing.');
  var idCol=headers.indexOf('KvK ID'), row=null;
  for(var i=1;i<values.length;i++) if(String(values[i][idCol]).trim()===kvkId){
    if(row) return deny('DUPLICATE_KVK_ID','Duplicate KvK IDs require reconciliation.');
    row=values[i];
  }
  if(!row)return deny('KVK_NOT_FOUND','KvK does not exist.');
  if(String(row[headers.indexOf('Status')]||'').trim().toLowerCase()!=='closed')
    return deny('KVK_NOT_CLOSED','Only closed KvKs can be reopened.');
  if(!row[headers.indexOf('Closed At')] ||
    String(row[headers.indexOf('Closed By')]||'').trim()!=='Discord Officer+Data (signed gateway)')
    return deny('SIGNED_CLOSURE_METADATA_REQUIRED','Signed closure metadata is missing.');
  function iso(v){
    if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v))
      return Utilities.formatDate(v,'Europe/Berlin','yyyy-MM-dd');
    return String(v||'').slice(0,10);
  }
  function valid(v){var d=new Date(v+'T00:00:00Z');
    return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(d.getTime())&&
      Utilities.formatDate(d,'UTC','yyyy-MM-dd')===v;}
  var planned=iso(row[headers.indexOf('End Scan Date')]);
  var actual=iso(row[headers.indexOf('Actual End Date')]);
  var today=Utilities.formatDate(new Date(),'Europe/Berlin','yyyy-MM-dd');
  if(!valid(planned)||!valid(actual))return deny('END_DATES_MISSING','Closure dates are invalid or missing.');
  if(actual>today)return deny('ACTUAL_END_IN_FUTURE','Actual closure date cannot be in the future.');
  if(actual>=planned)return deny('NOT_EARLY_CLOSURE','KvK was not closed before its original end date.');
  if(today>=planned)return deny('PLANNED_END_REACHED','Original planned end date has been reached.');
  // Same audit ordering/uncertain-state policy as the gated RE-OPEN write handler.
  var safety=btKvkAuditSafety_(audit,kvkId);
  if(!safety.ok)return deny(safety.code,'Audit reconciliation is required.');
  if(safety.latestCompletedAction!=='CLOSE_KVK'||!safety.latestCloseRow||
     safety.latestCloseRow<=safety.latestReopenRow)
    return deny('AUTHORIZED_CLOSE_AUDIT_REQUIRED','Latest completed signed action must be CLOSE.');
  return {ok:true,stage:'CF-014.5-PHASE-E2',mode:'READ_ONLY',writesEnabled:false,
    kvkId:kvkId,eligible:true,code:'ELIGIBLE',reason:'Eligible at the time of this read-only check.',
    plannedEndDate:planned,actualEndDate:actual,checkedDate:today};
}
