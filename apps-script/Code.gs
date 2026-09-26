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

  VERSION: '1.0',

  KINGDOM: 3903,

  DATABASE_ID: '1IR9ETdS3xxFEY0y3xfkb6h3BJ_VZp9f1-dmW2flfZvg',

  SHEETS: {
    GOVERNORS: 'Governors',
    KVKS: 'KvKs',
    RESULTS: 'KvK Results'
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

  if (isApiRequest) {
    return apiGet_(e);
  }

  return HtmlService
    .createTemplateFromFile('Index')
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
 * Client-callable bridge for google.script.run.
 */
function getPlayerData(governorId) {
  return getPlayerData_(governorId);
}


/**
 * ============================================================
 * WEB API
 * ============================================================
 */

function apiGet_(e) {

  try {

    const governorId =
      e &&
      e.parameter &&
      e.parameter.governorId
        ? String(e.parameter.governorId).trim()
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
   * Historie erstellen
   */
  const history =
    playerResults

      .map(row => {

        const kvkId =
          String(
            row['KvK ID'] || ''
          ).trim();

        return buildKvkPayload_(

          row,

          kvkMap[kvkId]

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

function buildKvkPayload_(row, kvk) {

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