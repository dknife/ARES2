// 상수 정의

// 블루투스 설정
export const BLUETOOTH_CONFIG = {
    // UART 서비스 UUID (HM-10/BT05 호환)
    UART_SERVICE_UUID: '0000ffe0-0000-1000-8000-00805f9b34fb',
    // UART 특성 UUID
    UART_CHARACTERISTIC_UUID: '0000ffe1-0000-1000-8000-00805f9b34fb',
    // BLE 패킷당 최대 바이트
    MAX_CHUNK_SIZE: 20,
    // 명령 사이 딜레이 (ms) - 응답 기반이므로 최소값
    COMMAND_DELAY: 100,
    // BLE 청크 사이 딜레이 (ms)
    CHUNK_DELAY: 50,
    // 주기적 읽기 간격 (ms)
    READ_INTERVAL: 500,
    // 응답 타임아웃 (ms) - 대부분 명령은 빠르게 응답
    RESPONSE_TIMEOUT: 5000
};

// 기본 시스템 설정
export const DEFAULT_SYSTEM_CONFIG = {
    // 장치 설정
    device_name: 'ARES-Rover',
    // 안전 설정
    max_speed: 80,
    collision_distance: 10,
    auto_stop_enabled: true,
    // 캘리브레이션 설정
    left_calibration: 100,
    right_calibration: 100,
    // 블루투스 설정 (UI 전용)
    connection_timeout: 20000,
    reconnect_attempts: 3,
    chunk_size: 20,
    command_delay: 100
};

// 상태 색상
export const STATUS_COLORS = {
    GREEN: '#00ff9d',
    RED: '#ff0055',
    ORANGE: '#ffb800'
};

// 로컬 스토리지 키
export const STORAGE_KEYS = {
    SYSTEM_CONFIG: 'ares-system-config'
};

// 저장된 설정 로드
function loadSavedConfig() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.SYSTEM_CONFIG);
        if (saved) {
            const config = JSON.parse(saved);
            if (config.connection_timeout) {
                BLUETOOTH_CONFIG.RESPONSE_TIMEOUT = config.connection_timeout;
            }
            if (config.chunk_size) {
                BLUETOOTH_CONFIG.MAX_CHUNK_SIZE = config.chunk_size;
            }
            if (config.command_delay) {
                BLUETOOTH_CONFIG.COMMAND_DELAY = config.command_delay;
            }
        }
    } catch (e) {
        console.warn('[Constants] 설정 로드 실패:', e);
    }
}

// 모듈 로드 시 실행
loadSavedConfig();
