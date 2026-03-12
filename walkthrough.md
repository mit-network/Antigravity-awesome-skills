# Maintenance Walkthrough - 2026-03-12

- Merged PRs `#277`, `#272`, `#275`, `#278`, and `#271` via GitHub squash merge after bringing contributor branches into a mergeable state and refreshing PR bodies against the quality checklist in `.github/MAINTENANCE.md`.
- Verified PR `#271` locally with `npm run validate:references` and `npm run test` before merge; confirmed `#269` auto-closed from the merged PR body.
- Added a user-facing Windows truncation recovery guide at `docs/users/windows-truncation-recovery.md`, linked it from `README.md`, `docs/users/faq.md`, `docs/users/getting-started.md`, and `docs/integrations/jetski-cortex.md`, and credited the workflow to issue `#274`.
- Updated `skills/metasploit-framework/SKILL.md` to remove the remote installer flow, require an existing Metasploit installation, and add the required offensive-skill warning.
- Refreshed `README.md` to remove stale `7.2.0` / `7.4.0` onboarding copy, align the star badge with the current milestone, and fix the TOC link for `## Contributing`.
- Normalized the active English docs (`README.md`, user guides, Kiro guide, and evergreen maintainer docs) to the current `7.6.0` / `1,250+ skills` state and removed emoji from H2 headers where maintenance rules require clean anchors.
- Ran the required maintenance validations after the direct fixes:
  - `npm run validate`
  - `npm run validate:references`
  - `npm run chain`
  - `npm run catalog`
- Final release prep, issue closure comments, and verification were completed on `main`.
