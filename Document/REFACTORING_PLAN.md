# REFACTORING_PLAN.md — ARES2 코드 분할 구상안

> 작성일: 2026-06-25
> 목적: 지나치게 큰 함수·파일로 구성된 소스를 기능 분석을 통해 체계적으로 분할하기 위한 설계 문서.
> 성격: **동작 보존(behavior-preserving) 리팩터링** 계획. 기능 변경·버그 수정은 포함하지 않는다.

---

## 1. 진단 — 무엇이 "큰가"

정량 측정으로 드러난 실제 비대 지점 (vendor 번들·KSWeb은 별도 산출물로 제외):

| 파일 | 줄수 | 핵심 문제 | 가장 큰 단위 |
|------|------|-----------|--------------|
| `Web/simulation.js` | **2333** | 거대 클로저 2개에 10개 서브시스템이 엉킴 | `buildSim()` **1412줄**, `setupSimulation()` **728줄** |
| `Web/main.js` | 1051 | 한 함수가 미션/저장/예제/AI/대시보드를 전부 처리 | `initializeMissionListeners()` **268줄** |
| `Web/dashboard.html` | 828 | HTML 안에 CSS 362 + JS 385 인라인 | `<style>` 362, `<script>` 385 |
| `Pico/process_data.py` | 653 | 거대 if/elif 디스패처 + 30개 핸들러 한 클래스 | `process()` **170줄** |
| `Web/commandexecutor.js` | 495 | 생성·평가·실행 로직이 한 객체에 혼재 | `generateCommand()` 104, `handleLogicBlock()` 102 |
| `Web/ai_helper.js` | 434 | 의도 매칭 한 함수가 모든 도메인 처리 | `matchAction()` **149줄** |
| `Web/blocklyconfig.js` | 416 | 21개 블록 정의가 한 배열 | 데이터 배열 385 |

> **분할 우선순위 낮음**: `hardware.py`·`system_config.py`·`main.py`(Pico)·`bluetooth.js`는 줄수는 있어도 책임이 응집돼 있다. 무리한 분할은 오히려 손해.

핵심은 **줄수가 아니라 "한 단위가 짊어진 책임 수"**. 문제는 아래 세 가지 형태로 나뉜다.

---

## 2. 문제 유형과 대응 패턴

### 유형 A — "거대 클로저에 갇힌 서브시스템" (`simulation.js`)

`buildSim()` 하나가 씬셋업·모델로딩·LED·이동/충돌·총·로켓·신호등·음파·OLED·렌더루프를 전부 품고,
상태(약 50개 변수)가 전부 클로저 스코프에 묶여 외부에서 보이지 않는다. 함수만 떼면 상태 공유가 깨진다.

**대응 — 공유 컨텍스트(ctx) + 서브시스템 모듈화**

```
buildSim()  →  SimContext(scene, camera, renderer, worldGroup, refs…)
               + 각 서브시스템이 ctx를 받아 동작
```

| 모듈 | 추출 대상 | 줄수(approx) |
|------|-----------|------|
| `sim/context.js` | 씬·카메라·렌더러·조명·그리드·공유 상태 컨테이너 | ~180 |
| `sim/assets.js` | GLTF 로딩, 모델 마무리, 부품 배치 | ~500 |
| `sim/leds.js` | makeLed/applyLed/setEye/setChest… | ~250 |
| `sim/movement.js` | 서보·레이더·충돌·거리센서 | ~220 |
| `sim/gun.js` | 머즐 플래시·연기 | ~190 |
| `sim/rocket.js` | 발사 애니메이션·연기·카메라 추적 | ~350 |
| `sim/traffic.js` | 신호등 슬롯·램프·가위바위보 손 | ~180 |
| `sim/waves.js` | 부저 음파 링 | ~180 |
| `sim/oled.js` | OLED 캔버스 텍스트/아이콘 | ~130 |
| `sim/render.js` | 프레임 갱신 루프 | ~110 |
| `sim/audio.js` | beep·로켓·총 사운드 합성 | ~180 |
| `sim/dispatch.js` | `applyTopicEffect` / `simSink` 명령 라우팅 | ~180 |
| `sim/topics.js` | `TOPICS`·`OLED_ICONS`·팔레트 상수 | ~110 |
| `simulation.js` | `setupSimulation` UI 제어만 남김 (얇은 오케스트레이터) | ~250 |

