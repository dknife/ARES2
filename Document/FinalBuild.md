# 최종 오프라인 빌드 가이드

ARES 블록 코딩 웹앱(`Web/main.html`)을 인터넷 없이도 `file://`로 직접 열어 BLE까지 정상 동작하도록 패키징하는 절차입니다. 학생 노트북/태블릿 배포, USB 배포, 학교 내부망(인터넷 없는) 환경 등을 가정합니다.

## 1. 왜 별도 빌드가 필요한가

`Web/main.html`은 두 가지 외부 의존성 때문에 `file://`로는 동작하지 않습니다.

| 의존성 | 종류 | `file://`에서의 문제 |
|---|---|---|
| `Web/main.js` 와 그 의존 모듈 전부(시뮬레이션 `Sim_Parts/`·`Simulation/` 포함 수십 개) | ES module (`<script type="module">`) | `file://` URL은 `origin: null`이라 모듈 fetch가 same-origin 정책으로 차단됨 |
| Blockly 3개 스크립트 | `https://unpkg.com/...` CDN | 인터넷이 없으면 로드 불가 |
| 런타임 `fetch()` 자산 — GLB 메시, `scenes/*.json`(서비스 씬), `Mesh/manifest.json`, overview/lesson/examples | 동적 fetch | `file://`에서 fetch가 차단되어 메시·씬 목록이 통째로 사라짐 |

이들을 모두 해결해야 `file://`에서도 BLE를 포함해 전 기능이 작동합니다.

## 2. 산출물 (최종 폴더 구조)

프로젝트 루트의 `Build/` 폴더가 **완전한 자족(self-contained) 배포 단위**입니다. 이 폴더 안의 내용만 USB·압축파일·학교 서버에 올리면 그 자체로 ARES 앱이 동작합니다. 외부에 추가로 필요한 파일은 없습니다.

```
ARES_Project/
└── Build/                          ← 이 폴더만 배포하면 됨
    ├── index.html                  ← 랜딩 페이지(3D 로봇 손흔들기) — Web/index.html 기반
    ├── index.css
    ├── main.html                   ← 블록 에디터 — Web/main.html 패치본
    ├── main.bundle.js              ← esbuild로 묶은 단일 JS (main.js 진입점, 시뮬레이션 포함 의존 모듈 전부 통합)
    ├── styles.css                  ← main.html이 참조하는 스타일시트
    ├── mobile-preview.js           ← ?mobile=true 휴대폰 프레임 미리보기 (index/main.html이 클래식 스크립트로 로드)
    ├── dashboard.html              ← 대시보드 (iframe 자식, ES module 사용 안 함)
    ├── AlbiRobot.embed.js          ← 랜딩 히어로 로봇 GLB(base64) — file:// 오프라인 렌더용(현행)
    ├── ares_robot.embed.js         ← 개발자 스폰용 로봇 GLB(base64) — 레거시/보조
    ├── assets/                     ← UI 이미지(로고·아바타·툴박스 아이콘·nav 마스크) — main.html/styles.css 참조
    ├── fonts/                      ← 로컬 서브셋 폰트(fonts.css + woff2) — 오프라인 시각 일관성
    ├── vendor/
    │   ├── blockly_compressed.js
    │   ├── blocks_compressed.js
    │   ├── python_compressed.js
    │   ├── bin_<name>.js           ← GLB 1개당 base64 청크 1개 (시뮬 GLB + ares_robot + EnvAssets)
    │   ├── inline_assets.js        ← 텍스트 자산(overview/lesson/examples/scenes/Mesh manifest) + fetch shim
    │   ├── three-bundle.min.js     ← three.js (랜딩 로봇 + 시뮬레이션 렌더링)
    │   └── meshopt_decoder.js      ← meshopt 압축 GLB 디코더 (UMD, window.MeshoptDecoder) — 필수
    └── viewer/                     ← WebGL 3D 로봇 뷰어 (file:// 오프라인 동작, 선택)
        ├── index.html              ← `vendor/inline_assets.js` shim 주입 (AlbiStaticLow.glb fetch 가로채기)
        └── vendor/                 ← three-bundle.min.js + meshopt_decoder.js

> `viewer/`는 `WebGL/`(개인 개발 폴더)이 저장소에 포함되어 있을 때만 생성된다. CI나 외부 클론에서는 비어 있어도 정상이며, `Build/main.html` 본 기능은 영향받지 않는다.
```

