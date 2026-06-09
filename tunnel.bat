@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo.
echo ====================================
echo   AccessWeb - Cloudflare Tunnel
echo ====================================
echo.
echo Открывает доступ к серверу из интернета.
echo Сервер должен быть запущен через start.bat
echo.

:: Ищем cloudflared.exe в нескольких местах
set CF_EXE=

if exist "cloudflared.exe"                               set CF_EXE=cloudflared.exe
if exist "cloudflared-windows-amd64.exe"                 set CF_EXE=cloudflared-windows-amd64.exe
if exist "%USERPROFILE%\Downloads\cloudflared.exe"       set CF_EXE=%USERPROFILE%\Downloads\cloudflared.exe
if exist "%USERPROFILE%\Downloads\cloudflared-windows-amd64.exe" set CF_EXE=%USERPROFILE%\Downloads\cloudflared-windows-amd64.exe
if exist "%USERPROFILE%\Desktop\cloudflared.exe"         set CF_EXE=%USERPROFILE%\Desktop\cloudflared.exe
if exist "%USERPROFILE%\Desktop\cloudflared-windows-amd64.exe"   set CF_EXE=%USERPROFILE%\Desktop\cloudflared-windows-amd64.exe
if exist "C:\cloudflared.exe"                            set CF_EXE=C:\cloudflared.exe

if "%CF_EXE%"=="" (
    echo [ОШИБКА] cloudflared.exe не найден!
    echo.
    echo Скачайте файл по ссылке:
    echo https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
    echo.
    echo Положите его в одну из папок:
    echo  - C:\Users\miair\AccessWeb\  (рядом с этим файлом)
    echo  - Рабочий стол
    echo  - Загрузки
    echo.
    pause
    exit /b 1
)

echo [OK] Найден: %CF_EXE%
echo.
echo Запуск туннеля...
echo Скопируйте URL вида https://xxxx-xxxx.trycloudflare.com
echo и передайте сотруднику в Египте.
echo.
echo Для остановки нажмите Ctrl+C
echo.

"%CF_EXE%" tunnel --url http://localhost:8080

pause
