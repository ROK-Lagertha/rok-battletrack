# ⚔️ ROK BattleTrack – Kingdom 3903

**Cloudflare migration checkpoint: CF-014.6 preview tested (2026-10-08); CF-015 next**  
**Apps Script reference baseline: v1.12.2b**  
**Verified stable baseline: v1.11.5.2**

ROK BattleTrack is a mobile-first **Rise of Kingdoms performance and analytics WebApp for Kingdom 3903**. It turns prepared KvK tracking data from Google Sheets into clear personal battle profiles, requirement progress, historical comparisons, Kingdom rankings and Kingdom-wide analytics.

What started as a Governor ID lookup has grown into a broader BattleTrack platform built around three principles:

**TRACK · UNDERSTAND · COMPARE**

> BattleTrack does not access Rise of Kingdoms accounts directly. It works with prepared Kingdom 3903 tracking data.

---

## ✨ Current feature set

### 🔎 Governor Lookup & Battle Profile
- Search by **Governor ID**.
- Governor name, Kingdom and classification.
- Number of tracked KvKs.
- Current/latest KvK battle profile.
- Start Power and Power Change.
- KvK Kill Points, T4 Kills, T5 Kills, combined T4+T5 Kills and Deads.
- Mobile-first presentation designed for Discord and phone use.

### 🎯 Requirements
BattleTrack compares tracked performance with the configured requirements for the selected KvK.

- Kill Requirement progress.
- Dead Requirement progress.
- Overall Progress.
- Achieved / required values.
- Remaining amount or completed state.
- Statuses: **PASS**, **NOT_MET** and **IN_PROGRESS**.
- Requirements may differ by classification.
- Undefined requirements remain undefined; BattleTrack does not fabricate targets.

### 🏆 Personal Kingdom Ranking
The Governor Profile contains a collapsible personal ranking with:

- **DKP** — Dead & Kill Points.
- **KPR** — Kill Points relative to Start Power.
- **KP** — KvK Kill Points.
- **KILLS** — T4 + T5 Kills.
- Personal Kingdom rank.
- **Ahead of X% of Governors** position.
- Ranking Neighborhood with up to three governors above and below.
- Metric explanations directly in the interface.

#### Rank change between KvKs
BattleTrack compares the selected metric with the governor's **immediately previous tracked KvK**.

- `▲ N` — rank improved.
- `▼ N` — rank declined.
- `— SAME RANK` — unchanged.
- Previous KvK rank and Season are shown when available.

The comparison automatically follows the selected DKP / KPR / KP / KILLS metric.

### 📈 Governor Battle Progress
The personal profile includes a collapsible **Battle Progress · Last 3 KvKs** section.

- Rolling comparison of a maximum of the latest three tracked KvKs.
- Switch between **DKP | KPR | KP | KILLS**.
- Visual bars for each displayed KvK.
- Percentage change compared with the previous displayed KvK.
- Increase/decrease colors describe direction only and are not automatically a performance judgment.

### 📜 KvK History
Historical KvKs are contained inside a dedicated collapsible **KvK History** block.

- Historical KvK cards stay hidden until the block is opened.
- Latest three records are prioritized.
- Older KvKs can be shown on demand when available.
- Individual historical records use single-open accordion behavior.
- Historical stats, Power, requirements, progress and result status remain available.
- Season/story names come from the database rather than frontend hardcoding.

---


## 🔐 Leadership Command Center

BattleTrack now includes a protected Leadership workspace for internal Kingdom administration.

- Server-side Admin login using Google Apps Script Script Properties.
- Short-lived session token stored in Apps Script cache.
- Dedicated Leadership Command Center in the WebApp.
- Public player features remain separate from Leadership-only tools.

> Admin credentials are not stored in the public repository. Configure `BT_ADMIN_USER` and `BT_ADMIN_PASSWORD` in Apps Script Script Properties.

### Kingdom Scan Validation & Controlled Import
Leadership can upload a HeroScrolls Kingdom scan, validate it server-side and commit it as a traceable raw BattleTrack snapshot.

