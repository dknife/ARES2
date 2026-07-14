// 블루투스 매니저

import { state, DEBUG, DEFAULT_BLOCK_NAMES } from './state.js';
import { elements } from './elements.js';
import { Logger } from './logger.js';
import { BLUETOOTH_CONFIG, STATUS_COLORS } from './constants.js';

// 수신 버퍼
let receiveByteBuffer = [];

export const BluetoothManager = {
    // addEventListener/removeEventListener에 같은 참조를 넘기기 위한 bound 핸들러.
    // (매번 .bind(this)로 등록하면 remove가 실패해 재연결마다 리스너가 누적된다.)
    _boundHandleRxData: null,
    _boundOnDeviceDisconnected: null,
    _sendQueue: Promise.resolve(),
    _abortCurrentWrite: false,
    _sendEpoch: 0,

    // 연결
    async connect() {
        if (state.isConnecting) {
            Logger.add('[경고] 이미 연결 시도 중입니다', 'error');
            return;
        }

        state.isConnecting = true;
        state.connectFailed = false;
        this.updateConnectionStatus(false);

        try {
            Logger.add('[BLE] 장치 검색 중...', 'info');

            state.bluetoothDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { name: 'PicoBLE' },
                    { name: 'HMSoft' },
                    { name: 'BT05' },
                    // 펌웨어가 AT+NAME{device_name}으로 모듈을 개명하면 위 고정
                    // 이름과 달라진다 — UART 서비스를 광고하는 장치는 이름과
                    // 무관하게 검색되도록 서비스 필터를 함께 둔다.
                    { services: [BLUETOOTH_CONFIG.UART_SERVICE_UUID] }
                ],
                optionalServices: [BLUETOOTH_CONFIG.UART_SERVICE_UUID]
            });

            Logger.add(`[BLE] 장치 발견: ${state.bluetoothDevice.name || 'Unknown'}`, 'info');

            if (!this._boundOnDeviceDisconnected) {
                this._boundOnDeviceDisconnected = this.onDeviceDisconnected.bind(this);
            }
            state.bluetoothDevice.addEventListener(
                'gattserverdisconnected',
                this._boundOnDeviceDisconnected
            );

            state.bluetoothServer = await state.bluetoothDevice.gatt.connect();
            Logger.add('[BLE] GATT 연결됨', 'info');
            await this.delay(2000);

            state.uartService = await state.bluetoothServer.getPrimaryService(
                BLUETOOTH_CONFIG.UART_SERVICE_UUID
            );
            Logger.add(`[BLE] 서비스 연결됨`, 'info');

            state.characteristic = await state.uartService.getCharacteristic(
                BLUETOOTH_CONFIG.UART_CHARACTERISTIC_UUID
            );
            Logger.add('[BLE] UART 특성 연결됨', 'info');

            try {
                await state.characteristic.startNotifications();
                if (!this._boundHandleRxData) {
                    this._boundHandleRxData = this.handleRxData.bind(this);
                }
                state.characteristic.addEventListener(
                    'characteristicvaluechanged',
                    this._boundHandleRxData
                );
                state.notificationsEnabled = true;
                Logger.add('[BLE] 알림 모드 활성화', 'info');
            } catch (error) {
                Logger.add(`[BLE] 알림 실패, 폴링 모드로 전환: ${error.message}`, 'warning');
                this.startPeriodicReads();
            }

            state.isConnecting = false;
            state.connectFailed = false;
            this.updateConnectionStatus(true);
            Logger.add(`[연결] ${state.bluetoothDevice.name || 'Unknown'} 연결 완료`, 'success');
            // 연결 인사 — 요원 코드를 부저 멜로디로 연주 + OLED 표시 (연결 흐름은 막지 않음)
            this.playConnectGreeting().catch(() => {});
        } catch (error) {
            console.error('BLE 연결 오류:', error);
            Logger.add(`[오류] 연결 실패: ${error.message}`, 'error');
            await this.cleanup();
            state.isConnecting = false;
            state.connectFailed = true;
            this.updateConnectionStatus(false);
        }
    },

    // ==== 연결 인사 (2026-07-14) ====
    // 블루투스 연결이 이루어지면 저장된 요원 코드(ares-agent-code)를
    // (1) 부저 멜로디로 연주 — A~G 는 라~솔(A=라, B=시, C=도, D=레, E=미, F=파, G=솔),
    //     그 외 알파벳·숫자는 7음계를 순환 매핑해 어떤 코드든 소리가 나게 한다.
    // (2) OLED 에 "Connected: CODE" 를 표시한다.
    // 모듈이 없는 기기는 펌웨어가 해당 명령을 조용히 무시하므로(return 0) 안전하다.
    async playConnectGreeting() {
        let code = '';
        try {
            code = (localStorage.getItem('ares-agent-code') || '').replace(/[^A-Za-z0-9]/g, '');
        } catch (_) { /* localStorage 불가 환경 */ }
        const label = code || 'READY';

        // OLED: Connected: CODE
        try {
            await this.sendData(`MSG,Connected: ${label}`);
        } catch (error) {
            Logger.add(`[연결 인사] OLED 표시 실패: ${error.message}`, 'warning');
            return;
        }

        // 부저 멜로디 — 문자당 한 음. A(라)=440, B(시)=494, C(도)=523, D(레)=587,
        // E(미)=659, F(파)=698, G(솔)=784 (알파벳 순 = 상행 음계).
        const NOTE_FREQ = [440, 494, 523, 587, 659, 698, 784];
        const NOTE_SEC = 0.22;     // 음 길이(초) — BUZZER_ON 은 논블로킹이라 웹이 페이싱한다
        const NOTE_GAP_MS = 280;   // 음 사이 간격(재생 220ms + 여유)
        const chars = label.slice(0, 10).split('');   // 과도한 연주 방지(최대 10음)
        for (const ch of chars) {
            let idx;
            if (/[A-Za-z]/.test(ch)) idx = (ch.toUpperCase().charCodeAt(0) - 65) % 7;
            else idx = (ch.charCodeAt(0) - 48) % 7;   // 숫자 0~9 → 7음 순환
            try {
                await this.sendData(`BUZZER_ON,${NOTE_FREQ[idx]},${NOTE_SEC}`);
            } catch (error) {
                Logger.add(`[연결 인사] 멜로디 중단: ${error.message}`, 'warning');
                return;
            }
            await this.delay(NOTE_GAP_MS);
            // 연주 도중 연결이 끊기면 중단
            if (!state.bluetoothDevice || !state.bluetoothDevice.gatt.connected) return;
        }
        Logger.add(`[연결 인사] 요원 코드 '${label}' 멜로디 · OLED 표시 완료`, 'info');
    },

    // 연결 해제 (알림 중지/리스너 제거는 cleanup이 담당)
    async disconnect() {
        try {
            if (state.bluetoothDevice && state.bluetoothDevice.gatt.connected) {
                await state.bluetoothDevice.gatt.disconnect();
            }

            await this.cleanup();
            state.connectFailed = false;
            this.updateConnectionStatus(false);
            Logger.add('[연결] 해제 완료', 'info');
        } catch (error) {
            console.error('연결 해제 오류:', error);
            Logger.add(`[오류] 연결 해제 실패: ${error.message}`, 'error');
        }
    },

    // 리소스 정리
    async cleanup() {
        receiveByteBuffer = [];
        
        if (state.characteristic && state.notificationsEnabled) {
            try {
                await state.characteristic.stopNotifications();
                if (this._boundHandleRxData) {
                    state.characteristic.removeEventListener(
                        'characteristicvaluechanged',
                        this._boundHandleRxData
                    );
                }
            } catch (e) {
                console.warn('알림 정리 오류:', e);
            }
        }
        
        if (state.readIntervalId) {
            clearInterval(state.readIntervalId);
            state.readIntervalId = null;
        }
        
        state.characteristic = null;
        state.uartService = null;
        state.bluetoothServer = null;

        if (state.bluetoothDevice) {
            if (this._boundOnDeviceDisconnected) {
                state.bluetoothDevice.removeEventListener(
                    'gattserverdisconnected',
                    this._boundOnDeviceDisconnected
                );
            }
            state.bluetoothDevice = null;
        }

        state.notificationsEnabled = false;

        // 응답 대기 중이던 promise는 반드시 reject로 settle시킨다.
        // (타이머만 지우고 방치하면 sendData의 await가 영원히 끝나지 않아
        //  executeWorkspace가 멈춘 채로 남는다.)
        if (state.pendingTimeout) {
            clearTimeout(state.pendingTimeout);
            state.pendingTimeout = null;
        }
        if (state.pendingReject) {
            const reject = state.pendingReject;
            const command = state.pendingCommand;
            state.pendingCommand = null;
            state.pendingResolve = null;
            state.pendingReject = null;
            reject(new Error(`연결이 끊어져 응답 대기를 취소했습니다: ${command || 'unknown'}`));
        }
        state.pendingCommand = null;
        state.pendingResolve = null;
    },

    // 연결 해제 이벤트
    onDeviceDisconnected() {
        console.log('장치 연결 해제됨');
        this.updateConnectionStatus(false);
        Logger.add('[연결] 끊어짐', 'warning');
        this.cleanup();
    },

    // 데이터 수신 핸들러
    handleRxData(event) {
        const value = event.target.value;
        
        // 새 바이트 청크를 바이트 버퍼 배열에 추가
        for (let i = 0; i < value.byteLength; i++) {
            receiveByteBuffer.push(value.getUint8(i));
        }
        
        // 개행문자 (\n = ASCII 10) 기준으로 메시지 분할
        let newlineIndex;
        while ((newlineIndex = receiveByteBuffer.indexOf(10)) !== -1) {
            // 개행문자 이전까지의 바이트를 모아 단일 Array로 생성
            const lineBytes = new Uint8Array(receiveByteBuffer.slice(0, newlineIndex));
            // 버퍼에서 소모된 바이트를 자르고 개행문자(10)를 건너뛰어 대치
            receiveByteBuffer = receiveByteBuffer.slice(newlineIndex + 1);
            
            // 완성된 온전한 바이트 어레이를 한 번에 한글 디코딩! (비트 깨짐 완벽 방지)
            const decoder = new TextDecoder('utf-8');
            const completeMessage = decoder.decode(lineBytes).trim();
            
            if (completeMessage) {
                this.processReceivedData(completeMessage);
            }
        }
        
        // 비정상 패킷 방어로 버퍼가 너무 커지면 초기화
        if (receiveByteBuffer.length > 2048) {
            receiveByteBuffer = [];
        }
    },

    // 수신 데이터 처리
    processReceivedData(receivedData) {
        if (!receivedData) return;

        if (receivedData.startsWith('STATUS,')) {
            const iframe = document.getElementById('dashboardFrame');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'status_update',
                    data: receivedData
                }, '*');
            }
            this._resolvePromise(receivedData);
            return;
        }

        if (receivedData.startsWith('SYS_VALUES,')) {
            this._handleSysValues(receivedData);
            return;
        }

        if (receivedData.startsWith('MODULES,')) {
            this._handleModules(receivedData);
            return;
        }

        if (receivedData.startsWith('NAMES,')) {
            this._handleNames(receivedData);
            return;
        }

        if (receivedData.startsWith('CALIB_VALUES,')) {
            this._handleCalibValues(receivedData);
            return;
        }

        if (DEBUG) Logger.add(`[수신] ${receivedData}`, 'info');
        this._resolvePromise(receivedData);
        this._updateBlocklyVariable(receivedData);
    },

    // SYS_VALUES 처리
    _handleSysValues(data) {
        const parts = data.split(',');
        const iframe = document.getElementById('dashboardFrame');

        const max_speed = parts[1];
        const collision_dist = parts[2];
        const auto_stop = parts[3];

        let left_calib = undefined;
        let right_calib = undefined;
        let active_model = undefined;
        let device_name = '';

        if (parts.length >= 8) {
            left_calib = parts[parts.length - 3];
            right_calib = parts[parts.length - 2];
            active_model = parts[parts.length - 1];
            device_name = parts.slice(4, parts.length - 3).join(',');
        } else if (parts.length >= 7) {
            left_calib = parts[parts.length - 2];
            right_calib = parts[parts.length - 1];
            device_name = parts.slice(4, parts.length - 2).join(',');
        } else {
            device_name = parts.slice(4).join(',');
        }

        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'sys_values',
                max_speed: max_speed,
                collision_dist: collision_dist,
                auto_stop: auto_stop,
                device_name: device_name,
                left_calibration: left_calib,
                right_calibration: right_calib,
                active_model: active_model,
                connection_timeout: BLUETOOTH_CONFIG.RESPONSE_TIMEOUT
            }, '*');
        }

        // Pico 설정의 model 값을 우선하고, 예전 펌웨어만 장치명으로 보정한다.
        if (active_model) {
            state.activeModel = active_model.toLowerCase();
        } else if (device_name.toLowerCase().includes('launchpad') || device_name.includes('발사대')) {
            state.activeModel = 'launchpad';
        }
        if (window.updateToolboxForActiveState) {
            window.updateToolboxForActiveState();
        }

        this._resolvePromise(data);
        Logger.add('[수신] 시스템 설정값', 'success');
    },

    // MODULES 처리
    _handleModules(data) {
        try {
            // Format: MODULES,wheel:ON,dcmotor:ON,buzzer:ON,distance:ON,magsensor:ON,leds:ON,gun:ON,oled:ON
            const parts = data.split(',');
            const enabledModules = {};
            for (let i = 1; i < parts.length; i++) {
                const pair = parts[i].split(':');
                if (pair.length === 2) {
                    const moduleName = pair[0].trim();
                    const status = pair[1].trim();
                    enabledModules[moduleName] = (status === 'ON');
                }
            }
            state.enabledModules = enabledModules;
            if (window.updateToolboxForActiveState) {
                window.updateToolboxForActiveState();
            }
        } catch (e) {
            console.error('[Bluetooth] MODULES 파싱 오류:', e);
        }
        this._resolvePromise(data);
        Logger.add('[수신] 활성화된 모듈 정보', 'success');
    },

    // NAMES 처리
    _handleNames(data) {
        try {
            // Format: NAMES,model:rover,wheel:서보 모터,dcmotor:DC 모터,leds:신호등...
            const parts = data.split(',');
            const blockNames = Object.assign({}, DEFAULT_BLOCK_NAMES);
            for (let i = 1; i < parts.length; i++) {
                const pair = parts[i].split(':');
                if (pair.length === 2) {
                    const key = pair[0].trim();
                    const val = pair[1].trim();
                    
                    if (key === 'model' || key === 'theme') {
                        state.activeModel = val.toLowerCase();
                    } else if (key in blockNames) {
                        blockNames[key] = val;
                    }
                }
            }
            state.blockNames = blockNames;
            if (window.updateToolboxForActiveState) {
                window.updateToolboxForActiveState();
            }
        } catch (e) {
            console.error('[Bluetooth] NAMES 파싱 오류:', e);
        }
        this._resolvePromise(data);
        Logger.add('[수신] 블록 이름 정보', 'success');
    },

    // CALIB_VALUES 처리
    _handleCalibValues(data) {
        const parts = data.split(',');
        const iframe = document.getElementById('dashboardFrame');
        
        if (iframe && iframe.contentWindow && parts.length >= 3) {
            iframe.contentWindow.postMessage({
                type: 'calib_values',
                left: parts[1],
                right: parts[2]
            }, '*');
        }
        
        Logger.add(`[수신] 캘리브레이션: 좌=${parts[1]}, 우=${parts[2]}`, 'info');
        this._resolvePromise(data);
    },

    // 명령별 기대 응답 접두어. 값 반환 명령 대기 중에 도착한 무관 데이터
    // (대개 직전 blocking 명령의 늦은 ack "1")가 promise를 잘못 resolve해
    // 이후 응답 스트림이 한 칸씩 밀리던 desync를 차단한다.
    _expectedResponsePrefix(command) {
        if (!command) return null;
        switch (command.split(',')[0]) {
            case 'DISTANCE':    return 'DIST';
            case 'MAGNET':      return 'MAG';
            case 'GET_SYS':     return 'SYS_VALUES';
            case 'GET_MODULES': return 'MODULES';
            case 'GET_NAMES':   return 'NAMES';
            case 'GET_STATUS':  return 'STATUS';
            default:            return null;
        }
    },

    // Promise 해결
    _resolvePromise(data) {
        if (state.pendingResolve) {
            const expected = this._expectedResponsePrefix(state.pendingCommand);
            if (expected && !String(data).toUpperCase().startsWith(expected)) {
                Logger.add(`[BLE] ${state.pendingCommand} 대기 중 무관 응답 무시: ${data}`, 'warning');
                return;
            }
            if (state.pendingTimeout) clearTimeout(state.pendingTimeout);
            const resolve = state.pendingResolve;
            state.pendingCommand = null;
            state.pendingResolve = null;
            state.pendingReject = null;
            state.pendingTimeout = null;
            resolve(data);
        } else if (DEBUG) {
            Logger.add(`[BLE] 대기 중인 명령 없이 수신됨: ${data}`, 'warning');
        }
    },

    // Blockly 변수 업데이트
    _updateBlocklyVariable(data) {
        const distMatch = data.match(/DIST[:\s]*([\d.]+)/i);
        if (distMatch) {
            state.variables['_last_distance'] = distMatch[1];
        }
        
        const magMatch = data.match(/MAG[:\s]*([\d]+)/i);
        if (magMatch) {
            state.variables['_last_magnetic'] = magMatch[1];
        }
    },

    // 특성 값 읽기
    async readCharacteristic() {
        if (!state.characteristic || !state.bluetoothDevice.gatt.connected) return;
        
        try {
            const value = await state.characteristic.readValue();
            const decoder = new TextDecoder();
            const receivedData = decoder.decode(value).trim();
            
            if (receivedData) {
                if (DEBUG) Logger.add(`[읽기] ${receivedData}`, 'receive');
                this.processReceivedData(receivedData);
            }
        } catch (error) {
            console.error('읽기 오류:', error);
            Logger.add(`[오류] 읽기 실패: ${error.message}`, 'error');
        }
    },

    // 주기적 읽기 시작
    startPeriodicReads() {
        if (!state.readIntervalId) {
            state.readIntervalId = setInterval(
                () => this.readCharacteristic(),
                BLUETOOTH_CONFIG.READ_INTERVAL
            );
        }
    },

    // 연결 상태 UI 업데이트 — connectButton 4-state 라벨/색을 갱신.
    // runButton 상태는 main.js 의 updateRunButtonUI 에 위임(이벤트로 통지).
    updateConnectionStatus(connected) {
        if (!connected) {
            state.enabledModules = null;
            state.blockNames = Object.assign({}, DEFAULT_BLOCK_NAMES);
            if (window.updateToolboxForActiveState) {
                window.updateToolboxForActiveState();
            }
        }

        const btn = elements.connectButton;
        if (btn) {
            const label = btn.querySelector('.mobile-nav-label');
            const setLabel = (text) => {
                if (label) label.textContent = text;
                else btn.textContent = text;
            };
            btn.classList.remove('btn-connected', 'btn-failed');
            if (connected) {
                setLabel('연결됨');
                btn.classList.add('btn-connected');
                btn.disabled = false;
                btn.title = '연결을 끊으려면 클릭';
            } else if (state.isConnecting) {
                setLabel('연결 중…');
                btn.disabled = true;
                btn.title = '연결 시도 중';
            } else if (state.connectFailed) {
                setLabel('재연결');
                btn.classList.add('btn-failed');
                btn.disabled = false;
                btn.title = '다시 연결을 시도합니다';
            } else {
                setLabel('신호연결');
                btn.disabled = false;
                btn.title = '아레스 탐사선과 연결';
            }
        }

        // main.js 가 runButton 라벨/활성을 갱신할 수 있도록 알림
        window.dispatchEvent(new CustomEvent('ares:connection', { detail: { connected } }));

        const iframe = document.getElementById('dashboardFrame');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'connection_status',
                connected: connected
            }, '*');
        }
    },

    // 상태 메시지 업데이트 — #status 요소가 사라졌으므로 Logger 로만 흘려보낸다.
    updateStatus(message, _color) {
        if (typeof message === 'string' && message.trim()) {
            Logger.add(`[상태] ${message}`, 'info');
        }
    },

    // 대기 중인 응답 promise를 즉시 종료한다(비상정지 등).
    // _sendQueue가 [쓰기+응답대기]를 통째로 직렬화하므로, 이걸 끊어야
    // 뒤이어 보내는 STOP_ALL이 앞 명령의 응답/타임아웃까지 기다리지 않고
    // 곧장 전송된다.
    cancelPendingResponse(reason) {
        if (!state.pendingReject) return;
        if (state.pendingTimeout) clearTimeout(state.pendingTimeout);
        const reject = state.pendingReject;
        const command = state.pendingCommand;
        state.pendingCommand = null;
        state.pendingResolve = null;
        state.pendingReject = null;
        state.pendingTimeout = null;
        reject(new Error(`${reason || '취소됨'}: ${command || ''}`));
    },

    // 비상정지는 일반 명령 큐를 기다리면 안 된다. 현재 응답 대기와 멀티 청크
    // 전송을 끊도록 표시한 뒤 STOP_ALL을 우선 전송한다.
    async emergencyStop(command = 'STOP_ALL') {
        this._abortCurrentWrite = true;
        this._sendEpoch++;
        this.cancelPendingResponse('비상정지');
        this._sendQueue = Promise.resolve();

        try {
            let lastError = null;
            for (let attempt = 0; attempt < 10; attempt++) {
                try {
                    await this._sendDataNow(command, false, null, { priority: true });
                    return;
                } catch (error) {
                    lastError = error;
                    await this.delay(50);
                }
            }
            throw lastError;
        } finally {
            this._abortCurrentWrite = false;
        }
    },

    // 응답 타임아웃 계산. 펌웨어가 blocking 처리하는 시간지정 명령
    // (SERVO_t*/DC_t*/SLEEP/BATCH/SING)은 동작이 끝난 뒤에야 ack를 보내므로
    // 예상 소요시간을 기본 타임아웃에 더한다. (5초 넘는 이동이 항상
    // 타임아웃되고 늦은 ack가 다음 명령 promise를 오염시키던 문제의 근본 수정)
    _estimateTimeoutMs(command) {
        return BLUETOOTH_CONFIG.RESPONSE_TIMEOUT + this._estimateBlockingMs(command);
    },

    _estimateBlockingMs(command) {
        if (typeof command !== 'string') return 0;
        if (command.startsWith('BATCH;')) {
            let total = 0;
            for (const sub of command.slice(6).split('|')) {
                total += this._estimateBlockingMs(sub.trim());
            }
            return total;
        }
        const parts = command.split(',');
        const head = parts[0];
        let sec = 0;
        if (head.startsWith('SERVO_t') || head.startsWith('DC_t') ||
            head === 'SLEEP' || head === 'tFORWARD' || head === 'tBACKWARD' ||
            head === 'tLEFT' || head === 'tRIGHT') {
            sec = parseFloat(parts[1]) || 0;
        } else if (head === 'tDCMOTOR') {
            sec = parseFloat(parts[2]) || 0;
        } else if (head === 'BUZZER_ON') {
            // 단독 BUZZER_ON은 논블로킹이지만 BATCH 안에서는 펌웨어가
            // 음이 끝날 때까지 대기하므로 합산 대상이다.
            sec = parseFloat(parts[2]) || 0;
        } else if (head === 'SING') {
            sec = 20; // 내장 멜로디 대략치
        }
        return Math.min(Math.max(sec, 0), 120) * 1000;
    },

    // 데이터 전송
    async sendData(data, waitForResponse = false, timeoutMs = null) {
        const epoch = this._sendEpoch;
        const sendTask = () => {
            if (epoch !== this._sendEpoch) {
                throw new Error('비상정지로 대기 중인 전송을 취소했습니다.');
            }
            return this._sendDataNow(data, waitForResponse, timeoutMs, { epoch });
        };
        const queuedSend = this._sendQueue.then(sendTask, sendTask);
        this._sendQueue = queuedSend.catch(() => {});
        return queuedSend;
    },

    async _sendDataNow(data, waitForResponse = false, timeoutMs = null, options = {}) {
        if (options.epoch !== undefined && options.epoch !== this._sendEpoch) {
            throw new Error('비상정지로 현재 전송을 중단했습니다.');
        }
        if (this._abortCurrentWrite && !options.priority) {
            throw new Error('비상정지로 현재 전송을 중단했습니다.');
        }

        if (!state.characteristic) {
            throw new Error('BLE 장치에 연결되어 있지 않습니다.');
        }
        
        if (!state.bluetoothDevice?.gatt?.connected) {
            throw new Error('BLE 연결이 끊어졌습니다.');
        }

        Logger.add(`[전송] ${data}`, 'send');
        const encoder = new TextEncoder();
        const encodedData = encoder.encode(data + '\n');
        state.lastCommand = data;

        // 응답 대기 명령은 송신을 시작하기 *전*에 미리 promise를 설정한다.
        // Pico의 BATCH 처리가 매우 빨라 마지막 청크 송신 완료 직후 도착하는
        // 응답이 pendingResolve=null 상태에서 _resolvePromise에 의해 버려지는
        // race를 막는다. 일반 응답 대기 명령(센서 등)에도 같은 안전성이 적용된다.
        let responsePromise = null;
        if (waitForResponse) {
            const timeout = timeoutMs || this._estimateTimeoutMs(data);
            responsePromise = new Promise((resolve, reject) => {
                state.pendingCommand = data;
                state.pendingResolve = resolve;
                state.pendingReject = reject;
                state.pendingTimeout = setTimeout(() => {
                    const command = state.pendingCommand;
                    state.pendingCommand = null;
                    state.pendingResolve = null;
                    state.pendingReject = null;
                    state.pendingTimeout = null;
                    reject(new Error(`응답 시간 초과: ${command || data}`));
                }, timeout);
            });
        }

        // writeValueWithoutResponse는 GATT ACK를 기다리지 않아 청크 사이 지연이
        // CHUNK_DELAY 만으로 결정된다. with-response 모드보다 멀티 청크 송신이
        // 빠르며, BT05/HM-10 클론에서 connection interval에 더 많은 청크를
        // 묶어 보낼 수 있다. 일부 characteristic이 without-response를 지원하지
        // 않는 경우에 대비해 with-response로 fallback한다.
        const useWithoutResponse =
          state.characteristic.properties &&
          state.characteristic.properties.writeWithoutResponse;
        try {
            for (let i = 0; i < encodedData.length; i += BLUETOOTH_CONFIG.MAX_CHUNK_SIZE) {
                if (options.epoch !== undefined && options.epoch !== this._sendEpoch) {
                    throw new Error('비상정지로 현재 전송을 중단했습니다.');
                }
                if (this._abortCurrentWrite && !options.priority) {
                    throw new Error('비상정지로 현재 전송을 중단했습니다.');
                }

                const chunk = encodedData.slice(
                    i,
                    Math.min(i + BLUETOOTH_CONFIG.MAX_CHUNK_SIZE, encodedData.length)
                );
                if (useWithoutResponse) {
                    await state.characteristic.writeValueWithoutResponse(chunk);
                } else {
                    await state.characteristic.writeValueWithResponse(chunk);
                }
                // 청크 사이에만 페이싱 — 마지막 청크 송신 후에는 즉시 종료한다.
                // 단일 청크 명령(LED_ON 등)이 100ms를 통째로 손해보던 문제를 제거하고,
                // 멀티 청크 BATCH는 청크 사이 100ms 안정성을 그대로 유지한다.
                if (i + BLUETOOTH_CONFIG.MAX_CHUNK_SIZE < encodedData.length) {
                    await this.delay(BLUETOOTH_CONFIG.CHUNK_DELAY);
                }
            }
            if (DEBUG) Logger.add(`전송 완료: ${data}`, 'info');
        } catch (error) {
            if (state.pendingTimeout) clearTimeout(state.pendingTimeout);
            state.pendingCommand = null;
            state.pendingResolve = null;
            state.pendingReject = null;
            state.pendingTimeout = null;
            Logger.add(`[오류] 전송 실패: ${data} - ${error.message}`, 'error');
            throw error;
        }

        if (!waitForResponse) {
            return 'OK';
        }

        return responsePromise;
    },

    // 딜레이 유틸리티
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};