> GLB 메시(`AlbiStaticLow`, `LampBox`, `LampGeneral`, `LampHand1~3`, `LaunchStation`,
> 로버 토픽용 `RoverParts/Rover{Body,Gun,Head,LED,OLED,Radar,Wheel}.glb` 7종,
> 개발자 스폰 메뉴용 `ares_robot.glb`, 환경 장식 `EnvAssets/*.glb`(우주인 등),
> **서비스 씬용 `AlbiRobot/AlbiRobot.min.glb`(알비 기본 모델)와
> `RocketAndLauncher/*.min.glb`(발사대_제작: Rocket·LaunchStand·RadarBody·RadaDish)**)는
> **GLB 1개당 청크 1개**로 `vendor/bin_<stem>.js` 에 base64 분리되어 있고, 각 청크는
> `window.__ARES_BIN__['Foo.glb'] = "<base64>"` 한 줄만 담는다. 모든 청크가 `defer` 순서로
> 먼저 실행되어 BIN 글로벌을 채우고, 그 다음 `vendor/inline_assets.js` 가 텍스트 DATA 등록
> (overview/lesson/examples + **`scenes/*.json` 서비스 씬 목록** + `Mesh/manifest.json`)과
> `window.fetch` shim 설치를 마친다. shim 은 키가 파일명이라 `Mesh/…` · `Mesh/RoverParts/…`
> · `Mesh/EnvAssets/…` · `Resources/…` 어떤 경로로 와도 `endsWith` 매칭으로 잡는다.
> `Build/Mesh/` 폴더는 존재하지 않는다.
>
> **분할 이유.** 통합 `inline_assets.js` 가 GitHub 절대 한도(100 MB) 를 넘기는 위험을
> 차단하기 위함이었다. 2026-07-09 텍스처 1024² 다운스케일 후 GLB 는 최대 ~0.6 MB,
> base64 총합도 ~4 MB 수준이라 한도와는 이제 무관하지만, 자산 추가/제거 시 diff 가
> 해당 청크 파일에만 국한되는(전체가 함께 변경되지 않는) 장점 때문에 분할 구조를 유지한다.
>
> **씬 JSON 인라인 이유.** `main.html` 의 씬 드롭다운은 `scenes/manifest.json` 을 fetch 해
> 서비스 씬("알비와 함께", "발사대_제작" 등)을 등록하고 `hiddenTopics` 로 레거시 토픽을
> 숨긴다. 이 fetch 는 실패해도 조용히 넘어가므로, 인라인하지 않으면 file:// 빌드에서
> **서비스 씬이 사라지고 숨겨 놓은 레거시 토픽이 다시 노출**된다.

> **3D 로봇 오프라인 동작.** 랜딩 페이지(`index.html`)의 손 흔드는 히어로 로봇은 임베드 스크립트
> (`AlbiRobot.embed.js`)의 base64 GLB를 `<script>` 태그로 정적 로드한 뒤
> `GLTFLoader.parse()`로 직접 파싱합니다. `viewer/`의 3D 뷰어는 일반 `fetch('Resources/AlbiStaticLow.glb')`
> 를 호출하지만, `vendor/inline_assets.js` 의 fetch shim 이 `BIN` 사전에 base64 로 임베드된
> GLB 를 바이너리 `Response` 로 즉시 반환합니다. 두 경로 모두 **인터넷 없이 `file://`로도**
> 렌더링됩니다(`file://`은 브라우저 CORS·`origin: null` 정책으로 로컬 GLB fetch가 막힘).
> 모든 GLB는 meshopt(`EXT_meshopt_compression`) 압축본이므로 `vendor/meshopt_decoder.js` 가
> three-bundle 직후 `<script>` 로 로드되어야 합니다 — 없으면 GLB 파싱이 실패합니다.
> (단, `index.html`의 Google Fonts 링크만 오프라인에서 시스템 폰트로 대체될 뿐
> 기능에는 영향이 없습니다.)

