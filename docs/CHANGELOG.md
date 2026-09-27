# Changelog

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
- Ranking is collapsed by default and expands on demand with a compact header and chevron.
- Preserved the existing gold/dark gradient styling.
- Expanded panel retains DKP, KPR, KP and KILLS tabs, personal rank, Top-% position and Ranking Neighborhood.
- Built without changing the stable ranking JavaScript logic.

## v1.4.3 – OP-033 Ranking Neighborhood
- Added dynamic 3-above / current player / 3-below ranking neighborhood for DKP, KPR, KP and KILLS.
- Neighborhood follows the active ranking tab and highlights the current governor.

## v1.4.2 — OP-032 Personal Rank + Top-% Position
- Added a dynamic “Ahead of X% of Governors” indicator to the Kingdom Ranking card.
- The percentage updates with DKP, KPR, KP and KILLS.
- Ties are handled from the underlying score population: only governors with a strictly lower score count as being behind the player.

## v1.4.1.3 — Stable
- OP-034 completed: interactive Kingdom Ranking category switcher.
- Final category order: **DKP | KPR | KP | KILLS**.
- KPR is displayed as a percentage while preserving the underlying ranking calculation.
- Current Season information hierarchy changed to **Stats → Requirements → Kingdom Ranking**.
- Ranking changes instantly without reloading the governor profile.

## v1.4.1.2
- Ranking switcher compatibility hotfix.
- Preserved v1.4.0 DKP payload fields as fallback.
- Ranking tabs can be restored dynamically if older cached card markup is present.

## v1.4.1
- OP-034: interactive ranking switcher introduced.
- Categories: DKP, KP, KILLS and KPR.
- KILLS = T4 + T5; KPR = KvK Kill Points / Start Power.
- Equal values share the same rank.

## v1.4.0
- OP-031: Kingdom DKP Ranking added to Current Season.
- DKP calculated dynamically from KvK Results.
- Formula: Deads × 10 + T4 × 5 + T5 × 15.
- All governors in each KvK Results population are ranked.
- Equal DKP values share the same rank.
- Ranking payload prepared per KvK for later Top-% and ranking-neighborhood features.

## v1.3.2
- Battle Archive single-open accordion.
- Last 3 KvKs shown by default; older KvKs can be expanded.
- Requirement achieved/target and remaining/completed display.
- Overall Progress alignment hotfix.
