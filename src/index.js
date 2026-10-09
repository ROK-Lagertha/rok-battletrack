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
async function leadershipManagement(env, action = "kvkManagement", kvkId = "") {
  const secret = String(env.BT_BRIDGE_SECRET || "");
  if (secret.length < 32) throw new Error("Bridge secret missing or too short");
  const base = getAppsScriptApiUrl(env);
  if (!base) throw new Error("Apps Script URL missing");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const message = `${timestamp}\n${nonce}\n${action}${action === "kvkComparison" ? `\n${kvkId}` : ""}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)))).map(x => x.toString(16).padStart(2,"0")).join("");
  const target = new URL(base);
  for (const [k,v] of Object.entries({ bridge: "1", action, timestamp, nonce, signature, ...(kvkId ? {kvkId} : {}) })) target.searchParams.set(k,v);
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

    // CF-CUTOVER-01: leadership landing, server-side Discord Officer + Data gate.
    // The public landing page is intentionally not a second login screen.
    if (url.pathname === "/leadership" || url.pathname === "/leadership/") {
      if (request.method !== "GET" && request.method !== "HEAD") return apiError(405, "METHOD_NOT_ALLOWED", "GET or HEAD required.");
      try {
        const check = await discordAuth(request, env, "/api/auth/discord/me");
        if (!check.ok) {
          // Only an absent/expired session may start OAuth. A forbidden session
          // must not trigger another login, otherwise callback -> leadership
          // -> login -> callback can loop indefinitely.
          if (check.status === 401) {
            // After OAuth callback, a missing/invalid session must be visible,
            // not trigger an endless callback -> leadership -> login cycle.
            if (url.searchParams.get("discord_return") === "1") {
              const cookieHeader = request.headers.get("cookie") || "";
              const sessionCookieReceived = /(?:^|;\s*)__Host-bt_discord=/.test(cookieHeader);
              const diagnostic = sessionCookieReceived
                ? "The session cookie reached BattleTrack, but its contents could not be validated (invalid or expired session)."
                : "The browser did not send the BattleTrack session cookie with this request.";
              return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BattleTrack · Session diagnostic</title><body style="background:#0a1421;color:#f1f5f9;font:16px system-ui;max-width:760px;margin:8vh auto;padding:24px"><h1 style="color:#f3c36b">Discord login completed — session not recognized</h1><p>${diagnostic}</p><p>Automatic login redirects have been stopped to protect against a redirect loop. No KvK data or permissions were changed.</p><p style="color:#a8bfd0">Diagnostic code: ${sessionCookieReceived ? "SESSION_VALIDATION_FAILED" : "SESSION_COOKIE_NOT_RECEIVED"}</p><a style="color:#f3c36b" href="/api/auth/discord/login">Retry Discord login</a></body></html>`, {status:401,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
            }
            return Response.redirect(new URL("/api/auth/discord/login", request.url), 302);
          }
          return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BattleTrack · Leadership access</title><body style="background:#0a1421;color:#f1f5f9;font:16px system-ui;max-width:760px;margin:8vh auto;padding:24px"><h1 style="color:#f3c36b">Leadership authorization needs attention</h1><p>Discord sign-in completed, but your Officer + Data roles could not be verified for this session. The application has stopped automatic redirects to avoid a login loop.</p><p>Use the button below to clear only the BattleTrack session and try again.</p><form method="post" action="/api/auth/discord/logout"><button style="padding:12px 20px;border:1px solid #f3c36b;border-radius:8px;background:#142333;color:#f3c36b">Reset BattleTrack session</button></form></body></html>`,{status:403,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
        }
        const assetUrl = new URL("/leadership.html", request.url);
        const response = await env.ASSETS.fetch(new Request(assetUrl, request));
        const headers = new Headers(response.headers);
        headers.set("cache-control", "private, no-store");
        headers.set("x-content-type-options", "nosniff");
        return new Response(response.body, { status: response.status, headers });
      } catch (error) {
        console.error("Leadership page authentication failed", error);
        return apiError(503, "LEADERSHIP_AUTH_UNAVAILABLE", "Discord authorization temporarily unavailable.");
      }
    }
    // Deny direct asset access; use /leadership which checks roles first.
    if (url.pathname === "/leadership.html") return apiError(403, "LEADERSHIP_ACCESS_REQUIRED", "Use /leadership.");

    // CF-012.1: read-only leadership gateway pilot. Authorization is checked
    // server-side on every request; no legacy Apps Script admin APIs are exposed.
    // CF-015.1: protected, uncached, read-only comparison of an existing KvK.
    const comparisonMatch = url.pathname.match(/^\/api\/v1\/leadership\/comparisons\/([^/]+)$/);
    if (comparisonMatch) {
      if (request.method !== "GET") return apiError(405, "METHOD_NOT_ALLOWED", "GET required.");
      const kvkId = decodeURIComponent(comparisonMatch[1]);
      if (!/^3903-KVK[1-9][0-9]{0,5}$/.test(kvkId)) return apiError(400, "INVALID_KVK", "Invalid KvK ID.");
      try {
        const auth = await discordAuth(request, env, "/api/auth/discord/me");
        if (!auth.ok) return apiError(auth.status === 401 ? 401 : 403, "LEADERSHIP_ACCESS_DENIED", "Valid Discord Officer and Data roles are required.");
        const data = await leadershipManagement(env, "kvkComparison", kvkId);
        if (!data.ok) return json({ok:false,code:data.code||"COMPARISON_UNAVAILABLE",message:data.message||"Comparison unavailable."},{status:data.code==="KVK_NOT_FOUND"?404:503});
        return json({ok:true,access:"leadership",source:"signed_kvk_comparison",data});
      } catch (error) {
        console.error("Leadership comparison failed", error);
        return apiError(503, "COMPARISON_SOURCE_UNAVAILABLE", "Leadership comparison temporarily unavailable.");
      }
    }

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
