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
    if (action !== 'kvkManagement' || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9-]{36}$/i.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return output({ok:false,code:'INVALID_REQUEST'});
    if (Math.abs(Math.floor(Date.now()/1000)-Number(timestamp)) > 90) return output({ok:false,code:'EXPIRED_REQUEST'});
    var bytes = Utilities.computeHmacSha256Signature(timestamp+'\n'+nonce+'\n'+action, secret);
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
