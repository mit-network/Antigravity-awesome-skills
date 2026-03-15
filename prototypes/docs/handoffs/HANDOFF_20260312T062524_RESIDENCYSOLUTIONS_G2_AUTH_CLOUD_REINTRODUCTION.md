## Handoff: Auth + Cloud Persistence Reintroduction (Slice)

- **Lane**: ResidencySolutions G2 (RESIDENCY+ SoundCloud Digger)
- **Slice**: Supabase / Cloud Persistence Reintroduction behind hard flag
- **Date**: 2026-03-12
- **Commit**: `cb6bb398572cf106276f67c34ba3ea3756877f6c`

### Verification Baseline (Post-Slice)

- `scripts/verify_local_dev.ps1` → **PASS**
  - Log: `logs/verify_local_dev_20260312_062511.log`
- `scripts/verify_prod.ps1` → **PASS**
  - Log: `logs/verify_prod_20260312_062516.log`

### Hard Guardrails Applied

- `AUTH_ENABLED` front-end feature flag introduced in `index.html`, **default `false`**.
- All Supabase-backed Netlify functions (`auth-session`, `sync-crate`, `sync-history`, `sync-session-state`, `sync-playlists`, `migrate-local-data`) are additionally gated by `process.env.AUTH_ENABLED === "true"`:
  - When disabled, they short-circuit with `200 { auth_enabled: false }`.
- Anonymous/local behavior (localStorage + IndexedDB) remains the primary code path:
  - When `AUTH_ENABLED=false`, the app behaves identically to the pre-slice baseline.
  - Cloud failures and missing Supabase configuration are treated as **non-fatal**, with local mode fully intact.

### What Was Reintroduced

1. **Supabase Client Wiring (Front-End)**
   - Added Supabase JS SDK via CDN:
     - `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
   - Front-end config in `index.html`:
     - `const AUTH_ENABLED = false;`
     - `const SUPA_URL = "%%SUPABASE_URL%%";`
     - `const SUPA_KEY = "%%SUPABASE_ANON_KEY%%";`
   - When `AUTH_ENABLED=true` **and** both placeholders are replaced with real values (no `%%` present), a Supabase client is created:
     - `supabase = window.supabase.createClient(SUPA_URL, SUPA_KEY);`

2. **Minimal Auth UI (Flag-Gated)**

- **Account button**
  - New button in the existing topbar right cluster: `#accountBtn` (label “Account”).
  - When `AUTH_ENABLED=false`: hidden via JS to preserve current visual behavior.
  - When `AUTH_ENABLED=true` and Supabase is configured: enabled and visible.

- **Auth modal**
  - A small, centered modal `#authModal` with:
    - **Signed-out state**: email/password inputs, “Continue” CTA, Sign In / Sign Up toggle.
    - **Signed-in state**: “Signed in as <email>” and “Sign Out” button.
  - The modal is **display:none** by default and only opened via `#accountBtn` when auth is enabled.

- **Flows**
  - **Sign Up**:
    - `supabase.auth.signUp({ email, password })`
    - On success: does **not** auto-login; shows a green message instructing user to confirm email and sign in.
  - **Sign In**:
    - `supabase.auth.signInWithPassword({ email, password })`
    - On success: modal closes; Supabase session is active.
  - **Sign Out**:
    - `supabase.auth.signOut()`
    - Modal closes; UI reverts to signed-out state.
  - Errors are shown inline in the modal; they **do not** affect playback, crate, or history.

3. **Auth State Handling (Front-End)**

- `supabase.auth.onAuthStateChange` drives:
  - `currentUser` assignment.
  - Account UI:
    - Signed in → `accountBtn.textContent = "Account"`, shows `#authSignedInState`.
    - Signed out → `accountBtn.textContent = "Sign In"`, shows `#authSignedOutState`.
  - On first `SIGNED_IN`:
    - Checks for local data (crate/history/playlists) and a migration flag `STORAGE_KEY_MIGRATED = "residency_migrated_v1"`.
    - If there is local data and no flag:
      - Prompts once: “Signed in. Migrate your existing saved crate and settings to your account?”
      - On confirm: calls `migrate-local-data` Netlify function (see below).
      - Sets `residency_migrated_v1` in localStorage.
    - Regardless of migration choice:
      - Calls `fetchCloudData()` to hydrate from cloud.
      - Triggers an initial sync for crate, history, session state, and playlists.

4. **Cloud Sync Helpers (Front-End)**

- **Token extraction**:
  - `getNetlifyToken()` obtains the Supabase access token from `supabase.auth.getSession()`.

- **Generic Netlify function caller**:
  - `callAuthedFunction(name, method, body)`:
    - Adds `Authorization: Bearer <access_token>` header.
    - Uses JSON bodies for POSTs; parses JSON responses.
    - Returns `null` on failure; never throws into UI flow.

- **Sync functions** (all no-op unless `AUTH_ENABLED` and Supabase are active):

  - `syncCrateToCloud()` → `/.netlify/functions/sync-crate` (POST)
    - Sends the current `crate` as `tracks: [{ url, title, artist, bucket, kind, durationMs, savedAt }]`.
    - Uses current time for `savedAt` when absent.

  - `syncHistoryToCloud()` → `/.netlify/functions/sync-history` (POST)
    - Sends up to the last 200 history entries as `tracks: [{ url, title, artist, bucket, playedAt }]`.
    - `addToHistory` now stamps `playedAt` on insert; history UX is unchanged.

  - `syncSessionStateToCloud()` → `/.netlify/functions/sync-session-state` (POST)
    - Sends `{ genre, source, dig_range, station_id }` based on the current UI controls.

  - `syncPlaylistsToCloud()` → `/.netlify/functions/sync-playlists` (POST)
    - For now, `playlists` is an in-memory array (no UI yet); if empty, this is a no-op.

