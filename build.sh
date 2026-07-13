#!/usr/bin/env bash
# ============================================================
# ARES offline build (macOS / Linux, bash)
# build.ps1 (Windows)과 동일한 Build/ 산출물을 생성한다.
# 결과 폴더 Build/ 는 file:// 로 열어도(인터넷 없이) 전 기능이 동작한다:
#   - 블록 에디터(main.html): ES모듈 번들 + Blockly 로컬 + fetch shim
#   - 랜딩(index.html): 손 흔드는 3D 로봇(임베드 GLB)
#   - 미션 시뮬레이션: 알비 3D + 눈 LED (GLB를 fetch shim이 바이너리로 제공)
#   - 3D 뷰어(viewer/)
# 사용법:  ./build.sh
# 요구사항: node(npx), curl, python3
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "=== ARES Offline Build (macOS/Linux) ==="

# ---------- 1) Build/ 초기화 ----------
echo "[1/7] reset Build/"
rm -rf Build
mkdir -p Build/vendor

# ---------- 2) ES 모듈 번들 ----------
echo "[2/7] esbuild main.js -> Build/main.bundle.js"
( cd Web && npx --yes esbuild main.js --bundle --format=iife --target=es2018 --outfile=../Build/main.bundle.js )

# ---------- 3) Blockly 로컬 사본 ----------
echo "[3/7] download Blockly@11 -> Build/vendor/"
for f in blockly_compressed.js blocks_compressed.js python_compressed.js; do
  curl -fsSL -o "Build/vendor/$f" "https://unpkg.com/blockly@11/$f"
  echo "        $f"
done

# ---------- 4) 정적 에셋 + 로봇 + 뷰어 ----------
echo "[4/7] copy static assets + robot + viewer"
cp Web/dashboard.html Build/dashboard.html
cp Web/styles.css     Build/styles.css
cp Web/index.css      Build/index.css
cp Web/mobile-preview.js Build/mobile-preview.js
# UI 이미지(로고·아바타·툴박스 아이콘·nav 마스크) + 로컬 서브셋 폰트
cp -R Web/assets Build/assets
cp -R Web/fonts  Build/fonts
# 임시작업/ 등 배포와 무관한 작업용 폴더·.DS_Store 는 산출물에서 제외(추적 대상 Build/ 오염 방지)
rm -rf Build/assets/임시작업
find Build -name '.DS_Store' -delete 2>/dev/null || true
cp Web/vendor/three-bundle.min.js Build/vendor/three-bundle.min.js
# meshopt 디코더: 모든 GLB(시뮬 14종·랜딩 로봇 임베드)가 meshopt 압축본 — 필수
cp Web/vendor/meshopt_decoder.js  Build/vendor/meshopt_decoder.js
# 랜딩 로봇 임베드는 Build 루트에 평탄화한다(build.ps1 과 동일 — Build/Mesh 없음)
# 히어로 로봇은 AlbiRobot.embed.js(현행), 개발자 스폰용 ares_robot.embed.js 도 함께 둔다
cp Web/Mesh/AlbiRobot/AlbiRobot.embed.js Build/AlbiRobot.embed.js
cp Web/Mesh/ares_robot.embed.js          Build/ares_robot.embed.js
# WebGL 뷰어(개인 폴더라 없을 수 있음) — 있으면 함께 배포
if [ -f WebGL/index.html ]; then
  echo "        + WebGL viewer -> Build/viewer/"
  mkdir -p Build/viewer/vendor
  cp WebGL/index.html                 Build/viewer/index.html
  cp WebGL/vendor/three-bundle.min.js Build/viewer/vendor/three-bundle.min.js
  cp WebGL/vendor/meshopt_decoder.js  Build/viewer/vendor/meshopt_decoder.js
else
  echo "        (WebGL/ 없음 -- viewer 건너뜀)"
fi

# ---------- 5~7) 랜딩 생성 + main.html 패치 + bin 청크 + inline_assets ----------
echo "[5/7] index.html (landing)"
echo "[6/7] main.html (block editor patch)"
echo "[7/7] vendor/bin_*.js (per-GLB chunks) + vendor/inline_assets.js (text + fetch shim)"
python3 - <<'PY'
import os, re, json, base64, glob, sys

