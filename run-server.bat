@echo off
REM AccessWeb - Запуск локального сервера
REM Поддерживает Python и Node.js

echo ===================================
echo   AccessWeb - Local Server Launcher
echo ===================================
echo.

REM Проверяем Python
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python найден
    echo Запуск сервера на http://localhost:8000
    echo Нажмите Ctrl+C для остановки
    echo.
    python -m http.server 8000
    goto :end
)

REM Проверяем Node.js
node --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node.js найден
    echo Установка http-server...
    npm install -g http-server >nul 2>&1
    echo Запуск сервера на http://localhost:8080
    echo Нажмите Ctrl+C для остановки
    echo.
    http-server -p 8080
    goto :end
)

REM Если ничего не найдено
echo [ERROR] Ни Python, ни Node.js не найдены!
echo.
echo Установите одно из:
echo - Python: https://python.org (отметьте "Add to PATH")
echo - Node.js: https://nodejs.org
echo.
echo Или откройте index.html прямо в браузере:
echo file:///C:/Users/miair/AccessWeb/index.html
echo.
pause

:end
