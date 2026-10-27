@echo off
setlocal
cd /d "%~dp0"
echo Closing Bubba if it's running...
taskkill /F /IM bubba.exe >nul 2>&1
rem wait until the old bubba.exe has really exited (Windows keeps the file locked for a moment)
for /l %%i in (1,1,10) do (
  tasklist /FI "IMAGENAME eq bubba.exe" 2>nul | find /I "bubba.exe" >nul || goto closed
  timeout /t 1 /nobreak >nul
)
:closed
timeout /t 1 /nobreak >nul
echo Installing any new parts (first time takes a minute)...
call npm.cmd --prefix desktop install --no-audit --no-fund
echo Building Bubba (takes a few minutes)...
rem fewer parallel compile jobs = less memory
set CARGO_BUILD_JOBS=2
call npm.cmd --prefix desktop run tauri build -- --no-bundle
if errorlevel 1 (
  echo.
  echo Build failed - take a screenshot of the messages above and send it to Claude.
  pause
  exit /b 1
)
echo Copying the character videos next to Bubba...
robocopy "%~dp0desktop\public\videos" "%~dp0desktop\src-tauri\target\release\media\videos" /MIR /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo Copying videos failed - tell Claude.
  pause
  exit /b 1
)
echo Build done. Starting Bubba...
start "" "%~dp0desktop\src-tauri\target\release\bubba.exe"
