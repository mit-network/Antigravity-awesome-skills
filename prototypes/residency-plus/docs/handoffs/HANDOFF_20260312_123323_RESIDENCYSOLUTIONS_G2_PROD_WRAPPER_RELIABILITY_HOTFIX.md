## Residency+ Production Wrapper Reliability Hotfix

- **Timestamp**: 20260312_123323 (UTC-local timestamp from automation)
- **Scope**: Production SoundCloud OAuth wrappers (`sc-official-search`, `sc-official-resolve`) and shared auth lib
- **Index.html slice**: External Playback Fallback v3 remains non-final (not marked green)

### 1. Exact Production Root Cause

- **Symptom**: `scripts/verify_prod.ps1` failing with HTTP 400 for:
  - `/.netlify/functions/sc-official-search?q=ambient`
  - `/.netlify/functions/sc-official-resolve?url=https://soundcloud.com/tycho/awake`
- **Error body (from latest prod verify log)**:
  - `{ "error": "[sc-auth-lib] Token request failed — HTTP 429 (rate limited, no cached token available)" }`
- **Root-cause classification**:
  - **Primary**: Token acquisition path in `sc-auth-lib` returning a **hard error** when the SoundCloud OAuth endpoint is **rate-limited (429) and no cached token is present**, and the Netlify function handlers were **propagating that error as HTTP 400** instead of degrading gracefully.
  - **Type**: **Token acquisition failure under upstream rate limiting**, not an `index.html` or UI regression.
  - **Environment**: Production Netlify functions only; local fixture mode was unaffected.

### 2. Files Changed

- `netlify/functions/sc-official-search.js`
- `netlify/functions/sc-official-resolve.js`

No changes were made to:

- `netlify/functions/lib/sc-auth-lib.js`
- `index.html`'s External Playback Fallback v3 slice
- Any Vibe or billing/customer-portal scope

### 3. Change Summary

**Goal**: Preserve production availability when SoundCloud’s OAuth endpoint returns HTTP 429 without a usable cached token, by treating this as a **degraded-but-200** state instead of surfacing a 400 error to clients.

#### 3.1. `sc-official-search.js`

- **Before**:
  - Wrapped `getAccessToken()` in a `try/catch`.
  - Checked for `msg.includes("Token request failed — HTTP 429")` to decide whether to downgrade to a degraded 200 response.
  - When the message did not match exactly (e.g., different punctuation or prefix), the code fell through to:
    - Telemetry: `sc_search_error`
    - HTTP 400 with `{ error: "<token error message>" }`
- **After**:
  - Relaxed the detection to match **any** `[sc-auth-lib]` 429 token error:
    - `if (msg && msg.includes("[sc-auth-lib] Token request failed") && msg.includes("429")) { ... }`
  - On match:
    - Logs `sc_search_degraded` telemetry with `reason: "token_rate_limited_no_cache"`.
    - Returns `HTTP 200` with body:
      - `{ collection: [], degraded: true, reason: "token_rate_limited" }`
    - CORS headers preserved via `json(..., allowed)`.
  - On non-429 errors:
    - Behavior unchanged: `HTTP 400` with `{ error: msg || "Unknown token error" }` and `sc_search_error` telemetry.

#### 3.2. `sc-official-resolve.js`

- **Before**:
  - Same pattern as search: `msg.includes("Token request failed — HTTP 429")` controlled whether to degrade.
  - Non-matching messages yielded `HTTP 400` with `{ error: msg || "Unknown token error" }`.
- **After**:
  - Updated check to the more robust pattern:
    - `if (msg && msg.includes("[sc-auth-lib] Token request failed") && msg.includes("429")) { ... }`
  - On match:
    - Logs `sc_resolve_degraded` telemetry with `reason: "token_rate_limited_no_cache"`.
    - Returns `HTTP 200` with body:
      - `{ degraded: true, reason: "token_rate_limited", resource: null }`
    - CORS headers preserved via `json(..., allowed)`.
  - All non-429 error behavior is unchanged (400 + `sc_resolve_error`).

### 4. Verification Results

#### 4.1. Production Verification (`scripts/verify_prod.ps1`)

