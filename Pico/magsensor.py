# ==========================
# [모듈 가져오기]
# ==========================
from machine import Pin
from pins import MAGSENSOR_PIN

# ==========================
# [클래스 정의]
# ==========================
class KSMagSensor:
    # ==========================
    # [초기화]
    # ==========================
    def __init__(self):
        # pins.py에서 자기장 센서 핀 설정 가져오기
        self.sensor = Pin(MAGSENSOR_PIN, Pin.IN, Pin.PULL_UP)

    # ==========================
    # [감지 메서드]
    # ==========================
    def detect(self):
        # 센서 값 읽기
        val = self.sensor.value()
        # Active low 로직 (자석 감지됨 -> 0)
        if val == 0:
            return 1  # 감지됨
        else:
            return 0  # 감지 안됨
