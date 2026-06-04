// 블루투스 매니저

import { state, DEBUG } from './state.js';
import { elements } from './elements.js';
import { Logger } from './logger.js';
import { BLUETOOTH_CONFIG, STATUS_COLORS } from './constants.js';

// 수신 버퍼
let receiveBuffer = '';

export const BluetoothManager = {
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
                    { name: 'BT05' }
                ],
                optionalServices: [BLUETOOTH_CONFIG.UART_SERVICE_UUID]
            });

            Logger.add(`[BLE] 장치 발견: ${state.bluetoothDevice.name || 'Unknown'}`, 'info');

            state.bluetoothDevice.addEventListener(
                'gattserverdisconnected',
                this.onDeviceDisconnected.bind(this)
            );

            state.bluetoothServer = await state.bluetoothDevice.gatt.connect();
            await this.delay(2000);

            state.uartService = await state.bluetoothServer.getPrimaryService(
                BLUETOOTH_CONFIG.UART_SERVICE_UUID
            );
            Logger.add(`[BLE] 서비스 연결됨`, 'info');

            state.characteristic = await state.uartService.getCharacteristic(
                BLUETOOTH_CONFIG.UART_CHARACTERISTIC_UUID
            );

            try {
                await state.characteristic.startNotifications();
                state.characteristic.addEventListener(
                    'characteristicvaluechanged',
                    this.handleRxData.bind(this)
                );
                state.notificationsEnabled = true;
                Logger.add('[BLE] 알림 모드 활성화', 'info');
            } catch (error) {
                Logger.add(`[BLE] 폴링 모드로 전환`, 'info');
                this.startPeriodicReads();
            }

            state.isConnecting = false;
            state.connectFailed = false;
            this.updateConnectionStatus(true);
            Logger.add(`[연결] ${state.bluetoothDevice.name || 'Unknown'} 연결 완료`, 'success');
        } catch (error) {
            console.error('BLE 연결 오류:', error);
            Logger.add(`[오류] 연결 실패: ${error.message}`, 'error');
            await this.cleanup();
            state.isConnecting = false;
            state.connectFailed = true;
            this.updateConnectionStatus(false);
        }
    },

    // 연결 해제
    async disconnect() {
        try {
            if (state.characteristic && state.notificationsEnabled) {
                try {
                    await state.characteristic.stopNotifications();
                    state.characteristic.removeEventListener(
                        'characteristicvaluechanged',
                        this.handleRxData
                    );
                } catch (e) {
                    console.warn('알림 중지 오류:', e);
                }
            }

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
        receiveBuffer = '';
        
        if (state.characteristic && state.notificationsEnabled) {
            try {
                await state.characteristic.stopNotifications();
                state.characteristic.removeEventListener(
                    'characteristicvaluechanged',
                    this.handleRxData
                );
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
            state.bluetoothDevice.removeEventListener(
                'gattserverdisconnected',
                this.onDeviceDisconnected
            );
            state.bluetoothDevice = null;
        }
        
        state.notificationsEnabled = false;
        
        if (state.pendingTimeout) {
            clearTimeout(state.pendingTimeout);
            state.pendingResolve = null;
            state.pendingReject = null;
            state.pendingTimeout = null;
        }
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
        const decoder = new TextDecoder('utf-8');
        const chunk = decoder.decode(value);
        
        receiveBuffer += chunk;
        
        let newlineIndex;
        while ((newlineIndex = receiveBuffer.indexOf('\n')) !== -1) {
            const completeMessage = receiveBuffer.substring(0, newlineIndex).trim();
            receiveBuffer = receiveBuffer.substring(newlineIndex + 1);
            
            if (completeMessage) {
                this.processReceivedData(completeMessage);
            }
        }
        
        if (receiveBuffer.length > 1024) {
            const data = receiveBuffer.trim();
            receiveBuffer = '';
            if (data) {
                this.processReceivedData(data);
            }
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
        let device_name = '';

        if (parts.length >= 7) {
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
                connection_timeout: BLUETOOTH_CONFIG.RESPONSE_TIMEOUT
            }, '*');
        }

        this._resolvePromise(data);
        Logger.add('[수신] 시스템 설정값', 'success');
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

    // Promise 해결
    _resolvePromise(data) {
        if (state.pendingResolve) {
            if (state.pendingTimeout) clearTimeout(state.pendingTimeout);
            const resolve = state.pendingResolve;
            state.pendingResolve = null;
            state.pendingReject = null;
            state.pendingTimeout = null;
            resolve(data);
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
        const btn = elements.connectButton;
        if (btn) {
            btn.classList.remove('btn-connected', 'btn-failed');
            if (connected) {
                btn.textContent = '🔌 연결 - 신호 끊기';
                btn.classList.add('btn-connected');
                btn.disabled = false;
                btn.title = '연결을 끊으려면 클릭';
            } else if (state.isConnecting) {
                btn.textContent = '🔗 연결 중...';
                btn.disabled = true;
                btn.title = '연결 시도 중';
            } else if (state.connectFailed) {
                btn.textContent = '❌ 연결실패 - 재연결';
                btn.classList.add('btn-failed');
                btn.disabled = false;
                btn.title = '다시 연결을 시도합니다';
            } else {
                btn.textContent = '🔗 신호 연결';
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

    // 데이터 전송
    async sendData(data, waitForResponse = false) {
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
            responsePromise = new Promise((resolve, reject) => {
                state.pendingResolve = resolve;
                state.pendingReject = reject;
                state.pendingTimeout = setTimeout(() => {
                    state.pendingResolve = null;
                    state.pendingReject = null;
                    state.pendingTimeout = null;
                    reject(new Error('응답 시간 초과'));
                }, BLUETOOTH_CONFIG.RESPONSE_TIMEOUT);
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
            if (DEBUG) Logger.add(`전송 오류 무시됨: ${error.message}`, 'warning');
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
