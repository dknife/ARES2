# ============================================================
# ARES offline build (PowerShell logic)
# Invoked by build.bat.
# Mirrors Document/FinalBuild.md section 4.
# ============================================================

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
# Set-Location 은 PSDrive cwd 만 바꾸므로 .NET 의 Environment.CurrentDirectory 도
# 같이 맞춰 둔다. 그렇지 않으면 [System.IO.File]::WriteAllText('Build\...') 같은
# 상대 경로가 호출자의 셸 cwd(예: Missions\) 기준으로 풀려 실패한다.
[System.Environment]::CurrentDirectory = $PSScriptRoot

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-Utf8([string]$path) {
    return [System.IO.File]::ReadAllText((Resolve-Path $path).Path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8([string]$path, [string]$content) {
    [System.IO.File]::WriteAllText($path, $content, $Utf8NoBom)
}

# JSON-encode a .NET string as a valid JS string literal.
# Also neutralises any "</" so the literal cannot terminate its enclosing <script> tag.
function Encode-JsString([string]$s) {
    $json = ConvertTo-Json -InputObject $s -Compress -Depth 1
    return $json.Replace('</', '<\/')
}

Write-Host '=== ARES Offline Build ==='
Write-Host ''

# ---------- 1) Reset Build/ ----------
if (Test-Path Build) {
    Write-Host '[1/7] removing existing Build\ folder'
    Remove-Item -Recurse -Force Build
}
New-Item -ItemType Directory -Force -Path 'Build\vendor' | Out-Null
Write-Host '[1/7] Build\vendor created'
Write-Host ''

# ---------- 2) ES module bundle ----------
Write-Host '[2/7] bundling ES modules with esbuild...'
Push-Location Web
try {
    & npx --yes esbuild main.js --bundle --format=iife --target=es2018 --outfile='..\Build\main.bundle.js'
    if ($LASTEXITCODE -ne 0) { throw "esbuild exit $LASTEXITCODE" }
} finally {
    Pop-Location
}
Write-Host ''

# ---------- 3) Blockly download ----------
Write-Host '[3/7] downloading Blockly copies to vendor\...'
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
Write-Host '[4/7] copying dashboard.html, styles.css, index.css'
Copy-Item 'Web\dashboard.html' 'Build\dashboard.html' -Force
Copy-Item 'Web\styles.css'     'Build\styles.css'     -Force
Copy-Item 'Web\index.css'      'Build\index.css'      -Force

# 랜딩 페이지의 3D 로봇 히어로 에셋.
# three.js 로컬 번들 + 로봇 GLB를 base64 로 임베드한 클래식 스크립트.
# Build\index.html 은 file:// 로 열리므로(§5) ares_robot.embed.js 를 동적 로드해
# fetch 없이 parse 한다. file:// 전용 배포라 ares_robot.glb 는 빌드에 포함하지 않고,
# embed.js 한 파일만 Build\ 루트에 둔다(이전의 Build\Mesh\ 폴더는 폐기).
Write-Host '        + robot 3D embed (three bundle + ares_robot.embed.js)'
Copy-Item 'Web\vendor\three-bundle.min.js' 'Build\vendor\three-bundle.min.js' -Force
Copy-Item 'Web\Mesh\ares_robot.embed.js'   'Build\ares_robot.embed.js'        -Force

# WebGL 로봇 뷰어(알비 + 눈 LED)도 함께 배포 → Build\viewer\.
# 뷰어는 Resources\AlbiStaticLow.glb 를 fetch 하는데, file:// 에서는 막히므로
# 아래 7단계에서 GLB 를 inline_assets 에 인라인하고 뷰어에 shim 을 주입한다.
# WebGL\ 은 개인 개발 폴더라 저장소에 없을 수 있으므로 존재할 때만 복사한다.
if (Test-Path 'WebGL\index.html') {
    Write-Host '        + WebGL robot viewer -> Build\viewer\ (offline file://)'
    New-Item -ItemType Directory -Force -Path 'Build\viewer\vendor' | Out-Null
    Copy-Item 'WebGL\index.html'                 'Build\viewer\index.html'                 -Force
    Copy-Item 'WebGL\vendor\three-bundle.min.js' 'Build\viewer\vendor\three-bundle.min.js' -Force
} else {
    Write-Host '        (WebGL\ 없음 -- viewer 복사 건너뜀)'
}
Write-Host ''

# ---------- 5) Landing page (Web/index.html -> Build/index.html) ----------
# 새 진입점은 "탐사선 연결" 버튼이 있는 Web/index.html 이다. 이 파일의
# "../index.html"(프로젝트 루트로 돌아가기) 백링크는 Build 단독 배포에서는
# 도착지가 없으므로 제거한다.
Write-Host '[5/7] generating index.html (landing page)'
$landing = Read-Utf8 'Web\index.html'
$landing = $landing -replace '\s*<a href="\.\./index\.html"[^>]*>[^<]*</a>\s*', ''
# Build 산출물은 Mesh\ 폴더 없이 ares_robot.embed.js 만 루트에 둔다(§4 마지막).
# Web\index.html 의 'Mesh/ares_robot.embed.js' / 'Mesh/ares_robot.glb' 경로를
# 루트 기준으로 치환한다(후자는 file:// 분기에선 안 쓰이는 dead path 지만 정합성 유지).
$landing = $landing -replace 'Mesh/ares_robot\.embed\.js', 'ares_robot.embed.js'
$landing = $landing -replace 'Mesh/ares_robot\.glb',       'ares_robot.glb'
Write-Utf8 'Build\index.html' $landing
Write-Host ''

# ---------- 6) Patch main.html (block editor) ----------
# (a) Blockly CDN URL -> vendor/ local path
# (b) <script type="module" src="main.js"> -> inline_assets shim + main.bundle.js (defer)
Write-Host '[6/7] generating and patching main.html'
Copy-Item 'Web\main.html' 'Build\main.html' -Force
$mainPath = (Resolve-Path 'Build\main.html').Path
$c = Read-Utf8 'Build\main.html'
$c = $c -replace 'https://unpkg\.com/blockly@11/(\w+_compressed\.js)', 'vendor/$1'
$c = $c -replace `
    '<script type="module" src="main\.js"></script>', `
    '<script src="vendor/inline_assets.js" defer></script><script src="main.bundle.js" defer></script>'
Write-Utf8 $mainPath $c

# Sanity check
if (-not (Select-String -Path $mainPath -SimpleMatch 'main.bundle.js' -Quiet)) {
    throw 'main.html patch failed: main.bundle.js not present'
}
if (Select-String -Path $mainPath -SimpleMatch 'type="module"' -Quiet) {
    throw 'main.html patch failed: type="module" still present'
}
if (-not (Select-String -Path $mainPath -SimpleMatch 'inline_assets.js' -Quiet)) {
    throw 'main.html patch failed: inline_assets.js script tag not injected'
}
Write-Host ''

# ---------- 7) Inline assets (overview.html + 12 lesson.json + examples/*.xml) ----------
# main.js 는 런타임에 다음 세 종류를 fetch() 한다:
#   - overview.html
#   - Lesson{NN}/lesson.json   (NN = 01..12)
#   - examples/{name}.xml
# file:// 컨텍스트에서는 동일 출처 정책으로 fetch 가 차단되므로,
# 이 데이터들을 한 JS 파일에 문자열로 인라인하고 window.fetch 를 가로채는
# 얇은 shim 을 생성한다. shim 은 main.bundle.js 실행 전(같은 defer 순서)에
# 한 번만 설치된다.
Write-Host '[7/7] generating vendor\inline_assets.js'

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('// Auto-generated by build.ps1 -- inlined fetch() targets for file:// support.')
[void]$sb.AppendLine('(function () {')
[void]$sb.AppendLine('  if (window.__ARES_INLINE_INSTALLED__) return;')
[void]$sb.AppendLine('  window.__ARES_INLINE_INSTALLED__ = true;')
[void]$sb.AppendLine('  var DATA = {};')
[void]$sb.AppendLine('  var BIN = {};')

# overview.html
$overview = Read-Utf8 'Web\overview.html'
[void]$sb.AppendLine("  DATA['overview.html'] = " + (Encode-JsString $overview) + ';')

# Lesson{NN}/lesson.json
for ($i = 1; $i -le 12; $i++) {
    $pad = '{0:D2}' -f $i
    $p   = "Web\Lesson$pad\lesson.json"
    if (Test-Path $p) {
        $json = Read-Utf8 $p
        [void]$sb.AppendLine("  DATA['Lesson$pad/lesson.json'] = " + (Encode-JsString $json) + ';')
    } else {
        Write-Warning "missing $p -- skipped"
    }
}

# examples/*.xml
$exampleDir = 'Web\examples'
if (Test-Path $exampleDir) {
    foreach ($f in (Get-ChildItem $exampleDir -Filter '*.xml')) {
        $xml = Read-Utf8 $f.FullName
        $key = 'examples/' + $f.Name
        [void]$sb.AppendLine('  DATA[' + (Encode-JsString $key) + '] = ' + (Encode-JsString $xml) + ';')
    }
}

# 시뮬레이션 모델 GLB: file:// 에서 fetch 불가 → base64 로 BIN 에 인라인.
# 파일명만 키로 사용해 main.html(Mesh/...)과 viewer(Resources/...) 양쪽 fetch 모두 매칭한다.
# 알비(주제 1) 외에 우주 신호등(LampBox/LampGeneral/LampHand1~3)과 탐사선 발사대(LaunchStation)도
# file:// 오프라인에서 동작하도록 모두 인라인한다.
$simGlbs = @(
    'AlbiStaticLow.glb',
    'LampBox.glb',
    'LampGeneral.glb',
    'LampHand1.glb',
    'LampHand2.glb',
    'LampHand3.glb',
    'LaunchStation.glb'
)
foreach ($name in $simGlbs) {
    $p = "Web\Mesh\$name"
    if (Test-Path $p) {
        $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes((Resolve-Path $p).Path))
        [void]$sb.AppendLine("  BIN['$name'] = `"$b64`";")
        Write-Host ("        inlined GLB: $name ({0:N1} MB base64)" -f ($b64.Length / 1MB))
    } else {
        Write-Warning "Web\Mesh\$name 없음 -- 시뮬레이션 GLB 미인라인"
    }
}

[void]$sb.AppendLine(@'
  function b64ToU8(b64){ var s=atob(b64), n=s.length, u=new Uint8Array(n); for(var i=0;i<n;i++)u[i]=s.charCodeAt(i); return u; }
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  function norm(input){ var url=(typeof input==='string')?input:(input&&input.url)||''; return String(url).split('?')[0].split('#')[0]; }
  function find(obj, url){ for(var k in obj){ if(!Object.prototype.hasOwnProperty.call(obj,k))continue; if(url===k||url.endsWith('/'+k)||url.endsWith(k))return k; } return null; }
  function mimeFor(key){ if(key.endsWith('.json'))return 'application/json'; if(key.endsWith('.xml'))return 'application/xml'; return 'text/html; charset=utf-8'; }
  window.fetch = function (input, init) {
    var url = norm(input);
    var bk = find(BIN, url);
    if (bk !== null) return Promise.resolve(new Response(b64ToU8(BIN[bk]), { status:200, headers:{ 'Content-Type':'application/octet-stream' } }));
    var tk = find(DATA, url);
    if (tk !== null) return Promise.resolve(new Response(DATA[tk], { status:200, headers:{ 'Content-Type':mimeFor(tk) } }));
    if (origFetch) return origFetch(input, init);
    return Promise.reject(new Error('fetch unsupported (no inline match): '+url));
  };
})();
'@)

Write-Utf8 'Build\vendor\inline_assets.js' $sb.ToString()

# Sanity check inline_assets
$inlineKeys = (Select-String -Path 'Build\vendor\inline_assets.js' -Pattern "DATA\[" -AllMatches).Matches.Count
Write-Host ("        inlined entries: {0}" -f $inlineKeys)
if ($inlineKeys -lt 13) {
    throw "inline_assets.js: expected >= 13 entries (overview + 12 lessons), got $inlineKeys"
}
Write-Host ''

# 뷰어도 file:// 에서 GLB를 fetch shim 으로 받도록 inline_assets 주입
$vp = 'Build\viewer\index.html'
if (Test-Path $vp) {
    $v = Read-Utf8 $vp
    if ($v -notmatch 'inline_assets\.js') {
        $v = $v.Replace('<script src="vendor/three-bundle.min.js"></script>', "<script src=`"vendor/three-bundle.min.js`"></script>`n<script src=`"../vendor/inline_assets.js`"></script>")
        Write-Utf8 $vp $v
        Write-Host '        patched viewer\index.html -> inline_assets shim'
        Write-Host ''
    }
}

Write-Host '=== Build complete ==='
Write-Host ''
Write-Host 'Output    : Build\'
Write-Host 'Entry     : Build\index.html  (랜딩, 3D 로봇 손흔들기) -> 탐사선 연결 -> main.html'
Write-Host 'Viewer    : Build\viewer\index.html  (WebGL 3D 로봇 뷰어, file:// 오프라인)'
Write-Host 'Verify    : double-click Build\index.html'
Write-Host 'Distribute: ship the entire Build\ folder (self-contained)'
Write-Host ''
