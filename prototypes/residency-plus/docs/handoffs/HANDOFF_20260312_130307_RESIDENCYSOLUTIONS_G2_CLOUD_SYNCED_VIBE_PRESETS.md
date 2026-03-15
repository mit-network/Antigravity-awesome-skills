## Residency+ Cloud-Synced Vibe Presets & Recent Vibes

- **Timestamp**: 20260312_130307
- **Slice**: Cloud-Synced Vibe Presets + Recent Vibes
- **Branch**: `feat/discovery-engine-v1`
- **Commit**: `bd0bb68cecf4d07c9cd88f38d806735e07a5b0bb`

### 1. Files Changed

- `index.html`
- `netlify/functions/sync-vibes.js`

### 2. Frontend Behavior (Local-First + Cloud-Synced)

#### 2.1. Local-first vibe presets/history (unchanged UX)

- Local vibe behavior remains the primary UX driver:
  - Vibe searches still:
    - Parse the prompt into a palette.
    - Run the discovery pipeline.
    - Replace `library` and `playedMap`.
    - Pick and play a track (`pickAndPlay` → `loadItem`).
  - Recent vibe presets are still kept in:
    - `savedVibes` array.
    - `localStorage` under `STORAGE_KEY_VIBES`.
    - Rendered into the `#vibePresetSelect` dropdown via `renderVibePresets()`.
- **Key local changes**:
  - Each saved vibe now stores the **normalized palette** alongside label and prompt:
    - Structure per entry:
      - `raw`: original prompt.
      - `label`: short label for dropdown display.
      - `ts`: last-updated timestamp (ms).
      - `palette`: normalized palette from `normalizePalette(...)`.
  - `saveVibePreset(palette)` still:
    - Dedupes by `raw` (most recent to front).
    - Caps list at 10 entries.
    - Persists to `localStorage`.
    - Re-renders `#vibePresetSelect`.

#### 2.2. Cloud sync hooks (auth-gated, non-blocking)

- New cloud sync hook:
  - `debouncedVibeSync` (parallel to crate/history/session sync).
- New function:
  - `syncVibesToCloud()`:
    - **Guarded** by `AUTH_ENABLED` and `rplusSupabase`.
    - Builds `vibesPayload` from `savedVibes` (up to 50 entries):
      - `kind`: `"recent"` (future-safe).
      - `label`: vibe label.
      - `prompt`: `raw` text.
      - `palette`: normalized palette object (or `null`).
      - `updatedAt`: ISO timestamp derived from `ts`.
    - Calls `sync-vibes` Netlify function via `callAuthedFunction("sync-vibes", "POST", { vibes })`.
    - On success, emits client telemetry:
      - `vibe_preset_synced`
      - `vibe_recent_synced`
- `saveVibePreset` now:
  - Triggers `debouncedVibeSync` (when auth/cloud is enabled).
  - Emits sampled telemetry event:
    - `vibe_preset_saved` with `{ raw, label }`.

#### 2.3. Hydration and merge logic on sign-in

- In `fetchCloudData(token)`:
  - New vibes section after playlists:
    - Calls `sync-vibes` with `GET`.
    - If a payload is returned:
      - Builds a `mergedByKey` map keyed by:
        - `kind` + normalized `prompt` (`kind|prompt.toLowerCase()`).
      - Adds both:
        - Existing local entries from `savedVibes` (as `"recent"` kind).
        - Cloud entries from `cloudVibes.items` (any `kind` supported).
      - For each key:
        - Keeps the entry with the **newest timestamp** (`ts`).
      - Produces `mergedList`:
        - Sorted by `ts` desc.
        - Capped at 20 entries.
      - Rebuilds `savedVibes`:
        - `raw`: normalized prompt.
        - `label`: cloud label, or `vibeLabelForPalette(palette)`, or prompt.
        - `ts`: merged timestamp.
        - `palette`: normalized palette (if present).
      - Persists to `STORAGE_KEY_VIBES`.
      - Calls `renderVibePresets()` so dropdown reflects merged cloud+local history.
      - Emits `vibe_hydration_success` with `{ count }`.
    - On error:
      - Emits `vibe_hydration_failure` with a safe stringified error, but **does not** affect local UX.
- On auth state change (`rplusSupabase.auth.onAuthStateChange`):
  - After a successful sign-in and optional migration:
    - Calls `fetchCloudData(session.access_token)` to hydrate crate/history/session/playlists/vibes.
    - Then calls:
      - `syncCrateToCloud()`
      - `syncHistoryToCloud()`
      - `syncSessionStateToCloud()`
      - `syncPlaylistsToCloud()`
      - **New**: `syncVibesToCloud()`

### 3. Backend: `sync-vibes` Netlify Function

#### 3.1. Endpoint behavior

- File: `netlify/functions/sync-vibes.js`
- Auth:
  - Gated by `AUTH_ENABLED` and `getJwtUser(req)`.
  - Returns `200 { auth_enabled: false }` when auth is disabled.
  - Returns `401` when JWT is missing/invalid.
  - Honors CORS via `allowOrigin` (same pattern as other sync functions).
