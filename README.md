# ⚔️ ROK BattleTrack

**Kingdom 3903 · Rise of Kingdoms analytics & Leadership tools**  
**Checkpoint: 2026-10-10 · CF-014.5 Phase E.3 live-tested · E.4 security review in progress**

[Open BattleTrack](https://rok-battletrack.jici1203.workers.dev/) · [GitHub repository](https://github.com/ROK-Lagertha/rok-battletrack)

> **TRACK · UNDERSTAND · COMPARE**

BattleTrack analyzes prepared Rise of Kingdoms tracking data. It does **not** log in to or control game accounts or retrieve live game telemetry.

## Current feature status

| Area | Cloudflare status |
| --- | --- |
| Governor lookup, personal profiles, requirements and history | Available |
| Kingdom statistics and DKP/KPR/KP/KILLS rankings | Available |
| Discord Leadership authentication | Available; **Officer AND Data** roles required |
| KvK catalog, stories and next-ID lookup | Signed read-only |
| CREATE / CLOSE validation | Available; preflight only |
| CREATE / CLOSE / RE-OPEN signed backend handlers | Installed; **production gates OFF** |
| RE-OPEN eligibility | Signed **READ_ONLY** check; live-tested |
| RE-OPEN UI submit | **LOCKED**; no POST from current UI |
| Kingdom Scan XLSX local preview | Available; Cloudflare import not enabled |
| Current KvK overview | Read-only |
| Historical comparison and CSV export | Read-only |
| Discord HeroScrolls scan intake | Planned |

**Production rule:** No synthetic KvKs or test closures in production. `3903-KVK5` is reserved for the next genuine KvK; its start date is not fixed.

## Public BattleTrack

Search by Governor ID for tracked KvK KP, T4/T5 kills, deads, power changes, requirements, performance status and historical records. Missing requirements must not be invented. The interface displays achieved/required values and remaining kills/deads.

| Ranking | Formula |
| --- | --- |
| **DKP** | `(Deads × 10) + (T4 Kills × 5) + (T5 Kills × 15)` |
| **KPR** | `KvK Kill Points ÷ Start Power` (shown as %) |
| **KP** | Kill Points earned during selected KvK |
| **KILLS** | `T4 Kills + T5 Kills` |

Rankings use stored data, include zero-value records and treat equal scores as ties. They are not live game telemetry.

## 🔐 Leadership Command Center

[Open Leadership](https://rok-battletrack.jici1203.workers.dev/leadership)

Protected routes verify Discord guild membership and **both** required roles on the server. The four functional areas remain independent.

### 1. KvK Management

**ADD NEW KVK:** Next KvK number/ID comes from existing records; stories come from `KvK Stories`. The suggested planned end date is **start + 50 days**, but is editable. The planned end date is not an automatic closure trigger.

**CLOSE KVK:** Preflight for an active KvK, with result `WIN`, `LOST` or `MANUAL`, actual end date, optional notes and tags `WITH_STAR`, `WITHOUT_STAR`, `ALLY_SURRENDERED`, `SURRENDERED`. Star tags are mutually exclusive. Original `End Scan Date` is preserved.

**RE-OPEN KVK:** Phase E.3 dialog allows inspection of existing KvKs and calls an authenticated, signed **read-only** backend eligibility endpoint. Local request preview uses a 10–2,000 character reason and the exact phrase `Reopen this KVK`. **CHECK ELIGIBILITY · NO WRITE** shows backend decisions. **RE-OPEN KVK · LOCKED** remains disabled, with no UI POST handler.

Server-side RE-OPEN eligibility requires a real authorized early CLOSE, valid signed closure metadata, an appropriate completed CLOSE audit, and the current Europe/Berlin calendar date strictly before the immutable original planned end date. Historical/completed KvKs remain protected. Actual write handlers recheck conditions independently.

**All CREATE, CLOSE and RE-OPEN production write gates remain OFF.** Installed backend handlers do not imply authorization to write.

### 2. Kingdom Scan

Cloudflare supports XLSX selection and browser-local validation/preview. This does not upload or import the file. The legacy Apps Script import pipeline is separate and should not be confused with a Cloudflare write capability.

### 3. Current KvK Overview

Protected, read-only overview for the active KvK. Historical KvKs must not be presented as current.

### 4. Comparison & Export

Independent KvK selection and read-only comparison; historical KvKs use **START → END**, active KvKs **START → LATEST**, where available. CSV export works client-side on loaded rows.

## Architecture

```text
Browser
  ├── Public frontend / public read APIs
  └── Leadership (Discord OAuth2 + Officer AND Data)
       ├── Signed read-only KvK/story catalog
       ├── Signed RE-OPEN eligibility (GET, NO WRITE)
       ├── Comparison and overview (NO WRITE)
       ├── CREATE/CLOSE preflight (NO WRITE)
       └── Signed CREATE/CLOSE/RE-OPEN handlers (GATES OFF)
                         │
                 Cloudflare Worker
                         │
                 Google Apps Script
                         │
                 Google Sheets
```

| Repository path | Purpose |
| --- | --- |
| `public/` | Public and Leadership frontend |
| `public/leadership.html` | Four Leadership areas and E.3 RE-OPEN UI |
| `src/index.js` | Cloudflare Worker, protected API and HMAC bridge |
| `src/discord-auth.js` | Discord OAuth, sessions and role checks |
| `apps-script/Code.gs` | Core data backend and legacy functionality |
| `apps-script/Bridge.gs` | Signed read bridge and read-only eligibility |
| `apps-script/ProductionWrite.gs` | Gated write handlers, audit and locking |
| `docs/` | Project notes, model and migration history |
| `wrangler.jsonc` | Cloudflare configuration |
| `package.json` | Wrangler scripts |

## API overview

| Method | Route | Safety |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/v1/players/:governorId` | Public governor lookup |
| GET | `/api/v1/rankings/meta` | Ranking metadata |
| GET | `/api/v1/rankings/:kvkId` | Ranking data |
| GET | `/api/auth/discord/login` | Begin OAuth |
| GET | `/api/auth/discord/callback` | OAuth callback |
| GET | `/api/auth/discord/me` | Session and role validation |
| GET/POST | `/api/auth/discord/logout` | End session |
| GET | `/api/v1/leadership/kvks` | Signed protected read |
| GET | `/api/v1/leadership/comparisons/:kvkId` | Protected comparison |
| POST | `/api/v1/leadership/kvks/validate-create` | **NO WRITE** |
| POST | `/api/v1/leadership/kvks/validate-close` | **NO WRITE** |
| GET | `/api/v1/leadership/kvks/reopen-contract` | Read-only contract |
| GET | `/api/v1/leadership/kvks/reopen-eligibility?kvkId=...` | Signed **READ_ONLY** |
| GET | `/api/v1/leadership/kvks/write-readiness` | Read-only gate status |
| POST | `/api/v1/leadership/kvks/create` | Production gate **OFF** |
| POST | `/api/v1/leadership/kvks/close` | Production gate **OFF** |
| POST | `/api/v1/leadership/kvks/reopen` | Production gate **OFF** |

## Checkpoint: 2026-10-10

- **E.1 complete:** RE-OPEN dialog and locked request preview.
- **E.2 complete:** Signed read-only server eligibility, including specific missing-audit diagnostics.
- **E.3 complete:** User-confirmed live UI test with **KvK 2 / Season 2 / Historical**. Backend returned **NOT ELIGIBLE · AUDIT_NOT_INITIALIZED**, and RE-OPEN remained locked.
- **E.4 ongoing:** Security review verified roles, HMAC, separate gates, audit ordering, date guards and locked UI. **Open finding:** After a RE-OPEN POST, malformed or unparseable Apps Script responses must be treated as `REOPEN_STATUS_UNCERTAIN`, not an ordinary bad-response failure. **E.4.1 is not yet deployed.**

The production sheet `_BT_PRODUCTION_WRITE_AUDIT` does not yet exist. Do **not** create a fake CLOSE or audit entry to make an eligibility check pass. A blank audit sheet would not establish a genuine signed CLOSE history.

The Apps Script target URL was verified against Web App **version 93** earlier in the session; subsequent Bridge deployments require newer versions. Do not assume v93 is still current.

**No production writes or artificial test KvKs were performed in these E.1–E.3 checks.** Separate explicit authorization and completed safety review are required before production activation.

## Development and deployment

```bash
npm install
npm run dev
npm run check
npm run deploy
```

`npm run check` is a Wrangler **dry run**, not an integration/security test. Cloudflare may auto-deploy after GitHub pushes.

Relevant configuration: `APPS_SCRIPT_API_URL`, `BT_BRIDGE_SECRET`, Discord OAuth/session secrets and roles, plus independent `BT_PRODUCTION_CREATE_ENABLED`, `BT_PRODUCTION_CLOSE_ENABLED`, `BT_PRODUCTION_REOPEN_ENABLED` gates. Never commit secrets, tokens, cookies, Google credentials or spreadsheet exports to a public repository.

## Data integrity rules

- No synthetic production KvKs, snapshots, closures or silent writes.
- Preserve KvK IDs, player statistics, closure history and original planned end dates.
- Read-only endpoints must not create sheets or audit entries.
- Browser validation is never a substitute for server authorization.
- All production write gates remain OFF until explicit approval.
- Preserve historical data and legacy functionality during Cloudflare migration.

## Documentation

- [Project overview](docs/PROJECT.md)
- [Data model](docs/DATA-MODEL.md)
- [Cloudflare API contract](docs/CLOUDFLARE-API-CONTRACT.md)
- [Cloudflare migration](docs/CLOUDFLARE-MIGRATION.md)
- [Changelog](docs/CHANGELOG.md)

Older documents may describe historical checkpoints; verify against current source before acting.

---

**ROK BattleTrack · Kingdom 3903**  
*Clear, traceable KvK performance analysis and responsible Kingdom management.*
