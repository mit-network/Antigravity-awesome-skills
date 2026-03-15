/**
 * sync-vibes.js — Cloud continuity for vibe presets and recent vibes.
 * Method: GET/POST
 *  - GET:    hydrate vibe definitions from Supabase
 *  - POST:   push local vibe presets/history to Supabase
 *
 * Expected Supabase table: vibes
 * Columns:
 *  - user_id (text, PK part)
 *  - kind (text, PK part)           // "preset" | "recent" | future kinds
 *  - label (text)
 *  - prompt (text, PK part)         // normalized prompt/raw text
 *  - palette (jsonb, nullable)      // normalized palette payload
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
    logTelemetry("sync_disabled", { endpoint: "sync-vibes", origin });
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
      logTelemetry("sync_auth_invalid", { endpoint: "sync-vibes", origin });
      return json(401, { error: "Missing or invalid token" }, origin);
    }

    if (req.method === "GET") {
      const rows = await supabaseRestCall(
        "vibes?select=kind,label,prompt,palette,updated_at&order=updated_at.desc&limit=100",
        "GET",
        null,
        user.token
      );

      if (!rows || rows.length === 0) {
        logTelemetry("sync_vibes_hydrate_empty", { endpoint: "sync-vibes", origin });
        return json(200, { hasData: false, items: [] }, origin);
      }

      const items = rows.map((r) => ({
        kind: r.kind || "recent",
        label: r.label || "",
        prompt: r.prompt || "",
        palette: r.palette || null,
        updatedAt: r.updated_at || null
      }));

      logTelemetry("sync_vibes_hydrate_success", {
        endpoint: "sync-vibes",
        origin,
        count: items.length
      });

      return json(200, { hasData: items.length > 0, items }, origin);
    }

    // POST: push local vibes to cloud
    const body = await req.json();
    const vibes = Array.isArray(body.vibes) ? body.vibes : [];
    if (!Array.isArray(vibes)) {
      return json(400, { error: "Invalid payload format" }, origin);
    }

    // Keep payload intentionally small and future-friendly.
    const nowIso = new Date().toISOString();
    const payload = vibes
      .slice(0, 100)
      .filter((v) => v && typeof v.prompt === "string" && v.prompt.trim().length > 0)
      .map((v) => ({
        user_id: user.uid,
        kind: v.kind || "recent",
        label: v.label || "",
        prompt: v.prompt.trim(),
        palette: v.palette || null,
        updated_at: v.updatedAt || nowIso,
        _upsert: true
      }));

    if (payload.length > 0) {
      await supabaseRestCall(
        "vibes?on_conflict=user_id,kind,prompt",
        "POST",
        payload,
        user.token
      );
    }

    logTelemetry("sync_vibes_success", {
      endpoint: "sync-vibes",
      origin,
      synced: payload.length
    });

    return json(200, { synced: payload.length }, origin);
  } catch (err) {
    logTelemetry("sync_vibes_error", {
      endpoint: "sync-vibes",
      origin,
      error: err.message
    });
    return json(500, { error: err.message }, origin);
  }
}

