# Cloudflare Migration

## Baseline
- Apps Script reference: v1.12.2b
- GitHub baseline commit: e01d5bb
- Apps Script remains untouched under `apps-script/` during migration.

## Current Cloudflare stage
CF-003 / CF-004 preparation:
- `public/` contains a static extraction of the current BattleTrack UI.
- `src/index.js` is the Worker entry point.
- `/api/health` is available for deployment verification.
- Other `/api/*` endpoints intentionally return HTTP 501 until migrated.
- Existing frontend data actions still contain `google.script.run` and therefore are NOT expected to work on Cloudflare yet.

## Deployment model
- Static assets are served from `public/`.
- Only `/api/*` runs through the Worker first.
- SPA fallback returns `index.html` for unknown frontend routes.
- Secrets must be configured as Cloudflare secrets/bindings, never committed.

## GitHub / Cloudflare import
Use repository root as the Worker root directory. Wrangler configuration is already committed, so Cloudflare should use it instead of generating framework configuration.

Deploy command: `npx wrangler deploy`
Build command: none required for this migration stage.

Important: the Cloudflare Worker project name must match `rok-battletrack` from `wrangler.jsonc`.
