@echo off
chcp 65001 >nul 2>&1

:: Всегда работаем из папки скрипта — это единственная копия репозитория,
:: которую нужно запускать. Если открываете AccessWeb из другого места —
:: остановитесь и запускайте отсюда, иначе снова словите рассинхрон версий.
cd /d "%~dp0"

echo.
echo ====================================
echo   AccessWeb - Запуск
echo ====================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [ВНИМАНИЕ] Это не git-репозиторий - обновление из GitHub невозможно.
    goto :start
)

echo [INFO] Проверяем обновления в GitHub...
git fetch origin >nul 2>&1

git diff --quiet HEAD -- . ":(exclude)backend/data"
if errorlevel 1 (
    echo [ВНИМАНИЕ] Есть локальные несохраненные изменения - обновление пропущено.
    goto :start
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
git pull origin %BRANCH%
if errorlevel 1 (
    echo [ВНИМАНИЕ] Не удалось обновиться из GitHub - запускаем то, что есть локально.
) else (
    echo [OK] Код обновлен до последней версии.
)

:start
echo.
call "%~dp0start.bat"
