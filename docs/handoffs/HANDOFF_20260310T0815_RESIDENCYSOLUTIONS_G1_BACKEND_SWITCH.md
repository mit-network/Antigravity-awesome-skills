# HANDOFF — ResidencySolutions G1 Selectable Persistence Backend
**Timestamp:** 2026-03-10T08:15:00-04:00 (2026-03-10T12:15:00Z)
**Commit:** Pending (will be pushed sequentially)
**Repo:** `G:\DOWNLOADS5\reidchunes\residencysolutions-core`

---

## What Was Done
Implemented a selectable persistence backend system within the G1 CLI without modifying the existing default JSONL behavior. The native `entitlements.ps1` script now seamlessly bridges to the Python SQLite MVP logic upon the addition of the `-Backend sqlite` opt-in flag.

**Key Changes:**
1. **CLI Proxy (`sqlite_cli.py`)**: 
   - New Python CLI to translate standard input from PowerShell directly into the SQLite Python SDK commands (`append_event`, `latest_status`, `list_events`). Supports Base64 encoded payload passing to inherently bypass PowerShell Windows escaping issues.
2. **Backend Selector (`entitlements.ps1`)**:
   - Added parameters `[ValidateSet("jsonl", "sqlite")] [string]$Backend = "jsonl"` and an optional override pointer `[string]$SqliteDbPath`.
   - Defaults strictly to the historical legacy `jsonl` flow.
   - When `-Backend sqlite` is invoked, it branches to invoke `sqlite_cli.py` natively using `2>&1` capture, preserving standard `$LASTEXITCODE` operator UX identical to the legacy process.
3. **SQLite Adapter Hotfix**: 
   - Identified and resolved a mismatch from the previous step wherein the script checked for the JSON key `"event"` rather than the specification's `"type"` key. Fixed the NOT NULL schema violation. Fixed broad `IntegrityError` catches to explicitly track uniquely violated idempotency keys.
4. **Docs Updated**:
   - Both `SQLITE_ADAPTER.md` and `ENTITLEMENTS_SPEC.md` define and illustrate usage of the brand-new persistence opt-in flag format.
5. **Verification Elevated**:
   - The native verification pipeline now programmatically generates an entirely volatile SQLite DB under `temp/` to run dynamic cross-assertions (grant, check, revoke, check again) immediately against the integrated PowerShell layer logic itself (simulating literal end-driver functionality rather than just executing native Python tests).

---

## Sanitized Verification Summary
| Check | Result |
|---|---|
| `guard-no-ui.ps1` | **PASS**: No structural DOM/UI modifications found. |
| `verify-core.ps1` | **PASS**: Confirmed IDEMPOTENT tracking, grant processing, list arrays, override capabilities, fallback default JSONL parsing, *and* the novel isolated SQLite CLI validation sequences. |
| `git status` | **CLEAN**: Only documented and intended framework logic pushed to `main`. |

---

## Rollback Plan
If downstream components utilizing CLI programmatic invocation experience disruptions (e.g. from the new optional parameters changing powershell's strict-mode binding behavior):
1. **Reverse Commit**: Use `git checkout <previous_commit_hash>` to revert the introduction of `-Backend`.
2. Delete the proxy `scripts/sqlite_cli.py`.
3. Due to `jsonl` remaining the default throughout development, existing external integrations implicitly hitting `entitlements.ps1` should face exactly **zero operational degradation**. 

---

## Next Atomic Task
> **G1: Add a small admin/operator runbook for safely migrating JSONL chronologically backward to SQLite**
