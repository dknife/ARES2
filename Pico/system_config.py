# 아레스 탐사선 시스템 설정 및 컴포넌트 관리 (ModelFactorySetting.txt 기반)

import os

# 기본 인메모리 백업 설정
DEFAULT_CONFIG = {
    "max_speed": 40,
    "collision_dist": 10,
    "auto_stop": 1,
    "device_name": "ARES",
    "left_calibration": 100,
    "right_calibration": 100,
    "enable_wheel": 1,
    "enable_dcmotor": 1,
    "enable_leds": 1,
    "enable_oled": 1,
    "enable_buzzer": 1,
    "enable_gun": 1,
    "enable_distance": 1,
    "enable_magsensor": 1,
    "pin_wheel_left": 13,
    "pin_wheel_right": 12,
    "pin_dcmotor_dir": 8,
    "pin_dcmotor_pwm": 9,
    "pin_buzzer": 15,
    "pin_gun": 22,
    "pin_distance_trig": 6,
    "pin_distance_echo": 7,
    "pin_magsensor": 26,
    "pin_leds": "21,20,19,18,17,16",
    "pin_i2c_sda": 4,
    "pin_i2c_scl": 5,
    "model": "rover",
    "wheel": "서보 모터",
    "dcmotor": "DC 모터",
    "leds": "LED",
    "oled": "디스플레이",
    "buzzer": "소리",
    "gun": "발사",
    "sensors": "센서"
}

# 공장 출하 시 자동 생성할 템플릿 설정 텍스트 (사용자 친화적 가이드 포함)
DEFAULT_FACTORY_TEXT = """# 아레스 탐사선 모델 팩토리 설정 파일 (ModelFactorySetting.txt)
# 이 파일을 메모장으로 편집하여 로봇의 동작 속도, 부품 연결 핀, 활성화 여부, 탭 한글 이름을 마음대로 설정할 수 있습니다.
# '#'으로 시작하는 줄은 설명글이므로 무시됩니다.
# '=' 이나 ':' 문자를 사용해 '키=값' 형태로 작성해 주세요.

# [1. 기본 설정 및 테마]
# device_name: 탐사선 블루투스 검색 이름
# max_speed: 기본 속도 제한 (0 ~ 100 %)
# collision_dist: 장애물 정지 거리 (cm)
# auto_stop: 초음파 장애물 감지 시 자동 정지 여부 (1=켬, 0=끔)
# model: 블럭코딩 테마 모델 (rover: 로버 테마, launchpad: 발사대 테마)
device_name=ARES
max_speed=40
collision_dist=10
auto_stop=1
model=rover

# [2. 블럭 코딩 카테고리 탭 한글 이름 커스텀]
# 각 블럭 코딩 카테고리 탭(사이드바)의 표시 이름을 한글로 자유롭게 커스터마이징 할 수 있습니다.
wheel=서보 모터
dcmotor=DC 모터
leds=LED
oled=디스플레이
buzzer=소리
gun=발사
sensors=센서

# [3. 모듈 활성화 여부 설정 (1=사용, 0=사용안함)]
# 사용하지 않는 모듈을 0으로 설정하면 해당 블럭 탭이 화면에서 자동으로 숨겨집니다.
enable_wheel=1
enable_dcmotor=1
enable_leds=1
enable_oled=1
enable_buzzer=1
enable_gun=1
enable_distance=1
enable_magsensor=1

# [4. 각 부품별 하드웨어 연결 GP 핀 번호]
pin_wheel_left=13
pin_wheel_right=12
pin_dcmotor_dir=8
pin_dcmotor_pwm=9
pin_buzzer=15
pin_gun=22
pin_distance_trig=6
pin_distance_echo=7
pin_magsensor=26
pin_i2c_sda=4
pin_i2c_scl=5
pin_leds=21,20,19,18,17,16

# [5. 서보 모터 바퀴 정밀 보정치 (기본값 100)]
left_calibration=100
right_calibration=100
"""

# 장치 이름 최대 길이
MAX_DEVICE_NAME_LENGTH = 10


