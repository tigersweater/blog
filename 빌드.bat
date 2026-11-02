@echo off
chcp 65001 > nul
cd /d "%~dp0"

where node > nul 2> nul
if errorlevel 1 (
  echo [오류] Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 설치해 주세요.
  pause
  exit /b 1
)

node build.mjs
if errorlevel 1 (
  echo.
  echo 위 오류를 확인해 주세요.
  pause
  exit /b 1
)

echo.
set /p OPEN=블로그를 바로 열까요? (Y/N):
if /i "%OPEN%"=="Y" start "" "사이트\index.html"
