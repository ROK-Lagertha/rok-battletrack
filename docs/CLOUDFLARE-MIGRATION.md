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

### CF-012 – Discord OAuth2 authentication (test phase)
- Endpoints: `/api/auth/discord/login`, `/api/auth/discord/callback`, `/api/auth/discord/me`, `/api/auth/discord/logout`.
- Both Officer and Data guild roles are required, checked with `guilds.members.read` on every `/me` request. Session is AES-GCM encrypted in a Secure HttpOnly SameSite=Lax cookie, max 60 minutes. OAuth state is short-lived and authenticated.
- A `DISCORD LOGIN · TEST` link is visible in the main navigation. It tests login but **does not unlock any legacy Admin functions**. Existing Apps Script login is unchanged.
- Required production secrets: `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`. OAuth redirect: `https://rok-battletrack.jici1203.workers.dev/api/auth/discord/callback`.
- Verify authorized user, one-role user, non-member, state replay/expiry, logout. Admin APIs require a later secured migration.

### CF-012.1 – Secure Leadership API (read-only pilot)
- `GET /api/v1/leadership/kvks`: Discord Officer **AND** Data required, verified server-side on every request via existing Discord OAuth session.
- 401 without a valid session, 403 for revoked/missing roles, 405 for non-GET requests. No shared caching.
- Pilot response contains **existing public ranking metadata** only (`source: public_ranking_metadata`), not the legacy admin KvK list. This deliberately tests authorization without opening any privileged Apps Script API.
- Next: design and migrate a separately authenticated server-to-server bridge for actual admin-only KvK reads, then write endpoints. Do not expose existing Apps Script admin operations through a public GET action.
