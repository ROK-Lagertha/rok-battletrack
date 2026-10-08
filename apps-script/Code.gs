/**
 * ============================================================
 * ROK BattleTrack – Backend API V1
 * Kingdom 3903
 * ============================================================
 *
 * Database:
 * ROK BattleTrack - Database
 *
 * API:
 * Governor ID -> BattleTrack Player Payload
 * ============================================================
 */

const BT = {

  VERSION: '1.6.0',

  KINGDOM: 3903,

  DATABASE_ID: '1IR9ETdS3xxFEY0y3xfkb6h3BJ_VZp9f1-dmW2flfZvg',

  SHEETS: {
    GOVERNORS: 'Governors',
    KVKS: 'KvKs',
    RESULTS: 'KvK Results',
    STORIES: 'KvK Stories',
    SNAPSHOTS: 'Kingdom Snapshots',
    IMPORTS: 'Scan Imports'
  },

  STATUS: {
    PASS: 'PASS',
    IN_PROGRESS: 'IN_PROGRESS',
    NOT_MET: 'NOT_MET'
  }

};


/**
 * ============================================================
 * WEBAPP ENTRY
 * ============================================================
 */

function doGet(e) {
  const isApiRequest =
    e &&
    e.parameter &&
    (
      e.parameter.api === '1' ||
      e.parameter.governorId
    );

  if (e && e.parameter && e.parameter.bridge === '1') {
    return btBridgeGet_(e);
  }
  if (isApiRequest) {
    return apiGet_(e);
  }

  // OP-058 Phase A: keep the initial render path free of Drive reads.
  // UI artwork is shipped as optimized static data URIs in Index.html, so the
  // BattleTrack shell can be evaluated immediately on first load and reload.
  const template = HtmlService.createTemplateFromFile('Index');

  return template
    .evaluate()
    .setTitle('ROK BattleTrack')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include_(filename) {
  return HtmlService
    .createHtmlOutputFromFile(filename)
    .getContent();
}


/**
 * OP-047 - Leadership Admin Center authentication.
 * Configure Script Properties: BT_ADMIN_USER and BT_ADMIN_PASSWORD.
 * Credentials never leave the server; successful login returns a short-lived token.
 */
function adminLogin(username, password) {
  const props = PropertiesService.getScriptProperties();
  const configuredUser = String(props.getProperty('BT_ADMIN_USER') || '').trim();
  const configuredPassword = String(props.getProperty('BT_ADMIN_PASSWORD') || '');

  if (!configuredUser || !configuredPassword) {
    return { ok: false, code: 'NOT_CONFIGURED', message: 'Admin access is not configured yet.' };
  }

  if (String(username || '').trim() !== configuredUser || String(password || '') !== configuredPassword) {
    Utilities.sleep(350);
    return { ok: false, code: 'INVALID_LOGIN', message: 'Invalid admin credentials.' };
  }

  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('BT_ADMIN_SESSION_' + token, configuredUser, 1800);
  return { ok: true, token: token, user: configuredUser, expiresIn: 1800 };
}

function adminValidateSession(token) {
  const user = getAdminSessionUser_(token);
  return { ok: !!user, user: user || null };
}

function adminLogout(token) {
  if (token) CacheService.getScriptCache().remove('BT_ADMIN_SESSION_' + String(token));
  return { ok: true };
}

function getAdminSessionUser_(token) {
  if (!token) return null;
  return CacheService.getScriptCache().get('BT_ADMIN_SESSION_' + String(token));
}


/**
 * OP-053 - Leadership KvK Management.
 * KvKs remains the single source of truth; story options come from KvK Stories.
 */
function adminGetKvkManagementData(token) {
  const user = getAdminSessionUser_(token);
  if (!user) return { ok: false, code: 'SESSION_EXPIRED', message: 'Admin session expired.' };

  const ss = getDatabase_();
  const kvkSheet = ss.getSheetByName(BT.SHEETS.KVKS);
  const storySheet = ss.getSheetByName(BT.SHEETS.STORIES);
  if (!kvkSheet || !storySheet) throw new Error('KvK management sheets are missing.');

  const kvks = sheetToObjects_(kvkSheet);
  const stories = sheetToObjects_(storySheet)
    .filter(r => String(r['Active'] || '').toUpperCase() !== 'FALSE')
    .map(r => ({
      name: String(r['Story Name'] || '').trim(),
      baseStory: String(r['Base Story'] || '').trim(),
      variant: String(r['Variant'] || '').trim()
    }))
    .filter(r => r.name);

  const numbers = kvks.map(r => Number(r['KvK Number']) || 0);
  const nextNumber = Math.max.apply(null, [0].concat(numbers)) + 1;

  return {
    ok: true,
    nextNumber: nextNumber,
    nextKvkId: '3903-KVK' + nextNumber,
    stories: stories,
    kvks: kvks.map(r => ({
      id: String(r['KvK ID'] || ''),
      number: Number(r['KvK Number']) || 0,
      seasonName: String(r['Season Name'] || ''),
      startDate: formatAdminDate_(r['Start Scan Date']),
      endDate: formatAdminDate_(r['End Scan Date']),
      status: String(r['Status'] || '')
    })).sort((a,b) => b.number - a.number)
  };
}

/** OP-057 - Finalize a KvK and protect it from future snapshot imports. */
function adminCloseKvk(token, payload) {
  const user = getAdminSessionUser_(token);
  if (!user) return { ok:false, code:'SESSION_EXPIRED', message:'Admin session expired.' };
  payload = payload || {};
  const kvkId = String(payload.kvkId || '').trim();
  const result = String(payload.result || '').trim().toUpperCase();
  const actualEndDate = String(payload.actualEndDate || '').trim();
  if (!kvkId) return {ok:false,code:'MISSING_KVK',message:'Please select a KvK.'};
  if (['WIN','LOST','MANUAL'].indexOf(result) === -1) return {ok:false,code:'INVALID_RESULT',message:'Result must be WIN, LOST or MANUAL.'};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(actualEndDate)) return {ok:false,code:'INVALID_DATE',message:'Please enter a valid actual end date.'};
  const lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const ss=getDatabase_(), sheet=ss.getSheetByName(BT.SHEETS.KVKS); if(!sheet) throw new Error('KvKs sheet is missing.');
    const values=sheet.getDataRange().getValues(), headers=values[0].map(String), idCol=headers.indexOf('KvK ID');
    const rowIndex=values.findIndex((r,i)=>i>0 && String(r[idCol]||'').trim()===kvkId); if(rowIndex<1)return {ok:false,code:'KVK_NOT_FOUND',message:'Selected KvK was not found.'};
    const statusCol=headers.indexOf('Status'), current=String(values[rowIndex][statusCol]||'').trim().toLowerCase();
    if(['historical','completed','closed'].indexOf(current)!==-1)return {ok:false,code:'KVK_ALREADY_CLOSED',message:'This KvK is already closed and protected.'};
    const startCol=headers.indexOf('Start Scan Date'); const startIso=formatAdminDate_(values[rowIndex][startCol]); if(startIso && actualEndDate<startIso)return {ok:false,code:'INVALID_RANGE',message:'Actual end date cannot be before the KvK start date.'};
    const needed=['Actual End Date','Result','Closed At','Closed By'];
    needed.forEach(function(name){if(headers.indexOf(name)===-1){sheet.getRange(1,sheet.getLastColumn()+1).setValue(name);headers.push(name);}});
    const sheetRow=rowIndex+1, actualCol=headers.indexOf('Actual End Date')+1, resultCol=headers.indexOf('Result')+1, closedAtCol=headers.indexOf('Closed At')+1, closedByCol=headers.indexOf('Closed By')+1;
    sheet.getRange(sheetRow,statusCol+1).setValue('Closed');
    sheet.getRange(sheetRow,actualCol).setValue(new Date(actualEndDate+'T12:00:00')).setNumberFormat('yyyy-mm-dd');
    sheet.getRange(sheetRow,resultCol).setValue(result);
    sheet.getRange(sheetRow,closedAtCol).setValue(new Date()); sheet.getRange(sheetRow,closedByCol).setValue(user);
    SpreadsheetApp.flush();
    return {ok:true,kvk:{id:kvkId,status:'Closed',result:result,actualEndDate:actualEndDate,closedBy:user}};
  } finally { lock.releaseLock(); }
}

