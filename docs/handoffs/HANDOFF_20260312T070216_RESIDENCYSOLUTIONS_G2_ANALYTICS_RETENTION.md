## Handoff: Analytics + Retention Instrumentation (Residency+)

- **Lane**: ResidencySolutions G2 (RESIDENCY+ SoundCloud Digger)
- **Slice**: Analytics and Retention Instrumentation
- **Date**: 2026-03-12
- **Commit**: `3758245a0a2f809e84c93a0b4a8ed2f7f816fd5a`

### Verification Baseline (Post-Slice)

- `scripts/verify_local_dev.ps1` → **PASS**
  - Log: `logs/verify_local_dev_20260312_070108.log`
- `scripts/verify_prod.ps1` → **PASS**
  - Log: `logs/verify_prod_20260312_070114.log`

Auth/cloud gating, plans/billing foundations, and anonymous/local mode remain unchanged and fully functional. Analytics additions are strictly additive and fail-safe.

---

### Telemetry Foundation (Existing)

This slice builds on the existing Axiom + Netlify telemetry pipeline:

- `netlify/functions/lib/sc-auth-lib.js`:
  - `logTelemetry(eventName, payload)` is the single server-side telemetry sink.
  - Already forwards structured events to Axiom when `AXIOM_API_TOKEN`, `AXIOM_DATASET`, and `AXIOM_DOMAIN` are configured; otherwise logs to stdout only.
- `TELEMETRY_SPEC.md` / `AXIOM_RUNBOOK.md` remain the canonical docs for SoundCloud proxy telemetry and Axiom usage.

All new instrumentation reuses `logTelemetry` or a thin client→function bridge, with the same privacy rules (no raw queries, no secrets).

---

### New Netlify Telemetry Surfaces

#### 1) Client Telemetry Bridge

- **File**: `netlify/functions/client-telemetry.js`
- Purpose: Accepts **high-signal** product analytics events from the browser and forwards them through `logTelemetry`.
- Behavior:
  - OPTIONS: CORS preflight.
  - POST:
    - Validates `body.event` as a string.
    - Uses `logTelemetry(event, { origin, ...payload })`.
    - Returns `200 { ok: true }` on success.
  - All failures are non-fatal and never affect app UX.

This keeps analytics traffic structured and constrained, while leveraging the existing Axiom pipeline.

#### 2) Auth Session Telemetry

- **File**: `netlify/functions/auth-session.js`
- Added telemetry events:
  - `auth_disabled_request` — when `AUTH_ENABLED=false` and the endpoint is hit.
  - `auth_session_invalid` — missing/invalid JWT.
  - `auth_session_validated` — successful session validation, includes `plan` from `public.users.plan` (defaulting to `free`).
  - `auth_session_error` — unexpected server error.

#### 3) Cloud Sync Telemetry (Crate, History, Playlists, Migration)

- **`sync-crate.js`**
  - `sync_disabled` — called when `AUTH_ENABLED=false`.
  - `sync_auth_invalid` — missing/invalid JWT.
  - `sync_crate_hydrate_empty` — GET returned no rows.
  - `sync_crate_hydrate_success` — GET returned rows, includes `count`.
  - `sync_crate_success` — POST succeeded, includes:
    - `synced` (count of records sent)
    - `total_cloud` (post-sync server count)
    - `plan` (from entitlements).
  - `sync_crate_error` — unexpected error.

- **`sync-history.js`**
  - `sync_disabled`, `sync_auth_invalid` as above.
  - `sync_history_hydrate_empty` / `sync_history_hydrate_success` with `count`.
  - `sync_history_success` — includes `synced` and `plan`.
  - `sync_history_error`.

- **`sync-playlists.js`**
  - `sync_disabled`, `sync_auth_invalid`.
  - `sync_playlists_hydrate_empty` / `sync_playlists_hydrate_success` with `playlists_count`.
  - `sync_playlists_success` — includes `synced` and `plan`.
  - `sync_playlists_error`.

- **`migrate-local-data.js`**
  - `migration_disabled` — when `AUTH_ENABLED=false`.
  - `migration_auth_invalid`.
  - `migration_performed` — includes:
    - `crate_count`
    - `session_state` (bool)
    - `playlists_count`
    - `plan`.
  - `migration_error`.

These events collectively cover cloud sync lifecycle and migration health without exposing PII or raw URLs.

#### 4) Entitlements Telemetry

- **File**: `netlify/functions/get-entitlements.js`
- Added:
  - `entitlements_fetched` — includes:
    - `endpoint: "get-entitlements"`
    - `origin`
    - `plan`
    - `authenticated` (bool)
    - `auth_enabled` (bool) in the disabled/unauthenticated cases.
  - `entitlements_error` — includes error message.

This provides a clear view into plan/entitlements resolution behavior.

#### 5) Billing Telemetry

- **File**: `netlify/functions/billing-create-checkout.js`
  - `billing_checkout_disabled` — billing envs missing / feature off.
  - `billing_checkout_auth_invalid` — missing/invalid JWT for checkout.
  - `billing_checkout_started` — includes `plan: "residency_plus"`.
  - `billing_checkout_error` — includes error message.

- **File**: `netlify/functions/billing-webhook.js`
  - `billing_webhook_disabled` — when billing envs are incomplete; webhook accepted but ignored.
  - `billing_webhook_signature_failed` — Stripe signature verification failure.
  - `billing_plan_activated` — when webhook transitions a user to `residency_plus`.
  - `billing_plan_cancelled` — when webhook transitions a user back to `free`.
  - `billing_webhook_ignored` — valid events that don’t map cleanly to a user/plan change.
  - `billing_webhook_supabase_error` — failure when updating Supabase; still non-fatal.
  - `billing_webhook_received` — envelope “seen” marker with `type`.
  - `billing_webhook_error` — unexpected failures.

