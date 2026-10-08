# CF-014.6 — GitHub source checkpoint (2026-10-08)

## Purpose
Capture the currently tested Cloudflare migration source **before CF-015**. This is a source-code restore point, not a backup of Google Sheets, Google Drive archives, Apps Script deployments, Cloudflare secrets or live data.

## Verified in user-led tests
- Public Governor Lookup and Kingdom Rankings through Cloudflare (CF-009–011).
- Discord OAuth Officer + Data role protection; unauthenticated Leadership API request denied.
- Signed read-only KvK bridge: 3 historical KvKs, 16 story variants, next ID `3903-KVK5`.
- CF-014.2 KvK and story selectors.
- CF-014.3–014.4 local-only Create → Active → Close simulation; API rechecked with next ID and count unchanged.
- CF-014.5.1 native Leadership selector preview, without purple review blocks.
- CF-014.6 KvK selection context reflected in Management, Current KvK Overview and Comparison & Export preview cards.

## Not yet verified or migrated
- Actual Cloudflare Leadership Comparison & CSV, Governor Overview, Kingdom Scan import/archive/integrity, Create/Close writes.
- Full security audit, mobile regression, production cutover and old-login retirement.
- The original Apps Script Leadership login is retained; its current login issue remains to diagnose separately.

## Immutable ID safety
`3903-KVK5` is reserved for the next **real** KvK. Never create a production test KvK or consume its number. All administrative simulations stay local and must not write to Sheets or increment counters.

## Create the GitHub checkpoint
1. Replace only `README.md` and add this documentation file; commit/push with GitHub Desktop.
2. In GitHub, create an annotated release/tag on **the exact documentation commit**. Suggested tag: `cf-014.6-checkpoint-20261008` (only if it does not already exist). Title: `CF-014.6 — Pre-CF-015 Cloudflare checkpoint`.
3. Mark as **pre-release**, not a stable production release. Do not move or reuse the tag.
4. Confirm the release/tag points to the intended commit and GitHub Desktop shows no pending changes.
5. For broader disaster recovery, retain separate secure backups of Apps Script deployment/source, Sheets/Drive data and secret configuration (never commit secrets).

## Rollback scope
A GitHub tag restores the repository code at the tagged commit; it does **not** restore external data, secrets, deployments or cloud state. Reverting/deploying an older commit should be planned and tested separately.
