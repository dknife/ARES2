from machine import UART, Pin, I2C
import utime

from machine import Pin, I2C
import ssd1306
import time

# Create I2C object (I2C0, GP4=SDA, GP5=SCL)
i2c = I2C(0, scl=Pin(5), sda=Pin(4), freq=400000)

# Create SSD1306 OLED object (128x64)
oled = ssd1306.SSD1306_I2C(128, 64, i2c)

# Clear display
oled.fill(0)

# Display text
oled.text("Hello, Pico!", 0, 0)
oled.text("OLED Test", 0, 16)
oled.show()

time.sleep(2)

# Simple animation
for i in range(64):
    oled.fill(0)
    oled.text("Moving text", 0, i)
    oled.show()
    time.sleep(0.05)

# Onboard LED (GPIO25)
led = Pin(25, Pin.OUT)
led.value(0)

# UART0 with baudrate 9600 (TX=GPIO0, RX=GPIO1)
uart = UART(0, baudrate=9600, tx=Pin(0), rx=Pin(1))

# Wait 2 seconds for stabilization
utime.sleep(2)

print("Waiting for BLE data...")

while True:
    if uart.any():
        data = uart.read().decode('utf-8', 'ignore').strip()
        if data and not data.startswith('+'):  # Ignore status messages
            print(f"Data received: {data}")
            lcd.clear()
            lcd.putstr(f"{data}")
            response = f"Echo: {data}\r\n"
            uart.write(response)
            print(f"Sent: {response.strip()}")
            led.value(1)
            utime.sleep(0.1)
            led.value(0)
        elif data:
            print(f"Ignored status message: {data}")
    utime.sleep(0.1)
