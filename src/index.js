import { discordAuth } from "./discord-auth.js";
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) headers.set("content-type", JSON_HEADERS["content-type"]);
  if (!headers.has("cache-control")) headers.set("cache-control", JSON_HEADERS["cache-control"]);
  return new Response(JSON.stringify(data), { ...init, headers });
}

function apiError(status, code, message) {
  return json({ ok: false, code, message }, { status });
}

function getAppsScriptApiUrl(env) {
  const value = String(env.APPS_SCRIPT_API_URL || "").trim();
  return value ? value.replace(/\?+$/, "") : "";
}

async function fetchAppsScriptJson(env, params) {
  const base = getAppsScriptApiUrl(env);
  if (!base) {
    throw new Error("APPS_SCRIPT_API_URL is not configured.");
  }

  const upstream = new URL(base);
  upstream.searchParams.set("api", "1");
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") {
      upstream.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(upstream.toString(), {
    method: "GET",
    headers: { "accept": "application/json" },
    redirect: "follow"
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Apps Script returned a non-JSON response (${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Apps Script request failed (${response.status}).`);
  }
  return payload;
}

async function rankingMeta(request, env) {
  const cache = caches.default;
  const cacheKey = new Request(new URL("/__cache/api/v1/rankings/meta", request.url), { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const payload = await fetchAppsScriptJson(env, { action: "rankingMeta" });
  const response = json(payload, {
    headers: { "cache-control": "public, max-age=60, s-maxage=600" }
  });
  if (payload?.success) await cache.put(cacheKey, response.clone());
  return response;
}

async function rankingSeason(request, env, kvkId) {
  if (!kvkId) return apiError(400, "INVALID_KVK", "KvK ID is required.");

  const cache = caches.default;
  const cacheUrl = new URL(`/__cache/api/v1/rankings/${encodeURIComponent(kvkId)}`, request.url);
  const cacheKey = new Request(cacheUrl, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const payload = await fetchAppsScriptJson(env, {
    action: "rankingSeason",
    kvkId
  });
  const response = json(payload, {
    headers: { "cache-control": "public, max-age=60, s-maxage=600" }
  });
  if (payload?.success) await cache.put(cacheKey, response.clone());
  return response;
}


// CF-010: public, read-only Governor lookup. No shared caching of player profiles.
async function playerLookup(env, governorId) {
  if (!/^\d{1,20}$/.test(governorId)) {
    return apiError(400, "INVALID_ID", "Please enter a valid numeric Governor ID.");
  }
  const payload = await fetchAppsScriptJson(env, { action: "playerLookup", governorId });
  return json(payload);
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/auth/discord/")) {
      try { return await discordAuth(request, env, url.pathname); }
      catch (error) { console.error("Discord OAuth error", error); return apiError(503, "AUTH_UNAVAILABLE", "Discord login temporarily unavailable."); }
    }

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "rok-battletrack",
        stage: "cloudflare-migration",
        baseline: "v1.12.2b"
      });
    }

    try {
      const playerMatch = url.pathname.match(/^\/api\/v1\/players\/([^/]+)$/);
      if (request.method === "GET" && playerMatch) {
        return await playerLookup(env, decodeURIComponent(playerMatch[1]));
      }

      if (request.method === "GET" && url.pathname === "/api/v1/rankings/meta") {
        return await rankingMeta(request, env);
      }

      const rankingMatch = url.pathname.match(/^\/api\/v1\/rankings\/([^/]+)$/);
      if (request.method === "GET" && rankingMatch) {
        return await rankingSeason(request, env, decodeURIComponent(rankingMatch[1]));
      }

      if (url.pathname.startsWith("/api/")) {
        return apiError(501, "NOT_MIGRATED", "API endpoint not migrated yet.");
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("BattleTrack Worker API error", error);
      return apiError(
        503,
        "DATA_SOURCE_UNAVAILABLE",
        "BattleTrack data source is temporarily unavailable."
      );
    }
  }
};