- **GET**:
  - Calls Supabase REST:
    - `vibes?select=kind,label,prompt,palette,updated_at&order=updated_at.desc&limit=100`
  - Maps rows to:
    - `{ kind, label, prompt, palette, updatedAt }`
  - Telemetry:
    - `sync_vibes_hydrate_empty` when no data.
    - `sync_vibes_hydrate_success` with `count`.
  - Response:
    - `{ hasData: boolean, items: [...] }`
- **POST**:
  - Expects body: `{ vibes: [...] }`
  - Validates and builds payload:
    - `user_id`: JWT `uid`.
    - `kind`: `"recent"` or provided value.
    - `label`, `prompt`, `palette`.
    - `updated_at`: provided `updatedAt` or `now`.
    - `_upsert: true` (for helper semantics).
  - Calls Supabase REST:
    - `vibes?on_conflict=user_id,kind,prompt` with `POST` payload.
  - Telemetry:
    - `sync_vibes_success` with `synced` count.
    - `sync_vibes_error` on failure.

> **Schema expectation** (handled outside this slice): Supabase `vibes` table with composite key `(user_id, kind, prompt)` and JSON-capable `palette` column.

### 4. Dedupe & Merge Rules

- **Key**:
  - `kind` + normalized `prompt` (lowercased, trimmed).
- **Merge strategy**:
  - For a given key:
    - Compare timestamps:
      - Local `ts` (ms).
      - Cloud `updatedAt` parsed as ms.
    - Keep whichever is **newer**.
- **Output**:
  - Sorted by `ts` desc.
  - Capped at 20 merged entries.
- **Guarantees**:
  - No duplicate prompts for the same `kind` in the dropdown.
  - Local-only entries are preserved if cloud is missing or stale.
  - Cloud entries are respected when newer than local.

### 5. Auth Safety & Failure Modes

- When `AUTH_ENABLED === false`:
  - All cloud calls (`callAuthedFunction`) short-circuit and return `null`.
  - `syncVibesToCloud` and `fetchCloudData` sections effectively no-op.
  - Vibe behavior is **identical** to the prior local-only implementation.
- When `AUTH_ENABLED === true` but cloud/Supabase calls fail:
  - `sync-vibes` function returns appropriate error, but frontend:
    - Catches errors.
    - Logs `vibe_hydration_failure` telemetry.
    - Maintains existing `savedVibes` from local storage.
    - Keeps the dropdown and vibe search fully functional.
  - No blank shell, no thrown errors that would break boot or shuffle flows.

### 6. Telemetry

- **Client events added**:
  - `vibe_preset_saved` — when a preset is stored locally (sampled via `shouldSample()`).
  - `vibe_preset_synced` — when POST `/sync-vibes` succeeds, reports `{ synced }`.
  - `vibe_recent_synced` — same POST, also reports `{ synced }` for recent flows.
  - `vibe_hydration_success` — on successful merged hydration, `{ count }`.
  - `vibe_hydration_failure` — on hydration errors, `{ error }`.
- **Server events added**:
  - `sync_vibes_hydrate_empty`
  - `sync_vibes_hydrate_success`
  - `sync_vibes_success`
  - `sync_vibes_error`

All telemetry is **fire-and-forget** and wrapped in `try/catch`, so it never impacts UX.

### 7. Verification Results

- `scripts/verify_local_dev.ps1`:
  - **PASS**
  - Log: `logs/verify_local_dev_20260312_130232.log`
  - Local fixture mode still returns:
    - `sc-health`: `ok: false` + banner.
    - `sc-official-search` / `sc-official-resolve`: HTTP 200 with fixtures.
  - New vibe sync code does not affect these flows when auth is disabled.
- `scripts/verify_prod.ps1`:
  - **PASS**
  - Log: `logs/verify_prod_20260312_130235.log`
  - Wrapper behavior remains unchanged and green (same degraded mode behavior for rate limits).
- `scripts/verify_frontend_boot.ps1`:
  - **PASS**
  - Log: `logs/verify_frontend_boot_20260312_130241.log`
  - Boot now reliably shows a non-placeholder track title (`"Finding…"` in the Playwright check), and theme toggle verification still passes.

### 8. Sanity Checks / Notes

- **Local-only mode**:
  - With `AUTH_ENABLED=false`, vibe presets/history behave exactly as before:
    - Recent vibes are persisted and rendered from `localStorage`.
    - No network or cloud dependencies.
- **Signed-in mode (when enabled)**:
  - On sign-in:
    - Existing local presets are merged with cloud entries.
    - Dropping into a different device/browser with the same account will:
      - Hydrate vibe presets from the `vibes` table.
      - Merge with any new local ones.
      - Keep duplicates out of the dropdown.
  - On subsequent searches:
    - Presets are pushed to cloud in the background, respecting local-first behavior.
- **Cloud failures**:
  - Any Supabase / `sync-vibes` errors are swallowed with telemetry only.
  - The vibe dropdown and search UX remain fully driven by local data.

