# 최종 오프라인 빌드 가이드

ARES 블록 코딩 웹앱(`Web/main.html`)을 인터넷 없이도 `file://`로 직접 열어 BLE까지 정상 동작하도록 패키징하는 절차입니다. 학생 노트북/태블릿 배포, USB 배포, 학교 내부망(인터넷 없는) 환경 등을 가정합니다.

## 1. 왜 별도 빌드가 필요한가

`Web/main.html`은 두 가지 외부 의존성 때문에 `file://`로는 동작하지 않습니다.

| 의존성 | 종류 | `file://`에서의 문제 |
|---|---|---|
| `Web/main.js` 와 그 의존 모듈 7개 | ES module (`<script type="module">`) | `file://` URL은 `origin: null`이라 모듈 fetch가 same-origin 정책으로 차단됨 |
| Blockly 3개 스크립트 | `https://unpkg.com/...` CDN | 인터넷이 없으면 로드 불가 |

두 가지를 모두 해결해야 `file://`에서도 BLE를 포함해 전 기능이 작동합니다.

## 2. 산출물 (최종 폴더 구조)

프로젝트 루트의 `Build/` 폴더가 **완전한 자족(self-contained) 배포 단위**입니다. 이 폴더 안의 내용만 USB·압축파일·학교 서버에 올리면 그 자체로 ARES 앱이 동작합니다. 외부에 추가로 필요한 파일은 없습니다.

```
ARES_Project/
└── Build/                          ← 이 폴더만 배포하면 됨
    ├── index.html                  ← main.html을 수정한 진입점
    ├── main.bundle.js              ← esbuild로 묶은 단일 JS (8개 모듈 통합)
    ├── styles.css                  ← main.html이 참조하는 스타일시트
    ├── dashboard.html              ← 대시보드 (iframe 자식, ES module 사용 안 함)
    └── vendor/
        ├── blockly_compressed.js
        ├── blocks_compressed.js
        └── python_compressed.js
```

배포 시 그대로 폴더째 복사하고, 학생 PC에서 `Build/index.html`을 더블클릭하면 끝납니다.

`Build/`는 원본 코드에서 자동 생성되는 빌드 산출물이므로, 일반적으로 `.gitignore`에 추가해 git에는 추적하지 않습니다:

```
# 프로젝트 루트의 .gitignore에 추가
Build/
```

대신 GitHub Releases 또는 별도 배포 채널로 압축본을 올립니다. (예외적으로 학교 내부망 배포처럼 git이 전송 수단인 경우에만 `Build/`를 추적합니다.)

## 3. 사전 준비

```bash
# Node.js 18+ 설치 확인
node --version

# esbuild는 npx로 즉시 실행 가능 (설치 불필요)
npx esbuild --version
```

`curl` 또는 브라우저로 파일 다운로드 가능한 환경이면 됩니다.

## 4. 빌드 절차

### 4.1 ES 모듈 번들링

`Web/main.js`를 진입점으로 8개 모듈을 단일 IIFE로 묶습니다.

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

### 4.3 `index.html` 생성 (main.html 수정본)

`Web/main.html`을 복사한 뒤 다음 두 부분만 바꿉니다.

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

**ES module → 번들 스크립트**

```html
<!-- 변경 전 -->
<script type="module" src="main.js"></script>

<!-- 변경 후 -->
<script src="main.bundle.js"></script>
```

`type="module"` 속성을 **반드시 제거**해야 합니다. 이게 `file://` 차단의 직접 원인입니다.

### 4.4 `dashboard.html`과 `styles.css` 복사

`Web/dashboard.html`은 ES module을 사용하지 않으므로 별다른 수정 없이 그대로 `Build/`로 복사합니다. `index.html` 안에서 iframe으로 임베드되어 동작합니다. `Web/styles.css`는 `main.html`이 직접 참조하는 스타일시트라 함께 복사해야 합니다.

```bash
cp Web/dashboard.html Build/dashboard.html
cp Web/styles.css     Build/styles.css
```

## 5. 검증

1. `Build/` 폴더를 USB 등으로 인터넷 없는 PC에 복사.
2. `index.html`을 Chrome 또는 Edge에서 더블클릭 (혹은 우클릭 → 연결 프로그램).
3. URL 표시줄이 `file:///.../Build/index.html` 로 시작하는지 확인.
4. 페이지가 정상 표시되고, 콘솔(F12)에 CORS 관련 오류가 없는지 확인.
5. **블루투스 연결** 버튼 클릭 → BT05/HM-10 모듈 선택 → 연결 성공 확인.
6. LED 블록 하나 실행하여 동작 확인.
7. "🚀 한꺼번에 실행" 블록으로 카운트다운 시퀀스 실행하여 BATCH도 정상 동작 확인.

## 6. 갱신 절차

원본 코드(`Web/`)를 수정한 뒤 오프라인 빌드를 갱신할 때:

```bash
# 한 줄로 재번들
cd Web && npx esbuild main.js --bundle --format=iife --target=es2018 \
  --outfile=../Build/main.bundle.js
```

`Web/main.html`의 구조가 바뀌면 `Build/index.html`도 같은 변경을 다시 반영해야 합니다. Blockly 버전을 올렸을 때만 `vendor/*.js` 3개를 다시 받습니다.

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
- `index.html`(원본 `main.html`)은 Google Fonts CDN(`fonts.googleapis.com`)에서 Inter Tight 폰트를 불러옵니다. 인터넷이 없는 환경에서는 폰트 로드만 실패하고 시스템 fallback으로 표시되어 **기능 동작에는 영향이 없습니다**. 완전 오프라인 환경에서 시각적 일관성까지 보장하려면 폰트 파일을 별도로 받아 로컬 `@font-face`로 교체하세요.
- `dashboard.html`은 부모(iframe 컨텍스트) 가정 코드(`window.parent.postMessage`)가 있어 `index.html` 안에서 iframe으로 임베드된 상태로만 정상 동작합니다. 단독 실행은 의도하지 않은 사용입니다.
- 학생 PC에 Chrome/Edge가 없다면 이 가이드는 동작하지 않습니다. Web Bluetooth API를 지원하는 브라우저가 필수입니다.

## 8. 요약 — 명령 한 줄 정리

```bash
# 0. Build 폴더 준비
mkdir -p Build/vendor

# 1. 8개 모듈을 단일 IIFE 번들로
cd Web && npx esbuild main.js --bundle --format=iife --target=es2018 \
  --outfile=../Build/main.bundle.js && cd ..

# 2. Blockly 로컬 사본
cd Build/vendor
curl -LO https://unpkg.com/blockly@11/blockly_compressed.js
curl -LO https://unpkg.com/blockly@11/blocks_compressed.js
curl -LO https://unpkg.com/blockly@11/python_compressed.js
cd ../..

# 3. index.html은 main.html을 복사한 뒤 §4.3의 두 곳만 수정
cp Web/main.html Build/index.html
# (에디터로 type="module" 제거 + Blockly src를 vendor/ 로 변경. 자동화하려면 sed 활용)

# 4. dashboard.html과 styles.css는 그대로 복사
cp Web/dashboard.html Build/dashboard.html
cp Web/styles.css     Build/styles.css

# 5. 검증: Build/index.html 더블클릭

# 6. 배포: Build 폴더 자체를 압축하거나 USB에 복사하면 끝.
#    (Build/ 외에 추가로 챙길 파일 없음)
```
