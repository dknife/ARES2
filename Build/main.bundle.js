(() => {
  // state.js
  var DEBUG = false;
  var state = {
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

  // elements.js
  var elements = {
    // 상태 표시
    status: document.getElementById("status"),
    deviceInfo: document.getElementById("deviceInfo"),
    // 제어 버튼
    connectButton: document.getElementById("connectButton"),
    disconnectButton: document.getElementById("disconnectButton"),
    runButton: document.getElementById("runButton"),
    saveButton: document.getElementById("saveButton"),
    loadButton: document.getElementById("loadButton"),
    // 파일 입력
    fileInput: document.getElementById("fileInput"),
    // 로그 패널
    logContent: document.getElementById("logContent"),
    logContainer: document.getElementById("logContainer"),
    clearLogBtn: document.getElementById("clearLogBtn")
  };

  // logger.js
  var MAX_COMPACT_LINES = 3;
  var MAX_ENTRIES = 500;
  var entries = [];
  function isExpanded() {
    var _a;
    const container = (_a = elements.logContainer) != null ? _a : document.getElementById("logContainer");
    return container == null ? void 0 : container.classList.contains("expanded");
  }
  function render() {
    const expanded = isExpanded();
    const visible = expanded ? entries : entries.filter((e) => !e.verbose).slice(-MAX_COMPACT_LINES);
    elements.logContent.innerHTML = "";
    for (const entry of visible) {
      const logEntry = document.createElement("div");
      logEntry.className = `log-entry log-${entry.type}`;
      const detailHtml = expanded && entry.detail ? `<div class="log-detail">${escapeHtml(entry.detail)}</div>` : "";
      logEntry.innerHTML = `
            <span class="log-timestamp">${entry.timestamp}</span>
            ${escapeHtml(entry.message)}
            ${detailHtml}
        `;
      elements.logContent.appendChild(logEntry);
    }
    if (expanded) {
      elements.logContent.scrollTop = elements.logContent.scrollHeight;
    }
  }
  function escapeHtml(str) {
    return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  var Logger = {
    add(message, type = "info", options = {}) {
      const entry = {
        timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString(),
        message,
        type,
        verbose: !!options.verbose,
        detail: options.detail || ""
      };
      entries.push(entry);
      if (entries.length > MAX_ENTRIES) {
        entries.shift();
      }
      render();
    },
    clear() {
      entries.length = 0;
      elements.logContent.innerHTML = "";
    },
    refresh() {
      render();
    }
  };

  // constants.js
  var BLUETOOTH_CONFIG = {
    // UART 서비스 UUID (HM-10/BT05 호환)
    UART_SERVICE_UUID: "0000ffe0-0000-1000-8000-00805f9b34fb",
    // UART 특성 UUID
    UART_CHARACTERISTIC_UUID: "0000ffe1-0000-1000-8000-00805f9b34fb",
    // BLE 패킷당 최대 바이트
    MAX_CHUNK_SIZE: 20,
    // 명령 사이 딜레이 (ms) - 응답 기반이므로 최소값
    COMMAND_DELAY: 100,
    // BLE 청크 사이 딜레이 (ms). HM-10/BT05 connection interval(30~70ms)을 충분히 넘기는
    // 100ms로 두어 멀티 청크 명령(BATCH, LED 패턴, SYS_SET)의 청크 손실을 줄인다.
    CHUNK_DELAY: 100,
    // 주기적 읽기 간격 (ms)
    READ_INTERVAL: 500,
    // 응답 타임아웃 (ms) - 대부분 명령은 빠르게 응답
    RESPONSE_TIMEOUT: 5e3
  };
  var STATUS_COLORS = {
    GREEN: "#00ff9d",
    RED: "#ff0055",
    ORANGE: "#ffb800"
  };
  var STORAGE_KEYS = {
    SYSTEM_CONFIG: "ares-system-config"
  };
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
      console.warn("[Constants] \uC124\uC815 \uB85C\uB4DC \uC2E4\uD328:", e);
    }
  }
  loadSavedConfig();

  // bluetooth.js
  var receiveBuffer = "";
  var BluetoothManager = {
    // 연결
    async connect() {
      if (state.isConnecting) {
        Logger.add("[\uACBD\uACE0] \uC774\uBBF8 \uC5F0\uACB0 \uC2DC\uB3C4 \uC911\uC785\uB2C8\uB2E4", "error");
        return;
      }
      state.isConnecting = true;
      elements.connectButton.disabled = true;
      this.updateStatus("\uC544\uB808\uC2A4 \uD0D0\uC0C9 \uC911...", STATUS_COLORS.ORANGE);
      try {
        Logger.add("[BLE] \uC7A5\uCE58 \uAC80\uC0C9 \uC911...", "info");
        state.bluetoothDevice = await navigator.bluetooth.requestDevice({
          filters: [
            { name: "PicoBLE" },
            { name: "HMSoft" },
            { name: "BT05" }
          ],
          optionalServices: [BLUETOOTH_CONFIG.UART_SERVICE_UUID]
        });
        this.updateStatus("\uC544\uB808\uC2A4\uC5D0 \uC5F0\uACB0 \uC911...", STATUS_COLORS.ORANGE);
        Logger.add(`[BLE] \uC7A5\uCE58 \uBC1C\uACAC: ${state.bluetoothDevice.name || "Unknown"}`, "info");
        state.bluetoothDevice.addEventListener(
          "gattserverdisconnected",
          this.onDeviceDisconnected.bind(this)
        );
        state.bluetoothServer = await state.bluetoothDevice.gatt.connect();
        await this.delay(2e3);
        this.updateStatus("UART \uC11C\uBE44\uC2A4 \uC5F0\uACB0 \uC911...", STATUS_COLORS.ORANGE);
        state.uartService = await state.bluetoothServer.getPrimaryService(
          BLUETOOTH_CONFIG.UART_SERVICE_UUID
        );
        Logger.add(`[BLE] \uC11C\uBE44\uC2A4 \uC5F0\uACB0\uB428`, "info");
        state.characteristic = await state.uartService.getCharacteristic(
          BLUETOOTH_CONFIG.UART_CHARACTERISTIC_UUID
        );
        try {
          await state.characteristic.startNotifications();
          state.characteristic.addEventListener(
            "characteristicvaluechanged",
            this.handleRxData.bind(this)
          );
          state.notificationsEnabled = true;
          Logger.add("[BLE] \uC54C\uB9BC \uBAA8\uB4DC \uD65C\uC131\uD654", "info");
        } catch (error) {
          Logger.add(`[BLE] \uD3F4\uB9C1 \uBAA8\uB4DC\uB85C \uC804\uD658`, "info");
          this.startPeriodicReads();
        }
        this.updateConnectionStatus(true);
        Logger.add(`[\uC5F0\uACB0] ${state.bluetoothDevice.name || "Unknown"} \uC5F0\uACB0 \uC644\uB8CC`, "success");
        state.isConnecting = false;
        elements.connectButton.disabled = false;
      } catch (error) {
        console.error("BLE \uC5F0\uACB0 \uC624\uB958:", error);
        Logger.add(`[\uC624\uB958] \uC5F0\uACB0 \uC2E4\uD328: ${error.message}`, "error");
        await this.cleanup();
        state.isConnecting = false;
        elements.connectButton.disabled = false;
        this.updateStatus(`\u274C \uC5F0\uACB0 \uC2E4\uD328: ${error.message}`, STATUS_COLORS.RED);
      }
    },
    // 연결 해제
    async disconnect() {
      try {
        if (state.characteristic && state.notificationsEnabled) {
          try {
            await state.characteristic.stopNotifications();
            state.characteristic.removeEventListener(
              "characteristicvaluechanged",
              this.handleRxData
            );
          } catch (e) {
            console.warn("\uC54C\uB9BC \uC911\uC9C0 \uC624\uB958:", e);
          }
        }
        if (state.bluetoothDevice && state.bluetoothDevice.gatt.connected) {
          await state.bluetoothDevice.gatt.disconnect();
        }
        await this.cleanup();
        this.updateConnectionStatus(false);
        Logger.add("[\uC5F0\uACB0] \uD574\uC81C \uC644\uB8CC", "info");
      } catch (error) {
        console.error("\uC5F0\uACB0 \uD574\uC81C \uC624\uB958:", error);
        Logger.add(`[\uC624\uB958] \uC5F0\uACB0 \uD574\uC81C \uC2E4\uD328: ${error.message}`, "error");
      }
    },
    // 리소스 정리
    async cleanup() {
      receiveBuffer = "";
      if (state.characteristic && state.notificationsEnabled) {
        try {
          await state.characteristic.stopNotifications();
          state.characteristic.removeEventListener(
            "characteristicvaluechanged",
            this.handleRxData
          );
        } catch (e) {
          console.warn("\uC54C\uB9BC \uC815\uB9AC \uC624\uB958:", e);
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
          "gattserverdisconnected",
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
      console.log("\uC7A5\uCE58 \uC5F0\uACB0 \uD574\uC81C\uB428");
      this.updateConnectionStatus(false);
      Logger.add("[\uC5F0\uACB0] \uB04A\uC5B4\uC9D0", "warning");
      this.cleanup();
    },
    // 데이터 수신 핸들러
    handleRxData(event) {
      const value = event.target.value;
      const decoder = new TextDecoder("utf-8");
      const chunk = decoder.decode(value);
      receiveBuffer += chunk;
      let newlineIndex;
      while ((newlineIndex = receiveBuffer.indexOf("\n")) !== -1) {
        const completeMessage = receiveBuffer.substring(0, newlineIndex).trim();
        receiveBuffer = receiveBuffer.substring(newlineIndex + 1);
        if (completeMessage) {
          this.processReceivedData(completeMessage);
        }
      }
      if (receiveBuffer.length > 1024) {
        const data = receiveBuffer.trim();
        receiveBuffer = "";
        if (data) {
          this.processReceivedData(data);
        }
      }
    },
    // 수신 데이터 처리
    processReceivedData(receivedData) {
      if (!receivedData) return;
      if (receivedData.startsWith("STATUS,")) {
        const iframe = document.getElementById("dashboardFrame");
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({
            type: "status_update",
            data: receivedData
          }, "*");
        }
        this._resolvePromise(receivedData);
        return;
      }
      if (receivedData.startsWith("SYS_VALUES,")) {
        this._handleSysValues(receivedData);
        return;
      }
      if (receivedData.startsWith("CALIB_VALUES,")) {
        this._handleCalibValues(receivedData);
        return;
      }
      if (DEBUG) Logger.add(`[\uC218\uC2E0] ${receivedData}`, "info");
      this._resolvePromise(receivedData);
      this._updateBlocklyVariable(receivedData);
    },
    // SYS_VALUES 처리
    _handleSysValues(data) {
      const parts = data.split(",");
      const iframe = document.getElementById("dashboardFrame");
      const max_speed = parts[1];
      const collision_dist = parts[2];
      const auto_stop = parts[3];
      let left_calib = void 0;
      let right_calib = void 0;
      let device_name = "";
      if (parts.length >= 7) {
        left_calib = parts[parts.length - 2];
        right_calib = parts[parts.length - 1];
        device_name = parts.slice(4, parts.length - 2).join(",");
      } else {
        device_name = parts.slice(4).join(",");
      }
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: "sys_values",
          max_speed,
          collision_dist,
          auto_stop,
          device_name,
          left_calibration: left_calib,
          right_calibration: right_calib,
          connection_timeout: BLUETOOTH_CONFIG.RESPONSE_TIMEOUT
        }, "*");
      }
      this._resolvePromise(data);
      Logger.add("[\uC218\uC2E0] \uC2DC\uC2A4\uD15C \uC124\uC815\uAC12", "success");
    },
    // CALIB_VALUES 처리
    _handleCalibValues(data) {
      const parts = data.split(",");
      const iframe = document.getElementById("dashboardFrame");
      if (iframe && iframe.contentWindow && parts.length >= 3) {
        iframe.contentWindow.postMessage({
          type: "calib_values",
          left: parts[1],
          right: parts[2]
        }, "*");
      }
      Logger.add(`[\uC218\uC2E0] \uCE98\uB9AC\uBE0C\uB808\uC774\uC158: \uC88C=${parts[1]}, \uC6B0=${parts[2]}`, "info");
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
        state.variables["_last_distance"] = distMatch[1];
      }
      const magMatch = data.match(/MAG[:\s]*([\d]+)/i);
      if (magMatch) {
        state.variables["_last_magnetic"] = magMatch[1];
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
          if (DEBUG) Logger.add(`[\uC77D\uAE30] ${receivedData}`, "receive");
          this.processReceivedData(receivedData);
        }
      } catch (error) {
        console.error("\uC77D\uAE30 \uC624\uB958:", error);
        Logger.add(`[\uC624\uB958] \uC77D\uAE30 \uC2E4\uD328: ${error.message}`, "error");
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
      const dashboardFrame = document.getElementById("dashboardFrame");
      const isDashboardMode = dashboardFrame && dashboardFrame.style.display !== "none" && dashboardFrame.style.display !== "";
      if (!isDashboardMode) {
        elements.runButton.disabled = !connected;
      }
      const emergencyStopButton = document.getElementById("emergencyStopButton");
      if (emergencyStopButton) {
        emergencyStopButton.disabled = false;
      }
      const iframe = document.getElementById("dashboardFrame");
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: "connection_status",
          connected
        }, "*");
      }
      if (connected) {
        elements.status.textContent = "\u2705 \uC544\uB808\uC2A4 \uC5F0\uACB0\uB428";
        elements.status.style.color = STATUS_COLORS.GREEN;
        if (state.bluetoothDevice) {
          elements.deviceInfo.textContent = `\uC7A5\uCE58: ${state.bluetoothDevice.name || "Unknown"}`;
        }
      } else {
        elements.status.textContent = state.isConnecting ? "\uC5F0\uACB0 \uC911..." : "\u274C \uC5F0\uACB0 \uB04A\uAE40";
        elements.status.style.color = state.isConnecting ? STATUS_COLORS.ORANGE : STATUS_COLORS.RED;
        elements.deviceInfo.textContent = "";
      }
    },
    // 상태 메시지 업데이트
    updateStatus(message, color) {
      elements.status.textContent = message;
      elements.status.style.color = color;
    },
    // 데이터 전송
    async sendData(data, waitForResponse = false) {
      var _a, _b;
      if (!state.characteristic) {
        throw new Error("BLE \uC7A5\uCE58\uC5D0 \uC5F0\uACB0\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      }
      if (!((_b = (_a = state.bluetoothDevice) == null ? void 0 : _a.gatt) == null ? void 0 : _b.connected)) {
        throw new Error("BLE \uC5F0\uACB0\uC774 \uB04A\uC5B4\uC84C\uC2B5\uB2C8\uB2E4.");
      }
      Logger.add(`[\uC804\uC1A1] ${data}`, "send");
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(data + "\n");
      state.lastCommand = data;
      let responsePromise = null;
      if (waitForResponse) {
        responsePromise = new Promise((resolve, reject) => {
          state.pendingResolve = resolve;
          state.pendingReject = reject;
          state.pendingTimeout = setTimeout(() => {
            state.pendingResolve = null;
            state.pendingReject = null;
            state.pendingTimeout = null;
            reject(new Error("\uC751\uB2F5 \uC2DC\uAC04 \uCD08\uACFC"));
          }, BLUETOOTH_CONFIG.RESPONSE_TIMEOUT);
        });
      }
      const useWithoutResponse = state.characteristic.properties && state.characteristic.properties.writeWithoutResponse;
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
          if (i + BLUETOOTH_CONFIG.MAX_CHUNK_SIZE < encodedData.length) {
            await this.delay(BLUETOOTH_CONFIG.CHUNK_DELAY);
          }
        }
        if (DEBUG) Logger.add(`\uC804\uC1A1 \uC644\uB8CC: ${data}`, "info");
      } catch (error) {
        if (DEBUG) Logger.add(`\uC804\uC1A1 \uC624\uB958 \uBB34\uC2DC\uB428: ${error.message}`, "warning");
      }
      if (!waitForResponse) {
        return "OK";
      }
      return responsePromise;
    },
    // 딜레이 유틸리티
    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
  };

  // blocklyconfig.js
  var BATCH_FORBIDDEN_TYPES = /* @__PURE__ */ new Set([
    // 값 반환
    "check_distance",
    "check_magnetic",
    "pico_check_device",
    // 제어 흐름
    "controls_if",
    "controls_whileUntil",
    "controls_repeat_ext",
    // 변수/함수 (제어 흐름은 Web 측 책임)
    "variables_set",
    "assign_variable",
    "math_change",
    "procedures_callnoreturn",
    "procedures_callreturn",
    "procedures_defnoreturn",
    "procedures_defreturn",
    // 중첩 금지
    "batch_block"
  ]);
  var BlocklyConfig = {
    blocks: [
      // 서보 모터 블록 (주황색 #FF8C00)
      {
        type: "timed_forward",
        message0: "\u{1F697} \uC11C\uBCF4 \uC804\uC9C4 %1 \uCD08",
        args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
        previousStatement: null,
        nextStatement: null,
        colour: "#FF8C00",
        tooltip: "\uC11C\uBCF4 \uBAA8\uD130\uB85C \uC9C0\uC815\uD55C \uC2DC\uAC04(\uCD08)\uB9CC\uD07C \uC804\uC9C4\uD569\uB2C8\uB2E4."
      },
      {
        type: "timed_backward",
        message0: "\u{1F697} \uC11C\uBCF4 \uD6C4\uC9C4 %1 \uCD08",
        args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
        previousStatement: null,
        nextStatement: null,
        colour: "#FF8C00",
        tooltip: "\uC11C\uBCF4 \uBAA8\uD130\uB85C \uC9C0\uC815\uD55C \uC2DC\uAC04(\uCD08)\uB9CC\uD07C \uD6C4\uC9C4\uD569\uB2C8\uB2E4."
      },
      {
        type: "timed_left",
        message0: "\u{1F697} \uC11C\uBCF4 \uC88C\uD68C\uC804 %1 \uCD08",
        args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
        previousStatement: null,
        nextStatement: null,
        colour: "#FF8C00",
        tooltip: "\uC11C\uBCF4 \uBAA8\uD130\uB85C \uC9C0\uC815\uD55C \uC2DC\uAC04(\uCD08)\uB9CC\uD07C \uC88C\uD68C\uC804\uD569\uB2C8\uB2E4."
      },
      {
        type: "timed_right",
        message0: "\u{1F697} \uC11C\uBCF4 \uC6B0\uD68C\uC804 %1 \uCD08",
        args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
        previousStatement: null,
        nextStatement: null,
        colour: "#FF8C00",
        tooltip: "\uC11C\uBCF4 \uBAA8\uD130\uB85C \uC9C0\uC815\uD55C \uC2DC\uAC04(\uCD08)\uB9CC\uD07C \uC6B0\uD68C\uC804\uD569\uB2C8\uB2E4."
      },
      {
        type: "move_forward",
        message0: "\u{1F697} \uC11C\uBCF4 \uACC4\uC18D \uC804\uC9C4",
        previousStatement: null,
        nextStatement: null,
        colour: "#FF8C00",
        tooltip: "\uC815\uC9C0 \uBA85\uB839 \uC804\uAE4C\uC9C0 \uC11C\uBCF4 \uBAA8\uD130\uB85C \uACC4\uC18D \uC804\uC9C4\uD569\uB2C8\uB2E4."
      },
      {
        type: "move_backward",
        message0: "\u{1F697} \uC11C\uBCF4 \uACC4\uC18D \uD6C4\uC9C4",
        previousStatement: null,
        nextStatement: null,
        colour: "#FF8C00",
        tooltip: "\uC815\uC9C0 \uBA85\uB839 \uC804\uAE4C\uC9C0 \uC11C\uBCF4 \uBAA8\uD130\uB85C \uACC4\uC18D \uD6C4\uC9C4\uD569\uB2C8\uB2E4."
      },
      {
        type: "turn_left",
        message0: "\u{1F697} \uC11C\uBCF4 \uACC4\uC18D \uC88C\uD68C\uC804",
        previousStatement: null,
        nextStatement: null,
        colour: "#FF8C00",
        tooltip: "\uC815\uC9C0 \uBA85\uB839 \uC804\uAE4C\uC9C0 \uC11C\uBCF4 \uBAA8\uD130\uB85C \uACC4\uC18D \uC88C\uD68C\uC804\uD569\uB2C8\uB2E4."
      },
      {
        type: "turn_right",
        message0: "\u{1F697} \uC11C\uBCF4 \uACC4\uC18D \uC6B0\uD68C\uC804",
        previousStatement: null,
        nextStatement: null,
        colour: "#FF8C00",
        tooltip: "\uC815\uC9C0 \uBA85\uB839 \uC804\uAE4C\uC9C0 \uC11C\uBCF4 \uBAA8\uD130\uB85C \uACC4\uC18D \uC6B0\uD68C\uC804\uD569\uB2C8\uB2E4."
      },
      {
        type: "stop_moving",
        message0: "\u{1F697} \uC11C\uBCF4 \uC815\uC9C0",
        previousStatement: null,
        nextStatement: null,
        colour: "#FF8C00",
        tooltip: "\uC11C\uBCF4 \uBAA8\uD130\uB97C \uC989\uC2DC \uC815\uC9C0\uD569\uB2C8\uB2E4."
      },
      // DC 모터 블록 (노랑색 #FFCC00)
      {
        type: "main_motor_forward_timed",
        message0: "\u26A1 DC\uBAA8\uD130 \uC804\uC9C4 %1 \uCD08",
        args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
        previousStatement: null,
        nextStatement: null,
        colour: "#FFCC00",
        tooltip: "DC \uBAA8\uD130\uB97C \uC9C0\uC815\uD55C \uC2DC\uAC04\uB9CC\uD07C \uC804\uC9C4\uC2DC\uD0B5\uB2C8\uB2E4."
      },
      {
        type: "main_motor_backward_timed",
        message0: "\u26A1 DC\uBAA8\uD130 \uD6C4\uC9C4 %1 \uCD08",
        args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
        previousStatement: null,
        nextStatement: null,
        colour: "#FFCC00",
        tooltip: "DC \uBAA8\uD130\uB97C \uC9C0\uC815\uD55C \uC2DC\uAC04\uB9CC\uD07C \uD6C4\uC9C4\uC2DC\uD0B5\uB2C8\uB2E4."
      },
      {
        type: "main_motor_forward",
        message0: "\u26A1 DC\uBAA8\uD130 \uACC4\uC18D \uC804\uC9C4",
        previousStatement: null,
        nextStatement: null,
        colour: "#FFCC00",
        tooltip: "\uC815\uC9C0 \uBA85\uB839 \uC804\uAE4C\uC9C0 DC \uBAA8\uD130\uB97C \uACC4\uC18D \uC804\uC9C4\uC2DC\uD0B5\uB2C8\uB2E4."
      },
      {
        type: "main_motor_backward",
        message0: "\u26A1 DC\uBAA8\uD130 \uACC4\uC18D \uD6C4\uC9C4",
        previousStatement: null,
        nextStatement: null,
        colour: "#FFCC00",
        tooltip: "\uC815\uC9C0 \uBA85\uB839 \uC804\uAE4C\uC9C0 DC \uBAA8\uD130\uB97C \uACC4\uC18D \uD6C4\uC9C4\uC2DC\uD0B5\uB2C8\uB2E4."
      },
      {
        type: "main_motor_stop",
        message0: "\u26A1 DC\uBAA8\uD130 \uC815\uC9C0",
        previousStatement: null,
        nextStatement: null,
        colour: "#FFCC00",
        tooltip: "DC \uBAA8\uD130\uB97C \uC989\uC2DC \uC815\uC9C0\uD569\uB2C8\uB2E4."
      },
      // LED 블록 (빨강색 #FF5555)
      {
        type: "set_lamp",
        message0: "\u{1F4A1} LED \uC804\uCCB4 \uC124\uC815 [ %1 %2 %3 %4 %5 ]",
        args0: [
          { type: "input_value", name: "LAMP0", check: "Number" },
          { type: "input_value", name: "LAMP1", check: "Number" },
          { type: "input_value", name: "LAMP2", check: "Number" },
          { type: "input_value", name: "LAMP3", check: "Number" },
          { type: "input_value", name: "LAMP4", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#FF5555",
        tooltip: "5\uAC1C LED \uBC1D\uAE30\uB97C \uD55C\uBC88\uC5D0 \uC124\uC815\uD569\uB2C8\uB2E4. \uAC12: 0(\uB054)~1(\uCD5C\uB300 \uBC1D\uAE30)"
      },
      {
        type: "led_on",
        message0: "\u{1F4A1} LED %1 \uBC88 \uCF1C\uAE30 (\uBC1D\uAE30 %2 )",
        args0: [
          { type: "input_value", name: "LED_NUM", check: "Number" },
          { type: "input_value", name: "BRIGHTNESS", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#FF5555",
        tooltip: "\uD2B9\uC815 LED(1~5\uBC88)\uB97C \uC9C0\uC815\uD55C \uBC1D\uAE30\uB85C \uCF2D\uB2C8\uB2E4. \uBC1D\uAE30: 0~1"
      },
      {
        type: "led_off",
        message0: "\u{1F4A1} LED %1 \uB044\uAE30",
        args0: [
          { type: "field_dropdown", name: "LED_NUM", options: [
            ["1\uBC88", "1"],
            ["2\uBC88", "2"],
            ["3\uBC88", "3"],
            ["4\uBC88", "4"],
            ["5\uBC88", "5"],
            ["\uC804\uCCB4", "ALL"]
          ] }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#FF5555",
        tooltip: "\uD2B9\uC815 LED \uB610\uB294 \uC804\uCCB4 LED\uB97C \uB055\uB2C8\uB2E4."
      },
      // 메인 LED 블록 (진분홍색 #FF33CC)
      {
        type: "main_led_on",
        message0: "\u{1F4A1} \uBA54\uC778 LED \uCF1C\uAE30 (\uBC1D\uAE30 %1 )",
        args0: [{ type: "input_value", name: "BRIGHTNESS", check: "Number" }],
        previousStatement: null,
        nextStatement: null,
        colour: "#FF33CC",
        tooltip: "\uBA54\uC778 LED\uB97C \uC9C0\uC815\uD55C \uBC1D\uAE30\uB85C \uCF2D\uB2C8\uB2E4. \uBC1D\uAE30: 0 (\uB054) ~ 1 (\uCD5C\uB300)"
      },
      {
        type: "main_led_off",
        message0: "\u{1F4A1} \uBA54\uC778 LED \uB044\uAE30",
        previousStatement: null,
        nextStatement: null,
        colour: "#FF33CC",
        tooltip: "\uBA54\uC778 LED\uB97C \uB055\uB2C8\uB2E4."
      },
      // 디스플레이 블록 (보라색 #9966FF)
      {
        type: "send_message",
        message0: "\u{1F5A5}\uFE0F \uD654\uBA74\uC5D0 \uD45C\uC2DC: %1",
        args0: [{ type: "input_value", name: "Msg", check: "String" }],
        previousStatement: null,
        nextStatement: null,
        colour: "#9966FF",
        tooltip: "OLED \uB514\uC2A4\uD50C\uB808\uC774\uC5D0 \uD14D\uC2A4\uD2B8\uB97C \uD45C\uC2DC\uD569\uB2C8\uB2E4."
      },
      {
        type: "clear_display",
        message0: "\u{1F5A5}\uFE0F \uD654\uBA74 \uC9C0\uC6B0\uAE30",
        previousStatement: null,
        nextStatement: null,
        colour: "#9966FF",
        tooltip: "OLED \uB514\uC2A4\uD50C\uB808\uC774 \uD654\uBA74\uC744 \uAE68\uB057\uD558\uAC8C \uC9C0\uC6C1\uB2C8\uB2E4."
      },
      // 소리 블록 (하늘색 #00CCFF)
      {
        type: "buzzer_on",
        message0: "\u{1F50A} \uBD80\uC800 %1 Hz\uB85C %2 \uCD08 \uC6B8\uB9AC\uAE30",
        args0: [
          { type: "input_value", name: "FREQ", check: "Number" },
          { type: "input_value", name: "DURATION", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#00CCFF",
        tooltip: "\uC9C0\uC815\uD55C \uC8FC\uD30C\uC218(Hz)\uC640 \uC2DC\uAC04(\uCD08)\uC73C\uB85C \uBD80\uC800\uB97C \uC6B8\uB9BD\uB2C8\uB2E4. \uC608: 262Hz=\uB3C4, 392Hz=\uC194"
      },
      // 발사 블록 (빨강주황 #FF4500)
      {
        type: "gun_fire",
        message0: "\u{1F52B} \uBC1C\uC0AC \uC2E4\uD589",
        previousStatement: null,
        nextStatement: null,
        colour: "#FF4500",
        tooltip: "BB\uD0C4\uC744 \uD55C \uBC1C \uBC1C\uC0AC\uD569\uB2C8\uB2E4."
      },
      // 센서 블록 (회청색 #5C81A6)
      {
        type: "pico_check_device",
        message0: "\u{1F4E1} \uC5F0\uACB0 \uD655\uC778",
        previousStatement: null,
        nextStatement: null,
        colour: "#5C81A6",
        tooltip: "Pico\uC640 \uBE14\uB8E8\uD22C\uC2A4 \uC5F0\uACB0 \uC0C1\uD0DC\uB97C \uD655\uC778\uD569\uB2C8\uB2E4. \uC5F0\uACB0\uB418\uBA74 \uD654\uBA74\uC5D0 'CONNECTED' \uD45C\uC2DC."
      },
      {
        type: "check_distance",
        message0: "\u{1F4E1} \uAC70\uB9AC \uCE21\uC815 \u2192 %1",
        args0: [{ type: "field_variable", name: "VAR", variable: "\uAC70\uB9AC\uAC12" }],
        previousStatement: null,
        nextStatement: null,
        colour: "#5C81A6",
        tooltip: "\uCD08\uC74C\uD30C \uC13C\uC11C\uB85C \uC804\uBC29 \uBB3C\uCCB4\uAE4C\uC9C0 \uAC70\uB9AC(cm)\uB97C \uCE21\uC815\uD558\uC5EC \uBCC0\uC218\uC5D0 \uC800\uC7A5\uD569\uB2C8\uB2E4."
      },
      {
        type: "check_magnetic",
        message0: "\u{1F4E1} \uC790\uAE30\uC7A5 \uAC10\uC9C0 \u2192 %1",
        args0: [{ type: "field_variable", name: "VAR", variable: "\uC790\uAE30\uAC12" }],
        previousStatement: null,
        nextStatement: null,
        colour: "#5C81A6",
        tooltip: "\uC790\uAE30\uC7A5 \uC13C\uC11C\uB85C \uC790\uC11D \uAC10\uC9C0 \uC5EC\uBD80(0=\uC5C6\uC74C, 1=\uAC10\uC9C0)\uB97C \uBCC0\uC218\uC5D0 \uC800\uC7A5\uD569\uB2C8\uB2E4."
      },
      // 시간 블록 (초록색 #5CA65C)
      {
        type: "time_sleep",
        message0: "\u23F1\uFE0F \uAE30\uB2E4\uB9AC\uAE30 %1 \uCD08",
        args0: [{ type: "input_value", name: "SECONDS", check: "Number" }],
        previousStatement: null,
        nextStatement: null,
        colour: "#5CA65C",
        tooltip: "\uC9C0\uC815\uD55C \uC2DC\uAC04(\uCD08)\uB9CC\uD07C \uB2E4\uC74C \uBA85\uB839 \uC2E4\uD589\uC744 \uB300\uAE30\uD569\uB2C8\uB2E4."
      },
      // 수학 블록 (Blockly 기본 색상 230)
      {
        type: "math_arithmetic",
        message0: "%1 %2 %3",
        args0: [
          { type: "input_value", name: "A", check: "Number" },
          { type: "field_dropdown", name: "OP", options: [
            ["+", "ADD"],
            ["-", "MINUS"],
            ["\xD7", "MULTIPLY"],
            ["\xF7", "DIVIDE"]
          ] },
          { type: "input_value", name: "B", check: "Number" }
        ],
        inputsInline: true,
        output: "Number",
        colour: 230,
        tooltip: "\uB450 \uC22B\uC790\uB97C \uC0AC\uCE59\uC5F0\uC0B0\uD569\uB2C8\uB2E4. (+\uB367\uC148, -\uBE84\uC148, \xD7\uACF1\uC148, \xF7\uB098\uB217\uC148)"
      },
      {
        type: "math_random_int",
        message0: "\uB79C\uB364 %1 ~ %2",
        args0: [
          { type: "input_value", name: "FROM", check: "Number" },
          { type: "input_value", name: "TO", check: "Number" }
        ],
        inputsInline: true,
        output: "Number",
        colour: 230,
        tooltip: "\uC9C0\uC815\uD55C \uBC94\uC704 \uB0B4\uC5D0\uC11C \uBB34\uC791\uC704 \uC815\uC218\uB97C \uBC18\uD658\uD569\uB2C8\uB2E4."
      },
      // 묶음 실행 (보라색 #8E44AD)
      {
        type: "batch_block",
        message0: "\u{1F680} \uD55C\uAEBC\uBC88\uC5D0 \uC2E4\uD589 %1 %2",
        args0: [
          { type: "input_dummy" },
          { type: "input_statement", name: "DO" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#8E44AD",
        tooltip: "\uC548\uC5D0 \uB2F4\uC740 \uBE14\uB85D\uB4E4\uC744 \uD55C \uBB36\uC74C\uC73C\uB85C Pico\uC5D0 \uBCF4\uB0B4 \uBE60\uB974\uAC8C \uCC28\uB840 \uC2E4\uD589\uD569\uB2C8\uB2E4. \uC13C\uC11C\uAC12\uC744 \uBC1B\uB294 \uBE14\uB85D\uACFC \uC81C\uC5B4/\uBC18\uBCF5 \uBE14\uB85D\uC740 \uC548\uC5D0 \uB123\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
      }
    ]
  };
  function attachBatchBlockValidator(BlocklyLib) {
    const proto = BlocklyLib.Blocks["batch_block"];
    if (!proto) return;
    const originalInit = proto.init;
    proto.init = function() {
      originalInit.call(this);
      this.setOnChange((event) => {
        if (!this.workspace || this.isInFlyout) return;
        let bad = null;
        let cur = this.getInputTargetBlock("DO");
        while (cur) {
          if (BATCH_FORBIDDEN_TYPES.has(cur.type)) {
            bad = cur.type;
            break;
          }
          cur = cur.getNextBlock();
        }
        this.setWarningText(bad ? `'${bad}' \uBE14\uB85D\uC740 [\uD55C\uAEBC\uBC88\uC5D0 \uC2E4\uD589] \uC548\uC5D0 \uB123\uC744 \uC218 \uC5C6\uC5B4\uC694. \uBC14\uAE65\uC73C\uB85C \uBE7C\uC8FC\uC138\uC694.` : null);
      });
    };
  }

  // commandexecutor.js
  var CommandExecutor = {
    // 즉시 완료 명령 — Pico가 blocking 처리하지 않으므로 응답 대기 불필요.
    // 시간 의존적(BUZZER_ON, SERVO_t*, DC_t*, SLEEP) 또는 값 반환(DISTANCE,
    // MAGNET, PING)은 이 집합에 넣지 말 것. 응답 대기로 두어야 타이밍/값이
    // 보장된다.
    FIRE_AND_FORGET_HEADS: /* @__PURE__ */ new Set([
      "LED_ON",
      "LED_OFF",
      "MAIN_LED_ON",
      "MAIN_LED_OFF",
      "MSG",
      "CLEAR_DISPLAY",
      "SERVO_FORWARD",
      "SERVO_BACKWARD",
      "SERVO_LEFT",
      "SERVO_RIGHT",
      "SERVO_STOP",
      "DC_FORWARD",
      "DC_BACKWARD",
      "DC_STOP",
      "GUN_FIRE"
    ]),
    _isFireAndForget(command) {
      if (command.startsWith("[")) return true;
      const head = command.split(",")[0];
      return this.FIRE_AND_FORGET_HEADS.has(head);
    },
    evaluateValueBlock(block) {
      var _a;
      if (!block) return "0";
      if (block.type === "math_number") {
        return block.getFieldValue("NUM") || "0";
      } else if (block.type === "text") {
        return block.getFieldValue("TEXT") || "";
      } else if (block.type === "variables_get") {
        const varId = block.getFieldValue("VAR");
        const varName = ((_a = block.workspace.getVariableById(varId)) == null ? void 0 : _a.name) || "unknown";
        const value = state.variables[varName] || "0";
        if (DEBUG) Logger.add(`\uBCC0\uC218 ${varName} \uAC12: ${value}`, "info");
        return value;
      } else if (block.type === "math_arithmetic") {
        const op = block.getFieldValue("OP");
        const a = this.evaluateValueBlock(block.getInputTargetBlock("A"));
        const b = this.evaluateValueBlock(block.getInputTargetBlock("B"));
        let result = "0";
        try {
          switch (op) {
            case "ADD":
              result = (parseFloat(a) + parseFloat(b)).toString();
              break;
            case "MINUS":
              result = (parseFloat(a) - parseFloat(b)).toString();
              break;
            case "MULTIPLY":
              result = (parseFloat(a) * parseFloat(b)).toString();
              break;
            case "DIVIDE":
              result = parseFloat(b) !== 0 ? (parseFloat(a) / parseFloat(b)).toString() : "0";
              break;
            default:
              result = "0";
          }
          return result;
        } catch (e) {
          return "0";
        }
      } else if (block.type === "logic_compare") {
        const op = block.getFieldValue("OP");
        const a = this.evaluateValueBlock(block.getInputTargetBlock("A"));
        const b = this.evaluateValueBlock(block.getInputTargetBlock("B"));
        let result = false;
        const numA = parseFloat(a);
        const numB = parseFloat(b);
        const isNum = !isNaN(numA) && !isNaN(numB) && String(a).trim() !== "" && String(b).trim() !== "";
        switch (op) {
          case "EQ":
            result = isNum ? numA === numB : a === b;
            break;
          case "NEQ":
            result = isNum ? numA !== numB : a !== b;
            break;
          case "LT":
            result = (isNum ? numA : a) < (isNum ? numB : b);
            break;
          case "LTE":
            result = (isNum ? numA : a) <= (isNum ? numB : b);
            break;
          case "GT":
            result = (isNum ? numA : a) > (isNum ? numB : b);
            break;
          case "GTE":
            result = (isNum ? numA : a) >= (isNum ? numB : b);
            break;
        }
        return result ? "true" : "false";
      } else if (block.type === "logic_boolean") {
        return block.getFieldValue("BOOL") === "TRUE" ? "true" : "false";
      } else if (block.type === "math_random_int") {
        const from = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("FROM"))) || 0;
        const to = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("TO"))) || 100;
        const min = Math.min(from, to);
        const max = Math.max(from, to);
        const result = Math.floor(Math.random() * (max - min + 1)) + min;
        return result.toString();
      } else if (block.type === "procedures_callreturn") {
        const funcName = block.getFieldValue("NAME");
        const defBlock = this._findProcedureDefinition(block.workspace, funcName, true);
        if (defBlock) {
          const argNames = defBlock.arguments_ || [];
          for (let i = 0; i < argNames.length; i++) {
            const argBlock = block.getInputTargetBlock("ARG" + i);
            if (argBlock) {
              state.variables[argNames[i]] = this.evaluateValueBlock(argBlock);
            }
          }
          const returnBlock = defBlock.getInputTargetBlock("RETURN");
          if (returnBlock) {
            return this.evaluateValueBlock(returnBlock);
          }
        }
        return "0";
      } else {
        return Blockly.Python.valueToCode(block, "", Blockly.Python.ORDER_ATOMIC) || "0";
      }
    },
    async processBlock(block) {
      if (!block) return;
      if (!state.isExecuting) return;
      if (block.type === "batch_block") {
        await this._processBatch(block);
        await this.processBlock(block.getNextBlock());
        return;
      }
      const command = this.generateCommand(block);
      if (command) {
        await this.sendCommand(command);
      }
      await this.handleLogicBlock(block);
      await this.processBlock(block.getNextBlock());
    },
    async _processBatch(block) {
      const commands = [];
      let cur = block.getInputTargetBlock("DO");
      while (cur) {
        if (BATCH_FORBIDDEN_TYPES.has(cur.type)) {
          Logger.add(`[\uC624\uB958] '${cur.type}' \uBE14\uB85D\uC740 [\uD55C\uAEBC\uBC88\uC5D0 \uC2E4\uD589] \uC548\uC5D0 \uB123\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uBC14\uAE65\uC73C\uB85C \uBE7C\uC8FC\uC138\uC694.`, "error");
          state.isExecuting = false;
          return;
        }
        const cmd = this.generateCommand(cur);
        if (cmd) commands.push(cmd);
        cur = cur.getNextBlock();
      }
      if (commands.length === 0) {
        if (DEBUG) Logger.add("[\uBB36\uC74C] \uBE44\uC5B4 \uC788\uC5B4 \uAC74\uB108\uB700", "info");
        return;
      }
      const payload = `BATCH;${commands.join("|")}`;
      BluetoothManager.updateStatus("\uBB36\uC74C \uC2E4\uD589 \uC911...", STATUS_COLORS.ORANGE);
      try {
        await BluetoothManager.sendData(payload, true);
        if (DEBUG) Logger.add(`[\uBB36\uC74C \uC644\uB8CC] ${commands.length}\uAC1C \uBA85\uB839`, "info");
      } catch (error) {
        Logger.add(`[\uC624\uB958] \uBB36\uC74C \uC2E4\uD589 \uC2E4\uD328: ${error.message}`, "error");
        if (error.message.includes("\uC5F0\uACB0") || error.message.includes("BLE")) {
          state.isExecuting = false;
          throw error;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
    generateCommand(block) {
      switch (block.type) {
        case "set_lamp": {
          const lamps = [0, 1, 2, 3, 4].map(
            (i) => parseFloat(this.evaluateValueBlock(block.getInputTargetBlock(`LAMP${i}`)) || "0").toFixed(1)
          );
          return `[${lamps.join(" ")}]`;
        }
        case "led_on": {
          const ledNumRaw = this.evaluateValueBlock(block.getInputTargetBlock("LED_NUM"));
          const ledNumInput = parseInt(ledNumRaw, 10);
          const ledNum = isNaN(ledNumInput) ? 0 : Math.max(0, Math.min(4, ledNumInput - 1));
          const brightness = this.evaluateValueBlock(block.getInputTargetBlock("BRIGHTNESS")) || "1";
          return `LED_ON,${ledNum},${brightness}`;
        }
        case "led_off": {
          const ledNumStr = block.getFieldValue("LED_NUM") || "1";
          if (ledNumStr === "ALL") return "LED_OFF,ALL";
          const ledNum = Math.max(0, Math.min(4, parseInt(ledNumStr) - 1));
          return `LED_OFF,${ledNum}`;
        }
        case "main_led_on": {
          const brightness = this.evaluateValueBlock(block.getInputTargetBlock("BRIGHTNESS")) || "1";
          return `MAIN_LED_ON,${brightness}`;
        }
        case "main_led_off": {
          return "MAIN_LED_OFF";
        }
        case "send_message": {
          const str = String(this.evaluateValueBlock(block.getInputTargetBlock("Msg")) || "Hello");
          return `MSG,${str}`;
        }
        case "clear_display":
          return "CLEAR_DISPLAY";
        case "buzzer_on": {
          const freq = Math.trunc(parseFloat(this.evaluateValueBlock(block.getInputTargetBlock("FREQ")) || "262"));
          const duration = this.evaluateValueBlock(block.getInputTargetBlock("DURATION")) || "1";
          return `BUZZER_ON,${freq},${duration}`;
        }
        case "gun_fire":
          return "GUN_FIRE";
        // 서보 모터 (시간 제한) - SERVO_t방향,초
        case "timed_forward": {
          const seconds = this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "0";
          return `SERVO_tFORWARD,${seconds}`;
        }
        case "timed_backward": {
          const seconds = this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "0";
          return `SERVO_tBACKWARD,${seconds}`;
        }
        case "timed_right": {
          const seconds = this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "0";
          return `SERVO_tRIGHT,${seconds}`;
        }
        case "timed_left": {
          const seconds = this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "0";
          return `SERVO_tLEFT,${seconds}`;
        }
        // 서보 모터 (연속) - SERVO_방향
        case "move_forward":
          return "SERVO_FORWARD";
        case "move_backward":
          return "SERVO_BACKWARD";
        case "turn_left":
          return "SERVO_LEFT";
        case "turn_right":
          return "SERVO_RIGHT";
        case "stop_moving":
          return "SERVO_STOP";
        // DC 모터 (시간 제한) - DC_t방향,초
        case "main_motor_forward_timed": {
          const seconds = this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "1";
          return `DC_tFORWARD,${seconds}`;
        }
        case "main_motor_backward_timed": {
          const seconds = this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "1";
          return `DC_tBACKWARD,${seconds}`;
        }
        // DC 모터 (연속) - DC_방향
        case "main_motor_forward":
          return "DC_FORWARD";
        case "main_motor_backward":
          return "DC_BACKWARD";
        case "main_motor_stop":
          return "DC_STOP";
        case "time_sleep": {
          const seconds = this.evaluateValueBlock(block.getInputTargetBlock("SECONDS")) || "0";
          return `SLEEP,${seconds}`;
        }
        case "pico_check_device":
          return "PING";
        case "check_distance":
          return "DISTANCE";
        case "check_magnetic":
          return "MAGNET";
        default:
          return null;
      }
    },
    async sendCommand(command) {
      if (!state.isExecuting) {
        Logger.add("[\uC911\uB2E8] \uC2E4\uD589\uC774 \uC911\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4", "warning");
        return;
      }
      BluetoothManager.updateStatus("\uBA85\uB839 \uC2E4\uD589 \uC911...", STATUS_COLORS.ORANGE);
      const fireAndForget = this._isFireAndForget(command);
      try {
        await BluetoothManager.sendData(command, !fireAndForget);
        if (DEBUG) Logger.add(`[\uC644\uB8CC] ${command}`, "info");
      } catch (error) {
        if (error.message.includes("\uC2DC\uAC04 \uCD08\uACFC")) {
          Logger.add(`[\uACBD\uACE0] \uC751\uB2F5 \uB300\uAE30 \uCD08\uACFC: ${command}`, "warning");
        } else {
          Logger.add(`[\uC624\uB958] ${command}: ${error.message}`, "error");
          if (error.message.includes("\uC5F0\uACB0") || error.message.includes("BLE")) {
            state.isExecuting = false;
            throw error;
          }
        }
      }
      const cooldown = fireAndForget ? 40 : 20;
      await new Promise((resolve) => setTimeout(resolve, cooldown));
    },
    async handleLogicBlock(block) {
      var _a, _b, _c;
      if (block.type === "variables_set") {
        const varId = block.getFieldValue("VAR");
        const varName = ((_a = block.workspace.getVariableById(varId)) == null ? void 0 : _a.name) || "unknown";
        const value = this.evaluateValueBlock(block.getInputTargetBlock("VALUE"));
        state.variables[varName] = value;
        if (DEBUG) Logger.add(`${varName} = ${value}`, "info");
      } else if (block.type === "assign_variable") {
        const varId = block.getFieldValue("VAR");
        const varName = block.workspace.getVariableById(varId).name;
        const value = this.evaluateValueBlock(block.getInputTargetBlock("VALUE"));
        state.variables[varName] = value;
      } else if (block.type === "math_change") {
        const varId = block.getFieldValue("VAR");
        const varName = block.workspace.getVariableById(varId).name;
        const delta = parseFloat(this.evaluateValueBlock(block.getInputTargetBlock("DELTA")) || "0");
        state.variables[varName] = (parseFloat(state.variables[varName] || "0") + delta).toString();
      } else if (block.type === "check_distance") {
        const varId = block.getFieldValue("VAR");
        const varName = ((_b = block.workspace.getVariableById(varId)) == null ? void 0 : _b.name) || "\uAC70\uB9AC\uAC12";
        await new Promise((resolve) => setTimeout(resolve, 300));
        const distance = state.variables["_last_distance"] || "0";
        state.variables[varName] = distance;
      } else if (block.type === "check_magnetic") {
        const varId = block.getFieldValue("VAR");
        const varName = ((_c = block.workspace.getVariableById(varId)) == null ? void 0 : _c.name) || "\uC790\uAE30\uAC12";
        await new Promise((resolve) => setTimeout(resolve, 300));
        const magnetic = state.variables["_last_magnetic"] || "0";
        state.variables[varName] = magnetic;
      } else if (block.type === "controls_if") {
        const condition = this.evaluateValueBlock(block.getInputTargetBlock("IF0")) === "true";
        if (condition) {
          await this.processBlock(block.getInputTargetBlock("DO0"));
        } else if (block.getInput("ELSE")) {
          await this.processBlock(block.getInputTargetBlock("ELSE"));
        }
      } else if (block.type === "controls_whileUntil") {
        const mode = block.getFieldValue("MODE");
        let condition = this.evaluateValueBlock(block.getInputTargetBlock("BOOL")) === "true";
        const maxLoops = 100;
        let loopCount = 0;
        while ((mode === "WHILE" ? condition : !condition) && loopCount < maxLoops && state.isExecuting) {
          const doBlock = block.getInputTargetBlock("DO");
          await this.processBlock(doBlock);
          condition = this.evaluateValueBlock(block.getInputTargetBlock("BOOL")) === "true";
          loopCount++;
        }
      } else if (block.type === "controls_repeat_ext") {
        const times = parseInt(this.evaluateValueBlock(block.getInputTargetBlock("TIMES")) || "0");
        const maxLoops = 100;
        const loopTimes = Math.min(times, maxLoops);
        for (let i = 0; i < loopTimes && state.isExecuting; i++) {
          await this.processBlock(block.getInputTargetBlock("DO"));
        }
      } else if (block.type === "procedures_defnoreturn" || block.type === "procedures_defreturn") {
      } else if (block.type === "procedures_callnoreturn") {
        const funcName = block.getFieldValue("NAME");
        const defBlock = this._findProcedureDefinition(block.workspace, funcName, false);
        if (defBlock) {
          await this._setupProcedureArgs(block, defBlock);
          const statementsBlock = defBlock.getInputTargetBlock("STACK");
          await this.processBlock(statementsBlock);
        } else {
          Logger.add(`[\uC624\uB958] \uD568\uC218 \uCC3E\uC744 \uC218 \uC5C6\uC74C: ${funcName}`, "error");
        }
      } else if (block.type === "procedures_callreturn") {
        const funcName = block.getFieldValue("NAME");
        const defBlock = this._findProcedureDefinition(block.workspace, funcName, true);
        if (defBlock) {
          await this._setupProcedureArgs(block, defBlock);
          const statementsBlock = defBlock.getInputTargetBlock("STACK");
          await this.processBlock(statementsBlock);
        }
      }
    },
    _findProcedureDefinition(workspace, name, hasReturn) {
      const defType = hasReturn ? "procedures_defreturn" : "procedures_defnoreturn";
      const allBlocks = workspace.getAllBlocks();
      for (const block of allBlocks) {
        if (block.type === defType && block.getFieldValue("NAME") === name) {
          return block;
        }
      }
      for (const block of allBlocks) {
        if ((block.type === "procedures_defreturn" || block.type === "procedures_defnoreturn") && block.getFieldValue("NAME") === name) {
          return block;
        }
      }
      return null;
    },
    async _setupProcedureArgs(callBlock, defBlock) {
      const argNames = defBlock.arguments_ || [];
      for (let i = 0; i < argNames.length; i++) {
        const argName = argNames[i];
        const argBlock = callBlock.getInputTargetBlock("ARG" + i);
        if (argBlock) {
          const value = this.evaluateValueBlock(argBlock);
          state.variables[argName] = value;
        }
      }
    },
    async executeWorkspace(workspace) {
      var _a, _b;
      state.isExecuting = true;
      elements.runButton.disabled = true;
      BluetoothManager.updateStatus("\uD504\uB85C\uADF8\uB7A8 \uC2E4\uD589 \uC911...", STATUS_COLORS.ORANGE);
      Logger.add("[\uC2E4\uD589] \uD504\uB85C\uADF8\uB7A8 \uC2DC\uC791", "info");
      try {
        const topBlocks = workspace.getTopBlocks(true);
        for (const block of topBlocks) {
          if (!state.isExecuting) {
            Logger.add("[\uC2E4\uD589] \uC911\uB2E8\uB428", "warning");
            break;
          }
          if (block.type === "procedures_defnoreturn" || block.type === "procedures_defreturn") {
            continue;
          }
          await this.processBlock(block);
        }
        if (state.isExecuting) {
          BluetoothManager.updateStatus("\u2705 \uD504\uB85C\uADF8\uB7A8 \uC2E4\uD589 \uC644\uB8CC!", STATUS_COLORS.GREEN);
          Logger.add("[\uC2E4\uD589] \uC644\uB8CC", "info");
        }
      } catch (error) {
        BluetoothManager.updateStatus(`\u274C \uD504\uB85C\uADF8\uB7A8 \uC2E4\uD589 \uC2E4\uD328: ${error.message}`, STATUS_COLORS.RED);
        Logger.add(`[\uC624\uB958] \uD504\uB85C\uADF8\uB7A8 \uC2E4\uD589 \uC2E4\uD328: ${error.message}`, "error");
      }
      state.isExecuting = false;
      const isConnected = ((_b = (_a = state.bluetoothDevice) == null ? void 0 : _a.gatt) == null ? void 0 : _b.connected) && state.characteristic;
      elements.runButton.disabled = !isConnected;
      setTimeout(() => {
        BluetoothManager.updateConnectionStatus(isConnected);
      }, 1500);
    }
  };

  // main.js
  function initializeBlockly() {
    if (!navigator.bluetooth) {
      alert("\uC774 \uBE0C\uB77C\uC6B0\uC800\uB294 Web Bluetooth API\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. Chrome 56+ \uB610\uB294 Edge 79+\uB97C \uC0AC\uC6A9\uD574\uC8FC\uC138\uC694.");
      Logger.add("[\uC624\uB958] \uBE0C\uB77C\uC6B0\uC800\uAC00 Web Bluetooth API\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4", "error");
    }
    Blockly.defineBlocksWithJsonArray(BlocklyConfig.blocks);
    attachBatchBlockValidator(Blockly);
    Blockly.Msg["CONTROLS_REPEAT_TITLE"] = "\uBC18\uBCF5 %1 \uBC88";
    Blockly.Msg["CONTROLS_REPEAT_INPUT_DO"] = "\uC2E4\uD589";
    Blockly.Msg["CONTROLS_REPEAT_TOOLTIP"] = "\uC9C0\uC815\uB41C \uD69F\uC218\uB9CC\uD07C \uBB38\uC7A5\uC744 \uBC18\uBCF5\uD569\uB2C8\uB2E4.";
    Blockly.Msg["MATH_CHANGE_TITLE"] = "%1 \uC5D0 %2 \uB9CC\uD07C \uB354\uD558\uAE30";
    Blockly.Msg["MATH_CHANGE_TOOLTIP"] = "\uBCC0\uC218 '%1'\uC5D0 \uC22B\uC790\uB97C \uB354\uD569\uB2C8\uB2E4.";
    Blockly.Msg["MATH_NUMBER_TOOLTIP"] = "\uC22B\uC790\uC785\uB2C8\uB2E4.";
    Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_ADD"] = "\uB450 \uC218\uC758 \uD569\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_SUBTRACT"] = "\uCCAB \uBC88\uC9F8 \uC218\uC5D0\uC11C \uB450 \uBC88\uC9F8 \uC218\uB97C \uBE80 \uACB0\uACFC\uB97C \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_MULTIPLY"] = "\uB450 \uC218\uC758 \uACF1\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_DIVIDE"] = "\uCCAB \uBC88\uC9F8 \uC218\uB97C \uB450 \uBC88\uC9F8 \uC218\uB85C \uB098\uB208 \uACB0\uACFC\uB97C \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["MATH_ARITHMETIC_TOOLTIP_POWER"] = "\uCCAB \uBC88\uC9F8 \uC218\uB97C \uB450 \uBC88\uC9F8 \uC218 \uB9CC\uD07C \uC2B9\uD55C \uACB0\uACFC\uB97C \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["VARIABLES_DEFAULT_NAME"] = "\uBCC0\uC218";
    Blockly.Msg["VARIABLES_GET_TOOLTIP"] = "\uC774 \uBCC0\uC218\uC758 \uAC12\uC744 \uAC00\uC838\uC635\uB2C8\uB2E4.";
    Blockly.Msg["VARIABLES_SET"] = "%1 \uC744(\uB97C) %2 (\uC73C)\uB85C \uC124\uC815";
    Blockly.Msg["VARIABLES_SET_TOOLTIP"] = "\uC774 \uBCC0\uC218\uB97C \uC785\uB825\uAC12\uACFC \uAC19\uAC8C \uC124\uC815\uD569\uB2C8\uB2E4.";
    Blockly.Msg["NEW_VARIABLE"] = "\uC0C8 \uBCC0\uC218 \uC0DD\uC131...";
    Blockly.Msg["NEW_VARIABLE_TITLE"] = "\uC0C8 \uBCC0\uC218 \uC774\uB984:";
    Blockly.Msg["NEW_STRING_VARIABLE"] = "\uC0C8 \uBB38\uC790\uC5F4 \uBCC0\uC218 \uC0DD\uC131...";
    Blockly.Msg["NEW_NUMBER_VARIABLE"] = "\uC0C8 \uC22B\uC790 \uBCC0\uC218 \uC0DD\uC131...";
    Blockly.Msg["NEW_COLOUR_VARIABLE"] = "\uC0C8 \uC0C9\uC0C1 \uBCC0\uC218 \uC0DD\uC131...";
    Blockly.Msg["RENAME_VARIABLE"] = "\uBCC0\uC218 \uC774\uB984 \uBCC0\uACBD...";
    Blockly.Msg["RENAME_VARIABLE_TITLE"] = "\uBAA8\uB4E0 '%1' \uBCC0\uC218 \uC774\uB984\uC744 \uB2E4\uC74C\uC73C\uB85C \uBCC0\uACBD:";
    Blockly.Msg["DELETE_VARIABLE"] = "'%1' \uBCC0\uC218 \uC0AD\uC81C";
    Blockly.Msg["DELETE_VARIABLE_CONFIRMATION"] = "'%2' \uBCC0\uC218\uC758 %1\uAC1C \uC0AC\uC6A9\uC744 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?";
    Blockly.Msg["CONTROLS_IF_MSG_IF"] = "\uB9CC\uC57D";
    Blockly.Msg["CONTROLS_IF_MSG_THEN"] = "\uC774\uBA74";
    Blockly.Msg["CONTROLS_IF_MSG_ELSE"] = "\uC544\uB2C8\uBA74";
    Blockly.Msg["CONTROLS_IF_MSG_ELSEIF"] = "\uC544\uB2C8\uBA74 \uB9CC\uC57D";
    Blockly.Msg["CONTROLS_IF_TOOLTIP_1"] = "\uAC12\uC774 \uCC38\uC774\uBA74, \uBB38\uC7A5\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_IF_TOOLTIP_2"] = "\uAC12\uC774 \uCC38\uC774\uBA74 \uCCAB \uBC88\uC9F8 \uBE14\uB85D\uC744, \uC544\uB2C8\uBA74 \uB450 \uBC88\uC9F8 \uBE14\uB85D\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_IF_TOOLTIP_3"] = "\uCCAB \uBC88\uC9F8 \uAC12\uC774 \uCC38\uC774\uBA74 \uCCAB \uBC88\uC9F8 \uBE14\uB85D\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4. \uC544\uB2C8\uBA74 \uB450 \uBC88\uC9F8 \uAC12\uC774 \uCC38\uC774\uBA74 \uB450 \uBC88\uC9F8 \uBE14\uB85D\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_IF_TOOLTIP_4"] = "\uCCAB \uBC88\uC9F8 \uAC12\uC774 \uCC38\uC774\uBA74 \uCCAB \uBC88\uC9F8 \uBE14\uB85D\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4. \uC544\uB2C8\uBA74 \uB450 \uBC88\uC9F8 \uAC12\uC774 \uCC38\uC774\uBA74 \uB450 \uBC88\uC9F8 \uBE14\uB85D\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4. \uBAA8\uB450 \uAC70\uC9D3\uC774\uBA74 \uB9C8\uC9C0\uB9C9 \uBE14\uB85D\uC744 \uC2E4\uD589\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_IF_IF_TITLE_IF"] = "\uB9CC\uC57D";
    Blockly.Msg["CONTROLS_IF_IF_TOOLTIP"] = "\uC139\uC158\uC744 \uCD94\uAC00, \uC81C\uAC70, \uC7AC\uC815\uB82C\uD558\uC5EC \uC774 if \uBE14\uB85D\uC744 \uC7AC\uAD6C\uC131\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_IF_ELSEIF_TITLE_ELSEIF"] = "\uC544\uB2C8\uBA74 \uB9CC\uC57D";
    Blockly.Msg["CONTROLS_IF_ELSEIF_TOOLTIP"] = "if \uBE14\uB85D\uC5D0 \uC870\uAC74\uC744 \uCD94\uAC00\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_IF_ELSE_TITLE_ELSE"] = "\uC544\uB2C8\uBA74";
    Blockly.Msg["CONTROLS_IF_ELSE_TOOLTIP"] = "if \uBE14\uB85D\uC5D0 \uBAA8\uB4E0 \uC870\uAC74\uC774 \uAC70\uC9D3\uC77C \uB54C \uC2E4\uD589\uD560 \uBD80\uBD84\uC744 \uCD94\uAC00\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_WHILEUNTIL_OPERATOR_WHILE"] = "\uCC38\uC778 \uB3D9\uC548 \uBC18\uBCF5";
    Blockly.Msg["CONTROLS_WHILEUNTIL_OPERATOR_UNTIL"] = "\uCC38\uC774 \uB420 \uB54C\uAE4C\uC9C0 \uBC18\uBCF5";
    Blockly.Msg["CONTROLS_WHILEUNTIL_TOOLTIP_WHILE"] = "\uAC12\uC774 \uCC38\uC778 \uB3D9\uC548 \uBB38\uC7A5\uC744 \uBC18\uBCF5\uD569\uB2C8\uB2E4.";
    Blockly.Msg["CONTROLS_WHILEUNTIL_TOOLTIP_UNTIL"] = "\uAC12\uC774 \uAC70\uC9D3\uC778 \uB3D9\uC548 \uBB38\uC7A5\uC744 \uBC18\uBCF5\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_COMPARE_TOOLTIP_EQ"] = "\uB450 \uAC12\uC774 \uAC19\uC73C\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_COMPARE_TOOLTIP_NEQ"] = "\uB450 \uAC12\uC774 \uB2E4\uB974\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_COMPARE_TOOLTIP_LT"] = "\uCCAB \uBC88\uC9F8 \uAC12\uC774 \uB450 \uBC88\uC9F8\uBCF4\uB2E4 \uC791\uC73C\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_COMPARE_TOOLTIP_LTE"] = "\uCCAB \uBC88\uC9F8 \uAC12\uC774 \uB450 \uBC88\uC9F8\uBCF4\uB2E4 \uC791\uAC70\uB098 \uAC19\uC73C\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_COMPARE_TOOLTIP_GT"] = "\uCCAB \uBC88\uC9F8 \uAC12\uC774 \uB450 \uBC88\uC9F8\uBCF4\uB2E4 \uD06C\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_COMPARE_TOOLTIP_GTE"] = "\uCCAB \uBC88\uC9F8 \uAC12\uC774 \uB450 \uBC88\uC9F8\uBCF4\uB2E4 \uD06C\uAC70\uB098 \uAC19\uC73C\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_BOOLEAN_TRUE"] = "\uCC38";
    Blockly.Msg["LOGIC_BOOLEAN_FALSE"] = "\uAC70\uC9D3";
    Blockly.Msg["LOGIC_BOOLEAN_TOOLTIP"] = "\uCC38 \uB610\uB294 \uAC70\uC9D3\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_NEGATE_TITLE"] = "%1 \uC774(\uAC00) \uC544\uB2C8\uB2E4";
    Blockly.Msg["LOGIC_NEGATE_TOOLTIP"] = "\uC785\uB825\uC774 \uAC70\uC9D3\uC774\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4. \uC785\uB825\uC774 \uCC38\uC774\uBA74 \uAC70\uC9D3\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_OPERATION_AND"] = "\uADF8\uB9AC\uACE0";
    Blockly.Msg["LOGIC_OPERATION_OR"] = "\uB610\uB294";
    Blockly.Msg["LOGIC_OPERATION_TOOLTIP_AND"] = "\uB450 \uAC12\uC774 \uBAA8\uB450 \uCC38\uC774\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["LOGIC_OPERATION_TOOLTIP_OR"] = "\uB450 \uAC12 \uC911 \uD558\uB098\uB77C\uB3C4 \uCC38\uC774\uBA74 \uCC38\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_DEFNORETURN_TITLE"] = "\uD568\uC218";
    Blockly.Msg["PROCEDURES_DEFNORETURN_PROCEDURE"] = "\uC791\uC5C5";
    Blockly.Msg["PROCEDURES_DEFNORETURN_DO"] = "";
    Blockly.Msg["PROCEDURES_DEFNORETURN_TOOLTIP"] = "\uBC18\uD658\uAC12\uC774 \uC5C6\uB294 \uD568\uC218\uB97C \uB9CC\uB4ED\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_DEFNORETURN_COMMENT"] = "\uC774 \uD568\uC218\uC5D0 \uB300\uD55C \uC124\uBA85...";
    Blockly.Msg["PROCEDURES_DEFRETURN_TITLE"] = "\uD568\uC218 (\uBC18\uD658\uAC12 \uC788\uC74C)";
    Blockly.Msg["PROCEDURES_DEFRETURN_PROCEDURE"] = "\uACC4\uC0B0";
    Blockly.Msg["PROCEDURES_DEFRETURN_DO"] = "";
    Blockly.Msg["PROCEDURES_DEFRETURN_RETURN"] = "\uBC18\uD658";
    Blockly.Msg["PROCEDURES_DEFRETURN_TOOLTIP"] = "\uBC18\uD658\uAC12\uC774 \uC788\uB294 \uD568\uC218\uB97C \uB9CC\uB4ED\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_DEFRETURN_COMMENT"] = "\uC774 \uD568\uC218\uC5D0 \uB300\uD55C \uC124\uBA85...";
    Blockly.Msg["PROCEDURES_CALLNORETURN_TOOLTIP"] = "\uC0AC\uC6A9\uC790 \uC815\uC758 \uD568\uC218 '%1'\uC744(\uB97C) \uC2E4\uD589\uD569\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_CALLRETURN_TOOLTIP"] = "\uC0AC\uC6A9\uC790 \uC815\uC758 \uD568\uC218 '%1'\uC744(\uB97C) \uC2E4\uD589\uD558\uACE0 \uACB0\uACFC\uB97C \uC0AC\uC6A9\uD569\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_MUTATORCONTAINER_TITLE"] = "\uB9E4\uAC1C\uBCC0\uC218";
    Blockly.Msg["PROCEDURES_MUTATORCONTAINER_TOOLTIP"] = "\uC774 \uD568\uC218\uC5D0 \uC785\uB825\uC744 \uCD94\uAC00, \uC81C\uAC70, \uC7AC\uC815\uB82C\uD569\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_MUTATORARG_TITLE"] = "\uC785\uB825 \uC774\uB984:";
    Blockly.Msg["PROCEDURES_MUTATORARG_TOOLTIP"] = "\uD568\uC218\uC5D0 \uC785\uB825(\uB9E4\uAC1C\uBCC0\uC218)\uC744 \uCD94\uAC00\uD569\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_HIGHLIGHT_DEF"] = "\uD568\uC218 \uC815\uC758\uB85C \uC774\uB3D9";
    Blockly.Msg["PROCEDURES_CREATE_DO"] = "'%1' \uD638\uCD9C \uBE14\uB85D \uB9CC\uB4E4\uAE30";
    Blockly.Msg["PROCEDURES_IFRETURN_TOOLTIP"] = "\uAC12\uC774 \uCC38\uC774\uBA74 \uB450 \uBC88\uC9F8 \uAC12\uC744 \uBC18\uD658\uD569\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_IFRETURN_WARNING"] = "\uACBD\uACE0: \uC774 \uBE14\uB85D\uC740 \uD568\uC218 \uC815\uC758 \uB0B4\uC5D0\uC11C\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
    Blockly.Msg["PROCEDURES_BEFORE_PARAMS"] = "\uB9E4\uAC1C\uBCC0\uC218:";
    Blockly.Msg["PROCEDURES_CALL_BEFORE_PARAMS"] = "\uB9E4\uAC1C\uBCC0\uC218:";
    Blockly.Msg["PROCEDURES_ADD_PARAMETER"] = "\uB9E4\uAC1C\uBCC0\uC218 \uCD94\uAC00";
    Blockly.Msg["PROCEDURES_REMOVE_PARAMETER"] = "\uB9E4\uAC1C\uBCC0\uC218 \uC81C\uAC70";
    const workspace = Blockly.inject("blocklyDiv", {
      toolbox: document.getElementById("toolbox"),
      scrollbars: true,
      trashcan: true,
      zoom: {
        controls: true,
        wheel: true,
        pinch: true,
        startScale: 0.9,
        maxScale: 2,
        minScale: 0.3,
        scaleSpeed: 1.2
      }
    });
    Blockly.Python.init(workspace);
    return workspace;
  }
  function isBleConnected() {
    var _a, _b;
    return !!((_b = (_a = state.bluetoothDevice) == null ? void 0 : _a.gatt) == null ? void 0 : _b.connected) && !!state.characteristic;
  }
  function validateConnection() {
    if (!isBleConnected()) {
      alert("\uBA3C\uC800 \uD53C\uCF54\uB97C BLE\uB85C \uC5F0\uACB0\uD574\uC8FC\uC138\uC694!");
      Logger.add("[\uC624\uB958] BLE\uAC00 \uC5F0\uACB0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4", "error");
      return false;
    }
    return true;
  }
  function toggleDashboard() {
    const blocklyDiv = document.getElementById("blocklyDiv");
    const dashboardFrame = document.getElementById("dashboardFrame");
    const dashboardButton = document.getElementById("dashboardButton");
    const toolboxToggleBtn = document.getElementById("toolboxToggleBtn");
    if (!blocklyDiv || !dashboardFrame || !dashboardButton) return;
    const isDashboardHidden = dashboardFrame.style.display === "none" || dashboardFrame.style.display === "";
    if (isDashboardHidden) {
      blocklyDiv.style.display = "none";
      dashboardFrame.style.display = "block";
      if (toolboxToggleBtn) toolboxToggleBtn.style.display = "none";
      dashboardButton.textContent = "\u{1F9E9} \uBE14\uB85D\uCF54\uB529";
      elements.runButton.disabled = true;
      elements.saveButton.disabled = true;
      elements.loadButton.disabled = true;
      BluetoothManager.updateConnectionStatus(isBleConnected());
      Logger.add("[\uBAA8\uB4DC] \uB300\uC2DC\uBCF4\uB4DC \uC804\uD658", "info");
    } else {
      blocklyDiv.style.display = "block";
      dashboardFrame.style.display = "none";
      if (toolboxToggleBtn) toolboxToggleBtn.style.display = "";
      dashboardButton.textContent = "\u{1F4CA} \uB300\uC2DC\uBCF4\uB4DC";
      elements.saveButton.disabled = false;
      elements.loadButton.disabled = false;
      elements.runButton.disabled = !isBleConnected();
      BluetoothManager.updateConnectionStatus(isBleConnected());
      Logger.add("[\uBAA8\uB4DC] \uBE14\uB85D\uCF54\uB529 \uC804\uD658", "info");
    }
  }
  function setupLogToggle() {
    const logContainer = document.getElementById("logContainer");
    const logHeader = document.getElementById("logHeader");
    if (!logContainer || !logHeader) return;
    logContainer.classList.add("compact");
    logContainer.classList.remove("expanded");
    logHeader.addEventListener("click", (e) => {
      var _a;
      if (((_a = e.target) == null ? void 0 : _a.id) === "clearLogBtn") return;
      const expanded = logContainer.classList.toggle("expanded");
      logContainer.classList.toggle("compact", !expanded);
      Logger.refresh();
    });
  }
  function setupLogVisibilityButton(workspace) {
    const btn = document.getElementById("logToggleButton");
    const logContainer = document.getElementById("logContainer");
    if (!btn || !logContainer) return;
    const STORAGE_KEY = "ares.log.visible";
    const readVisible = () => {
      try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === null) return true;
        return v === "true";
      } catch (e) {
        return true;
      }
    };
    const writeVisible = (visible) => {
      try {
        localStorage.setItem(STORAGE_KEY, String(visible));
      } catch (e) {
      }
    };
    const applyVisible = (visible) => {
      document.body.classList.toggle("log-hidden", !visible);
      btn.setAttribute("aria-pressed", String(visible));
      btn.title = visible ? "\uD1B5\uC2E0 \uB85C\uADF8 \uC228\uAE30\uAE30" : "\uD1B5\uC2E0 \uB85C\uADF8 \uBCF4\uAE30";
      btn.textContent = visible ? "\u{1F4DD} \uB85C\uADF8 \uB044\uAE30" : "\u{1F4DD} \uB85C\uADF8 \uCF1C\uAE30";
      if (workspace) {
        setTimeout(() => {
          try {
            Blockly.svgResize(workspace);
          } catch (e) {
          }
        }, 0);
      }
    };
    applyVisible(readVisible());
    btn.addEventListener("click", () => {
      const nextVisible = document.body.classList.contains("log-hidden");
      applyVisible(nextVisible);
      writeVisible(nextVisible);
      Logger.refresh();
    });
  }
  function initializeEventListeners(workspace) {
    elements.connectButton.addEventListener("click", () => BluetoothManager.connect());
    elements.disconnectButton.addEventListener("click", () => BluetoothManager.disconnect());
    elements.clearLogBtn.addEventListener("click", () => {
      Logger.clear();
      Logger.refresh();
    });
    const dashboardButton = document.getElementById("dashboardButton");
    dashboardButton == null ? void 0 : dashboardButton.addEventListener("click", toggleDashboard);
    const emergencyStopButton = document.getElementById("emergencyStopButton");
    emergencyStopButton == null ? void 0 : emergencyStopButton.addEventListener("click", async () => {
      Logger.add("[\uBE44\uC0C1\uC815\uC9C0] \uC2E4\uD589\uB428", "error");
      state.isExecuting = false;
      if (isBleConnected()) {
        try {
          await BluetoothManager.sendData("STOP_ALL", false);
          Logger.add("[\uBE44\uC0C1\uC815\uC9C0] \uBAA8\uB4E0 \uD558\uB4DC\uC6E8\uC5B4 \uC815\uC9C0 \uC644\uB8CC", "info");
        } catch (error) {
          Logger.add(`[\uC624\uB958] \uBE44\uC0C1 \uC815\uC9C0 \uC804\uC1A1 \uC2E4\uD328: ${error.message}`, "error");
        }
      } else {
        Logger.add("[\uBE44\uC0C1\uC815\uC9C0] \uBE14\uB8E8\uD22C\uC2A4 \uBBF8\uC5F0\uACB0 - \uBE14\uB85D\uB9CC \uC911\uB2E8\uB428", "info");
      }
    });
    elements.runButton.addEventListener("click", async () => {
      if (!validateConnection()) return;
      if (state.isExecuting) {
        alert("\uC774\uBBF8 \uBA85\uB839\uC774 \uC2E4\uD589 \uC911\uC785\uB2C8\uB2E4. \uC7A0\uC2DC\uB9CC \uAE30\uB2E4\uB824\uC8FC\uC138\uC694.");
        return;
      }
      try {
        await CommandExecutor.executeWorkspace(workspace);
      } catch (error) {
        console.error("\uBA85\uB839 \uC2E4\uD589 \uC624\uB958:", error);
        alert("\uBA85\uB839 \uC2E4\uD589 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4: " + error.message);
        Logger.add(`[\uC624\uB958] \uBA85\uB839 \uC2E4\uD589 \uC2E4\uD328: ${error.message}`, "error");
      }
    });
    elements.saveButton.addEventListener("click", () => {
      const xml = Blockly.Xml.workspaceToDom(workspace);
      const xmlText = Blockly.utils.xml.domToText(xml);
      const fileName = prompt("\uC800\uC7A5\uD560 \uD30C\uC77C \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694 (\uD655\uC7A5\uC790 \uC81C\uC678):", "Ares_Workspace");
      if (!fileName) return;
      const blob = new Blob([xmlText], { type: "text/xml" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${fileName}.xml`;
      link.click();
    });
    window.addEventListener("message", async (event) => {
      const data = event.data;
      if (!data || !data.type) return;
      if (data.type === "command") {
        const cmd = data.data;
        Logger.add(`[\uB300\uC2DC\uBCF4\uB4DC] ${cmd}`, "info");
        const needsResponse = cmd === "GET_SYS" || cmd === "GET_STATUS";
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await BluetoothManager.sendData(cmd, needsResponse);
            break;
          } catch (error) {
            if (attempt < 2 && error.message.includes("\uC2DC\uAC04 \uCD08\uACFC")) {
              Logger.add(`[\uC7AC\uC2DC\uB3C4] ${cmd} (${attempt}/2)`, "warning");
              await new Promise((r) => setTimeout(r, 300));
            } else {
              if (error.message.includes("\uC2DC\uAC04 \uCD08\uACFC")) {
                Logger.add(`[\uACBD\uACE0] \uC751\uB2F5 \uC5C6\uC74C: ${cmd}`, "warning");
              } else {
                Logger.add(`[\uC624\uB958] \uC804\uC1A1 \uC2E4\uD328: ${error.message}`, "error");
              }
            }
          }
        }
      }
      if (data.type === "log_toggle") {
        const logContainer = document.getElementById("logContainer");
        const btn = document.getElementById("logToggleButton");
        const STORAGE_KEY = "ares.log.visible";
        if (logContainer) {
          document.body.classList.toggle("log-hidden", !data.visible);
          try {
            localStorage.setItem(STORAGE_KEY, String(data.visible));
          } catch (e) {
          }
          if (btn) {
            btn.setAttribute("aria-pressed", String(data.visible));
            btn.title = data.visible ? "\uD1B5\uC2E0 \uB85C\uADF8 \uC228\uAE30\uAE30" : "\uD1B5\uC2E0 \uB85C\uADF8 \uBCF4\uAE30";
            btn.textContent = data.visible ? "\u{1F4DD} \uB85C\uADF8 \uB044\uAE30" : "\u{1F4DD} \uB85C\uADF8 \uCF1C\uAE30";
          }
          try {
            Blockly.svgResize(workspace);
          } catch (e) {
          }
          Logger.refresh();
        }
      }
    });
    elements.loadButton.addEventListener("click", () => elements.fileInput.click());
    const exampleSelect = document.getElementById("exampleSelect");
    exampleSelect == null ? void 0 : exampleSelect.addEventListener("change", async (e) => {
      const name = e.target.value;
      if (!name) return;
      const url = new URL(`examples/${name}.xml`, window.location.href).href;
      Logger.add(`[\uC608\uC81C] \uC694\uCCAD: ${url}`, "info");
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const xmlText = await res.text();
        Logger.add(`[\uC608\uC81C] \uB2E4\uC6B4\uB85C\uB4DC ${xmlText.length} bytes`, "info");
        const xml = Blockly.utils.xml.textToDom(xmlText);
        workspace.clear();
        Blockly.Xml.domToWorkspace(xml, workspace);
        const blocklyDiv = document.getElementById("blocklyDiv");
        const dashboardFrame = document.getElementById("dashboardFrame");
        if (blocklyDiv && dashboardFrame && dashboardFrame.style.display === "block") {
          dashboardFrame.style.display = "none";
          blocklyDiv.style.display = "block";
        }
        Blockly.svgResize(workspace);
        workspace.scrollCenter();
        const count = workspace.getAllBlocks(false).length;
        Logger.add(`[\uC608\uC81C] ${name} \uB85C\uB4DC \uC644\uB8CC \u2014 \uBE14\uB85D ${count}\uAC1C`, "info");
      } catch (err) {
        alert("\uC608\uC81C \uBD88\uB7EC\uC624\uAE30\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4: " + err.message);
        Logger.add(`[\uC624\uB958] \uC608\uC81C \uBD88\uB7EC\uC624\uAE30 \uC2E4\uD328: ${err.message}`, "error");
        console.error("[\uC608\uC81C \uB85C\uB4DC \uC624\uB958]", err);
      } finally {
        e.target.value = "";
      }
    });
    elements.fileInput.addEventListener("change", (event) => {
      var _a;
      const file = (_a = event.target.files) == null ? void 0 : _a[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const xmlText = e.target.result;
        try {
          const xml = Blockly.utils.xml.textToDom(xmlText);
          workspace.clear();
          Blockly.Xml.domToWorkspace(xml, workspace);
          Logger.add(`[\uD30C\uC77C] ${file.name} \uBD88\uB7EC\uC624\uAE30 \uC644\uB8CC`, "info");
        } catch (err) {
          alert("Blockly \uC791\uC5C5 \uACF5\uAC04\uC744 \uBD88\uB7EC\uC624\uB294 \uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uC720\uD6A8\uD55C XML \uD30C\uC77C\uC778\uC9C0 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
          Logger.add(`[\uC624\uB958] ${file.name} \uD30C\uC77C \uB85C\uB4DC \uC2E4\uD328`, "error");
          console.error("Error loading workspace:", err);
        }
      };
      reader.readAsText(file);
    });
    window.addEventListener("beforeunload", () => {
      var _a, _b;
      if ((_b = (_a = state.bluetoothDevice) == null ? void 0 : _a.gatt) == null ? void 0 : _b.connected) {
        BluetoothManager.disconnect();
      }
    });
    {
      const STORAGE_KEY = "ares.toolbox.opened";
      let opened = true;
      const getMainContent = () => document.querySelector(".main-content");
      const getToolboxDiv = () => document.querySelector(".blocklyToolboxDiv");
      const readOpened = () => {
        try {
          const v = localStorage.getItem(STORAGE_KEY);
          if (v === null) return null;
          return v === "true";
        } catch (e) {
          return null;
        }
      };
      const writeOpened = (v) => {
        try {
          localStorage.setItem(STORAGE_KEY, String(v));
        } catch (e) {
        }
      };
      const getOrCreateToggleBtn = () => {
        let btn = document.getElementById("toolboxToggleBtn");
        if (btn) return btn;
        btn = document.createElement("button");
        btn.id = "toolboxToggleBtn";
        btn.type = "button";
        btn.title = "\uBE14\uB7ED\uCF54\uB529 \uC5F4\uAE30/\uB2EB\uAE30";
        btn.setAttribute("aria-pressed", "true");
        const stop = (e) => e.stopPropagation();
        btn.addEventListener("pointerdown", stop, true);
        btn.addEventListener("mousedown", stop, true);
        btn.addEventListener("touchstart", stop, true);
        const mainContent = getMainContent();
        if (mainContent) mainContent.appendChild(btn);
        return btn;
      };
      const placeToggleBtn = () => {
        const btn = getOrCreateToggleBtn();
        const toolboxDiv = getToolboxDiv();
        const mainContent = getMainContent();
        if (opened && toolboxDiv && toolboxDiv.offsetWidth > 0 && toolboxDiv.offsetHeight > 0) {
          if (btn.parentElement !== toolboxDiv) toolboxDiv.prepend(btn);
          btn.classList.remove("toolbox-toggle--handle");
          btn.classList.add("toolbox-toggle--inside");
          return;
        }
        if (mainContent && btn.parentElement !== mainContent) mainContent.appendChild(btn);
        btn.classList.remove("toolbox-toggle--inside");
        btn.classList.add("toolbox-toggle--handle");
      };
      const updateToggleText = () => {
        const btn = document.getElementById("toolboxToggleBtn");
        if (!btn) return;
        btn.textContent = opened ? "\u{1F9E9} \uBE14\uB7ED\uCF54\uB529 \uB2EB\uAE30" : "\u{1F9E9} \uBE14\uB7ED\uCF54\uB529 \uC5F4\uAE30";
        btn.setAttribute("aria-pressed", String(opened));
        btn.title = opened ? "\uBE14\uB7ED\uCF54\uB529 \uC228\uAE30\uAE30" : "\uBE14\uB7ED\uCF54\uB529 \uBCF4\uAE30";
      };
      const applyToolboxVisibility = (nextOpened) => {
        var _a;
        opened = nextOpened;
        const tb = (_a = workspace.getToolbox) == null ? void 0 : _a.call(workspace);
        if ((tb == null ? void 0 : tb.show) && (tb == null ? void 0 : tb.hide)) {
          opened ? tb.show() : tb.hide();
        } else {
          const toolboxDiv = getToolboxDiv();
          if (toolboxDiv) toolboxDiv.style.display = opened ? "" : "none";
        }
        placeToggleBtn();
        updateToggleText();
        Blockly.svgResize(workspace);
      };
      const defaultOpened = !window.matchMedia("(max-width: 768px)").matches;
      const savedOpened = readOpened();
      applyToolboxVisibility(savedOpened === null ? defaultOpened : savedOpened);
      getOrCreateToggleBtn().addEventListener("click", (e) => {
        e.stopPropagation();
        applyToolboxVisibility(!opened);
        writeOpened(opened);
      });
    }
  }
  function main() {
    const workspace = initializeBlockly();
    initializeEventListeners(workspace);
    const logContainer = document.getElementById("logContainer");
    if (logContainer) logContainer.classList.add("compact");
    setupLogToggle();
    setupLogVisibilityButton(workspace);
    BluetoothManager.updateConnectionStatus(false);
    Logger.add("[\uC2DC\uC791] ARES \uC900\uBE44 \uC644\uB8CC - BLE \uC5F0\uACB0\uC744 \uC2DC\uC791\uD558\uC138\uC694", "info");
    Logger.refresh();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
