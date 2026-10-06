# ROK BattleTrack — Cloudflare API Contract

**Contract version:** CF-008 / v1  
**Source baseline:** Apps Script v1.12.2b  
**Cloudflare baseline:** CF-007  
**Status:** Migration contract — no business-logic changes

## Purpose

Binding API map for replacing `google.script.run` with Cloudflare Worker endpoints. Google Sheets/Drive remain the data source during the application migration. D1/R2 is a later project (CF-028).

## Global conventions

- Base path: `/api/v1`
- HTTPS + JSON
- Reads use `GET`; state changes/validation bodies use `POST`
- Admin endpoints require `Authorization: Bearer <session-token>`
- Errors: `{"ok":false,"code":"ERROR_CODE","message":"Human readable message","requestId":"optional"}`
- Auth/write endpoints: `Cache-Control: no-store`
- Closed/historical KvK protection is always enforced server-side
- No secrets, spreadsheet IDs, Drive IDs, password hashes or service credentials are exposed to the browser
- Existing BattleTrack business calculations remain unchanged

## Endpoint inventory

| Legacy Apps Script call | Cloudflare endpoint | Method | Auth | Cache | Type |
|---|---|---|---|---|---|
| `getPlayerData(governorId)` | `/api/v1/players/:governorId` | GET | Public | short | Read |
| `getKingdomStatsData()` | `/api/v1/kingdom/stats` | GET | Public | short | Read |
| `getKingdomRankingMeta()` | `/api/v1/rankings/meta` | GET | Public | medium | Read |
| `getKingdomRankingSeasonData(kvkId)` | `/api/v1/rankings/:kvkId` | GET | Public | 10 min | Read |
| `adminLogin(username,password)` | `/api/v1/admin/session` | POST | Credentials | no-store | Auth |
| `adminValidateSession(token)` | `/api/v1/admin/session` | GET | Bearer | no-store | Auth |
| `adminLogout(token)` | `/api/v1/admin/session/logout` | POST | Bearer | no-store | Auth |
| `adminGetLeadershipKvks(token)` | `/api/v1/admin/kvks` | GET | Bearer | no-store | Admin read |
| `adminGetKvkComparison(token,kvkId)` | `/api/v1/admin/kvks/:kvkId/comparison` | GET | Bearer | no-store | Admin read |
| `adminGetKvkManagementData(token)` | `/api/v1/admin/kvks/management` | GET | Bearer | no-store | Admin read |
| `adminCreateKvk(token,payload)` | `/api/v1/admin/kvks` | POST | Bearer | no-store | Admin write |
| `adminCloseKvk(token,payload)` | `/api/v1/admin/kvks/:kvkId/close` | POST | Bearer | no-store | Critical write |
| `adminValidateKingdomScanXlsx(token,payload)` | `/api/v1/admin/scans/validate` | POST | Bearer | no-store | Validation |
| `adminImportKingdomScanXlsx(token,payload)` | `/api/v1/admin/scans/import` | POST | Bearer | no-store | Critical write |
| `adminCheckSnapshotIntegrity(...)` | `/api/v1/admin/scans/:importId/integrity` | GET | Bearer | no-store | Integrity |
| `adminGetDriveAuthorizationStatus(...)` | Transitional Apps-Script bridge concern; no permanent public endpoint planned | — | — | — | Transition |

`/api/health` remains the infrastructure health endpoint.

## Public API

### GET `/api/v1/players/:governorId`
Replaces `getPlayerData`. Governor ID must be numeric. Preserve the existing payload consumed by the player dashboard. Short cache permitted; affected entries must expire/invalidate after scan imports.

### GET `/api/v1/kingdom/stats`
Replaces `getKingdomStatsData`. Preserve existing kingdom/statistics/seasons structures. Short cache permitted.

### GET `/api/v1/rankings/meta`
Replaces `getKingdomRankingMeta`. Returns season/KvK metadata only. Invalidate after KvK create/close.

### GET `/api/v1/rankings/:kvkId`
Replaces `getKingdomRankingSeasonData`. Preserve `players`, `total`, DKP/KPR/KP/KILLS inputs and calculations. Target cache: 10 minutes per KvK, matching OP-058. Invalidate affected KvK after successful scan imports.

## Admin session API

### POST `/api/v1/admin/session`
Body: `{"username":"string","password":"string"}`

Returns token + user on success. Credentials are never logged. Generic invalid-login response. Rate limiting is required before production cutover.

### GET `/api/v1/admin/session`
Bearer token. Replaces session validation.

