# Copilot / AI Agent Instructions — ARES

ARES(Autonomous Rover Exploration System) 프로젝트를 위한 AI 에이전트 가이드입니다.

---

## 📋 프로젝트 개요

이 저장소는 두 개의 주요 런타임 도메인을 가집니다:

1. **프론트엔드 웹 UI** (`Web Source/`): Web Bluetooth와 Google Blockly를 사용하여 로버를 제어하는 정적 웹 파일
2. **MicroPython 펌웨어** (`Pico Source/`): Raspberry Pi Pico에서 실행되는 BLE/UART 스택 및 명령 처리기

## Legacy 및 Backup은 건들지 마세요.

---

## 🗂️ 주요 진입점

| 영역 | 파일 | 설명 |
|------|------|------|
| 프론트엔드 UI | `Web Source/main.html` | 메인 블록 코딩 인터페이스 |
| 대시보드 | `Web Source/dashboard.html` | 시스템 모니터링 및 설정 |
| BLE 설정 | `Web Source/constants.js` | UUID, 청킹 설정 등 |
| 블록 정의 | `Web Source/blocklyconfig.js` | Blockly 블록 정의 |
| 명령 실행 | `Web Source/commandexecutor.js` | 블록 → 명령 변환 및 실행 |
| 블루투스 관리 | `Web Source/bluetooth.js` | Web Bluetooth 연결 관리 |
| 펌웨어 메인 | `Pico Source/main.py` | 메인 애플리케이션 루프 |
| 명령 처리 | `Pico Source/process_data.py` | 명령 파싱 및 핸들러 |
| 시스템 설정 | `Pico Source/system_config.py` | JSON 설정 저장/로드 |
| 하드웨어 싱글톤 | `Pico Source/hardware.py` | 하드웨어 초기화 및 관리 |
| 핀 설정 | `Pico Source/pins.py` | GPIO 핀 중앙 관리 |
| API 문서 | `Document/API_DOCUMENTATION.md` | API 설계 및 모듈 요약 |
| 블록 가이드 | `Document/BLOCK_GUIDE.md` | 블록 사용 설명서 |

---

## 🔌 데이터 흐름 및 프로토콜

```
[웹 UI] --Web Bluetooth--> [Pico BLE/UART] --명령--> [CommandProcessor]
                                                         ↓
[웹 UI] <--응답 텍스트-- [Pico BLE/UART] <--응답-- [하드웨어 제어]
```

- **명령 형식**: 개행 문자(`\n`)로 구분된 텍스트 명령
- **BLE 청킹**: `MAX_CHUNK_SIZE = 20`, 큰 페이로드는 분할 전송
- **응답 형식**: 개행 문자로 구분된 텍스트 응답

---

## 📦 주요 모듈

### 프론트엔드 (`Web Source/`)

| 모듈 | 설명 |
|------|------|
| `BluetoothManager` | BLE 연결, 데이터 송수신 |
| `Logger` | 통신 로그 관리 |
| `CommandExecutor` | Blockly 블록 → 명령 변환 |
| `BlocklyConfig` | 블록 정의 (서보, DC모터, LED, 센서 등) |
| `elements` | DOM 요소 참조 |
| `state` | 전역 상태 관리 |

### 펌웨어 (`Pico Source/`)

| 모듈 | 설명 |
|------|------|
| `CommandProcessor` | 명령 파싱 및 실행 |
| `RobotHardware` | 싱글톤 하드웨어 인스턴스 |
| `SystemConfig` | JSON 설정 관리 |
| `KSWheel` | 서보 모터 (휠) 제어 |
| `KSDCMotor` | DC 모터 제어 |
| `KSBuzzer` | 부저 제어 |
| `KSLeds` | LED 제어 (5개) |
| `KSGun` | BB탄 발사기 제어 |
| `KSDistance` | 초음파 거리 센서 |
| `KSMagSensor` | 자기장 센서 |

---

## 🔧 GPIO 핀 배치 (`Pico Source/pins.py`)

| 기능 | GPIO 핀 |
|------|---------|
| UART TX/RX | GP0, GP1 |
| DC모터 DIR/PWM | GP2, GP3 |
| I2C (OLED) | GP4 (SDA), GP5 (SCL) |
| 초음파 센서 | GP6 (TRIG), GP7 (ECHO) |
| 서보 모터 (R/L) | GP12, GP13 |
| 부저 | GP15 |
| LED 1~5 | GP20, GP19, GP18, GP17, GP16 |
| 총 | GP22 |
| 자기장 센서 | GP26 |
| 예비 | GP8, GP9, GP10, GP11, GP14, GP21, GP27, GP28 |

---

## 🎨 Blockly 블록 카테고리

