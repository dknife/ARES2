# DC 모터 컨트롤러

from machine import Pin, PWM
from pins import DCMOTOR_DIR_PIN, DCMOTOR_PWM_PIN

# 핀 설정
DIR_PIN = DCMOTOR_DIR_PIN
PWM_PIN = DCMOTOR_PWM_PIN

# PWM 설정
PWM_FREQUENCY = 20000
PWM_STOP = 0
PWM_MAX = 65535

# 디버그 모드
DEBUG_MOTOR = False


class KSDCMotor:
    """DC 모터 컨트롤러 클래스"""
    
    def __init__(self):
        if DEBUG_MOTOR:
            print(f"[DCMotor] 초기화: DIR={DIR_PIN}, PWM={PWM_PIN}")
        
        # 방향 핀 초기화 (풀다운)
        self.DIR = Pin(DIR_PIN, Pin.OUT, value=0, pull=Pin.PULL_DOWN)
        
        # PWM 핀 초기화
        self.PWM_PIN = PWM(Pin(PWM_PIN))
        self.PWM_PIN.freq(PWM_FREQUENCY)
        self.PWM_PIN.duty_u16(PWM_STOP)
        
        # 상태 추적
        self._is_running = False
        
        if DEBUG_MOTOR:
            print("[DCMotor] 초기화 완료")

    def dc_forward(self, speed):
        """전진"""
        if DEBUG_MOTOR:
            print(f"[DCMotor] 전진: speed={speed}")
        self.DIR.value(1)
        self.PWM_PIN.duty_u16(speed)
        self._is_running = True

    def dc_backward(self, speed):
        """후진"""
        if DEBUG_MOTOR:
            print(f"[DCMotor] 후진: speed={speed}")
        self.DIR.value(0)
        self.PWM_PIN.duty_u16(speed)
        self._is_running = True

    def dc_stop(self):
        """정지"""
        if DEBUG_MOTOR:
            print("[DCMotor] 정지")
        self.PWM_PIN.duty_u16(PWM_STOP)
        self.DIR.value(0)
        self._is_running = False

    def is_running(self):
        """실행 상태 확인"""
        return self._is_running