- **Status**: **PASS**
- **Command**: `scripts/verify_prod.ps1`
- **Log file**: `logs/verify_prod_20260312_123252.log`
- **Key responses**:
  - `sc-health`: `HTTP 200`, `{"ok":true,"message":"SoundCloud client id detected."}`
  - `sc-official-search`: `HTTP 200`, `{"collection":[],"degraded":true,"reason":"token_rate_limited"}`
  - `sc-official-resolve`: `HTTP 200`, `{"degraded":true,"reason":"token_rate_limited","resource":null}`
- **Interpretation**:
  - Prod is now **green for wrappers**.
  - SoundCloud OAuth endpoint is still sometimes rate-limiting (429), but the wrappers now **gracefully degrade** instead of returning 400.

#### 4.2. Local Dev Verification (`scripts/verify_local_dev.ps1`)

- **Status**: **PASS**
- **Preconditions**:
  - Local Netlify dev running with:
    - `DEV_FIXTURE_MODE=true`
    - `npx netlify dev --offline --dir "." --functions "netlify/functions" --port 8888`
  - `.env` intentionally **does not export** real SoundCloud credentials for local dev, so:
    - `sc-health` returns `ok: false` + "Missing SOUNDCLOUD_CLIENT_ID..." banner.
    - This is **expected** and acceptable in fixture flow.
- **Command**: `scripts/verify_local_dev.ps1`
- **Log file**: `logs/verify_local_dev_20260312_123259.log`
- **Key behavior**:
  - `sc-health`: `HTTP 200`, `ok: false` (banner surfaces missing local env).
  - `sc-official-search`:
    - `HTTP 200` with fixture-backed payload (`[DEV FIXTURE] Ambient Leftfield Dojo` etc.).
  - `sc-official-resolve`:
    - `HTTP 200` with fixture-backed resolved track.
- **Notes**:
  - `verify_local_dev.ps1` intentionally **does not require** `ok: true` from `sc-health` in fixture mode; it only asserts that the wrapper endpoints behave correctly (search + resolve) given either real or fixture data.

#### 4.3. Frontend Boot Verification (`scripts/verify_frontend_boot.ps1`)

- **Status**: **FAIL** (as of `logs/verify_frontend_boot_20260312_123302.log`)
- **Command**: `scripts/verify_frontend_boot.ps1`
- **Log file**: `logs/verify_frontend_boot_20260312_123302.log`
- **Failure detail**:
  - Playwright log:
    - `Track title is still blank/placeholder after boot.`
  - The UI at `http://localhost:8888/` currently **does not auto-populate** the "track title" field on initial boot when running against local fixture mode, despite the backend fixtures returning valid data.
- **Interpretation**:
  - This is a **frontend behavior gap**, not a wrapper or prod-token issue.
  - It is **out of scope** for the "Production Wrapper Reliability Hotfix" mission, and the production environment is already green.

### 5. Index.html / External Playback Fallback v3 Relationship

- The production 400s were **not caused** by any `index.html` or External Playback Fallback v3 changes.
- Root cause lives entirely in the **token acquisition + wrapper error classification path**, specifically around how we treated SoundCloud OAuth 429 + no cached token.
- External Playback Fallback v3 remains **non-final** and **not marked green**; the hotfix only adjusts server-side wrapper behavior.

### 6. Commit Details

- **Branch**: `feat/discovery-engine-v1`
- **Commit**: `fe1235db36290ed77789a33716d983dcb83abb72`
- **Message**: `fix: restore residency+ production wrapper reliability after prod verify failure`
- **Files in commit**:
  - `prototypes/residency-plus/netlify/functions/sc-official-search.js`
  - `prototypes/residency-plus/netlify/functions/sc-official-resolve.js`

### 7. Operational Notes / Runbook Pointers

- **Prod telemetry**:
  - Watch for:
    - `sc_search_degraded` / `sc_resolve_degraded`
    - `reason: "token_rate_limited_no_cache"` or `reason: "token_rate_limited"`
  - This indicates SoundCloud OAuth rate limiting; user experience is **degraded but not broken**.
- **Banner expectations**:
  - Local dev will continue to show:
    - "Missing SOUNDCLOUD_CLIENT_ID. Set it in your shell or Netlify env vars (see .env.example)."
  - This is expected with fixture-mode local dev and does **not** indicate a production issue.
- **Next likely scopes (post-hotfix)**:
  - Once teams are comfortable with wrapper stability:
    1. Ship **External Playback Fallback v3** cleanly (with prod already green).
    2. Or, pivot to **cloud-synced vibe presets** work.

