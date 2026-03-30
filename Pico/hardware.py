# ARES 로버 하드웨어 싱글톤

from machine import I2C, Pin, UART
from system_config import sys_config
import time
import gc
import machine


class RobotHardware:
    """하드웨어 싱글톤 클래스"""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RobotHardware, cls).__new__(cls)
            cls._instance._init_hardware()
        return cls._instance

    def _init_hardware(self):
        """하드웨어 초기화 - 모듈별 선택적 로드"""
        # 시스템 기본 설정
        self.temp_sensor = machine.ADC(4)
        self.start_time = time.ticks_ms()
        
        # 모든 모듈을 None으로 초기화
        self.dcmotor = None
        self.oled = None
        self.i2c = None
        self.buzzer = None
        self.distance_sensor = None
        self.wheel = None
        self.mag_sensor = None
        self.leds = None
        self.gun = None
        
        # DC 모터 - 먼저 초기화 및 정지 (안전)
        if sys_config.is_module_enabled('dcmotor'):
            try:
                from dcmotor import KSDCMotor
                self.dcmotor = KSDCMotor()
                self.dcmotor.dc_stop()
                print("[HW] DC 모터 초기화 완료")
            except Exception as e:
                print(f"[HW] DC 모터 초기화 실패: {e}")

        # OLED 디스플레이
        if sys_config.is_module_enabled('oled'):
            try:
                from ssd1306 import SSD1306_I2C
                i2c_sda = sys_config.get('pin_i2c_sda')
                i2c_scl = sys_config.get('pin_i2c_scl')
                self.i2c = I2C(0, scl=Pin(i2c_scl), sda=Pin(i2c_sda), freq=400000)
                self.oled = SSD1306_I2C(128, 64, scl_pin=i2c_scl, sda_pin=i2c_sda)
                print("[HW] OLED 디스플레이 초기화 완료")
            except Exception as e:
                print(f"[HW] OLED 초기화 실패: {e}")
                self.oled = None

        # 부저
        if sys_config.is_module_enabled('buzzer'):
            try:
                from buzzer import KSBuzzer
                self.buzzer = KSBuzzer()
                print("[HW] 부저 초기화 완료")
            except Exception as e:
                print(f"[HW] 부저 초기화 실패: {e}")

        # 거리 센서
        if sys_config.is_module_enabled('distance'):
            try:
                from ultrasonic import KSDistance
                self.distance_sensor = KSDistance()
                print("[HW] 거리 센서 초기화 완료")
            except Exception as e:
                print(f"[HW] 거리 센서 초기화 실패: {e}")

        # 서보 모터 (휠)
        if sys_config.is_module_enabled('wheel'):
            try:
                from wheel import KSWheel
                self.wheel = KSWheel()
                self.wheel.stop()
                print("[HW] 서보 모터 초기화 완료")
            except Exception as e:
                print(f"[HW] 서보 모터 초기화 실패: {e}")

        # 자기장 센서
        if sys_config.is_module_enabled('magsensor'):
            try:
                from magsensor import KSMagSensor
                self.mag_sensor = KSMagSensor()
                print("[HW] 자기장 센서 초기화 완료")
            except Exception as e:
                print(f"[HW] 자기장 센서 초기화 실패: {e}")

        # LED
        if sys_config.is_module_enabled('leds'):
            try:
                from leds import KSLeds
                self.leds = KSLeds()
                print("[HW] LED 초기화 완료")
            except Exception as e:
                print(f"[HW] LED 초기화 실패: {e}")

        # 총
        if sys_config.is_module_enabled('gun'):
            try:
                from gun import KSGun
                self.gun = KSGun()
                print("[HW] 총 초기화 완료")
            except Exception as e:
                print(f"[HW] 총 초기화 실패: {e}")

        # 블루투스 이름 동기화
        self._sync_bt_name()

    def _sync_bt_name(self):
        """블루투스 모듈 이름 동기화"""
        try:
            from pins import UART_TX_PIN, UART_RX_PIN
            target_name = sys_config.get('device_name')
            uart = UART(0, baudrate=9600, tx=Pin(UART_TX_PIN), rx=Pin(UART_RX_PIN))
            cmd = f"AT+NAME{target_name}"
            uart.write(cmd.encode('utf-8'))
            time.sleep(0.1)
            print(f"[HW] BT 이름 설정: {target_name}")
        except Exception as e:
            print(f"[HW] BT 이름 동기화 오류: {e}")

    def get_temperature(self):
        """내부 온도 센서 읽기"""
        try:
            conversion_factor = 3.3 / 65535
            reading = self.temp_sensor.read_u16() * conversion_factor
            temperature = 27 - (reading - 0.706) / 0.001721
            return round(temperature, 1)
        except Exception as e:
            print(f"[HW] 온도 센서 오류: {e}")
            return 0

    def get_battery_voltage(self):
        """배터리 전압 (미구현)"""
        return 100 

    def get_status_dict(self):
        """시스템 상태 딕셔너리 반환"""
        status = {
            "dist": 0,
            "mag": 0,
            "temp": self.get_temperature(),
            "mem": gc.mem_free(),
            "uptime": int(time.ticks_diff(time.ticks_ms(), self.start_time) / 1000)
        }
        
        # 센서가 활성화되어 있으면 값 읽기
        try:
            if self.distance_sensor:
                status["dist"] = self.distance_sensor.get_distance()
        except Exception as e:
            print(f"[status] 거리 센서 오류: {e}")
            
        try:
            if self.mag_sensor:
                status["mag"] = self.mag_sensor.detect()
        except Exception as e:
            print(f"[status] 자기장 센서 오류: {e}")
        
        return status

    def stop_all(self):
        """모든 하드웨어 안전 정지"""
        # DC 모터
        if self.dcmotor:
            try:
                self.dcmotor.dc_stop()
            except Exception as e:
                print(f"[stop_all] DC모터 정지 오류: {e}")
        
        # 서보 휠
        if self.wheel:
            try:
                self.wheel.stop()
            except Exception as e:
                print(f"[stop_all] 휠 정지 오류: {e}")
        
        # LED
        if self.leds:
            try:
                self.leds.leds_off()
            except Exception as e:
                print(f"[stop_all] LED 정지 오류: {e}")
        
        # 부저
        if self.buzzer:
            try:
                if hasattr(self.buzzer, 'is_playing') and self.buzzer.is_playing:
                    self.buzzer.stop()
            except Exception as e:
                print(f"[stop_all] 부저 정지 오류: {e}")
        
        # 총
        if self.gun:
            try:
                self.gun.stop()
            except Exception as e:
                print(f"[stop_all] 총 정지 오류: {e}")
        
        print("[stop_all] 모든 하드웨어 정지 완료")


# 전역 싱글톤 인스턴스
robot = RobotHardware()
