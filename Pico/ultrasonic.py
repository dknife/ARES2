# ==========================
# [모듈 가져오기]
# ==========================
from machine import Pin, time_pulse_us
import utime
from pins import ULTRASONIC_TRIG_PIN, ULTRASONIC_ECHO_PIN

# ==========================
# [클래스 정의]
# ==========================
class KSDistance:
    # ==========================
    # [초기화]
    # ==========================
    def __init__(self):
        # pins.py에서 초음파 센서 핀 설정 가져오기
        self.trigger = Pin(ULTRASONIC_TRIG_PIN, Pin.OUT)
        self.echo = Pin(ULTRASONIC_ECHO_PIN, Pin.IN)


    # ==========================
    # [Measurement Methods]
    # ==========================
    def get_distance(self):
        # Ensure trigger is low initially
        self.trigger.low()
        # Short delay
        utime.sleep_us(2)
        # Send a 10us pulse
        self.trigger.high()
        utime.sleep_us(10)
        self.trigger.low()
        
        # Measure the echo pulse width
        # limit timeout to 30ms (approx 5m)
        duration = time_pulse_us(self.echo, 1, 30000)
        
        # Convert to distance (speed of sound ~ 343 m/s)
        distance_cm = (duration / 2) * 0.0343
        
        # Filter invalid readings
        if distance_cm < 0:
            # Return large value if invalid
            distance_cm = 1000000.0
            
        return distance_cm
