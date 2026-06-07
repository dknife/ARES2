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
cp Web/vendor/three-bundle.min.js Build/vendor/three-bundle.min.js
mkdir -p Build/Mesh
cp Web/Mesh/ares_robot.embed.js Build/Mesh/ares_robot.embed.js
[ -f Web/Mesh/ares_robot.glb ] && cp Web/Mesh/ares_robot.glb Build/Mesh/ares_robot.glb || true
# WebGL 뷰어(개인 폴더라 없을 수 있음) — 있으면 함께 배포
if [ -f WebGL/index.html ]; then
  echo "        + WebGL viewer -> Build/viewer/"
  mkdir -p Build/viewer/vendor
  cp WebGL/index.html                 Build/viewer/index.html
  cp WebGL/vendor/three-bundle.min.js Build/viewer/vendor/three-bundle.min.js
else
  echo "        (WebGL/ 없음 -- viewer 건너뜀)"
fi

# ---------- 5~7) 랜딩 생성 + main.html 패치 + inline_assets(텍스트+GLB 바이너리) ----------
echo "[5/7] index.html (landing)"
echo "[6/7] main.html (block editor patch)"
echo "[7/7] vendor/inline_assets.js (fetch shim, incl. binary GLB)"
python3 - <<'PY'
import os, re, json, base64, glob, sys

def R(p):  return open(p, encoding='utf-8').read()
def Rb(p): return open(p, 'rb').read()
def W(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8', newline='').write(s)
def js(s):  # JS 문자열 리터럴로 인코딩 + </ 무력화
    return json.dumps(s, ensure_ascii=False).replace('</', '<\\/')

# ---- 5) 랜딩: Web/index.html → Build/index.html (../index.html 백링크 제거) ----
landing = R('Web/index.html')
landing = re.sub(r'\s*<a href="\.\./index\.html"[^>]*>[^<]*</a>\s*', '', landing)
W('Build/index.html', landing)

# ---- 6) 블록 에디터: main.html 패치 (Blockly CDN→vendor, ES모듈→shim+번들) ----
c = R('Web/main.html')
c = re.sub(r'https://unpkg\.com/blockly@11/(\w+_compressed\.js)', r'vendor/\1', c)
c = c.replace('<script type="module" src="main.js"></script>',
              '<script src="vendor/inline_assets.js" defer></script><script src="main.bundle.js" defer></script>')
W('Build/main.html', c)
assert 'main.bundle.js' in c and 'inline_assets.js' in c and 'type="module"' not in c, 'main.html patch failed'

# ---- 7) inline_assets.js: 텍스트(overview/lesson/examples) + 바이너리(GLB) ----
text_parts, bin_parts, n = [], [], 0
text_parts.append("  DATA['overview.html'] = " + js(R('Web/overview.html')) + ';'); n += 1
for i in range(1, 13):
    p = f'Web/Lesson{i:02d}/lesson.json'
    if os.path.exists(p):
        text_parts.append(f"  DATA['Lesson{i:02d}/lesson.json'] = " + js(R(p)) + ';'); n += 1
for f in sorted(glob.glob('Web/examples/*.xml')):
    text_parts.append('  DATA[' + js('examples/'+os.path.basename(f)) + '] = ' + js(R(f)) + ';'); n += 1

# 시뮬레이션 모델: file:// 에서 fetch 불가 → base64 로 인라인하여 shim 이 바이너리로 제공
# 파일명만 키로 사용 → main.html(Mesh/...)과 viewer(Resources/...) 양쪽 fetch 모두 매칭
GLB = 'Web/Mesh/AlbiStaticLow.glb'
if os.path.exists(GLB):
    b64 = base64.b64encode(Rb(GLB)).decode()
    bin_parts.append("  BIN['AlbiStaticLow.glb'] = " + json.dumps(b64) + ';')
    print('        inlined GLB: AlbiStaticLow.glb (%.1f MB base64)' % (len(b64)/1048576))
else:
    print('        WARNING: %s 없음 — 시뮬레이션 GLB 미인라인' % GLB)

shim = r'''  function b64ToU8(b64){ var s=atob(b64), n=s.length, u=new Uint8Array(n); for(var i=0;i<n;i++)u[i]=s.charCodeAt(i); return u; }
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  function norm(input){ var url=(typeof input==='string')?input:(input&&input.url)||''; return String(url).split('?')[0].split('#')[0]; }
  function find(obj, url){ for(var k in obj){ if(!Object.prototype.hasOwnProperty.call(obj,k))continue; if(url===k||url.endsWith('/'+k)||url.endsWith(k))return k; } return null; }
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

out = ['// Auto-generated by build.sh -- inlined fetch() targets for file:// support.',
       '(function () {',
       '  if (window.__ARES_INLINE_INSTALLED__) return;',
       '  window.__ARES_INLINE_INSTALLED__ = true;',
       '  var DATA = {};',
       '  var BIN = {};']
out += text_parts + bin_parts + [shim, '})();']
W('Build/vendor/inline_assets.js', '\n'.join(out) + '\n')
print('        inlined text entries: %d' % n)
assert n >= 13, 'inline text entries < 13'

# 뷰어도 file:// 에서 GLB를 fetch shim 으로 받도록 inline_assets 주입
vp = 'Build/viewer/index.html'
if os.path.exists(vp):
    v = R(vp)
    if 'inline_assets.js' not in v:
        v = v.replace('<script src="vendor/three-bundle.min.js"></script>',
                      '<script src="vendor/three-bundle.min.js"></script>\n<script src="../vendor/inline_assets.js"></script>', 1)
        W(vp, v)
        print('        patched viewer/index.html -> inline_assets shim')
PY

echo ""
echo "=== Build complete ==="
echo "Output : Build/"
echo "Entry  : Build/index.html  (랜딩, 3D 로봇)  -> 탐사선 연결 -> main.html"
echo "Viewer : Build/viewer/index.html  (3D 뷰어)"
echo "Verify : Build/index.html 더블클릭 (file:// 오프라인 동작)"
