@echo off
title Restaurant POS Server

echo.
echo   ========================================
echo     Restaurant POS - Quick Start
echo   ========================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] Node.js not found!
    echo   Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo   Node.js version:
node --version
echo.

:: Change to script directory
cd /d "%~dp0"

echo   Starting server...
echo   Browser will open automatically
echo   Close this window to stop the server
echo.

:: Open browser after 3 seconds
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Start server
node server/index.js

echo.
echo   Server stopped.
echo   Press any key to close...
pause >nul
