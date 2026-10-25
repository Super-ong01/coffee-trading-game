@echo off
setlocal
cd /d "%~dp0"
title Coffee Trading Game Server

set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

if not defined NODE_EXE goto :nonode

chcp 65001 >nul
start "" http://localhost:3000/host
"%NODE_EXE%" server.js
echo.
echo Server stopped.
pause
exit /b

:nonode
echo.
echo ============================================================
echo   Node.js is not installed on this computer.
echo.
echo   1. The download page will open now: https://nodejs.org
echo   2. Download the "LTS" version and install it (Next, Next, Finish)
echo   3. Close this window, then double-click start-windows.bat again
echo ============================================================
echo.
start "" https://nodejs.org/en/download
pause
exit /b
