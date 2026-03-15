## Residency+ Customer Portal & Subscription Management

- **Timestamp**: 20260312_133424
- **Slice**: Customer Portal / Subscription Management
- **Branch**: `feat/discovery-engine-v1`
- **Commit**: `4f426dfce54933791646bf81e44ad3158e4b1f58`

### 1. Files Changed

- `index.html`
- `netlify/functions/billing-create-portal-session.js`

### 2. Frontend: Account / Plan UI Enhancements

All changes are scoped to the existing auth/account modal; no new pages or broad redesign.

#### 2.1. Signed-in account panel

- In the `#authSignedInState` section:
  - **Plan label**:
    - `#planBadge` still shows the current plan, now with slightly tighter spacing.
  - **Billing status hint**:
    - New `#billingStatusHint` text line beneath the plan:
      - For `currentPlan === "residency_plus"`:
        - “Your Residency+ subscription is active. Manage or update your billing below.”
      - For all other plans (including free):
        - “You’re on the Free plan. Upgrade to unlock Residency+ features.”
  - **Upgrade CTA**:
    - Existing `#upgradeBtn` retained:
      - Visible only when `currentPlan !== "residency_plus"`.
      - Continues to call `billing-create-checkout` via `callAuthedFunction`.
  - **Manage subscription CTA**:
    - New `#manageSubBtn`:
      - Style: secondary button, full width, matches existing button styles.
      - Visibility:
        - Shown only when `currentPlan === "residency_plus"`.
        - Hidden on free/other plans to keep the surface compact.
  - **Billing message line**:
    - Existing `#billingMsg` retained as a small inline status/error line under the buttons.

#### 2.2. Plan state & billing status wiring

- `applyPlanUI()` now:
  - Sets `#planBadge` text from `currentPlan` as before.
  - Updates `#billingStatusHint` with a brief, friendly description of the user’s status.
  - Toggles `#manageSubBtn` display:
    - `block` when on `residency_plus`.
    - `none` otherwise.
  - Clears any stale text in `#billingMsg`.
  - Emits lightweight telemetry:
    - `billing_status_viewed` with `{ plan: currentPlan }`.
- `refreshPlanAndEntitlements()` remains responsible for:
  - Calling `get-entitlements` via `callAuthedFunction`.
  - Setting `currentPlan` / `currentEntitlements`.
  - Invoking `applyPlanUI()` after a successful response.

#### 2.3. Manage subscription button behavior

- `manageSubBtn.onclick`:
  - Clears `#billingMsg`.
  - Emits telemetry (best-effort):
    - `customer_portal_open_clicked`.
  - Calls `billing-create-portal-session` via:
    - `callAuthedFunction("billing-create-portal-session", "POST", { return_url: window.location.href })`.
  - Behavior on response:
    - If response is falsy or `billing_enabled === false`:
      - Sets `#billingMsg` to:
        - “Subscription management is currently unavailable.”
      - Emits `customer_portal_unavailable`.
      - Returns without redirect.
    - If response has a `url`:
      - Emits `customer_portal_session_created`.
      - Redirects browser to the portal URL.
    - If response lacks `url` but indicates enabled:
      - Sets `#billingMsg` to:
        - “Unable to open subscription management. Try again later.”
  - On thrown errors:
    - `#billingMsg` is set to:
      - “Subscription management failed. Try again later.”
- All telemetry calls are wrapped in `try/catch` and are strictly non-blocking.

### 3. Backend: `billing-create-portal-session` Function

#### 3.1. Overview

- File: `netlify/functions/billing-create-portal-session.js`
- Purpose:
  - Provide a small, Stripe-backed customer portal session endpoint mirroring the existing checkout foundation.
  - Allow authenticated users to manage their subscriptions (update card, cancel, etc.) from a self-serve Stripe Billing Portal.

#### 3.2. Behavior & Guards

- CORS & methods:
  - Supports `OPTIONS` with standard CORS headers via `allowOrigin`.
  - Only accepts `POST` for session creation; otherwise returns `405`.
- Billing enablement checks:
  - Reads:
    - `BILLING_ENABLED`
    - `STRIPE_SECRET_KEY`
    - `STRIPE_BILLING_PORTAL_RETURN_URL` (or a chain of fallback URLs)
  - If any are missing or `BILLING_ENABLED !== "true"`:
    - Logs telemetry: `billing_portal_disabled`.
    - Returns `200` with:
      - `{ billing_enabled: false }`
    - This keeps the app fully functional even without billing configured.
