# Changelog

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
