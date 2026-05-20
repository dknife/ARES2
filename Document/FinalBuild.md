# 최종 오프라인 빌드 가이드

ARES 블록 코딩 웹앱(`Web/main.html`)을 인터넷 없이도 `file://`로 직접 열어 BLE까지 정상 동작하도록 패키징하는 절차입니다. 학생 노트북/태블릿 배포, USB 배포, 학교 내부망(인터넷 없는) 환경 등을 가정합니다.

## 1. 왜 별도 빌드가 필요한가

`Web/main.html`은 두 가지 외부 의존성 때문에 `file://`로는 동작하지 않습니다.

| 의존성 | 종류 | `file://`에서의 문제 |
|---|---|---|
| `Web/main.js` 와 그 의존 모듈 7개 | ES module (`<script type="module">`) | `file://` URL은 `origin: null`이라 모듈 fetch가 same-origin 정책으로 차단됨 |
| Blockly 3개 스크립트 | `https://unpkg.com/...` CDN | 인터넷이 없으면 로드 불가 |

두 가지를 모두 해결해야 `file://`에서도 BLE를 포함해 전 기능이 작동합니다.

## 2. 산출물 (최종 폴더 구조 예시)

```
ARES_Offline/
├── index.html              ← main.html을 수정한 진입점
├── main.bundle.js          ← esbuild로 묶은 단일 JS (8개 모듈 통합)
├── vendor/
│   ├── blockly_compressed.js
│   ├── blocks_compressed.js
│   └── python_compressed.js
└── dashboard.html          ← (현재 그대로, ES module 사용 안 함)
```

이 폴더를 통째로 USB나 학생 PC에 복사한 뒤 `index.html`을 더블클릭하면 됩니다.

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
  --outfile=../ARES_Offline/main.bundle.js
```

| 옵션 | 의미 |
|---|---|
| `--bundle` | import 체인을 모두 따라가 한 파일로 합침 |
| `--format=iife` | 즉시 실행 함수로 감싸 전역 오염 최소화. `type="module"` 없이 일반 `<script>` 로 로드 가능 |
| `--target=es2018` | 학생 환경의 비교적 구형 브라우저까지 호환 (선택, 더 좁히려면 `es2015`) |

원하면 `--minify` 옵션을 더해 용량을 줄일 수 있습니다.

### 4.2 Blockly 로컬 파일 다운로드

```bash
mkdir -p ARES_Offline/vendor
cd ARES_Offline/vendor

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

## 5. 검증

1. `ARES_Offline/` 폴더를 USB 등으로 인터넷 없는 PC에 복사.
2. `index.html`을 Chrome 또는 Edge에서 더블클릭 (혹은 우클릭 → 연결 프로그램).
3. URL 표시줄이 `file:///.../ARES_Offline/index.html` 로 시작하는지 확인.
4. 페이지가 정상 표시되고, 콘솔(F12)에 CORS 관련 오류가 없는지 확인.
5. **블루투스 연결** 버튼 클릭 → BT05/HM-10 모듈 선택 → 연결 성공 확인.
6. LED 블록 하나 실행하여 동작 확인.
7. "🚀 한꺼번에 실행" 블록으로 카운트다운 시퀀스 실행하여 BATCH도 정상 동작 확인.

## 6. 갱신 절차

원본 코드(`Web/`)를 수정한 뒤 오프라인 빌드를 갱신할 때:

```bash
# 한 줄로 재번들
cd Web && npx esbuild main.js --bundle --format=iife --target=es2018 \
  --outfile=../ARES_Offline/main.bundle.js
```

`Web/main.html`의 구조가 바뀌면 `ARES_Offline/index.html`도 같은 변경을 다시 반영해야 합니다. Blockly 버전을 올렸을 때만 `vendor/*.js` 3개를 다시 받습니다.

자동화를 원하면 프로젝트 루트에 `package.json`을 두고 다음 스크립트를 추가하면 됩니다.

```json
{
  "scripts": {
    "build:offline": "esbuild Web/main.js --bundle --format=iife --target=es2018 --outfile=ARES_Offline/main.bundle.js"
  }
}
```

그러면 `npm run build:offline` 한 줄로 재번들됩니다.

## 7. 제약 및 주의 사항

- **Web Bluetooth 자체는 file://에서 동작 가능**합니다 (Chromium 계열은 `file://`을 secure context로 인정). 단 모바일 Chrome은 `file://`에서 Web Bluetooth를 더 엄격히 제한하는 경우가 있어, 모바일 배포가 목적이면 HTTPS 호스팅이 더 안전합니다.
- 빌드 산출물에 외부 폰트(Google Fonts 등)나 이미지 CDN을 사용한다면 그것도 함께 로컬화해야 완전 오프라인입니다. 현재 `main.html`은 외부 폰트를 추가 로드하지 않으므로 본 가이드 범위에서는 무관합니다.
- `dashboard.html`은 부모(iframe 컨텍스트) 가정 코드(`window.parent.postMessage`)가 있어 `index.html` 안에서 iframe으로 임베드된 상태로만 정상 동작합니다. 단독 실행은 의도하지 않은 사용입니다.
- 학생 PC에 Chrome/Edge가 없다면 이 가이드는 동작하지 않습니다. Web Bluetooth API를 지원하는 브라우저가 필수입니다.

## 8. 요약 — 명령 한 줄 정리

```bash
# 1. 번들
cd Web && npx esbuild main.js --bundle --format=iife --target=es2018 --outfile=../ARES_Offline/main.bundle.js && cd ..

# 2. Blockly 로컬 사본
mkdir -p ARES_Offline/vendor && cd ARES_Offline/vendor
curl -LO https://unpkg.com/blockly@11/blockly_compressed.js
curl -LO https://unpkg.com/blockly@11/blocks_compressed.js
curl -LO https://unpkg.com/blockly@11/python_compressed.js
cd ../..

# 3. index.html은 main.html을 복사한 뒤 두 곳만 수정 (위 §4.3 참고)
cp Web/main.html ARES_Offline/index.html
# 그리고 에디터로 두 군데 수정 (자동화하려면 sed 활용)

# 4. 검증: ARES_Offline/index.html 더블클릭
```
