## Residency+ G2 – Local Dev Stability Closure

- **Timestamp**: 20260312_223500
- **Slice**: Local Dev Stability Closure
- **Branch**: `feat/discovery-engine-v1`
- **Related slices**:
  - Custom domain cutover: `a8e00c5a49d00f1c4cdae549b6061b17026acca4`

### 1. Observed Behavior in This Environment

- `netlify dev` reports:
  - “No app server detected. Using simple static server”
  - “Running static server from `..`”
  - “Local dev server ready: http://localhost:8888”
- Port 8888 is listening and accepts TCP connections (`netstat` shows `LISTENING` on 8888 and established connections from `curl` and Playwright).
- However, HTTP requests to the dev server **never receive any HTTP response**:
  - `curl http://localhost:8888/` and `curl http://127.0.0.1:8888/` establish a connection but then hang indefinitely with `0 bytes` received until client timeout.
  - `Invoke-WebRequest` to both:
    - `http://localhost:8888/`
    - `http://localhost:8888/.netlify/functions/sc-health`
    consistently hit the `catch` branch with an error, even though the TCP connection succeeds.
- As a result:
  - `scripts/verify_local_dev.ps1` starts, logs the sc-health check line, and then stalls because the underlying HTTP call never resolves (the process was backgrounded by tooling before it could time out and log a result).
  - `scripts/verify_frontend_boot.ps1` invokes Playwright, which times out on:
    - `page.goto("http://localhost:8888/", { waitUntil: "load", timeout: 30000 })`
  - `scripts/verify_prod.ps1` continues to **PASS** cleanly against `https://residencysolutions.net` (production path is unaffected).

### 2. Root Cause (in This Session)

- The core issue in this Cursor-run session is **local Netlify dev not serving HTTP responses on port 8888**, despite:
  - The dev server advertising readiness.
  - Port 8888 accepting connections.
- This manifests as:
  - Hanging HTTP requests for both the static root (`/`) and Netlify functions (`/.netlify/functions/sc-health`).
  - Timeouts in both PowerShell-based verification scripts and the Playwright-based frontend boot verifier.
- Importantly:
  - This behavior is **environmental**, tied to how `netlify dev` is running in this session (likely sandbox/background/shell interaction), not to application or verification script code introduced in the custom domain cutover or earlier slices.
  - Production (via `verify_prod`) continues to pass against `https://residencysolutions.net`, confirming that the cutover logic and wrapper functions are healthy.

### 3. Codebase Changes Made for This Task

- **None.**
- No changes were made to:
  - `index.html` or the frontend shell.
  - Netlify functions or origin handling.
  - Verification scripts (`verify_local_dev.ps1`, `verify_prod.ps1`, `verify_frontend_boot.ps1`).
- All investigation focused on runtime behavior of `netlify dev` and direct HTTP probes to localhost.

### 4. Why Gates Cannot Be Flipped to Green from Here

- The slice requires:
  - `scripts/verify_local_dev.ps1` — PASS
  - `scripts/verify_prod.ps1` — PASS
  - `scripts/verify_frontend_boot.ps1` — PASS
  in the same closure pass.
- In this environment:
  - `verify_prod.ps1`:
    - **PASS**
    - Latest log: `logs/verify_prod_20260312_180800.log`
  - `verify_local_dev.ps1`:
    - **Stalls / effectively FAILS** due to the sc-health request never completing.
    - Latest log: `logs/verify_local_dev_20260312_180500.log`
  - `verify_frontend_boot.ps1`:
    - **FAILS** with Playwright `page.goto` timeout to `http://localhost:8888/`.
    - Latest log: `logs/verify_frontend_boot_20260312_180810.log`
- Because the root cause is that `netlify dev` is not returning HTTP responses at all on 8888 (rather than returning non-200s), **no small, safe code change inside the repo can fix this behavior from within this sandbox**.
  - Adjusting the scripts to “wait longer” or change URLs would not produce a PASS as long as the server continues to accept connections but not answer them.

### 5. Recommended Manual Steps on Your Local Machine

On your own workstation (outside this Cursor-run shell), where prior logs show healthy local runs:

1. From a fresh terminal in `prototypes/residency-plus`:
   - Run: `npx netlify dev --port 8888`
2. Confirm the root shell is actually being served:
   - Visit `http://localhost:8888/` in a browser.
   - Or run: `curl -v http://localhost:8888/` and confirm you receive an HTTP response (even a 200/301/404 is fine — the key is “no hang”).
3. With a healthy local dev server:
   - Run in order:
     - `scripts/verify_local_dev.ps1`
     - `scripts/verify_prod.ps1`
     - `scripts/verify_frontend_boot.ps1`
   - Expectation (based on earlier successful logs in this repo):
     - All three should return to **PASS** with no additional code changes.

If, on your machine, you see similar hangs (unlikely given prior history), the next diagnosis should be:

- Confirm `.netlify`/build output and Netlify CLI version.
- Check for:
  - Local firewall / antivirus interfering with loopback HTTP traffic.
  - Multiple overlapping `netlify dev` / framework dev servers fighting over port 8888.
  - Misconfigured `.toml` / proxy settings that might be swallowing root requests.

### 6. Status

- **Root cause in this session**: `netlify dev` on port 8888 accepts connections but never returns HTTP responses, blocking both local backend verification and frontend boot verification.
- **Codebase status**:
  - No local dev or verification code regressions were identified stemming from the custom domain cutover.
  - Production canonical domain (`https://residencysolutions.net`) remains green via `verify_prod`.
- **Action required for true closure**:
  - Run the three verification scripts on a healthy local environment (where `http://localhost:8888/` serves normally) to obtain an all-green closure pass without further repo changes.

