@echo off
:: This is the one place to launch AccessWeb from. Always run this script
:: from its own folder - if you keep a second copy of the repo elsewhere,
:: that copy will drift out of sync with this one (that already happened
:: once - see README).
cd /d "%~dp0"

echo.
echo ====================================
echo   AccessWeb - Launcher
echo ====================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [WARN] Not a git repository - cannot update from GitHub.
    goto :start
)

echo [INFO] Checking for updates on GitHub...
git fetch origin >nul 2>&1

git diff --quiet HEAD -- . ":(exclude)backend/data"
if errorlevel 1 (
    echo [WARN] Local uncommitted changes found - skipping update.
    goto :start
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
git pull origin %BRANCH%
if errorlevel 1 (
    echo [WARN] Could not update from GitHub - running the local copy as-is.
) else (
    echo [OK] Code updated to the latest version.
)

:start
echo.
call "%~dp0start.bat"