- Auth:
  - Uses `getJwtUser(req)` to identify the current user.
  - On missing/invalid token:
    - Logs `billing_portal_auth_invalid`.
    - Returns `401` with an error.

#### 3.3. Stripe portal session creation

- When enabled and authenticated:
  - Lazily imports Stripe with `apiVersion: "2023-10-16"`.
  - Parses `body`:
    - `return_url` (optional override; otherwise falls back to a chain of env-based URLs with a final hardcoded production URL).
    - `customer_id` (optional, so the same function can support future direct customer lookups).
  - Session params:
    - If `customer_id` provided:
      - `{ customer: customerId, return_url }`
    - Else:
      - `{ return_url }` (Stripe will resolve customer via session if configured).
  - Calls `stripe.billingPortal.sessions.create(params)`.
  - On success:
    - Logs `billing_portal_session_created`.
    - Returns `200` with:
      - `{ billing_enabled: true, url: session.url }`
  - On failure:
    - Logs `billing_portal_error` with error message.
    - Returns `500` with non-fatal error payload (frontend treats these as availability failures only).

### 4. Fail-Safe Behavior & Modes

- **Anonymous / local-only mode**:
  - `AUTH_ENABLED` remains `false` by default.
  - Existing guard in `index.html`:
    - Hides the account button entirely when auth is disabled.
  - In this mode:
    - Customer portal and billing UI are effectively unreachable.
    - Local crate, discovery, vibe, etc., continue to function as before.
- **Auth enabled but billing disabled/misconfigured**:
  - `billing-create-portal-session` and `billing-create-checkout` both:
    - Return `{ billing_enabled: false }` with 200 status.
    - Emit telemetry about being disabled.
  - Frontend:
    - Shows small inline messages in `#billingMsg`:
      - “Billing is currently unavailable.” (upgrade flow)
      - “Subscription management is currently unavailable.” (portal flow)
    - Leaves the rest of the account UI and shell completely intact.
- **Billing enabled but transient failure**:
  - Any thrown errors in checkout or portal creation:
    - Are caught on the frontend.
    - Display concise text:
      - “Upgrade failed. Try again later.”
      - or “Subscription management failed. Try again later.”
  - No unhandled errors bubble to the top-level; no regressions to auth/cloud or other flows.

### 5. Telemetry

- **New client-side events**:
  - `billing_status_viewed` — emitted when plan state is applied to the UI, with `{ plan }`.
  - `customer_portal_open_clicked` — emitted when the “Manage subscription” button is pressed.
  - `customer_portal_session_created` — emitted when a valid portal `url` is returned.
  - `customer_portal_unavailable` — emitted when the portal endpoint responds with `billing_enabled: false`.
- **New server-side events (Stripe portal function)**:
  - `billing_portal_disabled`
  - `billing_portal_auth_invalid`
  - `billing_portal_session_created`
  - `billing_portal_error`

All telemetry remains best-effort and wrapped in error handling to avoid affecting UX.

### 6. Verification Results

- `scripts/verify_local_dev.ps1`:
  - **PASS**
  - Log: `logs/verify_local_dev_20260312_133340.log`
  - Local fixture mode remains unchanged; billing/portal has no effect on these checks.
- `scripts/verify_prod.ps1`:
  - **PASS**
  - Log: `logs/verify_prod_20260312_133344.log`
  - Wrapper behavior remains fully green; billing changes do not touch any Netlify SoundCloud wrapper paths.
- `scripts/verify_frontend_boot.ps1`:
  - **PASS**
  - Log: `logs/verify_frontend_boot_20260312_133350.log`
  - App still boots with a valid track title and theme toggle behavior; account/billing UI is behind the existing auth flag and does not interfere with boot.

### 7. Deferred / Out-of-Scope

- Any broader account/settings dashboard beyond the existing compact modal.
- Multi-tenant or team/studio subscription tiers.
- Deep Stripe customer lookup and mapping based on stored `stripe_customer_id` (current implementation assumes basic portal usage keyed by the authenticated user).
- Detailed billing history, invoices, receipts, or support center UI.
- Any new paywalling or complex gating of product features beyond the existing entitlements + plan badge behavior.

