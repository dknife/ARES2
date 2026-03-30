# ARES — Autonomous Rover Exploration System

블록 코딩으로 화성 탐사 로버를 제어하는 교육용 로봇 프로젝트입니다.
웹 브라우저에서 블록을 조합하고, 블루투스로 로버에 명령을 전송합니다.

> **대상**: 초등학생 수준의 코딩 교육
> **홈페이지**: [https://dknife.github.io/ARES2/](https://dknife.github.io/ARES2/)
> **서비스(블록 코딩)**: [https://dknife.github.io/ARES2/Web/](https://dknife.github.io/ARES2/Web/)

---

## 프로젝트 구조

```
ARES_Project/
├── index.html              # 프로젝트 소개 랜딩 페이지
├── Web/                    # 프론트엔드 (Blockly 블록코딩 + Web Bluetooth)
├── Pico/                   # MicroPython 펌웨어 (Raspberry Pi Pico)
├── AI/                     # AI 코딩 도우미 (EXAONE 3.5 LLM)
├── Document/               # 프로젝트 문서
└── XML Presets/            # 블록 코딩 예제 프리셋
```

---

## 시스템 아키텍처

```
┌──────────────┐     Web Bluetooth      ┌──────────────┐     GPIO      ┌──────────────┐
│   Web UI     │ ◄──── BLE/UART ──────► │  Pico 펌웨어  │ ◄──────────► │  하드웨어 모듈 │
│  (Blockly)   │   HM-10/BT05, 9600bd   │ (MicroPython) │              │              │
└──────────────┘                         └──────────────┘              └──────────────┘
       │                                        │
   블록 → 명령 변환                        명령 파싱 → 하드웨어 제어
   BLE 20바이트 청킹                       센서 데이터 → BLE 응답
```

### 데이터 흐름

1. 사용자가 Web UI에서 Blockly 블록을 조합하고 실행
2. `commandexecutor.js`가 블록을 텍스트 명령으로 변환
3. `bluetooth.js`가 Web Bluetooth로 명령 전송 (20바이트 청킹, `\n` 구분)
4. Pico의 `main.py`가 UART로 수신 → `CommandProcessor`가 명령 파싱
5. 해당 하드웨어 모듈 제어 후 응답 반환
6. Web UI에서 응답 수신 및 표시

---

## Web 프론트엔드 (`Web/`)

Google Blockly 기반 시각적 프로그래밍 환경과 Web Bluetooth 통신을 제공합니다.

| 파일 | 역할 |
|------|------|
| `main.html` | 블록 코딩 에디터 (메인 인터페이스) |
| `dashboard.html` | 시스템 모니터링, 설정, 진단 (iframe) |
| `blocklyconfig.js` | Blockly 블록 정의 (30개+ 커스텀 블록) |
| `commandexecutor.js` | 블록 → 명령 변환 및 실행 엔진 |
| `bluetooth.js` | BLE 연결, 청킹 전송/수신, Promise 기반 응답 처리 |
| `constants.js` | BLE UUID, 타임아웃, 기본 설정값 |
| `main.js` | 앱 초기화, 이벤트 핸들링, Blockly 워크스페이스 관리 |
| `state.js` | 전역 상태 관리 (연결, 변수, 실행 상태) |
| `elements.js` | DOM 요소 참조 캐시 |
| `logger.js` | 통신 로그 UI |

### Blockly 블록 카테고리

| 카테고리 | 색상 | 블록 수 | 설명 |
|----------|------|---------|------|
| 서보 모터 | `#FF8C00` | 9 | 시간제어/연속 전후좌우 이동 + 정지 |
| DC 모터 | `#FFCC00` | 5 | 메인 구동 모터 제어 |
| LED | `#FF5555` | 3 | 개별/전체 LED 밝기 제어 (5개) |
| 디스플레이 | `#9966FF` | 2 | OLED 텍스트 표시/지우기 |
| 소리 | `#00CCFF` | 1 | 부저 주파수/시간 제어 |
| 전투 | `#FF4500` | 1 | BB탄 발사 |
| 센서 | `#5C81A6` | 3 | 거리/자기장 측정, 연결 확인 |
| 시간 | `#5CA65C` | 1 | 대기 |
| 제어 | Hue 210 | 6 | 반복, 조건문 (Blockly 내장) |
| 변수 | Hue 330 | 4 | 변수 생성/설정/참조 (Blockly 내장) |
| 수학/논리 | Hue 230 | 8 | 연산, 비교, 논리 (Blockly 내장) |

### Web UI 테스트

```bash
cd Web
python -m http.server 8000
# 브라우저에서 http://localhost:8000/main.html 접속
```

> Web Bluetooth는 `localhost` 또는 HTTPS에서만 동작합니다 (`file://` 불가).

---

## Pico 펌웨어 (`Pico/`)

Raspberry Pi Pico에서 실행되는 MicroPython 펌웨어입니다. UART로 BLE 명령을 수신하고 하드웨어를 제어합니다.

| 파일 | 역할 |
|------|------|
| `main.py` | 메인 루프 — UART 수신, 명령 처리, 응답 전송 |
| `process_data.py` | `CommandProcessor` — 50개+ 명령 파싱 및 라우팅 |
| `hardware.py` | `RobotHardware` 싱글톤 — 모듈 초기화 및 관리 |
| `system_config.py` | `SystemConfig` 싱글톤 — `system.json` 설정 관리 |
| `pins.py` | GPIO 핀 정의 (중앙 관리) |
| `wheel.py` | 서보 모터 (360도 연속회전, 차동 구동) |
| `dcmotor.py` | DC 모터 (PWM 속도 제어) |
| `buzzer.py` | 부저 (비동기 재생, 멜로디 지원) |
| `leds.py` | LED 5개 배열 + 메인 LED (PWM 밝기 제어) |
| `gun.py` | BB탄 발사기 (소프트 스타트) |
| `ultrasonic.py` | HC-SR04 초음파 거리 센서 |
| `magsensor.py` | 자기장 센서 (홀 효과) |
| `ssd1306.py` | SSD1306 OLED 드라이버 (I2C, 128x64) |

### 모듈 아키텍처

모든 하드웨어 모듈은 선택적 로드를 지원합니다:

```python
# hardware.py 패턴
if sys_config.is_module_enabled('wheel'):
    try:
        from wheel import KSWheel
        self.wheel = KSWheel()
    except Exception as e:
        print(f"휠 초기화 실패: {e}")
        self.wheel = None

# process_data.py 사용 전 체크
if not robot.wheel:
    return 0
```

8개 모듈 모두 `system.json`에서 개별 활성화/비활성화 가능합니다.

### GPIO 핀 배치

| 기능 | GPIO | 기능 | GPIO |
|------|------|------|------|
| UART TX/RX | GP0, GP1 | 서보 (R/L) | GP12, GP13 |
| DC모터 DIR/PWM | GP8, GP9 | 부저 | GP15 |
| I2C SDA/SCL | GP4, GP5 | LED 1~5 | GP20~GP16 |
| 초음파 TRIG/ECHO | GP6, GP7 | 메인 LED | GP21 |
| 자기장 센서 | GP26 | 총 | GP22 |

### 펌웨어 배포

1. Thonny, ampy, 또는 rshell 사용
2. `Pico/` 폴더의 모든 `.py` 파일을 Pico에 업로드
3. 시리얼 모니터로 디버그 출력 확인 (9600 baud)

---

## 명령 프로토콜

텍스트 기반, 개행(`\n`) 구분, UTF-8 인코딩, BLE 20바이트 청킹.

### 주요 명령어

| 분류 | 명령 | 응답 |
|------|------|------|
| **서보 이동** | `SERVO_tFORWARD,N` / `SERVO_FORWARD` / `SERVO_STOP` | `1` (성공) / `0` (실패) |
| **DC 모터** | `DC_tFORWARD,N` / `DC_FORWARD` / `DC_STOP` | `1` / `0` |
| **LED** | `LED_ON,num,brightness` / `LED_OFF,num` / `[v0 v1 v2 v3 v4]` | `1` / `0` |
| **디스플레이** | `MSG,텍스트` / `CLEAR_DISPLAY` | `1` / `0` |
| **부저** | `BUZZER_ON,freq,duration` | `1` / `0` |
| **전투** | `GUN_FIRE` | `1` / `0` |
| **센서** | `DISTANCE` / `MAGNET` | `DIST:값` / `MAG:0\|1` |
| **시스템** | `PING` / `GET_SYS` / `GET_STATUS` / `GET_MODULES` | 포맷 응답 |
| **설정** | `SYS_SET,speed,dist,stop,name` / `SET_MODULE,name,0\|1` | 확인 응답 |

전체 명령어 목록은 [API 문서](Document/API_DOCUMENTATION.md)를 참조하세요.

---

## AI 코딩 도우미 (`AI/`)

EXAONE-3.5-2.4B-Instruct (한국어 LLM)를 활용한 블록 코딩 질문 답변 시스템입니다.

- 초등학생 대상 쉬운 설명 생성
- 블록 사용법, 로봇 제어 방법 안내
- PyTorch + Hugging Face Transformers 기반
- 스트리밍/비스트리밍 모드 지원

> **참고**: 현재 AI 모듈은 독립 실행 상태이며, Web UI와의 연동은 개발 진행 중입니다.

---

## XML 프리셋 (`XML Presets/`)

Blockly 워크스페이스에 불러올 수 있는 예제 프로그램입니다.

| 프리셋 | 설명 |
|--------|------|
| `Launch Rocket.xml` | LED 순차 점등 + 부저 + 발사 시퀀스 (변수, 반복문 학습) |
| `Test All Hardware.xml` | 전체 하드웨어 테스트 (서보, DC모터, LED, 부저, 센서, 총 등 10개 테스트) |

Web UI의 "불러오기" 버튼으로 XML 파일을 가져올 수 있습니다.

---

## 문서

| 문서 | 내용 |
|------|------|
| [API_DOCUMENTATION.md](Document/API_DOCUMENTATION.md) | Web UI 모듈별 상세 API 문서 |
| [BLOCK_GUIDE.md](Document/BLOCK_GUIDE.md) | 블록 사용 설명서 (사용자용) |
| [MODULE_MANAGEMENT.md](Document/MODULE_MANAGEMENT.md) | 펌웨어 모듈 관리 및 핀 설정 가이드 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | HTML/CSS/JS (ES Modules), Google Blockly, Web Bluetooth API |
| 펌웨어 | MicroPython, Raspberry Pi Pico |
| 통신 | BLE UART (HM-10/BT05), 9600 baud |
| 하드웨어 | 서보 모터, DC 모터, HC-SR04, SSD1306 OLED, 피에조 부저, 홀 센서 |
| AI | PyTorch, Hugging Face Transformers, EXAONE-3.5-2.4B-Instruct |

---

## 알려진 이슈 및 제한사항

### 제한사항
- Web Bluetooth는 `localhost` 또는 HTTPS에서만 동작 (`file://` 불가)
- MicroPython RAM 제한 — 큰 버퍼 사용 자제 (`MAX_BUFFER_SIZE = 512`)
- BLE 패킷 크기 20바이트 제한 (양방향 청킹 필수)
- BT 모듈 장치 이름 최대 10자
- while 반복문 최대 100회 제한 (무한 루프 방지)

### 알려진 버그

| 심각도 | 위치 | 내용 |
|--------|------|------|
| Critical | `Pico/wheel.py` | `turn_right`/`turn_left` 로직 오류 — 양쪽 바퀴가 같은 방향으로 회전하여 제자리 회전 불가 |
| Critical | `Pico/process_data.py` | SYS_SET 핸들러 고아 코드 블록 — 도달 불가능 위치에 존재 |
| High | `Pico/hardware.py` | BT AT 명령 `\r\n` 종결자 누락 |
| High | `Pico/ssd1306.py` | SPI 클래스에서 `time` → `utime` 수정 필요 |
| Medium | `Pico/main.py` | 메인 루프에 `gc.collect()` 누락 → 장기 실행 시 메모리 단편화 위험 |
| Medium | `Web/bluetooth.js` | 빠른 연속 명령 전송 시 Promise 경합 조건 |

---

## 수정 작업 가이드

| 작업 | 수정 대상 파일 |
|------|---------------|
| 새 블록 추가 | `Web/blocklyconfig.js` → `Web/main.html` (toolbox) → `Web/commandexecutor.js` |
| 새 펌웨어 명령 추가 | `Pico/process_data.py` |
| 시스템 기본값 변경 | `Pico/system_config.py` (`DEFAULT_CONFIG`) |
| GPIO 핀 변경 | `Pico/pins.py` |
| 하드웨어 모듈 추가 | `Pico/<module>.py` → `Pico/hardware.py` → `Pico/process_data.py` |
| UI 스타일 수정 | `Web/styles.css` |
| 대시보드 수정 | `Web/dashboard.html` |

---

## 라이선스

코리아사이언스
