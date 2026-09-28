# Changelog

## v1.11.4 — Controlled Kingdom Scan Import & Drive Authorization
- Completed OP-048 Kingdom Scan Upload & Validation.
- Completed OP-049 Kingdom Scan Archive & Import Protocol.
- Completed OP-054 scan assignment to KvK and START / MIDDLE / END snapshot type.
- Added server-side XLSX ZIP/XML parsing and validation without external CDN dependencies.
- Added zero-cell handling for HeroScrolls numeric battle fields.
- Added raw `Kingdom Snapshots` storage and `Scan Imports` audit logging.
- Added SHA-256 source-file fingerprinting and duplicate-import protection.
- Added unchanged original-XLSX archival to a configured Google Drive folder before snapshot commit.
- Added explicit Google Drive OAuth scope handling and WebApp authorization flow.
- Preserved `KvK Results` during raw snapshot import.
- Production validation: KvK4 / MIDDLE imported successfully with 214 governors; archive and audit status `COMPLETED`.
- Added OP-060 as the next planned post-import Snapshot Integrity Check.

## v1.11.1b — HeroScrolls XLSX Validation Hotfix
- Fixed HeroScrolls zero-value numeric cells that may be represented as empty/self-closing XLSX cells.
- Confirmed server validation against a real 216-governor scan with 216 unique IDs and valid battle fields.

## v1.10.0d — Leadership Comparison & CSV Export
- Completed OP-051 Leadership Comparison & Export.
- Dynamic KvK selection via OP-055.
- Historical mode uses START → END; active mode uses START → LATEST.
- Live-tested KvK2 comparison with 656 governors and KvK3 CSV export with 794 governors.

## v1.9.3 — 50-Day Planned End Automation
- Planned KvK end date is automatically calculated as Start + 50 days.
- The calculated end date remains editable before creation.
- Backend fallback also calculates Start + 50 when no end date is supplied.
- BattleTrack does not automatically close a KvK after 50 days.
- Actual KvK close/result workflow remains a separate roadmap item.

## v1.9.2 — OP-053 KvK Management
- Added Leadership KvK Management modal.
- Added automatic next KvK Number and `3903-KVK<n>` ID generation.
- Added Story Catalog loading from the `KvK Stories` sheet.
- Added data-driven Season name preview.
- Added explicit confirmation before creating a new KvK.
- `KvKs` remains the single source of truth for seasons.

## v1.9.1 — OP-048 Kingdom Scan Safe Preview
- Added Leadership Kingdom Scan upload/preview surface.
- Added local structural validation and preview feedback.
- Preview performs no database or Drive write.
- Provides the safe foundation for a later controlled START / MIDDLE / END import flow.

## v1.9.0 — OP-047 Leadership Admin Center Foundation
- Added protected Admin navigation and Leadership Command Center.
- Added server-side Admin login backed by Apps Script Script Properties.
- Added short-lived Admin sessions via Apps Script cache.
- Added logout and session validation.
- Preserved separation between public player features and Leadership-only tools.

## v1.7.4 – OP-042 About BattleTrack
- Added ABOUT BATTLETRACK action and responsive About panel.
- Added concise project story plus Track / Understand / Compare pillars.
- Preserved v1.7.2.1 ranking performance cache and existing backend behavior.

# Changelog

## v1.7.3 — OP-043 How It Works
- Added a mobile-first five-step BattleTrack Journey: Governor ID → Battle Profile → Requirements → Kingdom Ranking → Battle Archive.
- Added a Data Source note clarifying that BattleTrack uses prepared Kingdom 3903 tracking data and does not read a player’s RoK account directly.
- Preserved the v1.7.2.1 ranking performance cache and backend behavior.

## v1.7.2 — OP-040 Player FAQ
- Added the Player FAQ help panel.
- Added explanations for BattleTrack data, classifications, requirements, statuses, ranking metrics, ties, Top-%, ranking population, historical classification and Rolling-3 behavior.

