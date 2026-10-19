@echo off
title DealSense
cd /d "%~dp0"

echo ============================================
echo   DealSense - starting your local site
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js is not installed or not in PATH.
  echo     Install it from https://nodejs.org  then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies ^(first run only^)...
  call npm install
  echo.
)

echo Opening http://localhost:3000 in your browser...
start "" http://localhost:3000

echo.
echo   Keep this window OPEN while using the site.
echo   Press Ctrl+C (or close this window) to stop the site.
echo.
call npm run dev

echo.
echo Site stopped.
pause