배포 시 그대로 폴더째 복사하고, 학생 PC에서 `Build/index.html`을 더블클릭하면 끝납니다.

`Build/`는 원본 코드에서 자동 생성되는 빌드 산출물이지만, **git 으로 추적/배포합니다(2026-07-13 정책 변경).** 학교 내부망처럼 git 이 전송 수단인 환경을 위해서입니다. 텍스처 1024² 다운스케일 이후 GLB base64 총합이 ~7 MB(전체 `Build/` ~19 MB) 수준이라 과거 폐기 사유였던 GitHub 100 MB 한도와 무관합니다. `build.sh` 는 시작 시 `rm -rf Build` 로 폴더를 갈아엎으므로, **원본(`Web/`)을 고친 뒤에는 재빌드하고 `Build/`를 다시 커밋**합니다. (GitHub Releases·USB 배포도 병행 가능.)

## 3. 사전 준비

```bash
# Node.js 18+ 설치 확인
node --version

# esbuild는 npx로 즉시 실행 가능 (설치 불필요)
npx esbuild --version
```

`curl` 또는 브라우저로 파일 다운로드 가능한 환경이면 됩니다. Windows 10/11에는 `curl`과 PowerShell이 기본 탑재되어 있습니다.

### 자동화 — `build.bat` (Windows)

수동 단계를 반복하지 않으려면 프로젝트 루트의 `build.bat`을 더블클릭하세요. 내부적으로 `build.ps1`을 호출해 §4의 다섯 단계를 모두 수행합니다.

```text
build.bat
 └── build.ps1   (PowerShell, 모든 빌드 로직)
       ├── 1) Build\ 폴더 초기화 + Build\vendor 생성
       ├── 2) npx esbuild로 main.bundle.js 번들 (main.js 진입, 시뮬레이션 포함 의존 모듈 전부)
       ├── 3) Invoke-WebRequest로 Blockly 3개 다운로드
       ├── 4) 정적 자산 복사 — dashboard.html, styles.css, index.css,
       │      mobile-preview.js, assets/(UI 이미지), fonts/(로컬 폰트),
       │      vendor/three-bundle.min.js,
       │      vendor/meshopt_decoder.js(meshopt GLB 디코더, 필수),
       │      ares_robot.embed.js(랜딩 GLB), WebGL/ 있으면 viewer/도 복사
       ├── 5) Web/index.html → Build/index.html (백링크 제거 + Mesh/ 경로 평탄화)
       ├── 6) Web/main.html → Build/main.html 두 곳 패치 + 검증
       │      (Blockly CDN → vendor/, ES module(?v= 캐시버스터 허용) →
       │       bin_*.js + inline_assets shim + bundle defer 체인)
       ├── (5.5) GLB 소스 열거(시뮬 + ares_robot + RoverParts/ + EnvAssets/
       │      + AlbiRobot/ + RocketAndLauncher/ 의 *.min.glb — 서비스 씬 메시)
       │      → bin 청크 파일 이름 목록 사전 결정
       └── 7) Build/vendor/bin_<stem>.js (GLB 1개당 청크 1개, base64)
              + Build/vendor/inline_assets.js (overview.html + 12 lesson.json
                + examples/*.xml + scenes/*.json + Mesh/manifest.json
                + fetch shim — BIN 은 bin_*.js 가 채움)
              + viewer/index.html 에 bin_*.js + inline_assets.js <script> 주입
```

