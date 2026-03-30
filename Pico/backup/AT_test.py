from machine import UART, Pin
from utime import sleep

# Test multiple baud rates
baud_rates = [9600, 115200, 57600, 38400, 19200, 4800, 2400]
for baud in baud_rates:
    print(f"Trying baud rate: {baud}")
    uart = UART(0, baudrate=baud, tx=Pin(0), rx=Pin(1))
    while uart.any():
        uart.read()  # Clear buffer
    uart.write('AT\r\n')
    sleep(0.2)
    response = ''
    while uart.any():
        response += uart.read().decode('utf-8', 'ignore')
    print(f"Response: {response}")
    if 'OK' in response:
        print(f"AT-09 responding at baud rate {baud}")
        break
if not response or 'OK' not in response:
    print("AT-09 not responding at any baud rate")