| 카테고리 | 색상 | 설명 |
|----------|------|------|
| 🚗 서보 모터 | `#FF8C00` | 서보 휠 제어 |
| ⚡ DC 모터 | `#FFCC00` | DC 모터 제어 |
| 💡 LED | `#FF5555` | LED 1~5번 제어 |
| 🖥️ 디스플레이 | `#9966FF` | OLED 화면 제어 |
| 🔊 소리 | `#00CCFF` | 부저 제어 |
| 🔫 전투 | `#FF4500` | BB탄 발사 |
| 📡 센서 | `#5C81A6` | 거리/자기장 센서 |
| ⏱️ 시간 | `#5CA65C` | 대기 시간 |
| 🔁 제어 | Hue 210 | 반복, 조건문 (Blockly 내장) |
| 📦 변수 | Hue 330 | 변수 관리 (Blockly 내장) |
| 🔢 수학/논리 | Hue 230 | 연산, 비교, 논리 (Blockly 내장) |

> **참고**: Blockly 내장 블록 (`controls_if`, `logic_compare`, `math_number` 등)의 색상은 변경할 수 없습니다. 탭 색상을 해당 블록 색상에 맞추었습니다.

---

## 🛠️ 개발 워크플로우

### 웹 UI 테스트
```bash
cd ARES/Web Source
python -m http.server 8000
# 브라우저에서 http://localhost:8000/main.html 열기
```

### 펌웨어 배포
1. Thonny, ampy, 또는 rshell 사용
2. `Pico Source/` 폴더의 모든 `.py` 파일을 Pico에 업로드
3. 시리얼 모니터로 디버그 출력 확인 (9600 baud)

---

## 📝 일반적인 수정 작업

| 작업 | 수정할 파일 |
|------|------------|
| 새 블록 추가 | `Web Source/blocklyconfig.js`, `Web Source/main.html` (toolbox), `Web Source/commandexecutor.js` |
| 새 명령 추가 | `Pico Source/process_data.py` (CommandProcessor) |
| 시스템 기본값 변경 | `Pico Source/system_config.py` (DEFAULT_CONFIG) |
| 핀 번호 변경 | `Pico Source/pins.py` |
| UI 스타일 변경 | `Web Source/styles.css` |
| 대시보드 수정 | `Web Source/dashboard.html` |

---

## ⚠️ 주의사항 및 제약

1. **Web Bluetooth**: `localhost` 또는 HTTPS에서만 작동 (`file://` 불가)
2. **MicroPython RAM**: 제한된 메모리, 큰 버퍼 사용 자제 (`MAX_BUFFER_SIZE` 참조)
3. **JSON 포맷팅**: MicroPython의 `json` 모듈은 indent를 지원하지 않아 수동 포맷팅 사용
4. **하드웨어 싱글톤**: `robot` 인스턴스 중복 생성 금지
5. **BLE 청킹**: 20바이트 제한, Pico에서 응답 전송 시 20바이트 단위로 분할 전송 필요
6. **장치 이름**: BT 모듈(BT05/HMSoft) 제한으로 최대 10자까지만 지원

---

## 🚀 주요 명령어 목록

### 이동 명령
- `FORWARD`, `BACKWARD`, `LEFT`, `RIGHT`, `STOP` - 서보 연속 제어
- `tFORWARD,N`, `tBACKWARD,N`, `tLEFT,N`, `tRIGHT,N` - 서보 시간 제어
- `MAIN_FORWARD`, `MAIN_BACKWARD`, `MAIN_STOP` - DC 모터 연속 제어
- `tDCMOTOR,FORWARD,N`, `tDCMOTOR,BACKWARD,N` - DC 모터 시간 제어

### 시스템 명령
- `GET_SYS` - 시스템 설정 요청 (응답: `SYS_VALUES,speed,dist,stop,name,left_cal,right_cal`)
- `GET_STATUS` - 센서 상태 요청 (응답: `STATUS,dist,mag,temp,mem,uptime`)
- `SYS_SET,speed,dist,stop,name` - 시스템 설정 저장
- `PING` - 연결 확인

### LED 명령
- `[v0 v1 v2 v3 v4]` - 전체 LED 밝기 설정
- `LED_ON,num,brightness` - 개별 LED 켜기
- `LED_OFF,num` 또는 `LED_OFF,ALL` - LED 끄기

### 센서 명령
- `DISTANCE` - 거리 측정 (응답: `DIST:값`)
- `MAGNET` - 자기장 감지 (응답: `MAG:값`)
- `PING` - 연결 확인

### 기타 명령
- `MSG,텍스트` - OLED 표시
- `CLEAR_DISPLAY` - 화면 지우기
- `BUZZER_ON,freq,duration` - 부저 울리기
- `GUN_FIRE` - 총 발사
- `SLEEP,seconds` - 대기

---

## 📚 참조 문서

- [API 문서](Document/API_DOCUMENTATION.md) - 상세 API 설명
- [블록 가이드](Document/BLOCK_GUIDE.md) - 블록 사용법 및 설명
