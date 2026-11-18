@echo off
rem Tekin Araç Merkezi hub'ını başlatır. Node.js 18+ gerekir.
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden kurun.
  pause
  exit /b 1
)
node hub\server.js
pause