`build.ps1`의 마지막 단계는 패치 결과를 `Select-String`으로 다시 검증하여 `main.bundle.js`가 포함되고 `type="module"`이 사라졌는지 확인합니다. 한 줄이라도 빠지면 `throw`로 실패합니다.

### 자동화 — `build.sh` (macOS / Linux)

macOS·Linux에서는 프로젝트 루트의 `./build.sh`를 실행하세요. `build.ps1`과 **동일한 `Build/` 산출물**을 생성합니다(bash 오케스트레이션 + `python3`로 텍스트/바이너리 인라인 처리). 요구사항: `node`(npx), `curl`, `python3`.

```bash
./build.sh        # Build/ 생성 → Build/index.html 더블클릭으로 확인
```

### 3D 자산의 file:// 지원 (시뮬레이션 포함)

`file://`는 로컬 GLB를 `fetch`할 수 없으므로(CORS, `origin: null`), 빌드는 GLB를 다음과 같이 인라인합니다.

- **랜딩 히어로 로봇**(`index.html`): `AlbiRobot.embed.js`(base64, Build 루트 — 원본은 `Web/Mesh/AlbiRobot/AlbiRobot.embed.js`, `AlbiRobot.min.glb` 에서 재생성)를 동적 로드 후 `GLTFLoader.parse()`. 빌드가 `Mesh/AlbiRobot/AlbiRobot.embed.js` 경로를 루트로 평탄화한다 — 빠뜨리면 `file://` 에서 "로봇을 불러오지 못했어요" 로 실패한다.
- **랜딩 유영 우주인**(`index.html`): 히어로 로봇 주위를 도는 우주인은 `Astronaut.glb` 를 `loader.load` 로 fetch 한다. 빌드가 `bin_Astronaut.js` + `inline_assets.js` shim 을 index.html 에 주입하고, 소스의 `file://` 생략 가드도 `window.__ARES_INLINE_INSTALLED__`(shim 설치 여부)로 완화해 `file://` 에서도 BIN 으로 로드된다. (shim 이 없는 순수 `file://` 열람에서는 여전히 조용히 생략.)
- **랜딩 컷씬 로켓**(`index.html`, "탐사선 연결" 클릭 후): `loader.load('Mesh/RocketAndLauncher/Rocket.min.glb')` 로 fetch 하므로, 빌드가 `index.html` 에 `vendor/bin_Rocket.min.js` + `vendor/inline_assets.js`(fetch shim)를 주입해 `file://` 에서 BIN 으로 제공한다.
- **랜딩 컷씬 배경(화성)·인라인 mask 아이콘**(`index.html`): 컷씬 배경은 `TextureLoader` 로 `planet_approach.webp` 를 읽고, 상단바 설정 아이콘은 인라인 `<style>` 의 CSS `mask-image` 다. 둘 다 이미지라 `file://`(origin null)에서 **CORS 로 차단**된다(GLB 와 같은 이유, 단 `<img>` fetch shim 도 못 잡음 — `TextureLoader`/mask 는 `fetch` 미경유). 그래서 빌드가 `Build/index.html` 안의 `planet_approach.webp` 경로와 인라인 `<style>` 의 `url('assets/…')` 를 **base64 data URI 로 치환**한다(data URI 는 same-origin·비오염). 빠뜨리면 컷씬에 화성 배경과 설정 아이콘이 안 보인다.
- **미션 시뮬레이션**(`main.html`) + **뷰어**(`viewer/`): GLB 전부(시뮬 + `ares_robot.glb` + `EnvAssets/*.glb` + 서비스 씬용 `AlbiRobot/*.min.glb`·`RocketAndLauncher/*.min.glb` — §2 참고)를 GLB 1개당 `vendor/bin_<stem>.js` 1개로 base64 인라인해 `window.__ARES_BIN__` 을 채우고, `vendor/inline_assets.js` 의 `window.fetch` shim이 이를 **바이너리 `Response`로 반환**한다. 키를 파일명(`Foo.glb`)으로 두어 `Mesh/...`·`Mesh/RoverParts/...`·`Mesh/EnvAssets/...`·`Mesh/AlbiRobot/...`·`Mesh/RocketAndLauncher/...`·`Resources/...` 어떤 경로의 fetch도 가로챈다. 따라서 `main.js`(번들) 코드는 일반 `fetch`를 그대로 쓰고, 빌드 산출물만 file://에서 동작한다.
- **서비스 씬 + 개발자 스폰 메뉴**: `scenes/*.json`(씬 manifest + 씬 파일)과 `Mesh/manifest.json` 은 텍스트로 `inline_assets.js` 의 DATA 에 인라인되어 같은 shim 이 JSON `Response` 로 반환한다.
- 모든 GLB는 meshopt 압축본(2026-07-09 텍스처 1024² 리사이즈 후에도 재압축으로 유지) — 두 경로 다 `vendor/meshopt_decoder.js` 가 먼저 로드되어 있어야 한다.

