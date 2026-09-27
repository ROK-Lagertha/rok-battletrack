# ⚔️ ROK BattleTrack – Kingdom 3903

**Current stable release: v1.7.4**

ROK BattleTrack is a mobile-first **Rise of Kingdoms performance and analytics dashboard for Kingdom 3903**. It turns tracked KvK data from Google Sheets into a fast Google Apps Script WebApp where governors can review their own combat performance, requirements, historical KvKs, rankings and Kingdom-wide development.

The project began as a Governor ID lookup and has grown into a broader BattleTrack platform focused on transparent player statistics and Kingdom 3903 KvK analytics.

## ✨ Current features

### Governor lookup & battle profile
- Search by **Governor ID**.
- Governor name, Kingdom, classification and tracked KvKs.
- Current/latest Season battle profile.
- Mobile-first interface designed for Discord and phone use.

### Current Season performance
- KvK Kill Points.
- T4 Kills and T5 Kills.
- T4 + T5 Kills.
- Deads.
- Start Power and Power Change.
- Requirement progress and Overall Progress.
- Achieved / required values plus remaining amount or completion state.

### Requirements
BattleTrack evaluates the governor against the configured KvK requirements and presents clear progress information and status states such as **PASS**, **NOT_MET** and **IN_PROGRESS**.

Requirements can differ by classification. BattleTrack does not fabricate a target when a requirement is not defined.

### Battle Archive
- Interactive historical KvK archive.
- Single-open accordion behavior.
- Recent KvKs prioritized with older history available on demand.
- Historical stats, requirement progress and result status.
- Season / story names are read from the database rather than hardcoded in the frontend.

## 🏆 Personal Kingdom Ranking
The Governor Profile includes a collapsible personal Kingdom Ranking with four selectable metrics:

- **DKP** — Dead & Kill Points.
- **KPR** — Kill Points relative to Start Power.
- **KP** — KvK Kill Points.
- **KILLS** — T4 + T5 Kills.

It also includes:
- Personal Kingdom rank.
- **Ahead of X% of Governors** position.
- Dynamic **Ranking Neighborhood** with up to three governors above and below the current governor.
- Competition ranking for ties: equal values receive the same rank.
- Percentile logic counts only governors with strictly lower values as behind.

## 📋 Full Kingdom Ranking
BattleTrack also provides a complete Kingdom-wide ranking independent of an individual Governor Profile.

- Select current or historical Seasons / KvKs.
- Switch between **DKP | KPR | KP | KILLS**.
- All governors in the selected `KvK Results` population are included, including zero-value accounts.
- Client-side sorting and caching provide fast metric switching without repeated backend requests.

## ⓘ Ranking metric explanations
Both personal and Full Kingdom Ranking include a compact contextual information control. The active metric can be explained directly inside the interface without permanently adding more text to the mobile layout.

### DKP
`(Deads × 10) + (T4 Kills × 5) + (T5 Kills × 15)`

### KPR
`KvK Kill Points ÷ Start Power`

KPR is displayed as a percentage in the UI.

### KP
Kill Points earned during the selected KvK.

### KILLS
`T4 Kills + T5 Kills`

## 📊 Kingdom KvK Statistics
The Kingdom Stats dashboard aggregates the selected KvK across the complete BattleTrack `KvK Results` population and displays:

- **Total KP**
- **Total Kills (T4 + T5)**
- **Total Deads**
- **Tracked Governors**

Historical Seasons can be selected directly in the dashboard.

Resource-transfer statistics are intentionally not shown yet because BattleTrack currently has no verified RSS source in the production dataset.

## 📈 Kingdom Progress & Trends
BattleTrack visualizes the Kingdom's recent development across KvKs for:

- Total KP.
- Total Kills.
- Total Deads.
- Tracked Governors.
- Percentage change compared with the previous displayed KvK.

### Rolling-3 rule
The Progress dashboard intentionally displays **a maximum of the latest three KvKs**. When a new KvK becomes available, the oldest one automatically leaves the comparison.

Example:
- KvK5 available → KvK3, KvK4, KvK5.
- KvK6 available → KvK4, KvK5, KvK6.

This prevents the dashboard from becoming an ever-growing historical chart and keeps the focus on recent Kingdom development.

Positive/negative visual changes describe an **increase or decrease**, not automatically good or bad performance. This distinction is especially important for Deads and Tracked Governors.

## 🧮 Ranking rules
- Ranking population: all governors available in `KvK Results` for the selected KvK.
- Ranking direction: highest metric value first.
- Ties share the same rank.
- Rank = `1 + number of governors with a strictly higher value`.
- Top-% / Ahead-of position uses governors with strictly lower values only, so ties do not inflate percentile position.


## 📖 Player guidance
BattleTrack includes three lightweight help layers without cluttering the main dashboard:

- **How It Works** — a five-step journey from Governor ID to Battle Archive.
- **Player FAQ** — a single-open accordion covering data sources, classifications, requirements, statuses, rankings and historical behavior.
- **About BattleTrack** — the project story and its three pillars: **Track · Understand · Compare**.

The help areas are designed mobile-first and do not change ranking or backend calculations.

## 🏗️ Architecture

`Google Sheets → Google Apps Script backend → BattleTrack WebApp`

The repository contains the WebApp source code. Production spreadsheets and governor datasets are **not stored in this public repository**.

### Apps Script files
- `apps-script/Code.gs` — backend, data access and BattleTrack payloads.
- `apps-script/Index.html` — application structure.
- `apps-script/Styles.html` — BattleTrack UI and responsive styling.
- `apps-script/Scripts.html` — browser-side interaction, rendering and caching.

## 🎨 UI direction
BattleTrack uses a Kingdom 3903 visual identity built around deep black/navy surfaces, gold accents, metallic borders and compact mobile-first cards. Large information areas are collapsible where useful so the application remains practical on smaller screens.

## 🗺️ Roadmap
Planned ideas include:
- Rank change between KvKs.
- Time-aware Flag Filler Registry integration.
- Further mobile hero / keyvisual optimization.
- Additional Kingdom analytics when reliable source data becomes available.

## 🔒 Data & repository scope
This public repository is intended for BattleTrack source code and project documentation only. It should not contain production Google Sheet exports, private governor datasets, access tokens, credentials or other internal Kingdom data.

---

Built for **Kingdom 3903**. ⚔️


## v1.7.4 – OP-042 About BattleTrack
Adds an About BattleTrack panel explaining the purpose, evolution and three core pillars of BattleTrack for Kingdom 3903.
