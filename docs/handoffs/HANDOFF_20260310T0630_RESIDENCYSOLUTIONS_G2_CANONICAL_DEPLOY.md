# HANDOFF — ResidencySolutions G2 Canonical Deploy
**Timestamp:** 2026-03-10T06:30:00-04:00 (2026-03-10T10:30:00Z)
**Repo:** `C:\Users\sean\antigravity-awesome-skills`

---

## Canonical Site Result: DEPLOYED & VALIDATED

Deployed the G2 prototype to the canonical CLI-accessible Netlify site.

| | |
|---|---|
| **Canonical site (CLI account)** | `warm-sunflower-466026.netlify.app` |
| **Site ID** | `4b3ec443-be4d-4ec5-9434-2c4a629440a2` |
| **Account** | soccerwiz14 / Residency team |
| **Linked from** | `prototypes/residency-plus/.netlify/state.json` |

> **Note on residencysolutions.netlify.app:** This URL is live (200 OK on root) and has the original RESIDENCY+ app. It belongs to a different Netlify account not accessible via the current CLI token. It cannot be deployed to without that account's credentials. It does NOT yet have the official wrapper functions — `sc-official-search` returns 404 there.

---

## Relink Status: SUCCESS
- Previous link: `residencysolutions-test-2026` (cfd6169d-...)
- New link (via state.json): `warm-sunflower-466026` (4b3ec443-...)

---

## Env Var Presence Summary (canonical site)
| Variable | Status |
|---|---|
| `SOUNDCLOUD_CLIENT_ID` | PRESENT (imported via `netlify env:import .env`) |
| `SOUNDCLOUD_CLIENT_SECRET` | PRESENT |
| `ALLOWED_ORIGINS` | PRESENT |

---

## Sanitized Production Validation
All tests run against `https://warm-sunflower-466026.netlify.app`:

| Test | Result |
|---|---|
| `sc-official-search?q=ambient&limit=2` | **200 OK** — shaped JSON `{collection:[...]}` |
| `sc-official-resolve?url=...` | **200 OK** — shaped JSON `{kind,id,title,...}` |
| Disallowed origin (evil.example.com) | **403 Forbidden** — `{error:"Origin not permitted."}` |
| Secret/token leakage check | **None** — no `Authorization`, `access_token`, `client_id`, or `client_secret` in any response |

---

## Rollback Plan
1. Revert commit `b964c06` to restore legacy endpoints.
2. Update `index.html` to point back to `sc-search` and `sc-resolve`.
3. Re-deploy to the warm-sunflower site.

---

## Next Atomic Tasks
1. **G1 (High priority):** Provider allowlist + source normalization (`NO UI`) in `G:\DOWNLOADS5\reidchunes\residencysolutions-core`.
2. **G2 (Low priority):** Add analytics + error telemetry to `sc-official-search.js` and `sc-official-resolve.js` wrapper functions.
3. **Optional:** Obtain credentials for the original `residencysolutions.netlify.app` Netlify account to deploy there directly.
