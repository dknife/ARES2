# ==========================
# [모듈 가져오기]
# ==========================
# MicroPython SSD1306 OLED 드라이버, I2C 및 SPI 인터페이스
from machine import UART, Pin, I2C, PWM
from micropython import const
import framebuf
from icon import *
from pins import I2C_SDA_PIN, I2C_SCL_PIN

# ==========================
# [상수 정의]
# ==========================
# 레지스터 정의
SET_CONTRAST = const(0x81)
SET_ENTIRE_ON = const(0xa4)
SET_NORM_INV = const(0xa6)
SET_DISP = const(0xae)
SET_MEM_ADDR = const(0x20)
SET_COL_ADDR = const(0x21)
SET_PAGE_ADDR = const(0x22)
SET_DISP_START_LINE = const(0x40)
SET_SEG_REMAP = const(0xa0)
SET_MUX_RATIO = const(0xa8)
SET_COM_OUT_DIR = const(0xc0)
SET_DISP_OFFSET = const(0xd3)
SET_COM_PIN_CFG = const(0xda)
SET_DISP_CLK_DIV = const(0xd5)
SET_PRECHARGE = const(0xd9)
SET_VCOM_DESEL = const(0xdb)
SET_CHARGE_PUMP = const(0x8d)

# ==========================
# [클래스 정의]
# ==========================
class SSD1306:
    # ==========================
    # [초기화]
    # ==========================
    def __init__(self, width, height, external_vcc):
        self.external_vcc = external_vcc 
        
        self.width = width
        self.height = height
        
        self.pages = self.height // 8
        self.buffer = bytearray(self.width * self.pages)
        self.framebuf = framebuf.FrameBuffer(self.buffer, self.width, self.height, framebuf.MONO_VLSB)
        self.init_display()
        # 아이콘 생성
        self.icon_rover = KSicon(cute_robot32x32, 32, 32, self)

    def init_display(self):
        for cmd in (
            SET_DISP | 0x00,
            SET_MEM_ADDR, 0x00,
            SET_DISP_START_LINE | 0x00,
            SET_SEG_REMAP | 0x01,
            SET_MUX_RATIO, self.height - 1,
            SET_COM_OUT_DIR | 0x08,
            SET_DISP_OFFSET, 0x00,
            SET_COM_PIN_CFG, 0x02 if self.height == 32 else 0x12,
            SET_DISP_CLK_DIV, 0x80,
            SET_PRECHARGE, 0x22 if self.external_vcc else 0xf1,
            SET_VCOM_DESEL, 0x30,
            SET_CONTRAST, 0xff,
            SET_ENTIRE_ON,
            SET_NORM_INV,
            SET_CHARGE_PUMP, 0x10 if self.external_vcc else 0x14,
            SET_DISP | 0x01):
            self.write_cmd(cmd)
        self.fill(0)
        self.show()

    # ==========================
    # [전원 제어]
    # ==========================
    def poweroff(self):
        self.write_cmd(SET_DISP | 0x00)

    def poweron(self):
        self.write_cmd(SET_DISP | 0x01)

    # ==========================
    # [디스플레이 설정]
    # ==========================
    def contrast(self, contrast):
        self.write_cmd(SET_CONTRAST)
        self.write_cmd(contrast)

    def invert(self, invert):
        self.write_cmd(SET_NORM_INV | (invert & 1))

    # ==========================
    # [그리기 메서드]
    # ==========================
    def show(self):
        self.write_cmd(SET_COL_ADDR)
        self.write_cmd(0)
        self.write_cmd(self.width - 1)
        self.write_cmd(SET_PAGE_ADDR)
        self.write_cmd(0)
        self.write_cmd(self.pages - 1)
        self.write_data(self.buffer)

    def fill(self, col):
        self.framebuf.fill(col)

    def pixel(self, x, y, col):
        self.framebuf.pixel(x, y, col)

    def scroll(self, dx, dy):
        self.framebuf.scroll(dx, dy)

    def text(self, string, x, y, col=1):
        self.framebuf.text(string, x, y, col)
        
    def booting_msg(self):  
        self.fill(0)
        # 텍스트 표시
        self.text("Hello, Everyone!", 0, 0)
        self.text("This is Ares", 0, 16)
        self.text("Korea", 29, 32)
        self.text("Science", 29, 40)
        self.text(" +TU", 88, 40)
        self.icon_rover.blit(0, 32)
        self.show()

class SSD1306_I2C(SSD1306):
    def __init__(self, width, height, scl_pin=None, sda_pin=None, addr=0x3c, external_vcc=False):
        # pins.py에서 기본 I2C 핀 설정 가져오기
        if scl_pin is None:
            scl_pin = I2C_SCL_PIN
        if sda_pin is None:
            sda_pin = I2C_SDA_PIN
        # I2C 객체 생성
        self.i2c = I2C(0, scl=Pin(scl_pin), sda=Pin(sda_pin), freq=400000)
        
        self.addr = addr
        self.temp = bytearray(2)
        self.write_list = [b'\x40', None]
        super().__init__(width, height, external_vcc)

    def write_cmd(self, cmd):
        self.temp[0] = 0x80
        self.temp[1] = cmd
        self.i2c.writeto(self.addr, self.temp)

    def write_data(self, buf):
        self.write_list[1] = buf
        self.i2c.writevto(self.addr, self.write_list)

class SSD1306_SPI(SSD1306):
    def __init__(self, width, height, spi, dc, res, cs, external_vcc=False):
        self.spi = spi
        self.dc = dc
        self.res = res
        self.cs = cs
        self.temp = bytearray(1)
        self.cs.init(self.cs.OUT, value=1)
        self.dc.init(self.dc.OUT, value=0)
        self.res.init(self.res.OUT, value=0)
        time.sleep_ms(1)
        self.res(1)
        super().__init__(width, height, external_vcc)

    def write_cmd(self, cmd):
        self.temp[0] = cmd
        self.dc(0)
        self.cs(0)
        self.spi.write(self.temp)
        self.cs(1)

    def write_data(self, buf):
        self.dc(1)
        self.cs(0)
        self.spi.write(buf)
        self.cs(1)
