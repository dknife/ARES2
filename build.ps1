# ============================================================
# ARES offline build (PowerShell logic)
# Invoked by build.bat.
# Mirrors Document/FinalBuild.md section 4.
# ============================================================

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host '=== ARES Offline Build ==='
Write-Host ''

# ---------- 1) Reset Build/ ----------
if (Test-Path Build) {
    Write-Host '[1/5] removing existing Build\ folder'
    Remove-Item -Recurse -Force Build
}
New-Item -ItemType Directory -Force -Path 'Build\vendor' | Out-Null
Write-Host '[1/5] Build\vendor created'
Write-Host ''

# ---------- 2) ES module bundle ----------
Write-Host '[2/5] bundling ES modules with esbuild...'
Push-Location Web
try {
    & npx --yes esbuild main.js --bundle --format=iife --target=es2018 --outfile='..\Build\main.bundle.js'
    if ($LASTEXITCODE -ne 0) { throw "esbuild exit $LASTEXITCODE" }
} finally {
    Pop-Location
}
Write-Host ''

# ---------- 3) Blockly download ----------
Write-Host '[3/5] downloading Blockly copies to vendor\...'
$blockly = @(
    'blockly_compressed.js',
    'blocks_compressed.js',
    'python_compressed.js'
)
foreach ($f in $blockly) {
    Invoke-WebRequest `
        -Uri ('https://unpkg.com/blockly@11/' + $f) `
        -OutFile (Join-Path 'Build\vendor' $f) `
        -UseBasicParsing
}
Write-Host ''

# ---------- 4) Static assets ----------
Write-Host '[4/5] copying dashboard.html and styles.css'
Copy-Item 'Web\dashboard.html' 'Build\dashboard.html' -Force
Copy-Item 'Web\styles.css'     'Build\styles.css'     -Force
Write-Host ''

# ---------- 5) Patch index.html ----------
#   (a) Blockly CDN URL -> vendor/ local path
#   (b) <script type="module" src="main.js"> -> <script src="main.bundle.js" defer>
Write-Host '[5/5] generating and patching index.html'
Copy-Item 'Web\main.html' 'Build\index.html' -Force

$path = (Resolve-Path 'Build\index.html').Path
# UTF-8을 명시해서 읽는다. PowerShell 5.1의 Get-Content는 시스템 기본 인코딩
# (한국어 Windows는 CP949)으로 읽기 때문에 한글이 깨진다.
$c    = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$c    = $c -replace 'https://unpkg\.com/blockly@11/(\w+_compressed\.js)', 'vendor/$1'
$c    = $c -replace '<script type="module" src="main\.js"></script>',     '<script src="main.bundle.js" defer></script>'
[System.IO.File]::WriteAllText($path, $c, (New-Object System.Text.UTF8Encoding($false)))

# Sanity check
if (-not (Select-String -Path $path -SimpleMatch 'main.bundle.js' -Quiet)) {
    throw 'index.html patch failed: main.bundle.js not present'
}
if (Select-String -Path $path -SimpleMatch 'type="module"' -Quiet) {
    throw 'index.html patch failed: type="module" still present'
}
Write-Host ''

Write-Host '=== Build complete ==='
Write-Host ''
Write-Host 'Output    : Build\'
Write-Host 'Verify    : double-click Build\index.html'
Write-Host 'Distribute: ship the entire Build\ folder (self-contained)'
Write-Host ''
