# Residency+ G2 — Stable Lock & Discovery V1 Handoff

## 1. Stable Lock (Phase A)
- **What was locked:** The clean baseline at commit `9cb100b` (the point proven stable after discarding dirty local drift) was tagged as `g2-stable-lock-1`.
- **Workflow Established:** A new workflow rule `docs/workflows/G2_STABLE_LOCK.md` was created, stating no direct feature work is allowed on the rescue branch. Future slices must branch off the stable lock tag.

## 2. Fixture Hygiene (Phase B)
- **What fixed the drift:** The blank boot error experienced previously was caused by malformed mock data. We fixed this by recreating `search-ambient.json` and `resolve-sample.json` inside `netlify/functions/fixtures/` with the correct `permalink_url` and object shape required by the frontend `shapeTrack` parser.
- **Result:** The `DEV_FIXTURE_MODE=true` local boot now works flawlessly without crashing into a blank shell.

## 3. Discovery Engine v1 (Phase C)
- **What shipped:** We significantly upgraded the search quality and shuffle variance without altering the UI.
  - **Genre Seed Packs:** Introduced `DISCOVERY_SEEDS` internal config, grouping terms into `anchors` and `adjacent` categories rather than relying on flat lists.
  - **Controlled Exploration:** Modified the `quickFill` search query builder to randomly blend anchor terms with adjacent terms and dig tokens.
  - **Over-literal-title Penalty:** Upgraded `computeDigScore` to heavily penalize tracks where the title exactly matches the bucket name (e.g., a track literally named "ambient" in the ambient bucket), naturally filtering out low-effort uploads and mixes.
  - **Internal Scaffolding:** Added `_discovery_pool` and `_penalty_applied` fields to the item track object for future telemetry without overbuilding.
- **Branch:** Changes were cleanly committed to `feat/discovery-engine-v1`.

## 4. Deferred Work
- **What remains deferred:** "Vibe Search" (Slice 5) and heavy AI audio analysis remain explicitly deferred. The focus remains on locking the discovery layer first.

## 5. Verification
- **User Babysitting:** No user commands or manual intervention was required. The entire lock, fixture recreation, code injection, and validation execution were completed autonomously by the Operator.