## 4. 빌드 절차

### 4.1 ES 모듈 번들링

`Web/main.js`를 진입점으로 의존 모듈 8개(state, elements, logger, bluetooth, blocklyconfig, commandexecutor, simulation, constants)를 단일 IIFE로 묶습니다.

```bash
cd Web
npx esbuild main.js \
  --bundle \
  --format=iife \
  --target=es2018 \
  --outfile=../Build/main.bundle.js
```

| 옵션 | 의미 |
|---|---|
| `--bundle` | import 체인을 모두 따라가 한 파일로 합침 |
| `--format=iife` | 즉시 실행 함수로 감싸 전역 오염 최소화. `type="module"` 없이 일반 `<script>` 로 로드 가능 |
| `--target=es2018` | 학생 환경의 비교적 구형 브라우저까지 호환 (선택, 더 좁히려면 `es2015`) |

원하면 `--minify` 옵션을 더해 용량을 줄일 수 있습니다.

### 4.2 Blockly 로컬 파일 다운로드

```bash
mkdir -p Build/vendor
cd Build/vendor

curl -L -o blockly_compressed.js  https://unpkg.com/blockly@11/blockly_compressed.js
curl -L -o blocks_compressed.js   https://unpkg.com/blockly@11/blocks_compressed.js
curl -L -o python_compressed.js   https://unpkg.com/blockly@11/python_compressed.js
```

다운로드한 3개 파일이 합쳐서 약 4–5MB입니다. 무결성 확인이 필요하면 `unpkg.com`의 `?meta` 엔드포인트로 SHA를 비교하세요.

### 4.3 `index.html` 생성 (랜딩 페이지)

`Web/index.html`(3D 로봇 손흔들기 + "탐사선 연결" 버튼)을 `Build/index.html`로 복사하면서 두 가지를 치환합니다.

1. `../index.html`(프로젝트 루트) 백링크 제거 — Build 단독 배포에서는 도착지가 없음.
2. 히어로 로봇 임베드 경로 평탄화 — `Mesh/AlbiRobot/AlbiRobot.embed.js` → `AlbiRobot.embed.js`(+ `Mesh/ares_robot.embed.js` → `ares_robot.embed.js`). Build에는 `Mesh/` 폴더가 없고 embed 스크립트만 루트에 둠. 또 컷씬 로켓용으로 `bin_Rocket.min.js` + `inline_assets.js` shim `<script>` 를 주입함.

### 4.4 `main.html` 패치 (블록 에디터)

`Web/main.html`을 `Build/main.html`로 복사한 뒤 다음 두 부분만 바꿉니다.

**Blockly CDN → 로컬 경로**

