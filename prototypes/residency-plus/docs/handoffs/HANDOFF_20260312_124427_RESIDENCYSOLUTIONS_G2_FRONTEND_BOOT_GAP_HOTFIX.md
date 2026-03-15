## Residency+ Frontend Boot Gap Hotfix

- **Timestamp**: 20260312_124427
- **Scope**: `index.html` frontend boot/init flow (no wrapper changes)
- **Index/html slice**: External Playback Fallback v3 remains non-final

### 1. Exact Frontend Root Cause

- **Symptom**: `scripts/verify_frontend_boot.ps1` repeatedly failed with:
  - `Track title is still blank/placeholder after boot.`
- **Verifier behavior** (`scripts/verify_frontend_boot.mjs`):
  - Loads `http://localhost:8888/`.
  - Waits for `.shell`.
  - Reads `#trackTitle` and fails if its text content is empty or `"—"`.
- **Boot path (before fix)**:
  - `document.addEventListener("DOMContentLoaded", async () => { ... })`:
    - Calls `const ok = await checkHealth();`
    - If `!ok`, **returns early**, skipping:
      - `playerFrame.src = buildEmbedUrl(SEED_LIBRARY[0].url);`
      - `ensureWidget();`
      - `loadItem(last, false);` (if any `STORAGE_KEY_LAST` in `localStorage`)
      - `doShuffle(false);` (which eventually calls `pickAndPlay(...)` → `loadItem(pick, false)`).
  - `checkHealth()` called `/.netlify/functions/sc-health` and **returned `false` whenever `d.ok` was false** (e.g., local fixture mode without `SOUNDCLOUD_CLIENT_ID`).
  - In local dev (fixture) mode:
    - `sc-health` returns `ok: false` with the "Missing SOUNDCLOUD_CLIENT_ID..." message.
    - `checkHealth()` returned `false`.
    - Boot `DOMContentLoaded` handler bailed out before selecting or loading any item.
- **Result**:
  - Shell UI rendered.
  - No `loadItem(...)` was ever invoked.
  - `#trackTitle` remained at its initial placeholder `"—"`, causing the boot verifier to fail.
- **Classification**:
  - **Frontend boot guard overreach**: `checkHealth` treated non-OK health as a *hard blocker* for boot, instead of letting the shell render a track title while still surfacing a red banner about limited backend/credentials.
  - **Not** a wrapper, token, or playback-path bug; purely a boot/render gating issue.

### 2. Files Changed

- `index.html`

No other files (wrappers, billing, vibe, auth) were modified.

### 3. Change Summary

#### 3.1. `checkHealth` behavior

**Before:**

- Implementation (simplified):

  - `const r = await fetch("/.netlify/functions/sc-health");`
  - `const d = await r.json();`
  - If `!d.ok`:
    - `window.SC_OK = false;`
    - `showBanner(d.message);`
    - `return false;`
  - On error:
    - `window.SC_OK = false;`
    - `showBanner("Backend unavailable");`
    - `return false;`

- **Call site**:
  - `const ok = await checkHealth();`
  - `if (!ok) return;` (end of boot handler)

**After:**

- `checkHealth` now **always returns `true`**, but still sets global and banner state:
  - On successful health check but `ok === false`:
    - `window.SC_OK = false;`
    - `showBanner(d.message);`
    - **Returns `true` so boot continues.**
  - On exceptions:
    - `window.SC_OK = false;`
    - `showBanner("Backend unavailable");`
    - **Returns `true` so boot continues.**
  - When `ok === true`:
    - `window.SC_OK` remains truthy via earlier initialization.
    - Returns `true`.
- Additional inline commentary clarifies intent:
  - In local/fixture or degraded modes we still want the shell to boot and render a current track title, even if playback is limited.
  - Keep shell usable even if health check fails hard.

