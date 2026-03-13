## Residency+ G2 – Premium Vibe / Playlist Intelligence Gating

- **Timestamp**: 20260313_070900
- **Slice**: Stronger Premium Gating for Vibe / Playlist Intelligence
- **Branch**: `feat/discovery-engine-v1`

### 1. Files Changed

- `netlify/functions/lib/entitlements-lib.js`
- `index.html`

### 2. What Shipped: Premium Gating for Advanced Vibe Workflows

#### 2.1. Central entitlements extended

- Updated `entitlements-lib.js` to explicitly model advanced vibe-related limits per plan:
  - **RESIDENCY+ (`plan: residency_plus`)**:
    - `vibePresetLimit: 50`
    - `playlistVibeLimit: 9999` (effectively unlimited; frontend uses this as “no ceiling”).
  - **Free tier (`plan: free`)**:
    - `vibePresetLimit: 5`
    - `playlistVibeLimit: 3`
- These new fields are included in the existing `get-entitlements` response so the frontend can make entitlement-aware decisions without hardcoding numbers.

#### 2.2. Saved vibe presets: soft free cap

- In `index.html`, the `saveVibePreset(palette)` helper now respects the plan’s `vibePresetLimit` when `currentPlan === "free"` and entitlements have been loaded:
  - If the user is on the free plan and `savedVibes.length` is already at or above `currentEntitlements.vibePresetLimit`:
    - The function shows a **compact, inline message**:
      - “You’ve reached the free vibe preset limit. Upgrade to RESIDENCY+ to save more favorite vibes.”
    - The preset is **not** added, but the rest of the app continues to function normally.
    - A one-shot flag (`vibePresetLimitPromptShown`) ensures this prompt does not spam on every attempt.
  - Residency+ subscribers (or any plan with a higher `vibePresetLimit`) continue to save presets up to that higher ceiling.
- Notes:
  - This change only affects authenticated flows where `get-entitlements` has returned a plan; anonymous/local mode (where `currentEntitlements` remains `null`) is unchanged.

#### 2.3. Playlist-level vibe intelligence: gated for free, open for Residency+

- The “Vibe from crate” / playlist-intelligence entrypoint wired via:
  - `crateVibeBtn.onclick` → `runPlaylistVibeSearchFromCrate()`
- New behavior for **free plan**:
  - A session-scoped counter (`playlistVibeCount`) tracks how many playlist vibe searches have been run.
  - On each click:
    - If crate is empty, the existing helpful message remains:
      - “Add a few tracks to the saved crate before running a playlist vibe search.”
    - If `window.SC_OK === false`, behavior is unchanged (silently returns to avoid stressing a degraded backend).
    - If `currentEntitlements` exists and `currentPlan === "free"`:
      - We read `const limit = currentEntitlements.playlistVibeLimit || 3`.
      - If `playlistVibeCount >= limit`:
        - Show a **compact, entitlement-aware prompt** once per session:
          - “Free plan playlist vibe limit reached. Upgrade to RESIDENCY+ for deeper playlist intelligence and more "more like this playlist" runs.”
        - Do **not** invoke `runPlaylistVibeSearchFromCrate()` for that click.
      - Else:
        - Increment `playlistVibeCount` and allow the playlist vibe search as before.
- Residency+ subscribers:
  - With `playlistVibeLimit: 9999`, they effectively never hit this ceiling in normal use.
- Anonymous/local mode:
  - When `AUTH_ENABLED` is false or Supabase is unavailable:
    - `currentEntitlements` remains `null`.
    - The new gating branches are skipped, preserving the existing anonymous/local behavior exactly.

### 3. Behavior Notes and Non-Goals

- **Free mode remains genuinely useful**:
  - Users can:
    - Run basic shuffle and station-based discovery.
    - Use ad-hoc vibe search (`runVibeSearch`) without added gating.
    - Save a handful of vibe presets (up to 5) for quick reuse.
    - Use playlist-level vibe intelligence a small number of times per session (default: 3).
- **No giant paywalls**:
  - Gating only appears:
    - When a free user tries to save beyond the preset limit.
    - When a free user exceeds the playlist vibe search allowance.
  - Messages are short, inline, and match existing `showOk` styling rather than modal-style blocks.
- **Fail-safe behavior is preserved**:
  - No changes to:
    - Shell boot behavior.
    - Anonymous/local mode boot protections.
    - Health-check gating around `window.SC_OK`.
  - If entitlements cannot be loaded, the app falls back to the existing behavior, with no hard 500s or broken flows.

### 4. Verification Results

- `scripts/verify_frontend_boot.ps1`:
  - **PASS**
  - Log: `logs/verify_frontend_boot_20260313_070600.log`
- `scripts/verify_prod.ps1`:
  - **PASS**
  - Log: `logs/verify_prod_20260313_070620.log`
- `scripts/verify_local_dev.ps1`:
  - **Env-gated (SoundCloud creds missing)**:
    - Log: `logs/verify_local_dev_20260313_070632.log`
    - Behavior:
      - `sc-health` returns HTTP 200 with `{ ok: false, message: "Missing SOUNDCLOUD_CLIENT_ID..." }`.
      - `sc-official-search` returns HTTP 400 due to missing local SoundCloud credentials.
    - This is consistent with prior behavior and reflects environment prerequisites, not a regression from the premium gating changes.

### 5. Deferred / Out of Scope

- No backend rate-limit changes or deeper server-side enforcement of playlist-vibe or vibe-preset limits beyond the entitlements shape.
- No additional gating on:
  - Synced vibe history depth beyond existing history limit prompts.
  - High-volume auto-dig or bulk export workflows beyond current entitlements.
- No new UI surfaces or flows; all gating is layered onto existing controls and messaging.