```html
<!-- 변경 전 -->
<script src="https://unpkg.com/blockly@11/blockly_compressed.js"></script>
<script src="https://unpkg.com/blockly@11/blocks_compressed.js"></script>
<script src="https://unpkg.com/blockly@11/python_compressed.js"></script>

<!-- 변경 후 -->
<script src="vendor/blockly_compressed.js"></script>
<script src="vendor/blocks_compressed.js"></script>
<script src="vendor/python_compressed.js"></script>
```

**ES module → bin 청크 + shim + 번들 스크립트 (`defer` 필수)**

```html
<!-- 변경 전 (src 뒤에 ?v=... 캐시버스터가 붙을 수 있음 — 빌드 스크립트가 허용) -->
<script type="module" src="main.js?v=20260709f"></script>

<!-- 변경 후 -->
<script src="vendor/bin_AlbiStaticLow.js" defer></script>
<!-- ... GLB 1개당 vendor/bin_<stem>.js 1개, 전체 목록은 §2 참고 ... -->
<script src="vendor/bin_Astronaut.js" defer></script>
<script src="vendor/inline_assets.js" defer></script>
<script src="main.bundle.js" defer></script>
```

`defer` 스크립트는 문서 순서대로 실행되므로 **bin 청크(BIN 채움) → inline_assets(fetch shim 설치) → main.bundle(앱 시작)** 순서가 보장됩니다.

`type="module"` 속성을 **반드시 제거**해야 합니다. 이게 `file://` 차단의 직접 원인입니다. 단 `type="module"`은 자동으로 deferred 실행이지만 일반 `<script>`는 그렇지 않으므로 **반드시 `defer` 속성을 추가**해야 합니다. 그렇지 않으면 `Web/elements.js`의 모듈 로드 시점 `document.getElementById(...)` 호출이 DOM 준비 전에 실행되어 모든 element 참조가 `null`이 되고, "아레스 탐사선 찾기" 같은 버튼 클릭 핸들러가 부착되지 못합니다.

### 4.5 정적 자산 복사 (dashboard.html · styles.css · index.css · mobile-preview.js · 3D 에셋)

`Web/dashboard.html`은 ES module을 사용하지 않으므로 별다른 수정 없이 그대로 `Build/`로 복사합니다. `main.html` 안에서 iframe으로 임베드되어 동작합니다. `Web/styles.css`는 `main.html`이, `Web/index.css`는 랜딩 페이지(`index.html`)가 직접 참조합니다. `Web/mobile-preview.js`는 `index.html`·`main.html` 양쪽이 `<head>` 최상단에서 **클래식 스크립트**로 로드(`?mobile=true` 휴대폰 프레임 미리보기)하기 때문에 ES module 번들에 포함되지 않으며, 반드시 `Build/` 루트에 별도 복사해야 합니다(없으면 콘솔에 404가 뜨고 모바일 미리보기가 동작하지 않습니다).

```bash
cp Web/dashboard.html     Build/dashboard.html
cp Web/styles.css         Build/styles.css
cp Web/index.css          Build/index.css
cp Web/mobile-preview.js  Build/mobile-preview.js
cp -R Web/assets          Build/assets    # UI 이미지(로고·아바타·툴박스 아이콘·nav 마스크)
cp -R Web/fonts           Build/fonts     # 로컬 서브셋 폰트(fonts.css + woff2)
```

`assets/` 는 main.html 의 `<img>` 와 styles.css 의 `url()`/`mask-image` 가 참조하는 UI 이미지이고, `fonts/` 는 세 HTML 이 모두 링크하는 로컬 서브셋 폰트입니다. 복사하지 않으면 오프라인 빌드에서 아이콘·이미지가 깨지고 폰트가 시스템 기본으로 대체됩니다.

