## Residency+ Customer Portal Visibility & Auth Config Fix

- **Timestamp**: 20260312_143930
- **Slice**: Customer Portal Visibility / Access Fix
- **Branch**: `feat/discovery-engine-v1`
- **Commit**: `5c347d2ccaca8f8a7798e9f2f96cbc674cc6e332`

### 1. Files Changed

- `index.html`

### 2. AUTH_ENABLED Configuration (Old vs New)

#### Previous behavior

- `index.html` contained a hardcoded flag:
  - `const AUTH_ENABLED = false;`
- Effects:
  - Auth/account UI and Supabase wiring were **permanently disabled** in all environments.
  - The account entry point and customer portal access were structurally unreachable from the UI.

#### New behavior

- `AUTH_ENABLED` is now computed via a small resolver:

  - `const AUTH_FLAG_ENV = "%%AUTH_ENABLED%%";`
  - `function resolveAuthEnabled() { ... }`
  - `const AUTH_ENABLED = resolveAuthEnabled();`

- `resolveAuthEnabled()` checks, in order:
  1. **Runtime config hooks** (for deployments/tests):
     - `window.RPLUS_CONFIG && window.RPLUS_CONFIG.authEnabled === true`
     - `window.RPLUS_AUTH_ENABLED === true`
  2. **Build-time flag**:
     - `AUTH_FLAG_ENV === "true"` (e.g., Netlify/CI can replace `%%AUTH_ENABLED%%` with `"true"` at build time)
  3. **Dev/test URL override**:
     - Query param `?auth=on`, `?auth=true`, or `?auth=1`
  4. **Fallback**:
     - Returns `false` (safe default) if none of the above are set or if any error occurs.

- **Default-safe mode**:
  - With no replacements and no runtime hooks/URL flags, `AUTH_FLAG_ENV` remains `"%%AUTH_ENABLED%%"`, so:
    - `resolveAuthEnabled()` returns `false`.
  - This preserves the previous anonymous/local-only behavior in all current environments by default.

### 3. Account / Portal Visibility Behavior

#### 3.1. Default-safe mode (`AUTH_ENABLED === false`)

- In this mode:
  - Existing guard early in the auth wiring still:
    - Hides the account button.
    - Returns without initializing Supabase or auth UI.
  - Result:
    - App behaves exactly as before:
      - Anonymous/local mode only.
      - No account modal.
      - No Upgrade/Manage subscription UI.
    - All stable verification gates remain green (see section 5).

#### 3.2. Auth-enabled mode (`AUTH_ENABLED === true`)

- When any of the config signals opt-in to auth:
  - `resolveAuthEnabled()` returns `true`, and:
    - Supabase client initialization runs (given valid `SUPA_URL`/`SUPA_KEY`).
    - Account button becomes visible and enabled.
    - Existing account modal wiring (sign in / sign up) becomes reachable.
    - Plan badge, billing status hint, Upgrade button, and Manage subscription button (for `residency_plus` users) are all available as previously implemented in the subscription management slice.
- This makes the customer portal path:
  - **Reachable** in environments that intentionally enable auth.
  - **Still invisible** in the default-safe anonymous mode.

### 4. How to Test the Signed-In Portal Path (Controlled Mode)

To exercise the auth/account + customer portal path **without** breaking the default-safe behavior:

1. **Enable auth in a controlled environment**
   - Option A (recommended for staging / prod-like env):
     - At build/deploy time, replace `%%AUTH_ENABLED%%` with `"true"` for a **staging** deployment only.
     - Example: use a build step or Netlify redirect to do a simple string replacement.
   - Option B (runtime config, useful locally or in dev tools):
     - Before `index.html` runs, define:
       - `window.RPLUS_CONFIG = { authEnabled: true };`
     - Or in the browser console:
       - `window.RPLUS_AUTH_ENABLED = true;` then reload.
   - Option C (dev-only URL override):
     - Load the app with:
       - `http://localhost:8888/?auth=on`
       - or `https://<staging-host>/?auth=on`

2. **Sign in**
   - With `AUTH_ENABLED === true` and Supabase configured:
     - The account button appears.
     - Clicking it opens the existing auth modal.
     - Sign in or sign up as normal to reach a signed-in state.

3. **Verify account/plan UI**
   - In the signed-in state:
     - `planBadge` clearly shows `Plan: Free` or `Plan: RESIDENCY+`.
     - `billingStatusHint` explains:
       - Active Residency+ subscription vs. free plan.
     - Upgrade button is visible only for non-`residency_plus` users.
     - Manage subscription button is visible only when:
       - `currentPlan === "residency_plus"`.

4. **Exercise Manage subscription**
   - Click “Manage subscription”:
     - Frontend sends telemetry `customer_portal_open_clicked`.
     - Calls `callAuthedFunction("billing-create-portal-session", "POST", { return_url: window.location.href })`.
   - If billing is configured and enabled:
     - Backend creates a Stripe Billing Portal session and returns `{ billing_enabled: true, url }`.
     - Frontend emits `customer_portal_session_created` and redirects to the portal at `url`.
   - If billing is unavailable or misconfigured:
     - `billing-create-portal-session` responds with `{ billing_enabled: false }`.
     - Frontend:
       - Sets `billingMsg` to: **“Subscription management is currently unavailable.”**
       - Emits `customer_portal_unavailable`.

### 5. Verification Results (Default-Safe Mode)

All verification gates were re-run in the default-safe (auth-disabled) configuration after the change:

- `scripts/verify_local_dev.ps1`:
  - **PASS**
  - Log: `logs/verify_local_dev_20260312_143854.log`
  - Behavior:
    - Local dev fixture mode remains unchanged; auth/account path remains hidden.
- `scripts/verify_prod.ps1`:
  - **PASS**
  - Log: `logs/verify_prod_20260312_143857.log`
  - Behavior:
    - Production SoundCloud wrappers and health remain green; auth config does not affect these endpoints.
- `scripts/verify_frontend_boot.ps1`:
  - **PASS**
  - Log: `logs/verify_frontend_boot_20260312_143903.log`
  - Behavior:
    - App still boots with a valid track title and theme toggle behavior.
    - Auth/account wiring stays dormant when `AUTH_ENABLED` resolves to `false`.

### 6. Summary

- **Hardcoded `AUTH_ENABLED = false`** has been replaced with a **configurable resolver** that:
  - Keeps anonymous/local mode as the default-safe baseline.
  - Allows a controlled, environment-driven way to turn auth/account + customer portal **on** without touching inline code.
- In auth-enabled environments:
  - The existing account modal, plan status, and Manage subscription UI are fully reachable and wired to the `billing-create-portal-session` function.
- In auth-disabled environments:
  - UX is identical to the prior stable state; portal paths are dormant but no longer structurally dead — they are simply behind a controllable config flag.

