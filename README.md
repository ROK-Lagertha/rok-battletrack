# ⚔️ ROK BattleTrack

**Kingdom 3903 · Rise of Kingdoms analytics & Leadership tools**  
**Project checkpoint: 2026-10-09 · CF-013.6.3 verified in the deployed Leadership UI**  
**Migration status: Cloudflare Worker + static frontend; Google Apps Script remains the data backend**

[Open BattleTrack](https://rok-battletrack.jici1203.workers.dev/) · [Repository](https://github.com/ROK-Lagertha/rok-battletrack)

> **TRACK · UNDERSTAND · COMPARE**
>
> BattleTrack analyzes prepared Kingdom tracking data. It does **not** sign into or control Rise of Kingdoms accounts, and it does not fetch game data directly.

## At a glance

BattleTrack is a mobile-friendly, Kingdom-focused web application for governor performance, KvK history, requirements, rankings and Leadership analytics. The public experience is served through Cloudflare; existing Google Sheets and Google Apps Script provide the underlying tracking data and calculations.

**This README describes the Cloudflare deployment represented by the current repository.** Some legacy features still exist in `apps-script/` but have **not** been migrated into the Cloudflare Leadership UI. A legacy implementation is not evidence that the corresponding Cloudflare feature is available.

| Area | Current Cloudflare status |
| --- | --- |
| Public governor lookup and profile | Available through read-only Apps Script API |
| Personal requirements, rankings and KvK history | Available in public frontend |
| Kingdom rankings, statistics and trends | Available through read-only data endpoints |
| Discord login and Leadership access | Available; Officer **and** Data roles required |
| Leadership KvK catalog and story selection | Available, signed read-only bridge |
| Create/close KvK preflight | Available; **validation only, no writes** |
| Current KvK overview | Read-only; available only if an active KvK exists |
| Historical Leadership comparison and CSV export | Read-only |
| Kingdom Scan XLSX selection and local preview | Available; **no upload/import from Cloudflare** |
| Create / close KvK in Cloudflare | **Not enabled** |
| Discord HeroScrolls scan intake and controlled import | Planned, not enabled |

## Public BattleTrack

### Governor profile

Search by **Governor ID** to inspect available battle statistics, including KvK KP, T4/T5 kills, deads, start power, power change, classification and tracked KvK history. The frontend presents a mobile-friendly profile and distinguishes current/latest from historical records when source data is available.

### Requirements and progress

BattleTrack displays configured kill and dead requirements, achieved versus required values, remaining amounts and overall progress. Statuses include **PASS**, **NOT_MET** and **IN_PROGRESS**. Targets are data-driven; missing requirements must not be silently invented.

### Personal and Kingdom rankings

The UI supports **DKP**, **KPR**, **KP** and **KILLS**, including personal rank, nearby governors, prior-KvK rank movement and recent performance trends. Kingdom-wide rankings can be viewed by KvK. Rankings include all governors present in the relevant tracking dataset, including zero-value records.

| Metric | Definition |
| --- | --- |
| **DKP** | `(Deads × 10) + (T4 Kills × 5) + (T5 Kills × 15)` |
| **KPR** | `KvK Kill Points ÷ Start Power` (displayed as a percentage) |
| **KP** | Kill Points earned during the selected KvK |
| **KILLS** | `T4 Kills + T5 Kills` |

Higher values rank first. Equal metric values share the same rank; percentile positioning does not count ties as governors overtaken.

### History, statistics and trends

Historical KvKs are available in the profile's collapsible history, with recent seasons prioritized. Kingdom statistics aggregate available KP, T4/T5 kills, deads and governor counts. Trend displays compare recent tracked KvKs. These views reflect stored tracking data, **not live game telemetry**.

## 🔐 Leadership Command Center

**Path:** [`/leadership`](https://rok-battletrack.jici1203.workers.dev/leadership)

The Cloudflare Leadership route requires Discord OAuth2. On protected requests the backend verifies server-side that the user belongs to the configured Discord guild and has **both** the Officer and Data roles. A login alone does not grant access. Session cookies are Secure, HttpOnly and SameSite=Lax; session lifetime is limited. Privileged data is not intended for public caching.

The current Leadership layout has **four independent functional areas**. A KvK selection in one workflow must not unexpectedly change another.

### 1. KvK Management

- **ADD NEW KVK** determines the next number and ID from the current catalog, independent of the comparison selector.
- Story choices are read from the `KvK Stories` source, not hardcoded in the browser.
- Start date is selected manually. The suggested end is **start + 50 days**, remains editable and is a planning date only.
- **VALIDATE KVK · NO WRITE** performs an authenticated server-side preflight against the current read-only KvK and story metadata.
- **CLOSE KVK** offers a separate preflight for an active KvK, result (**WIN / LOST / MANUAL**) and actual end date.
- If form values change, a previous successful validation is invalidated; late responses must not restore stale approval (**CF-013.6.3**).
- **CREATE KVK** and the final **CLOSE KVK** action are deliberately disabled. Validation does not add or modify a KvK.

**Important:** `3903-KVK5` is reserved for the next real KvK. Never create a synthetic KvK in the production spreadsheet to test the migration.

### 2. Kingdom Scan

The Cloudflare Leadership interface provides a styled XLSX file picker and browser-local validation/preview. It displays file metadata and the selected KvK/snapshot assignment without committing an import. **Selecting or previewing a file does not upload, archive or write it.**

The legacy Apps Script application contains a more extensive controlled import pipeline with `Kingdom Snapshots` and `Scan Imports`, file archiving, integrity checks and audit metadata. **That legacy pipeline is not yet exposed as a Cloudflare write operation.**

### 3. Current KvK Overview

Read-only overview for the **active** KvK, using the protected comparison data. When no active KvK exists, the overview action is unavailable; a historical KvK must not be presented as current.

### 4. Comparison & Export

Choose a KvK in the dedicated comparison dialog, load a protected read-only comparison and export its **currently loaded** rows to CSV. Historical data uses **START → END**; an active KvK uses **START → LATEST** when available. CSV export is client-side and does not mutate the database. Export fields are escaped to reduce spreadsheet-formula injection risk.

## Architecture

```text
Browser
  ├── Public UI (Cloudflare static assets)
  │    └── Cloudflare Worker public read APIs
  └── /leadership (Discord OAuth2 + server-side role checks)
       ├── Signed, read-only KvK/story catalog
       ├── Read-only comparison and overview
       └── Create/close validation preflight (NO WRITE)
                         │
                         ▼
              Google Apps Script backend
                         │
                         ▼
                Google Sheets tracking data
```

Cloudflare serves the public assets from `public/` and runs the Worker in `src/index.js`. `src/discord-auth.js` handles the Discord OAuth2/session flow. The Worker accesses Google Apps Script through configured URLs; protected Leadership reads use a signed HMAC bridge. `apps-script/` preserves the legacy Google Apps Script code and data access logic during migration.

### Repository layout

```text
public/              Cloudflare-served public and Leadership frontend
src/index.js         Cloudflare Worker, API routing and signed read bridge
src/discord-auth.js  Discord OAuth2, session and role verification
apps-script/         Existing Google Apps Script backend and legacy UI
docs/                Project notes, data model and migration history
wrangler.jsonc       Cloudflare Worker and static asset configuration
package.json        Wrangler scripts
README.md           Current project overview and checkpoint
```

Some documents under `docs/` are historical migration notes. When their checkpoint differs from this README or the current source code, verify the implementation before assuming an endpoint is deployed.

## Current API surface

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Service health |
| GET | `/api/v1/players/:governorId` | Public governor lookup |
| GET | `/api/v1/rankings/meta` | Public ranking metadata |
| GET | `/api/v1/rankings/:kvkId` | Public ranking data |
| GET | `/api/auth/discord/login` | Begin Discord OAuth2 |
| GET | `/api/auth/discord/callback` | Complete Discord OAuth2 |
| GET | `/api/auth/discord/me` | Validate current Leadership session and roles |
| GET/POST | `/api/auth/discord/logout` | End Leadership session |
| GET | `/api/v1/leadership/kvks` | Protected, signed, read-only KvK/story catalog |
| GET | `/api/v1/leadership/comparisons/:kvkId` | Protected, read-only comparison |
| POST | `/api/v1/leadership/kvks/validate-create` | Create preflight, **NO WRITE** |
| POST | `/api/v1/leadership/kvks/validate-close` | Close preflight, **NO WRITE** |

The preflight endpoints return validation results, not authorization to write. There are **no enabled production create/close routes** in this checkpoint.

## Local development and deployment

Prerequisites: Node.js, npm and access to the relevant Cloudflare account and Google Apps Script deployment.

```bash
npm install
npm run dev
npm run check
npm run deploy
```

`npm run check` runs a Wrangler **dry run**, not an integration or security test. `npm run deploy` changes the Cloudflare deployment and should only be run intentionally. Cloudflare's connected GitHub deployment may deploy after a push, depending on project configuration.

### Environment and secrets

The Worker expects an Apps Script deployment URL and secrets/configuration for Discord OAuth2, sessions and the signed Leadership bridge. Relevant names in the current code include:

- `APPS_SCRIPT_API_URL`
- `BT_BRIDGE_SECRET`
- `DISCORD_CLIENT_SECRET`
- `SESSION_SECRET`
- `DISCORD_BOT_TOKEN` (optional fallback for server-side role retrieval)
- `DISCORD_OFFICER_ROLE_ID` and `DISCORD_DATA_ROLE_ID` (optional role overrides)

Configure sensitive values as **Cloudflare secrets**, never in committed source files. Keep local `.dev.vars` private. Do not upload Google credentials, OAuth tokens, session cookies or spreadsheet exports to this public repository. The checked-in `.dev.vars.example` is a template only; it is not a complete production configuration.

Discord OAuth callback configuration is tied to the deployed hostname. If the hostname changes, review both Discord application redirect settings and the callback URL in `src/discord-auth.js` before deploying.

## Checkpoint: 2026-10-09

**Confirmed in the deployed UI:**

- Discord-protected Leadership access and the independent Leadership cards.
- Signed KvK/story metadata, including next KvK number **5** / `3903-KVK5`.
- Successful **NO DATA WRITTEN** preflight for an example story/date selection.
- **CF-013.6.3:** modifying validated form inputs invalidates the previous result; user-confirmed live behavior.
- Create/close action buttons remain disabled.

**Engineering work not yet connected to production:** CF-013.6.1 and CF-013.6.2 were isolated offline write-core/mock-bridge experiments. They are **not** deployment packages and do not establish that production writes are secure.

**Next milestone — secure write integration:** design and verify a narrowly scoped Cloudflare → Apps Script write bridge with server-side Discord authorization, explicit confirmation, durable idempotency, locking, replay resistance and audit logging. Test against an **isolated test spreadsheet**, not the production KvK table. Enable production writes only after successful integration tests and explicit approval.

Further planned work includes Discord HeroScrolls scan intake, a controlled Cloudflare scan-import workflow, integrity checks and more complete Leadership audit reporting.

## Data integrity and operational rules

- No production test KvKs, synthetic production snapshots or silent database writes.
- A planned KvK end date is not an automatic closure trigger; actual closure must be explicit.
- Read-only analytics must never mutate `KvKs`, `KvK Results`, `Kingdom Snapshots` or `Scan Imports`.
- Only authenticated, authorized officers should access Leadership data; browser-side controls are not a substitute for backend authorization.
- Avoid hardcoded story lists, historical IDs and requirement thresholds when authoritative source tables exist.
- Preserve historical records and the existing Apps Script implementation while Cloudflare migration is incomplete.

## Project documentation

- [`docs/PROJECT.md`](docs/PROJECT.md) — project context
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) — data model
- [`docs/CLOUDFLARE-API-CONTRACT.md`](docs/CLOUDFLARE-API-CONTRACT.md) — API notes (may include historical planning)
- [`docs/CLOUDFLARE-MIGRATION.md`](docs/CLOUDFLARE-MIGRATION.md) — migration history; early sections are not the current status
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — recorded changes

---

**ROK BattleTrack · Kingdom 3903**  
*Built for clear, traceable KvK performance analysis and responsible Kingdom management.*