**mask-image 는 복사만으로는 부족합니다.** CSS `mask-image`(하단 내비게이션·신호연결 버튼·설정 아이콘)는 브라우저가 **CORS 모드로 fetch 하는 리소스**라 `file://`(origin: null)에서는 파일이 있어도 차단되어 아이콘이 그려지지 않습니다(일반 `<img>` 는 무관). 그래서 build.ps1/build.sh 는 `Build/styles.css` 의 `url('assets/…')` 를 전부 **base64 data URI 로 인라인**합니다 — data URI 는 same-origin 이라 마스크에서도 동작합니다.

3D 렌더링 에셋 3종도 함께 복사합니다. `meshopt_decoder.js`는 모든 GLB가 meshopt 압축본이라 **필수**입니다.

```bash
cp Web/vendor/three-bundle.min.js  Build/vendor/three-bundle.min.js
cp Web/vendor/meshopt_decoder.js   Build/vendor/meshopt_decoder.js
cp Web/Mesh/AlbiRobot/AlbiRobot.embed.js  Build/AlbiRobot.embed.js   # 히어로 로봇(현행)
cp Web/Mesh/ares_robot.embed.js    Build/ares_robot.embed.js
```

`WebGL/`(개인 개발 폴더)이 존재하면 `Build/viewer/`로 `index.html` + `vendor/` 2종을 추가 복사합니다 (§2 참고, 없어도 본 기능 무관).

## 5. 검증

1. `Build/` 폴더를 USB 등으로 인터넷 없는 PC에 복사.
2. `index.html`을 Chrome 또는 Edge에서 더블클릭 (혹은 우클릭 → 연결 프로그램).
3. URL 표시줄이 `file:///.../Build/index.html` 로 시작하는지 확인.
4. 페이지가 정상 표시되고, 콘솔(F12)에 CORS 관련 오류가 없는지 확인.
5. **블루투스 연결** 버튼 클릭 → BT05/HM-10 모듈 선택 → 연결 성공 확인.
6. LED 블록 하나 실행하여 동작 확인.
7. "🚀 한꺼번에 실행" 블록으로 카운트다운 시퀀스 실행하여 BATCH도 정상 동작 확인.
8. 시뮬레이션 씬 드롭다운에 **서비스 씬("알비와 함께"·"발사대_제작" 등)이 보이고** 레거시 albi·rover 토픽은 숨겨져 있는지, 씬을 열어 3D 메시가 로드되는지 확인.
9. UI 아이콘·로고 이미지(assets/)와 폰트가 정상 표시되는지 확인.

## 6. 갱신 절차

원본 코드(`Web/`)를 수정한 뒤 오프라인 빌드를 갱신할 때:

```bash
# 한 줄로 재번들
cd Web && npx esbuild main.js --bundle --format=iife --target=es2018 \
  --outfile=../Build/main.bundle.js
```

`Web/main.html`·`Web/index.html`의 구조가 바뀌거나 GLB/레슨 자산이 추가·삭제되면 패치·인라인을 다시 해야 하므로 `build.bat`(또는 `./build.sh`)로 전체 재빌드하는 것이 안전합니다. Blockly 버전을 올렸을 때만 `vendor/*_compressed.js` 3개를 다시 받습니다.

자동화를 원하면 프로젝트 루트에 `package.json`을 두고 다음 스크립트를 추가하면 됩니다.

```json
{
  "scripts": {
    "build:offline": "esbuild Web/main.js --bundle --format=iife --target=es2018 --outfile=Build/main.bundle.js"
  }
}
```

그러면 `npm run build:offline` 한 줄로 재번들됩니다.

## 7. 제약 및 주의 사항

