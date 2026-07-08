@echo off
:: Always run from this script's own folder
cd /d "%~dp0"

echo.
echo ====================================
echo   AccessWeb v3 - Local Server
echo ====================================
echo.

node --version >nul 2>&1
if errorlevel 1 goto :no_node

for /f %%v in ('node --version') do echo Node.js: %%v

if exist "backend\node_modules" goto :check_env
echo.
echo [INFO] Installing dependencies - first run...
cd backend
call npm install
if errorlevel 1 goto :npm_failed
cd ..
echo [OK] Dependencies installed

:check_env
if exist "backend\.env" goto :ensure_data_dir
echo.
echo [INFO] Creating backend\.env ...
echo NODE_ENV=production> backend\.env
echo PORT=8080>> backend\.env
echo JWT_SECRET=%RANDOM%%RANDOM%%RANDOM%%RANDOM%>> backend\.env
echo DB_PATH=./data/accessweb.db>> backend\.env
echo ALLOWED_ORIGINS=https://nikshukrem.github.io,http://localhost:8080,http://127.0.0.1:8080>> backend\.env
echo [OK] backend\.env created

:ensure_data_dir
if not exist "backend\data" mkdir backend\data

echo.
echo [INFO] Server: http://localhost:8080
echo [INFO] Press Ctrl+C to stop
echo.

cd backend
node src/server.js
if errorlevel 1 echo. & echo [ERROR] Server crashed, exit code %errorlevel%
cd ..
echo.
pause
exit /b 0

:no_node
echo [ERROR] Node.js not found!
echo Download from https://nodejs.org
echo.
pause
exit /b 1

:npm_failed
echo [ERROR] npm install failed
cd ..
pause
exit /b 1
