# NOW / NEXT / LATER
_Last refreshed: 2026-03-10 06:30 EST_

Prioritized roadmap snapshot across all lanes. Update each operator session.

---

## NOW (this week / in-flight)

| # | Lane | Task | Compute | Notes |
|---|------|------|---------|-------|
| 1 | Residency Quest | Merge RQ-004 (`feat/rq-004-class-weighted-xp` → `main`) + push | Low | Run `validate_events.py` + `pytest -q` first |
| 2 | reidmd.net | QA stabilization checklist (v8 lock) — verify live site matches runbook | Zero | Browser check only |
| 3 | Cross-lane | ✅ Create governance docs (PROJECT_ROUTER, NOW_NEXT_LATER, BLOCKERS) | Zero | Done |
| 4 | ResidencySolutions | ✅ Integrate RESIDENCY+ prototype into governance + copy files | Zero | Done |
| 5 | ResidencySolutions | ✅ Verify RESIDENCY+ runs locally via `netlify dev` + document env var | Low | Done |
| 6 | ResidencySolutions (G1)| G1: establish no-UI guard + entitlements core baseline (no UI), verify minimal checks | Low | Blocked (repo missing) |
| 7 | ResidencySolutions (G2)| ✅ Official OAuth wrapper + frontend cutover + legacy quarantine + canonical deploy | Low | Done — 2026-03-10 |

## NEXT (next 1–2 weeks)

| # | Lane | Task | Compute | Notes |
|---|------|------|---------|-------|
| 8  | Residency Quest | RQ-005: Ranked Foundation (divisions, MMR, weekly reset) | Low | Schema + service + API + tests |
| 9  | Roblox Horror | Sprint gate 1: repo setup + core loop prototype in Studio | Low | Per CTO_DAY1_BUILD_ORDER_v2 |
| 10 | Local Clipper | Manual acceptance tests A–E (needs Streamlit + ffmpeg) | Medium | Night run preferred |
| 11 | reidmd.net | Safe CSS scoping improvements + mobile polish | Low | Homepage-only edits |
| 12 | ResidencySolutions (G1) | G1: provider allowlist + source normalization (NO UI) | Low | Next G1 task |
| 13 | ResidencySolutions (G2) | G2: analytics + error telemetry for wrapper endpoints | Low | Next G2 task |

## LATER (backlog / blocked)

| # | Lane | Task | Compute | Blocker |
|---|------|------|---------|---------| 
| 14 | Local Clipper | NVENC fallback path verification (acceptance E) | High (GPU) | Needs GPU night run |
| 15 | P0 Clip Factory | Acceptance: 3+ videos → 10+ ranked clips overnight | High (GPU) | Overnight unattended run |
| 16 | Residency Quest | Social features, leaderboard UI | Low | Depends on RQ-005 |
| 17 | Cross-lane | VST full compile matrix | High | Night run only |
| 18 | Cross-lane | Clip render pipeline scaling | High | Night run only |

## NOW (Unblocked)
- ResidencySolutions G1: scaffold entitlements core (NO UI) in `G:\DOWNLOADS5\reidchunes\residencysolutions-core` (add spec + verify script + commit)
