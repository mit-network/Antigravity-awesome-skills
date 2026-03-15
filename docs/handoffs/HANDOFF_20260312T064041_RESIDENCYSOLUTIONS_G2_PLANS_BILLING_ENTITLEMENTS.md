## Handoff: Plans, Billing, and Entitlements Foundation (Residency+)

- **Lane**: ResidencySolutions G2 (RESIDENCY+ SoundCloud Digger)
- **Slice**: Plans + Billing + Entitlements foundation
- **Date**: 2026-03-12
- **Commit**: `ff4e07dd72d8953870b9741a42c8c79ded4968fc`

### Verification Baseline (Post-Slice)

- `scripts/verify_local_dev.ps1` → **PASS**
  - Log: `logs/verify_local_dev_20260312_064027.log`
- `scripts/verify_prod.ps1` → **PASS**
  - Log: `logs/verify_prod_20260312_064035.log`

Auth/cloud (`AUTH_ENABLED=false` by default) and anonymous/local behavior remain unchanged and fully functional.

---

### Plan Model

- **Plan identifiers**
  - `free`
  - `residency_plus`

- **Supabase schema**
  - `supabase/schema.sql`:
    - `public.users.plan` default remains `'free'`, with comment updated to:
      - `-- 'free' | 'residency_plus'`
    - `public.users.plan_expires_at` retained for future grace-period logic.
    - `public.users.stripe_customer_id` kept as Stripe attachment point.
  - Stubbed (commented) `public.entitlements` table added for future migration of entitlements into the database; **not used in this slice**.

---

### Central Entitlements Helper (Single Source of Truth)

- **File**: `netlify/functions/lib/entitlements-lib.js`

- **Exports**
  - `PLAN_FREE = "free"`
  - `PLAN_RESIDENCY_PLUS = "residency_plus"`
  - `getEntitlementsForPlan(plan)` → returns:
    - `plan`: normalized plan id
    - `crateLimit`
    - `historyLimit`
    - `playlistsLimit`
    - `playlistItemsLimit`
    - `exportLimit`

- **Current matrix**
  - `free`:
    - `crateLimit`: 50
    - `historyLimit`: 200
    - `playlistsLimit`: 3
    - `playlistItemsLimit`: 50
    - `exportLimit`: 200
  - `residency_plus`:
    - `crateLimit`: 1000
    - `historyLimit`: 2000
    - `playlistsLimit`: 25
    - `playlistItemsLimit`: 200
    - `exportLimit`: 1000

All server-side enforcement now reads limits from this helper, avoiding scattered magic numbers and keeping the system ready for a future G1-driven entitlements table.

---

### Backend-Enforced Limits (Crate, History, Session, Playlists)

The following Netlify functions now enforce entitlements using `getEntitlementsForPlan` and Supabase `public.users.plan`:

1. **`sync-crate.js`**
   - After extracting the authenticated user, calls:
     - `supabaseRestCall("users?id=eq.<uid>&select=plan", "GET", null, user.token)` (best-effort).
     - Falls back to `"free"` on any error.
   - Computes `const entitlements = getEntitlementsForPlan(plan)`.
   - For `POST`:
     - Applies `entitlements.crateLimit` when slicing the incoming crate payload before upsert.
   - For `GET`:
     - Behavior unchanged: returns full crate for user.

2. **`sync-history.js`**
   - Similar plan lookup to `sync-crate`.
   - For `POST`:
     - Applies `entitlements.historyLimit` as the maximum number of history entries accepted per sync call.
   - For `GET`:
     - Still returns the latest 50 rows as before; free/pro differences are enforced on write volume, not read count, for this slice.

3. **`sync-playlists.js`**
   - Plan lookup identical to above.
   - For `POST`:
     - Applies:
       - `entitlements.playlistsLimit` → maximum playlists accepted in a sync.
       - `entitlements.playlistItemsLimit` → maximum items per playlist.
     - Existing behavior (upsert playlist, clear items, reinsert) is preserved, just bounded by entitlements.
   - For `GET`:
     - Unchanged; returns all of user’s playlists/items (still subject to Supabase row limits).

4. **`migrate-local-data.js`**
   - Uses entitlements when migrating anonymous local data into an account:
     - `entitlements.crateLimit` caps migrated crate items.
     - `entitlements.playlistsLimit` and `entitlements.playlistItemsLimit` cap migrated playlists/items.
   - Session-state migration is unaffected (always upserted).

All of the above functions **continue to respect `AUTH_ENABLED`** and return `{ auth_enabled: false }` when the flag is off, ensuring anonymous/local mode remains pristine.

---

### Entitlements API

- **File**: `netlify/functions/get-entitlements.js`