These events instrument the full billing lifecycle (checkout + webhook) without impacting primary app flows.

---

### Front-End Analytics & Retention Instrumentation

- **File**: `index.html`

#### 1) Client Telemetry Helper

- Added:
  - `TELEMETRY_ENABLED = true`
  - `TELEMETRY_SAMPLE_RATE = 0.2` (20% sampling for per-search metrics).
  - `shouldSample()` — random sampling guard.
  - `sendClientEvent(event, payload)` — POSTs to `/.netlify/functions/client-telemetry` using `sendBeacon` when available, otherwise `fetch`.

All client-side events are:
- High-signal.
- Small payloads.
- Designed to be sparse (first-time flags, sampling) to avoid noise.

#### 2) Activation / Product Usage Events

First-time events, tracked per session with simple in-memory flags:

- `activation_first_shuffle`
  - Emitted when `pickAndPlay` first loads a track via shuffle.

- `activation_first_save_crate`
  - Emitted on the first successful click of `Save` that actually adds a new track to the crate.

- `activation_first_export`
  - Emitted the first time `exportCrate()` runs and generates a JSON file.
  - Payload includes `{ count: <crate length> }`.

Auth events:

- `auth_sign_up`
  - After a successful `supabase.auth.signUp`.

- `auth_sign_in`
  - After a successful `supabase.auth.signInWithPassword`.

- `auth_sign_out`
  - After a successful `supabase.auth.signOut` in the UI.

#### 3) Discovery Quality & Usage Signals

- `discovery_search_result`
  - Emitted from `scSearch()` (front-end) on **sampled** non-pool searches.
  - Payload:
    - `count` — number of items in the `collection`.
    - `empty` — boolean flag for zero-result searches.
  - Only sent when `shouldSample()` returns true, to limit volume.

This complements the existing backend SoundCloud wrapper telemetry with user-facing discovery results data, without logging raw queries.

#### 4) Auth / Cloud Lifecycle (Client)

From `supabase.auth.onAuthStateChange`:

- `auth_migration_prompt_shown`
  - Emitted when the signed-in user with local data sees the one-time migration prompt.

- `auth_migration_accepted`
  - Emitted if the user confirms migration and `migrateToCloud` is invoked.

- `auth_migration_declined`
  - Emitted if the user declines migration.

Cloud hydration and sync successes/failures are also covered on the server side via the new `sync_*` and `migration_*` telemetry events (see above).

---

### Coverage vs. Requirements

**A) Activation / Product Usage**

- First shuffle: `activation_first_shuffle`
- First save to crate: `activation_first_save_crate`
- First export: `activation_first_export`
- First search / first track resolved:
  - Searches and resolves are already covered via server-side `sc_search_*` and `sc_resolve_*` events in the SoundCloud wrappers; this slice adds result-count sampling (`discovery_search_result`).
- Playlist creation / track-added-to-playlist:
  - Playlists are cloud-only and currently have no front-end UI; server-side sync/migration telemetry exists, but explicit “first playlist created / first track added” client events are **deferred until playlist UI lands**.

**B) Discovery Quality**

- Search result count & empties: `discovery_search_result` (sampled).
- Save-from-discovery / playlist-add-from-discovery / export-from-discovery:
  - Saves and exports are instrumented (`activation_first_save_crate`, `activation_first_export`), but not yet explicitly tagged with “from discovery” vs other flows; can be layered on when we add richer context.
- Duplicate suppression:
  - Underlying no-repeat logic remains in place; explicit `repeat-result` events are **not yet added** to avoid noise and complexity in this slice.

**C) Auth / Cloud**

- Server-side:
  - `auth_session_*`, `sync_*`, `migration_*` events as detailed above.
- Client-side:
  - `auth_sign_up`, `auth_sign_in`, `auth_sign_out`, `auth_migration_*`.

**D) Plans / Billing / Entitlements**

- `entitlements_fetched` / `entitlements_error` from `get-entitlements`.
- `billing_checkout_*` from `billing-create-checkout`.
- `billing_plan_activated`, `billing_plan_cancelled`, `billing_webhook_*` from `billing-webhook`.
- Entitlement limit hits:
  - The current slice enforces limits via `entitlements-lib` and trims payloads, but does **not yet emit explicit “limit hit” events**; those can be added once front-end enforcement hooks and UX are in place.

---

### Safety & Deferred Work

**Safety**

- All telemetry paths are additive and best-effort:
  - Failures in client telemetry or server-side `logTelemetry` calls never block primary flows (search, playback, crate, history, auth/cloud, or billing).
- No raw search queries, tokens, or secrets are logged; only aggregates and flags.
- `AUTH_ENABLED` and billing feature flags continue to gate cloud/billing behavior; anonymous/local mode remains untouched.
- Verification scripts exercise only the SoundCloud wrappers; their behavior remains identical, and both scripts pass on the committed tree.

**Deferred**

- Playlist UI and the associated “first playlist / first playlist-add” events.
- Fine-grained duplicate-suppression analytics and Vibe Search–specific instrumentation.
- Explicit entitlement-limit-hit events wired into front-end UX.
- Migration of entitlements logic from `entitlements-lib.js` into the commented `public.entitlements` table for a future G1 authority slice.

