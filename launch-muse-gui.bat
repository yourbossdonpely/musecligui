@echo off
setlocal
title Muse GUI Launcher
rem Portable launcher: runs from wherever this folder is placed.
rem If the bridge is already up, skip straight to the GUI.
call :portup
if not errorlevel 1 goto :opengui
echo Starting bridge...
start "Muse Bridge" "%~dp0start-bridge.cmd"
rem Wait for the bridge to listen, up to about 25 seconds.
set /a tries=0
:waitloop
call :portup
if not errorlevel 1 goto :opengui
set /a tries+=1
if %tries% GEQ 25 goto :bridgefail
ping -n 2 127.0.0.1 >nul 2>nul
goto :waitloop
:opengui
echo Opening GUI...
if exist "%~dp0gui\dist\index.html" start "" "%~dp0gui\dist\index.html"
if exist "%~dp0gui\dist\index.html" exit /b 0
start "" "%~dp0muse-gui.html"
exit /b 0
:bridgefail
echo.
echo ERROR: the bridge did not start listening on port 8765.
echo Look at the Muse Bridge window for the error message.
echo.
pause
exit /b 1
:portup
netstat -ano | findstr /R /C:":8765 .*LISTENING" >nul 2>nul
exit /b %errorlevel%