class SystemConfig:
    """시스템 설정 및 블럭 탭 제어 싱글톤 클래스"""
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
        """ModelFactorySetting.txt 설정 파일 로드"""
        try:
            # 설정 파일이 존재하지 않는 경우 공장 기본 템플릿 파일 생성
            if "ModelFactorySetting.txt" not in os.listdir():
                with open("ModelFactorySetting.txt", "w") as f:
                    f.write(DEFAULT_FACTORY_TEXT)
                print("[Config] ModelFactorySetting.txt 팩토리 초기 템플릿 생성 완료")

            # 파싱 및 메모리 로드
            with open("ModelFactorySetting.txt", "r") as f:
                content = f.read().replace('\ufeff', '')
                for line in content.split('\n'):
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    parts = []
                    if "=" in line:
                        parts = line.split("=", 1)
                    elif ":" in line:
                        parts = line.split(":", 1)
                    
                    if len(parts) == 2:
                        key = parts[0].strip().lower()
                        val = parts[1].strip()
                        
                        # 숫자 자동 정수형 파싱
                        if val.isdigit() or (val.startswith('-') and val[1:].isdigit()):
                            self.config[key] = int(val)
                        else:
                            self.config[key] = val
                            
            print(f"[Config] ModelFactorySetting.txt 로드 완료")
        except Exception as e:
            print(f"[Config] 로드 오류: {e}")

    def save_multiple_keys(self, kv_dict):
        """ModelFactorySetting.txt 내의 여러 설정을 한 번에 파일로 저장합니다. (기존 주석 및 가이드라인 완전 보존)"""
        try:
            lines = []
            if "ModelFactorySetting.txt" in os.listdir():
                with open("ModelFactorySetting.txt", "r") as f:
                    content = f.read().replace('\ufeff', '')
                    lines = content.split('\n')
            
            updated_keys = set()
            for i, line in enumerate(lines):
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue
                parts = []
                delimiter = ""
                if "=" in line:
                    parts = line.split("=", 1)
                    delimiter = "="
                elif ":" in line:
                    parts = line.split(":", 1)
                    delimiter = ":"
                
                if len(parts) == 2:
                    current_key = parts[0].strip().lower()
                    for k, v in kv_dict.items():
                        if current_key == k.strip().lower():
                            lines[i] = f"{parts[0].strip()}{delimiter}{v}"
                            updated_keys.add(k.strip().lower())
                            break
            
            # 원래 파일에 없는 새로운 설정은 끝에 덧붙임
            for k, v in kv_dict.items():
                if k.strip().lower() not in updated_keys:
                    lines.append(f"{k.strip()}={v}")
            
            with open("ModelFactorySetting.txt", "w") as f:
                f.write("\n".join(lines))
            
            # 변경 사항 메모리에 새로고침
            self.load_config()
            return True
        except Exception as e:
            print(f"[Config] ModelFactorySetting.txt 업데이트 실패: {e}")
            return False

    def save_config(self, max_speed, collision_dist, auto_stop, device_name):
        """시스템 설정값 저장 (속도, 정지거리, 자동정지 여부, 디바이스 네임)"""
        try:
            kv = {
                "max_speed": int(max_speed),
                "collision_dist": int(collision_dist),
                "auto_stop": int(auto_stop),
                "device_name": str(device_name)[:MAX_DEVICE_NAME_LENGTH]
            }
            return self.save_multiple_keys(kv)
        except Exception as e:
            print(f"[Config] 시스템 설정 저장 실패: {e}")
            return False

    def save_calibration(self, left, right):
        """바퀴 캘리브레이션 조정치 저장"""
        try:
            kv = {
                "left_calibration": int(left),
                "right_calibration": int(right)
            }
            return self.save_multiple_keys(kv)
        except Exception as e:
            print(f"[Config] 캘리브레이션 저장 실패: {e}")
            return False

    def get(self, key):
        """설정값 획득"""
        return self.config.get(key)

    def set_pin(self, pin_name, pin_number):
        """하드웨어 핀 제어 설정 변경"""
        try:
            pin_number = int(pin_number)
            if 0 <= pin_number <= 28:
                return self.save_multiple_keys({pin_name: pin_number})
            else:
                print(f"[Config] 유효하지 않은 GP 핀 번호: {pin_number}")
                return False
        except Exception as e:
            print(f"[Config] 핀 제어 저장 실패: {e}")
            return False

    def enable_module(self, module_name, enable):
        """모듈의 활성화 / 비활성화 제어"""
        try:
            config_key = f"enable_{module_name}"
            return self.save_multiple_keys({config_key: int(enable)})
        except Exception as e:
            print(f"[Config] 모듈 활성화 실패: {e}")
            return False

    def is_module_enabled(self, module_name):
        """모듈의 사용 여부 확인"""
        config_key = f"enable_{module_name}"
        return int(self.config.get(config_key, 0)) == 1

    def get_module_info(self):
        """활성화된 모듈 정보 반환"""
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

    def get_custom_component_names(self):
        """ModelFactorySetting.txt에서 사용자가 재지정한 블럭코딩 탭 이름 설정을 가져옵니다."""
        overrides = {}
        # 모든 설정 키가 메모리에 로드되어 있으므로, 설정 가이드를 제외한 tab 관련 수치만 추출
        target_keys = ["model", "theme", "wheel", "dcmotor", "leds", "oled", "buzzer", "gun", "sensors"]
        for k in target_keys:
            if k in self.config:
                overrides[k] = self.config[k]
        return overrides

    def get_active_model(self):
        """ModelFactorySetting.txt에 기입된 activeModel 값을 추출합니다 (기본값 rover)"""
        try:
            overrides = self.get_custom_component_names()
            if "model" in overrides:
                return overrides["model"].lower()
            if "theme" in overrides:
                return overrides["theme"].lower()
            
            # 오버라이드 중 gun 이름에 '발사대' 혹은 '로켓'이 포함될 때 자동으로 발사대 테마 지정
            if "gun" in overrides:
                gun_name = overrides["gun"]
                if "발사대" in gun_name or "로켓" in gun_name:
                    return "launchpad"
        except Exception as e:
            print(f"[Config] 테마 모델 판별 실패: {e}")
        return "rover"


# 전역 싱글톤 객체 생성
sys_config = SystemConfig()
