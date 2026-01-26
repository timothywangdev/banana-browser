@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "BINARY=%SCRIPT_DIR%agent-browser-win32-x64.exe"

if exist "%BINARY%" (
    "%BINARY%" %*
    exit /b %errorlevel%
)

echo Error: No binary found for win32-x64 >&2
echo Run 'npm run build:native' to build for your platform >&2
exit /b 1
