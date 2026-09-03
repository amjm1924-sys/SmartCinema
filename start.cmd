@echo off
title SmartCinema Launcher
echo ===================================================
echo   SmartCinema - Full Stack Launcher
echo ===================================================
echo.

REM Start Backend
echo [*] Starting Backend Server (Python Flask)...
start "SmartCinema Backend" cmd /k "cd backend && python app.py"

REM Wait 2 seconds for backend to start
timeout /t 2 /nobreak >nul

REM Start Frontend
echo [*] Starting Frontend Server (Vite React)...
start "SmartCinema Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ===================================================
echo   SmartCinema is running!
echo ===================================================
echo   Frontend: http://localhost:8080
echo   Backend:  http://localhost:5000
echo ===================================================
echo.
pause
