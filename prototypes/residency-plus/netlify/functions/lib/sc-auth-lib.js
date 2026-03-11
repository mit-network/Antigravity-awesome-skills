/**
 * sc-auth-lib.js — Shared helpers for official SoundCloud OAuth wrapper functions.
 *
 * This file is NOT a Netlify function handler. It exports utilities imported
 * by sc-official-search.js and sc-official-resolve.js.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

// ── Env validation ────────────────────────────────────────────────────────────

const _clientId = process.env.SOUNDCLOUD_CLIENT_ID;
const _clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET;

function _credsMissing() {
  const badId = !_clientId || _clientId.trim() === "" || _clientId === "YOUR_CLIENT_ID";
  const badSec = !_clientSecret || _clientSecret.trim() === "" || _clientSecret === "YOUR_CLIENT_SECRET";
  return { badId, badSec, any: badId || badSec };
}

// ── Persisted Token Cache (Survives hot-reloads) ─────────────────────────────

const CACHE_FILE = path.join(os.tmpdir(), "sc-auth-cache.json");

function readCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
      if (parsed && parsed.token) return parsed;
    }
  } catch (e) {
    // ignore
  }

  if (process.env.SOUNDCLOUD_BOOTSTRAP_ACCESS_TOKEN) {
    return {
      token: process.env.SOUNDCLOUD_BOOTSTRAP_ACCESS_TOKEN.trim(),
      expiry: Date.now() + 3600 * 1000,
      cooldownUntil: 0
    };
  }

  return { token: null, expiry: 0, cooldownUntil: 0 };
}

function writeCache(token, expiry, cooldownUntil) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ token, expiry, cooldownUntil }));
  } catch (e) {
    // ignore
  }
}

let _inflightRefresh = null;

/**
 * Returns a valid Bearer access token.
 */
exports.getAccessToken = async function getAccessToken() {
  const { any, badId, badSec } = _credsMissing();
  if (any) {
    const which = [badId && "SOUNDCLOUD_CLIENT_ID", badSec && "SOUNDCLOUD_CLIENT_SECRET"]
      .filter(Boolean).join(", ");
    throw new Error(`[sc-auth-lib] Missing required env var(s): ${which}. Set them in your .env or Netlify environment variables.`);
  }

  const cache = readCache();

  if (cache.token && Date.now() < cache.expiry - 30_000) {
    return cache.token;
  }

  if (_inflightRefresh) {
    return _inflightRefresh;
  }

  if (Date.now() < cache.cooldownUntil) {
    if (cache.token) {
      return cache.token;
    }
    const secsLeft = Math.ceil((cache.cooldownUntil - Date.now()) / 1000);
    throw new Error(`[sc-auth-lib] Token endpoint rate-limited. Retry in ${secsLeft}s.`);
  }

  _inflightRefresh = _doTokenRefresh().finally(() => { _inflightRefresh = null; });
  return _inflightRefresh;
};

async function _doTokenRefresh() {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: _clientId,
    client_secret: _clientSecret,
  });

  let res;
  try {
    res = await fetch("https://api.soundcloud.com/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (e) {
    throw new Error("[sc-auth-lib] Token request failed — network error");
  }

  if (res.status === 429) {
    const cache = readCache();
    const cooldownUntil = Date.now() + 60_000;
    writeCache(cache.token, cache.expiry, cooldownUntil);
    if (cache.token) return cache.token;
    throw new Error("[sc-auth-lib] Token request failed — HTTP 429 (rate limited, no cached token available)");
  }

  if (!res.ok) {
    throw new Error(`[sc-auth-lib] Token request failed — HTTP ${res.status}`);
  }

  let data = await res.json();
  if (!data.access_token) {
    throw new Error("[sc-auth-lib] Token response missing access_token field");
  }

  const expiry = Date.now() + (parseInt(data.expires_in, 10) || 3600) * 1000;
  writeCache(data.access_token, expiry, 0);

  return data.access_token;
}

// ── Origin allowlist ──────────────────────────────────────────────────────────

exports.allowOrigin = function allowOrigin(origin) {
  if (!origin) return null;
  const o = origin.trim().toLowerCase();

  if (o.startsWith("http://localhost:") || o.startsWith("http://127.0.0.1:")) {
    return origin;
  }

  const envOrigins = (process.env.ALLOWED_ORIGINS || "").split(",")
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);

  if (envOrigins.includes(o)) {
    return origin;
  }

  // Automatically allow our own production netlify domain
  if (o.includes(".netlify.app")) {
    return origin;
  }

  return null;
};

// ── Rate limiting ──────────────────────────────────────────────────────────────

const _WINDOW_MS = 5 * 60 * 1000;
const _WINDOW_LIMIT = 30;
const _rateBuckets = new Map();

exports.checkRateLimit = function checkRateLimit(key) {
  const now = Date.now();
  const hits = (_rateBuckets.get(key) || []).filter(t => now - t < _WINDOW_MS);
  hits.push(now);
  _rateBuckets.set(key, hits);

  if (hits.length > _WINDOW_LIMIT) {
    const oldest = hits[0];
    const retryAfter = Math.ceil((_WINDOW_MS - (now - oldest)) / 1000);
    return { ok: false, retryAfter };
  }
  return { ok: true, retryAfter: 0 };
};

// ── Response helpers (v1/CommonJS compatible) ──────────────────────────────────

exports.json = function json(status, body, allowedOrigin = null) {
  const headers = { "content-type": "application/json" };
  if (allowedOrigin) {
    headers["access-control-allow-origin"] = allowedOrigin;
    headers["access-control-allow-headers"] = "content-type";
    headers["access-control-allow-methods"] = "GET,OPTIONS";
    headers["vary"] = "Origin";
  }
  return {
    statusCode: status,
    headers: headers,
    body: JSON.stringify(body)
  };
};

// ── Telemetry ──────────────────────────────────────────────────────────────────

exports.logTelemetry = function logTelemetry(eventName, payload = {}) {
  const entry = {
    _telemetry: true,
    event: eventName,
    timestamp: new Date().toISOString(),
    ...payload
  };

  const jsonString = JSON.stringify(entry);
  console.log(jsonString);

  const axiomToken = process.env.AXIOM_API_TOKEN;
  const axiomDataset = process.env.AXIOM_DATASET;
  const axiomDomain = process.env.AXIOM_DOMAIN;

  if (axiomToken && axiomDataset && axiomDomain) {
    const ingestUrl = `https://${axiomDomain}/v1/ingest/${axiomDataset}`;
    fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${axiomToken}`
      },
      body: JSON.stringify([entry])
    }).catch(err => {
      console.warn(`[TELEMETRY_WARN] Failed to forward telemetry to Axiom: ${err.message}`);
    });
  }
};

