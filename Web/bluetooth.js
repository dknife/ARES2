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
        elements.connectButton.disabled = true;
        this.updateStatus('아레스 탐색 중...', STATUS_COLORS.ORANGE);

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

            this.updateStatus('아레스에 연결 중...', STATUS_COLORS.ORANGE);
            Logger.add(`[BLE] 장치 발견: ${state.bluetoothDevice.name || 'Unknown'}`, 'info');

            state.bluetoothDevice.addEventListener(
                'gattserverdisconnected',
                this.onDeviceDisconnected.bind(this)
            );
            
            state.bluetoothServer = await state.bluetoothDevice.gatt.connect();
            await this.delay(2000);

            this.updateStatus('UART 서비스 연결 중...', STATUS_COLORS.ORANGE);
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

            this.updateConnectionStatus(true);
            Logger.add(`[연결] ${state.bluetoothDevice.name || 'Unknown'} 연결 완료`, 'success');

            state.isConnecting = false;
            elements.connectButton.disabled = false;
        } catch (error) {
            console.error('BLE 연결 오류:', error);
            Logger.add(`[오류] 연결 실패: ${error.message}`, 'error');
            await this.cleanup();
            state.isConnecting = false;
            elements.connectButton.disabled = false;
            this.updateStatus(`❌ 연결 실패: ${error.message}`, STATUS_COLORS.RED);
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

    // 연결 상태 UI 업데이트
    updateConnectionStatus(connected) {
        elements.connectButton.disabled = connected || state.isConnecting;
        elements.disconnectButton.disabled = !connected;
        
        const dashboardFrame = document.getElementById('dashboardFrame');
        const isDashboardMode = dashboardFrame && dashboardFrame.style.display !== 'none' && dashboardFrame.style.display !== '';
        
        if (!isDashboardMode) {
            elements.runButton.disabled = !connected;
        }
        
        const emergencyStopButton = document.getElementById('emergencyStopButton');
        if (emergencyStopButton) {
            emergencyStopButton.disabled = false;
        }

        const iframe = document.getElementById('dashboardFrame');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'connection_status',
                connected: connected
            }, '*');
        }

        if (connected) {
            elements.status.textContent = '✅ 아레스 연결됨';
            elements.status.style.color = STATUS_COLORS.GREEN;
            if (state.bluetoothDevice) {
                elements.deviceInfo.textContent = `장치: ${state.bluetoothDevice.name || 'Unknown'}`;
            }
        } else {
            elements.status.textContent = state.isConnecting ? '연결 중...' : '❌ 연결 끊김';
            elements.status.style.color = state.isConnecting ? STATUS_COLORS.ORANGE : STATUS_COLORS.RED;
            elements.deviceInfo.textContent = '';
        }
    },

    // 상태 메시지 업데이트
    updateStatus(message, color) {
        elements.status.textContent = message;
        elements.status.style.color = color;
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

        try {
            for (let i = 0; i < encodedData.length; i += BLUETOOTH_CONFIG.MAX_CHUNK_SIZE) {
                const chunk = encodedData.slice(
                    i,
                    Math.min(i + BLUETOOTH_CONFIG.MAX_CHUNK_SIZE, encodedData.length)
                );
                await state.characteristic.writeValueWithResponse(chunk);
                await this.delay(BLUETOOTH_CONFIG.CHUNK_DELAY);
            }
            if (DEBUG) Logger.add(`전송 완료: ${data}`, 'info');
        } catch (error) {
            if (DEBUG) Logger.add(`전송 오류 무시됨: ${error.message}`, 'warning');
        }

        if (!waitForResponse) {
            return 'OK';
        }

        return new Promise((resolve, reject) => {
            state.pendingResolve = resolve;
            state.pendingReject = reject;
            state.pendingTimeout = setTimeout(() => {
                state.pendingResolve = null;
                state.pendingReject = null;
                state.pendingTimeout = null;
                reject(new Error('응답 시간 초과'));
            }, BLUETOOTH_CONFIG.RESPONSE_TIMEOUT);
        });
    },

    // 딜레이 유틸리티
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};
