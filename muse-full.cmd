@echo off
set "MUSE_CMD=%LOCALAPPDATA%\Programs\muse\muse.cmd"
if not exist "%MUSE_CMD%" set "MUSE_CMD=muse"
"%MUSE_CMD%" --yolo --disable-sandbox --disable-approval --trust-workspace %*