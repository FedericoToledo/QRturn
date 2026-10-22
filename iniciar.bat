@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Instala Node.js desde https://nodejs.org y volve a abrir este archivo.
  pause
  exit /b 1
)
node server.mjs
pause
