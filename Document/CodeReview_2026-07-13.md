# 전체 코드 검토 결과 및 수정 TODO (2026-07-13)

4개 도메인(웹 코어 / 시뮬레이터 / Pico 펌웨어 / 빌드·정합성)을 병렬 검토하고,
상위 건은 실코드로 재검증한 결과다. 즉시 수정한 항목과 **남은 수정 대상**을 기록한다.
남은 항목을 수정할 때는 이 문서의 해당 절을 갱신(완료 표시)할 것.

## ✅ 수정 완료 (2026-07-13)

| 커밋 | 내용 |
|---|---|
| `1857ccf` | 시뮬 비상정지 무력화 3건(hasServo 영구 false·linger 데드락·주제 전환 미차단) + LED NaN + Build/ HTTP 히어로 404 + shim 무경계 매칭·.DS_Store |
| `84ed359` | 기기 자가진단 페이지 `Web/check.html`(ES5 전용) — 저사양 태블릿 문의 대응, 최소 사양 Chrome 80+ 확정 |
| `9fc8f54` | 시뮬 진행 중 모드 전환 시 비상정지 (`close()` 경로) |

---

## 🔴 HIGH — 펌웨어 (기기 재업로드 필요, 최우선)

### F1. UART 버퍼 오버플로우 시 대기 중인 `STOP_ALL`까지 폐기 — *안전 이슈*
- **위치**: `Pico/main.py:85-89` (`_poll_abort`), `:178-181` (`_read_uart_line`)
- **증상**: 버퍼가 512B를 넘으면 완성된 라인을 추출하지 않고 통째로 `b""` 초기화.
  시간형 주행(`tFORWARD,60`) 중 명령이 쌓인 상태에서 비상정지를 누르면 버퍼에 든
  `STOP_ALL\n`이 함께 지워져 로버가 최대 60초 계속 주행. 웹은 STOP_ALL을 1회만
  전송(재시도 없음)이라 복구 불가.
- **수정 방향**: 초기화 전에 `\n` 기준으로 완성 라인을 먼저 뽑아 처리하고,
  미완성 꼬리만 절단한다.

### F2. `SET_PIN`·공장설정 `pin_*` 값이 OLED 외 전 모듈에서 무시됨
- **위치**: `Pico/pins.py` 하드코딩 상수를 `wheel/dcmotor/buzzer/leds/gun/ultrasonic/magsensor.py`가
  직접 import (예: `buzzer.py:5,13`). 설정을 읽는 것은 OLED뿐(`hardware.py:51-52`).
- **증상**: `SET_PIN`(`process_data.py:307-320`)과 공장설정 파일이 값을 저장하고
  성공 응답까지 보내지만 재부팅해도 미반영 — 배선 변경 시 모듈이 죽은 것처럼 보이고,
  이전 핀에 물린 부품에 PWM이 계속 출력됨.
- **수정 방향**: 각 모듈 init 이 `sys_config` 의 `pin_*` 를 우선 사용(없으면 pins.py 기본값),
  또는 SET_PIN 자체를 제거하고 문서·응답에서 기능을 내려 정직하게 만든다.
  `set_pin`이 GP0/1(UART 핀)을 허용하는 것도 함께 차단.

---

## 🟡 MEDIUM — 웹 (다음 수정 라운드 권장: W1→W3→W2 순)

### W1. 로켓 하강 중 미션 뷰 이탈 시, 지연된 `close()`가 화면에 coding 모드를 덧씌움
- **위치**: `Simulation_Main.js` `close()`의 `waitDescend` rAF 지연 → `main.js` `showView()`가
  `_contentMode`를 리셋하지 않음 → 지연된 `onClose`가 `setContentMode('coding')` 호출.
- **증상**: 시뮬에서 로켓 발사 → 하강 중 홈/미션 이동 → 수 초 뒤 개요 화면에
  `data-content-mode="coding"` 스탬프 — 내비 붕괴, 중앙 버튼이 '실행' 모드로 오동작.
- **수정 방향**: `showView()`에서 미션 이탈 시 `_contentMode`도 리셋하거나,
  `onClose`에서 `currentView === 'mission'` 가드 추가.

### W2. 실행 세대(run generation) 토큰 부재 — 중단된 실행이 새 실행에 얹혀 되살아남
- **위치**: `commandexecutor.js:489,496`(무조건 300ms 대기), `:598-599`(재실행 가드 없음),
  `:651-654`(sim finally 가 무조건 전역 플래그 클리어).
- **증상**: 비상정지 직후 ~300ms 내 재실행하면 이전 실행의 잠든 continuation이
  `isExecuting===true`(새 실행 소유)를 보고 깨어나 두 프로그램이 교차 전송됨.
- **수정 방향**: 실행마다 증가하는 `runId` 토큰을 두고 각 await 지점에서
  `runId !== currentRunId → return`. sim finally 도 자기 runId 일 때만 클리어.

### W3. 코딩→시뮬 전환 시 실기기(BLE) 실행이 안 멈추고, 비상정지 버튼만 사라짐
- **위치**: `main.js:2312-2324`(모드 전환), `:1805-1808`(시뮬 모드 중앙 버튼 재배선),
  `Simulation_Main.js` `toggleSimRun`(정지 경로가 `state.isExecuting=false`만 수행).
