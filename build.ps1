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
Write-Host '[4/7] copying dashboard.html, styles.css, index.css, mobile-preview.js'
Copy-Item 'Web\dashboard.html'     'Build\dashboard.html'     -Force
Copy-Item 'Web\styles.css'         'Build\styles.css'         -Force
Copy-Item 'Web\index.css'          'Build\index.css'          -Force
# index.html / main.html 의 <head> 최상단에서 클래식 스크립트로 로드되므로
# Build\ 루트에도 그대로 복사해야 ?mobile=true 미리보기가 동작한다.
Copy-Item 'Web\mobile-preview.js'  'Build\mobile-preview.js'  -Force
# UI 이미지(로고·아바타·툴박스 아이콘·nav 마스크). main.html/styles.css 가
# assets/design/*.png 를 <img>/CSS url() 로 참조 — file:// 에서도 그대로 로드된다.
Copy-Item 'Web\assets' 'Build\assets' -Recurse -Force
# 임시작업\ 등 배포와 무관한 작업용 폴더는 산출물에서 제외(추적 대상 Build\ 오염 방지)
if (Test-Path 'Build\assets\임시작업') { Remove-Item 'Build\assets\임시작업' -Recurse -Force }
# 로컬 서브셋 폰트(fonts/fonts.css + *.woff2). index/main/dashboard 가 링크한다.
# 오프라인에서는 Google Fonts 대신 이 로컬 폰트가 시각 일관성을 보장한다.
Copy-Item 'Web\fonts' 'Build\fonts' -Recurse -Force

# CSS mask-image 는 CORS 필수 리소스라 file:// (origin: null) 에서 차단된다 —
# 하단 내비·연결 버튼·설정 아이콘이 안 그려지는 원인. Build\styles.css 의
# assets/ 참조 url() 을 data URI 로 인라인해 오프라인에서도 렌더되게 한다.
# (<img src="assets/..."> 는 CORS 무관이라 파일 복사본을 그대로 쓴다)
$cssEval = {
    param($m)
    $rel = $m.Groups[1].Value
    $src = Join-Path 'Web' ($rel -replace '/', '\')
    if (-not (Test-Path $src)) { return $m.Value }
    $ext  = [System.IO.Path]::GetExtension($src).TrimStart('.').ToLower()
    $mime = if ($ext -eq 'svg') { 'image/svg+xml' } else { "image/$ext" }
    $b64  = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes((Resolve-Path $src).Path))
    return "url('data:$mime;base64,$b64')"
}
$css = Read-Utf8 'Build\styles.css'
$css = [regex]::Replace($css, "url\('(assets/[^'?]+)(\?[^']*)?'\)", $cssEval)
Write-Utf8 (Resolve-Path 'Build\styles.css').Path $css
Write-Host '        + styles.css: assets/ url() -> data URI (file:// mask-image CORS 회피)'

# 랜딩 페이지의 3D 로봇 히어로 에셋.
# three.js 로컬 번들 + 로봇 GLB를 base64 로 임베드한 클래식 스크립트.
# Build\index.html 은 file:// 로 열리므로(§5) ares_robot.embed.js 를 동적 로드해
# fetch 없이 parse 한다. file:// 전용 배포라 ares_robot.glb 는 빌드에 포함하지 않고,
# embed.js 한 파일만 Build\ 루트에 둔다(이전의 Build\Mesh\ 폴더는 폐기).
Write-Host '        + robot 3D embed (three bundle + ares_robot.embed.js)'
Copy-Item 'Web\vendor\three-bundle.min.js' 'Build\vendor\three-bundle.min.js' -Force
# Meshopt(EXT_meshopt_compression) 압축 GLB 디코더 — UMD, window.MeshoptDecoder 노출.
# main.html / index.html / viewer\index.html 의 three-bundle 직후 <script> 가 이걸 로드한다.
# 모든 GLB(시뮬 14종·랜딩 로봇 임베드)가 meshopt 압축본이므로 필수다.
# (2026-07-09 텍스처 1024² 리사이즈 후 meshopt 재압축으로 동일 구성 유지)
Copy-Item 'Web\vendor\meshopt_decoder.js'  'Build\vendor\meshopt_decoder.js'  -Force
# 히어로 로봇은 AlbiRobot.embed.js(현행), 개발자 스폰용 ares_robot.embed.js 도 함께 둔다
Copy-Item 'Web\Mesh\AlbiRobot\AlbiRobot.embed.js' 'Build\AlbiRobot.embed.js'   -Force
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
    Copy-Item 'WebGL\vendor\meshopt_decoder.js'  'Build\viewer\vendor\meshopt_decoder.js'  -Force
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
# Build 산출물은 Mesh\ 폴더 없이 임베드/에셋을 루트에 둔다(§4 마지막).
# 히어로 로봇(AlbiRobot) 임베드/메시 경로를 평탄화한다 — 빠뜨리면 file:// 랜딩에서
# '로봇을 불러오지 못했어요' 로 실패한다.
$landing = $landing -replace 'Mesh/AlbiRobot/AlbiRobot\.embed\.js', 'AlbiRobot.embed.js'
$landing = $landing -replace 'Mesh/AlbiRobot/AlbiRobot\.min\.glb',  'AlbiRobot.min.glb'
$landing = $landing -replace 'Mesh/ares_robot\.embed\.js', 'ares_robot.embed.js'
$landing = $landing -replace 'Mesh/ares_robot\.glb',       'ares_robot.glb'
# file://(origin null)는 CSS mask·WebGL 텍스처 이미지 fetch 를 CORS 로 막는다. 인라인 <style>
# 의 mask url() 과 컷씬 배경 텍스처(planet_approach)를 data URI 로 치환해야 아이콘·화성 배경이 보인다.
$landing = [regex]::Replace($landing, "url\('(assets/[^'?]+)(\?[^']*)?'\)", $cssEval)
$bgSrc = 'Web\assets\background\planet_approach.png'
if (Test-Path $bgSrc) {
    $bgB64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes((Resolve-Path $bgSrc).Path))
    $landing = $landing.Replace("'assets/background/planet_approach.png'", "'data:image/png;base64,$bgB64'")
    Write-Host '        + index.html: cutscene bg + mask icons -> data URI (file:// CORS)'
}
Write-Utf8 'Build\index.html' $landing
Write-Host ''

