@echo off
setlocal
cd /d "C:\Users\Lenovo\.gemini\antigravity\skills"

echo ===================================================
echo      Syncing Antigravity Awesome Skills
echo ===================================================

echo [INFO] Pulling latest changes from GitHub...
git pull origin main

echo [INFO] Updating skills index and metadata...
call npm run chain

echo [INFO] Setup complete! Latest skills are now available.
pause
endlocal
