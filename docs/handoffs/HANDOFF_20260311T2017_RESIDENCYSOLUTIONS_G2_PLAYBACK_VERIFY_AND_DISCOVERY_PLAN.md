# Technical Handoff: Playback Sync Verification & Discovery Planning

## 1. Context & Baseline
- **Current Head**: `800a583d1190cccb0116bd534830b7a6cc302e99`
- **Locked Baseline**: `g2-stable-lock-1` (commit `9cb100b`)
- **Status**: Production Reliability is now **GREEN**.

## 2. Verification Results

### Production
- **Result**: **PASS**
- **Log**: `logs/verify_prod_20260311_2017.log`
- **Confirmation**: Iframe and metadata desync ("Name changes but song doesn't") is 100% resolved via `scWidget` global declaration and `src` reload fallback.

### Local Development
- **Result**: **PASS** (Resolved)
- **Log**: `logs/verify_local_dev_20260311_2035.log`
- **Resolution**: Port 8888 collision/staleness resolved by process termination and cache clearing. `sc-health` responds 200 OK.

## 3. Discovery Engine Upgrade v1 Plan

### Core Features
1. **Genre Seed Packs**: Refactor flat `GENRE_PACKS` into `DISCOVERY_SEEDS` with `anchor` and `adjacent` terms for controlled query expansion.
2. **Controlled Exploration**: Update `quickFill` to blend anchors with dig tokens (e.g., "dubplate", "vip") to target high-value underground tracks.
3. **Over-literal-title Penalty**: Apply `-40` score deduction in `computeDigScore` for tracks exactly matching the search bucket (reduces low-quality mixes).
4. **Lightweight Reranking**: Sort aggregate search results by score before insertion into the library.
5. **Telemetry Scaffolding**: Embed `_discovery_pool` and `_penalty_applied` metadata for future analytics.

### Restrictions
- No heavy audio inference.
- No broad UI redesign.
- Vibe Search remains deferred.

## 4. Next Steps
1. Checkout `feat/discovery-engine-v1`.
2. Implement `DISCOVERY_SEEDS` structure in `index.html`.
3. Apply title penalty logic in `computeDigScore`.
4. Deploy to staging/prod for vibe-verification.
