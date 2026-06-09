@echo off
chcp 65001 >nul 2>&1

:: Всегда работаем из папки скрипта
cd /d "%~dp0"

echo.
echo ====================================
echo   AccessWeb v3 - Local Server
echo ====================================
echo.

:: Проверяем Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден!
    echo Скачайте с https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f %%v in ('node --version') do echo Node.js: %%v

:: Устанавливаем зависимости если нужно
if not exist "backend\node_modules" (
    echo.
    echo [INFO] Устанавливаем зависимости (первый запуск)...
    cd backend
    npm install
    if %errorlevel% neq 0 (
        echo [ОШИБКА] npm install не удался
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo [OK] Зависимости установлены
)

:: Создаём .env если нет
if not exist "backend\.env" (
    echo.
    echo [INFO] Создаём backend\.env ...
    echo NODE_ENV=production> backend\.env
    echo PORT=8080>> backend\.env
    echo JWT_SECRET=%RANDOM%%RANDOM%%RANDOM%%RANDOM%>> backend\.env
    echo DB_PATH=./data/accessweb.db>> backend\.env
    echo ALLOWED_ORIGINS=https://nikshukrem.github.io,http://localhost:8080,http://127.0.0.1:8080>> backend\.env
    echo [OK] backend\.env создан
)

:: Создаём папку для базы данных
if not exist "backend\data" mkdir backend\data

echo.
echo [INFO] Сервер: http://localhost:8080
echo [INFO] Для остановки нажмите Ctrl+C
echo.

:: Запускаем
cd backend
node src/server.js
if %errorlevel% neq 0 (
    echo.
    echo [ОШИБКА] Сервер упал с кодом %errorlevel%
)
cd ..
echo.
pause
