# Residency+ G2 — Autonomous Verification Handoff

## 1. New Verification Scripts
The following PowerShell scripts have been added to the `scripts/` directory to enable autonomous, repeatable testing:
- **`scripts/verify_local_dev.ps1`**:
  - Hits `http://localhost:8888/.netlify/functions/sc-health`
  - Hits `http://localhost:8888/.netlify/functions/sc-official-search?q=ambient`
  - Hits `http://localhost:8888/.netlify/functions/sc-official-resolve?url=https://soundcloud.com/fixture/ambient-1`
  - Validates HTTP 200/OK and captures response snippets.
- **`scripts/verify_prod.ps1`**:
  - Hits `https://residencysolutions.netlify.app/.netlify/functions/sc-health`
  - Hits `https://residencysolutions.netlify.app/.netlify/functions/sc-official-search?q=ambient`
  - Hits `https://residencysolutions.netlify.app/.netlify/functions/sc-official-resolve?url=https://soundcloud.com/octobersveryown/drake-0-to-100`

## 2. Logs and Execution
- Each script generates a timestamped log file in the `logs/` directory.
- Sample logs produced during this task:
  - `logs/verify_local_dev_20260311_055050.log` (Result: **PASS**)
  - `logs/verify_prod_20260311_055321.log` (Result: **FAIL** - identified current 502 Bad Gateway on prod).

## 3. Workflow Updated
The `docs/workflows/G2_STABLE_LOCK.md` document has been updated with **Rule 5**, mandating the use of these scripts for all future verification. Agents and operators are instructed to avoid manual `curl` prompts and instead rely on the scripts and their logs.

## 4. Commit Details
- **Commit Hash:** `0eb8a21`
- **Message:** `chore: add autonomous verification scripts for residency+`

## 5. CTO Summary
The manual "babysitting" of verification is now officially over. Future prompts can simply instruct the agent to "run verification scripts and report logs." The local script successfully confirms the rescue baseline's health, while the prod script correctly identifies the current upstream issues, providing clear, structured failure data.
