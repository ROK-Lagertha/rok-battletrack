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


// CF-013.12: Public, read-only Kingdom Stats, served from the existing GAS database.
async function kingdomStats(request, env) {
  const cache = caches.default;
  const key = new Request(new URL("/__cache/api/v1/kingdom/stats", request.url), { method: "GET" });
  const cached = await cache.match(key);
  if (cached) return cached;
  const payload = await fetchAppsScriptJson(env, { action: "kingdomStats" });
  const response = json(payload, { headers: { "cache-control": "public, max-age=60, s-maxage=300" } });
  if (payload?.success) await cache.put(key, response.clone());
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
        // Cloudflare Workers static assets canonicalize /leadership.html to
        // /leadership with HTTP 307. Fetch the canonical asset URL instead:
        // ASSETS.fetch is a binding call, so it does not re-enter this Worker.
        const assetUrl = new URL("/leadership", request.url);
        const assetRequest = new Request(assetUrl, {
          method: request.method,
          headers: { accept: "text/html" },
          redirect: "manual",
        });
        const response = await env.ASSETS.fetch(assetRequest);
        // Never pass a static-assets redirect back to the browser: that would
        // send /leadership back to itself and cause ERR_TOO_MANY_REDIRECTS.
        if (response.status >= 300 && response.status < 400) {
          console.error("Leadership asset unexpectedly redirected", response.status, response.headers.get("location"));
          return apiError(502, "LEADERSHIP_ASSET_REDIRECT", "Leadership asset returned an unexpected redirect.");
        }
        if (!response.ok) {
          return apiError(502, "LEADERSHIP_ASSET_UNAVAILABLE", "Leadership asset could not be loaded.");
        }
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

    // CF-014.2 Phase A: production CREATE route is intentionally hard-gated.
    // This guard executes before any upstream request and cannot write a KvK.
    // A real signed, audited and idempotent GAS write implementation is required
    // before a separate, explicitly approved production activation.
    if (url.pathname === "/api/v1/leadership/kvks/create") {
      if (request.method !== "POST") return apiError(405, "METHOD_NOT_ALLOWED", "POST required.");
      try {
        const sessionCheck = new Request(new URL("/api/auth/discord/me", request.url), {
          method: "GET", headers: { cookie: request.headers.get("cookie") || "" }
        });
        const auth = await discordAuth(sessionCheck, env, "/api/auth/discord/me");
        if (!auth.ok) return apiError(auth.status === 401 ? 401 : 403,
          "LEADERSHIP_ACCESS_DENIED", "Discord Officer and Data roles are required.");
      } catch (error) {
        console.error("KvK CREATE auth failed", error);
        return apiError(503, "LEADERSHIP_AUTH_UNAVAILABLE", "Authorization unavailable.");
      }
      // CF-014.2 Phase B: TWO independent explicit gates. Neither is enabled by this release.
      if (String(env.BT_PRODUCTION_CREATE_ENABLED || "") !== "YES_PRODUCTION_KVK_CREATE")
        return apiError(423, "PRODUCTION_KVK_WRITES_LOCKED", "Production CREATE remains disabled pending separate live approval.");
      const origin = request.headers.get("origin");
      if (origin !== url.origin) return apiError(403, "ORIGIN_DENIED", "Same-origin request required.");
      if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json"))
        return apiError(415, "JSON_REQUIRED", "JSON required.");
      try {
        const body = await request.json();
        if (!body || body.confirm !== "CONFIRM_PRODUCTION_KVK_CREATE")
          return apiError(400, "CONFIRMATION_REQUIRED", "Explicit CREATE confirmation required.");
        const story = String(body.story || "").trim();
        const startDate = String(body.startDate || "");
        const endDate = String(body.endDate || "");
        const requestId = String(body.requestId || "");
        if (!story || story.length > 160 || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
            !/^[a-f0-9-]{36}$/i.test(requestId))
          return apiError(400, "INVALID_CREATE_REQUEST", "Invalid story, dates or request ID.");
        const secret = String(env.BT_BRIDGE_SECRET || "");
        const base = getAppsScriptApiUrl(env);
        if (secret.length < 32 || !base) return apiError(503, "CREATE_BRIDGE_UNAVAILABLE", "Write bridge not configured.");
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = crypto.randomUUID();
        const message = [timestamp, nonce, "CREATE_KVK", requestId, story, startDate, endDate].join("\n");
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
          {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
        const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message))))
          .map(b=>b.toString(16).padStart(2,"0")).join("");
        const upstream = await fetch(base, {
          method:"POST", headers:{"content-type":"application/json"}, redirect:"follow",
          body:JSON.stringify({bridgeWrite:1,action:"CREATE_KVK",timestamp,nonce,requestId,story,startDate,endDate,signature}),
          signal:AbortSignal.timeout(15000)
        });
        const raw = await upstream.text();
        let result; try { result = JSON.parse(raw); } catch { return apiError(502,"CREATE_BRIDGE_BAD_RESPONSE","Unexpected upstream response."); }
        if (!upstream.ok || !result?.ok)
          return apiError(result?.code === "PRODUCTION_WRITES_LOCKED" ? 423 : 409,
            result?.code || "CREATE_REJECTED", result?.message || "Create was not completed.");
        return json({ok:true,mode:"PRODUCTION_CREATE",kvk:result.kvk,requestId,duplicate:!!result.duplicate});
      } catch (error) {
        console.error("Production CREATE bridge unavailable", String(error?.name || "Error"));
        return apiError(503,"CREATE_BRIDGE_UNAVAILABLE","CREATE status uncertain; verify database before retrying with same request ID.");
      }
    }

    // CF-014.4 Phase B1: strict CLOSE contract and tags; permanently non-writing.
    // No upstream write is possible in this phase, irrespective of environment variables.
    if (url.pathname === "/api/v1/leadership/kvks/close") {
      if (request.method !== "POST") return apiError(405, "METHOD_NOT_ALLOWED", "POST required.");
      try {
        const sessionCheck = new Request(new URL("/api/auth/discord/me", request.url), {
          method: "GET", headers: { cookie: request.headers.get("cookie") || "" }
        });
        const auth = await discordAuth(sessionCheck, env, "/api/auth/discord/me");
        if (!auth.ok) return apiError(auth.status === 401 ? 401 : 403,
          "LEADERSHIP_ACCESS_DENIED", "Discord Officer and Data roles are required.");
      } catch (error) {
        console.error("KvK CLOSE auth failed", error);
        return apiError(503, "LEADERSHIP_AUTH_UNAVAILABLE", "Authorization unavailable.");
      }
      // Independent CLOSE gate: never inherits CREATE permission.
      if (String(env.BT_PRODUCTION_CLOSE_ENABLED || "") !== "YES_PRODUCTION_KVK_CLOSE")
        return apiError(423, "PRODUCTION_KVK_CLOSE_LOCKED", "Production CLOSE is disabled.");
      if (request.headers.get("origin") !== url.origin)
        return apiError(403, "ORIGIN_DENIED", "Same-origin request required.");
      if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json"))
        return apiError(415, "JSON_REQUIRED", "JSON required.");
      try {
        const body = await request.json();
        if (body?.confirm !== "CONFIRM_PRODUCTION_KVK_CLOSE")
          return apiError(400, "CONFIRMATION_REQUIRED", "Explicit CLOSE confirmation required.");
        const kvkId = String(body.kvkId || ""), result = String(body.result || "");
        const actualEndDate = String(body.actualEndDate || ""), requestId = String(body.requestId || "");
        const notes = String(body.notes || "");
        const tags = body.tags;
        if (!/^3903-KVK[1-9][0-9]{0,5}$/.test(kvkId) ||
            !["WIN","LOST","MANUAL"].includes(result) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(actualEndDate) ||
            !/^[a-f0-9-]{36}$/i.test(requestId) ||
            !Array.isArray(tags) || tags.length > 4 ||
            tags.some(t => !["WITH_STAR","WITHOUT_STAR","ALLY_SURRENDERED","SURRENDERED"].includes(t)) ||
            new Set(tags).size !== tags.length ||
            (tags.includes("WITH_STAR") && tags.includes("WITHOUT_STAR")) ||
            notes.length > 2000)
          return apiError(400, "INVALID_CLOSE_REQUEST", "Invalid CLOSE payload.");
        const secret = String(env.BT_BRIDGE_SECRET || ""), base = getAppsScriptApiUrl(env);
        if (secret.length < 32 || !base) return apiError(503, "CLOSE_BRIDGE_UNAVAILABLE", "Write bridge not configured.");
        const timestamp = String(Math.floor(Date.now() / 1000)), nonce = crypto.randomUUID();
        const message = [timestamp,nonce,"CLOSE_KVK",requestId,kvkId,result,actualEndDate,JSON.stringify(tags),notes].join("\n");
        const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
          {name:"HMAC",hash:"SHA-256"},false,["sign"]);
        const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message))))
          .map(b=>b.toString(16).padStart(2,"0")).join("");
        const upstream = await fetch(base,{method:"POST",headers:{"content-type":"application/json"},
          redirect:"follow",signal:AbortSignal.timeout(15000),
          body:JSON.stringify({bridgeWrite:1,action:"CLOSE_KVK",timestamp,nonce,requestId,kvkId,result,actualEndDate,tags,notes,signature})});
        let reply; try { reply = await upstream.json(); } catch { return apiError(502,"CLOSE_BRIDGE_BAD_RESPONSE","Unexpected upstream response."); }
        if (!upstream.ok || !reply?.ok)
          return apiError(reply?.code === "PRODUCTION_CLOSE_LOCKED" ? 423 : 409,
            reply?.code || "CLOSE_REJECTED",reply?.message || "Close was not completed.");
        return json({ok:true,mode:"PRODUCTION_CLOSE",kvk:reply.kvk,duplicate:!!reply.duplicate,requestId});
      } catch (error) {
        console.error("Production CLOSE bridge unavailable",String(error?.name || "Error"));
        return apiError(503,"CLOSE_STATUS_UNCERTAIN","Check production audit before retrying with the same request ID.");
      }
    }

    // Read-only contract metadata for the next CLOSE UI/backend release.
    if (url.pathname === "/api/v1/leadership/kvks/close-contract") {
      if (request.method !== "GET") return apiError(405, "METHOD_NOT_ALLOWED", "GET required.");
      try {
        const sessionCheck = new Request(new URL("/api/auth/discord/me", request.url), {
          method: "GET", headers: { cookie: request.headers.get("cookie") || "" }
        });
        const auth = await discordAuth(sessionCheck, env, "/api/auth/discord/me");
        if (!auth.ok) return apiError(auth.status === 401 ? 401 : 403,
          "LEADERSHIP_ACCESS_DENIED", "Discord Officer and Data roles are required.");
      } catch (error) {
        return apiError(503, "LEADERSHIP_AUTH_UNAVAILABLE", "Authorization unavailable.");
      }
      return json({ok:true,stage:"CF-014.4-PHASE-B2",mode:"SIGNED_CLOSE_GATED",writesEnabled:false,
        resultOptions:["WIN","LOST","MANUAL"],
        tagOptions:["WITH_STAR","WITHOUT_STAR","ALLY_SURRENDERED","SURRENDERED"],
        mutuallyExclusiveTagGroups:[["WITH_STAR","WITHOUT_STAR"]],
        multipleTagsAllowed:true,notes:{optional:true,maxLength:2000},
        requiredFields:["kvkId","result","actualEndDate"],
        preservedFields:["End Scan Date"],
        note:"Contract metadata only. Signed CLOSE backend installed; separate Worker and Apps Script gates required for writes."});
    }

    // CF-014.5 Phase A: RE-OPEN contract only. No POST writes are implemented.
    if (url.pathname === "/api/v1/leadership/kvks/reopen-contract") {
      if (request.method !== "GET") return apiError(405, "METHOD_NOT_ALLOWED", "GET required.");
      try {
        const sessionCheck = new Request(new URL("/api/auth/discord/me", request.url), {
          method: "GET", headers: { cookie: request.headers.get("cookie") || "" }
        });
        const auth = await discordAuth(sessionCheck, env, "/api/auth/discord/me");
        if (!auth.ok) return apiError(auth.status === 401 ? 401 : 403,
          "LEADERSHIP_ACCESS_DENIED", "Discord Officer and Data roles are required.");
      } catch (_) {
        return apiError(503, "LEADERSHIP_AUTH_UNAVAILABLE", "Authorization unavailable.");
      }
      return json({
        ok:true,stage:"CF-014.5-PHASE-A",mode:"REOPEN_CONTRACT_ONLY",writesEnabled:false,
        reopenEnabled:false,
        eligibility:{
          statusMustBe:"Closed",
          closeMustBeEarly:true,
          originalPlannedEndField:"End Scan Date",
          dateRule:"current Kingdom calendar date < original planned end date",
          sameKvkId:true,
          preservePlayerStatistics:true,
          preservePreviousClosuresInAudit:true,
          protectedStatuses:["Historical","Completed"]
        },
        requiredFields:["kvkId","reason"],
        futureConfirmation:"Reopen this KVK",
        note:"Read-only contract. No RE-OPEN write endpoint exists; all production RE-OPEN operations remain unavailable."
      });
    }

    if (url.pathname === "/api/v1/leadership/kvks/reopen") {
      if (request.method !== "POST") return apiError(405, "METHOD_NOT_ALLOWED", "POST required.");
      try {
        const sessionCheck = new Request(new URL("/api/auth/discord/me", request.url), {
          method:"GET",headers:{cookie:request.headers.get("cookie")||""}
        });
        const auth=await discordAuth(sessionCheck,env,"/api/auth/discord/me");
        if(!auth.ok)return apiError(auth.status===401?401:403,"LEADERSHIP_ACCESS_DENIED","Discord Officer and Data roles are required.");
      } catch (_) {return apiError(503,"LEADERSHIP_AUTH_UNAVAILABLE","Authorization unavailable.");}
      return apiError(423,"PRODUCTION_KVK_REOPEN_LOCKED","RE-OPEN is not implemented or enabled. No KvK was modified.");
    }

    // CF-013.7: deploy-safe readiness contract for the future KvK write bridge.
    // This endpoint NEVER calls Apps Script and NEVER changes production data.
    if (url.pathname === "/api/v1/leadership/kvks/write-readiness") {
      if (request.method !== "GET") return apiError(405, "METHOD_NOT_ALLOWED", "GET required.");
      try {
        const sessionCheck = new Request(new URL("/api/auth/discord/me", request.url), {
          method: "GET", headers: { cookie: request.headers.get("cookie") || "" }
        });
        const auth = await discordAuth(sessionCheck, env, "/api/auth/discord/me");
        if (!auth.ok) return apiError(auth.status === 401 ? 401 : 403, "LEADERSHIP_ACCESS_DENIED", "Discord Officer and Data roles are required.");
        const createReady = String(env.BT_PRODUCTION_CREATE_ENABLED || "") === "YES_PRODUCTION_KVK_CREATE"
          && String(env.BT_BRIDGE_SECRET || "").length >= 32
          && !!getAppsScriptApiUrl(env);
        return json({
          ok: true,
          stage: "CF-014.4-PHASE-B2",
          mode: "PRODUCTION_CREATE_GATED_CLOSE_LOCKED",
          writesEnabled: createReady,
          createEnabled: createReady,
          closeEnabled: String(env.BT_PRODUCTION_CLOSE_ENABLED || "") === "YES_PRODUCTION_KVK_CLOSE"
            && String(env.BT_BRIDGE_SECRET || "").length >= 32 && !!getAppsScriptApiUrl(env),
          productionWritesAllowed: createReady,
          note: createReady ? "Worker CREATE gate enabled; Apps Script independently validates its own gate." : "Production CREATE disabled in Cloudflare configuration."
        });
      } catch (error) {
        console.error("KvK write readiness auth failed", error);
        return apiError(503, "READINESS_UNAVAILABLE", "Write readiness temporarily unavailable.");
      }
    }

    // CF-013.5.1: authenticated, read-only preflight validation.
    // IMPORTANT: no create/close route is enabled and no upstream write is called.
    if (url.pathname === "/api/v1/leadership/kvks/validate-create" ||
        url.pathname === "/api/v1/leadership/kvks/validate-close") {
      if (request.method !== "POST") return apiError(405, "METHOD_NOT_ALLOWED", "POST required.");
      try {
        const sessionCheck = new Request(new URL("/api/auth/discord/me", request.url), {method:"GET",headers:{cookie:request.headers.get("cookie")||""}});
        const auth = await discordAuth(sessionCheck, env, "/api/auth/discord/me");
        if (!auth.ok) return apiError(auth.status === 401 ? 401 : 403, "LEADERSHIP_ACCESS_DENIED", "Discord Officer and Data roles are required.");
        const type = url.pathname.endsWith("validate-create") ? "create" : "close";
        if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
          return apiError(415, "JSON_REQUIRED", "Content-Type application/json required.");
        }
        if (Number(request.headers.get("content-length") || 0) > 4096) return apiError(413, "PAYLOAD_TOO_LARGE", "Request too large.");
        const raw = await request.text();
        if (raw.length > 4096) return apiError(413, "PAYLOAD_TOO_LARGE", "Request too large.");
        let payload;
        try { payload = JSON.parse(raw); } catch { return apiError(400, "INVALID_JSON", "Invalid JSON payload."); }
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) return apiError(400, "INVALID_PAYLOAD", "Object required.");
        const management = await leadershipManagement(env);
        const kvks = Array.isArray(management.kvks) ? management.kvks : [];
        const isIsoDate = value => {
          if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
          const date = new Date(value + "T00:00:00Z");
          return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
        };
        if (type === "create") {
          const story = String(payload.story || "").trim();
          const stories = Array.isArray(management.stories) ? management.stories : [];
          const validStory = stories.some(item => typeof item === "string" ? item === story :
            (String(item.name || item.story || item.storyName || "").trim() === story &&
             item.active !== false && String(item.active || "").toUpperCase() !== "FALSE"));
          if (!validStory) return apiError(400, "INVALID_STORY", "Story must exist in the active catalog.");
          if (!isIsoDate(payload.startDate) || !isIsoDate(payload.endDate) || payload.endDate < payload.startDate)
            return apiError(400, "INVALID_DATE_RANGE", "Valid start and end dates are required.");
          const derivedNext = Math.max(0,...kvks.map(item => Number(item.number) || Number(String(item.id || "").match(/-KVK(\d+)$/)?.[1]) || 0)) + 1;
          const nextNumber = Math.max(derivedNext, Number(management.nextNumber) || 0);
          const nextKvkId = "3903-KVK" + nextNumber;
          if (!Number.isSafeInteger(nextNumber) || nextNumber < 1 || !/^3903-KVK[1-9]\d*$/.test(nextKvkId))
            return apiError(503, "CATALOG_INCOMPLETE", "Next KvK metadata unavailable.");
          if (kvks.some(item => item.id === nextKvkId)) return apiError(409, "KVK_ALREADY_EXISTS", "KvK ID already exists.");
          return json({ok:true,mode:"VALIDATION_ONLY",writesEnabled:false,kvkId:nextKvkId,number:nextNumber,seasonName:`Season ${nextNumber} - ${story}`,startDate:payload.startDate,endDate:payload.endDate});
        }
        const kvkId = String(payload.kvkId || "");
        const result = String(payload.result || "").toUpperCase();
        if (!/^3903-KVK[1-9]\d*$/.test(kvkId) || !["WIN","LOST","MANUAL"].includes(result) || !isIsoDate(payload.actualEndDate))
          return apiError(400, "INVALID_CLOSE_PAYLOAD", "Valid KvK ID, result and actual end date required.");
        const kvk = kvks.find(item => item.id === kvkId);
        if (!kvk) return apiError(404, "KVK_NOT_FOUND", "KvK does not exist.");
        if (["historical","completed","closed"].includes(String(kvk.status || "").toLowerCase()))
          return apiError(409, "KVK_ALREADY_CLOSED", "Historical KvKs cannot be closed again.");
        if (kvk.startDate && payload.actualEndDate < kvk.startDate)
          return apiError(400, "INVALID_DATE_RANGE", "End date cannot precede start date.");
        return json({ok:true,mode:"VALIDATION_ONLY",writesEnabled:false,kvkId,result,actualEndDate:payload.actualEndDate});
      } catch (error) {
        console.error("KvK validation preflight failed", error);
        return apiError(503, "KVK_VALIDATION_UNAVAILABLE", "Preflight validation temporarily unavailable.");
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

      if (request.method === "GET" && url.pathname === "/api/v1/kingdom/stats") {
        return await kingdomStats(request, env);
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
