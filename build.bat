@echo off
REM ============================================================
REM ARES offline build entry point (Windows).
REM Delegates to build.ps1 next to this file. Double-click or run
REM from cmd. Requires Node.js 18+ and curl (Windows 10/11 ships
REM curl by default). PowerShell is bundled with Windows.
REM
REM Build artifact: Build\
REM   - Build\index.html         (랜딩: "탐사선 연결" 버튼 -> main.html)
REM   - Build\main.html          (관제실/블록 코딩 + dashboard iframe)
REM   - Build\dashboard.html
REM   - Build\styles.css, Build\index.css
REM   - Build\mobile-preview.js  (?mobile=true 휴대폰 프레임 미리보기, 클래식 스크립트)
REM   - Build\main.bundle.js     (8개 ES 모듈 IIFE 번들)
REM   - Build\vendor\
REM       bin_<name>.js          (시뮬레이션 GLB 1개당 base64 청크 1개 — GitHub
REM                                100 MB 한도 회피용 분할)
REM       inline_assets.js       (overview.html, Lesson*/lesson.json,
REM                                examples/*.xml 인라인 + fetch() shim)
REM       blockly_compressed.js, blocks_compressed.js,
REM       python_compressed.js
REM
REM See Document\FinalBuild.md for the full procedure (manual + 자동화).
REM ============================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
set RC=%ERRORLEVEL%

echo.
if %RC% NEQ 0 (
    echo === Build failed (exit %RC%) ===
) else (
    echo === Build OK. Open Build\index.html in Chrome/Edge to verify. ===
)

pause
exit /b %RC%
