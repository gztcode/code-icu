@echo off
setlocal
rem Code ICU · Windows 一键启动
cd /d "%~dp0"

set "PORT=8765"
set "URL=http://127.0.0.1:%PORT%/"

where node >nul 2>nul
if not errorlevel 1 goto :run_node
where python >nul 2>nul
if not errorlevel 1 goto :run_python
where py >nul 2>nul
if not errorlevel 1 goto :run_py

echo.
echo [Code ICU] No Node.js or Python 3 found.
echo.
echo Two ways out:
echo   1. Install Node.js from https://nodejs.org/  then run this file again
echo   2. Use the online version: https://gztcode.github.io/code-icu/
echo.
pause
exit /b 1

:run_node
echo [Code ICU] Starting with Node.js on port %PORT% ...
timeout /t 2 /nobreak >nul
start "" "%URL%"
node server.mjs %PORT%
goto :eof

:run_python
echo [Code ICU] Starting with Python on port %PORT% ...
timeout /t 2 /nobreak >nul
start "" "%URL%"
python serve.py %PORT% code-icu
goto :eof

:run_py
echo [Code ICU] Starting with Python on port %PORT% ...
timeout /t 2 /nobreak >nul
start "" "%URL%"
py -3 serve.py %PORT% code-icu
goto :eof
