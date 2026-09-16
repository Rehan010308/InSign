@echo off
title InSign
cd /d "%~dp0"
echo.
echo   InSign - starting local server...
echo   Open http://localhost:4173 in your browser.
echo   (Close this window to stop the site.)
echo.
node server.js 4173
pause
