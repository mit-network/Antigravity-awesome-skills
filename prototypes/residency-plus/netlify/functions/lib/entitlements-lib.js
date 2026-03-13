/**
 * entitlements-lib.js — Central plan → entitlements mapping for Residency+.
 *
 * Single source of truth for feature limits. Server functions should import
 * this helper instead of hardcoding numeric limits.
 */

export const PLAN_FREE = "free";
export const PLAN_RESIDENCY_PLUS = "residency_plus";

/**
 * Returns the entitlements object for the given plan.
 *
 * All limits are soft upper-bounds enforced on the backend. Frontend may
 * optionally use the same values for UI hints, but the server is canonical.
 */
export function getEntitlementsForPlan(plan) {
  const p = (plan || "").toLowerCase();

  if (p === PLAN_RESIDENCY_PLUS) {
    return {
      plan: PLAN_RESIDENCY_PLUS,
      crateLimit: 1000,
      historyLimit: 2000,
      playlistsLimit: 25,
      playlistItemsLimit: 200,
      exportLimit: 1000,
      // Advanced vibe / playlist-intelligence workflows are effectively
      // unconstrained for Residency+ subscribers. Frontend may still apply
      // soft UX hints, but backend does not enforce strict ceilings here.
      vibePresetLimit: 50,
      playlistVibeLimit: 9999
    };
  }

  // Default: free tier
  return {
    plan: PLAN_FREE,
    crateLimit: 50,
    historyLimit: 200,
    playlistsLimit: 3,
    playlistItemsLimit: 50,
    exportLimit: 200,
    // Free tier: keep core discovery and basic vibe usage useful, while
    // softly limiting heavier playlist-intel workflows.
    vibePresetLimit: 5,
    playlistVibeLimit: 3
  };
}

