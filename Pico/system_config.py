# 시스템 설정 관리

import json
import os

# 설정 파일
CONFIG_FILE = 'system.json'
LEGACY_CALIB_FILE = 'calibration.json'

# 기본 설정
DEFAULT_CONFIG = {
    "max_speed": 80,
    "collision_dist": 10,
    "auto_stop": 1,
    "device_name": "ARES",
    "left_calibration": 100,
    "right_calibration": 100,
    # 모듈 활성화 (1=활성화, 0=비활성화)
    "enable_wheel": 1,
    "enable_dcmotor": 1,
    "enable_buzzer": 1,
    "enable_distance": 1,
    "enable_magsensor": 1,
    "enable_leds": 1,
    "enable_gun": 1,
    "enable_oled": 1,
    # 모듈별 핀 설정
    "pin_wheel_left": 13,
    "pin_wheel_right": 12,
    "pin_dcmotor_dir": 8,
    "pin_dcmotor_pwm": 9,
    "pin_buzzer": 15,
    "pin_distance_trig": 6,
    "pin_distance_echo": 7,
    "pin_magsensor": 26,
    "pin_gun": 22,
    "pin_leds": "20,19,18,17,16",  # 5개 LED 핀 (쉼표로 구분)
    "pin_i2c_sda": 4,
    "pin_i2c_scl": 5
}

# 장치 이름 최대 길이
MAX_DEVICE_NAME_LENGTH = 10

# JSON 키 순서
CONFIG_KEY_ORDER = [
    "max_speed",
    "collision_dist", 
    "auto_stop",
    "device_name",
    "left_calibration",
    "right_calibration"
]


class SystemConfig:
    """시스템 설정 싱글톤 클래스"""
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SystemConfig, cls).__new__(cls)
            cls._instance._init_config()
        return cls._instance

    def _init_config(self):
        """설정 초기화"""
        self.config = DEFAULT_CONFIG.copy()
        self.load_config()

    def load_config(self):
        """설정 파일 로드"""
        try:
            if CONFIG_FILE in os.listdir():
                with open(CONFIG_FILE, 'r') as f:
                    data = json.load(f)
                    self.config.update(data)
                    print(f"[Config] 로드됨: {self.config}")
            elif LEGACY_CALIB_FILE in os.listdir():
                with open(LEGACY_CALIB_FILE, 'r') as f:
                    cal_data = json.load(f)
                    self.config['left_calibration'] = cal_data.get('left', 100)
                    self.config['right_calibration'] = cal_data.get('right', 100)
                self.save_all()
                print("[Config] 레거시 파일에서 마이그레이션됨")
        except Exception as e:
            print(f"[Config] 로드 오류: {e}")

    def save_config(self, max_speed, collision_dist, auto_stop, device_name):
        """시스템 설정 저장"""
        try:
            self.config["max_speed"] = int(max_speed)
            self.config["collision_dist"] = int(collision_dist)
            self.config["auto_stop"] = int(auto_stop)
            self.config["device_name"] = str(device_name)[:MAX_DEVICE_NAME_LENGTH]
            return self.save_all()
        except Exception as e:
            print(f"[Config] 저장 실패: {e}")
            return False

    def save_calibration(self, left, right):
        """캘리브레이션 저장"""
        try:
            self.config["left_calibration"] = int(left)
            self.config["right_calibration"] = int(right)
            return self.save_all()
        except Exception as e:
            print(f"[Config] 캘리브레이션 저장 실패: {e}")
            return False

    def save_all(self):
        """모든 설정을 파일에 저장"""
        try:
            lines = ["{"]
            items_added = 0
            total_items = len(self.config)
            
            for key in CONFIG_KEY_ORDER:
                if key in self.config:
                    value = self.config[key]
                    items_added += 1
                    formatted_value = f'"{value}"' if isinstance(value, str) else str(value)
                    comma = "," if items_added < total_items else ""
                    lines.append(f'    "{key}": {formatted_value}{comma}')
            
            for key, value in self.config.items():
                if key not in CONFIG_KEY_ORDER:
                    items_added += 1
                    formatted_value = f'"{value}"' if isinstance(value, str) else str(value)
                    comma = "," if items_added < total_items else ""
                    lines.append(f'    "{key}": {formatted_value}{comma}')
            
            lines.append("}")
            
            with open(CONFIG_FILE, 'w') as f:
                f.write("\n".join(lines))
            
            print(f"[Config] 저장됨")
            return True
        except Exception as e:
            print(f"[Config] 저장 실패: {e}")
            return False

    def get(self, key):
        """설정 값 가져오기"""
        return self.config.get(key)

    def set_pin(self, pin_name, pin_number):
        """핀 설정 변경"""
        try:
            pin_number = int(pin_number)
            if 0 <= pin_number <= 28:
                self.config[pin_name] = pin_number
                self.save_all()
                return True
            else:
                print(f"[Config] 유효하지 않은 핀 번호: {pin_number}")
                return False
        except Exception as e:
            print(f"[Config] 핀 설정 실패: {e}")
            return False

    def enable_module(self, module_name, enable):
        """모듈 활성화/비활성화"""
        try:
            config_key = f"enable_{module_name}"
            self.config[config_key] = int(enable)
            self.save_all()
            print(f"[Config] {module_name} = {enable}")
            return True
        except Exception as e:
            print(f"[Config] 모듈 설정 실패: {e}")
            return False

    def is_module_enabled(self, module_name):
        """모듈 활성화 여부 확인"""
        config_key = f"enable_{module_name}"
        return int(self.config.get(config_key, 0)) == 1

    def get_module_info(self):
        """활성화된 모듈과 핀 정보 반환"""
        modules = [
            ("wheel", "wheel_left/right"),
            ("dcmotor", "dcmotor_dir/pwm"),
            ("buzzer", "buzzer"),
            ("distance", "distance_trig/echo"),
            ("magsensor", "magsensor"),
            ("leds", "leds (5개)"),
            ("gun", "gun"),
            ("oled", "i2c (sda/scl)")
        ]
        
        info = {}
        for module, desc in modules:
            enabled = self.is_module_enabled(module)
            info[module] = {
                "enabled": enabled,
                "description": desc
            }
        
        return info


# 전역 싱글톤
sys_config = SystemConfig()
