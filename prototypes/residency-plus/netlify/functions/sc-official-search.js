/**
 * sc-official-search.js — Protected SoundCloud search via official OAuth API.
 *
 * Endpoints: GET /.netlify/functions/sc-official-search
 * Params:
 *   q      (required) — search query
 *   limit  (optional, default 10, max 20)
 *
 * Security:
 *   - Validates Origin against allowlist before processing
 *   - Enforces per-origin rate limiting
 *   - Uses Bearer token (never logged, never in response)
 *   - Returns only safe-shaped fields; never proxies raw upstream
 */

import { getAccessToken, allowOrigin, checkRateLimit, json, logTelemetry } from "./sc-auth-lib.js";
import fs from "node:fs";
import path from "node:path";

const _SAFE_FIELDS = [
    "id", "title", "permalink_url", "genre", "artwork_url",
    // Engagement context for digging decisions (public counts, not credentials)
    "playback_count", "favoritings_count", "comment_count",
    // Duration + upload date for kind classification and display
    "duration", "created_at",
    // BPM (optional, not always present)
    "bpm",
];

function shapeTrack(raw) {
    if (!raw || typeof raw !== "object") return null;
    const out = {};
    for (const f of _SAFE_FIELDS) out[f] = raw[f] ?? null;
    out.username = raw.user?.username ?? raw.username ?? null;
    // Artist page URL (public permalink — safe to expose)
    out.user_permalink_url = raw.user?.permalink_url ?? null;
    return out;
}

export default async function handler(req) {
    const startMs = Date.now();

    if (process.env.DEV_FIXTURE_MODE === "true") {
        try {
            const fixturePath = path.resolve(process.cwd(), "netlify/functions/fixtures/search-ambient.json");
            const raw = fs.readFileSync(fixturePath, "utf8");
            const data = JSON.parse(raw);
            return json(200, { collection: data.map(shapeTrack).filter(Boolean) }, "*");
        } catch (e) {
            return json(500, { error: "Fixture mode enabled but fixture file missing.", detail: e.message });
        }
    }

    // OPTIONS preflight
    if (req.method === "OPTIONS") {
        const origin = req.headers.get("origin");
        const allowed = allowOrigin(origin);
        if (!allowed) return new Response("", { status: 204 });
        return new Response("", {
            status: 204,
            headers: {
                "access-control-allow-origin": allowed,
                "access-control-allow-headers": "content-type",
                "access-control-allow-methods": "GET,OPTIONS",
                "vary": "Origin",
            },
        });
    }

    const origin = req.headers.get("origin");
    logTelemetry("sc_search_request", { endpoint: "sc-official-search", origin });

    // Origin check
    const allowed = allowOrigin(origin);
    // Allow requests with no Origin header (direct curl / server-to-server) in dev
    if (origin && !allowed) {
        const status_code = 403;
        logTelemetry("origin_forbidden", { endpoint: "sc-official-search", origin, status_code, duration_ms: Date.now() - startMs });
        return json(status_code, { error: "Origin not permitted." });
    }

    // Rate limit by origin (or "no-origin" for direct requests)
    const rlKey = allowed || "no-origin";
    const rl = checkRateLimit(rlKey);
    if (!rl.ok) {
        const status_code = 429;
        logTelemetry("rate_limit_block", { endpoint: "sc-official-search", origin: allowed, status_code, duration_ms: Date.now() - startMs });
        return json(status_code, { error: "Rate limit exceeded. Try again later.", retryAfter: rl.retryAfter }, allowed);
    }

    // Params
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10)));
    const query_length = q.length;

    if (!q) {
        const status_code = 400;
        logTelemetry("sc_search_error", { endpoint: "sc-official-search", origin: allowed, status_code, query_length, duration_ms: Date.now() - startMs });
        return json(status_code, { error: "Missing required param: q" }, allowed);
    }

    // Fetch token (cached in memory — never logged)
    let token;
    try {
        token = await getAccessToken();
    } catch (err) {
        const status_code = 400;
        logTelemetry("sc_search_error", { endpoint: "sc-official-search", origin: allowed, status_code, query_length, duration_ms: Date.now() - startMs });
        return json(status_code, { error: err.message }, allowed);
    }

    // Call official API
    const apiUrl = new URL("https://api.soundcloud.com/tracks");
    apiUrl.searchParams.set("q", q);
    apiUrl.searchParams.set("limit", String(limit));

    let upstream;
    try {
        upstream = await fetch(apiUrl.toString(), {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json; charset=utf-8",
            },
        });
    } catch {
        const status_code = 502;
        logTelemetry("sc_search_error", { endpoint: "sc-official-search", origin: allowed, status_code, query_length, duration_ms: Date.now() - startMs });
        return json(status_code, { error: "Upstream request failed — network error." }, allowed);
    }

    if (upstream.status === 429) {
        logTelemetry("upstream_429", { endpoint: "sc-official-search", origin: allowed, status_code: 429, query_length, upstream_status: 429, duration_ms: Date.now() - startMs });
        return json(429, { error: "Upstream rate limit. Try again later." }, allowed);
    }
    if (!upstream.ok) {
        const status_code = 502;
        logTelemetry("sc_search_error", { endpoint: "sc-official-search", origin: allowed, status_code, query_length, upstream_status: upstream.status, duration_ms: Date.now() - startMs });
        return json(status_code, { error: `Upstream error (HTTP ${upstream.status}).` }, allowed);
    }

    let data;
    try {
        data = await upstream.json();
    } catch {
        const status_code = 502;
        logTelemetry("sc_search_error", { endpoint: "sc-official-search", origin: allowed, status_code, query_length, upstream_status: upstream.status, duration_ms: Date.now() - startMs });
        return json(status_code, { error: "Upstream returned invalid JSON." }, allowed);
    }

    // data may be an array or { collection: [] }
    const collection = Array.isArray(data) ? data : (data.collection ?? []);
    const shaped = collection.map(shapeTrack).filter(Boolean);

    logTelemetry("sc_search_success", { endpoint: "sc-official-search", origin: allowed, status_code: 200, query_length, upstream_status: 200, duration_ms: Date.now() - startMs });
    return json(200, { collection: shaped }, allowed);
}
