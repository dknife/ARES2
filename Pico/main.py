# ARES 로버 메인 애플리케이션

from machine import UART, Pin
import gc
import utime
from process_data import CommandProcessor
from hardware import robot
from pins import UART_TX_PIN, UART_RX_PIN

# UART 설정
UART_ID = 0
UART_BAUDRATE = 9600

# 루프 설정
MAIN_LOOP_DELAY_MS = 10
GC_COLLECT_INTERVAL_MS = 5000
# CHUNK_DELAY(=100ms, Web 측 BLE 청크 간격)보다 충분히 크게 잡아 멀티 청크 명령
# (BATCH, LED 패턴, SYS_SET 등)이 한 번의 _read_uart_line 호출 안에 newline까지
# 도달할 확률을 높인다. 단일 청크 명령은 newline 발견 즉시 종료하므로 이 값과 무관.
RECEIVE_TIMEOUT_MS = 500
MAX_BUFFER_SIZE = 512


class AresRover:
    """ARES 로버 메인 애플리케이션 클래스"""

    # 응답 송신 생략 명령 (Web/commandexecutor.js의 FIRE_AND_FORGET_HEADS와 동기화).
    # 즉시 완료되는 출력 명령은 응답 라운드트립을 생략하여 처리량을 높이고,
    # 응답 매칭 어긋남(LED_ON 응답이 다음 명령 슬롯에 잘못 들어가는 현상)을 차단한다.
    # BUZZER_ON: 논블로킹으로 음을 '시작만' 하고 즉시 반환하므로 응답 불필요.
    #   음 길이 페이싱은 웹이 로컬로 처리하고, 자동 정지는 run() 루프의
    #   buzzer.update()가 담당한다. (SERVO_t*/DC_t*/SLEEP/BATCH/SING은 여전히
    #   blocking 처리하므로 이 목록에 넣지 말 것.)
    # 대시보드/비상정지 경로 명령(STOP_ALL, SYS_SET, CALIB_*, 레거시 t*, STOP,
    # LED_PATTERN, SING)은 웹이 응답을 기다리지 않고 보낸다(waitForResponse=false).
    # 이들에 응답하면 잉여 ack가 떠돌다 이후 다른 명령의 응답 슬롯에 잘못
    # 매칭되므로(웹은 명령-응답을 짝짓지 않음) 응답을 생략한다.
    NO_RESPONSE_CMDS = (
        "LED_ON", "LED_OFF",
        "MSG", "MSG_XY", "ICON", "CLEAR_DISPLAY", "CLEAR_RECT",
        "SERVO_FORWARD", "SERVO_BACKWARD", "SERVO_LEFT", "SERVO_RIGHT", "SERVO_STOP",
        "DC_FORWARD", "DC_BACKWARD", "DC_STOP",
        "GUN_FIRE",
        "BUZZER_ON",
        "STOP_ALL", "STOP",
        "tFORWARD", "tBACKWARD", "tLEFT", "tRIGHT",
        "LED_PATTERN", "SING",
        "SYS_SET", "CALIB_START", "CALIB_SET",
    )

    # 시간지정 동작을 즉시 중단시키는 명령 (비상정지 경로)
    ABORT_CMDS = ("STOP_ALL", "STOP")

    def __init__(self):
        # UART 초기화 (블루투스 통신)
        self.uart = UART(
            UART_ID,
            baudrate=UART_BAUDRATE,
            tx=Pin(UART_TX_PIN),
            rx=Pin(UART_RX_PIN)
        )
        # 수신 버퍼 (_poll_abort가 참조하므로 processor보다 먼저 초기화)
        self.rx_buffer = ""
        # 명령 프로세서 초기화 — 시간지정 동작(SERVO_t*/DC_t*/SLEEP/BATCH) 중
        # 비상정지를 감지할 수 있도록 폴링 콜백을 주입한다.
        self.processor = CommandProcessor(abort_check=self._poll_abort)
        # 하드웨어 싱글톤 참조
        self.robot = robot
        # 실행 상태
        self.is_running = False

    def _poll_abort(self):
        """시간지정 이동/대기 중 CommandProcessor가 주기 호출하는 비상정지 폴링.
        UART를 비차단으로 흡수한 뒤, 버퍼의 완성 라인 중 정지 명령이 있으면
        그 라인까지 전부 소비하고 True를 반환한다(그 앞에 쌓인 명령은 비상정지
        의미상 폐기). 정지 명령이 없으면 버퍼를 건드리지 않고 False —
        일반 명령은 동작 종료 후 run() 루프가 평소처럼 처리한다."""
        if self.uart.any():
            chunk = self.uart.read()
            if chunk:
                try:
                    self.rx_buffer += chunk.decode('utf-8', 'ignore')
                except Exception:
                    pass  # 잘린 멀티바이트 등 디코드 실패 — 정지 감지에는 영향 없음
                if len(self.rx_buffer) > MAX_BUFFER_SIZE:
                    print("[UART] 버퍼 오버플로우, 초기화")
                    self.rx_buffer = ""
                    return False
        if '\n' not in self.rx_buffer:
            return False
        lines = self.rx_buffer.split('\n')
        tail = lines.pop()  # 마지막 조각(미완성 라인)은 보존
        for i, line in enumerate(lines):
            head = line.strip().split(',', 1)[0]
            if head in self.ABORT_CMDS:
                self.rx_buffer = '\n'.join(lines[i + 1:] + [tail])
                print(f"[비상정지] 동작 중 {head} 수신 → 즉시 중단")
                return True
        return False

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
        
        # 부팅 사운드 (부저 비활성/초기화 실패 시에도 부팅은 계속)
        if self.robot.buzzer is not None:
            self.robot.buzzer.boot_sound()
        
        # OLED 부팅 메시지
        if self.robot.oled is not None:
            self.robot.oled.fill(0)
            self.robot.oled.text("ARES READY", 0, 0)
            self.robot.oled.show()
        
        print("ARES Rover: Waiting for data...")
        self.is_running = True

    def _safe_stop_all_motors(self):
        """모든 하드웨어 안전 정지"""
        self.robot.stop_all()

    def _pop_line(self):
        """rx_buffer에 완전한 라인이 있으면 떼어내 반환, 없으면 None."""
        if '\n' not in self.rx_buffer:
            return None
        newline_idx = self.rx_buffer.index('\n')
        complete_line = self.rx_buffer[:newline_idx].strip()
        self.rx_buffer = self.rx_buffer[newline_idx + 1:]
        return complete_line

    def _read_uart_line(self):
        """UART에서 완전한 라인 읽기.
        newline 발견 즉시 종료 — 단일 chunk 명령에서 무조건 50ms를 기다리지 않는다.
        멀티 chunk 명령(LED 패턴, SYS_SET 등)은 RECEIVE_TIMEOUT_MS까지 폴링하여 안전.
        """
        # 한 chunk에 명령이 2개 이상 도착해 버퍼에 남은 라인을 먼저 소비한다.
        # (이 검사가 없으면 새 바이트가 올 때까지 아래 루프가 매번
        #  RECEIVE_TIMEOUT_MS를 공회전하며 둘째 명령 실행이 지연된다.)
        line = self._pop_line()
        if line is not None:
            return line

        if not self.uart.any():
            return None

        start = utime.ticks_ms()
        while utime.ticks_diff(utime.ticks_ms(), start) < RECEIVE_TIMEOUT_MS:
            if self.uart.any():
                chunk = self.uart.read()
                if chunk:
                    self.rx_buffer += chunk.decode('utf-8', 'ignore')

                # 버퍼 오버플로우 방지
                if len(self.rx_buffer) > MAX_BUFFER_SIZE:
                    print("[UART] 버퍼 오버플로우, 초기화")
                    self.rx_buffer = ""
                    return None

                # newline 즉시 종료
                line = self._pop_line()
                if line is not None:
                    return line
            else:
                utime.sleep_ms(2)

        # 타임아웃: 부분 데이터를 반환하지 않고 buffer를 유지한다.
        # 다음 _read_uart_line 호출에서 이어받아 newline까지 누적한다.
        # (이전 구현은 잘린 BATCH 명령을 정상 명령으로 오해해 첫 부분만 실행하는 문제가 있었다.)
        return None

    def _needs_response(self, data):
        """응답 송신 여부. fire-and-forget 명령은 False (NO_RESPONSE_CMDS 참조)."""
        if data.startswith("["):           # LED 패턴 [v0 v1 v2 v3 v4 v5]
            return False
        head = data.split(",", 1)[0]
        return head not in self.NO_RESPONSE_CMDS

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
        last_gc_ms = utime.ticks_ms()

        while self.is_running:
            try:
                data = self._read_uart_line()
                
                if not data:
                    pass
                elif self._is_status_message(data):
                    print(f"BT 상태: {data}")
                else:
                    response = self._process_command(data)
                    if self._needs_response(data):
                        self._send_response(response)
                    
            except Exception as e:
                print(f"UART 오류: {e}")

            # 논블로킹 부저: duration 경과 시 자동 정지(웹이 음 길이만큼 페이싱).
            # 명령 수신 대기 중에도 매 루프 호출되어 마지막 음도 제때 꺼진다.
            if self.robot.buzzer:
                self.robot.buzzer.update()

            now = utime.ticks_ms()
            if utime.ticks_diff(now, last_gc_ms) >= GC_COLLECT_INTERVAL_MS:
                gc.collect()
                last_gc_ms = now

            utime.sleep_ms(MAIN_LOOP_DELAY_MS)


if __name__ == "__main__":
    app = AresRover()
    app.run()
