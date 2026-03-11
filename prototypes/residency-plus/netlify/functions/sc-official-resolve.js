/**
 * sc-official-resolve.js — Protected SoundCloud URL resolver via official OAuth API.
 *
 * Endpoint: GET /.netlify/functions/sc-official-resolve
 * Params:
 *   url  (required) — full SoundCloud URL (must begin with https://soundcloud.com)
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

const _SAFE_TRACK_FIELDS = [
    "id", "kind", "title", "permalink_url", "genre", "artwork_url",
    // Engagement context (public counts)
    "playback_count", "favoritings_count", "comment_count",
    // Duration + upload date
    "duration", "created_at",
    // BPM (optional)
    "bpm",
];
const _SAFE_PLAYLIST_FIELDS = ["id", "kind", "title", "permalink_url", "genre", "artwork_url", "track_count", "duration", "created_at"];
const _SAFE_USER_FIELDS = ["id", "kind", "username", "permalink_url", "avatar_url"];

function shapeResource(raw) {
    if (!raw || typeof raw !== "object") return null;
    const kind = raw.kind ?? "unknown";
    let fields;
    if (kind === "playlist") {
        fields = _SAFE_PLAYLIST_FIELDS;
    } else if (kind === "user") {
        fields = _SAFE_USER_FIELDS;
    } else {
        fields = _SAFE_TRACK_FIELDS;
    }
    const out = { kind };
    for (const f of fields) {
        if (f === "kind") continue;
        out[f] = raw[f] ?? null;
    }
    out.username = raw.user?.username ?? raw.username ?? null;
    out.user_permalink_url = raw.user?.permalink_url ?? null;
    return out;
}

export default async function handler(req) {
    const startMs = Date.now();

    if (process.env.DEV_FIXTURE_MODE === "true") {
        try {
            const fixturePath = path.resolve(process.cwd(), "netlify/functions/fixtures/resolve-sample.json");
            const raw = fs.readFileSync(fixturePath, "utf8");
            const data = JSON.parse(raw);
            return json(200, shapeResource(data), "*");
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
    logTelemetry("sc_resolve_request", { endpoint: "sc-official-resolve", origin });

    // Origin check
    const allowed = allowOrigin(origin);
    if (origin && !allowed) {
        const status_code = 403;
        logTelemetry("origin_forbidden", { endpoint: "sc-official-resolve", origin, status_code, duration_ms: Date.now() - startMs });
        return json(status_code, { error: "Origin not permitted." });
    }

    // Rate limit
    const rlKey = allowed || "no-origin";
    const rl = checkRateLimit(rlKey);
    if (!rl.ok) {
        const status_code = 429;
        logTelemetry("rate_limit_block", { endpoint: "sc-official-resolve", origin: allowed, status_code, duration_ms: Date.now() - startMs });
        return json(status_code, { error: "Rate limit exceeded. Try again later.", retryAfter: rl.retryAfter }, allowed);
    }

    // Params
    const reqUrl = new URL(req.url);
    const target = (reqUrl.searchParams.get("url") || "").trim();

    if (!target) {
        const status_code = 400;
        logTelemetry("sc_resolve_error", { endpoint: "sc-official-resolve", origin: allowed, status_code, duration_ms: Date.now() - startMs });
        return json(status_code, { error: "Missing required param: url" }, allowed);
    }
    if (!target.startsWith("https://soundcloud.com")) {
        const status_code = 400;
        // Don't log the raw bad input to avoid ingestion garbage
        logTelemetry("sc_resolve_error", { endpoint: "sc-official-resolve", origin: allowed, status_code, duration_ms: Date.now() - startMs });
        return json(status_code, { error: "param 'url' must begin with https://soundcloud.com" }, allowed);
    }

    // Fetch token
    let token;
    try {
        token = await getAccessToken();
    } catch (err) {
        const status_code = 400;
        logTelemetry("sc_resolve_error", { endpoint: "sc-official-resolve", origin: allowed, status_code, duration_ms: Date.now() - startMs });
        return json(status_code, { error: err.message }, allowed);
    }

    // Call official API
    const apiUrl = new URL("https://api.soundcloud.com/resolve");
    apiUrl.searchParams.set("url", target);

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
        logTelemetry("sc_resolve_error", { endpoint: "sc-official-resolve", origin: allowed, status_code, duration_ms: Date.now() - startMs });
        return json(status_code, { error: "Upstream request failed — network error." }, allowed);
    }

    if (upstream.status === 429) {
        logTelemetry("upstream_429", { endpoint: "sc-official-resolve", origin: allowed, status_code: 429, upstream_status: 429, duration_ms: Date.now() - startMs });
        return json(429, { error: "Upstream rate limit. Try again later." }, allowed);
    }
    if (!upstream.ok) {
        const status_code = 502;
        logTelemetry("sc_resolve_error", { endpoint: "sc-official-resolve", origin: allowed, status_code, upstream_status: upstream.status, duration_ms: Date.now() - startMs });
        return json(status_code, { error: `Upstream error (HTTP ${upstream.status}).` }, allowed);
    }

    let data;
    try {
        data = await upstream.json();
    } catch {
        const status_code = 502;
        logTelemetry("sc_resolve_error", { endpoint: "sc-official-resolve", origin: allowed, status_code, upstream_status: upstream.status, duration_ms: Date.now() - startMs });
        return json(status_code, { error: "Upstream returned invalid JSON." }, allowed);
    }

    logTelemetry("sc_resolve_success", { endpoint: "sc-official-resolve", origin: allowed, status_code: 200, upstream_status: 200, duration_ms: Date.now() - startMs });
    return json(200, shapeResource(data), allowed);
}
