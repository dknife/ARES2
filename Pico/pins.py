# ARES 로버 GPIO 핀 설정

"""
Raspberry Pi Pico 핀 레이아웃:
- GP0-GP28: 일반 GPIO
- ADC0-ADC2: 아날로그 입력 (GP26-28)
- ADC4: 내장 온도 센서
"""

# UART / 블루투스 통신
UART_TX_PIN = 0
UART_RX_PIN = 1

# DC 모터 (메인 구동)
DCMOTOR_DIR_PIN = 8
DCMOTOR_PWM_PIN = 9

# I2C / OLED 디스플레이
I2C_SDA_PIN = 4
I2C_SCL_PIN = 5

# 초음파 거리 센서 (HC-SR04)
ULTRASONIC_TRIG_PIN = 6
ULTRASONIC_ECHO_PIN = 7

# 서보 모터 (휠)
SERVO_RIGHT_PIN = 12
SERVO_LEFT_PIN = 13

# 부저
BUZZER_PIN = 15

# LED 배열 (5개): LED0(왼쪽) ~ LED4(오른쪽)
LED_PINS = [20, 19, 18, 17, 16]

# BB탄 발사기
GUN_PIN = 22

# 자기장 센서
MAGSENSOR_PIN = 26

# 메인 LED (추가)
MAIN_LED_PIN = 21

# 예비 핀 (미사용)
RESERVED_PINS = [10, 11, 14, 27, 28]


def print_pin_info():
    """핀 할당 정보 출력"""
    print("=" * 40)
    print("ARES 로버 핀 할당 정보")
    print("=" * 40)
    print(f"UART TX/RX: GP{UART_TX_PIN}, GP{UART_RX_PIN}")
    print(f"DC모터 DIR/PWM: GP{DCMOTOR_DIR_PIN}, GP{DCMOTOR_PWM_PIN}")
    print(f"I2C SDA/SCL: GP{I2C_SDA_PIN}, GP{I2C_SCL_PIN}")
    print(f"초음파 TRIG/ECHO: GP{ULTRASONIC_TRIG_PIN}, GP{ULTRASONIC_ECHO_PIN}")
    print(f"서보 R/L: GP{SERVO_RIGHT_PIN}, GP{SERVO_LEFT_PIN}")
    print(f"부저: GP{BUZZER_PIN}")
    print(f"LED: GP{LED_PINS}")
    print(f"총: GP{GUN_PIN}")
    print(f"자기장: GP{MAGSENSOR_PIN}")
    print(f"예비: GP{RESERVED_PINS}")
    print("=" * 40)