### POST `/api/v1/admin/session/logout`
Bearer token. Invalidates/revokes the session where supported.

## KvK / Leadership API

### GET `/api/v1/admin/kvks`
Replaces `adminGetLeadershipKvks`. One authoritative KvK list feeds Leadership selector, Current/Historical Overview, scan assignment and closure selector.

### GET `/api/v1/admin/kvks/:kvkId/comparison`
Replaces `adminGetKvkComparison`.
- closed/historical: START → END
- active/planned: START → LATEST
Read-only.

### GET `/api/v1/admin/kvks/management`
Replaces `adminGetKvkManagementData`. Returns next KvK number/ID and story catalog.

### POST `/api/v1/admin/kvks`
Replaces `adminCreateKvk`.
Body: `{"story":"string","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}`
Validate story/dates, preserve numbering rules, reject conflicts, invalidate metadata caches after success.

### POST `/api/v1/admin/kvks/:kvkId/close`
Replaces `adminCloseKvk`.
Body: `{"result":"WIN|LOST|MANUAL","actualEndDate":"YYYY-MM-DD"}`

Critical invariants:
- UI confirmation remains mandatory
- server independently verifies closure eligibility
- closure is permanent under normal API/UI operation
- closed KvKs reject future START/MIDDLE/END imports
- existing snapshots remain unchanged
- cache invalidation only after successful persistence

## Scan API

### POST `/api/v1/admin/scans/validate`
First migration phase remains compatible with current browser workflow:
`{"fileName":"kingdom_scan_....xlsx","base64":"..."}`

Validation is strictly write-free:
- XLSX structure/data sheet
- required columns
- Governor row count
- unique/missing IDs
- numeric battle fields

No archive, Drive or database write during validation.

### POST `/api/v1/admin/scans/import`
Body:
`{"fileName":"...xlsx","base64":"...","kvkId":"3903-KVK4","snapshotType":"START|MIDDLE|END"}`

Critical invariants:
1. Revalidate XLSX server-side.
2. Re-read KvK state server-side.
3. Reject closed/historical KvKs regardless of UI.
4. Validate snapshot assignment.
5. Preserve import ID/audit metadata.
6. Preserve duplicate protection.
7. Archive original XLSX unchanged during Google transition.
8. Write only after all preconditions pass.
9. Perform post-import read-back/integrity verification.
10. Return success only after integrity succeeds.
11. Invalidate only affected caches after verified import.

CF-028 may later replace Sheets/Drive with D1/R2 without changing these invariants.

### GET `/api/v1/admin/scans/:importId/integrity`
Maps the existing integrity-check capability for audit/troubleshooting.

## Stable error codes

`BAD_REQUEST`, `INVALID_GOVERNOR_ID`, `NOT_FOUND`, `UNAUTHORIZED`, `SESSION_EXPIRED`, `FORBIDDEN`, `VALIDATION_FAILED`, `INVALID_KVK`, `KVK_CLOSED`, `INVALID_SNAPSHOT_TYPE`, `DUPLICATE_IMPORT`, `IMPORT_FAILED`, `INTEGRITY_FAILED`, `DATA_SOURCE_UNAVAILABLE`, `RATE_LIMITED`, `INTERNAL_ERROR`, `NOT_MIGRATED`.

HTTP mapping:
- 400 bad request/validation
- 401 missing/expired session
- 403 forbidden
- 404 not found
- 409 duplicate/conflicting state/closed-KvK write
- 413 upload too large
- 429 rate limited
- 500 internal
- 503 transitional data source unavailable

## Frontend adapter rule

Do not scatter raw `fetch()` calls throughout `battletrack.js`. Introduce one API adapter layer responsible for:
- `/api/v1` base path
- JSON parsing
- Authorization header
- error normalization
- session-expiry handling
- stale/cancelled request handling where needed

UI rendering remains separate from transport.

## Migration order

1. Health infrastructure — already live
2. Ranking meta + season ranking reads
3. Player lookup + kingdom stats reads
4. Admin session
5. Admin KvK list/comparison
6. KvK management/create
7. Scan validation
8. Controlled scan import + integrity
9. Permanent KvK closure
10. Full regression against Apps Script v1.12.2b
11. Cutover

Writes deliberately migrate after reads and authentication.

## CF-008 acceptance

CF-008 is complete when every current `google.script.run` call has a documented target, read/write/auth/cache classification is defined, scan/closure invariants are preserved, error semantics and frontend adapter strategy are fixed, and no business calculation has changed.