- Behavior:
  - OPTIONS → CORS preflight.
  - If `AUTH_ENABLED` is `false`:
    - Returns `200 { auth_enabled: false, plan: "free", entitlements: <free limits> }`.
  - If `AUTH_ENABLED` is `true`:
    - Attempts to parse JWT with `getJwtUser(req)`.
    - If unauthenticated:
      - Returns `200 { authenticated: false, plan: "free", entitlements: <free limits> }`.
    - If authenticated:
      - Reads `public.users.plan` via `supabaseRestCall`.
      - Returns `200 { authenticated: true, plan, entitlements }`, with `plan` normalized by `entitlements-lib`.

This provides a single, canonical surface for any future UI or G1 integration that needs to know current plan and effective limits.

---

### Billing Foundation (Stripe)

#### 1) Checkout Session Creation

- **File**: `netlify/functions/billing-create-checkout.js`

- Guarding:
  - Controlled by `BILLING_ENABLED` env var and Stripe envs:
    - `STRIPE_SECRET_KEY`
    - `STRIPE_PRICE_RESIDENCY_PLUS`
  - If billing is not configured:
    - Returns `200 { billing_enabled: false }` without throwing.

- When billing is enabled and configured:
  - Validates JWT via `getJwtUser(req)`.
  - Lazily imports Stripe (`await import("stripe")`) to avoid hard dependency when disabled.
  - Creates a **subscription-mode Checkout Session**:
    - Single line item for `STRIPE_PRICE_RESIDENCY_PLUS`.
    - `customer_email` set from Supabase user email where available.
    - Uses `success_url` / `cancel_url` from request body or `BILLING_SUCCESS_URL` / `BILLING_CANCEL_URL` env vars.
    - Attaches `metadata.rplus_user_id = <uid>` to tie the Stripe session back to our Supabase `users` row.
  - Returns `200 { billing_enabled: true, url: <session.url> }`.
  - Any Stripe error returns `500` with an error message, but this function is opt-in and **never affects anonymous/local app behavior**.

#### 2) Webhook Handling

- **File**: `netlify/functions/billing-webhook.js`

- Guarding:
  - Enabled only when **all** of the following are set:
    - `BILLING_ENABLED === "true"`
    - `STRIPE_SECRET_KEY`
    - `STRIPE_WEBHOOK_SECRET`
  - Otherwise:
    - Accepts `POST` and returns `200 { billing_enabled: false }` without side effects.

- When enabled:
  - Validates Stripe signature using `stripe.webhooks.constructEvent`.
  - For subscription lifecycle events (`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`):
    - Attempts to extract `userId` from `event.data.object.metadata.rplus_user_id`.
    - If `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are configured:
      - Issues a REST `PATCH` to `public.users`:
        - Sets `plan = 'residency_plus'`.
        - Sets `plan_expires_at` from `current_period_end` when present.
  - For cancellation events (`customer.subscription.deleted`, `customer.subscription.cancelled`):
    - Similarly patches `public.users` back to:
      - `plan = 'free'`
      - `plan_expires_at = null`
  - All Supabase updates are **best-effort**:
    - Any failures are swallowed and do **not** cause a webhook 500.
  - Returns `200 { received: true, type: <event.type> }` on success.

This provides a safe foundation to attach billing state to account state without risking app availability. Until envs are wired, all billing endpoints degrade to explicit “disabled” responses.

---

### Safety and Deferred Work

**Safety guarantees in this slice**

- `AUTH_ENABLED` remains `false` by default; all cloud/billing paths are opt-in.
- Entitlement enforcement is **additive**:
  - When auth/cloud is disabled, all sync functions short-circuit and anonymous/local mode is untouched.
  - When enabled, server-side limits trim payloads but never delete existing local data.
- Billing functions:
  - Are fully no-op when envs are missing or `BILLING_ENABLED` is false.
  - Never influence SoundCloud wrappers or the core crate/history/stations UX used in verification scripts.
- Both verification scripts continue to exercise only the SoundCloud endpoints and remain PASS on the committed tree.

**Deferred / Out-of-scope**

- No UI for plan selection or “Upgrade” flows yet; the front-end remains visually identical aside from the previously added auth entry point.
- No Stripe Customer Portal integration or in-app subscription management UI.
- No advanced discovery / Vibe Search gating:
  - Entitlements include placeholders (e.g., `exportLimit`) but are not yet wired into those future features.
- No team/studio tiers or multi-user account structures.
- No cross-system G1-driven entitlements yet:
  - `entitlements-lib.js` is the current single source of truth; the commented-out `public.entitlements` table is reserved for a future G1-led migration.

