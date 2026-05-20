# DC 모터 컨트롤러
# H-브릿지 IN1/IN2를 모두 PWM으로 구동하여 양방향 brake-modulated 대칭 출력.
# 한쪽을 항상 HIGH로 고정하고 반대쪽을 PWM_MAX-speed로 변조 → drive↔brake 변조
# (coast 구간이 없어 시동 데드존이 사라지고 두 방향 토크 곡선이 같다).

from machine import Pin, PWM
from pins import DCMOTOR_DIR_PIN, DCMOTOR_PWM_PIN

# 핀 (이름은 레거시 호환 유지, 두 핀 모두 PWM 채널로 사용)
# GP8 = PWM4A, GP9 = PWM4B — 같은 슬라이스라 주파수 동기화 자연스러움
IN1_PIN = DCMOTOR_DIR_PIN
IN2_PIN = DCMOTOR_PWM_PIN

# PWM 설정
PWM_FREQUENCY = 20000
PWM_STOP = 0
PWM_MAX = 65535

# 디버그 모드
DEBUG_MOTOR = False


class KSDCMotor:
    """DC 모터 컨트롤러 (양방향 brake-modulated H-브릿지)."""

    def __init__(self):
        if DEBUG_MOTOR:
            print(f"[DCMotor] 초기화: IN1=GP{IN1_PIN}, IN2=GP{IN2_PIN} (양쪽 PWM)")

        self.IN1 = PWM(Pin(IN1_PIN))
        self.IN1.freq(PWM_FREQUENCY)
        self.IN1.duty_u16(PWM_STOP)

        self.IN2 = PWM(Pin(IN2_PIN))
        self.IN2.freq(PWM_FREQUENCY)
        self.IN2.duty_u16(PWM_STOP)

        self._is_running = False

        if DEBUG_MOTOR:
            print("[DCMotor] 초기화 완료")

    def dc_forward(self, speed):
        """전진: IN1 고정 HIGH, IN2를 PWM_MAX-speed로 변조 → brake↔drive."""
        if DEBUG_MOTOR:
            print(f"[DCMotor] 전진: speed={speed}")
        if speed <= 0:
            self.dc_stop()
            return
        self.IN1.duty_u16(PWM_MAX)
        self.IN2.duty_u16(PWM_MAX - speed)
        self._is_running = True

    def dc_backward(self, speed):
        """후진: IN2 고정 HIGH, IN1을 PWM_MAX-speed로 변조 → brake↔drive (반대 방향)."""
        if DEBUG_MOTOR:
            print(f"[DCMotor] 후진: speed={speed}")
        if speed <= 0:
            self.dc_stop()
            return
        self.IN1.duty_u16(PWM_MAX - speed)
        self.IN2.duty_u16(PWM_MAX)
        self._is_running = True

    def dc_stop(self):
        """정지 (coast: 둘 다 LOW)."""
        if DEBUG_MOTOR:
            print("[DCMotor] 정지")
        self.IN1.duty_u16(PWM_STOP)
        self.IN2.duty_u16(PWM_STOP)
        self._is_running = False

    def is_running(self):
        """실행 상태 확인"""
        return self._is_running