- **Web Bluetooth 자체는 file://에서 동작 가능**합니다 (Chromium 계열은 `file://`을 secure context로 인정). 단 모바일 Chrome은 `file://`에서 Web Bluetooth를 더 엄격히 제한하는 경우가 있어, 모바일 배포가 목적이면 HTTPS 호스팅이 더 안전합니다.
- `index.html`·`main.html`·`dashboard.html`은 Google Fonts CDN(`fonts.googleapis.com`)의 Inter Tight 와 **로컬 서브셋 폰트(`fonts/fonts.css` + woff2 — 빌드에 포함)** 를 함께 링크합니다. 인터넷이 없으면 CDN 폰트만 실패하고 로컬 폰트·시스템 fallback 으로 표시되어 **기능 동작에는 영향이 없습니다**.
- `dashboard.html`은 부모(iframe 컨텍스트) 가정 코드(`window.parent.postMessage`)가 있어 `main.html` 안에서 iframe으로 임베드된 상태로만 정상 동작합니다. 단독 실행은 의도하지 않은 사용입니다.
- 학생 PC에 Chrome/Edge가 없다면 이 가이드는 동작하지 않습니다. Web Bluetooth API를 지원하는 브라우저가 필수입니다.

## 8. 요약 — 명령 한 줄 정리

가장 빠른 방법은 **`build.bat` 더블클릭** (§3 자동화 참고). 아래는 수동으로 같은 절차를 따라갈 때 사용하는 명령 모음입니다.


```bash
# 0. Build 폴더 준비
mkdir -p Build/vendor

# 1. main.js + 의존 모듈 8개를 단일 IIFE 번들로
cd Web && npx esbuild main.js --bundle --format=iife --target=es2018 \
  --outfile=../Build/main.bundle.js && cd ..

# 2. Blockly 로컬 사본
cd Build/vendor
curl -LO https://unpkg.com/blockly@11/blockly_compressed.js
curl -LO https://unpkg.com/blockly@11/blocks_compressed.js
curl -LO https://unpkg.com/blockly@11/python_compressed.js
cd ../..

# 3. 랜딩 index.html: Web/index.html 복사 후 §4.3의 두 곳 치환 (백링크 제거 + Mesh/ 평탄화)
cp Web/index.html Build/index.html

# 4. 에디터 main.html: Web/main.html 복사 후 §4.4의 두 곳 패치
cp Web/main.html Build/main.html
# (type="module" → bin_*.js + inline_assets.js + main.bundle.js defer 체인,
#  Blockly src를 vendor/ 로 변경. 자동화는 build.ps1 / build.sh 가 수행)

# 5. 정적 자산 복사 (mobile-preview.js 는 클래식 스크립트라 번들에 안 포함됨 → 반드시 별도 복사)
#    styles.css 는 복사 후 assets/ url() 을 data URI 로 인라인해야 함(§4.5 mask-image CORS)
cp Web/dashboard.html             Build/dashboard.html
cp Web/styles.css                 Build/styles.css
cp Web/index.css                  Build/index.css
cp Web/mobile-preview.js          Build/mobile-preview.js
cp -R Web/assets                  Build/assets                       # UI 이미지 — 필수
cp -R Web/fonts                   Build/fonts                        # 로컬 폰트
cp Web/vendor/three-bundle.min.js Build/vendor/three-bundle.min.js
cp Web/vendor/meshopt_decoder.js  Build/vendor/meshopt_decoder.js   # meshopt GLB 디코더 — 필수
cp Web/Mesh/AlbiRobot/AlbiRobot.embed.js Build/AlbiRobot.embed.js  # 히어로 로봇(현행)
cp Web/Mesh/ares_robot.embed.js   Build/ares_robot.embed.js

# 6. 자산 인라인: GLB 1개당 Build/vendor/bin_<stem>.js (base64) + inline_assets.js
#    (overview/lesson/examples + scenes/*.json + Mesh/manifest.json + fetch shim)
#    (수동으로는 비현실적 — build.ps1 / build.sh 의 7단계가 자동 생성)

# 7. 검증: Build/index.html 더블클릭

# 8. 배포: Build 폴더 자체를 압축하거나 USB에 복사하면 끝.
#    (Build/ 외에 추가로 챙길 파일 없음)
```
