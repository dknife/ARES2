# ==========================
# [모듈 가져오기]
# ==========================
from machine import Pin, PWM
from time import sleep
from utime import sleep_ms
from pins import LED_PINS, MAIN_LED_PIN

# ==========================
# [클래스 정의]
# ==========================
class KSLeds:
    # ==========================
    # [초기화]
    # ==========================
    def __init__(self):
        # pins.py에서 LED 핀 설정 가져오기
        self.led_pins = LED_PINS
        # 각 LED에 PWM 초기화
        self.leds = [PWM(Pin(pin, Pin.OUT)) for pin in self.led_pins]
        for led in self.leds:
            # 깜빡임 방지를 위해 주파수를 20kHz로 설정
            led.freq(20000)
            
        # 메인 LED 초기화
        self.main_led = PWM(Pin(MAIN_LED_PIN, Pin.OUT))
        self.main_led.freq(20000)
        
        # 초기에 모든 LED 끄기
        self.leds_off()

    # ==========================
    # [기본 제어]
    # ==========================
    def leds_off(self):
        # 모든 LED 끄기
        for led in self.leds:
            led.duty_u16(0)
        # 메인 LED 끄기
        self.main_led.duty_u16(0)

    def main_led_on(self, brightness=1.0):
        # 메인 LED 켜기 (밝기 조절)
        if brightness < 0: brightness = 0
        if brightness > 1: brightness = 1
        duty = int(65535 * brightness)
        self.main_led.duty_u16(duty)

    def main_led_off(self):
        # 메인 LED 끄기
        self.main_led.duty_u16(0)

    # ==========================
    # [효과]
    # ==========================
    def swipe_effect(self):
        # 1-2-3-4-5-4-3-2-1 시퀀스 (인덱스)
        sequence = [0, 1, 2, 3, 4, 3, 2, 1, 0]
        for idx in sequence:
            # 모든 LED 순회
            for i, led in enumerate(self.leds):
                # 활성 LED인지 확인
                if i == idx:
                    led.duty_u16(65535)  # 최대 밝기
                else:
                    led.duty_u16(0)      # 끔
            # 효과 속도를 위한 지연
            sleep_ms(100)
        # 끝에서 모두 끄기
        self.leds_off()
    
    def check(self):
        # 시작 체크 패턴 실행
        for i in range(3):
            # 강도 단계 계산
            intensity = (3 - i)/3
            # 순차적 패턴
            self.set_led_pattern([0,0,0,0,intensity])
            sleep(0.1)
            self.set_led_pattern([0,0,0,intensity,0])
            sleep(0.1)
            self.set_led_pattern([0,0,intensity,0,0])
            sleep(0.1)
            self.set_led_pattern([0,intensity,0,0,0])
            sleep(0.1)
            self.set_led_pattern([intensity,0,0,0,0])
            sleep(0.1)
        self.leds_off()

    # ==========================
    # [패턴 제어]
    # ==========================
    def set_led_pattern(self, pattern):
        # 패턴 길이 유효성 검사
        if len(pattern) != len(self.leds):
            print("패턴 길이는 LED 수(5)와 일치해야 합니다")
            return
        
        # 패턴 적용
        for i, brightness in enumerate(pattern):
            # 범위 확인
            if 0.0 <= brightness <= 1.0:
                duty = int(65535 * brightness)  # 0.0-1.0을 0-65535로 변환
                self.leds[i].duty_u16(duty)
            else:
                self.leds[i].duty_u16(0)