## v1.7.2.1 — OP-040 Player FAQ UI Hotfix
- Changed the Player FAQ to a single-open accordion.
- Opening a new question automatically closes the previously open question.
- The currently open question can still be closed by tapping it again.

## v1.7.1.2 — Full Ranking Performance Hotfix
- Precomputes and caches all Season/metric ranking views immediately after the ranking payload loads.
- Metric switches reuse cached markup and no longer repeat sorting/rank calculation.
- Preserves ranking table scroll position during DKP/KPR/KP/KILLS switching.
- Avoids redundant rerender when the already-active metric is selected.

## v1.7.1.1 — OP-041 Ranking Metrics Explanation / UI Hotfix
- Added contextual metric explanations to personal and Full Kingdom Ranking.
- Added explanations for DKP, KPR, KP and KILLS, including formulas where applicable.
- Added mobile-friendly tap / desktop click behavior.
- UI hotfix changed the information control to a compact circular gold button.

## v1.7.0 — OP-045 Kingdom KvK Progress & Trends
- Added Kingdom-wide season-to-season trend visualization.
- Added trend views for Total KP, Total Kills, Total Deads and Tracked Governors.
- Added percentage change compared with the previous displayed KvK.
- Established the permanent **Rolling-3 rule**: only the latest three KvKs are compared at once.
- Positive/negative change styling represents increase/decrease and is not automatically a performance judgment.

## v1.6.0.1 — OP-044 Kingdom KvK Statistics Dashboard / Hotfix
- Added the Kingdom KvK Statistics dashboard.
- Added historical Season selection.
- Added aggregated Total KP, Total Kills (T4 + T5), Total Deads and Tracked Governors.
- Aggregations are calculated from BattleTrack `KvK Results` data.
- RSS statistics remain deferred until a reliable data source is available.
- v1.6.0.1 fixed the stylesheet/template structure from the initial v1.6.0 build.

## v1.5.0.1 — OP-039 Full Kingdom Ranking / Performance Hotfix
- Added the complete Kingdom Ranking with historical KvK / Season selection.
- Added full-list switching between DKP, KPR, KP and KILLS.
- Reused the same tie and ranking rules as the personal Kingdom Ranking.
- Added a mobile-friendly scrollable full-ranking view.
- Performance hotfix: each Season dataset is loaded once, then ranking categories are sorted and cached client-side.
- Eliminated repeated backend loading when switching DKP, KPR, KP and KILLS.

## v1.5.0 — OP-039 Full Kingdom Ranking
- Introduced the standalone Full Kingdom Ranking.
- Added historical Season selection and complete governor ranking lists.
- Added DKP, KPR, KP and KILLS category switching.

## v1.4.4.1 — OP-038 Collapsible Ranking Panel
- Added a mobile-friendly collapsible Kingdom Ranking panel.
- Ranking is collapsed by default and expands on demand.
- Preserved the existing ranking features and styling.

## v1.4.3 — OP-033 Ranking Neighborhood
- Added dynamic nearby ranking positions around the current governor.
- Displays up to three governors above and three below.

## v1.4.2 — OP-032 Personal Rank & Top-% Position
- Added personal Kingdom rank.
- Added Ahead-of percentile position using strictly lower values.

## v1.4.1.3 — OP-034 Ranking Categories
- Added DKP, KPR, KP and KILLS ranking categories.
- Added percentage display for KPR.
- Finalized Current Season information order: Stats → Requirements → Kingdom Ranking.

## v1.4.0 — OP-031 DKP Kingdom Ranking
- Introduced the personal Kingdom DKP Ranking.

## v1.3.2 — OP-030 Battle Archive UX
- Added single-open archive accordion behavior.
- Prioritized the latest three KvKs with older history available on demand.
- Added achieved/target and remaining/completed requirement information.

## v1.3.0 — OP-027 / OP-029 Governor Profile & Battle Archive
- Added the Governor Battle Profile.
- Added interactive historical KvK archive.