/**
 * OP-055 - Shared Leadership KvK Selector (v1.10.0b).
 * Returns the KvKs table as the single source of truth for Leadership tools.
 */
function adminGetLeadershipKvks(token) {
  const user = getAdminSessionUser_(token);
  if (!user) return { ok: false, code: 'SESSION_EXPIRED', message: 'Admin session expired.' };

  const ss = getDatabase_();
  const kvkSheet = ss.getSheetByName(BT.SHEETS.KVKS);
  if (!kvkSheet) throw new Error('KvKs sheet is missing.');

  const kvks = sheetToObjects_(kvkSheet).map(r => {
    const status = String(r['Status'] || '').trim();
    const normalizedStatus = status.toLowerCase();
    const isHistorical = normalizedStatus === 'historical' || normalizedStatus === 'completed' || normalizedStatus === 'closed';
    return {
      id: String(r['KvK ID'] || '').trim(),
      number: Number(r['KvK Number']) || 0,
      seasonName: String(r['Season Name'] || '').trim(),
      startDate: formatAdminDate_(r['Start Scan Date']),
      endDate: formatAdminDate_(r['End Scan Date']),
      status: status,
      actualEndDate: formatAdminDate_(r['Actual End Date']),
      result: String(r['Result'] || '').trim(),
      comparisonMode: isHistorical ? 'START_END' : 'START_LATEST'
    };
  }).filter(r => r.id).sort((a,b) => b.number - a.number);

  return { ok: true, kvks: kvks };
}

/**
 * OP-051 - Leadership Comparison (v1.10.0c).
 * Reads the prepared BattleTrack KvK Results for one selected KvK.
 * No database data is changed.
 */
function adminGetKvkComparison(token, kvkId) {
  const user = getAdminSessionUser_(token);
  if (!user) return { ok:false, code:'SESSION_EXPIRED', message:'Admin session expired.' };

  kvkId = String(kvkId || '').trim();
  if (!kvkId) return { ok:false, code:'MISSING_KVK', message:'Please select a KvK.' };

  const ss = getDatabase_();
  const kvkSheet = ss.getSheetByName(BT.SHEETS.KVKS);
  const resultSheet = ss.getSheetByName(BT.SHEETS.RESULTS);
  if (!kvkSheet || !resultSheet) throw new Error('BattleTrack comparison sheets are missing.');

  const kvk = sheetToObjects_(kvkSheet).find(r => String(r['KvK ID'] || '').trim() === kvkId);
  if (!kvk) return { ok:false, code:'KVK_NOT_FOUND', message:'Selected KvK was not found.' };

  const status = String(kvk['Status'] || '').trim();
  const normalizedStatus = status.toLowerCase();
  const historical = normalizedStatus === 'historical' || normalizedStatus === 'completed' || normalizedStatus === 'closed';

  const rows = sheetToObjects_(resultSheet)
    .filter(r => String(r['KvK ID'] || '').trim() === kvkId)
    .map(r => {
      const governorId = normalizeId_(r['Governor ID']);
      const t4 = Number(r['KvK T4 Kills']) || 0;
      const t5 = Number(r['KvK T5 Kills']) || 0;
      const deads = Number(r['KvK Deads']) || 0;
      const kp = Number(r['KvK Kill Points']) || 0;
      const startPower = Number(r['Start Power']) || 0;
      return {
        governorId: governorId,
        governorName: String(r['Governor Name'] || '').trim() || ('Governor ' + governorId),
        classification: String(r['Classification'] || 'Regular').trim(),
        startPower: startPower,
        endPower: numberOrNull_(r['End/Latest Power']),
        powerDelta: numberOrNull_(r['Power Delta']),
        killPoints: kp,
        t4Kills: t4,
        t5Kills: t5,
        kills: t4 + t5,
        deads: deads,
        dkp: (deads * 10) + (t4 * 5) + (t5 * 15),
        kpr: startPower > 0 ? kp / startPower : 0,
        killRequirement: numberOrNull_(r['Kill Requirement']),
        deadRequirement: numberOrNull_(r['Dead Requirement']),
        killProgress: numberOrNull_(r['Kill Progress %']),
        deadProgress: numberOrNull_(r['Dead Progress %']),
        overallProgress: numberOrNull_(r['Overall Progress %']),
        requirementStatus: String(r['Requirement Status'] || '').trim()
      };
    })
    .filter(r => r.governorId)
    .sort((a,b) => (b.dkp-a.dkp) || (b.killPoints-a.killPoints) || String(a.governorId).localeCompare(String(b.governorId)));

  rows.forEach((r,i) => r.dkpRank = i + 1);

  return {
    ok:true,
    kvk:{
      id:kvkId,
      number:Number(kvk['KvK Number']) || 0,
      seasonName:String(kvk['Season Name'] || '').trim(),
      status:status,
      startDate:formatAdminDate_(kvk['Start Scan Date']),
      endDate:formatAdminDate_(kvk['End Scan Date']),
      comparisonMode:historical ? 'START_END' : 'START_LATEST'
    },
    total:rows.length,
    rows:rows
  };
}