- XLSX validation runs in Apps Script without external CDN dependencies.
- The governor data sheet is detected by required headers rather than a hardcoded sheet name.
- Validation checks Governor IDs, duplicate/missing IDs and numeric battle fields before any write.
- Leadership explicitly assigns the target KvK / Season and snapshot type: **START | MIDDLE | END**.
- **MIDDLE** may occur multiple times; the newest intermediate snapshot can later serve as LATEST.
- The original XLSX is archived unchanged in the configured Google Drive archive folder before the snapshot commit.
- `Scan Imports` stores the audit trail including Import ID, source file/sheet, SHA-256 fingerprint, KvK, snapshot type, governor count, importer, archive file metadata and status.
- `Kingdom Snapshots` stores the imported raw governor rows with their Import ID and source metadata.
- `KvK Results` is not modified by the raw controlled-import workflow.
- Duplicate-file protection uses the SHA-256 fingerprint together with the import assignment.
- Drive authorization is checked explicitly; the WebApp can surface Google's authorization flow when the required Drive scope is missing.

**First production validation:** KvK4 / MIDDLE, 214 governors, archived successfully and committed with `COMPLETED` audit status on 2026-09-28.

### KvK Management
Leadership can prepare the next KvK from the BattleTrack Story Catalog.

- KvK Number and KvK ID are generated from the existing `KvKs` sequence.
- Story selection is loaded from the `KvK Stories` sheet.
- Start date is entered by Leadership.
- Planned End is automatically calculated as **Start + 50 days**.
- Planned End remains editable and is **not** treated as a permanent actual end date.
- Creating a KvK requires explicit confirmation before the row is written.

The 50-day rule is intentionally a planning default only. BattleTrack does not automatically close a KvK when the planned date is reached.

### Leadership KvK Selector
Leadership now has a shared, data-driven KvK selector for internal analytics workflows.

- KvKs / Seasons are loaded dynamically from the `KvKs` table.
- No hardcoded KvK5 or season-specific frontend logic.
- Historical KvKs resolve to **START → END**.
- Active KvKs resolve to **START → LATEST**.
- The selector displays the selected season, status, comparison mode and available date window.
- The selector is already used by Leadership Comparison and is designed for reuse by Current KvK Overview and scan assignment.

### Leadership Comparison & CSV Export
Leadership can load a Kingdom-wide working comparison for a selected KvK.

- Uses the validated BattleTrack `KvK Results` data source.
- Historical comparison tested successfully with **KvK2 / 656 Governors**.
- Displays Governor, classification, Start Power, Power change, KP, T4, T5, Deads, DKP, KPR and DKP rank.
- CSV export is generated from the **currently loaded comparison dataset**, avoiding a second calculation or server fetch.
- Export additionally includes Governor ID, End/Latest Power, total kills, requirements, progress values and Requirement Status for Leadership analysis.
- Export is read-only and does not write to the BattleTrack database.

---


### Raw Scan Data Model
The controlled-import pipeline adds two internal data sources alongside the existing calculated `KvK Results` table.

- **`Kingdom Snapshots`** — raw governor values imported from an assigned Kingdom scan.
- **`Scan Imports`** — one audit record per controlled import, including archive and source metadata.
- Every imported governor row carries the same Import ID as its audit record, making a snapshot traceable back to the exact source XLSX.
- Raw snapshots and calculated KvK results are deliberately separated so importing source data cannot silently rewrite historical calculated results.

**OP-060 Snapshot Integrity Check is implemented and live-tested.** After every controlled import, BattleTrack re-reads the committed snapshot and verifies expected/stored row counts, unique Governor IDs, missing/duplicate IDs and Import ID/KvK/snapshot metadata consistency before confirming `COMPLETED`. Live validation on 2026-09-28: KvK4 / MIDDLE with **215 expected / 215 stored, 215 unique IDs, 0 missing, 0 duplicates and 0 metadata mismatches**.

**OP-061 Mobile Scan UX & Success Flow is implemented and live-tested in v1.11.5.2.** The Kingdom Scan workflow is fully usable on mobile and short viewports, keeps all validation/assignment/import controls reachable, replaces the native browser `confirm()` with the BattleTrack-styled **Confirm Kingdom Scan Import** modal, and only shows **Upload complete** after `SNAPSHOT INTEGRITY VERIFIED` before returning to the Leadership Command Center. Error, blocked and integrity-failure states remain visible in the scan dialog. The backend import, archive, duplicate-protection and integrity logic is unchanged.