# ---------- 5.5) Enumerate GLB sources to plan bin chunks ----------
# inline_assets 를 GLB 1개당 vendor/bin_*.js 1개로 쪼개기 위해 먼저 소스 GLB 의
# 파일 목록만 수집한다. 실제 base64 임베드는 step 7 에서 수행. step 6 의 main.html
# 패치가 <script src="vendor/bin_*.js"> 를 미리 끼워 넣어야 하므로 이름 목록을
# 사전에 알아야 한다.
$simGlbs = @(
    'AlbiStaticLow.glb',
    'LampBox.glb',
    'LampGeneral.glb',
    'LampHand1.glb',
    'LampHand2.glb',
    'LampHand3.glb',
    'LaunchStation.glb',
    'ares_robot.glb'          # 개발자 모드 GLB 스폰 메뉴(Mesh/manifest.json)가 참조
)
$binEntries = New-Object System.Collections.Generic.List[object]
foreach ($name in $simGlbs) {
    $p = "Web\Mesh\$name"
    if (Test-Path $p) {
        $binEntries.Add([pscustomobject]@{ glb = $name; src = (Resolve-Path $p).Path })
    } else {
        Write-Warning "Web\Mesh\$name 없음 -- skip"
    }
}
if (Test-Path 'Web\Mesh\RoverParts') {
    foreach ($f in (Get-ChildItem 'Web\Mesh\RoverParts' -Filter '*.glb')) {
        $binEntries.Add([pscustomobject]@{ glb = $f.Name; src = $f.FullName })
    }
}
# 환경 장식 에셋(우주인 등) — 스폰 메뉴·씬 파일이 Mesh/EnvAssets/… 로 참조한다
if (Test-Path 'Web\Mesh\EnvAssets') {
    foreach ($f in (Get-ChildItem 'Web\Mesh\EnvAssets' -Filter '*.glb')) {
        $binEntries.Add([pscustomobject]@{ glb = $f.Name; src = $f.FullName })
    }
}
# 서비스 씬(newalbo_01·launch_pad)이 참조하는 압축 메시 — 하위 폴더의 *.min.glb 만
# 인라인한다(원본 대용량 *.glb 는 .gitignore 대상이라 제외). 이 폴더들을 빠뜨리면
# file:// 빌드에서 '알비 기본 모델'·'발사대_제작' 씬의 3D 메시가 로드되지 않는다.
foreach ($sub in @('AlbiRobot', 'RocketAndLauncher')) {
    $dir = "Web\Mesh\$sub"
    if (Test-Path $dir) {
        foreach ($f in (Get-ChildItem $dir -Filter '*.min.glb')) {
            $binEntries.Add([pscustomobject]@{ glb = $f.Name; src = $f.FullName })
        }
    }
}
$binScriptNames = @($binEntries | ForEach-Object {
    'bin_' + [System.IO.Path]::GetFileNameWithoutExtension($_.glb) + '.js'
})
Write-Host ("        enumerated $($binEntries.Count) GLB sources -> $($binScriptNames.Count) bin chunks")
Write-Host ''

