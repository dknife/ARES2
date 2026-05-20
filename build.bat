@echo off
REM ============================================================
REM ARES offline build entry point (Windows).
REM Delegates to build.ps1 next to this file. Double-click or run
REM from cmd. Requires Node.js 18+ and curl (Windows 10/11 ships
REM curl by default). PowerShell is bundled with Windows.
REM
REM See Document/FinalBuild.md for the manual procedure.
REM ============================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
set RC=%ERRORLEVEL%

echo.
if %RC% NEQ 0 (
    echo === Build failed (exit %RC%) ===
) else (
    echo Run finished.
)

pause
exit /b %RC%