## 📋 Full Kingdom Ranking
BattleTrack provides a standalone Kingdom-wide ranking independent of the personal Governor Profile.

- Select current or historical KvKs / Seasons.
- Switch between **DKP | KPR | KP | KILLS**.
- All governors in `KvK Results` for the selected KvK are included, including zero-value accounts.
- Ranking metadata is loaded first; governor ranking data is lazy-loaded only for the selected KvK.
- Each selected KvK ranking dataset is cached server-side for 10 minutes.
- Metric switching remains client-side and fast once the selected KvK is loaded.
- Request-state protection prevents stale responses from leaving ranking categories disabled or overwriting newer selections.
- Ranking table scroll position is preserved when switching metrics.

### Ranking formulas

**DKP**

`(Deads × 10) + (T4 Kills × 5) + (T5 Kills × 15)`

**KPR**

`KvK Kill Points ÷ Start Power`

KPR is displayed as a percentage in the interface.

**KP**

KvK Kill Points earned during the selected KvK.

**KILLS**

`T4 Kills + T5 Kills`

### Ranking rules
- Highest metric value ranks first.
- Ties receive the same rank.
- Rank = `1 + number of governors with a strictly higher value`.
- Ahead-of / Top-% uses governors with **strictly lower** values only.
- Ties therefore do not inflate percentile position.

---

## 📊 Kingdom KvK Statistics
The Kingdom Stats dashboard aggregates the complete selected `KvK Results` population.

- **Total KP**
- **Total Kills (T4 + T5)**
- **Total Deads**
- **Tracked Governors**
- Historical Season selection.

Resource-transfer / RSS statistics are intentionally not displayed because BattleTrack currently has no verified production source for them.

## 📈 Kingdom Progress & Trends
BattleTrack visualizes recent Kingdom development for:

- Total KP.
- Total Kills.
- Total Deads.
- Tracked Governors.
- Percentage change versus the previous displayed KvK.

### Rolling-3 rule
Kingdom Progress intentionally shows **a maximum of the latest three KvKs**.

Examples:
- KvK5 available → KvK3, KvK4, KvK5.
- KvK6 available → KvK4, KvK5, KvK6.

This keeps the dashboard focused on recent development instead of creating an endlessly growing chart.

---

## 📖 Player Guidance
The top navigation provides access to:

- **Kingdom Rankings**
- **Kingdom Stats**
- **About BattleTrack**
- **How It Works**
- **FAQ**

### How It Works
A five-step player journey:

`Governor ID → Battle Profile → Requirements → Kingdom Ranking → Battle Archive`

### Player FAQ
Single-open accordion explaining data sources, classifications, requirements, statuses, ranking metrics, ties, ranking population, historical behavior and Rolling-3 logic.

### About BattleTrack
Explains the project's purpose and evolution around:

**TRACK · UNDERSTAND · COMPARE**

---

## 🎨 Interface
BattleTrack uses a Kingdom 3903 visual identity built around:

- Deep black / navy surfaces.
- Gold and metallic accents.
- Responsive 3:1 BattleTrack hero banner.
- Kingdom 3903 Cappy footer artwork.
- Compact collapsible top navigation.
- Collapsible information blocks for a cleaner mobile experience.
- Subtle gold-to-navy gradients for Governor Trend and KvK History.

The same responsive layout is used across desktop and mobile rather than maintaining separate interfaces.

---

## 🏗️ Architecture

**Current Cloudflare public read path:** `Cloudflare static frontend → Cloudflare Worker /api/v1 → Google Apps Script WebApp → Google Sheets`  
**Legacy/reference path:** `Google Apps Script WebApp → Google Sheets`

### Cloudflare deployment
- `public/` — static application assets (HTML, CSS, JavaScript).
- `src/index.js` — Cloudflare Worker and public API routing.
- `wrangler.jsonc` — Worker/static asset configuration.
- `APPS_SCRIPT_API_URL` — production Worker runtime secret containing the deployed Apps Script `/exec` URL; never commit its value.
- `/api/health` — public health endpoint.
- `/api/v1/rankings/meta` — list of available KvK seasons.
- `/api/v1/rankings/:kvkId` — ranking data for one KvK, preserving the 10-minute cache behavior.
- `/api/v1/players/:governorId` — public governor lookup and existing player profile payload.
- Unmigrated `/api/*` routes return `NOT_MIGRATED`; do not treat them as active functionality.

