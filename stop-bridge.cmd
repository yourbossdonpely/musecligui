@echo off
rem stop-bridge.cmd — stops the Muse bridge (frees ports 8765/8766).
rem Same as the Quit button in the GUI footer. Restart with MuseCLIGUI.exe.
title Stopping Muse bridge
powershell -NoProfile -Command "$p = Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1; if ($p) { Stop-Process -Id $p -Force; Write-Host ('Bridge stopped (was pid ' + $p + '). Re-run MuseCLIGUI.exe to restart.') } else { Write-Host 'Bridge is not running (port 8765 is free).' }"
pause
