# Changelog

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
