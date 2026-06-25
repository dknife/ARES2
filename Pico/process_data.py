# ARES 로버 명령 처리기

import utime
import time
from hardware import robot
from system_config import sys_config

PWM_MAX = 65535


class CommandProcessor:
    """UART 명령 파싱 및 실행 클래스"""
    
    def __init__(self):
        pass
    
    def _get_speed_pwm(self):
        """설정된 max_speed에서 PWM 값 계산"""
        spd = sys_config.get('max_speed') / 100.0
        return int(spd * PWM_MAX)
    
    def process(self, data):
        """명령 처리 및 결과 반환"""
        
        # 연결 확인
        if data == "PING":
            return self._handle_ping()
        elif data == "READY":
            return "READY"
            
        # 비상 정지
        elif data == "STOP_ALL":
            return self._handle_stop_all()
            
        # 시스템 명령
        elif data == "GET_STATUS":
            return self._handle_get_status()
        elif data == "GET_SYS":
            return self._handle_get_sys()
        elif data == "GET_MODULES":
            return self._handle_get_modules()
        elif data.startswith("SYS_SET"):
            return self._handle_sys_set(data)
        elif data.startswith("SET_PIN"):
            return self._handle_set_pin(data)
        elif data.startswith("SET_MODULE"):
            return self._handle_set_module(data)
        elif data.startswith("BATCH;"):
            return self._handle_batch(data)

        # 부저
        elif data.startswith("BUZZER_ON"):
            return self._handle_buzzer_on(data)
        elif data.startswith("SING"):
            return self._handle_sing()
            
        # 센서
        elif data == "DISTANCE":
            if robot.distance_sensor:
                dist = robot.distance_sensor.get_distance()
                return f"DIST:{dist}"
            return "DIST:ERROR"
        elif data == "MAGNET":
            if robot.mag_sensor:
                mag = robot.mag_sensor.detect()
                return f"MAG:{mag}"
            return "MAG:ERROR"
            
        # 서보 휠 (시간 제한) - SERVO_t방향,초
        elif data.startswith("SERVO_tFORWARD"):
            return self._handle_timed_wheel(data, "forward")
        elif data.startswith("SERVO_tBACKWARD"):
            return self._handle_timed_wheel(data, "backward")
        elif data.startswith("SERVO_tRIGHT"):
            return self._handle_timed_wheel(data, "right")
        elif data.startswith("SERVO_tLEFT"):
            return self._handle_timed_wheel(data, "left")
        # 레거시 호환
        elif data.startswith("tFORWARD"):
            return self._handle_timed_wheel(data, "forward")
        elif data.startswith("tBACKWARD"):
            return self._handle_timed_wheel(data, "backward")
        elif data.startswith("tRIGHT"):
            return self._handle_timed_wheel(data, "right")
        elif data.startswith("tLEFT"):
            return self._handle_timed_wheel(data, "left")
            
        # 서보 휠 (연속) - SERVO_방향 또는 SERVO_방향,속도
        elif data.startswith("SERVO_FORWARD"):
            return self._handle_continuous_wheel(data, "forward")
        elif data.startswith("SERVO_BACKWARD"):
            return self._handle_continuous_wheel(data, "backward")
        elif data.startswith("SERVO_LEFT"):
            return self._handle_continuous_wheel(data, "left")
        elif data.startswith("SERVO_RIGHT"):
            return self._handle_continuous_wheel(data, "right")
        elif data == "SERVO_STOP":
            if not robot.wheel:
                return 0
            robot.wheel.stop()
            return 1
        # 레거시 호환
        elif data == "FORWARD":
            return self._handle_continuous_wheel(data, "forward")
        elif data == "BACKWARD":
            return self._handle_continuous_wheel(data, "backward")
        elif data == "LEFT":
            return self._handle_continuous_wheel(data, "left")
        elif data == "RIGHT":
            return self._handle_continuous_wheel(data, "right")
        elif data == "STOP":
            if not robot.wheel:
                return 0
            robot.wheel.stop()
            return 1
            
        # DC 모터 - DC_방향 또는 DC_t방향,초
        elif data.startswith("DC_tFORWARD"):
            return self._handle_timed_dcmotor_new(data, "forward")
        elif data.startswith("DC_tBACKWARD"):
            return self._handle_timed_dcmotor_new(data, "backward")
        elif data.startswith("DC_FORWARD"):
            return self._handle_main_motor(data, "forward")
        elif data.startswith("DC_BACKWARD"):
            return self._handle_main_motor(data, "backward")
        elif data == "DC_STOP":
            if not robot.dcmotor:
                return 0
            robot.dcmotor.dc_stop()
            return 1
        # 레거시 호환
        elif data.startswith("DCMOTOR"):
            return self._handle_dcmotor(data)
        elif data.startswith("tDCMOTOR"):
            return self._handle_timed_dcmotor(data)
        elif data == "MAIN_FORWARD":
            return self._handle_main_motor(data, "forward")
        elif data == "MAIN_BACKWARD":
            return self._handle_main_motor(data, "backward")
        elif data == "MAIN_STOP":
            if not robot.dcmotor:
                return 0
            robot.dcmotor.dc_stop()
            return 1
            
        # 캘리브레이션
        elif data.startswith("CALIB_START"):
            return self._handle_calib_start()
        elif data.startswith("CALIB_SET"):
            return self._handle_calib_set(data)
            
        # LED
        elif data == "LED_PATTERN":
            if not robot.leds:
                return 0
            robot.leds.swipe_effect()
            return 1
        elif data.startswith("LED_ON"):
            return self._handle_led_on(data)
        elif data.startswith("LED_OFF"):
            return self._handle_led_off(data)
        elif data.startswith("["):
            return self._handle_led_pattern(data)
            
        # 디스플레이
        elif data == "CLEAR_DISPLAY":
            if not robot.oled:
                return 0
            robot.oled.fill(0)
            robot.oled.show()
            return 1
        elif data.startswith("CLEAR_RECT,"):
            return self._handle_clear_rect(data)
        elif data.startswith("MSG,"):
            return self._handle_msg(data)
        elif data.startswith("MSG_XY,"):
            return self._handle_msg_xy(data)
        elif data.startswith("ICON,"):
            return self._handle_icon(data)
            
        # 전투
        elif data.startswith("GUN_FIRE"):
            if robot.gun:
                robot.gun.fire_once()
            return 1
            
        # 대기
        elif data.startswith("SLEEP"):
            return self._handle_sleep(data)
            
        return 0
    
    # 연결 핸들러
    def _handle_ping(self):
        """연결 확인 - OLED에 표시"""
        if robot.oled:
            robot.oled.fill(0)
            robot.oled.text("CONNECTED!", 0, 0)
            robot.oled.text(str(sys_config.get('device_name')), 0, 16)
            robot.oled.show()
        return 1
    
    def _handle_stop_all(self):
        """비상 정지"""
        robot.stop_all()
        if robot.oled:
            robot.oled.fill(0)
            robot.oled.text("EMERGENCY STOP", 0, 0)
            robot.oled.show()
        return 1
    
    # 시스템 핸들러
    def _handle_get_status(self):
        """센서 상태 반환"""
        s = robot.get_status_dict()
        return f"STATUS,{s['dist']},{s['mag']},{s['temp']},{s['mem']},{s['uptime']}"
    
    def _handle_get_sys(self):
        """시스템 설정 반환"""
        c = sys_config.config
        l_cal = c.get('left_calibration', 100)
        r_cal = c.get('right_calibration', 100)
        return f"SYS_VALUES,{c['max_speed']},{c['collision_dist']},{c['auto_stop']},{c['device_name']},{l_cal},{r_cal}"
    
    def _handle_get_modules(self):
        """활성화된 모듈 정보 반환"""
        try:
            info = sys_config.get_module_info()
            result = "MODULES,"
            for module, data in info.items():
                status = "ON" if data['enabled'] else "OFF"
                result += f"{module}:{status},"
            return result.rstrip(',')
        except Exception as e:
            print(f"GET_MODULES 오류: {e}")
            return "MODULES,ERROR"
    
    def _handle_set_pin(self, data):
        """핀 설정 변경: SET_PIN,pin_name,pin_number"""
        try:
            parts = data.split(',')
            if len(parts) >= 3:
                pin_name = parts[1]
                pin_number = int(parts[2])
                if sys_config.set_pin(f"pin_{pin_name}", pin_number):
                    return f"PIN_SET,{pin_name},{pin_number}"
                else:
                    return "PIN_SET,ERROR"
        except Exception as e:
            print(f"SET_PIN 오류: {e}")
        return "PIN_SET,ERROR"
    
    def _handle_set_module(self, data):
        """모듈 활성화/비활성화: SET_MODULE,module_name,0/1"""
        try:
            parts = data.split(',')
            if len(parts) >= 3:
                module_name = parts[1]
                enable = int(parts[2])
                if sys_config.enable_module(module_name, enable):
                    status = "ON" if enable else "OFF"
                    return f"MODULE_SET,{module_name},{status}"
                else:
                    return "MODULE_SET,ERROR"
        except Exception as e:
            print(f"SET_MODULE 오류: {e}")
        return "MODULE_SET,ERROR"

    def _handle_batch(self, data):
        """일괄 실행: BATCH;cmd1|cmd2|cmd3.
        파이프로 구분된 각 명령을 기존 디스패처로 차례 실행하고, 마지막에 한 번의 응답을 보낸다.
        값 반환 명령(DISTANCE/MAGNET/PING)과 제어 흐름은 Web 측에서 미리 차단한다."""
        try:
            body = data[len("BATCH;"):]
            for cmd in body.split('|'):
                cmd = cmd.strip()
                if not cmd:
                    continue
                self.process(cmd)
                # 논블로킹 부저가 BATCH 안에서 시작됐다면, 다음 음이 덮어쓰지
                # 않도록 끝날 때까지 대기한다(BATCH는 펌웨어가 순차 타이밍을 보장).
                if robot.buzzer and robot.buzzer.is_playing:
                    while robot.buzzer.is_playing:
                        robot.buzzer.update()
                        utime.sleep_ms(10)
            return 1
        except Exception as e:
            print(f"BATCH 오류: {e}")
            return 0

    def _handle_sys_set(self, data):
        """시스템 설정 저장: SYS_SET,max_speed,col_dist,auto_stop,name"""
        try:
            parts = data.split(',')
            if len(parts) >= 5:
                max_speed = parts[1]
                col_dist = parts[2]
                auto_stop = parts[3]
                name = ",".join(parts[4:])
                print(f"[SYS_SET] speed={max_speed}, dist={col_dist}, stop={auto_stop}, name={name}")
                sys_config.save_config(max_speed, col_dist, auto_stop, name)
                return 1
        except Exception as e:
            print(f"SYS_SET 오류: {e}")
        return 0
    
    # 부저 핸들러
    def _handle_buzzer_on(self, data):
        """부저 울리기 (논블로킹).
        음을 '시작만' 하고 즉시 반환한다. 실제 정지는 메인 루프의
        robot.buzzer.update()가 duration 경과 시 처리하므로, 긴 음을 울리는
        동안에도 Pico가 다른 명령(긴급 정지 등)에 응답할 수 있다.
        멜로디의 음 길이 페이싱은 웹(commandexecutor.js)이 로컬 타이머로
        담당한다. 단, BATCH 안에서는 _handle_batch가 음이 끝날 때까지 드레인한다."""
        if not robot.buzzer:
            return 0
        try:
            argv = data.split(',')
            freq = int(float(argv[1]))
            duration = float(argv[2])
            robot.buzzer.stop()                 # 직전 음 잔여 정리(페이싱상 이미 끝났어야 함)
            robot.buzzer.start(freq=freq, duration=duration, vol=50000)
            return 1
        except Exception as e:
            print(f"BUZZER_ON 오류: {e}")
            return 0
    
    def _handle_sing(self):
        """멜로디 재생"""
        if not robot.buzzer:
            return 0
        if robot.oled:
            robot.oled.fill(0)
            robot.oled.text("Singing...", 0, 0)
            robot.oled.show()
        robot.buzzer.halamadrid()
        return 1
    
    # 서보 휠 핸들러
    def _handle_timed_wheel(self, data, direction):
        """시간 제한 휠 이동 (새 형식: SERVO_t방향,초,속도)"""
        if not robot.wheel:
            return 0
        try:
            argv = data.split(',')
            sec = float(argv[1])
            if len(argv) >= 3:
                spd = float(argv[2]) / 100.0
            else:
                spd = sys_config.get('max_speed') / 100.0
            
            spd = max(0.0, min(1.0, spd))
            
            if direction == "forward":
                robot.wheel.forward(speed=spd)
            elif direction == "backward":
                robot.wheel.backward(speed=spd)
            elif direction == "right":
                robot.wheel.turn_right(speed=spd)
            elif direction == "left":
                robot.wheel.turn_left(speed=spd)
            
            time.sleep(sec)
            robot.wheel.stop()
            return 1
        except Exception as e:
            print(f"t{direction.upper()} 오류: {e}")
            return 0
    
    def _handle_continuous_wheel(self, data, direction):
        """연속 휠 이동 (새 형식: SERVO_방향,속도)"""
        if not robot.wheel:
            return 0
        try:
            argv = data.split(',')
            if len(argv) >= 2:
                spd = float(argv[1]) / 100.0
            else:
                spd = sys_config.get('max_speed') / 100.0
            
            spd = max(0.0, min(1.0, spd))
            
            if direction == "forward":
                robot.wheel.forward(speed=spd)
            elif direction == "backward":
                robot.wheel.backward(speed=spd)
            elif direction == "right":
                robot.wheel.turn_right(speed=spd)
            elif direction == "left":
                robot.wheel.turn_left(speed=spd)
            
            return 1
        except Exception as e:
            print(f"SERVO_{direction.upper()} 오류: {e}")
            return 0
    
    # DC 모터 핸들러
    def _handle_dcmotor(self, data):
        """DC 모터 제어"""
        if not robot.dcmotor:
            return 0
        try:
            parts = data.split(',')
            direction = parts[1]
            speed = int(float(parts[2]))
            speed = max(0, min(100, speed))
            pwm_val = int(speed * PWM_MAX / 100)
            
            if direction == "FORWARD":
                robot.dcmotor.dc_forward(pwm_val)
            elif direction == "BACKWARD":
                robot.dcmotor.dc_backward(pwm_val)
            elif direction == "STOP":
                robot.dcmotor.dc_stop()
            return 1
        except Exception as e:
            print(f"DCMOTOR 오류: {e}")
            return 0
    
    def _handle_timed_dcmotor(self, data):
        """시간 제한 DC 모터 (레거시)"""
        if not robot.dcmotor:
            return 0
        try:
            parts = data.split(',')
            direction = parts[1]
            sec = float(parts[2])
            pwm_val = self._get_speed_pwm()
            
            if direction == "FORWARD":
                robot.dcmotor.dc_forward(pwm_val)
            elif direction == "BACKWARD":
                robot.dcmotor.dc_backward(pwm_val)
            
            time.sleep(sec)
            robot.dcmotor.dc_stop()
            return 1
        except Exception as e:
            print(f"tDCMOTOR 오류: {e}")
            return 0
    
    def _handle_timed_dcmotor_new(self, data, direction):
        """시간 제한 DC 모터 (새 형식: DC_t방향,초,속도)"""
        if not robot.dcmotor:
            return 0
        try:
            parts = data.split(',')
            sec = float(parts[1])
            if len(parts) >= 3:
                speed = int(float(parts[2]))
                speed = max(0, min(100, speed))
                pwm_val = int(speed * PWM_MAX / 100)
            else:
                pwm_val = self._get_speed_pwm()
            
            if direction == "forward":
                robot.dcmotor.dc_forward(pwm_val)
            elif direction == "backward":
                robot.dcmotor.dc_backward(pwm_val)
            
            time.sleep(sec)
            robot.dcmotor.dc_stop()
            return 1
        except Exception as e:
            print(f"DC_t{direction.upper()} 오류: {e}")
            return 0
    
    def _handle_main_motor(self, data, direction):
        """DC 모터 연속 이동 (새 형식: DC_방향,속도)"""
        if not robot.dcmotor:
            return 0
        try:
            parts = data.split(',')
            if len(parts) >= 2:
                speed = int(float(parts[1]))
                speed = max(0, min(100, speed))
                pwm_val = int(speed * PWM_MAX / 100)
            else:
                pwm_val = self._get_speed_pwm()
            
            if direction == "forward":
                robot.dcmotor.dc_forward(pwm_val)
            elif direction == "backward":
                robot.dcmotor.dc_backward(pwm_val)
            return 1
        except Exception as e:
            print(f"DC_{direction.upper()} 오류: {e}")
            return 0
    
    # 캘리브레이션 핸들러
    def _handle_calib_start(self):
        """캘리브레이션 테스트"""
        if not robot.wheel or not robot.oled:
            return 0
        robot.oled.fill(0)
        robot.oled.text("Calibration...", 0, 0)
        robot.oled.show()
        robot.wheel.forward(speed=0.1)
        time.sleep(3)
        robot.wheel.stop()
        robot.oled.text("Done", 0, 16)
        robot.oled.show()
        return 1
    
    def _handle_calib_set(self, data):
        """캘리브레이션 값 저장"""
        if not robot.wheel:
            return 0
        try:
            parts = data.split(',')
            left_val = int(parts[1])
            right_val = int(parts[2])
            sys_config.save_calibration(left_val, right_val)
            robot.wheel.update_factors(left_val, right_val)
            if robot.oled:
                robot.oled.fill(0)
                robot.oled.text(f"L:{left_val} R:{right_val}", 0, 0)
                robot.oled.show()
            return 1
        except Exception as e:
            print(f"CALIB_SET 오류: {e}")
            return 0

    # LED 핸들러
    def _handle_led_on(self, data):
        """LED 켜기"""
        if not robot.leds:
            return 0
        try:
            parts = data.split(',')
            led_num = int(parts[1])
            brightness = float(parts[2]) if len(parts) > 2 else 1.0
            brightness = max(0.0, min(1.0, brightness))
            
            if 0 <= led_num < len(robot.leds.leds):
                duty = int(65535 * brightness)
                robot.leds.leds[led_num].duty_u16(duty)
            return 1
        except Exception as e:
            print(f"LED_ON 오류: {e}")
            return 0

    def _handle_led_off(self, data):
        """LED 끄기"""
        if not robot.leds:
            return 0
        try:
            parts = data.split(',')
            led_num = parts[1] if len(parts) > 1 else '0'

            if led_num == 'ALL':
                robot.leds.leds_off()
            else:
                num = int(led_num)
                if 0 <= num < len(robot.leds.leds):
                    robot.leds.leds[num].duty_u16(0)
            return 1
        except Exception as e:
            print(f"LED_OFF 오류: {e}")
            return 0
    
    def _handle_led_pattern(self, data):
        """LED 패턴 적용"""
        if not robot.leds:
            return 0
        try:
            pattern = data.strip('[]')
            values = pattern.split()
            
            for i, val in enumerate(values):
                if i >= len(robot.leds.leds):
                    break
                brightness = float(val)
                brightness = max(0.0, min(1.0, brightness))
                duty = int(65535 * brightness)
                robot.leds.leds[i].duty_u16(duty)
            return 1
        except Exception as e:
            print(f"LED_PATTERN 오류: {e}")
            return 0
    
    # 디스플레이 핸들러
    def _handle_msg(self, data):
        """OLED에 메시지 표시"""
        if not robot.oled:
            return 0
        try:
            idx = data.find(',')
            if idx == -1:
                return 0
            
            msg = str(data[idx + 1:])
            if not msg:
                msg = "Hello"
            
            robot.oled.fill(0)
            
            # 자동 줄바꿈 (16자)
            max_chars = 16
            y_pos = 0
            
            while msg and y_pos < 64:
                line = msg[:max_chars]
                msg = msg[max_chars:]
                robot.oled.text(line, 0, y_pos)
                y_pos += 10
            
            robot.oled.show()
            return 1
        except Exception as e:
            print(f"MSG 오류: {e}")
            return 0

    def _handle_clear_rect(self, data):
        """특정 영역만 지우기 — CLEAR_RECT,x,y,w,h
        framebuf.fill_rect 로 (x, y) 부터 폭 w, 높이 h 영역을 OFF(0)로 채운다.
        화면 경계 밖은 framebuf 가 자동 클리핑한다.
        """
        if not robot.oled:
            return 0
        try:
            parts = data.split(',')
            if len(parts) < 5:
                return 0
            x = int(parts[1])
            y = int(parts[2])
            w = int(parts[3])
            h = int(parts[4])
            robot.oled.fill_rect(x, y, w, h, 0)
            robot.oled.show()
            return 1
        except Exception as e:
            print(f"CLEAR_RECT 오류: {e}")
            return 0

    def _handle_msg_xy(self, data):
        """좌표 기반 OLED 텍스트 출력 — MSG_XY,x,y,text
        화면을 지우지 않으므로 누적 출력이 가능하다. (지우려면 CLEAR_DISPLAY 선행)
        """
        if not robot.oled:
            return 0
        try:
            # text에 콤마가 포함될 수 있으므로 maxsplit=3
            parts = data.split(',', 3)
            if len(parts) < 4:
                return 0
            x = int(parts[1])
            y = int(parts[2])
            msg = str(parts[3]) if parts[3] else "Hello"
            robot.oled.text(msg, x, y)
            robot.oled.show()
            return 1
        except Exception as e:
            print(f"MSG_XY 오류: {e}")
            return 0

    def _handle_icon(self, data):
        """아이콘 출력 — ICON,name,x,y  (name: rover | mars)
        화면을 지우지 않으므로 텍스트와 함께 누적 가능.
        """
        if not robot.oled:
            return 0
        try:
            parts = data.split(',')
            if len(parts) < 4:
                return 0
            name = parts[1].strip().lower()
            x = int(parts[2])
            y = int(parts[3])
            icon = None
            if name == 'rover':
                icon = robot.oled.icon_rover
            elif name == 'mars':
                icon = robot.oled.icon_mars
            elif name == 'open_eye':
                icon = robot.oled.icon_open_eye
            elif name == 'closed_eye':
                icon = robot.oled.icon_closed_eye
            if icon is None:
                return 0
            icon.blit(x, y)
            robot.oled.show()
            return 1
        except Exception as e:
            print(f"ICON 오류: {e}")
            return 0

    # 유틸리티 핸들러
    def _handle_sleep(self, data):
        """대기"""
        try:
            argv = data.split(',')
            sec = float(argv[1])
            time.sleep(sec)
            return 1
        except Exception as e:
            print(f"SLEEP 오류: {e}")
            return 0
