# ==========================
# [모듈 가져오기]
# ==========================
from machine import Pin, PWM
from time import sleep, ticks_ms, ticks_diff
from pins import GUN_PIN

# ==========================
# [클래스 정의]
# ==========================
class KSGun:
    # ==========================
    # [초기화]
    # ==========================
    def __init__(self, pin_num=None):
        # pins.py에서 총 핀 설정 가져오기
        if pin_num is None:
            pin_num = GUN_PIN
        # 총 모터용 PWM 초기화
        self.gun = PWM(Pin(pin_num))
        # 주파수를 1kHz로 설정
        self.gun.freq(1000)

    # ==========================
    # [기본 제어]
    # ==========================
    def power(self, value):
        # PWM 듀티 사이클 설정
        self.gun.duty_u16(value)

    def stop(self):
        # 모터 정지
        self.gun.duty_u16(0)

    # ==========================
    # [고급 제어]
    # ==========================
    def soft_start(self, target_power, duration_ms=150):
        """
        안전하게 목표 출력까지 램프업.
        """
        # 램프업 단계 수
        steps = 8
        # 단계별 지연 계산
        step_delay = duration_ms / steps / 1000

        for i in range(1, steps + 1):
            # 이 단계의 출력 계산
            p = int(target_power * (i / steps))
            # 출력 적용
            self.power(p)
            # 대기
            sleep(step_delay)

    # ==========================
    # [동작 메서드]
    # ==========================
    def fire_once(self, power=50000, spin_time=0.22, cooldown_ms=250):
        """
        한 발 발사.
        """
        # 1단계: 모터 램프업
        self.soft_start(power)

        # 2단계: 발사 시간 동안 회전
        sleep(spin_time)

        # 3단계: 정지
        self.stop()