### Apps Script source
- `apps-script/Code.gs` — backend, database access and BattleTrack payloads.
- `apps-script/Index.html` — application structure.
- `apps-script/Styles.html` — responsive BattleTrack UI.
- `apps-script/Scripts.html` — rendering, interactions, ranking logic and browser-side caching.

Production spreadsheets and governor datasets are **not stored in this public repository**.

---

## 🗃️ Data model
The production database includes separate sources for:

- Governors.
- KvKs / Seasons.
- KvK Stories / Story Catalog.
- Snapshots.
- Player Classification.
- Requirements.
- KvK Results.
- Configuration.

`KvK Results` is the primary source for completed/current KvK performance and Kingdom ranking calculations.

Season/story labels are data-driven.

---

## 🚧 Roadmap

### Leadership Kingdom KvK Overview (OP-050)
Phase 1 is implemented and live-tested in v1.12.0c. The read-only Leadership cockpit supports dynamic KvK selection, Governor search, status filtering and sorting. Historical KvKs use **START → END**; active KvKs use **START → LATEST**. Phase 2 remains open for later expansion.

### KvK closing workflow (OP-057)
Phase 1 is implemented and partially live-tested in v1.12.1b.

- Leadership can choose **KVK WIN**, **KVK LOST** or **MANUAL CLOSE**.
- Actual End Date is stored separately from Planned End.
- A BattleTrack final-safety confirmation is required before permanent closure.
- Closed/historical KvKs reject future START, MIDDLE and END scan imports server-side.
- Scan assignment visibly marks protected seasons as **CLOSED — SCAN IMPORTS DISABLED**.
- Existing historical snapshots are not changed by closure.

The final production closure write remains to be tested with the next genuinely open KvK. Historical backfill for already closed KvKs remains open.

### WebApp performance (OP-058)
Completed and live-tested in v1.12.2b. The startup path no longer fetches and Base64-encodes the large UI images from Drive on every request. Full Kingdom Ranking now loads metadata first and lazy-loads only the selected KvK, with a 10-minute server cache and deterministic request/UI state handling.

### Flag Filler Registry integration
Main ↔ Flag Filler integration is planned for the post-Cloudflare architecture. The external Flag Filler Registry remains the intended single source of truth; BattleTrack should consume Governor-ID-based, time-aware relationships rather than duplicate registry ownership. Historical classification must not be retroactively rewritten from a current relationship.

### Leadership Governor Review & Marker History (OP-059)
Planned for a later Leadership phase: individual Leadership logins, Governor review, internal markers and immutable marker history. Player-facing profiles/API must not expose Leadership-only marker data.

### Copyright / Legal Notice (OP-062)
Open before broader/public distribution: document ownership of BattleTrack code/assets, third-party trademarks/assets, non-affiliation wording, and appropriate README/LICENSE notices.

### Acclaim Performance Indicator (OP-063)
Planned as a future player/Kingdom analytics feature. Highest Acclaim and Acclaim Ratio should remain separate performance indicators and use the raw values already available to BattleTrack.

### Cloudflare migration
v1.12.2b remains the functional Apps Script reference baseline. Cloudflare migration is incremental and is **not** a full replacement of the Apps Script backend or Google Sheets database.

