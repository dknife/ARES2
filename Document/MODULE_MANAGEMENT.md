# ARES 로버 모듈 관리 및 핀 설정 가이드

## 개요

ARES 펌웨어는 **선택적 모듈 로드** 기능을 지원합니다. 일부 하드웨어 모듈이 없거나 비활성화되어 있어도 펌웨어가 안정적으로 작동합니다.

---

## 📋 활성화/비활성화 가능한 모듈

| 모듈 | 설정 키 | 기본값 | 설명 |
|------|--------|--------|------|
| 서보 모터 | `enable_wheel` | 1 | 좌우 서보 모터 (바퀴 제어) |
| DC 모터 | `enable_dcmotor` | 1 | 메인 DC 모터 (속도 제어) |
| 부저 | `enable_buzzer` | 1 | 부저 (소리/음악) |
| 거리 센서 | `enable_distance` | 1 | 초음파 거리 센서 |
| 자기장 센서 | `enable_magsensor` | 1 | 자기장 감지 센서 |
| LED | `enable_leds` | 1 | 5개 LED 배열 |
| 총 | `enable_gun` | 1 | BB탄 발사기 |
| OLED | `enable_oled` | 1 | OLED 디스플레이 |

---

## 🔧 모듈별 기본 핀 설정

| 모듈 | 핀 설정 키 | 기본 핀 | 설명 |
|------|-----------|--------|------|
| **서보** | `pin_wheel_left` | GP13 | 좌측 서보 |
| | `pin_wheel_right` | GP12 | 우측 서보 |
| **DC 모터** | `pin_dcmotor_dir` | GP8 | 방향 제어 |
| | `pin_dcmotor_pwm` | GP9 | PWM (속도) |
| **부저** | `pin_buzzer` | GP15 | 부저 |
| **거리 센서** | `pin_distance_trig` | GP6 | TRIG 신호 |
| | `pin_distance_echo` | GP7 | ECHO 신호 |
| **자기장 센서** | `pin_magsensor` | GP26 | 아날로그 입력 |
| **총** | `pin_gun` | GP22 | 발사 제어 |
| **LED** | `pin_leds` | 20,19,18,17,16 | 5개 LED (쉼표로 구분) |
| **OLED** | `pin_i2c_sda` | GP4 | I2C 데이터 |
| | `pin_i2c_scl` | GP5 | I2C 클럭 |

---

## 📡 명령어 사용법

### 1. 모듈 상태 조회

**명령어**: `GET_MODULES`

**응답 형식**:
```
MODULES,wheel:ON,dcmotor:ON,buzzer:ON,distance:ON,magsensor:ON,leds:ON,gun:ON,oled:ON
```

**예시**:
```
명령: GET_MODULES
응답: MODULES,wheel:ON,dcmotor:ON,buzzer:OFF,distance:ON,magsensor:ON,leds:ON,gun:OFF,oled:ON
```

### 2. 모듈 활성화/비활성화

**명령어**: `SET_MODULE,모듈이름,0/1`

- `1` = 활성화
- `0` = 비활성화

**응답 형식**:
```
MODULE_SET,모듈이름,ON/OFF
```

**예시**:
```
명령: SET_MODULE,buzzer,0    # 부저 비활성화
응답: MODULE_SET,buzzer,OFF

명령: SET_MODULE,leds,1      # LED 활성화
응답: MODULE_SET,leds,ON
```

### 3. 핀 번호 변경

**명령어**: `SET_PIN,핀이름,핀번호`

핀이름 형식: `모듈_기능` (예: `wheel_left`, `dcmotor_dir`)

**응답 형식**:
```
PIN_SET,핀이름,핀번호
```

**예시**:
```
명령: SET_PIN,wheel_left,11    # 좌측 서보를 GP11로 변경
응답: PIN_SET,wheel_left,11

명령: SET_PIN,buzzer,14        # 부저를 GP14로 변경
응답: PIN_SET,buzzer,14
```

**사용 가능한 핀 이름**:
- `wheel_left`, `wheel_right`
- `dcmotor_dir`, `dcmotor_pwm`
- `buzzer`
- `distance_trig`, `distance_echo`
- `magsensor`
- `gun`
- `i2c_sda`, `i2c_scl`

---

## 💾 설정 파일 (system.json)

설정은 자동으로 Pico의 `system.json` 파일에 저장됩니다.

