@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% equ 0 (
  node server.js
) else (
  set "PORTABLE_NODE="
  for /d %%D in ("%~dp0.tools\node-*-win-x64") do if exist "%%D\node.exe" set "PORTABLE_NODE=%%D\node.exe"
  call :portable
)
pause
exit /b

:portable
if defined PORTABLE_NODE (
  "%PORTABLE_NODE%" server.js
) else (
  echo Install Node.js 24 LTS from https://nodejs.org and run this file again.
)
exit /b