// v1.11.1 - Kingdom Scan XLSX server validation (memory only, no Drive/database write)
function adminValidateKingdomScanXlsx(token, payload) {
  const user = getAdminSessionUser_(token);
  if (!user) return { ok:false, code:'SESSION_EXPIRED', message:'Admin session expired.' };
  payload = payload || {};
  const fileName = String(payload.fileName || '').trim();
  const base64 = String(payload.base64 || '');
  if (!fileName || !/\.xlsx$/i.test(fileName) || !base64) return { ok:false, code:'INVALID_FILE', message:'A valid XLSX file is required.' };
  try {
    const bytes = Utilities.base64Decode(base64);
    const blobs = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip', fileName));
    const files = {};
    blobs.forEach(function(b){ files[String(b.getName() || '').replace(/^\/+/, '')] = b; });
    const workbook = xlsxText_(files, 'xl/workbook.xml');
    const rels = xlsxText_(files, 'xl/_rels/workbook.xml.rels');
    if (!workbook || !rels) throw new Error('Workbook structure is incomplete.');
    const shared = xlsxSharedStrings_(files);
    const relMap = {};
    const relRe = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?\s*>/g;
    let m;
    while ((m = relRe.exec(rels))) relMap[m[1]] = m[2];
    const sheets = [];
    const sheetRe = /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/g;
    while ((m = sheetRe.exec(workbook))) {
      let target = relMap[m[2]] || '';
      target = target.replace(/^\/+/, '');
      if (target.indexOf('xl/') !== 0) target = 'xl/' + target.replace(/^\.\//, '');
      sheets.push({name:xlsxXmlDecode_(m[1]), path:target});
    }
    const required = ['Governor Name','Governor ID','Power','Deads','Kill Points','T1 Kills','T2 Kills','T3 Kills','T4 Kills','T5 Kills'];
    let selected = null;
    for (let i=0;i<sheets.length;i++) {
      const xml = xlsxText_(files, sheets[i].path);
      if (!xml) continue;
      const rows = xlsxRows_(xml, shared, 8);
      if (!rows.length) continue;
      const headers = rows[0].map(function(v){return String(v == null ? '' : v).trim();});
      const missing = required.filter(function(h){return headers.indexOf(h) === -1;});
      if (!missing.length) { selected={sheet:sheets[i], xml:xml, headers:headers}; break; }
    }
    if (!selected) return {ok:false, code:'NO_GOVERNOR_SHEET', message:'No worksheet with the required BattleTrack governor columns was found.', requiredColumns:required};
    const rows = xlsxRows_(selected.xml, shared);
    const headers = rows.shift().map(function(v){return String(v == null ? '' : v).trim();});
    const idx = {}; headers.forEach(function(h,i){idx[h]=i;});
    const numericFields=['Power','Deads','Kill Points','T1 Kills','T2 Kills','T3 Kills','T4 Kills','T5 Kills'];
    const ids = {}; let duplicateIds=0, missingIds=0, invalidNumbers=0, governorRows=0; const kingdoms={};
    rows.forEach(function(row){
      const id=String(row[idx['Governor ID']] == null ? '' : row[idx['Governor ID']]).trim();
      const name=String(row[idx['Governor Name']] == null ? '' : row[idx['Governor Name']]).trim();
      if (!id && !name) return;
      governorRows++;
      if (!id) missingIds++; else { if(ids[id]) duplicateIds++; ids[id]=true; }
      numericFields.forEach(function(h){
        // HeroScrolls may encode a genuine numeric zero as an empty/self-closing XLSX cell.
        // For BattleTrack counter fields an empty cell therefore means 0; only non-empty,
        // non-numeric content is a validation issue.
        const v=row[idx[h]];
        if(v!=='' && v!=null && !isFinite(Number(v))) invalidNumbers++;
      });
      if (idx['Kingdom'] != null) { const k=String(row[idx['Kingdom']] == null ? '' : row[idx['Kingdom']]).trim(); if(k) kingdoms[k]=true; }
    });
    const valid = governorRows>0 && missingIds===0 && duplicateIds===0 && invalidNumbers===0;
    return {
      ok:valid,
      code:valid?'SCAN_VALIDATED':'SCAN_DATA_ISSUES',
      message:valid?'Kingdom scan validated.':('The governor sheet was found, but validation reported: '+missingIds+' missing ID(s), '+duplicateIds+' duplicate ID(s), '+invalidNumbers+' invalid numeric value(s).'),
      fileName:fileName,
      sheetName:selected.sheet.name,
      governors:governorRows,
      columns:headers.length,
      uniqueGovernorIds:Object.keys(ids).length,
      missingGovernorIds:missingIds,
      duplicateGovernorIds:duplicateIds,
      invalidNumericValues:invalidNumbers,
      kingdom:Object.keys(kingdoms).length===1?Object.keys(kingdoms)[0]:'',
      requiredColumns:required
    };
  } catch (err) {
    return {ok:false, code:'XLSX_PARSE_FAILED', message:'XLSX validation failed: '+String(err && err.message ? err.message : err)};
  }
}
function xlsxText_(files, name) { const b=files[name]; return b ? b.getDataAsString('UTF-8') : ''; }
function xlsxXmlDecode_(s) { return String(s||'').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'); }
function xlsxSharedStrings_(files) {
  const xml=xlsxText_(files,'xl/sharedStrings.xml'); if(!xml)return [];
  const out=[]; const re=/<si\b[^>]*>([\s\S]*?)<\/si>/g; let m;
  while((m=re.exec(xml))){let text='',t;const tr=/<t\b[^>]*>([\s\S]*?)<\/t>/g;while((t=tr.exec(m[1])))text+=xlsxXmlDecode_(t[1]);out.push(text);} return out;
}
function xlsxColIndex_(ref) { const m=String(ref||'').match(/^([A-Z]+)/i); if(!m)return 0; let n=0; for(let i=0;i<m[1].length;i++)n=n*26+(m[1].toUpperCase().charCodeAt(i)-64); return n-1; }
function xlsxRows_(xml, shared, limit) {
  const out=[]; const rr=/<row\b[^>]*>([\s\S]*?)<\/row>/g; let rm;
  while((rm=rr.exec(xml))){const row=[];const cr=/<c\b([^>]*)>([\s\S]*?)<\/c>/g;let cm;
    while((cm=cr.exec(rm[1]))){const attrs=cm[1],body=cm[2],ref=(attrs.match(/\br="([^"]+)"/)||[])[1]||'';const type=(attrs.match(/\bt="([^"]+)"/)||[])[1]||'';const ci=xlsxColIndex_(ref);let v='';
      if(type==='inlineStr'){const tm=body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);v=tm?xlsxXmlDecode_(tm[1]):'';} else {const vm=body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);v=vm?xlsxXmlDecode_(vm[1]):'';if(type==='s'&&v!=='')v=shared[Number(v)]==null?'':shared[Number(v)];}
      row[ci]=v;
    } out.push(row); if(limit&&out.length>=limit)break;
  } return out;
}

function adminCreateKvk(token, payload) {
  const user = getAdminSessionUser_(token);
  if (!user) return { ok: false, code: 'SESSION_EXPIRED', message: 'Admin session expired.' };

  payload = payload || {};
  const story = String(payload.story || '').trim();
  const startDate = String(payload.startDate || '').trim();
  let endDate = String(payload.endDate || '').trim();
  if (!story || !startDate) return { ok:false, code:'MISSING_FIELDS', message:'Story and start date are required.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok:false, code:'INVALID_DATE', message:'Please use a valid start date.' };
  if (!endDate) endDate = addDaysToIsoDate_(startDate, 50);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return { ok:false, code:'INVALID_DATE', message:'Please use a valid end date.' };
  if (endDate < startDate) return { ok:false, code:'INVALID_RANGE', message:'KvK end cannot be before KvK start.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = getDatabase_();
    const kvkSheet = ss.getSheetByName(BT.SHEETS.KVKS);
    const storySheet = ss.getSheetByName(BT.SHEETS.STORIES);
    if (!kvkSheet || !storySheet) throw new Error('KvK management sheets are missing.');

    const allowedStories = sheetToObjects_(storySheet)
      .filter(r => String(r['Active'] || '').toUpperCase() !== 'FALSE')
      .map(r => String(r['Story Name'] || '').trim());
    if (allowedStories.indexOf(story) === -1) return { ok:false, code:'INVALID_STORY', message:'Selected KvK story is not available in the BattleTrack catalog.' };

    const kvks = sheetToObjects_(kvkSheet);
    const nextNumber = Math.max.apply(null, [0].concat(kvks.map(r => Number(r['KvK Number']) || 0))) + 1;
    const kvkId = '3903-KVK' + nextNumber;
    if (kvks.some(r => String(r['KvK ID'] || '') === kvkId)) return { ok:false, code:'DUPLICATE_KVK', message:'This KvK already exists.' };

    const seasonName = 'Season ' + nextNumber + ' - ' + story;
    const start = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');
    kvkSheet.appendRow([kvkId, nextNumber, seasonName, start, end, 'Planned', '']);
    const row = kvkSheet.getLastRow();
    kvkSheet.getRange(row, 4, 1, 2).setNumberFormat('yyyy-mm-dd');

    return { ok:true, kvk:{ id:kvkId, number:nextNumber, seasonName:seasonName, startDate:startDate, endDate:endDate, status:'Planned' } };
  } finally {
    lock.releaseLock();
  }
}

function addDaysToIsoDate_(isoDate, days) {
  const parts = String(isoDate || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return '';
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

function formatAdminDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Europe/Berlin', 'yyyy-MM-dd');
  }
  return String(value);
}


/**
 * Client-callable bridge for google.script.run.
 */
function getPlayerData(governorId) {
  return getPlayerData_(governorId);
}


/**
 * Full Kingdom Ranking for all tracked KvKs / Seasons.
 * Client-callable via google.script.run.
 */
function getKingdomRankingData() {
  // Backward-compatible bridge. OP-058 Phase B uses the split meta/season API below.
  const meta = getKingdomRankingMeta();
  if (!meta.success) return meta;
  return {
    success: true,
    kingdom: meta.kingdom,
    seasons: meta.seasons.map(function(season) {
      const detail = getKingdomRankingSeasonData(season.kvkId);
      return Object.assign({}, season, {
        total: detail.success ? detail.total : 0,
        players: detail.success ? detail.players : []
      });
    })
  };
}

/**
 * OP-058 Phase B: lightweight ranking bootstrap.
 * Returns only season metadata so opening Kingdom Rankings never has to
 * transfer every Governor from every historical KvK before the UI is usable.
 */
function getKingdomRankingMeta() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'bt:ranking:meta:v2';
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (ignore) {}
  }

  const ss = getDatabase_();
  const kvkSheet = ss.getSheetByName(BT.SHEETS.KVKS);
  if (!kvkSheet) throw new Error('BattleTrack KvK sheet is missing.');

  const seasons = sheetToObjects_(kvkSheet).map(function(kvk) {
    return {
      kvkId: String(kvk['KvK ID'] || '').trim(),
      number: numberOrNull_(kvk['KvK Number']),
      seasonName: String(kvk['Season Name'] || '').trim() || ('KvK ' + (kvk['KvK Number'] || '')),
      status: String(kvk['Status'] || '').trim()
    };
  }).filter(function(x) { return !!x.kvkId; })
    .sort(function(a,b) { return numberForSort_(b.number)-numberForSort_(a.number); });

  const payload = { success:true, kingdom:BT.KINGDOM, seasons:seasons };
  try { cache.put(cacheKey, JSON.stringify(payload), 600); } catch (ignore) {}
  return payload;
}