def R(p):  return open(p, encoding='utf-8').read()
def Rb(p): return open(p, 'rb').read()
def W(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8', newline='').write(s)
def js(s):  # JS 문자열 리터럴로 인코딩 + </ 무력화
    return json.dumps(s, ensure_ascii=False).replace('</', '<\\/')

# ---- 5) 랜딩: Web/index.html → Build/index.html ----
# 백링크 제거 + 로봇 임베드 경로 평탄화(Build 루트, Build/Mesh 없음 — build.ps1 동일)
landing = R('Web/index.html')
landing = re.sub(r'\s*<a href="\.\./index\.html"[^>]*>[^<]*</a>\s*', '', landing)
# 히어로 로봇(AlbiRobot) 임베드/메시 경로 평탄화 — Build 에는 Mesh/ 폴더가 없다.
# 이 평탄화를 빠뜨리면 file:// 랜딩에서 '로봇을 불러오지 못했어요' 로 실패한다.
landing = landing.replace('Mesh/AlbiRobot/AlbiRobot.embed.js', 'AlbiRobot.embed.js')
landing = landing.replace('Mesh/AlbiRobot/AlbiRobot.min.glb', 'AlbiRobot.min.glb')
landing = landing.replace('Mesh/ares_robot.embed.js', 'ares_robot.embed.js')
landing = landing.replace('Mesh/ares_robot.glb', 'ares_robot.glb')
# file://(origin null)는 <img crossOrigin>·CSS mask·WebGL 텍스처의 이미지 fetch 를 CORS 로
# 막는다(원격 GLB 와 동일한 이유). 인라인 <style> 의 mask url() 과 컷씬 배경 텍스처
# (planet_approach)를 data URI 로 치환해야 file:// 에서 아이콘·화성 배경이 보인다.
def _asset_datauri(rel):
    p = 'Web/' + rel
    if not os.path.exists(p): return None
    ext = os.path.splitext(p)[1].lstrip('.').lower()
    mime = 'image/svg+xml' if ext == 'svg' else 'image/' + ('jpeg' if ext == 'jpg' else ext)
    return 'data:%s;base64,%s' % (mime, base64.b64encode(Rb(p)).decode())
landing = re.sub(r"url\('(assets/[^'?]+)(\?[^']*)?'\)",
                 lambda m: "url('%s')" % (_asset_datauri(m.group(1)) or m.group(1)), landing)
_bg = _asset_datauri('assets/background/planet_approach.png')
if _bg:
    landing = landing.replace("'assets/background/planet_approach.png'", "'%s'" % _bg)
    print('        inlined cutscene bg + mask icons to data URI (file:// CORS)')
W('Build/index.html', landing)

# ---- 5.5) GLB 소스 열거 → GLB 1개당 vendor/bin_<stem>.js 1개 (build.ps1 §5.5/§7a 동일) ----
sim_glbs = ['AlbiStaticLow.glb', 'LampBox.glb', 'LampGeneral.glb',
            'LampHand1.glb', 'LampHand2.glb', 'LampHand3.glb',
            'LaunchStation.glb', 'ares_robot.glb']
entries = []
for name in sim_glbs:
    p = 'Web/Mesh/' + name
    if os.path.exists(p): entries.append((name, p))
    else: print('        WARNING: %s 없음 -- skip' % p)
for p in sorted(glob.glob('Web/Mesh/RoverParts/*.glb')):
    entries.append((os.path.basename(p), p))
# 환경 장식 에셋(우주인 등) — 스폰 메뉴·씬 파일이 Mesh/EnvAssets/… 로 참조
for p in sorted(glob.glob('Web/Mesh/EnvAssets/*.glb')):
    entries.append((os.path.basename(p), p))
# 서비스 씬(newalbo_01·launch_pad)이 참조하는 압축 메시 — 하위 폴더의 *.min.glb 만
# 인라인한다(원본 대용량 *.glb 는 .gitignore 대상이라 제외). 이 폴더들을 빠뜨리면
# file:// 빌드에서 '알비 기본 모델'·'발사대_제작' 씬의 3D 메시가 로드되지 않는다.
for sub in ('AlbiRobot', 'RocketAndLauncher'):
    for p in sorted(glob.glob('Web/Mesh/%s/*.min.glb' % sub)):
        entries.append((os.path.basename(p), p))

bin_scripts = []
for name, p in entries:
    stem = os.path.splitext(name)[0]
    b64 = base64.b64encode(Rb(p)).decode()
    W('Build/vendor/bin_%s.js' % stem,
      "(window.__ARES_BIN__ = window.__ARES_BIN__ || {})[%s] = %s;\n" % (js(name), json.dumps(b64)))
    bin_scripts.append('bin_%s.js' % stem)
    print('        chunk: vendor/bin_%s.js (%.1f MB base64)' % (stem, len(b64)/1048576))
assert bin_scripts, 'no GLB chunks generated'

# ---- 5.7) styles.css: assets/ url() → data URI ----
# CSS mask-image 는 CORS 필수 리소스라 file:// (origin: null) 에서 차단된다 —
# 하단 내비·연결 버튼·설정 아이콘이 안 그려지는 원인. data URI 는 same-origin.
def _data_uri(m):
    rel = m.group(1)
    p = 'Web/' + rel
    if not os.path.exists(p): return m.group(0)
    ext = os.path.splitext(p)[1].lstrip('.').lower()
    mime = 'image/svg+xml' if ext == 'svg' else 'image/' + ext
    return "url('data:%s;base64,%s')" % (mime, base64.b64encode(Rb(p)).decode())
css = R('Build/styles.css')
css = re.sub(r"url\('(assets/[^'?]+)(\?[^']*)?'\)", _data_uri, css)
W('Build/styles.css', css)
print('        styles.css: assets/ url() -> data URI (file:// mask-image CORS)')

# ---- 6) 블록 에디터: main.html 패치 (Blockly CDN→vendor, ES모듈→bin+shim+번들) ----
c = R('Web/main.html')
c = re.sub(r'https://unpkg\.com/blockly@11/(\w+_compressed\.js)', r'vendor/\1', c)
bin_tags = '\n'.join('    <script src="vendor/%s" defer></script>' % s for s in bin_scripts)
repl = (bin_tags
        + '\n    <script src="vendor/inline_assets.js" defer></script>'
        + '\n    <script src="main.bundle.js" defer></script>')
# src="main.js" 뒤에 캐시버스터 쿼리(?v=...)가 붙어 있어도 매치되도록 허용
c, cnt = re.subn(r'<script type="module" src="main\.js(\?[^"]*)?"></script>', repl.replace('\\', '\\\\'), c)
assert cnt == 1, 'main.html patch failed: module script tag not found'
assert 'main.bundle.js' in c and 'inline_assets.js' in c and 'type="module"' not in c, 'main.html patch failed'
assert 'vendor/%s' % bin_scripts[0] in c, 'main.html patch failed: bin chunk tag missing'
W('Build/main.html', c)

# ---- 7) inline_assets.js: 텍스트 자산 + fetch shim (GLB 는 bin_*.js 가 채움) ----
text_parts, n = [], 0
text_parts.append("  DATA['overview.html'] = " + js(R('Web/overview.html')) + ';'); n += 1
for i in range(1, 13):
    p = f'Web/Lesson{i:02d}/lesson.json'
    if os.path.exists(p):
        text_parts.append(f"  DATA['Lesson{i:02d}/lesson.json'] = " + js(R(p)) + ';'); n += 1
for f in sorted(glob.glob('Web/examples/*.xml')):
    text_parts.append('  DATA[' + js('examples/'+os.path.basename(f)) + '] = ' + js(R(f)) + ';'); n += 1
# scenes/*.json — 서비스 씬 체계(manifest + 씬 파일). 인라인하지 않으면
# file:// 에서 씬 드롭다운·hiddenTopics 가 통째로 사라진다.
for f in sorted(glob.glob('Web/scenes/*.json')):
    text_parts.append('  DATA[' + js('scenes/'+os.path.basename(f)) + '] = ' + js(R(f)) + ';'); n += 1
# Mesh/manifest.json — 개발자 모드 'GLB 모델' 스폰 메뉴의 자산 목록
if os.path.exists('Web/Mesh/manifest.json'):
    text_parts.append("  DATA['Mesh/manifest.json'] = " + js(R('Web/Mesh/manifest.json')) + ';'); n += 1

shim = r'''  function b64ToU8(b64){ var s=atob(b64), n=s.length, u=new Uint8Array(n); for(var i=0;i<n;i++)u[i]=s.charCodeAt(i); return u; }
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  function norm(input){ var url=(typeof input==='string')?input:(input&&input.url)||''; return String(url).split('?')[0].split('#')[0]; }
  function find(obj, url){ for(var k in obj){ if(!Object.prototype.hasOwnProperty.call(obj,k))continue; if(url===k||url.endsWith('/'+k))return k; } return null; }
  function mimeFor(key){ if(key.endsWith('.json'))return 'application/json'; if(key.endsWith('.xml'))return 'application/xml'; return 'text/html; charset=utf-8'; }
  window.fetch = function(input, init){
    var url = norm(input);
    var bk = find(BIN, url);
    if (bk !== null) return Promise.resolve(new Response(b64ToU8(BIN[bk]), { status:200, headers:{'Content-Type':'application/octet-stream'} }));
    var tk = find(DATA, url);
    if (tk !== null) return Promise.resolve(new Response(DATA[tk], { status:200, headers:{'Content-Type':mimeFor(tk)} }));
    if (origFetch) return origFetch(input, init);
    return Promise.reject(new Error('fetch unsupported (no inline match): '+url));
  };'''

out = ['// Auto-generated by build.sh -- text assets + fetch shim. GLB binaries are split into vendor/bin_*.js (loaded earlier).',
       '(function () {',
       '  if (window.__ARES_INLINE_INSTALLED__) return;',
       '  window.__ARES_INLINE_INSTALLED__ = true;',
       '  var DATA = {};',
       '  // BIN 은 bin_*.js 들이 이 스크립트 직전 defer 순서로 채워 둔 글로벌.',
       '  var BIN = window.__ARES_BIN__ || (window.__ARES_BIN__ = {});']
out += text_parts + [shim, '})();']
W('Build/vendor/inline_assets.js', '\n'.join(out) + '\n')
print('        inlined text entries: %d' % n)
assert n >= 13, 'inline text entries < 13'

# ---- 7.5) 랜딩(index.html)이 file:// 에서 fetch 로 읽는 GLB 에 fetch shim 을 제공한다.
#      컷씬 로켓(Rocket.min.glb) + 히어로 주위 유영 우주인(Astronaut.glb). 히어로 로봇
#      본체는 임베드(AlbiRobot.embed.js)라 별도. shim 이 설치되면 우주인 생략 가드도 풀린다. ----
# bin_AlbiRobot 포함 이유: http(s) 로 서비스되는 Build/ 랜딩은 file:// 임베드 분기 대신
# loader.load('AlbiRobot.min.glb')(평탄화 경로) 를 타는데, Build 루트에 실파일이 없어
# shim BIN 에 없으면 404 → '로봇을 불러오지 못했어요' 가 된다.
landing_bins = [s for s in bin_scripts if s.startswith('bin_Rocket') or s.startswith('bin_Astronaut') or s.startswith('bin_AlbiRobot')]
li = R('Build/index.html')
anchor = '<script src="vendor/meshopt_decoder.js"></script>'
if landing_bins and anchor in li and 'inline_assets.js' not in li:
    tags = anchor + ''.join('\n    <script src="vendor/%s"></script>' % s for s in landing_bins) \
           + '\n    <script src="vendor/inline_assets.js"></script>'
    li = li.replace(anchor, tags, 1)
    W('Build/index.html', li)
    print('        injected landing shim into index.html (%s + inline_assets)' % ', '.join(landing_bins))
else:
    print('        WARNING: 랜딩 shim 주입 실패 -- anchor/bin 확인 필요')

# 뷰어도 file:// 에서 GLB를 fetch shim 으로 받도록 bin 청크 + inline_assets 주입
vp = 'Build/viewer/index.html'
if os.path.exists(vp):
    v = R(vp)
    if 'inline_assets.js' not in v:
        viewer_tags = '\n'.join('  <script src="../vendor/%s"></script>' % s for s in bin_scripts)
        v = v.replace('<script src="vendor/three-bundle.min.js"></script>',
                      '<script src="vendor/three-bundle.min.js"></script>\n' + viewer_tags +
                      '\n  <script src="../vendor/inline_assets.js"></script>', 1)
        W(vp, v)
        print('        patched viewer/index.html -> bin chunks + inline_assets shim')
PY

echo ""
echo "=== Build complete ==="
echo "Output : Build/"
echo "Entry  : Build/index.html  (랜딩, 3D 로봇)  -> 탐사선 연결 -> main.html"
echo "Viewer : Build/viewer/index.html  (3D 뷰어)"
echo "Verify : Build/index.html 더블클릭 (file:// 오프라인 동작)"