- **Debounced hooks**:
  - `debouncedCrateSync = debounce(syncCrateToCloud, 800);`
  - `debouncedHistorySync = debounce(syncHistoryToCloud, 1200);`
  - `debouncedStateSync = debounce(syncSessionStateToCloud, 800);`
  - Existing event handlers that check `typeof debouncedCrateSync === "function"` etc. now trigger sync when auth is enabled, and remain harmless when disabled.

5. **Cloud Hydration on Sign-In**

On `SIGNED_IN`, the client performs a safe, local-first hydration:

- **Crate** (`GET /.netlify/functions/sync-crate`):
  - If `hasData` and `items`:
    - Builds a URL map from local crate.
    - Adds any cloud-only items into the map.
    - Writes merged crate back to localStorage and re-renders the Saved panel.
  - Local items are never dropped; cloud is merged in.

- **History** (`GET /.netlify/functions/sync-history`):
  - If `hasData` and `items`:
    - Builds a `Set` of local URLs.
    - Appends cloud-only entries (with `playedAt`) to the tail.
    - Trims history to the last 250 entries.
  - Local history is preserved; cloud provides additional context.

- **Session state** (`GET /.netlify/functions/sync-session-state`):
  - If a remote state exists, it is only applied when the local filter state is still the “blank” default:
    - `genre === "all"`, `source === "both"`, `digRange === 70`, `stationId === "__all__"`.
  - When applied:
    - Updates selects and range slider.
    - Persists to localStorage.
    - Calls `resetContext()` to recompute derived state.
  - If local state is already customized, it wins; remote is ignored to avoid destructive overwrites.

- **Playlists** (`GET /.netlify/functions/sync-playlists`):
  - If `hasData` and `playlists`, hydrates the in-memory `playlists` array for future UI slices.
  - No current UI changes; purely preparatory.

6. **One-Time Local → Account Migration**

- Implemented via `/.netlify/functions/migrate-local-data`:
  - Payload:
    - `crate`: current saved crate array.
    - `session`: `{ genre, source, dig_range, station_id }`.
    - `playlists`: current playlists array (empty for now).
  - Server behavior:
    - Upserts `session_state` row for the user.
    - Upserts crate rows in `public.crate` with `(user_id, soundcloud_url)` conflict target.
    - Optionally upserts playlists and playlist items within safe limits.
  - Front-end behavior:
    - Prompt is shown only once per browser:
      - Controlled by `residency_migrated_v1` flag in localStorage.
    - Even on failure, local data is never deleted.

7. **Netlify Functions: Safe Flag Gating**

All Supabase-related functions now start with:

- `const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";`
- If `!AUTH_ENABLED`, they immediately return `200 { auth_enabled: false }` (with appropriate CORS origin where relevant), before touching JWTs or Supabase.

Affected files:

- `netlify/functions/auth-session.js`
- `netlify/functions/sync-crate.js`
- `netlify/functions/sync-history.js`
- `netlify/functions/sync-session-state.js`
- `netlify/functions/sync-playlists.js`
- `netlify/functions/migrate-local-data.js`

This ensures:

- Cloud paths are entirely dormant in environments where `AUTH_ENABLED` is not explicitly turned on.
- Accidental calls from the client (e.g., during experiments) fail soft and do not surface as 500s.

### Front-End Behavior with AUTH_ENABLED=false (Default)

- Account button:
  - Hidden at runtime; header/right cluster remains as in the stable baseline.
- Auth modal:
  - Present in DOM but never opened.
- Supabase:
  - Client is **not** initialized.
- All sync helpers:
  - `debouncedCrateSync`, `debouncedHistorySync`, `debouncedStateSync` are defined but become no-ops.
- App UX:
  - Exactly matches the pre-slice behavior:
    - Shuffle, crate, history, stations, auto-dig, export all behave as before.
    - No blank-shell regressions.
    - Local mode continues to function even if Supabase env vars are absent or invalid.

### Front-End Behavior with AUTH_ENABLED=true (Controlled Testing Only)

Prereqs:

- Replace `%%SUPABASE_URL%%` and `%%SUPABASE_ANON_KEY%%` in `index.html` during build/deploy.
- Set `AUTH_ENABLED=true` in Netlify environment for the relevant site.

Behavior:

- Account button appears and becomes clickable; opens the auth modal.
- Email/password sign up / sign in / sign out flows work against Supabase Auth.
- Signed-in state is visible:
  - `Account` label.
  - Auth modal shows current email.
- Crate, history, session state, and playlists:
  - Write-through to localStorage as before.
  - Background, debounced sync to Supabase when signed in.
  - Hydration from cloud occurs on sign-in, merging with local-first semantics.
- Cloud outages or misconfig:
  - Errors are caught and logged; UI falls back to local-only behavior.
  - No blank screens or blocking spinners; shuffle and playback remain functional.

### Deferred / Out-of-Scope

- **Billing / Stripe / G1 entitlements enforcement**:
  - No Stripe integration or plan gating in this slice.
  - `plan` remains informational only.
- **OAuth providers**:
  - Only email/password auth is wired.
- **Vibe Search**:
  - No changes to discovery engine beyond what was already present.
- **Broader settings UI**:
  - No additional settings surfaces added; only the minimal account entry point + modal.
- **Playlists UI**:
  - Cloud playlist sync and migration are in place, but there is no visible playlist management UI yet.

