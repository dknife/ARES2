# ==========================
# [모듈 가져오기]
# ==========================
from machine import Pin, PWM
from system_config import sys_config
from pins import SERVO_RIGHT_PIN, SERVO_LEFT_PIN

# 연속회전 서보/전원 안정성을 위해 극단 펄스폭을 피한다.
MIN_DUTY = 2500
MAX_DUTY = 7500
STOP_ANGLE = 90

# ==========================
# [클래스 정의]
# ==========================
class KSWheel:
    # ==========================
    # [초기화]
    # ==========================
    def __init__(self):
        # pins.py에서 서보 핀 설정 가져오기 (오른쪽, 왼쪽)
        self.servo_pins = [SERVO_RIGHT_PIN, SERVO_LEFT_PIN]
        # [오른쪽, 왼쪽] 순서. 중립값은 기체마다 달라 설정 파일에서 조정한다.
        self.neutral_duties = [
            self._get_int_config('right_neutral_duty', 5000),
            self._get_int_config('left_neutral_duty', 5000)
        ]
        self.min_drive_speeds = [
            self._get_percent_config('right_min_drive', 0),
            self._get_percent_config('left_min_drive', 0)
        ]
        # PWM 객체 저장용 리스트
        self.servos = []
        # 설정에서 캘리브레이션 팩터 로드
        self.left_factor = sys_config.get('left_calibration')
        self.right_factor = sys_config.get('right_calibration')
        
        # 서보 초기화
        for i, pin in enumerate(self.servo_pins):
            pwm = PWM(Pin(pin))
            pwm.freq(50)  # 서보용 50 Hz
            self.servos.append(pwm)
            self.set_angle(i, 90)  # 정지 상태로 설정 (90도)

    def _get_int_config(self, key, default):
        value = sys_config.get(key)
        if value is None:
            return default
        try:
            return int(value)
        except Exception:
            return default

    def _get_percent_config(self, key, default):
        value = self._get_int_config(key, default)
        value = max(0, min(100, value))
        return value / 100.0
    
    # ==========================
    # [설정]
    # ==========================
    def update_factors(self, left, right):
        # 캘리브레이션 팩터 업데이트
        self.left_factor = int(left)
        self.right_factor = int(right)
        # 값 범위 제한
        if self.left_factor > 100: self.left_factor = 100
        if self.right_factor > 100: self.right_factor = 100

    def reload_config(self):
        """설정 파일에서 바퀴 보정값을 다시 읽는다."""
        self.left_factor = self._get_int_config('left_calibration', 100)
        self.right_factor = self._get_int_config('right_calibration', 100)
        self.neutral_duties = [
            self._get_int_config('right_neutral_duty', 5000),
            self._get_int_config('left_neutral_duty', 5000)
        ]
        self.min_drive_speeds = [
            self._get_percent_config('right_min_drive', 0),
            self._get_percent_config('left_min_drive', 0)
        ]

    # ==========================
    # [저수준 제어]
    # ==========================
    def set_angle(self, wheel_idx, angle, speed=1.0):
        # 서보 각도(0-180)를 속도 스케일링 적용한 PWM 듀티로 매핑
        angle = max(0, min(180, angle))
        speed = max(0.0, min(1.0, speed))
        neutral_duty = self.neutral_duties[wheel_idx]
        
        if angle == STOP_ANGLE or speed <= 0:
            duty = neutral_duty
        else:
            # 속도에 캘리브레이션 팩터 적용
            actual_speed = speed
            if speed > 0:  # 움직일 때만 적용
                if wheel_idx == 0:  # 오른쪽
                    actual_speed = speed * (self.right_factor / 100.0)
                elif wheel_idx == 1:  # 왼쪽
                    actual_speed = speed * (self.left_factor / 100.0)
                actual_speed = max(actual_speed, self.min_drive_speeds[wheel_idx])
                actual_speed = max(0.0, min(1.0, actual_speed))

            # 속도 기반 각도 스케일링
            scaled_angle = STOP_ANGLE + (angle - STOP_ANGLE) * actual_speed
            # 각도를 듀티 사이클로 매핑
            duty = int(MIN_DUTY + (MAX_DUTY - MIN_DUTY) * scaled_angle / 180)
            
        # 듀티 사이클 적용
        self.servos[wheel_idx].duty_u16(duty)

    # ==========================
    # [이동 메서드]
    # ==========================
    def forward(self, speed=0.1): 
        # 오른쪽 휠 전진 (0도)
        self.set_angle(0, 0, speed)  
        # 왼쪽 휠 전진 (180도)
        self.set_angle(1, 180, speed) 

    def backward(self, speed=0.1):
        # 오른쪽 휠 후진 (180도)
        self.set_angle(0, 180, speed) 
        # 왼쪽 휠 후진 (0도)
        self.set_angle(1, 0, speed)   

    def turn_right(self, speed=0.1):
        # 오른쪽 휠 후진
        self.set_angle(0, 180, speed) 
        # 왼쪽 휠 전진
        self.set_angle(1, 180, speed) 

    def turn_left(self, speed=0.1):
        # 오른쪽 휠 전진
        self.set_angle(0, 0, speed)   
        # 왼쪽 휠 후진
        self.set_angle(1, 0, speed)   

    def stop(self):
        # 양쪽 휠 정지 (90도)
        self.set_angle(0, 90)
        self.set_angle(1, 90)
