# ⚔️ ROK BattleTrack – Kingdom 3903

**Current development release: v1.10.0d**  
**Verified stable baseline: v1.9.3**

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

### Kingdom Scan Safe Preview
Leadership can select a Kingdom scan and validate it in the browser before any future import workflow.

- Local file selection and structural validation.
- Preview-only workflow.
- No automatic database or Drive write.
- Designed as the safe foundation for the future START / MIDDLE / END scan import flow.

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

## 📋 Full Kingdom Ranking
BattleTrack provides a standalone Kingdom-wide ranking independent of the personal Governor Profile.

- Select current or historical KvKs / Seasons.
- Switch between **DKP | KPR | KP | KILLS**.
- All governors in `KvK Results` for the selected KvK are included, including zero-value accounts.
- Client-side precomputation and caching keep metric switching fast.
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

`Google Sheets → Google Apps Script backend → BattleTrack WebApp`

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

### KvK closing workflow
A dedicated Leadership closing flow is planned on top of the existing KvK Management foundation.

Planned actions include:

- **KvK Win**.
- **KvK Lost**.
- Manual KvK close.
- Store the actual end date separately from the planned end date.
- Use the actual end date as the final statistical cut-off when available.

The planned Start + 50 days value remains only a default planning window.

### Kingdom scan import
The safe-preview workflow will be extended into a controlled import process with explicit KvK and snapshot-type selection (`START`, `MIDDLE`, `END`).

### Leadership analytics
Leadership Comparison is now implemented, including the shared KvK Selector and CSV export. The next validation step is regression testing across historical KvK2–4. Remaining roadmap items include Current KvK Overview and a later Emigration Review Worklist.

### Flag Filler Registry integration
Time-aware Main ↔ Flag Filler integration is planned but intentionally deferred until sufficient live test cases are available.

The intended approach is:

- Link Main and Flag Filler profiles.
- Use the active registry for current relationships.
- Preserve historical classification semantics.
- Do **not** retroactively reclassify old KvKs based only on a current Flag Filler relationship.

### Future analytics
Additional Kingdom analytics may be added when reliable production data sources are available.

---

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

### v1.10.0d — Current development release
Highlights:
- Dynamic Leadership KvK Selector (OP-055).
- Historical and active comparison-window resolution: **START → END** / **START → LATEST**.
- Leadership Comparison foundation (OP-051).
- DKP/KPR performance comparison and DKP ranking for the selected KvK.
- Client-side CSV export of the currently loaded Leadership comparison.
- Historical KvK2 comparison successfully tested with **656 Governors**.
- Existing Leadership authentication, scan preview, KvK Management and public player features retained.

Before promoting v1.10.0 to the next stable baseline, the Leadership Comparison / export flow should be regression-tested with historical KvK2, KvK3 and KvK4.

### v1.9.3 — Verified stable baseline
- Leadership Command Center foundation.
- Server-side Admin authentication and short-lived session handling.
- Kingdom Scan Safe Preview.
- KvK Management backed by `KvKs` and `KvK Stories`.
- Automatic next KvK Number / ID generation.
- Story-driven Season name preview.
- Planned End defaulted to **Start + 50 days** and remains editable.
- No automatic KvK closure.

---

Built for **Kingdom 3903**. ⚔️
