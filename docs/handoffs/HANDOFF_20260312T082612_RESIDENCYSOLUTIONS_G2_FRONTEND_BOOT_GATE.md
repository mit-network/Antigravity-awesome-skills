## Handoff: Frontend Supabase Parse Hotfix + Boot Gate

- **Lane**: ResidencySolutions G2 (RESIDENCY+)
- **Slice**: Frontend Supabase Parse Fix + Boot Smoke Verification
- **Date**: 2026-03-12
- **Hotfix Commit**: `db3a8c17953f8fa63bc951b6aeca6ff964590999`
- **Smoke Commit**: `8f4ae531a3b59615484d14a41b404d0053d48ae8`

### Problem

- Browser console was showing:
  - `Uncaught SyntaxError: Identifier 'supabase' has already been declared (index):1123`
- This was a **frontend parse-time failure**, not a backend/SoundCloud issue.
- The existing verification scripts (`verify_local_dev.ps1`, `verify_prod.ps1`) only exercised the Netlify functions and did **not** detect this class of frontend error, allowing a false green state.

### Root Cause

- `index.html` declared a `let supabase = null;` in the main script block **while** also loading the Supabase CDN script:
  - `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`
- The CDN library defines a global `supabase` object, and the combination of that global and our own `let supabase` produced a duplicate identifier error in the browser.
- Result: the entire inline script failed to parse, leading to a blank shell despite backend endpoints being healthy.

### Hotfix: Supabase Client Handle

- **File changed**: `prototypes/residency-plus/index.html`

- Replaced the conflicting global with a distinct client handle:
  - Before:
    - `let supabase = null;`
  - After:
    - `let rplusSupabase = null;` with a comment clarifying it is a separate client handle.

- Updated all front-end auth/cloud references to use `rplusSupabase` instead of `supabase`:
  - Initialization:
    - `rplusSupabase = window.supabase.createClient(SUPA_URL, SUPA_KEY);`
  - Session/token helpers:
    - `getNetlifyToken()` → `rplusSupabase.auth.getSession()`
    - `callAuthedFunction()` guards on `rplusSupabase`
  - Auth flows:
    - `supabase.auth.signUp` / `signInWithPassword` / `signOut` → `rplusSupabase.auth.*`
  - Cloud sync & migration:
    - All `supabase` checks replaced with `rplusSupabase` checks.
    - `supabase.auth.onAuthStateChange` → `rplusSupabase.auth.onAuthStateChange`.

- This removes the duplicate identifier while still using the CDN-exported `window.supabase` object as the backing implementation.

### Frontend Boot Smoke Verification

To prevent similar false greens in the future, a dedicated frontend boot verifier was added.

#### 1) Node-based Verifier

- **File**: `prototypes/residency-plus/scripts/verify_frontend_boot.mjs`

- Behavior:
  1. Ensures `logs/` exists and writes to:
     - `logs/verify_frontend_boot_<timestamp>.log`
  2. Attempts to import `playwright` and launch headless Chromium.
     - If `playwright` is not installed, logs a clear message and exits with code `1`.
  3. Navigates to `http://localhost:8888/` (assumes `netlify dev` is already running).
  4. Listens for browser console errors:
     - Fails if any console message contains `Uncaught` **and** `SyntaxError` or `ReferenceError`.
  5. Validates visible current result:
     - Waits for `.shell` to render.
     - Checks `#trackTitle` text; fails if blank or placeholder (`"—"`) after boot.
  6. Validates theme toggle:
     - Reads `document.body.dataset.theme` before and after clicking `#themeBtn`.
     - Fails if theme attribute does not change.
  7. Logs a PASS message and exits `0` only if all checks succeed.

#### 2) PowerShell Wrapper

- **File**: `prototypes/residency-plus/scripts/verify_frontend_boot.ps1`

- Behavior:
  - Writes its own timestamped log in `logs/verify_frontend_boot_<timestamp>.log`.
  - Verifies `node` is available and that `scripts/verify_frontend_boot.mjs` exists.
  - Executes the Node verifier and mirrors its output into the PowerShell log.
  - Exits `0` on success; exits `1` on any failure (including missing Node or Playwright), ensuring CI/local gating is strict.

### Updated Release Gate Definition

After this slice, a **fully green** Residency+ state now requires:

1. `scripts/verify_local_dev.ps1` → **PASS**
2. `scripts/verify_prod.ps1` → **PASS**
3. `scripts/verify_frontend_boot.ps1` → **PASS**

All three scripts emit timestamped logs in `logs/` for traceability.

### Latest Verification (Post-Hotfix + Boot Gate)

- **Backend / Functions**
  - Local: `verify_local_dev.ps1` → PASS
    - Latest log: `logs/verify_local_dev_20260312_082527.log`
  - Prod: `verify_prod.ps1` → PASS
    - Latest log: `logs/verify_prod_20260312_082533.log`

- **Frontend Boot**
  - `scripts/verify_frontend_boot.ps1` currently fails with:
    - "Playwright not available. Install 'playwright' to enable frontend smoke tests."
  - This is **expected** until Playwright is installed on the environment; the gate is wired such that missing Playwright now correctly flags the frontend verification as red rather than silently passing.

Once Playwright is installed and the verifier is re-run, a fully green state will require all three scripts to report PASS.