- **증상**: 실기기 무한 주행 프로그램 실행 중 시뮬 모드 진입 → 정지 수단 소실.
  이 상태에서 시뮬 정지를 누르면 STOP_ALL 없이 실기 실행만 죽여 로봇이 계속 움직임.
- **수정 방향**: 코딩→시뮬 전환 시 실기 실행 중이면 비상정지(STOP_ALL 포함) 수행,
  또는 전환을 막고 안내. `toggleSimRun` 정지 경로는 실기 실행 중이면 BLE emergencyStop 호출.

### W4. 미션 드롭다운 동시 갱신 경합
- **위치**: `main.js:1611`(`updateCodingMissionSelect` await 없음), `:1524-1556`.
- **증상**: 다음 미션 연타 시 optgroup 중복/뒤섞임, 잘못된 현재값.
- **수정 방향**: 세대 토큰 또는 in-flight 취소로 직렬화.

### W5. `message` 핸들러 origin 미검증 — 제3자 페이지의 로봇 명령 주입 가능
- **위치**: `main.js:2225-2260`.
- **증상**: Pages 는 X-Frame-Options 이 없어 외부 사이트가 앱을 iframe 으로 품고
  `{type:'command'}` postMessage 로 연결된 로버에 임의 명령 전송 가능.
- **수정 방향**: `event.origin === location.origin` 또는
  `event.source === dashboardFrame.contentWindow` 검증.

## 🟡 MEDIUM — 펌웨어

- **F3.** `SING`(~10초)·`CALIB_START`(3초)가 abort 폴링 없이 블로킹 — 그동안 STOP_ALL
  미처리 + UART RX 링버퍼 오버플로 위험 (`process_data.py:415,577`, `buzzer.py:72-98`).
  → `_interruptible_sleep` 패턴 적용.
- **F4.** `auto_stop`/`collision_dist` 가 저장·표시만 되고 **구현이 없음** — 공장설정
  안내문이 장애물 자동정지를 약속하고 있어 오해 유발 (`system_config.py:57`).
  → 구현하거나 설정·안내문에서 제거.
- **F5.** 개행 없는 잔여 조각이 다음 명령 앞에 영구 접합 (`main.py:190-193`) —
  노이즈 1바이트나 BT 모듈 알림(`OK+LOST`)이 다음 STOP_ALL 을 오염 가능.
  → 조각에 수명(age) 두고 일정 시간 지나면 폐기.
- **F6.** `ModelFactorySetting.txt` in-place 재작성 — 저장 중 전원 차단 시 파일 유실
  (`system_config.py:204-205`). → 임시 파일 + `os.rename` 원자적 교체.

## 🟡 MEDIUM — 콘텐츠

- **C1.** `report.html`의 `6일차/` PDF 링크 2개(`:991,1013,1047`)가 gitignore
  (`Document/진행보고/*일차/`) 대상이라 **배포에서 404**.
  → 해당 PDF 2개만 `git add -f` 로 추적하거나 링크 제거. *(결정 필요)*

---

## 🟢 LOW (여유 시)

| 영역 | 항목 |
|---|---|
| 웹 | 컷씬 배경 텍스처를 매 프레임 재업로드(`index.html` resize 의 `needsUpdate`) + 컷씬 뒤 히어로 루프 계속 렌더 — 태블릿 발열·배터리 |
| 웹 | 모바일 시뮬/AI 탭 450ms 고정 타이머 → 준비 폴링으로 (`main.js:1065-1090`, `openMissionCoding` 패턴 참고) |
| 웹 | 실행 중 `ws.clear()` 허용(예제/파일/AI 삽입) — 실행 중이면 차단 or 비상정지 선행 |
| 웹 | landing_game/credits 가 열 때마다 새 WebGL 컨텍스트 생성, `forceContextLoss()` 미호출 — 반복 개폐 시 메인 시뮬 컨텍스트 킬 위험. credits 의 PMREM env 텍스처 미해제 |
| 시뮬 | 우주 신호등 토픽에서 `BUZZER_ON` 무음(다른 토픽은 소리 남) — dispatch.js:110 경로 불일치 |
| 시뮬 | 시뮬 닫는 중 Gun 복귀 애니가 렌더 루프 없이 시작돼 공중 정지(재오픈 시 자가 회복, 외관만) |
| 시뮬 | `albi-led` 자식에 붙인 컴포넌트가 씬 저장에서 무경고 누락(`scene_store.js:14-19`) |
| 펌웨어 | 부저 `ticks_ms` 원시 연산(랩 시 무한 재생, `buzzer.py:35,45`) / `max_speed` 무검증(비정상 값이면 전 이동 명령 무력화) / 기기명 바이트 한도(한글 10자=30B가 BT05 한도 초과) + 이름 내 콤마가 SYS_VALUES 파싱 붕괴 / 시간형 이동 중 `buzzer.update()` 미호출로 음 지속 |

## 참고 — 검토에서 확인된 견고한 부분(비이슈)
BLE 20바이트 청킹·재연결 리스너 중복 방지·pending promise 정리, localStorage/JSON.parse
전면 try/catch, LED 인덱스 클램프, 차시/미션 해시 범위, 씬·메시 manifest 정합(전부 추적·청크 포함),
build.sh↔build.ps1 완전 패리티, MicroPython 명령 파서의 예외 가드·응답 청킹.
