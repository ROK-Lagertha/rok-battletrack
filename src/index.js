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

// CF-014.1: signed, read-only Apps Script bridge. No admin token in browser.
async function leadershipManagement(env) {
  const secret = String(env.BT_BRIDGE_SECRET || "");
  if (secret.length < 32) throw new Error("Bridge secret missing or too short");
  const base = getAppsScriptApiUrl(env);
  if (!base) throw new Error("Apps Script URL missing");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const action = "kvkManagement";
  const message = `${timestamp}\n${nonce}\n${action}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)))).map(x => x.toString(16).padStart(2,"0")).join("");
  const target = new URL(base);
  for (const [k,v] of Object.entries({ bridge: "1", action, timestamp, nonce, signature })) target.searchParams.set(k,v);
  const response = await fetch(target.toString(), { method: "GET", headers: { accept: "application/json" }, redirect: "follow" });
  const payload = await response.json();
  if (!response.ok || !payload?.ok) throw new Error("Bridge upstream rejected request");
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

    // CF-012.1: read-only leadership gateway pilot. Authorization is checked
    // server-side on every request; no legacy Apps Script admin APIs are exposed.
    if (url.pathname === "/api/v1/leadership/kvks") {
      if (request.method !== "GET") return apiError(405, "METHOD_NOT_ALLOWED", "GET required.");
      try {
        const auth = await discordAuth(request, env, "/api/auth/discord/me");
        if (!auth.ok) return apiError(auth.status === 401 ? 401 : 403, "LEADERSHIP_ACCESS_DENIED", "Valid Discord Officer and Data roles are required.");
        // Pilot uses already-public season catalog. True admin-only KvK data
        // must be migrated separately with an authenticated upstream bridge.
        const source = await leadershipManagement(env);
        return json({ ok: true, access: "leadership", source: "signed_kvk_management", data: source });
      } catch (error) {
        console.error("Leadership pilot failed", error);
        return apiError(503, "LEADERSHIP_SOURCE_UNAVAILABLE", "Leadership read source temporarily unavailable.");
      }
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
