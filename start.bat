@echo off
chcp 65001 >nul
title AccessWeb - Сервер

echo.
echo  ╔══════════════════════════════════════╗
echo  ║      AccessWeb v3 - Local Server     ║
echo  ╚══════════════════════════════════════╝
echo.

:: Проверяем Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден!
    echo Скачайте с https://nodejs.org
    pause
    exit /b 1
)

:: Устанавливаем зависимости если нужно
if not exist "backend\node_modules" (
    echo [INFO] Устанавливаем зависимости...
    cd backend
    npm install
    cd ..
)

:: Проверяем .env
if not exist "backend\.env" (
    echo [INFO] Создаём файл конфигурации .env...
    (
        echo NODE_ENV=production
        echo PORT=8080
        echo JWT_SECRET=%RANDOM%%RANDOM%%RANDOM%%RANDOM%
        echo DB_PATH=./data/accessweb.db
        echo ALLOWED_ORIGINS=https://nikshukrem.github.io,http://localhost:8080,http://127.0.0.1:8080
    ) > backend\.env
    echo [OK] Файл backend\.env создан
)

echo.
echo [INFO] Сервер запускается на http://localhost:8080
echo [INFO] Нажмите Ctrl+C для остановки
echo.

:: Запускаем сервер
cd backend
node src/server.js