# ---------- 6) Patch main.html (block editor) ----------
# (a) Blockly CDN URL -> vendor/ local path
# (b) <script type="module" src="main.js"> -> bin_*.js 청크들 + inline_assets shim + main.bundle.js (defer)
#     defer 스크립트는 문서 순서대로 실행되므로 bin_*.js (BIN 채움) -> inline_assets.js
#     (DATA + shim 설치) -> main.bundle.js (앱 시작) 순서가 보장된다.
Write-Host '[6/7] generating and patching main.html'
Copy-Item 'Web\main.html' 'Build\main.html' -Force
$mainPath = (Resolve-Path 'Build\main.html').Path
$c = Read-Utf8 'Build\main.html'
$c = $c -replace 'https://unpkg\.com/blockly@11/(\w+_compressed\.js)', 'vendor/$1'
$mainBinTags = ($binScriptNames | ForEach-Object { "    <script src=`"vendor/$_`" defer></script>" }) -join "`n"
$mainReplacement = "$mainBinTags`n    <script src=`"vendor/inline_assets.js`" defer></script>`n    <script src=`"main.bundle.js`" defer></script>"
# src="main.js" 뒤에 캐시버스터 쿼리(?v=...)가 붙어 있어도 매치되도록 허용
$c = $c -replace '<script type="module" src="main\.js(\?[^"]*)?"></script>', $mainReplacement
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
if ($binScriptNames.Count -gt 0) {
    $firstBin = $binScriptNames[0]
    if (-not (Select-String -Path $mainPath -SimpleMatch $firstBin -Quiet)) {
        throw "main.html patch failed: bin chunk '$firstBin' script tag not injected"
    }
}
Write-Host ''

# ---------- 7) Inline assets: per-GLB bin chunks + text shim ----------
# 한 GLB 당 vendor/bin_<stem>.js 하나에 base64 1줄로 분리한다. 텍스트 자산
# (overview.html / lesson.json / examples/*.xml) 과 fetch shim 만 한 곳
# (vendor/inline_assets.js) 에 남긴다.
#
# Why: 통합 inline_assets.js 가 GitHub 절대 한도(100 MB) 를 넘기는 사태를 막기 위함.
#   - GLB 1개당 base64 ~10~20 MB → 청크 1개도 한도와 무관.
#   - 자산 추가/제거 시 변경 diff 가 해당 청크 파일에만 국한.
#
# fetch shim 매칭 로직은 변경 없음 — 키는 여전히 파일명("Foo.glb").
#   - main.html (Mesh/Foo.glb · Mesh/RoverParts/Foo.glb) 도 endsWith 로 매칭
#   - viewer (Resources/AlbiStaticLow.glb) 도 동일
Write-Host '[7/7] generating vendor\bin_*.js (per-GLB chunks) + vendor\inline_assets.js (text + fetch shim)'

# 7a) GLB → vendor/bin_<stem>.js 1개씩.
foreach ($e in $binEntries) {
    $glb  = $e.glb
    $src  = $e.src
    $b64  = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($src))
    $stem = [System.IO.Path]::GetFileNameWithoutExtension($glb)
    $binPath = "Build\vendor\bin_$stem.js"
    $jsLit  = (ConvertTo-Json -InputObject $b64 -Compress -Depth 1).Replace('</','<\/')
    $keyLit = Encode-JsString $glb
    $line   = "(window.__ARES_BIN__ = window.__ARES_BIN__ || {})[$keyLit] = $jsLit;`n"
    Write-Utf8 $binPath $line
    Write-Host ("        chunk: vendor/bin_$stem.js ({0:N1} MB base64)" -f ($b64.Length / 1MB))
}

# 7b) inline_assets.js — 텍스트 자산 + fetch shim. (GLB 는 bin_*.js 가 이미 채움)
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('// Auto-generated by build.ps1 -- text assets + fetch shim. GLB binaries are split into vendor/bin_*.js (loaded earlier).')
[void]$sb.AppendLine('(function () {')
[void]$sb.AppendLine('  if (window.__ARES_INLINE_INSTALLED__) return;')
[void]$sb.AppendLine('  window.__ARES_INLINE_INSTALLED__ = true;')
[void]$sb.AppendLine('  var DATA = {};')
[void]$sb.AppendLine('  // BIN 은 bin_*.js 들이 이 스크립트 직전 defer 순서로 채워 둔 글로벌.')
[void]$sb.AppendLine('  var BIN = window.__ARES_BIN__ || (window.__ARES_BIN__ = {});')

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

# scenes/*.json — 서비스 씬 체계(manifest + 씬 파일). Simulation_Main 이
# scenes/manifest.json 을 fetch 해 드롭다운을 구성하고 hiddenTopics 로 레거시
# 토픽을 숨긴다. 인라인하지 않으면 file:// 에서 서비스 씬이 통째로 사라진다.
if (Test-Path 'Web\scenes') {
    foreach ($f in (Get-ChildItem 'Web\scenes' -Filter '*.json')) {
        $key = 'scenes/' + $f.Name
        [void]$sb.AppendLine('  DATA[' + (Encode-JsString $key) + '] = ' + (Encode-JsString (Read-Utf8 $f.FullName)) + ';')
    }
}

# Mesh/manifest.json — 개발자 모드 'GLB 모델' 스폰 메뉴의 자산 목록
if (Test-Path 'Web\Mesh\manifest.json') {
    [void]$sb.AppendLine("  DATA['Mesh/manifest.json'] = " + (Encode-JsString (Read-Utf8 'Web\Mesh\manifest.json')) + ';')
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

# Sanity check inline_assets + chunks
$inlineKeys = (Select-String -Path 'Build\vendor\inline_assets.js' -Pattern "DATA\[" -AllMatches).Matches.Count
$binCount   = (Get-ChildItem 'Build\vendor' -Filter 'bin_*.js' | Measure-Object).Count
Write-Host ("        text entries: $inlineKeys,  bin chunks: $binCount")
if ($inlineKeys -lt 13) { throw "inline_assets.js: expected >= 13 text entries (overview + 12 lessons), got $inlineKeys" }
if ($binCount   -lt 1)  { throw "vendor/bin_*.js: no chunks generated" }

# 단일 청크가 95 MB 를 넘으면 GitHub 100 MB 한도 위험 → 빌드 경고.
$maxBin = Get-ChildItem 'Build\vendor' -Filter 'bin_*.js' | Sort-Object Length -Descending | Select-Object -First 1
if ($maxBin) {
    $maxMB = $maxBin.Length / 1MB
    Write-Host ("        largest chunk: $($maxBin.Name) ({0:N1} MB)" -f $maxMB)
    if ($maxMB -gt 95) {
        Write-Warning "single bin chunk exceeds 95 MB ($($maxBin.Name)) -- GitHub 100 MB hard limit risk"
    }
}
Write-Host ''

# 7b') 랜딩(index.html)이 file:// 에서 fetch 로 읽는 GLB 에 fetch shim 을 제공한다.
#      컷씬 로켓(Rocket.min.glb) + 히어로 주위 유영 우주인(Astronaut.glb). 히어로 본체는
#      임베드(AlbiRobot.embed.js)라 별도. shim 이 설치되면 우주인 생략 가드도 풀린다.
$landingBins = $binScriptNames | Where-Object { $_ -like 'bin_Rocket*' -or $_ -like 'bin_Astronaut*' }
$lp = 'Build\index.html'
$li = Read-Utf8 $lp
$anchor = '<script src="vendor/meshopt_decoder.js"></script>'
if ($landingBins -and ($li -match [regex]::Escape($anchor)) -and ($li -notmatch 'inline_assets\.js')) {
    $binTags = ($landingBins | ForEach-Object { "    <script src=`"vendor/$_`"></script>" }) -join "`n"
    $shimTags = "$anchor`n$binTags`n    <script src=`"vendor/inline_assets.js`"></script>"
    $li = $li -replace [regex]::Escape($anchor), $shimTags
    Write-Utf8 $lp $li
    Write-Host "        injected landing shim into index.html ($($landingBins -join ', ') + inline_assets)"
} else {
    Write-Warning '랜딩 shim 주입 실패 -- anchor/bin 확인 필요'
}
Write-Host ''

# 7c) viewer 도 동일하게 bin_*.js 들 + inline_assets.js 를 로드.
$vp = 'Build\viewer\index.html'
if (Test-Path $vp) {
    $v = Read-Utf8 $vp
    if ($v -notmatch 'inline_assets\.js') {
        $viewerBinTags = ($binScriptNames | ForEach-Object { "  <script src=`"../vendor/$_`"></script>" }) -join "`n"
        $injection = "<script src=`"vendor/three-bundle.min.js`"></script>`n$viewerBinTags`n  <script src=`"../vendor/inline_assets.js`"></script>"
        $v = $v.Replace('<script src="vendor/three-bundle.min.js"></script>', $injection)
        Write-Utf8 $vp $v
        Write-Host '        patched viewer\index.html -> bin chunks + inline_assets shim'
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
