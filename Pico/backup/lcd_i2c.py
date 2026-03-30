from machine import I2C
import utime

class I2cLcd:
    # LCD commands
    LCD_CLR = 0x01
    LCD_HOME = 0x02
    LCD_ENTRY_MODE = 0x04
    LCD_DISPLAY_CTRL = 0x08
    LCD_SHIFT = 0x10
    LCD_FUNCTION_SET = 0x20
    LCD_CGRAM_ADDR = 0x40
    LCD_DDRAM_ADDR = 0x80

    # Flags for display entry mode
    ENTRY_LEFT = 0x02
    ENTRY_SHIFT_DECREMENT = 0x00

    # Flags for display on/off control
    DISPLAY_ON = 0x04
    CURSOR_OFF = 0x00
    BLINK_OFF = 0x00

    # Flags for function set
    FUNCTION_2LINE = 0x08
    FUNCTION_5x8DOTS = 0x00

    # Control bits
    ENABLE = 0b00000100  # Enable bit
    READ_WRITE = 0b00000010  # Read/Write bit (not used, we only write)
    REGISTER_SELECT = 0b00000001  # Register select bit

    def __init__(self, i2c: I2C, addr: int, rows: int, cols: int):
        self.i2c = i2c
        self.addr = addr
        self.rows = rows
        self.cols = cols
        self.backlight = 0x08  # Backlight on
        utime.sleep_ms(20)

        self._write_init_nibble(0x03)
        utime.sleep_ms(5)
        self._write_init_nibble(0x03)
        utime.sleep_ms(5)
        self._write_init_nibble(0x03)
        utime.sleep_ms(1)
        self._write_init_nibble(0x02)  # Set 4-bit mode

        self._write_cmd(self.LCD_FUNCTION_SET | self.FUNCTION_2LINE | self.FUNCTION_5x8DOTS)
        self._write_cmd(self.LCD_DISPLAY_CTRL | self.DISPLAY_ON | self.CURSOR_OFF | self.BLINK_OFF)
        self._write_cmd(self.LCD_CLR)
        utime.sleep_ms(2)
        self._write_cmd(self.LCD_ENTRY_MODE | self.ENTRY_LEFT | self.ENTRY_SHIFT_DECREMENT)
        utime.sleep_ms(2)

    def _write_init_nibble(self, nibble: int):
        byte = (nibble << 4) | self.backlight
        self.i2c.writeto(self.addr, bytes([byte | self.ENABLE]))
        utime.sleep_us(1)
        self.i2c.writeto(self.addr, bytes([byte]))
        utime.sleep_us(50)

    def _write_cmd(self, cmd: int):
        self._write_byte(cmd, 0)

    def _write_data(self, data: int):
        self._write_byte(data, self.REGISTER_SELECT)

    def _write_byte(self, byte: int, mode: int):
        high = (byte & 0xF0) | mode | self.backlight
        low = ((byte << 4) & 0xF0) | mode | self.backlight
        self._pulse(high)
        self._pulse(low)

    def _pulse(self, data: int):
        self.i2c.writeto(self.addr, bytes([data | self.ENABLE]))
        utime.sleep_us(1)
        self.i2c.writeto(self.addr, bytes([data & ~self.ENABLE]))
        utime.sleep_us(50)

    def clear(self):
        self._write_cmd(self.LCD_CLR)
        utime.sleep_ms(2)

    def putstr(self, string: str):
        for char in string:
            if char == '\n':
                if self.rows > 1:
                    self._write_cmd(self.LCD_DDRAM_ADDR | 0x40)
            else:
                self._write_data(ord(char))

    def move_to(self, row: int, col: int):
        if row >= self.rows:
            row = self.rows - 1
        if col >= self.cols:
            col = self.cols - 1
        addr = col + (0x40 * row)
        self._write_cmd(self.LCD_DDRAM_ADDR | addr)