| Work item | Status | Verified behavior |
| --- | --- | --- |
| CF-008 | Complete | Versioned `/api/v1` API contract documented in `docs/CLOUDFLARE-API-CONTRACT.md` |
| CF-009 | Complete | Cloudflare-to-Apps-Script bridge; rankings API; temporary diagnostics removed after testing |
| CF-010 | Complete | Governor ID lookup migrated to the Cloudflare API and confirmed in live UI |
| CF-011 | Complete | Kingdom rankings covered by CF-009: KvK2/3/4, category and season switching, reload |
| CF-012 | Live-tested | Discord OAuth, Officer + Data role authorization and logout; restricted access rejected |
| CF-013 | Preview tested | Protected Leadership access and navigation; original Apps Script Leadership remains separate |
| CF-014.1 | Live-tested | Signed, read-only Cloudflare → Apps Script KvK management bridge; unauthorized request denied |
| CF-014.2–014.4 | Preview tested | KvK selector, 16 stories, local-only Create → Active → Close sandbox; no writes |
| CF-014.5–014.6 | Preview tested | Native Leadership integration preview; selected KvK context shared with Overview and Comparison; actions disabled |
| CF-015 | Next | Comparison & CSV migration and parity testing against Apps Script baseline |

**Confirmed live on 2026-10-08:** Kingdom 3903 historical KvK2, KvK3 and KvK4 ranking metadata, DKP/KPR/KP/KILLS selection, season switching, reload, and public Governor Lookup. No change to ranking formulas, existing player calculations, scan imports or KvK closure rules.

### Cloudflare Leadership safety boundary
- The Apps Script admin login and original Leadership Command Center remain in place until all Cloudflare features pass full regression and the final cutover is approved.
- Cloudflare must validate credentials and authorization **server-side**; UI visibility alone does not grant access.
- Use secure, short-lived, HttpOnly cookies (Secure, SameSite), CSRF protection for state-changing requests, explicit logout and server-side session invalidation.
- Support multiple Leadership accounts without embedding passwords, hashes, session tokens or privileged API keys in public assets or Git history.
- Protect every Leadership API endpoint, including read operations; avoid relying on a shared secret passed from the browser to Apps Script as proof of user authorization.
- Preserve controlled import, integrity readback, historical/closed KvK write protection and rollback compatibility.
- Do not migrate or expose Admin write endpoints before authentication and authorization are verified.

## 🔒 Repository & data scope
This public repository is intended for:

- BattleTrack source code.
- Technical/project documentation.

It should **not** contain:

- Production Google Sheet exports.
- Private governor datasets.
- Credentials or access tokens.
- Internal Kingdom-only data.

---

## 🏷️ Release status

### Cloudflare migration checkpoint — CF-014.6 (2026-10-08)
- Public rankings and Governor Lookup live-tested through Cloudflare Worker APIs.
- Discord OAuth and Officer + Data access control live-tested, including unauthorized access denial.
- Signed KvK management read-only bridge live-tested: 3 historical KvKs and 16 story variants.
- Local-only KvK Create → Active → Close simulation tested; API rechecked afterward: `nextKvkId=3903-KVK5`, `nextNumber=5`, 3 tracked KvKs.
- Separate native Leadership integration preview tested: KvK context synchronized across Management, Overview and Comparison; write actions disabled.
- **Not migrated yet:** live Leadership Comparison/CSV, real Kingdom Overview, scan/import/integrity and protected KvK writes. Original Apps Script Leadership login remains in place.
- **Do not claim production cutover or full Leadership feature parity.** This is a source-code checkpoint, not a completed Cloudflare release.
- Checkpoint procedure: `docs/CLOUDFLARE-CF0146-CHECKPOINT.md`.

### v1.12.2b — Apps Script reference baseline
Highlights:
- OP-050 Leadership Kingdom KvK Overview Phase 1 live-tested.
- OP-057 KvK Closure Phase 1 with permanent final confirmation and historical scan protection.
- OP-058 Fast Startup completed: large Drive/Base64 image work removed from the critical `doGet()` path.
- OP-058 Ranking Reliability completed: per-KvK lazy loading, 10-minute server cache and stale-request protection.
- Full Kingdom Ranking menu/category switching live-tested successfully after fresh load, reload and Season changes.
- Existing DKP/KPR/KP/KILLS formulas and business rules remain unchanged.

This version remains the regression and rollback reference during the ongoing Cloudflare migration.

### v1.11.5.2 — Verified stable baseline
- OP-061 Mobile Scan UX & Success Flow.
- BattleTrack-styled scan confirmation instead of native browser confirmation.
- `Upload complete` only after verified snapshot integrity.
- Controlled import, archive, duplicate protection and integrity checks retained.

---

Built for **Kingdom 3903**. ⚔️