/**
 * OP-058 Phase B: load one selected KvK only and cache the compact payload.
 * Category switches (DKP/KPR/KP/Kills) then happen locally without another
 * Apps Script round-trip.
 */
function getKingdomRankingSeasonData(kvkId) {
  kvkId = String(kvkId || '').trim();
  if (!kvkId) throw new Error('KvK ID is required.');

  const cache = CacheService.getScriptCache();
  const cacheKey = 'bt:ranking:season:v2:' + kvkId;
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (ignore) {}
  }

  const ss = getDatabase_();
  const resultSheet = ss.getSheetByName(BT.SHEETS.RESULTS);
  if (!resultSheet) throw new Error('BattleTrack results sheet is missing.');

  const players = [];
  sheetToObjects_(resultSheet).forEach(function(row) {
    if (String(row['KvK ID'] || '').trim() !== kvkId) return;
    const governorId = normalizeId_(row['Governor ID']);
    if (!governorId) return;
    const deads = Number(row['KvK Deads']) || 0;
    const t4 = Number(row['KvK T4 Kills']) || 0;
    const t5 = Number(row['KvK T5 Kills']) || 0;
    const kp = Number(row['KvK Kill Points']) || 0;
    const startPower = Number(row['Start Power']) || 0;
    players.push({
      governorId: governorId,
      governorName: String(row['Governor Name'] || '').trim() || ('Governor ' + governorId),
      dkp: (deads * 10) + (t4 * 5) + (t5 * 15),
      kp: kp,
      kills: t4 + t5,
      kpr: startPower > 0 ? kp / startPower : 0
    });
  });

  const payload = { success:true, kvkId:kvkId, total:players.length, players:players };
  try { cache.put(cacheKey, JSON.stringify(payload), 600); } catch (ignore) {}
  return payload;
}


/**
 * Kingdom-wide KvK statistics for all tracked Seasons.
 * OP-044 / v1.6.0
 */
function getKingdomStatsData() {
  const ss = getDatabase_();
  const kvkSheet = ss.getSheetByName(BT.SHEETS.KVKS);
  const resultSheet = ss.getSheetByName(BT.SHEETS.RESULTS);
  if (!kvkSheet || !resultSheet) throw new Error('Required BattleTrack statistics sheets are missing.');

  const kvks = sheetToObjects_(kvkSheet);
  const results = sheetToObjects_(resultSheet);
  const totals = {};

  results.forEach(row => {
    const kvkId = String(row['KvK ID'] || '').trim();
    const governorId = normalizeId_(row['Governor ID']);
    if (!kvkId || !governorId) return;
    if (!totals[kvkId]) totals[kvkId] = {kp:0, kills:0, deads:0, governors:{}};
    const bucket = totals[kvkId];
    bucket.kp += Number(row['KvK Kill Points']) || 0;
    bucket.kills += (Number(row['KvK T4 Kills']) || 0) + (Number(row['KvK T5 Kills']) || 0);
    bucket.deads += Number(row['KvK Deads']) || 0;
    bucket.governors[governorId] = true;
  });

  const seasons = kvks.map(kvk => {
    const kvkId = String(kvk['KvK ID'] || '').trim();
    const bucket = totals[kvkId];
    if (!bucket) return null;
    return {
      kvkId: kvkId,
      number: numberOrNull_(kvk['KvK Number']),
      seasonName: String(kvk['Season Name'] || '').trim() || ('KvK ' + (kvk['KvK Number'] || '')),
      status: String(kvk['Status'] || '').trim(),
      totalKp: bucket.kp,
      totalKills: bucket.kills,
      totalDeads: bucket.deads,
      trackedGovernors: Object.keys(bucket.governors).length
    };
  }).filter(Boolean).sort((a,b) => numberForSort_(b.number)-numberForSort_(a.number));

  return {success:true, kingdom:BT.KINGDOM, seasons:seasons};
}


/**
 * ============================================================
 * WEB API
 * ============================================================
 */

function apiGet_(e) {

  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = String(params.action || '').trim();

    // CF-010: public Governor lookup through the existing read-only backend.
    if (action === 'playerLookup') {
      const governorId = String(params.governorId || '').trim();
      return jsonResponse_(getPlayerData_(governorId));
    }

    // CF-009: read-only Cloudflare bridge for public Kingdom Rankings.
    // No write/admin operation is exposed through this bridge.
    if (action === 'rankingMeta') {
      return jsonResponse_(getKingdomRankingMeta());
    }

    if (action === 'rankingSeason') {
      const kvkId = String(params.kvkId || '').trim();
      if (!kvkId) {
        return jsonResponse_({
          success: false,
          error: { code: 'INVALID_KVK', message: 'KvK ID is required.' }
        });
      }
      return jsonResponse_(getKingdomRankingSeasonData(kvkId));
    }

    const governorId = params.governorId
      ? String(params.governorId).trim()
      : '';

    /*
     * Wird die API ohne Governor ID aufgerufen,
     * geben wir einen einfachen Health Check zurück.
     */
    if (!governorId) {
      return jsonResponse_({
        success: true,
        service: 'ROK BattleTrack API',
        version: BT.VERSION,
        kingdom: BT.KINGDOM,
        message: 'BattleTrack API is running.'
      });
    }

    /*
     * Governor abrufen
     */
    const result = getPlayerData_(governorId);
    return jsonResponse_(result);

  } catch (error) {
    Logger.log(error);
    Logger.log(error.stack);

    return jsonResponse_({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: String(error.message || error)
      }
    });
  }
}


/**
 * OP-054 Phase 3 / OP-049 - Controlled Kingdom Scan import.
 * The XLSX is re-validated server-side, archived unchanged, then its core
 * governor snapshot rows are committed in one batch. KvK Results is untouched.
 */

/**
 * Checks whether the deploying user granted the Drive scope required by OP-049.
 * Returns a Google authorization URL when consent is still required.
 */
function adminGetDriveAuthorizationStatus(token) {
  const user = getAdminSessionUser_(token);
  if (!user) return { ok:false, code:'SESSION_EXPIRED', message:'Admin session expired.' };
  const scope = 'https://www.googleapis.com/auth/drive';
  const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, [scope]);
  const required = info.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED;
  return {
    ok: true,
    authorized: !required,
    code: required ? 'DRIVE_AUTH_REQUIRED' : 'DRIVE_AUTHORIZED',
    authorizationUrl: required ? String(info.getAuthorizationUrl() || '') : ''
  };
}

function driveAuthorizationRequired_() {
  const scope = 'https://www.googleapis.com/auth/drive';
  const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, [scope]);
  const required = info.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED;
  return { required: required, url: required ? String(info.getAuthorizationUrl() || '') : '' };
}