> 가장 어렵고 가장 가치 큰 작업. 핵심 결정은 **"ctx를 클래스로 vs 평범한 객체 + 함수로"**.
> 기존 코드가 `export function` 스타일이라 **ctx 객체 + 순수 함수 모듈** 쪽이 변경 충격이 작다.

#### 내부 결합(분할 시 ctx로 끌어올려야 할 공유 상태)
- 이동 ↔ 충돌: `servoOn/Off` 확인 후 이동, `nearestBoxDist` 호출
- 로켓 ↔ 카메라: `savedCamPos`, `rocketCentroidWorld`를 렌더 루프에서 갱신
- 총 ↔ 연기: `gunMesh` 확인 후 `gunSmoke` 보장
- LED 배열: `roverLeds`, `launchLeds`, `eyeL/R`, `chestLed` 다수 함수가 참조
- 신호등: `trafficSlotState`, `trafficBox`, `trafficSlots`를 placeLamps/placeHands/setSlotOn 공유
- `buildSim`이 반환하는 ~50개 getter/setter를 `setupSimulation`이 사용 → ctx 인터페이스로 명시화

### 유형 B — "거대 디스패처 + 핸들러 더미" (`process_data.py`, `commandexecutor.generateCommand`)

하나의 if/elif(또는 switch)가 50개 명령을 분기하고, 핸들러가 같은 클래스/객체 안에 다 있다.

**대응 — 도메인별 핸들러 모듈 + 디스패치 위임**

```
# process_data.py 는 라우팅만:  CommandProcessor.process() → 도메인 핸들러 위임
Pico/handlers/
  movement.py   # 서보 timed/연속 (6 cmd, ~40줄)
  dcmotor.py    # DC 모터 (6 cmd, ~75줄)
  leds.py       # LED on/off/pattern (4 cmd, ~54줄)
  display.py    # OLED msg/rect/xy/icon (5 cmd, ~100줄)  ← 가장 큼
  system.py     # PING/STATUS/SYS_SET/SET_PIN/SET_MODULE/BATCH (~120줄)
  buzzer.py / sensors.py / gun.py
```

각 핸들러는 `from hardware import robot`·`from system_config import sys_config`만 임포트.
디스패처를 **prefix→핸들러 dict**로 바꾸면 170줄짜리 `process()`가 ~30줄로 줄어든다.
JS `generateCommand()`(104줄)도 동일하게 `commands/`로 블록타입→생성기 매핑.

> ⚠️ **MicroPython RAM 제약**: 파일 분할 시 import 오버헤드가 늘어난다.
> Pico에서는 **도메인 5~6개 수준**으로만 나누고 과분할은 피한다.

### 유형 C — "한 데이터 덩어리 / 한 함수가 모든 카테고리" (`blocklyconfig.js`, `ai_helper.matchAction`)

이미 주석으로 카테고리가 갈려 있어 **물리적 파일 분리만** 하면 된다.

```
Web/blocks/
  servo.js  dcmotor.js  led.js  display.js  buzzer.js  gun.js  sensor.js  time.js  math.js  batch.js
  index.js   # 카테고리 합쳐 BlocklyConfig.blocks 구성
ai_helper.js → match/movement.js, match/sensor.js, match/display.js, match/sound.js …
```

### 유형 D — "인라인 자산" (`dashboard.html`, `main.html`)

**대응 — CSS/JS 외부 파일로 추출** (가장 쉽고 위험 낮음, 즉시 효과)

```
dashboard.html (187줄, 순수 마크업) + dashboard.css (362) + dashboard.js (385)
```

