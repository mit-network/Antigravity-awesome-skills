/**
 * sync-sessions.js — Cloud continuity for saved dig sessions.
 * Method: GET/POST
 *  - GET:    hydrate saved dig sessions from Supabase
 *  - POST:   push local saved sessions to Supabase
 *
 * Expected Supabase table: sessions
 * Columns:
 *  - user_id (text, PK part)
 *  - session_id (text, PK part)
 *  - label (text)
 *  - prompt (text)
 *  - bucket (text)
 *  - source (text)
 *  - palette (jsonb, nullable)
 *  - top (jsonb, nullable)          // compact snapshot of top results
 *  - updated_at (timestamptz)
 */
import { allowOrigin, json, logTelemetry } from "./lib/sc-auth-lib.js";
import { getJwtUser, supabaseRestCall } from "./sc-supabase-lib.js";

const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    const origin = allowOrigin(req.headers.get("origin"));
    return new Response("", {
      status: 204,
      headers: {
        "access-control-allow-origin": origin || "*",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-allow-methods": "GET,POST,OPTIONS"
      }
    });
  }

  const origin = allowOrigin(req.headers.get("origin"));
  if (!AUTH_ENABLED) {
    logTelemetry("sync_sessions_disabled", { endpoint: "sync-sessions", origin });
    return json(200, { auth_enabled: false }, origin);
  }
  if (!origin && req.headers.get("origin")) {
    return json(403, { error: "Origin not permitted." });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { error: "Method not allowed" }, origin);
  }

  try {
    const user = getJwtUser(req);
    if (!user) {
      logTelemetry("sync_sessions_auth_invalid", { endpoint: "sync-sessions", origin });
      return json(401, { error: "Missing or invalid token" }, origin);
    }

    if (req.method === "GET") {
      const rows = await supabaseRestCall(
        "sessions?select=session_id,label,prompt,bucket,source,palette,top,updated_at,created_at&order=updated_at.desc&limit=50",
        "GET",
        null,
        user.token
      );

      if (!rows || rows.length === 0) {
        logTelemetry("sync_sessions_hydrate_empty", { endpoint: "sync-sessions", origin });
        return json(200, { hasData: false, items: [] }, origin);
      }

      const items = rows.map((r) => ({
        id: r.session_id,
        label: r.label || "",
        prompt: r.prompt || "",
        bucket: r.bucket || "all",
        source: r.source || "both",
        palette: r.palette || null,
        top: Array.isArray(r.top) ? r.top : [],
        updatedAt: r.updated_at || null,
        createdAt: r.created_at || r.updated_at || null
      }));

      logTelemetry("sync_sessions_hydrate_success", {
        endpoint: "sync-sessions",
        origin,
        count: items.length
      });

      return json(200, { hasData: items.length > 0, items }, origin);
    }

    const body = await req.json();
    const sessions = Array.isArray(body.sessions) ? body.sessions : [];
    if (!Array.isArray(sessions)) {
      return json(400, { error: "Invalid payload format" }, origin);
    }

    const nowIso = new Date().toISOString();
    const payload = sessions
      .slice(0, 50)
      .filter((s) => s && typeof s.id === "string" && s.id.trim().length > 0 && typeof s.prompt === "string")
      .map((s) => ({
        user_id: user.uid,
        session_id: s.id.trim(),
        label: s.label || "",
        prompt: s.prompt || "",
        bucket: s.bucket || "all",
        source: s.source || "both",
        palette: s.palette || null,
        top: Array.isArray(s.top) ? s.top : [],
        updated_at: s.updatedAt || nowIso,
        _upsert: true
      }));

    if (payload.length > 0) {
      await supabaseRestCall(
        "sessions?on_conflict=user_id,session_id",
        "POST",
        payload,
        user.token
      );
    }

    logTelemetry("sync_sessions_success", {
      endpoint: "sync-sessions",
      origin,
      synced: payload.length
    });

    return json(200, { synced: payload.length }, origin);
  } catch (err) {
    logTelemetry("sync_sessions_error", {
      endpoint: "sync-sessions",
      origin,
      error: err.message
    });
    return json(500, { error: err.message }, origin);
  }
}

