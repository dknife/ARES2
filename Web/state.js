// 상태 관리

// 디버그 모드
export const DEBUG = false;

// 기본 블럭코딩 탭 한글 이름 (기본값)
export const DEFAULT_TAB_NAMES = {
    wheel: "서보 모터",
    dcmotor: "DC 모터",
    buzzer: "소리",
    leds: "LED",
    oled: "디스플레이",
    gun: "발사",
    sensors: "센서"
};

// 앱 상태
export const state = {
    // 블루투스 상태
    bluetoothDevice: null,
    bluetoothServer: null,
    uartService: null,
    characteristic: null,
    notificationsEnabled: false,
    readIntervalId: null,
    isConnecting: false,
    connectFailed: false,           // 마지막 연결 시도가 실패했는지 (재연결 라벨용)
    lastCommand: null,

    // 실행 상태
    isExecuting: false,

    // 액티브 모델 ('gun' 또는 'launchpad')
    activeModel: 'gun',

    // 활성화된 모듈 정보 (null 이면 전체 활성화 상태로 취급)
    enabledModules: null,

    // 블럭코딩 탭 한글 이름 (기본값으로 초기화되고, Pico 연결 시 model.txt 값으로 오버라이드 가능)
    tabNames: Object.assign({}, DEFAULT_TAB_NAMES),

    // 변수 저장소
    variables: {},

    // Promise 상태
    pendingCommand: null,
    pendingResolve: null,
    pendingReject: null,
    pendingTimeout: null
};