---

## 3. 권장 목표 디렉터리 구조 (Web)

```
Web/
  simulation.js          # 얇은 진입점 (setup/open/close)
  sim/                   # 유형 A 서브시스템 14개
  blocks/                # 유형 C 블록 정의 (카테고리별)
  commands/              # generateCommand 분할
  ai/                    # ai_helper 파이프라인 (preprocess/match/serialize)
  ui/                    # main.js에서 분리: router.js, blockly-init.js,
                         #   mission-controls.js, ai-panel.js, dashboard-bridge.js
  dashboard.html / dashboard.css / dashboard.js
  (bluetooth.js, state.js, constants.js, logger.js — 유지)
```

---

## 4. 우선순위 로드맵 (위험 낮음 → 가치 높음 순)

| 단계 | 작업 | 위험 | 효과 | 비고 |
|------|------|------|------|------|
| **0** | 정적 테스트 기준선 확보 (브라우저 로드/콘솔 무에러, 펌웨어 부팅) | — | 리팩터링 안전망 | 분할 전 필수 |
| **1** | dashboard.html / main.html 인라인 CSS·JS 추출 (유형 D) | 낮음 | 즉시 828→187 | 동작 1:1 이전 |
| **2** | blocklyconfig.js 카테고리 파일 분리 (유형 C) | 낮음 | 데이터 정리, 블록 추가 쉬워짐 | 순수 데이터 |
| **3** | process_data.py 도메인 핸들러 분리 + dict 디스패치 (유형 B) | 중 | 펌웨어 가독성·확장성 ↑ | RAM 영향 점검 |
| **4** | main.js → router/blockly-init/mission-controls/ai-panel 분리 | 중 | 1051→~400 | 공유 상태 명시적 export |
| **5** | commandexecutor.js·ai_helper.js 파이프라인 분할 (유형 B/C) | 중 | 실행·생성·평가 분리 | |
| **6** | **simulation.js → sim/ 서브시스템화 (유형 A)** | 높음 | 2333줄 해체, 최대 가치 | ctx 설계가 관건, 마지막에 |

**설계 원칙**: 쉽고 위험 낮은 것부터(1→2) 패턴을 검증하고, 가장 어려운 simulation.js(6)는 마지막에.
각 단계는 동작 보존 리팩터링으로, **한 번에 한 모듈씩 이동 후 검증**.

---

## 5. 횡단 주의점 (분할이 깨뜨리기 쉬운 결합)

- **블록 타입 이름 3중 결합**: `blocklyconfig.js`의 `type` ↔ `commandexecutor.generateCommand()`의 case ↔ `ai_helper.KNOWN_TYPES`.
  분할해도 이 이름들은 한곳(상수)으로 모아 **단일 출처(SSOT)** 화하면 동기화 버그를 줄인다.
- **`state.js` 전역 의존**: 거의 모든 Web 모듈이 `state`를 직접 변이. 분할 시 누가 무엇을 쓰는지 드러나므로 이 기회에 접근 경로 정리.
- **firmware ↔ web 문자열 프로토콜**: 컴파일 검증이 안 됨. `Document/API_DOCUMENTATION.md`가 유일 계약 → 변경 시 동시 갱신.
- **알려진 버그 동거**: CLAUDE.md에 적힌 기존 버그(wheel turn 로직, SYS_SET 고아 코드 등)는 **분할과 분리**해서 다룬다.
  리팩터링 커밋에 버그 수정을 섞으면 회귀 추적이 어려워진다.

---

## 6. 진행 메모

- 이 저장소는 현재 `git init`이 안 된 상태. 작업 전에 git 저장소로 만들어 두면 단계별 롤백이 쉬움.
- 권장 시작점: **단계 1(dashboard 인라인 추출)** 파일럿 → 패턴 검증 후 점진 확대.
- 각 단계 완료 시 이 문서의 로드맵 표에 상태(✅/진행 중)를 갱신할 것.
