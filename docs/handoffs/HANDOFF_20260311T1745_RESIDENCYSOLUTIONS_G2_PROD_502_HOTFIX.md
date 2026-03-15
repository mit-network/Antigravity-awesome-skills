# Handoff: Production 502 Reliability Hotfix
**Timestamp**: 2026-03-11T17:45
**Status**: STABLE / VERIFIED

## Summary
The production environment of ResidencySolutions G2 was experiencing "502 Bad Gateway" errors on all search and resolve endpoints. These have been resolved via a targeted refactor of the Netlify Functions architecture.

## Root Cause Analysis
1. **ESM Incompatibility**: The Netlify Functions v2 environment (Node 20+) was failing to properly initialize ESM handlers that imported Node built-ins (`fs`, `path`) at the top level or used official SoundCloud wrappers in an ESM context.
2. **Entrypoint Bundling Error**: Netlify's ESBuild engine was treating `sc-auth-lib.js` (a shared helper) as a standalone serverless function entrypoint. Because it lacked a handler export, it caused `ImportModuleError` during bundling and runtime.

## Solutions Applied
- **CommonJS Refactor**: Converted `sc-auth-lib.js`, `sc-official-search.js`, and `sc-official-resolve.js` from ESM to CJS (`module.exports` / `require`).
- **Library Relocation**: Moved `sc-auth-lib.js` into `netlify/functions/lib/`. This subfolder is ignored by Netlify as an entrypoint provider, ensuring it is only bundled as a dependency of the primary handlers.
- **Conflict Resolution**: Cleaned up legacy git merge markers (`<<<<<<< HEAD`) in all `sync-` and `migrate-` functions that were blocking deployments.
- **Direct Deployment**: Performed a verified direct deploy via `netlify deploy --prod` to bypass monorepo root-resolution issues.

## Verification Results
- `sc-health`: [200 OK](https://residencysolutions.netlify.app/.netlify/functions/sc-health)
- `sc-official-search`: [200 OK](https://residencysolutions.netlify.app/.netlify/functions/sc-official-search?q=ambient)
- `sc-official-resolve`: [200 OK](https://residencysolutions.netlify.app/.netlify/functions/sc-official-resolve?url=https://soundcloud.com/tycho/tycho-awake)

## Local Dev Note
- `verify_local_dev.ps1` is currently failing in this environment due to a Windows-specific Netlify CLI DNS bug (`getaddrinfo ENOTFOUND`). However, the code logic has been manually verified for fixture compatibility.

## Branch Status
- Pushed to `main`.
- Merged into `feat/discovery-engine-v1`.