function adminImportKingdomScanXlsx(token, payload) {
  const user = getAdminSessionUser_(token);
  if (!user) return { ok:false, code:'SESSION_EXPIRED', message:'Admin session expired.' };
  payload = payload || {};
  const fileName = String(payload.fileName || '').trim();
  const base64 = String(payload.base64 || '');
  const kvkId = String(payload.kvkId || '').trim();
  const snapshotType = String(payload.snapshotType || '').trim().toUpperCase();
  if (!fileName || !/\.xlsx$/i.test(fileName) || !base64) return {ok:false,code:'INVALID_FILE',message:'A valid XLSX file is required.'};
  if (!kvkId) return {ok:false,code:'MISSING_KVK',message:'Please select a KvK.'};
  if (['START','MIDDLE','END'].indexOf(snapshotType) === -1) return {ok:false,code:'INVALID_SNAPSHOT',message:'Snapshot type must be START, MIDDLE or END.'};

  const driveAuth = driveAuthorizationRequired_();
  if (driveAuth.required) {
    return {ok:false,code:'DRIVE_AUTH_REQUIRED',message:'Google Drive authorization is required before the scan can be archived.',authorizationUrl:driveAuth.url};
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return {ok:false,code:'IMPORT_BUSY',message:'Another BattleTrack import is currently running. Please try again.'};
  let archiveFile = null;
  let snapshotSheet = null;
  let snapshotStartRow = 0;
  let snapshotRowCount = 0;
  let importSheet = null;
  let importLogRow = 0;
  try {
    const bytes = Utilities.base64Decode(base64);
    const parsed = parseKingdomScanXlsx_(bytes, fileName);
    if (!parsed.ok) return parsed;

    const ss = getDatabase_();
    const kvkSheet = ss.getSheetByName(BT.SHEETS.KVKS);
    if (!kvkSheet) throw new Error('KvKs sheet is missing.');
    const kvk = sheetToObjects_(kvkSheet).find(function(r){return String(r['KvK ID'] || '').trim() === kvkId;});
    if (!kvk) return {ok:false,code:'KVK_NOT_FOUND',message:'Selected KvK was not found.'};
    const kvkStatus=String(kvk['Status']||'').trim().toLowerCase();
    if (['historical','completed','closed'].indexOf(kvkStatus)!==-1) return {ok:false,code:'KVK_CLOSED',message:kvkId+' is closed. Historical KvKs do not accept new START, MIDDLE or END scan imports.'};

    const fingerprint = sha256Hex_(bytes);
    const snapshotHeaders = ['Import ID','KvK ID','KvK Number','Season Name','Snapshot Type','Imported At','Imported By','Source File','Source Sheet','Governor ID','Governor Name','Kingdom','Alliance Tag','Power','Deads','Kill Points','T1 Kills','T2 Kills','T3 Kills','T4 Kills','T5 Kills'];
    const importHeaders = ['Import ID','KvK ID','KvK Number','Season Name','Snapshot Type','Source File','Source Sheet','File SHA-256','Governor Count','Imported At','Imported By','Archive File ID','Archive File Name','Status','Message'];
    snapshotSheet = ensureBattleTrackSheet_(ss, BT.SHEETS.SNAPSHOTS, snapshotHeaders);
    importSheet = ensureBattleTrackSheet_(ss, BT.SHEETS.IMPORTS, importHeaders);

    const imports = sheetToObjects_(importSheet);
    const sameFile = imports.find(function(r){return String(r['KvK ID']||'').trim()===kvkId && String(r['Snapshot Type']||'').trim().toUpperCase()===snapshotType && String(r['File SHA-256']||'').trim()===fingerprint && ['COMPLETED','INTEGRITY_FAILED'].indexOf(String(r['Status']||'').trim().toUpperCase()) !== -1;});
    if (sameFile) return {ok:false,code:'DUPLICATE_IMPORT',message:'This exact scan has already been imported for '+kvkId+' / '+snapshotType+'.',importId:String(sameFile['Import ID']||'')};
    if (snapshotType !== 'MIDDLE') {
      const occupied = imports.find(function(r){return String(r['KvK ID']||'').trim()===kvkId && String(r['Snapshot Type']||'').trim().toUpperCase()===snapshotType && ['COMPLETED','INTEGRITY_FAILED'].indexOf(String(r['Status']||'').trim().toUpperCase()) !== -1;});
      if (occupied) return {ok:false,code:'SNAPSHOT_EXISTS',message:kvkId+' already has a completed '+snapshotType+' snapshot. Existing snapshots are not overwritten automatically.'};
    }

    const now = new Date();
    const importId = 'IMP-' + Utilities.formatDate(now, Session.getScriptTimeZone() || 'UTC', 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0,8).toUpperCase();
    const kvkNumber = Number(kvk['KvK Number']) || 0;
    const seasonName = String(kvk['Season Name'] || '').trim();
    const archiveName = buildArchiveName_(kvkId, snapshotType, now, fileName);

    // Archive the exact original bytes before committing database rows.
    const archiveFolder = getScanArchiveFolder_(kvkNumber || kvkId);
    archiveFile = archiveFolder.createFile(Utilities.newBlob(bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', archiveName));

    // Write a PENDING audit row first; it is updated to COMPLETED only after the snapshot batch succeeds.
    importLogRow = importSheet.getLastRow() + 1;
    importSheet.getRange(importLogRow,1,1,importHeaders.length).setValues([[
      importId,kvkId,kvkNumber,seasonName,snapshotType,fileName,parsed.sheetName,fingerprint,parsed.governors,now,user,archiveFile.getId(),archiveName,'PENDING','Snapshot commit pending'
    ]]);

    const rows = parsed.records.map(function(r){return [
      importId,kvkId,kvkNumber,seasonName,snapshotType,now,user,fileName,parsed.sheetName,
      r.governorId,r.governorName,r.kingdom,r.allianceTag,r.power,r.deads,r.killPoints,r.t1Kills,r.t2Kills,r.t3Kills,r.t4Kills,r.t5Kills
    ];});
    snapshotStartRow = snapshotSheet.getLastRow() + 1;
    snapshotRowCount = rows.length;
    snapshotSheet.getRange(snapshotStartRow,1,rows.length,snapshotHeaders.length).setValues(rows);

    // Flush first, then re-read the committed rows for OP-060 integrity verification.
    SpreadsheetApp.flush();
    const integrity = snapshotIntegrityByImportId_(importId);
    const integrityOk = !!(integrity && integrity.ok && integrity.complete);
    importSheet.getRange(importLogRow,14,1,2).setValues([[
      integrityOk ? 'COMPLETED' : 'INTEGRITY_FAILED',
      integrityOk
        ? ('Imported '+rows.length+' governors successfully. Integrity verified: '+integrity.stored+' stored / '+integrity.uniqueIds+' unique IDs.')
        : ('Snapshot committed, but integrity verification failed. Expected '+rows.length+', stored '+(integrity && integrity.stored != null ? integrity.stored : '?')+'.')
    ]]);
    SpreadsheetApp.flush();
    if (integrity) integrity.auditStatus = integrityOk ? 'COMPLETED' : 'INTEGRITY_FAILED';
    return {ok:true,code:integrityOk?'IMPORT_COMPLETE':'IMPORT_INTEGRITY_FAILED',message:integrityOk?'Kingdom scan imported and integrity verified.':'Kingdom scan was committed, but integrity verification failed.',importId:importId,governors:rows.length,kvkId:kvkId,kvkNumber:kvkNumber,seasonName:seasonName,snapshotType:snapshotType,archiveFileName:archiveName,fingerprint:fingerprint,integrity:integrity};
  } catch (err) {
    // Roll back snapshot rows if the batch was written but a later step failed.
    try { if (snapshotSheet && snapshotStartRow && snapshotRowCount) snapshotSheet.deleteRows(snapshotStartRow, snapshotRowCount); } catch (rollbackErr) {}
    try { if (importSheet && importLogRow) importSheet.getRange(importLogRow,14,1,2).setValues([['FAILED',String(err && err.message ? err.message : err)]]); } catch (logErr) {}
    return {ok:false,code:'IMPORT_FAILED',message:'Controlled import failed: '+String(err && err.message ? err.message : err)};
  } finally {
    lock.releaseLock();
  }
}



/**
 * OP-060 - Snapshot Integrity Check.
 * Re-reads a committed import from Kingdom Snapshots and verifies that the
 * database state matches the Scan Imports audit row. Leadership-only.
 */
function adminCheckSnapshotIntegrity(token, importId) {
  const user = getAdminSessionUser_(token);
  if (!user) return {ok:false,code:'SESSION_EXPIRED',message:'Admin session expired.'};
  return snapshotIntegrityByImportId_(String(importId || '').trim());
}

function snapshotIntegrityByImportId_(importId) {
  if (!importId) return {ok:false,code:'MISSING_IMPORT_ID',message:'Import ID is required.'};
  const ss = getDatabase_();
  const importSheet = ss.getSheetByName(BT.SHEETS.IMPORTS);
  const snapshotSheet = ss.getSheetByName(BT.SHEETS.SNAPSHOTS);
  if (!importSheet || !snapshotSheet) return {ok:false,code:'INTEGRITY_SHEETS_MISSING',message:'Snapshot integrity sheets are missing.'};

  const audit = sheetToObjects_(importSheet).find(function(r){return String(r['Import ID'] || '').trim() === importId;});
  if (!audit) return {ok:false,code:'IMPORT_NOT_FOUND',message:'Import ID was not found in Scan Imports.'};

  const expected = Number(audit['Governor Count']) || 0;
  const expectedKvk = String(audit['KvK ID'] || '').trim();
  const expectedSnapshot = String(audit['Snapshot Type'] || '').trim().toUpperCase();
  const allRows = sheetToObjects_(snapshotSheet);
  const rows = allRows.filter(function(r){return String(r['Import ID'] || '').trim() === importId;});
  const ids = {};
  let missingIds = 0;
  let duplicateIds = 0;
  let metadataMismatches = 0;

  rows.forEach(function(r){
    const id = normalizeId_(r['Governor ID']);
    if (!id) missingIds++;
    else {
      if (ids[id]) duplicateIds++;
      ids[id] = true;
    }
    if (String(r['KvK ID'] || '').trim() !== expectedKvk ||
        String(r['Snapshot Type'] || '').trim().toUpperCase() !== expectedSnapshot ||
        String(r['Import ID'] || '').trim() !== importId) metadataMismatches++;
  });

  const stored = rows.length;
  const uniqueIds = Object.keys(ids).length;
  const complete = expected > 0 && stored === expected && uniqueIds === expected && missingIds === 0 && duplicateIds === 0 && metadataMismatches === 0;
  return {
    ok:true,
    code:complete?'INTEGRITY_VERIFIED':'INTEGRITY_FAILED',
    complete:complete,
    importId:importId,
    kvkId:expectedKvk,
    snapshotType:expectedSnapshot,
    expected:expected,
    stored:stored,
    uniqueIds:uniqueIds,
    missingIds:missingIds,
    duplicateIds:duplicateIds,
    metadataMismatches:metadataMismatches,
    auditStatus:String(audit['Status'] || '').trim(),
    message:complete?'Snapshot integrity verified.':'Snapshot integrity check found a mismatch.'
  };
}

function parseKingdomScanXlsx_(bytes, fileName) {
  try {
    const blobs = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip', fileName));
    const files = {};
    blobs.forEach(function(b){ files[String(b.getName() || '').replace(/^\/+/, '')] = b; });
    const workbook = xlsxText_(files, 'xl/workbook.xml');
    const rels = xlsxText_(files, 'xl/_rels/workbook.xml.rels');
    if (!workbook || !rels) throw new Error('Workbook structure is incomplete.');
    const shared = xlsxSharedStrings_(files);
    const relMap = {}; let m;
    const relRe = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?\s*>/g;
    while ((m = relRe.exec(rels))) relMap[m[1]] = m[2];
    const sheets = [];
    const sheetRe = /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/g;
    while ((m = sheetRe.exec(workbook))) {
      let target = relMap[m[2]] || ''; target = target.replace(/^\/+/, '');
      if (target.indexOf('xl/') !== 0) target = 'xl/' + target.replace(/^\.\//, '');
      sheets.push({name:xlsxXmlDecode_(m[1]),path:target});
    }
    const required=['Governor Name','Governor ID','Power','Deads','Kill Points','T1 Kills','T2 Kills','T3 Kills','T4 Kills','T5 Kills'];
    let selected=null;
    for(let i=0;i<sheets.length;i++){
      const xml=xlsxText_(files,sheets[i].path); if(!xml)continue;
      const preview=xlsxRows_(xml,shared,8); if(!preview.length)continue;
      const headers=preview[0].map(function(v){return String(v==null?'':v).trim();});
      if(required.every(function(h){return headers.indexOf(h)!==-1;})){selected={sheet:sheets[i],xml:xml};break;}
    }
    if(!selected)return {ok:false,code:'NO_GOVERNOR_SHEET',message:'No worksheet with the required BattleTrack governor columns was found.',requiredColumns:required};
    const rows=xlsxRows_(selected.xml,shared); const headers=rows.shift().map(function(v){return String(v==null?'':v).trim();});
    const idx={}; headers.forEach(function(h,i){idx[h]=i;});
    const numericFields=['Power','Deads','Kill Points','T1 Kills','T2 Kills','T3 Kills','T4 Kills','T5 Kills'];
    const ids={}; let duplicateIds=0,missingIds=0,invalidNumbers=0; const kingdoms={}; const records=[];
    rows.forEach(function(row){
      const id=normalizeId_(row[idx['Governor ID']]); const name=String(row[idx['Governor Name']]==null?'':row[idx['Governor Name']]).trim();
      if(!id&&!name)return;
      if(!id)missingIds++; else {if(ids[id])duplicateIds++;ids[id]=true;}
      numericFields.forEach(function(h){const v=row[idx[h]];if(v!==''&&v!=null&&!isFinite(Number(v)))invalidNumbers++;});
      const kingdom=idx['Kingdom']!=null?String(row[idx['Kingdom']]==null?'':row[idx['Kingdom']]).trim():''; if(kingdom)kingdoms[kingdom]=true;
      records.push({governorId:id,governorName:name,kingdom:kingdom,allianceTag:idx['Alliance Tag']!=null?String(row[idx['Alliance Tag']]==null?'':row[idx['Alliance Tag']]).trim():'',power:xlsxNumber_(row[idx['Power']]),deads:xlsxNumber_(row[idx['Deads']]),killPoints:xlsxNumber_(row[idx['Kill Points']]),t1Kills:xlsxNumber_(row[idx['T1 Kills']]),t2Kills:xlsxNumber_(row[idx['T2 Kills']]),t3Kills:xlsxNumber_(row[idx['T3 Kills']]),t4Kills:xlsxNumber_(row[idx['T4 Kills']]),t5Kills:xlsxNumber_(row[idx['T5 Kills']])});
    });
    const valid=records.length>0&&missingIds===0&&duplicateIds===0&&invalidNumbers===0;
    return {ok:valid,code:valid?'SCAN_VALIDATED':'SCAN_DATA_ISSUES',message:valid?'Kingdom scan validated.':('The governor sheet was found, but validation reported: '+missingIds+' missing ID(s), '+duplicateIds+' duplicate ID(s), '+invalidNumbers+' invalid numeric value(s).'),sheetName:selected.sheet.name,governors:records.length,columns:headers.length,uniqueGovernorIds:Object.keys(ids).length,missingGovernorIds:missingIds,duplicateGovernorIds:duplicateIds,invalidNumericValues:invalidNumbers,kingdom:Object.keys(kingdoms).length===1?Object.keys(kingdoms)[0]:'',requiredColumns:required,records:records};
  } catch(err){return {ok:false,code:'XLSX_PARSE_FAILED',message:'XLSX validation failed: '+String(err&&err.message?err.message:err)};}
}
function xlsxNumber_(value){return value===''||value==null?0:Number(value);}
function sha256Hex_(bytes){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(function(b){const n=(b+256)%256;return ('0'+n.toString(16)).slice(-2);}).join('');}
function ensureBattleTrackSheet_(ss,name,headers){
  let sheet=ss.getSheetByName(name);
  if(!sheet){sheet=ss.insertSheet(name);sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);return sheet;}
  const width=Math.max(sheet.getLastColumn(),headers.length); const existing=sheet.getRange(1,1,1,width).getValues()[0].slice(0,headers.length).map(function(v){return String(v||'').trim();});
  const mismatch=headers.some(function(h,i){return existing[i]!==h;});
  if(mismatch)throw new Error('Sheet "'+name+'" exists but its header structure does not match BattleTrack.');
  return sheet;
}
function buildArchiveName_(kvkId,snapshotType,date,fileName){const stamp=Utilities.formatDate(date,Session.getScriptTimeZone()||'UTC','yyyyMMdd-HHmmss');return kvkId+'_'+snapshotType+'_'+stamp+'_'+String(fileName).replace(/[\\/:*?"<>|]/g,'_');}
function getScanArchiveFolder_(kvkLabel){
  const folderId = String((BATTLETRACK_CONFIG && BATTLETRACK_CONFIG.SCAN_ARCHIVE_FOLDER_ID) || '').trim();
  if (!folderId) {
    throw new Error('SCAN_ARCHIVE_FOLDER_ID is not configured in Config.gs.');
  }
  // OP-049: use one pre-created archive folder. The WebApp never creates Drive folders.
  // KvK/snapshot remain traceable through the archived filename and Scan Imports audit row.
  return DriveApp.getFolderById(folderId);
}

/**
 * ============================================================
 * DATABASE CONNECTION
 * ============================================================
 */

function getDatabase_() {

  return SpreadsheetApp.openById(
    BT.DATABASE_ID
  );

}


/**
 * ============================================================
 * PLAYER DATA
 * ============================================================
 */

function getPlayerData_(governorId) {

  governorId = String(governorId).trim();


  /*
   * Governor ID validieren
   */
  if (!/^\d+$/.test(governorId)) {

    return errorResponse_(

      'INVALID_ID',

      'Governor ID must contain numbers only.'

    );

  }


  /*
   * BattleTrack Database öffnen
   */
  const ss = getDatabase_();


  /*
   * Benötigte Tabellen laden
   */
  const governorSheet =
    ss.getSheetByName(
      BT.SHEETS.GOVERNORS
    );

  const kvkSheet =
    ss.getSheetByName(
      BT.SHEETS.KVKS
    );

  const resultSheet =
    ss.getSheetByName(
      BT.SHEETS.RESULTS
    );


  /*
   * Tabellen prüfen
   */
  const missingSheets = [];

  if (!governorSheet) {
    missingSheets.push(
      BT.SHEETS.GOVERNORS
    );
  }

  if (!kvkSheet) {
    missingSheets.push(
      BT.SHEETS.KVKS
    );
  }

  if (!resultSheet) {
    missingSheets.push(
      BT.SHEETS.RESULTS
    );
  }


  if (missingSheets.length > 0) {

    throw new Error(

      'Required BattleTrack database sheet missing: ' +
      missingSheets.join(', ')

    );

  }


  /*
   * Tabellen in Objekte umwandeln
   */
  const governors =
    sheetToObjects_(governorSheet);

  const kvks =
    sheetToObjects_(kvkSheet);

  const results =
    sheetToObjects_(resultSheet);


  /*
   * Governor suchen
   */
  const governor =
    governors.find(row =>

      normalizeId_(
        row['Governor ID']
      ) === governorId

    );


  if (!governor) {

    return errorResponse_(

      'GOVERNOR_NOT_FOUND',

      'Governor ID was not found in BattleTrack.'

    );

  }


  /*
   * Alle KvK-Ergebnisse dieses Governors
   */
  const playerResults =
    results.filter(row =>

      normalizeId_(
        row['Governor ID']
      ) === governorId

    );


  /*
   * Governor vorhanden,
   * aber keine KvK-Ergebnisse
   */
  if (playerResults.length === 0) {

    return {

      success: true,

      meta: {

        apiVersion: BT.VERSION,

        kingdom: BT.KINGDOM

      },

      governor: {

        id: governorId,

        name:
          governor['Current Governor Name'] || '',

        kingdom:
          BT.KINGDOM,

        firstSeenKvk:
          governor['First Seen KvK'] || null,

        lastSeenKvk:
          governor['Last Seen KvK'] || null

      },

      summary: {

        trackedKvks: 0,

        passedKvks: 0

      },

      currentKvk: null,

      history: [],

      warning: {

        code: 'NO_KVK_DATA',

        message:
          'Governor exists, but no comparable KvK data is available.'

      }

    };

  }


  /*
   * KvK-Metadaten nach KvK-ID indexieren
   */
  const kvkMap = {};


  kvks.forEach(kvk => {

    const kvkId =
      String(
        kvk['KvK ID'] || ''
      ).trim();

    if (kvkId) {

      kvkMap[kvkId] = kvk;

    }

  });


  /*
   * DKP Kingdom Ranking je KvK erstellen.
   * Alle Governor aus KvK Results nehmen teil.
   * DKP = Deads x10 + T4 x5 + T5 x15.
   * Gleicher DKP = gleicher Rang; Rang = 1 + Anzahl mit höherem DKP.
   */
  const categoryRankings = buildCategoryRankings_(results);


  /*
   * Historie erstellen
   */
  const history =
    playerResults

      .map(row => {

        const kvkId =
          String(
            row['KvK ID'] || ''
          ).trim();

        const ranking =
          categoryRankings[kvkId] &&
          categoryRankings[kvkId][governorId]
            ? categoryRankings[kvkId][governorId]
            : null;

        return buildKvkPayload_(

          row,

          kvkMap[kvkId],

          ranking

        );

      })

      .sort((a, b) => {

        return (
          numberForSort_(a.number) -
          numberForSort_(b.number)
        );

      });


  /*
   * Aktuellster verfügbarer KvK
   */
  const currentKvk =
    history.length > 0
      ? history[history.length - 1]
      : null;


  /*
   * PASS-Anzahl
   */
  const passedKvks =
    history.filter(kvk =>

      kvk.status === BT.STATUS.PASS

    ).length;


  /*
   * Finales API-Payload
   */
  return {

    success: true,

    meta: {

      apiVersion: BT.VERSION,

      kingdom: BT.KINGDOM

    },

    governor: {

      id: governorId,

      name:
        governor['Current Governor Name'] || '',

      kingdom:
        BT.KINGDOM,

      firstSeenKvk:
        governor['First Seen KvK'] || null,

      firstSeenSeason:
        (
          kvkMap[String(governor['First Seen KvK'] || '').trim()] || {}
        )['Season Name'] || governor['First Seen KvK'] || null,

      lastSeenKvk:
        governor['Last Seen KvK'] || null

    },

    summary: {

      trackedKvks:
        history.length,

      passedKvks:
        passedKvks

    },

    currentKvk:
      currentKvk,

    history:
      history

  };

}


/**
 * ============================================================
 * KVK PAYLOAD
 * ============================================================
 */

function buildKvkPayload_(row, kvk, ranking) {

  kvk = kvk || {};


  /*
   * Database-KvK-Status
   */
  const databaseKvkStatus =
    String(
      kvk['Status'] || ''
    )
      .trim()
      .toLowerCase();


  /*
   * Requirement Status aus KvK Results
   */
  const storedRequirementStatus =
    String(
      row['Requirement Status'] || ''
    ).trim();


  /*
   * Aktiver oder historischer KvK?
   */
  const isHistorical =
    databaseKvkStatus === 'historical';


  let publicStatus;


  if (!isHistorical) {

    publicStatus =
      BT.STATUS.IN_PROGRESS;

  } else if (
    storedRequirementStatus === 'PASS'
  ) {

    publicStatus =
      BT.STATUS.PASS;

  } else {

    publicStatus =
      BT.STATUS.NOT_MET;

  }


  /*
   * Spielerklassifikation
   */
  const rawClassification =
    String(
      row['Classification'] || 'Regular'
    )
      .trim()
      .toUpperCase();


  const isFlagFiller =
    rawClassification === 'FLAG FILLER' ||
    rawClassification === 'FLAG_FILLER' ||
    rawClassification === 'FLAGFILLER';


  const classification =
    isFlagFiller
      ? 'FLAG_FILLER'
      : 'REGULAR';


  /*
   * Flag Filler:
   *
   * - kein Kill Requirement
   * - kein Kill Progress als Requirement
   * - kein normaler Overall Progress
   *
   * Kills bleiben ausschließlich
   * Performance-Metriken.
   */
  const killRequirement =
    isFlagFiller
      ? null
      : numberOrNull_(
          row['Kill Requirement']
        );


  const killProgress =
    isFlagFiller
      ? null
      : numberOrNull_(
          row['Kill Progress %']
        );


  const overallProgress =
    isFlagFiller
      ? null
      : numberOrNull_(
          row['Overall Progress %']
        );


  /*
   * Detailgrund nur bei NOT_MET
   */
  let requirementDetail = null;


  if (
    publicStatus === BT.STATUS.NOT_MET &&
    storedRequirementStatus
  ) {

    requirementDetail =
      storedRequirementStatus;

  }


  return {

    id:
      row['KvK ID'] || null,

    number:
      numberOrNull_(
        kvk['KvK Number']
      ),

    seasonName:
      kvk['Season Name'] || null,

    databaseStatus:
      kvk['Status'] || null,

    status:
      publicStatus,

    requirementDetail:
      requirementDetail,

    classification:
      classification,


    dates: {

      start:
        dateValue_(
          kvk['Start Scan Date']
        ),

      end:
        dateValue_(
          kvk['End Scan Date']
        )

    },


    power: {

      start:
        numberOrNull_(
          row['Start Power']
        ),

      latest:
        numberOrNull_(
          row['End/Latest Power']
        ),

      change:
        numberOrNull_(
          row['Power Delta']
        )

    },


    requirements: {

      kills:
        killRequirement,

      deads:
        numberOrNull_(
          row['Dead Requirement']
        )

    },


    progress: {

      kills:
        killProgress,

      deads:
        numberOrNull_(
          row['Dead Progress %']
        ),

      overall:
        overallProgress

    },


    ranking: ranking || null,


    performance: {

      killPoints:
        numberOrNull_(
          row['KvK Kill Points']
        ),

      t4Kills:
        numberOrNull_(
          row['KvK T4 Kills']
        ),

      t5Kills:
        numberOrNull_(
          row['KvK T5 Kills']
        ),

      t4t5Kills:
        numberOrNull_(
          row['KvK T4+T5 Kills']
        ),

      deads:
        numberOrNull_(
          row['KvK Deads']
        ),

      powerChange:
        numberOrNull_(
          row['Power Delta']
        )

    }

  };

}


/**
 * ============================================================
 * KINGDOM RANKING BY CATEGORY
 * ============================================================
 */
function buildCategoryRankings_(results) {

  const byKvk = {};

  results.forEach(row => {
    const kvkId = String(row['KvK ID'] || '').trim();
    const governorId = normalizeId_(row['Governor ID']);
    if (!kvkId || !governorId) return;

    const deads = Number(row['KvK Deads']) || 0;
    const t4 = Number(row['KvK T4 Kills']) || 0;
    const t5 = Number(row['KvK T5 Kills']) || 0;
    const kp = Number(row['KvK Kill Points']) || 0;
    const startPower = Number(row['Start Power']) || 0;
    const kills = t4 + t5;
    const dkp = (deads * 10) + (t4 * 5) + (t5 * 15);
    const kpr = startPower > 0 ? kp / startPower : 0;

    if (!byKvk[kvkId]) byKvk[kvkId] = [];
    byKvk[kvkId].push({ governorId, governorName: String(row['Governor Name'] || '').trim() || ('Governor '+governorId), dkp, kp, kills, kpr });
  });

  const rankings = {};
  const metrics = ['dkp', 'kp', 'kills', 'kpr'];

  Object.keys(byKvk).forEach(kvkId => {
    const players = byKvk[kvkId];
    const metricRanks = {};

    const metricOrders = {};
    metrics.forEach(metric => {
      const ordered = players.slice().sort((a, b) => {
        const diff = b[metric] - a[metric];
        return diff !== 0 ? diff : String(a.governorId).localeCompare(String(b.governorId));
      });
      const rankByScore = {};
      ordered.forEach((player, index) => {
        const key = String(player[metric]);
        if (rankByScore[key] == null) rankByScore[key] = index + 1;
      });
      metricRanks[metric] = rankByScore;
      metricOrders[metric] = ordered;
    });

    rankings[kvkId] = {};
    players.forEach(player => {
      const categories = {};
      metrics.forEach(metric => {
        const lowerCount = players.filter(other => other[metric] < player[metric]).length;
        const ordered = metricOrders[metric];
        const playerIndex = ordered.findIndex(p => p.governorId === player.governorId);
        const neighborhood = ordered
          .slice(Math.max(0, playerIndex - 3), Math.min(ordered.length, playerIndex + 4))
          .map(p => ({
            governorId: p.governorId,
            governorName: p.governorName,
            value: p[metric],
            rank: metricRanks[metric][String(p[metric])],
            isCurrent: p.governorId === player.governorId
          }));
        categories[metric] = {
          value: player[metric],
          rank: metricRanks[metric][String(player[metric])],
          total: players.length,
          aheadPercent: players.length ? (lowerCount / players.length) * 100 : 0,
          neighborhood: neighborhood
        };
      });
      // Keep the proven v1.4.0 DKP fields for backwards compatibility,
      // while exposing all category rankings for the v1.4.1 switcher.
      rankings[kvkId][player.governorId] = {
        dkp: categories.dkp.value,
        rank: categories.dkp.rank,
        total: categories.dkp.total,
        categories: categories
      };
    });
  });

  return rankings;
}


/**
 * ============================================================
 * SHEET -> OBJECTS
 * ============================================================
 */

function sheetToObjects_(sheet) {

  const values =
    sheet
      .getDataRange()
      .getValues();


  if (
    !values ||
    values.length < 2
  ) {

    return [];

  }


  const headers =
    values[0].map(header =>

      String(header).trim()

    );


  return values

    .slice(1)

    .filter(row =>

      row.some(value =>

        value !== '' &&
        value !== null

      )

    )

    .map(row => {

      const obj = {};


      headers.forEach(
        (header, index) => {

          if (header) {

            obj[header] =
              row[index];

          }

        }
      );


      return obj;

    });

}


/**
 * ============================================================
 * VALUE HELPERS
 * ============================================================
 */

function normalizeId_(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {

    return '';

  }


  return String(value)
    .replace(/\.0$/, '')
    .trim();

}


function numberOrNull_(value) {

  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {

    return null;

  }


  const number =
    Number(value);


  return Number.isFinite(number)
    ? number
    : null;

}


function numberForSort_(value) {

  const number =
    Number(value);


  return Number.isFinite(number)
    ? number
    : 999999;

}


function dateValue_(value) {

  if (!value) {

    return null;

  }


  if (value instanceof Date) {

    return Utilities.formatDate(

      value,

      Session.getScriptTimeZone(),

      'yyyy-MM-dd'

    );

  }


  return String(value);

}


/**
 * ============================================================
 * ERROR RESPONSE
 * ============================================================
 */

function errorResponse_(
  code,
  message
) {

  return {

    success: false,

    error: {

      code:
        code,

      message:
        message

    }

  };

}


/**
 * ============================================================
 * JSON RESPONSE
 * ============================================================
 */

function jsonResponse_(data) {

  return ContentService

    .createTextOutput(
      JSON.stringify(
        data,
        null,
        2
      )
    )

    .setMimeType(
      ContentService.MimeType.JSON
    );

}


/**
 * ============================================================
 * TEST 1
 *
 * Prüft:
 * - Verbindung zur richtigen Database
 * - vorhandene Tabellen
 * ============================================================
 */

function testDatabaseConnection() {

  const ss =
    getDatabase_();


  Logger.log(
    'DATABASE NAME: ' +
    ss.getName()
  );


  Logger.log(
    'DATABASE ID: ' +
    ss.getId()
  );


  Logger.log(
    '--- SHEETS ---'
  );


  ss.getSheets().forEach(
    sheet => {

      Logger.log(
        sheet.getName()
      );

    }
  );

}


/**
 * ============================================================
 * TEST 2
 *
 * Prüft:
 * - Governor Lookup
 * - KvK History
 * - Requirement Progress
 * - Performance Data
 * ============================================================
 */

function testBattleTrackPlayer() {

  const governorId =
    '208886484';


  const result =
    getPlayerData_(
      governorId
    );


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

}