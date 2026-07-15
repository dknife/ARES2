# ==========================
# ks_gun.py — 발사 모터 제어 (캠 감지판)
# ==========================
# 이 총은 130 DC 모터 + 웜기어로 스프링을 압축/격발하는 구조이며,
# 원래 완구에는 "한 발마다 캠이 회전을 끊는" 자동 정지 기구가 있다.
# 자동화하면서 그 캠 접점이 우회되어, 정지 타이밍을 spin_time 타이머가
# 대신하다 보니 사이클이 어긋나 둘째 발부터 스톨(삑)이 났다.
#
# 해결: 캠 접점을 Pico 입력 핀으로 끌어와 "한 사이클 완료"를 감지하고
#       그때 즉시 정지한다(위치 기반). 배터리 전압이 변해도 정확하다.
#
# 모드:
#   - cam_pin 지정   -> 캠 감지 모드 (권장)
#   - cam_pin 미지정 -> 시간 기반 폴백 모드 (배선 전 임시)

from machine import Pin, PWM
from time import sleep_ms, ticks_ms, ticks_diff

try:
    from pins import GUN_PIN
except ImportError:
    GUN_PIN = None

_DUTY_MAX = 65535


def _clamp(value, lo, hi):
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


class KSGun:
    """130 DC 모터(웜기어 스프링 격발) 한 발 제어."""

    def __init__(self, pin_num=None, freq=1000, min_start_power=20000,
                 cam_pin=None, cam_home_value=0, cam_pull=Pin.PULL_UP,
                 debounce_ms=5):
        """
        pin_num         : 발사 모터 PWM 핀. None이면 pins.GUN_PIN.
        freq            : PWM 주파수. 1kHz=가청음, 드라이버 허용 시 20000↑=정숙.
        min_start_power : 기동 최소 듀티(스톨 방지 바닥값).
        cam_pin         : 캠 접점(리미트 스위치) 입력 핀. None이면 시간 기반 폴백.
        cam_home_value  : 캠이 '홈(정지)' 위치일 때 핀 판독값(0 또는 1).
                          풀업+스위치→GND면 눌림=0. 실측으로 확정할 것.
        cam_pull        : 캠 입력 풀 설정(Pin.PULL_UP / PULL_DOWN / None).
        debounce_ms     : 접점 채터링 제거용 재확인 지연.
        """
        if pin_num is None:
            pin_num = GUN_PIN
        if pin_num is None:
            raise ValueError("GUN_PIN이 설정되지 않았습니다. pin_num을 지정하세요.")

        self.gun = PWM(Pin(pin_num))
        self.gun.freq(freq)
        self.gun.duty_u16(0)

        self.min_start_power = _clamp(int(min_start_power), 0, _DUTY_MAX)

        # 캠 입력(있을 때만)
        if cam_pin is not None:
            self.cam = Pin(cam_pin, Pin.IN, cam_pull)
        else:
            self.cam = None
        self.cam_home_value = 1 if cam_home_value else 0
        self.debounce_ms = debounce_ms

        self._busy = False
        self._last_fire_ms = None

    # ---- 기본 제어 ----
    def power(self, value):
        self.gun.duty_u16(_clamp(int(value), 0, _DUTY_MAX))

    def stop(self):
        self.gun.duty_u16(0)

    def deinit(self):
        try:
            self.stop()
        finally:
            self.gun.deinit()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.deinit()

    # ---- 램프 ----
    def soft_start(self, target_power, duration_ms=150, steps=8):
        target = _clamp(int(target_power), 0, _DUTY_MAX)
        floor = min(self.min_start_power, target)
        step_delay = max(1, duration_ms // steps)
        for i in range(1, steps + 1):
            self.power(floor + (target - floor) * i // steps)
            sleep_ms(step_delay)

    # ---- 캠 감지 유틸 ----
    def cam_raw(self):
        """현재 캠 핀 값(0/1)을 그대로 반환. cam_home_value 실측용."""
        return self.cam.value() if self.cam is not None else None

    def _wait_cam(self, target, timeout_ms):
        """캠이 target 값으로 안정될 때까지 대기. 타임아웃이면 False."""
        start = ticks_ms()
        while ticks_diff(ticks_ms(), start) < timeout_ms:
            if self.cam.value() == target:
                sleep_ms(self.debounce_ms)          # 디바운스
                if self.cam.value() == target:      # 재확인
                    return True
            sleep_ms(1)
        return False

    # ---- 쿨다운 ----
    def cooldown_remaining(self, cooldown_ms):
        if self._last_fire_ms is None:
            return 0
        remain = cooldown_ms - ticks_diff(ticks_ms(), self._last_fire_ms)
        return remain if remain > 0 else 0

    def ready(self, cooldown_ms=250):
        return (not self._busy) and self.cooldown_remaining(cooldown_ms) == 0

    # ---- 발사 ----
    # 기본값 근거(2026-07-14): 이 완구는 원래 배터리 직결(=100% duty) 설계라 최대
    # duty 가 설계 토크다. 76%(50000)는 배터리 전압이 처지면 스프링 압축에서 스톨
    # ('삑', 13일차 전원 출력 부족 증상)할 수 있다. 캠 접점이 기구 밖으로 나오지 않아
    # (+/- 모터선만 인출) 캠 모드는 불가 — 시간 폴백에서 실측 검증된 65535 x 330ms 사용.
    # (2026-07-15) : 스핀값이 33일 경우 fire_once함수에서 모듈이 2번 실행됨
    # --> 따라서 spin_time_ms값을 330에서 100으로 변경후 50회 실행 시 오작동이 없는 것을 확인
    def fire_once(self, power=65535, spin_time_ms=100, cooldown_ms=250,
                  max_cycle_ms=1500, wait_cooldown=True):
        """한 발 발사.

        반환:
          True  = 한 사이클(발사) 정상 완료
          False = 재진입/쿨다운으로 건너뜀, 또는 캠 모드에서 타임아웃(잼 의심)

        캠 모드: '홈 이탈 -> 홈 복귀'로 한 사이클을 감지해 즉시 정지.
                 캠이 안 움직이거나 안 돌아오면 max_cycle_ms에서 안전 중단.
        폴백 모드(cam 없음): spin_time_ms 동안 회전 후 정지(임시).
        """
        if self._busy:
            return False
        remain = self.cooldown_remaining(cooldown_ms)
        if remain > 0:
            if not wait_cooldown:
                return False
            sleep_ms(remain)

        self._busy = True
        ok = False
        try:
            self.soft_start(power)
            if self.cam is not None:
                not_home = 1 - self.cam_home_value
                # 1) 시작 시 홈에 있으므로, 먼저 홈을 벗어날 때까지
                if self._wait_cam(not_home, max_cycle_ms):
                    # 2) 다시 홈으로 복귀 = 한 사이클 완료
                    ok = self._wait_cam(self.cam_home_value, max_cycle_ms)
                # ok=False면 캠 신호 이상(잼/단선/스톨) -> finally에서 정지
            else:
                sleep_ms(spin_time_ms)   # 폴백: 시간 기반
                ok = True
        finally:
            self.stop()
            self._last_fire_ms = ticks_ms()
            self._busy = False
        return ok


# ==========================
# [설정 & 사용 예시]
# ==========================
# 1) 캠 홈 값 실측: 총을 정지 상태로 두고
#    g = KSGun(pin_num=..., cam_pin=15)
#    print(g.cam_raw())    # 이 값이 cam_home_value
#
# 2) 캠 모드로 사용:
#    g = KSGun(cam_pin=15, cam_home_value=0)  # 실측값 반영
#    g.fire_once()   # 캠이 한 바퀴 돌아 홈에 오면 자동 정지
#    g.fire_once()   # 둘째 발도 동일하게 정확히 한 사이클
#
# 3) 캠 배선 전 임시(시간 기반):
#    g = KSGun()                      # cam_pin 없음
#    g.fire_once(spin_time_ms=500)    # 실측으로 사이클 시간 튜닝
#
# max_cycle_ms: 한 사이클 최대 소요시간보다 넉넉히(잼 감지 안전 여유).
#               웜기어는 느리므로 실측 사이클 시간의 약 2배로 잡으면 무난.