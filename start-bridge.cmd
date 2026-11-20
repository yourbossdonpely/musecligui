@echo off
setlocal
title Muse Bridge
rem Portable bridge launcher: runs from wherever this folder is placed.
rem Prefer the bundled Node.js next to this script, else PATH.
set "NODE_BIN=%~dp0node.exe"
if not exist "%NODE_BIN%" set "NODE_BIN=node"
"%NODE_BIN%" --version >nul 2>nul
if errorlevel 1 goto :nonode
if exist "%~dp0node_modules\ws\package.json" goto :run
echo Installing dependencies - first run only...
where npm >nul 2>nul
if errorlevel 1 goto :nonpm
pushd "%~dp0"
call npm install --no-audit --no-fund
popd
:run
echo Starting Muse Bridge from %~dp0 ...
"%NODE_BIN%" "%~dp0muse-bridge.js"
echo.
echo Bridge stopped - exit code %errorlevel%.
pause
exit /b 0
:nonpm
echo The ws dependency is missing and npm was not found.
echo Re-download the release zip or run npm install yourself.
pause
exit /b 1
:nonode
echo Node.js was not found next to this script or on PATH.
echo Re-download the release zip or install Node.js.
pause
exit /b 1