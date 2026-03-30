# 부저 컨트롤러

from machine import Pin, PWM
import utime
from pins import BUZZER_PIN


class KSBuzzer:
    """부저 컨트롤러 클래스"""
    
    def __init__(self, pin_num=None):
        if pin_num is None:
            pin_num = BUZZER_PIN
        self.buzzer = PWM(Pin(pin_num))
        self.is_playing = False
        self.end_time = 0
        self.vol = 0

    def play(self, freq=1000, duration=1, vol=1000):
        """음 재생 (블로킹)"""
        self.start(freq=freq, duration=duration, vol=vol)
        while self.is_playing:
            self.update()
            utime.sleep_ms(10)
        self.stop()
        
    def start(self, freq=1000, duration=1, vol=1000):
        """음 재생 시작 (논블로킹)"""
        if self.is_playing:
            return False
        try:
            self.buzzer.freq(int(freq))
            self.buzzer.duty_u16(int(vol))
            self.is_playing = True
            self.end_time = utime.ticks_ms() + int(duration * 1000)
            self.vol = int(vol)
            return True
        except Exception as e:
            print(f"부저 시작 오류: {e}")
            self.is_playing = False
            return False

    def update(self):
        """재생 상태 업데이트"""
        if self.is_playing and utime.ticks_ms() >= self.end_time:
            self.buzzer.duty_u16(0)
            self.is_playing = False

    def stop(self):
        """부저 정지"""
        try:
            self.buzzer.duty_u16(0)
            self.is_playing = False
        except Exception as e:
            print(f"부저 정지 오류: {e}")

    def boot_sound(self, short=False):
        """부팅 사운드"""
        C4, G5 = 262, 784
        melody = [G5, C4]
        durations = [0.2, 0.9]

        for note, dur in zip(melody, durations):
            self.start(freq=note, duration=dur, vol=1000)
            while self.is_playing:
                self.update()
                utime.sleep_ms(10)
            utime.sleep_ms(50)
            if short:
                break

    def halamadrid(self, short=False):
        """Hala Madrid 멜로디"""
        C4, D4, E4, F4, G4 = 262, 294, 330, 349, 392
        C5, D5, E5, F5, G5 = 523, 587, 659, 679, 722
        
        melody = [
            G4, C5, G4, D5, G4, E5,
            C5, C5, C5, F5,
            F5, E5, E5, C5,
            E5, D5, C5, D5,
        ]
        
        tempo = 0.4
        rhythm = [
            1.0, 1.5, 0.5, 1.0, 1.0, 3.0,
            1.0, 1.0, 1.0, 3.0,
            1.0, 1.5, 0.5, 1.0,
            1.0, 1.5, 0.5, 4.0
        ]
        
        for i in range(len(melody)):
            dur = rhythm[i] * tempo if i < len(rhythm) else 0.4
            self.start(freq=melody[i], duration=dur * 0.9, vol=20000)
            while self.is_playing:
                self.update()
                utime.sleep_ms(10)
            utime.sleep_ms(50)
