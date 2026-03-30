# ==========================
# [모듈 가져오기]
# ==========================
from machine import Pin, PWM
from time import sleep
from utime import sleep_ms
from system_config import sys_config
from pins import SERVO_RIGHT_PIN, SERVO_LEFT_PIN

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
        # 서보의 중립 듀티 사이클 (약 1.5ms)
        self.neutral_duties = [5000, 5000] 
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

    # ==========================
    # [저수준 제어]
    # ==========================
    def set_angle(self, wheel_idx, angle, speed=1.0):
        # 서보 각도(0-180)를 속도 스케일링 적용한 PWM 듀티로 매핑
        min_duty = 1000  # ~0.5 ms (최대 전진)
        max_duty = 9000  # ~2.5 ms (최대 후진)
        neutral_duty = self.neutral_duties[wheel_idx]
        
        if angle == 90:
            duty = neutral_duty
        else:
            # 속도에 캘리브레이션 팩터 적용
            actual_speed = speed
            if speed > 0:  # 움직일 때만 적용
                 if wheel_idx == 0:  # 오른쪽
                    actual_speed = speed * (self.right_factor / 100.0)
                 elif wheel_idx == 1:  # 왼쪽
                    actual_speed = speed * (self.left_factor / 100.0)

            # 속도 기반 각도 스케일링
            scaled_angle = 90 + (angle - 90) * actual_speed
            # 각도를 듀티 사이클로 매핑
            duty = int(min_duty + (max_duty - min_duty) * scaled_angle / 180)
            
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
