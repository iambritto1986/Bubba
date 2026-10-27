@echo off
setlocal
set "ROOT=%~dp0"

REM Clear any stuck invisible instance before launching fresh
taskkill /F /IM bubba.exe >nul 2>&1

if exist "%ROOT%desktop\src-tauri\target\release\bubba.exe" (
  start "" "%ROOT%desktop\src-tauri\target\release\bubba.exe"
  exit /b 0
)

REM Fallback to debug binary (ensure Vite is running on port 1420)
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri 'http://localhost:1420' -UseBasicParsing -TimeoutSec 1 } catch { Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList '/c cd /d ""%ROOT%desktop"" && npm.cmd run dev'; Start-Sleep -Seconds 2 }"
start "" "%ROOT%desktop\src-tauri\target\debug\bubba.exe"