**예시 파일 내용**:
```json
{
    "max_speed": 80,
    "collision_dist": 10,
    "auto_stop": 1,
    "device_name": "ARES",
    "left_calibration": 100,
    "right_calibration": 100,
    "enable_wheel": 1,
    "enable_dcmotor": 1,
    "enable_buzzer": 0,
    "enable_distance": 1,
    "enable_magsensor": 1,
    "enable_leds": 1,
    "enable_gun": 0,
    "enable_oled": 1,
    "pin_wheel_left": 13,
    "pin_wheel_right": 12,
    "pin_dcmotor_dir": 8,
    "pin_dcmotor_pwm": 9,
    "pin_buzzer": 15,
    "pin_distance_trig": 6,
    "pin_distance_echo": 7,
    "pin_magsensor": 26,
    "pin_gun": 22,
    "pin_leds": "20,19,18,17,16",
    "pin_i2c_sda": 4,
    "pin_i2c_scl": 5
}
```

---

## 🚀 사용 시나리오

### 시나리오 1: 부저가 없는 경우

```
# 부저 비활성화
명령: SET_MODULE,buzzer,0
응답: MODULE_SET,buzzer,OFF

# 부저 기능이 필요한 명령은 무시됨 (오류 없음)
명령: BUZZER_ON,440,500
응답: 0 (무시됨)
```

### 시나리오 2: 핀 충돌 해결

기존에 GP12를 다른 용도로 사용 중인 경우:

```
# 좌측 서보 핀을 GP11로 변경
명령: SET_PIN,wheel_right,11
응답: PIN_SET,wheel_right,11

# 펌웨어 재부팅 후 적용
```

### 시나리오 3: 특정 모듈만 활성화

최소 구성 (이동과 센서만 필요):

```
명령: SET_MODULE,buzzer,0
명령: SET_MODULE,gun,0
명령: SET_MODULE,leds,0
명령: GET_MODULES
응답: MODULES,wheel:ON,dcmotor:ON,buzzer:OFF,distance:ON,magsensor:ON,leds:OFF,gun:OFF,oled:ON
```

---

## ⚠️ 주의사항

1. **재부팅 필요**: 핀 설정 변경 후 펌웨어 재부팅 필요
   - 모듈 활성화/비활성화는 재부팅 필요 없음

2. **유효 핀 범위**: GP0 ~ GP28 (0~28)
   - 예약된 핀 (UART: GP0-1, I2C: GP4-5) 확인 필요

3. **설정 저장**: 모든 변경은 자동으로 `system.json` 저장됨

4. **하드웨어 안정성**: 
   - 모듈이 없는데 활성화 상태 = 오류 메시지 출력 후 무시
   - 펌웨어는 계속 작동

5. **LED 핀 문자열**: `pin_leds`는 쉼표로 구분된 문자열
   ```
   기본값: "20,19,18,17,16"
   ```

---

## 🔍 문제 해결

### "ERROR" 응답 받는 경우

- **PIN_SET,ERROR**: 유효하지 않은 핀 번호 (0-28 범위 확인)
- **MODULE_SET,ERROR**: 존재하지 않는 모듈 이름 (표 확인)

### 명령이 무시되는 경우

- 해당 모듈이 비활성화되어 있음
- `GET_MODULES` 명령으로 상태 확인

### 센서 읽기 실패

```
명령: DISTANCE
응답: DIST:ERROR    # 거리 센서가 비활성화되거나 초기화 실패
```

---

## 📚 관련 명령어

- `GET_SYS` - 시스템 설정 전체 조회
- `GET_STATUS` - 센서 상태 조회 (활성화된 모듈만)
- `PING` - 연결 확인
- `SYS_SET,speed,dist,stop,name` - 시스템 설정 변경

---

## 개발자 노트

### hardware.py 로드 과정

```python
if sys_config.is_module_enabled('wheel'):
    try:
        from wheel import KSWheel
        self.wheel = KSWheel()
    except Exception as e:
        print(f"휠 초기화 실패: {e}")
        self.wheel = None
```

모든 모듈이 동일한 방식으로 처리됩니다:
- 활성화 여부 확인
- try-except로 안전한 로드
- 실패 시 `None`으로 설정
- 사용 전 `None` 체크

### process_data.py 사용 전 체크

```python
def _handle_continuous_wheel(self, direction):
    if not robot.wheel:
        return 0
    # ... 나머지 코드
```

---

## 업데이트 이력

| 버전 | 날짜 | 변경사항 |
|------|------|---------|
| 1.0 | 2026-01-20 | 초기 모듈 관리 기능 추가 |

