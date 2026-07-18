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
    # spin_time 근거(2026-07-15 실측, Jihun): 0.33s 는 캠 한 사이클을 넘겨
    # 모듈이 엇박으로 끝나 정렬이 틀어지고 한 번 호출에 2발이 격발됨
    # → 0.1s(100ms) 로 낮춰 150연발 무오작동·정렬 정상 확인.
    # power 는 완구 원설계(배터리 직결=100% duty)에 맞춘 최대 duty 유지.
    def fire_once(self, power=65535, spin_time=0.1, cooldown_ms=250):
        try:
            # 1단계 파워 업
            self.soft_start(power)
            # 2단계 스핀시간 확보
            sleep(spin_time)
        finally:
            self.stop()          # 예외가 나도 모터는 멈춘다

        sleep(cooldown_ms / 1000)  # ← 여기서 쿨다운 소비 (초 단위 변환 주의)
