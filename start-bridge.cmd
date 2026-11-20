@echo off
setlocal
title Muse Bridge
rem Portable bridge launcher: runs from wherever this folder is placed.
where node >nul 2>nul
if errorlevel 1 goto :nonode
if exist "%~dp0node_modules\ws\package.json" goto :run
echo Installing dependencies - first run only...
pushd "%~dp0"
call npm install --no-audit --no-fund
popd
:run
echo Starting Muse Bridge from %~dp0 ...
node "%~dp0muse-bridge.js"
echo.
echo Bridge stopped - exit code %errorlevel%.
pause
exit /b 0
:nonode
echo Node.js was not found on PATH. Install Node.js, then run this again.
pause
exit /b 1