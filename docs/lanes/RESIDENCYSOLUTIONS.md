# ResidencySolutions Lane
_Last updated: 2026-03-10 06:30 EST_

## Overview
ResidencySolutions has TWO subcomponents:

### G1: Backend / Product Entitlements Core (NO UI)
- **Status:** UI frozen. Focus on centralizing entitlements logic.
- **Hard rule:** No UI changes. Run `scripts/guard-no-ui.ps1` if present.
- **Path:** `G:\DOWNLOADS5\reidchunes\residencysolutions-core`

### G2: RESIDENCY+ SoundCloud Digger Prototype
- **Live site (canonical deploy):** `warm-sunflower-466026.netlify.app` (accessible under the soccerwiz14 Netlify team)
- **Note:** `residencysolutions.netlify.app` is live but on a separate Netlify account not accessible via the CLI token; canonical CLI-accessible site is `warm-sunflower-466026`.
- **Source (original):** `G:\DOWNLOADS5\reidchunes`
- **Source (repo copy):** `prototypes/residency-plus/` in this repo
- **Stack:** Static HTML + Netlify Functions (ES module format)
- **What it does:** SoundCloud crate-digging tool with genre filters, shuffle, stations, auto-dig, saved crate, and history. Uses SoundCloud OAuth2 API via serverless proxy.
- **Legacy endpoints:** REMOVED (quarantined 2026-03-10). Only `sc-official-search` and `sc-official-resolve` remain.

---

## How to Run Locally

### Prerequisites
```powershell
# Install Netlify CLI (if not installed)
npm install -g netlify-cli

# Verify
netlify --version
```

## API Access
- Apply via SoundCloud help article ("Otto" chatbot) to request API access + credentials.
- Use local `.env` for dev; **do not commit secrets**.
- Netlify Dev reads `.env` locally and can pull Netlify env vars (when not offline).

### Local dev modes
```powershell
cd "c:\Users\sean\antigravity-awesome-skills\prototypes\residency-plus"

# Offline mode (won't pull Netlify env vars)
$env:SOUNDCLOUD_CLIENT_ID="YOUR_CLIENT_ID"
netlify dev --offline --dir "." --functions "netlify/functions" --port 8888

# Online mode (can pull Netlify env vars / read from .env file)
netlify dev --dir "." --functions "netlify/functions" --port 8888
```

- **PowerShell note:** `curl` is an alias for `Invoke-WebRequest`; use `curl.exe -i` to see correct headers and non-2xx response bodies.
- **Expected when missing/placeholder:** Functions return 400 JSON with a missing env var message; UI shows a banner; no request spam.

App will be available at `http://localhost:8888`.

### Deploying to Netlify
```bash
# From prototype directory
netlify deploy --prod
```

Set `SOUNDCLOUD_CLIENT_ID` in: Netlify Dashboard → Site Settings → Environment Variables.

---

## Endpoints (Netlify Functions)

### Primary Endpoints (Official OAuth)
These use the **official SoundCloud OAuth2 client_credentials flow** (Bearer token) with origin allowlist + rate limiting.

| Function | Path | Params | Purpose |
|----------|------|--------|---------|
| `sc-official-search` | `/.netlify/functions/sc-official-search` | `q` (required), `limit` (max 20) | Search via official API |
| `sc-official-resolve`| `/.netlify/functions/sc-official-resolve`| `url` (required) | Resolve SC URL |

---

## Security Notes
- **Never hardcode `SOUNDCLOUD_CLIENT_ID` in frontend code.** It stays server-side in Netlify env vars.
- Functions proxy all SoundCloud API calls so the client ID never reaches the browser.
- `.env` file must be gitignored.

---

## File Inventory (`prototypes/residency-plus/`)

```
prototypes/residency-plus/
├── index.html              # Full RESIDENCY+ app
├── netlify.toml            # Build config
└── netlify/
    └── functions/
        ├── sc-auth-lib.js          # Shared OAuth / rate-limit / origin logic
        ├── sc-official-search.js   # Target for search
        └── sc-official-resolve.js  # Target for resolve
```
## Local Runbook (RESIDENCY+ prototype)

### Prereqs
- Node.js installed
- Netlify CLI installed (recommended)

Install Netlify CLI:
```bash
npm i -g netlify-cli

```

---

## Official OAuth Endpoints (new — 2026-03-10)

These endpoints use the **official SoundCloud OAuth2 client_credentials flow** (Bearer token) with origin allowlist + rate limiting. They coexist alongside the legacy endpoints.

| Function | Path | Params | Purpose |
|---|---|---|---|
| `sc-official-search` | `/.netlify/functions/sc-official-search` | `q` (required), `limit` (optional, max 20) | Search via official API |
| `sc-official-resolve` | `/.netlify/functions/sc-official-resolve` | `url` (required, must be `https://soundcloud.com/...`) | Resolve URL via official API |

### Required Environment Variables

| Variable | Purpose |
|---|---|
| `SOUNDCLOUD_CLIENT_ID` | OAuth client ID |
| `SOUNDCLOUD_CLIENT_SECRET` | OAuth client secret (new — required by official flow) |
| `ALLOWED_ORIGINS` | Comma-separated allowed origins, e.g. `http://localhost:8888,http://localhost:3000` |

- **Local dev:** set all three in `prototypes/residency-plus/.env` (gitignored)
- **Deployed:** Netlify Dashboard → Site Settings → Environment Variables (mark `SOUNDCLOUD_CLIENT_SECRET` as **secret**)

### Security Properties
- Bearer token cached in memory only — never written to disk or logged
- Origin allowlist enforced before any processing (403 on disallowed origin)
- Rate limit: 30 requests / 5-minute rolling window per origin key (in-memory, best-effort)
- Output field-shaped — raw upstream responses never passed through to the frontend
- **Frontend must call only these wrapper endpoints** — never SoundCloud directly

### Local Dev (Official Endpoints)
```powershell
cd 'C:\Users\sean\antigravity-awesome-skills\prototypes\residency-plus'
# Ensure .env has all three vars
netlify dev --dir "." --functions "netlify/functions" --port 8888
```