- **Boot handler remains the same**:
  - Still calls:
    - `playerFrame.src = buildEmbedUrl(SEED_LIBRARY[0].url);`
    - `ensureWidget();`
    - `loadItem(last, false);` when a persisted last item exists.
    - `setStatus("READY");`
    - `await doShuffle(false);` – which drives initial selection/title via:
      - `doShuffle(...)` → `pickAndPlay(matches)` → `loadItem(pick, false)` → updates `#trackTitle`.

#### 3.2. Playback-limited and degraded modes

- The change **does not alter**:
  - Playback-limited logic inside `widgetLoad` or external playback fallbacks.
  - Any SoundCloud wrapper endpoints or token handling.
  - Vibe/search state restoration, stations, or cloud sync.
- In cases where playback is limited or degraded:
  - The app now:
    - Shows a **red banner** (`showBanner`) describing the issue.
    - **Still boots the shell** and **selects a current track**, with:
      - Non-blank `#trackTitle`.
      - Metadata in `miniNow` and pills when available.

### 4. Verification Results

#### 4.1. Production Verification (`scripts/verify_prod.ps1`)

- **Status**: **PASS**
- **Command**: `scripts/verify_prod.ps1`
- **Latest log**: `logs/verify_prod_20260312_124415.log`
- **Key responses**:
  - `sc-health`: `HTTP 200`, `{"ok":true,"message":"SoundCloud client id detected."}`
  - `sc-official-search`: `HTTP 200`, `{"collection":[],"degraded":true,"reason":"token_rate_limited"}`
  - `sc-official-resolve`: `HTTP 200`, `{"degraded":true,"reason":"token_rate_limited","resource":null}`
- **Notes**:
  - Frontend-only change; wrappers are unchanged from previous hotfix and remain green.

#### 4.2. Local Dev Verification (`scripts/verify_local_dev.ps1`)

- **Status**: **PASS**
- **Command**: `scripts/verify_local_dev.ps1`
- **Latest log**: `logs/verify_local_dev_20260312_124352.log`
- **Key behavior**:
  - `DEV_FIXTURE_MODE=true`:
    - `sc-health`: `HTTP 200`, `ok: false` + "Missing SOUNDCLOUD_CLIENT_ID..." message (expected for local dev without creds).
    - `sc-official-search` / `sc-official-resolve`:
      - Both `HTTP 200` with fixture-backed payloads.
  - The health check banner is present, but the frontend boot flow no longer aborts; local library/fixtures and selection logic are fully exercised.

#### 4.3. Frontend Boot Verification (`scripts/verify_frontend_boot.ps1`)

- **Status**: **PASS**
- **Command**: `scripts/verify_frontend_boot.ps1`
- **Latest log**: `logs/verify_frontend_boot_20260312_124348.log`
- **Key log lines**:
  - After navigating to `http://localhost:8888/`, Playwright now observes:
    - A non-placeholder, non-empty value for `#trackTitle`.
  - Theme toggle check continues to pass (body `data-theme` changes after click).
- **Interpretation**:
  - Initial frontend boot now **always renders a selected track title** and associated metadata, even when backend health is degraded/fixture-only.

### 5. Commit Details

- **Branch**: `feat/discovery-engine-v1`
- **Commit**: `84ddde8241a466d8b80d0ea8c127c5d845365bb7`
- **Message**: `fix: restore residency+ initial track render after boot`
- **Files in commit**:
  - `prototypes/residency-plus/index.html`

### 6. Notes / Next Steps

- **App state**:
  - All three gates now pass on the final committed tree:
    - `verify_local_dev.ps1` → PASS
    - `verify_prod.ps1` → PASS
    - `verify_frontend_boot.ps1` → PASS
- **UI behavior**:
  - On boot:
    - A current track is selected and rendered in `#trackTitle`.
    - Metadata and status are populated.
    - Any backend/credential issues are surfaced via the red health banner, without blocking boot.
- **Future slices** (unchanged from prior plan):
  - Ship External Playback Fallback v3 cleanly.
  - Or move into cloud-synced vibe presets work, now that boot + wrappers are stable.

