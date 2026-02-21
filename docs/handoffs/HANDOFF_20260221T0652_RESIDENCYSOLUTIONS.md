# Handoff: RESIDENCY+ Health Guard (Daytime Low-Load)

**Lane Selected:** ResidencySolutions (G2 - RESIDENCY+ Prototype)  
**Task Shipped:** Implement SoundCloud env health gate + prevent request spam.

## Files Changed
- `prototypes/residency-plus/index.html` (Added frontend `checkHealth` guard, banner, and gated all events)
- `prototypes/residency-plus/netlify/functions/sc-health.js` (NEW: Health check endpoint)
- `prototypes/residency-plus/netlify/functions/sc-search.js` (Added CORS preflight + 400 gate)
- `prototypes/residency-plus/netlify/functions/sc-resolve.js` (Added CORS preflight + 400 gate)
- `prototypes/residency-plus/netlify/functions/sc-related.js` (Added CORS preflight + 400 gate)
- `docs/lanes/RESIDENCYSOLUTIONS.md` (Documented `netlify dev --offline` + `curl.exe` behaviors)
- `prototypes/residency-plus/SMOKE_TEST.md` (NEW: Smoke test runbook)

## Verification Evidence
```text
PS> curl.exe -i "http://localhost:8888/.netlify/functions/sc-health"
HTTP/1.1 200 OK
content-type: application/json
access-control-allow-origin: *

{"ok":false,"message":"Missing or placeholder SOUNDCLOUD_CLIENT_ID"}

PS> curl.exe -i "http://localhost:8888/.netlify/functions/sc-search?q=test&kind=tracks"
HTTP/1.1 400 Bad Request
content-type: application/json
access-control-allow-origin: *

{"error":"Missing SOUNDCLOUD_CLIENT_ID. Set it in your shell or Netlify env vars (see .env.example)."}
```
- UI Verification: `index.html` gracefully shows `#ef4444` top banner and completely stops initialization `autoDig` cascades when missing the ID.

## Risk / Rollback Note
- **Risk:** Very low computing footprint. The site is physically incapable of spamming the SC API when misconfigured.
- **Rollback:** `git revert 9df4ece`

## Exact Next Atomic Prompt (For Tonight's Heavier Run)
> "Checkout `prototypes/residency-plus`. Implement a genuine `SOUNDCLOUD_CLIENT_ID` configuration for local development. Add rate-limiting/debounce to the UI search triggers using `checkHealth`, then deploy to Netlify and verify the live site no longer shows the error banner."
