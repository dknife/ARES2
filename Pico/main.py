# ARES 로버 메인 애플리케이션

from machine import UART, Pin
import utime
from process_data import CommandProcessor
from hardware import robot
from pins import UART_TX_PIN, UART_RX_PIN

# UART 설정
UART_ID = 0
UART_BAUDRATE = 9600

# 루프 설정
MAIN_LOOP_DELAY_MS = 10
RECEIVE_TIMEOUT_MS = 50
MAX_BUFFER_SIZE = 512


class AresRover:
    """ARES 로버 메인 애플리케이션 클래스"""
    
    def __init__(self):
        # UART 초기화 (블루투스 통신)
        self.uart = UART(
            UART_ID,
            baudrate=UART_BAUDRATE,
            tx=Pin(UART_TX_PIN),
            rx=Pin(UART_RX_PIN)
        )
        # 명령 프로세서 초기화
        self.processor = CommandProcessor()
        # 하드웨어 싱글톤 참조
        self.robot = robot
        # 실행 상태
        self.is_running = False
        # 수신 버퍼
        self.rx_buffer = ""

    def boot(self):
        """부팅 시퀀스 실행"""
        # 초기화 전 UART 버퍼 비우기
        if self.uart.any():
            print("Cleaning UART buffer...")
            while self.uart.any():
                self.uart.read()
        self.rx_buffer = ""
        
        # 모든 하드웨어 안전 정지
        self._safe_stop_all_motors()
        
        # 부팅 사운드
        self.robot.buzzer.boot_sound()
        
        # OLED 부팅 메시지
        self.robot.oled.fill(0)
        self.robot.oled.text("ARES READY", 0, 0)
        self.robot.oled.show()
        
        print("ARES Rover: Waiting for data...")
        self.is_running = True

    def _safe_stop_all_motors(self):
        """모든 하드웨어 안전 정지"""
        self.robot.stop_all()

    def _read_uart_line(self):
        """UART에서 완전한 라인 읽기"""
        if not self.uart.any():
            return None
        
        # 데이터 읽기
        while self.uart.any():
            chunk = self.uart.read()
            if chunk:
                self.rx_buffer += chunk.decode('utf-8', 'ignore')
            
            # 버퍼 오버플로우 방지
            if len(self.rx_buffer) > MAX_BUFFER_SIZE:
                print("[UART] 버퍼 오버플로우, 초기화")
                self.rx_buffer = ""
                return None
            
            utime.sleep_ms(5)
        
        # 나머지 데이터 대기
        utime.sleep_ms(RECEIVE_TIMEOUT_MS)
        
        while self.uart.any():
            chunk = self.uart.read()
            if chunk:
                self.rx_buffer += chunk.decode('utf-8', 'ignore')
        
        # 완전한 라인 확인
        if '\n' in self.rx_buffer:
            newline_idx = self.rx_buffer.index('\n')
            complete_line = self.rx_buffer[:newline_idx].strip()
            self.rx_buffer = self.rx_buffer[newline_idx + 1:]
            return complete_line
        
        # 줄바꿈 없는 명령 처리
        if self.rx_buffer:
            data = self.rx_buffer.strip()
            if data and not data.endswith(','):
                self.rx_buffer = ""
                return data
        
        return None

    def _is_status_message(self, data):
        """블루투스 상태 메시지 확인"""
        return data.startswith('+')

    def _send_response(self, response):
        """UART로 응답 전송 (20바이트 청킹)"""
        data = response.encode('utf-8') + b'\n'
        CHUNK_SIZE = 20
        
        for i in range(0, len(data), CHUNK_SIZE):
            chunk = data[i:i + CHUNK_SIZE]
            self.uart.write(chunk)
            utime.sleep_ms(10)

    def _process_command(self, data):
        """명령 처리 및 응답 반환"""
        try:
            print(f"[CMD] {data}")
            result = self.processor.process(data)
            return f"{result}"
        except Exception as e:
            print(f"처리 오류: {e}")
            return "ERROR"

    def run(self):
        """메인 루프 실행"""
        self.boot()
        
        while self.is_running:
            try:
                data = self._read_uart_line()
                
                if not data:
                    pass
                elif self._is_status_message(data):
                    print(f"BT 상태: {data}")
                else:
                    response = self._process_command(data)
                    self._send_response(response)
                    
            except Exception as e:
                print(f"UART 오류: {e}")
                    
            utime.sleep_ms(MAIN_LOOP_DELAY_MS)


if __name__ == "__main__":
    app = AresRover()
    app.run()
