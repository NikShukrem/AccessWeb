@echo off
cd /d "%~dp0"

echo.
echo ====================================
echo   AccessWeb - Cloudflare Tunnel
echo ====================================
echo.
echo Opens access to the server from the internet.
echo The server must already be running (start.bat / run.bat).
echo.

set CF_EXE=

if exist "cloudflared.exe"                               set CF_EXE=cloudflared.exe
if exist "cloudflared-windows-amd64.exe"                 set CF_EXE=cloudflared-windows-amd64.exe
if exist "%USERPROFILE%\Downloads\cloudflared.exe"       set CF_EXE=%USERPROFILE%\Downloads\cloudflared.exe
if exist "%USERPROFILE%\Downloads\cloudflared-windows-amd64.exe" set CF_EXE=%USERPROFILE%\Downloads\cloudflared-windows-amd64.exe
if exist "%USERPROFILE%\Desktop\cloudflared.exe"         set CF_EXE=%USERPROFILE%\Desktop\cloudflared.exe
if exist "%USERPROFILE%\Desktop\cloudflared-windows-amd64.exe"   set CF_EXE=%USERPROFILE%\Desktop\cloudflared-windows-amd64.exe
if exist "C:\cloudflared.exe"                            set CF_EXE=C:\cloudflared.exe

if not "%CF_EXE%"=="" goto :found

echo [ERROR] cloudflared.exe not found!
echo.
echo Download it from:
echo https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
echo.
echo Put it in one of these folders:
echo  - next to this file
echo  - Desktop
echo  - Downloads
echo.
pause
exit /b 1

:found
echo [OK] Found: %CF_EXE%
echo.
echo Starting tunnel...
echo Copy the URL that looks like https://xxxx-xxxx.trycloudflare.com
echo and share it with the remote user (e.g. the Egypt team).
echo.
echo Press Ctrl+C to stop
echo.

"%CF_EXE%" tunnel --url http://localhost:8080

pause
