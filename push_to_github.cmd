@echo off
title Push SmartCinema to GitHub
echo ===================================================
echo   Pushing SmartCinema to GitHub
echo ===================================================
echo.
cd /d "%~dp0"

echo [*] Remote URL:
git remote -v
echo.

echo [*] Pushing branch 'main' to origin...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================
    echo   [SUCCESS] Uploaded successfully to GitHub!
    echo   Repository: https://github.com/amjm1924-sys/SmartCinema
    echo ===================================================
) else (
    echo.
    echo ===================================================
    echo   [ERROR] Push failed. If this is your first time,
    echo   please sign in via the browser window that opened.
    echo ===================================================
)

echo.
pause
