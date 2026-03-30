# ARES 화성 탐사선 제어 시스템 API 문서

## 목차
1. [프로젝트 개요](#프로젝트-개요)
2. [파일 구조](#파일-구조)
3. [모듈별 API](#모듈별-api)
   - [state.js - 전역 상태 관리](#statejs---전역-상태-관리)
   - [constants.js - 상수 정의](#constantsjs---상수-정의)
   - [elements.js - DOM 요소 참조](#elementsjs---dom-요소-참조)
   - [logger.js - 로깅 시스템](#loggerjs---로깅-시스템)
   - [bluetooth.js - 블루투스 통신 관리](#bluetoothjs---블루투스-통신-관리)
   - [commandexecutor.js - 명령 실행기](#commandexecutorjs---명령-실행기)
   - [blocklyconfig.js - Blockly 블록 정의](#blocklyconfigjs---blockly-블록-정의)
   - [main.js - 메인 애플리케이션](#mainjs---메인-애플리케이션)
4. [이벤트 리스너 상세](#이벤트-리스너-상세)
5. [데이터 흐름](#데이터-흐름)

---

## 프로젝트 개요

**ARES 화성 탐사선 제어 시스템**은 Web Bluetooth API를 활용하여 Raspberry Pi Pico 기반의 화성 탐사 로봇을 제어하는 웹 애플리케이션입니다. Google Blockly를 사용한 비주얼 프로그래밍 인터페이스를 제공합니다.

### 주요 기능
- Web Bluetooth를 통한 BLE 장치 연결
- Blockly 기반 비주얼 프로그래밍
- 모터 제어 (전진, 후진, 좌회전, 우회전)
- 센서 데이터 수집 (거리, 자기장)
- LED 램프 제어
- 부저 제어
- 실시간 통신 로그
- 대시보드 모니터링

### 기술 스택
- **Frontend**: HTML5, CSS3, JavaScript (ES6 Modules)
- **통신**: Web Bluetooth API
- **프로그래밍 인터페이스**: Google Blockly
- **하드웨어**: Raspberry Pi Pico (BLE)

---

## 파일 구조

```
ble_251009/
├── index.html              # 시작 페이지
├── main.html               # 메인 애플리케이션 페이지
├── dashboard.html          # 대시보드 페이지
├── index.css               # 시작 페이지 스타일
├── styles.css              # 메인 애플리케이션 스타일
├── main.js                 # 메인 애플리케이션 로직
├── state.js                # 전역 상태 관리
├── constants.js            # 상수 정의
├── elements.js             # DOM 요소 참조
├── logger.js               # 로깅 시스템
├── bluetooth.js            # 블루투스 통신 관리
├── commandexecutor.js      # 명령 실행기
└── blocklyconfig.js        # Blockly 블록 정의
```

---

## 모듈별 API

### state.js - 전역 상태 관리

**위치**: `state.js:1-17`

전역 상태를 관리하는 모듈입니다.

#### 내보내기 (Exports)

##### `DEBUG`
- **타입**: `Boolean`
- **값**: `false`
- **설명**: 디버그 모드 활성화 여부. `true`로 설정 시 자세한 로그 출력

##### `state`
- **타입**: `Object`
- **설명**: 애플리케이션 전역 상태 객체

**속성 (Properties)**:

| 속성 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `bluetoothDevice` | `BluetoothDevice \| null` | `null` | 연결된 Bluetooth 장치 객체 |
| `bluetoothServer` | `BluetoothRemoteGATTServer \| null` | `null` | GATT 서버 객체 |
| `uartService` | `BluetoothRemoteGATTService \| null` | `null` | UART 서비스 객체 |
| `characteristic` | `BluetoothRemoteGATTCharacteristic \| null` | `null` | UART 특성 객체 |
| `isExecuting` | `Boolean` | `false` | 명령 실행 중 여부 |
| `isConnecting` | `Boolean` | `false` | 연결 시도 중 여부 |
| `notificationsEnabled` | `Boolean` | `false` | 알림 활성화 여부 |
| `readIntervalId` | `Number \| null` | `null` | 주기적 읽기 인터벌 ID |
| `variables` | `Object` | `{ last_response: '' }` | 사용자 변수 저장소 |
| `pendingResolve` | `Function \| null` | `null` | 대기 중인 Promise resolve |
| `pendingReject` | `Function \| null` | `null` | 대기 중인 Promise reject |
| `pendingTimeout` | `Number \| null` | `null` | 응답 타임아웃 ID |

---

### constants.js - 상수 정의

**위치**: `constants.js:1-15`

애플리케이션 전역에서 사용되는 상수를 정의합니다.

#### 내보내기 (Exports)

##### `BLUETOOTH_CONFIG`
- **타입**: `Object`
- **설명**: Bluetooth 통신 관련 설정

**속성**:

| 속성 | 타입 | 값 | 설명 |
|------|------|-----|------|
| `UART_SERVICE_UUID` | `String` | `'0000ffe0-0000-1000-8000-00805f9b34fb'` | UART 서비스 UUID |
| `UART_CHARACTERISTIC_UUID` | `String` | `'0000ffe1-0000-1000-8000-00805f9b34fb'` | UART 특성 UUID |
| `MAX_CHUNK_SIZE` | `Number` | `20` | 최대 청크 크기 (바이트) |
| `COMMAND_DELAY` | `Number` | `500` | 명령 간 지연 시간 (밀리초) |
| `CHUNK_DELAY` | `Number` | `100` | 청크 전송 간 지연 시간 (밀리초) |
| `READ_INTERVAL` | `Number` | `1000` | 주기적 읽기 간격 (밀리초) |
| `RESPONSE_TIMEOUT` | `Number` | `20000` | 응답 타임아웃 (밀리초) |

##### `STATUS_COLORS`
- **타입**: `Object`
- **설명**: 상태 표시 색상

**속성**:

| 속성 | 값 | 설명 |
|------|-----|------|
| `GREEN` | `'green'` | 성공/정상 상태 |
| `RED` | `'red'` | 오류/연결 끊김 |
| `ORANGE` | `'orange'` | 진행 중/경고 |

---

### elements.js - DOM 요소 참조

**위치**: `elements.js:1-12`

자주 사용되는 DOM 요소에 대한 참조를 제공합니다.

#### 내보내기 (Exports)

##### `elements`
- **타입**: `Object`
- **설명**: DOM 요소 참조 객체

**속성**:

| 속성 | 타입 | ID | 설명 |
|------|------|-----|------|
| `status` | `HTMLElement` | `'status'` | 상태 표시 요소 |
| `connectButton` | `HTMLButtonElement` | `'connectButton'` | 연결 버튼 |
| `disconnectButton` | `HTMLButtonElement` | `'disconnectButton'` | 연결 해제 버튼 |
| `runButton` | `HTMLButtonElement` | `'runButton'` | 실행 버튼 |
| `saveButton` | `HTMLButtonElement` | `'saveButton'` | 저장 버튼 |
| `loadButton` | `HTMLButtonElement` | `'loadButton'` | 불러오기 버튼 |
| `fileInput` | `HTMLInputElement` | `'fileInput'` | 파일 입력 요소 |
| `deviceInfo` | `HTMLElement` | `'deviceInfo'` | 장치 정보 표시 요소 |
| `logContent` | `HTMLElement` | `'logContent'` | 로그 컨텐츠 영역 |
| `clearLogBtn` | `HTMLButtonElement` | `'clearLogBtn'` | 로그 지우기 버튼 |

---

### logger.js - 로깅 시스템

**위치**: `logger.js:1-16`

통신 및 시스템 이벤트 로깅을 담당합니다.

#### 내보내기 (Exports)

##### `Logger`
- **타입**: `Object`
- **설명**: 로깅 관리 객체

#### 메서드 (Methods)

##### `Logger.add(message, type)`
**위치**: `logger.js:4-11`

로그 메시지를 추가합니다.

**매개변수**:
- `message` (String): 로그 메시지
- `type` (String, optional): 로그 타입 (기본값: `'info'`)
  - `'info'`: 일반 정보
  - `'error'`: 오류
  - `'warning'`: 경고
  - `'send'`: 송신 데이터
  - `'receive'`: 수신 데이터

**동작**:
1. 현재 시각을 타임스탬프로 생성
2. 로그 엔트리 DOM 요소 생성
3. `log-{type}` CSS 클래스 적용
4. 로그 영역에 추가
5. 자동으로 스크롤을 최하단으로 이동

**사용 예시**:
```javascript
Logger.add('아레스 연결 성공', 'info');
Logger.add('전송 오류 발생', 'error');
Logger.add('→ 명령 전송: FORWARD', 'send');
```

##### `Logger.clear()`
**위치**: `logger.js:13-15`

모든 로그를 지웁니다.

**매개변수**: 없음

**반환값**: `void`

**동작**: 로그 컨텐츠 영역의 모든 HTML을 제거

---

### bluetooth.js - 블루투스 통신 관리

**위치**: `bluetooth.js:1-260`

Web Bluetooth API를 사용한 BLE 통신을 관리합니다.

#### 내보내기 (Exports)

##### `BluetoothManager`
- **타입**: `Object`
- **설명**: Bluetooth 연결 및 데이터 통신 관리 객체

#### 메서드 (Methods)

##### `BluetoothManager.connect()`
**위치**: `bluetooth.js:7-64`

BLE 장치에 연결합니다.

**매개변수**: 없음

**반환값**: `Promise<void>`

**동작 흐름**:
1. 중복 연결 시도 방지 체크
2. 장치 검색 (`navigator.bluetooth.requestDevice()`)
   - 필터: `PicoBLE`, `HMSoft`, `BT05`
   - 서비스: UART Service UUID
3. GATT 서버 연결
4. UART 서비스 및 특성 획득
5. 알림(Notifications) 활성화 또는 주기적 읽기 모드로 전환
6. 연결 상태 UI 업데이트

**에러 처리**:
- 연결 실패 시 `cleanup()` 호출
- 에러 메시지를 로그에 기록
- 상태 표시를 빨간색으로 변경

**사용 예시**:
```javascript
await BluetoothManager.connect();
```

##### `BluetoothManager.disconnect()`
**위치**: `bluetooth.js:66-96`

BLE 장치 연결을 해제합니다.

**매개변수**: 없음

**반환값**: `Promise<void>`

**동작 흐름**:
1. 알림(Notifications) 중지
2. 이벤트 리스너 제거
3. GATT 연결 해제
4. 상태 정리 (`cleanup()`)
5. UI 업데이트

**에러 처리**: 에러 발생 시 로그에 기록하고 계속 진행

##### `BluetoothManager.cleanup()`
**위치**: `bluetooth.js:98-126`

연결 관련 리소스를 정리합니다.

**매개변수**: 없음

**반환값**: `Promise<void>`

**동작**:
- 알림 중지
- 인터벌 타이머 해제
- Bluetooth 객체 참조 제거
- 이벤트 리스너 제거
- 대기 중인 Promise 타임아웃 해제

##### `BluetoothManager.onDeviceDisconnected()`
**위치**: `bluetooth.js:128-133`

장치 연결 해제 이벤트 핸들러입니다.

**매개변수**: 없음

**반환값**: `void`

**동작**:
1. 연결 해제 로그 기록
2. UI 업데이트
3. 리소스 정리

**바인딩**: `gattserverdisconnected` 이벤트에 바인딩됨

##### `BluetoothManager.handleRxData(event)`
**위치**: `bluetooth.js:135-143`

수신 데이터 처리 이벤트 핸들러입니다.

**매개변수**:
- `event` (Event): `characteristicvaluechanged` 이벤트 객체

**반환값**: `void`

**동작**:
1. 수신된 바이너리 데이터를 텍스트로 디코딩
2. 공백 제거
3. 디버그 모드 시 로그 기록
4. `processReceivedData()` 호출

##### `BluetoothManager.readCharacteristic()`
**위치**: `bluetooth.js:145-159`

특성 값을 주기적으로 읽습니다.

**매개변수**: 없음

**반환값**: `Promise<void>`

**동작**:
1. 연결 상태 확인
2. 특성 값 읽기
3. 텍스트 디코딩
4. 데이터 처리

**에러 처리**: 읽기 오류 시 로그 기록

**사용 시나리오**: 알림이 지원되지 않는 경우 주기적으로 호출됨

##### `BluetoothManager.processReceivedData(receivedData)`
**위치**: `bluetooth.js:161-187`

수신된 데이터를 처리하고 대기 중인 Promise를 해결합니다.

**매개변수**:
- `receivedData` (String): 수신된 데이터 문자열

**반환값**: `void`

**동작**:
1. 에코 응답 확인 (`Echo: {command}` 형식)
2. 에코가 아닌 응답도 유효한 응답으로 처리
3. `last_response` 변수에 저장
4. 대기 중인 Promise resolve
5. 타임아웃 해제

##### `BluetoothManager.startPeriodicReads()`
**위치**: `bluetooth.js:189-193`

주기적 읽기를 시작합니다.

**매개변수**: 없음

**반환값**: `void`

**동작**: `READ_INTERVAL(1000ms)` 간격으로 `readCharacteristic()` 호출

**사용 시나리오**: 알림이 지원되지 않는 장치에서 사용

##### `BluetoothManager.updateConnectionStatus(connected)`
**위치**: `bluetooth.js:195-211`

연결 상태 UI를 업데이트합니다.

**매개변수**:
- `connected` (Boolean): 연결 여부

**반환값**: `void`

**동작**:
- 버튼 활성화/비활성화
- 상태 텍스트 및 색상 변경
- 장치 정보 표시

##### `BluetoothManager.updateStatus(message, color)`
**위치**: `bluetooth.js:213-216`

상태 메시지를 업데이트합니다.

**매개변수**:
- `message` (String): 상태 메시지
- `color` (String): 색상 (`STATUS_COLORS` 상수 사용)

**반환값**: `void`

##### `BluetoothManager.sendData(data)`
**위치**: `bluetooth.js:218-254`

BLE를 통해 데이터를 전송합니다.

**매개변수**:
- `data` (String): 전송할 데이터

**반환값**: `Promise<String>` - 장치로부터의 응답

**동작 흐름**:
1. 연결 상태 확인
2. 데이터 로깅
3. UTF-8 인코딩
4. 20바이트 청크로 분할 전송
5. 각 청크 전송 후 100ms 대기
6. 응답 대기 (타임아웃: 20초)

**에러 처리**:
- 연결되지 않은 경우 Error throw
- 응답 타임아웃 시 `Response timeout--` 에러

**사용 예시**:
```javascript
const response = await BluetoothManager.sendData('FORWARD');
console.log('응답:', response);
```

##### `BluetoothManager.delay(ms)`
**위치**: `bluetooth.js:256-258`

비동기 지연 함수입니다.

**매개변수**:
- `ms` (Number): 지연 시간 (밀리초)

**반환값**: `Promise<void>`

**사용 예시**:
```javascript
await BluetoothManager.delay(1000); // 1초 대기
```

---

### commandexecutor.js - 명령 실행기

**위치**: `commandexecutor.js:1-213`

Blockly 블록을 해석하고 BLE 명령으로 변환하여 실행합니다.

#### 내보내기 (Exports)

##### `CommandExecutor`
- **타입**: `Object`
- **설명**: 블록 명령 실행 관리 객체

#### 메서드 (Methods)

##### `CommandExecutor.evaluateValueBlock(block)`
**위치**: `commandexecutor.js:10-63`

값 블록을 평가하여 실제 값을 반환합니다.

**매개변수**:
- `block` (Blockly.Block | null): 평가할 블록

**반환값**: `String` - 평가된 값 (문자열 또는 숫자)

**지원 블록 타입**:
- `math_number`: 숫자 블록 → 숫자 문자열
- `text`: 텍스트 블록 → 텍스트 문자열
- `variables_get`: 변수 블록 → 변수 값
- `math_arithmetic`: 수학 연산 블록 → 연산 결과
  - `ADD`: 덧셈
  - `MINUS`: 뺄셈
  - `MULTIPLY`: 곱셈
  - `DIVIDE`: 나눗셈
- `logic_compare`: 비교 블록 → `'true'` 또는 `'false'`
  - `EQ`: 같음
  - `NEQ`: 다름
  - `LT`: 작음
  - `LTE`: 작거나 같음
  - `GT`: 큼
  - `GTE`: 크거나 같음
- `logic_boolean`: 불린 블록 → `'true'` 또는 `'false'`

**사용 예시**:
```javascript
const value = CommandExecutor.evaluateValueBlock(block.getInputTargetBlock('SECONDS'));
// 예: "2.5"
```

##### `CommandExecutor.processBlock(block)`
**위치**: `commandexecutor.js:65-183`

블록을 처리하고 해당하는 명령을 실행합니다.

**매개변수**:
- `block` (Blockly.Block | null): 처리할 블록

**반환값**: `Promise<void>`

**처리 블록 타입 및 명령**:

| 블록 타입 | 명령 형식 | 설명 |
|----------|-----------|------|
| `set_lamp` | `[lamp0 lamp1 lamp2 lamp3 lamp4]` | LED 램프 설정 |
| `send_message` | `MSG,{문자열}` | 메시지 전송 |
| `buzzer_on` | `BUZZER_ON,{주파수},{시간}` | 부저 울리기 |
| `timed_forward` | `tFORWARD,{시간}` | 일정 시간 전진 |
| `timed_backward` | `tBACKWARD,{시간}` | 일정 시간 후진 |
| `timed_right` | `tRIGHT,{시간}` | 일정 시간 우회전 |
| `timed_left` | `tLEFT,{시간}` | 일정 시간 좌회전 |
| `move_forward` | `FORWARD` | 계속 전진 |
| `move_backward` | `BACKWARD` | 계속 후진 |
| `turn_left` | `LEFT` | 계속 좌회전 |
| `turn_right` | `RIGHT` | 계속 우회전 |
| `stop_moving` | `STOP` | 정지 |
| `time_sleep` | `SLEEP,{시간}` | 대기 |
| `pico_check_device` | `READY` | 장치 상태 확인 |
| `check_distance` | `DISTANCE` | 거리 측정 |
| `check_magnetic` | `MAGNET` | 자기장 측정 |

**제어 구조 처리**:
- `assign_variable`: 변수에 값 할당
- `math_change`: 변수 값 변경
- `controls_if`: 조건문 (IF-ELSE)
- `controls_whileUntil`: 반복문 (WHILE/UNTIL, 최대 100회)
- `controls_repeat_ext`: 반복문 (N회, 최대 100회)

**동작 흐름**:
1. 블록 타입 확인
2. 필요한 입력 값 평가
3. 명령 문자열 생성
4. BLE로 전송 (`BluetoothManager.sendData()`)
5. 500ms 대기 (Pico 처리 시간)
6. 다음 블록 처리 (재귀 호출)

**에러 처리**: 명령 오류 시 로그 기록 후 Error throw

##### `CommandExecutor.executeWorkspace(workspace)`
**위치**: `commandexecutor.js:185-213`

전체 Blockly 워크스페이스를 실행합니다.

**매개변수**:
- `workspace` (Blockly.Workspace): Blockly 워크스페이스 객체

**반환값**: `Promise<void>`

**동작 흐름**:
1. `isExecuting` 플래그 설정
2. 실행 버튼 비활성화
3. 상태를 "프로그램 실행 중"으로 설정
4. 최상위 블록들을 순차 실행
5. 실행 완료 후 상태 업데이트
6. 2초 후 연결 상태 확인 및 UI 갱신
7. `isExecuting` 플래그 해제

**에러 처리**: 실행 오류 시 로그 기록 및 상태 업데이트

**사용 예시**:
```javascript
await CommandExecutor.executeWorkspace(workspace);
```

---

### blocklyconfig.js - Blockly 블록 정의

**위치**: `blocklyconfig.js:1-230`

Blockly에서 사용할 커스텀 블록을 정의합니다.

#### 내보내기 (Exports)

##### `BlocklyConfig`
- **타입**: `Object`
- **설명**: Blockly 블록 설정 객체

**속성**:
- `blocks` (Array): 블록 정의 배열

#### 블록 정의 목록

##### 1. 신호 주고받기

**`set_lamp`** - 램프 세팅
- **입력**: LAMP0, LAMP1, LAMP2, LAMP3, LAMP4 (Number)
- **색상**: `#4C97FF`
- **설명**: 5개의 LED 램프 밝기 설정

**`send_message`** - 메시지 보내기
- **입력**: Msg (String)
- **색상**: `#4C97FF`
- **설명**: 지정한 문자열을 아레스로 전송

##### 2. 부저

**`buzzer_on`** - 부저 울리기
- **입력**: FREQ (Number), DURATION (Number)
- **색상**: `#4C97FF`
- **설명**: 지정한 주파수와 시간으로 부저 울림

##### 3. 모터

**`timed_forward`** - 전진하기
- **입력**: SECONDS (Number)
- **색상**: `#4C97FF`
- **설명**: 지정한 시간(초)만큼 전진

**`timed_backward`** - 후진하기
- **입력**: SECONDS (Number)
- **색상**: `#4C97FF`
- **설명**: 지정한 시간(초)만큼 후진

**`timed_right`** - 우회전
- **입력**: SECONDS (Number)
- **색상**: `#4C97FF`
- **설명**: 지정한 시간(초)만큼 우회전

**`timed_left`** - 좌회전
- **입력**: SECONDS (Number)
- **색상**: `#4C97FF`
- **설명**: 지정한 시간(초)만큼 좌회전

**`move_forward`** - 계속 전진하기
- **입력**: 없음
- **색상**: `#4C97FF`

**`move_backward`** - 계속 후진하기
- **입력**: 없음
- **색상**: `#4C97FF`

**`turn_left`** - 계속 좌회전
- **입력**: 없음
- **색상**: `#4C97FF`

**`turn_right`** - 계속 우회전
- **입력**: 없음
- **색상**: `#4C97FF`

**`stop_moving`** - 멈추기
- **입력**: 없음
- **색상**: `#4C97FF`

##### 4. 시간

**`time_sleep`** - 기다리기
- **입력**: SECONDS (Number)
- **색상**: `#4C97FF`
- **설명**: 지정한 시간(초)만큼 프로그램 실행 멈춤

##### 5. 상태 감지

**`pico_check_device`** - 장치 상태 확인
- **입력**: 없음
- **색상**: `#4C97FF`
- **설명**: Pico 장치의 준비 상태 확인

**`check_distance`** - 거리 측정
- **입력**: 없음
- **색상**: `#4C97FF`
- **설명**: 장치 앞 물체의 거리 측정

**`check_magnetic`** - 자기 측정
- **입력**: 없음
- **색상**: `#4C97FF`
- **설명**: 장치 앞 자기장 감지

##### 6. 변수

**`assign_variable`** - 변수 값 지정
- **입력**: VAR (Variable), VALUE (Number)
- **색상**: `#4C97FF`
- **설명**: 지정한 변수에 값 할당

##### 7. 수학

**`math_arithmetic`** - 사칙연산
- **입력**: A (Number), OP (Dropdown), B (Number)
- **연산자**: ADD, MINUS, MULTIPLY, DIVIDE
- **출력**: Number
- **색상**: `#4C97FF`

---

### main.js - 메인 애플리케이션

**위치**: `main.js:1-222`

애플리케이션 진입점 및 초기화를 담당합니다.

#### 함수 (Functions)

##### `initializeBlockly()`
**위치**: `main.js:9-73`

Blockly 워크스페이스를 초기화합니다.

**매개변수**: 없음

**반환값**: `Blockly.Workspace` - 생성된 워크스페이스 객체

**동작**:
1. Web Bluetooth API 지원 여부 확인
2. 커스텀 블록 등록
3. Blockly 메시지 한글화
4. 워크스페이스 주입
5. `last_response` 변수 사전 생성
6. Python 생성기 초기화

**Blockly 한글화 목록**:
- 제어 블록 (`CONTROLS_REPEAT`, `CONTROLS_IF`, `CONTROLS_WHILEUNTIL`)
- 수학 블록 (`MATH_NUMBER`, `MATH_ARITHMETIC`, `MATH_CHANGE`)
- 논리 블록 (`LOGIC_COMPARE`, `LOGIC_BOOLEAN`)
- 변수 블록 (`VARIABLES_GET`, `NEW_VARIABLE`, `RENAME_VARIABLE` 등)

##### `toggleDashboard()`
**위치**: `main.js:75-124`

블록코딩 모드와 대시보드 모드를 전환합니다.

**매개변수**: 없음

**반환값**: `void`

**동작**:
1. 현재 모드 확인 (Blockly 또는 Dashboard)
2. 대시보드로 전환 시:
   - BLE 연결 확인 (미연결 시 alert)
   - Blockly 숨김, Dashboard 표시
   - 블록코딩 관련 버튼 비활성화
3. Blockly로 전환 시:
   - Dashboard 숨김, Blockly 표시
   - 블록코딩 관련 버튼 활성화

##### `initializeEventListeners(workspace)`
**위치**: `main.js:126-198`

이벤트 리스너를 초기화합니다.

**매개변수**:
- `workspace` (Blockly.Workspace): Blockly 워크스페이스 객체

**반환값**: `void`

**등록 이벤트**: 이벤트 리스너 상세 섹션 참조

##### `validateConnection()`
**위치**: `main.js:200-207`

BLE 연결 상태를 검증합니다.

**매개변수**: 없음

**반환값**: `Boolean` - 연결 여부

**동작**:
- 연결 확인: `state.bluetoothDevice`, `gatt.connected`, `characteristic`
- 미연결 시 alert 및 로그 기록

##### `main()`
**위치**: `main.js:209-215`

메인 진입 함수입니다.

**매개변수**: 없음

**반환값**: `void`

**동작**:
1. Blockly 초기화
2. 이벤트 리스너 초기화
3. 연결 상태 UI 업데이트
4. 준비 완료 로그

---

## 이벤트 리스너 상세

### 1. Bluetooth 관련 이벤트

#### `connectButton.click`
**위치**: `main.js:127`
**트리거**: 연결 버튼 클릭
**핸들러**: `BluetoothManager.connect()`
**동작**: BLE 장치 검색 및 연결 시작

**관련 함수 체인**:
```
connectButton.click
  → BluetoothManager.connect()
    → navigator.bluetooth.requestDevice()
    → state.bluetoothDevice.gatt.connect()
    → BluetoothManager.updateConnectionStatus()
    → Logger.add()
```

#### `disconnectButton.click`
**위치**: `main.js:128`
**트리거**: 연결 해제 버튼 클릭
**핸들러**: `BluetoothManager.disconnect()`
**동작**: BLE 연결 해제 및 리소스 정리

**관련 함수 체인**:
```
disconnectButton.click
  → BluetoothManager.disconnect()
    → state.characteristic.stopNotifications()
    → state.bluetoothDevice.gatt.disconnect()
    → BluetoothManager.cleanup()
    → BluetoothManager.updateConnectionStatus()
```

#### `gattserverdisconnected`
**위치**: `bluetooth.js:26`
**트리거**: BLE 장치 연결 끊김
**핸들러**: `BluetoothManager.onDeviceDisconnected()`
**동작**: 자동 연결 해제 처리

**관련 함수 체인**:
```
gattserverdisconnected
  → BluetoothManager.onDeviceDisconnected()
    → BluetoothManager.updateConnectionStatus()
    → BluetoothManager.cleanup()
    → Logger.add()
```

#### `characteristicvaluechanged`
**위치**: `bluetooth.js:39-42`
**트리거**: BLE 특성 값 변경 (데이터 수신)
**핸들러**: `BluetoothManager.handleRxData()`
**동작**: 수신 데이터 처리

**관련 함수 체인**:
```
characteristicvaluechanged
  → BluetoothManager.handleRxData()
    → TextDecoder.decode()
    → BluetoothManager.processReceivedData()
      → state.pendingResolve()
      → clearTimeout()
```

### 2. 프로그램 실행 관련 이벤트

#### `runButton.click`
**위치**: `main.js:138-151`
**트리거**: 실행 버튼 클릭
**핸들러**: 익명 async 함수
**동작**: Blockly 워크스페이스 실행

**관련 함수 체인**:
```
runButton.click
  → validateConnection()
  → CommandExecutor.executeWorkspace()
    → CommandExecutor.processBlock() (재귀)
      → CommandExecutor.evaluateValueBlock()
      → BluetoothManager.sendData()
        → state.characteristic.writeValueWithResponse()
        → BluetoothManager.delay()
      → Logger.add()
```

**전제 조건**:
- BLE 연결 상태
- `state.isExecuting === false`

**에러 처리**: try-catch로 에러 처리 및 alert 표시

### 3. 파일 관리 관련 이벤트

#### `saveButton.click`
**위치**: `main.js:153-165`
**트리거**: 저장 버튼 클릭
**핸들러**: 익명 함수
**동작**: Blockly 워크스페이스를 XML 파일로 저장

**관련 함수 체인**:
```
saveButton.click
  → Blockly.Xml.workspaceToDom()
  → Blockly.utils.xml.domToText()
  → Blob 생성
  → 다운로드 링크 생성 및 클릭
  → Logger.add()
```

**사용자 입력**: `prompt()`로 파일명 입력

#### `loadButton.click`
**위치**: `main.js:167-169`
**트리거**: 불러오기 버튼 클릭
**핸들러**: 익명 함수
**동작**: 파일 선택 대화상자 열기

**관련 함수 체인**:
```
loadButton.click
  → fileInput.click()
    → (파일 선택 후 'change' 이벤트 트리거)
```

#### `fileInput.change`
**위치**: `main.js:171-191`
**트리거**: 파일 선택
**핸들러**: 익명 함수
**동작**: XML 파일을 읽어 Blockly 워크스페이스 복원

**관련 함수 체인**:
```
fileInput.change
  → FileReader.readAsText()
  → FileReader.onload
    → Blockly.utils.xml.textToDom()
    → workspace.clear()
    → Blockly.Xml.domToWorkspace()
    → Logger.add()
```

**에러 처리**: try-catch로 유효하지 않은 XML 처리

### 4. UI 관련 이벤트

#### `clearLogBtn.click`
**위치**: `main.js:130`
**트리거**: 로그 지우기 버튼 클릭
**핸들러**: `Logger.clear()`
**동작**: 모든 로그 제거

**관련 함수 체인**:
```
clearLogBtn.click
  → Logger.clear()
    → elements.logContent.innerHTML = ''
```

#### `dashboardButton.click`
**위치**: `main.js:135`
**트리거**: 대시보드 버튼 클릭
**핸들러**: `toggleDashboard()`
**동작**: 블록코딩/대시보드 모드 전환

**관련 함수 체인**:
```
dashboardButton.click
  → toggleDashboard()
    → (BLE 연결 확인)
    → DOM display 속성 변경
    → 버튼 활성화/비활성화
    → Logger.add()
```

### 5. 페이지 수명 주기 이벤트

#### `window.beforeunload`
**위치**: `main.js:193-197`
**트리거**: 페이지 닫기/새로고침
**핸들러**: 익명 함수
**동작**: BLE 연결 해제

**관련 함수 체인**:
```
beforeunload
  → (연결 상태 확인)
  → BluetoothManager.disconnect()
```

**목적**: 리소스 정리 및 깔끔한 연결 종료

#### `DOMContentLoaded`
**위치**: `main.js:217-220`
**트리거**: DOM 로드 완료
**핸들러**: `main()`
**동작**: 애플리케이션 초기화

**관련 함수 체인**:
```
DOMContentLoaded
  → main()
    → initializeBlockly()
    → initializeEventListeners()
    → BluetoothManager.updateConnectionStatus()
    → Logger.add()
```

### 6. Dashboard 이벤트 (dashboard.html)

#### `showTab(tabName)` 트리거 이벤트
**위치**: `dashboard.html:738-749`
**트리거**: 탭 버튼 클릭
**핸들러**: `showTab()`
**동작**: 탭 전환

#### `saveConfig(configType)` 트리거 이벤트
**위치**: `dashboard.html:752-799`
**트리거**: 저장 버튼 클릭
**핸들러**: `saveConfig()`
**동작**: 설정을 `localStorage`에 저장

#### `loadDefaultConfig(configType)` 트리거 이벤트
**위치**: `dashboard.html:802-814`
**트리거**: 기본값 복원 버튼 클릭
**핸들러**: `loadDefaultConfig()`
**동작**: 기본 설정값 복원

#### `quickCommand(command)` 트리거 이벤트
**위치**: `dashboard.html:817-836`
**트리거**: 빠른 제어 버튼 클릭
**핸들러**: `quickCommand()`
**동작**: 빠른 명령 실행 (현재는 로그만 기록)

#### `runDiagnostic(type)` 트리거 이벤트
**위치**: `dashboard.html:839-845`
**트리거**: 진단 버튼 클릭
**핸들러**: `runDiagnostic()`
**동작**: 진단 실행 (시뮬레이션)

#### `startCalibration()` 트리거 이벤트
**위치**: `dashboard.html:848-852`
**트리거**: 캘리브레이션 버튼 클릭
**핸들러**: `startCalibration()`
**동작**: 캘리브레이션 시작 (현재는 로그만 기록)

#### `updateDashboard()` 타이머 이벤트
**위치**: `dashboard.html:861-874`, `888`
**트리거**: 3초 주기 타이머
**핸들러**: `updateDashboard()`
**동작**: 대시보드 데이터 실시간 업데이트

#### `max-speed` input 이벤트
**위치**: `dashboard.html:877-879`
**트리거**: 슬라이더 값 변경
**핸들러**: 익명 함수
**동작**: 슬라이더 값 표시 업데이트

---

## 데이터 흐름

### 1. 연결 흐름

```
사용자 클릭
  ↓
connectButton.click 이벤트
  ↓
BluetoothManager.connect()
  ↓
navigator.bluetooth.requestDevice()
  ↓
사용자 장치 선택 (PicoBLE, HMSoft, BT05)
  ↓
GATT 서버 연결
  ↓
UART 서비스 획득 (UUID: 0000ffe0-...)
  ↓
UART 특성 획득 (UUID: 0000ffe1-...)
  ↓
알림 활성화 또는 주기적 읽기 시작
  ↓
state 객체 업데이트
  ↓
UI 업데이트 (버튼, 상태 텍스트)
  ↓
Logger에 연결 성공 로그
```

### 2. 명령 실행 흐름

```
사용자가 블록 배치
  ↓
runButton.click 이벤트
  ↓
validateConnection() 체크
  ↓
CommandExecutor.executeWorkspace()
  ↓
최상위 블록 순회
  ↓
CommandExecutor.processBlock() (재귀)
  ↓
블록 타입별 처리:
  - 값 블록: evaluateValueBlock()
  - 제어 블록: 조건/반복 처리
  - 명령 블록: BLE 명령 생성
  ↓
BluetoothManager.sendData(command)
  ↓
TextEncoder로 인코딩
  ↓
20바이트 청크로 분할
  ↓
각 청크를 writeValueWithResponse()
  ↓
100ms 대기 (청크 간)
  ↓
응답 대기 (Promise, 타임아웃 20초)
  ↓
characteristicvaluechanged 이벤트
  ↓
handleRxData() → processReceivedData()
  ↓
Promise resolve
  ↓
500ms 대기 (Pico 처리 시간)
  ↓
다음 블록 처리
```

### 3. 데이터 수신 흐름

```
Pico 장치에서 데이터 전송
  ↓
characteristicvaluechanged 이벤트
  ↓
handleRxData(event)
  ↓
TextDecoder로 디코딩
  ↓
processReceivedData(receivedData)
  ↓
에코 또는 응답 확인
  ↓
state.variables['last_response'] 업데이트
  ↓
대기 중인 Promise 있으면 resolve
  ↓
타임아웃 해제
  ↓
Logger에 수신 로그 (디버그 모드)
```

### 4. 변수 관리 흐름

```
assign_variable 블록 실행
  ↓
processBlock() 처리
  ↓
변수 ID → 변수 이름 변환
  ↓
evaluateValueBlock()로 값 평가
  ↓
state.variables[varName] = value
  ↓
Logger에 변수 할당 로그
  ↓

variables_get 블록 평가
  ↓
evaluateValueBlock() 호출
  ↓
변수 ID → 변수 이름 변환
  ↓
state.variables[varName] 조회
  ↓
값 반환 (없으면 '0')
```

### 5. 파일 저장/불러오기 흐름

**저장**:
```
saveButton.click
  ↓
Blockly.Xml.workspaceToDom(workspace)
  ↓
Blockly.utils.xml.domToText(xml)
  ↓
Blob 생성 (type: 'text/xml')
  ↓
다운로드 링크 생성
  ↓
{fileName}.xml 다운로드
  ↓
Logger에 저장 로그
```

**불러오기**:
```
loadButton.click
  ↓
fileInput.click()
  ↓
사용자 파일 선택
  ↓
fileInput.change 이벤트
  ↓
FileReader.readAsText(file)
  ↓
FileReader.onload
  ↓
Blockly.utils.xml.textToDom(xmlText)
  ↓
workspace.clear()
  ↓
Blockly.Xml.domToWorkspace(xml, workspace)
  ↓
Logger에 불러오기 로그
```

---

## 부록

### BLE 명령 프로토콜

| 명령 | 형식 | 예시 | 설명 |
|------|------|------|------|
| 램프 설정 | `[v0 v1 v2 v3 v4]` | `[1.0 0.5 0.0 0.5 1.0]` | 5개 LED 밝기 (0.0-1.0) |
| 메시지 전송 | `MSG,{문자열}` | `MSG,Hello` | 문자열 전송 |
| 부저 | `BUZZER_ON,{주파수},{시간}` | `BUZZER_ON,440,2` | 440Hz, 2초 |
| 전진(시간) | `tFORWARD,{시간}` | `tFORWARD,1.5` | 1.5초 전진 |
| 후진(시간) | `tBACKWARD,{시간}` | `tBACKWARD,1.0` | 1.0초 후진 |
| 우회전(시간) | `tRIGHT,{시간}` | `tRIGHT,0.5` | 0.5초 우회전 |
| 좌회전(시간) | `tLEFT,{시간}` | `tLEFT,0.5` | 0.5초 좌회전 |
| 계속 전진 | `FORWARD` | `FORWARD` | 멈출 때까지 전진 |
| 계속 후진 | `BACKWARD` | `BACKWARD` | 멈출 때까지 후진 |
| 계속 좌회전 | `LEFT` | `LEFT` | 멈출 때까지 좌회전 |
| 계속 우회전 | `RIGHT` | `RIGHT` | 멈출 때까지 우회전 |
| 정지 | `STOP` | `STOP` | 모든 동작 중지 |
| 대기 | `SLEEP,{시간}` | `SLEEP,2` | 2초 대기 |
| 장치 확인 | `READY` | `READY` | 장치 상태 확인 |
| 거리 측정 | `DISTANCE` | `DISTANCE` | 초음파 센서 거리 측정 |
| 자기장 측정 | `MAGNET` | `MAGNET` | 자기 센서 측정 |

### 주요 상수 값

| 상수 | 값 | 의미 |
|------|-----|------|
| MAX_CHUNK_SIZE | 20 | BLE 전송 청크 크기 (바이트) |
| COMMAND_DELAY | 500 | 명령 간 지연 (ms) |
| CHUNK_DELAY | 100 | 청크 간 지연 (ms) |
| READ_INTERVAL | 1000 | 주기적 읽기 간격 (ms) |
| RESPONSE_TIMEOUT | 20000 | 응답 타임아웃 (ms) |
| MAX_LOOPS | 100 | 반복문 최대 횟수 |

### 에러 코드 및 처리

| 에러 메시지 | 원인 | 해결 방법 |
|------------|------|-----------|
| `이 브라우저는 Web Bluetooth API를 지원하지 않습니다` | 브라우저 미지원 | Chrome 56+ 또는 Edge 79+ 사용 |
| `아레스 탐사선이 BLE로 연결되어 있지 않습니다` | BLE 미연결 | 연결 버튼 클릭하여 장치 연결 |
| `Response timeout--` | 응답 타임아웃 | 장치 상태 확인, 재연결 시도 |
| `이미 연결 시도 중입니다` | 중복 연결 시도 | 이전 연결 시도 완료 대기 |
| `먼저 피코를 BLE로 연결해주세요` | 명령 실행 전 미연결 | BLE 연결 후 실행 |

---

## 라이선스 및 저작권

**프로젝트명**: ARES 화성 탐사선 제어 시스템
**개발사**: 코리아사이언스
**문서 버전**: 1.0.0
**최종 수정일**: 2025-10-10

---

이 문서는 ARES 화성 탐사선 제어 시스템의 모든 API와 이벤트 리스너를 상세히 설명합니다. 추가 질문이나 기술 지원이 필요한 경우 개발팀에 문의하시기 바랍니다.
