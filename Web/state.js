// 상태 관리

// 디버그 모드
export const DEBUG = false;

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
    lastCommand: null,

    // 실행 상태
    isExecuting: false,

    // 변수 저장소
    variables: {},

    // Promise 상태
    pendingResolve: null,
    pendingReject: null,
    pendingTimeout: null
};