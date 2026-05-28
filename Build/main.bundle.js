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
        message0: "\u{1F4A1} LED \uC804\uCCB4 \uC124\uC815 [ %1 %2 %3 %4 %5 %6 ]",
        args0: [
          { type: "input_value", name: "LAMP0", check: "Number" },
          { type: "input_value", name: "LAMP1", check: "Number" },
          { type: "input_value", name: "LAMP2", check: "Number" },
          { type: "input_value", name: "LAMP3", check: "Number" },
          { type: "input_value", name: "LAMP4", check: "Number" },
          { type: "input_value", name: "LAMP5", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#FF5555",
        tooltip: "6\uAC1C LED \uBC1D\uAE30\uB97C \uD55C\uBC88\uC5D0 \uC124\uC815\uD569\uB2C8\uB2E4. \uAC12: 0(\uB054)~1(\uCD5C\uB300 \uBC1D\uAE30)"
      },
      {
        type: "led_on",
        message0: "\u{1F4A1} LED %1 \uBC88 \uCF1C\uAE30 (\uBC1D\uAE30 %2 )",
        args0: [
          { type: "field_dropdown", name: "LED_NUM", options: [
            ["0\uBC88", "0"],
            ["1\uBC88", "1"],
            ["2\uBC88", "2"],
            ["3\uBC88", "3"],
            ["4\uBC88", "4"],
            ["5\uBC88", "5"]
          ] },
          { type: "input_value", name: "BRIGHTNESS", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#FF5555",
        tooltip: "\uD2B9\uC815 LED(0~5\uBC88)\uB97C \uC9C0\uC815\uD55C \uBC1D\uAE30\uB85C \uCF2D\uB2C8\uB2E4. \uBC1D\uAE30: 0~1"
      },
      {
        type: "led_off",
        message0: "\u{1F4A1} LED %1 \uB044\uAE30",
        args0: [
          { type: "field_dropdown", name: "LED_NUM", options: [
            ["0\uBC88", "0"],
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
      {
        type: "buzzer_note",
        message0: "\u{1F50A} \uACC4\uBA85 %1 \uB85C %2 \uCD08 \uC6B8\uB9AC\uAE30",
        args0: [
          { type: "field_dropdown", name: "NOTE", options: [
            // 낮은 옥타브 (C3 ~ B3)
            ["\uB3C4(\u2193)", "131"],
            ["\uB808(\u2193)", "147"],
            ["\uBBF8(\u2193)", "165"],
            ["\uD30C(\u2193)", "175"],
            ["\uC194(\u2193)", "196"],
            ["\uB77C(\u2193)", "220"],
            ["\uC2DC(\u2193)", "247"],
            // 가운데 옥타브 (C4 ~ B4)
            ["\uB3C4", "262"],
            ["\uB808", "294"],
            ["\uBBF8", "330"],
            ["\uD30C", "349"],
            ["\uC194", "392"],
            ["\uB77C", "440"],
            ["\uC2DC", "494"],
            // 높은 옥타브 (C5 ~ B5)
            ["\uB3C4(\u2191)", "523"],
            ["\uB808(\u2191)", "587"],
            ["\uBBF8(\u2191)", "659"],
            ["\uD30C(\u2191)", "698"],
            ["\uC194(\u2191)", "784"],
            ["\uB77C(\u2191)", "880"],
            ["\uC2DC(\u2191)", "988"]
          ] },
          { type: "input_value", name: "DURATION", check: "Number" }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: "#00CCFF",
        tooltip: "\uC120\uD0DD\uD55C \uACC4\uBA85\uC5D0 \uD574\uB2F9\uD558\uB294 \uC8FC\uD30C\uC218\uB85C \uBD80\uC800\uB97C \uC6B8\uB9BD\uB2C8\uB2E4. \uC138 \uC625\uD0C0\uBE0C \uC9C0\uC6D0 \u2014 (\u2193)\uB0AE\uC740 \uC625\uD0C0\uBE0C / \uAE30\uBCF8 \uAC00\uC6B4\uB370 / (\u2191)\uB192\uC740 \uC625\uD0C0\uBE0C. \uAC00\uC6B4\uB370 \uB3C4=262 Hz, \uB77C=440 Hz."
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
    // 전송 경로 추상화: 시뮬레이션 중(simSink 설정)에는 실제 BLE 대신
    // sink 로 명령을 흘려보낸다. sink(command, waitForResponse) 는 회신을
    // 흉내내고 가짜 응답을 반환한다. 평소(simSink=null)에는 실제 BLE 송신.
    simSink: null,
    _dispatch(command, waitForResponse) {
      return this.simSink ? this.simSink(command, waitForResponse) : BluetoothManager.sendData(command, waitForResponse);
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
      if (!this.simSink) BluetoothManager.updateStatus("\uBB36\uC74C \uC2E4\uD589 \uC911...", STATUS_COLORS.ORANGE);
      try {
        await this._dispatch(payload, true);
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
          const lamps = [0, 1, 2, 3, 4, 5].map(
            (i) => parseFloat(this.evaluateValueBlock(block.getInputTargetBlock(`LAMP${i}`)) || "0").toFixed(1)
          );
          return `[${lamps.join(" ")}]`;
        }
        case "led_on": {
          const ledNumStr = block.getFieldValue("LED_NUM") || "0";
          const ledNum = Math.max(0, Math.min(5, parseInt(ledNumStr, 10)));
          const brightness = this.evaluateValueBlock(block.getInputTargetBlock("BRIGHTNESS")) || "1";
          return `LED_ON,${ledNum},${brightness}`;
        }
        case "led_off": {
          const ledNumStr = block.getFieldValue("LED_NUM") || "0";
          if (ledNumStr === "ALL") return "LED_OFF,ALL";
          const ledNum = Math.max(0, Math.min(5, parseInt(ledNumStr, 10)));
          return `LED_OFF,${ledNum}`;
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
        case "buzzer_note": {
          const freq = parseInt(block.getFieldValue("NOTE"), 10) || 262;
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
      if (!this.simSink) BluetoothManager.updateStatus("\uBA85\uB839 \uC2E4\uD589 \uC911...", STATUS_COLORS.ORANGE);
      const fireAndForget = this._isFireAndForget(command);
      try {
        await this._dispatch(command, !fireAndForget);
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
    _findProcedureDefinition(workspace2, name, hasReturn) {
      const defType = hasReturn ? "procedures_defreturn" : "procedures_defnoreturn";
      const allBlocks = workspace2.getAllBlocks();
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
    async executeWorkspace(workspace2) {
      var _a, _b;
      state.isExecuting = true;
      elements.runButton.disabled = true;
      BluetoothManager.updateStatus("\uD504\uB85C\uADF8\uB7A8 \uC2E4\uD589 \uC911...", STATUS_COLORS.ORANGE);
      Logger.add("[\uC2E4\uD589] \uD504\uB85C\uADF8\uB7A8 \uC2DC\uC791", "info");
      try {
        const topBlocks = workspace2.getTopBlocks(true);
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
    },
    // 시뮬레이션 실행: 실제 BLE 없이 sink(로그)로 명령을 흘려보낸다.
    // executeWorkspace 와 동일한 블록 처리 로직을 재사용하되, 전송은 _dispatch →
    // simSink 로 라우팅된다. (runButton/BLE 상태는 건드리지 않는다)
    async simulateWorkspace(workspace2, sink) {
      if (state.isExecuting) return;
      this.simSink = sink;
      state.isExecuting = true;
      try {
        const topBlocks = workspace2.getTopBlocks(true);
        for (const block of topBlocks) {
          if (!state.isExecuting) break;
          if (block.type === "procedures_defnoreturn" || block.type === "procedures_defreturn") continue;
          await this.processBlock(block);
        }
      } finally {
        state.isExecuting = false;
        this.simSink = null;
      }
    }
  };

  // simulation.js
  function recolorLaunchpadAntenna(root, THREE) {
    const meshes = [];
    root.traverse((o) => {
      var _a;
      if (o.isMesh && ((_a = o.geometry) == null ? void 0 : _a.getAttribute("position"))) meshes.push(o);
    });
    if (!meshes.length) return;
    function splitTris(idxArr, pos, isInRegion) {
      const insideTris = [], outsideTris = [];
      const triCount = idxArr.length / 3;
      for (let t = 0; t < triCount; t++) {
        const a = idxArr[t * 3], b = idxArr[t * 3 + 1], c = idxArr[t * 3 + 2];
        const allIn = isInRegion(pos[a * 3], pos[a * 3 + 1]) && isInRegion(pos[b * 3], pos[b * 3 + 1]) && isInRegion(pos[c * 3], pos[c * 3 + 1]);
        (allIn ? insideTris : outsideTris).push(a, b, c);
      }
      if (!insideTris.length) return null;
      let cx = 0, cy = 0, cz = 0, n = 0;
      const used = new Set(insideTris);
      for (const v of used) {
        cx += pos[v * 3];
        cy += pos[v * 3 + 1];
        cz += pos[v * 3 + 2];
        n++;
      }
      return { insideTris, outsideTris, centroid: { x: cx / n, y: cy / n, z: cz / n } };
    }
    for (const mesh of meshes) {
      const geom = mesh.geometry;
      const posAttr = geom.getAttribute("position");
      if (!geom.getIndex() || !posAttr) continue;
      const pos = posAttr.array;
      geom.computeBoundingBox();
      const bb = geom.boundingBox;
      const sx = bb.max.x - bb.min.x;
      const sy = bb.max.y - bb.min.y;
      const isAntenna = (x, y) => {
        const fx = (x - bb.min.x) / sx;
        const fy = (y - bb.min.y) / sy;
        return fx > 0.78 && fx < 0.92 && fy > 0.7;
      };
      let split = splitTris(geom.getIndex().array, pos, isAntenna);
      if (!split) {
        console.warn("[LaunchStation] \uC548\uD14C\uB098 \uC815\uC810 \uAC10\uC9C0 \uC2E4\uD328");
      } else {
        const { insideTris, outsideTris, centroid } = split;
        const pivotOffsetX = -0.01;
        const pivotX = centroid.x + pivotOffsetX;
        const antennaGeom = geom.clone();
        antennaGeom.setIndex(insideTris);
        const grayMat = new THREE.MeshStandardMaterial({
          color: 10133670,
          metalness: 0.1,
          roughness: 0.7,
          side: THREE.DoubleSide,
          emissive: 4210752,
          emissiveIntensity: 0.6
        });
        const pivot = new THREE.Group();
        pivot.position.set(pivotX, centroid.y, centroid.z);
        const antennaMesh = new THREE.Mesh(antennaGeom, grayMat);
        antennaMesh.position.set(-pivotX, -centroid.y, -centroid.z);
        antennaMesh.castShadow = true;
        antennaMesh.receiveShadow = true;
        antennaMesh.frustumCulled = false;
        pivot.add(antennaMesh);
        mesh.add(pivot);
        root.userData.antennaPivot = pivot;
        geom.setIndex(outsideTris);
        console.log(`[LaunchStation] \uC548\uD14C\uB098 \uC815\uC810 \uBD84\uB9AC: ${insideTris.length / 3}\uAC1C \uC0BC\uAC01\uD615`);
      }
      const isRocket = (x, y) => {
        const fx = (x - bb.min.x) / sx;
        const fy = (y - bb.min.y) / sy;
        return fx > 0.28 && fx < 0.46 && fy > 0.68;
      };
      split = splitTris(geom.getIndex().array, pos, isRocket);
      if (!split) {
        console.warn("[LaunchStation] \uB85C\uCF13 \uC815\uC810 \uAC10\uC9C0 \uC2E4\uD328");
      } else {
        const { insideTris, outsideTris } = split;
        const rocketGeom = geom.clone();
        rocketGeom.setIndex(insideTris);
        let rxMin = Infinity, rxMax = -Infinity;
        let ryMin = Infinity, ryMax = -Infinity;
        let rzMin = Infinity, rzMax = -Infinity;
        const usedR = new Set(insideTris);
        for (const v of usedR) {
          const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
          if (x < rxMin) rxMin = x;
          if (x > rxMax) rxMax = x;
          if (y < ryMin) ryMin = y;
          if (y > ryMax) ryMax = y;
          if (z < rzMin) rzMin = z;
          if (z > rzMax) rzMax = z;
        }
        const rcx = (rxMin + rxMax) / 2;
        const rcz = (rzMin + rzMax) / 2;
        const rby = ryMin;
        const yellowMat = new THREE.MeshStandardMaterial({
          color: 16110138,
          metalness: 0.05,
          roughness: 0.55,
          side: THREE.DoubleSide,
          emissive: 4864520,
          emissiveIntensity: 0.45
        });
        const rocketGroup = new THREE.Group();
        const rocketMesh = new THREE.Mesh(rocketGeom, yellowMat);
        rocketMesh.castShadow = true;
        rocketMesh.receiveShadow = true;
        rocketMesh.frustumCulled = false;
        rocketGroup.add(rocketMesh);
        const fc = document.createElement("canvas");
        fc.width = fc.height = 128;
        const fcx = fc.getContext("2d");
        const fg = fcx.createRadialGradient(64, 64, 0, 64, 64, 64);
        fg.addColorStop(0, "rgba(255,250,200,1)");
        fg.addColorStop(0.3, "rgba(255,150,40,0.9)");
        fg.addColorStop(0.7, "rgba(255,60,0,0.4)");
        fg.addColorStop(1, "rgba(255,0,0,0)");
        fcx.fillStyle = fg;
        fcx.fillRect(0, 0, 128, 128);
        const flameTex = new THREE.CanvasTexture(fc);
        flameTex.colorSpace = THREE.SRGBColorSpace;
        const flameSprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: flameTex,
          color: 16755251,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0
        }));
        flameSprite.position.set(rcx, rby - 0.1, rcz);
        flameSprite.scale.set(0.22, 0.5, 1);
        flameSprite.visible = false;
        rocketGroup.add(flameSprite);
        const flameLight = new THREE.PointLight(16748576, 0, 1.8, 2);
        flameLight.position.set(rcx, rby - 0.05, rcz);
        rocketGroup.add(flameLight);
        mesh.add(rocketGroup);
        geom.setIndex(outsideTris);
        root.userData.rocketGroup = rocketGroup;
        root.userData.rocketFlameSprite = flameSprite;
        root.userData.rocketFlameLight = flameLight;
        root.userData.rocketCentroidLocal = new THREE.Vector3(rcx, (ryMin + ryMax) / 2, rcz);
        root.userData.rocketMeshRef = mesh;
        console.log(`[LaunchStation] \uB85C\uCF13 \uC815\uC810 \uBD84\uB9AC: ${insideTris.length / 3}\uAC1C \uC0BC\uAC01\uD615`);
      }
    }
  }
  var TOPICS = {
    albi: { label: "\uC54C\uBE44\uC640 \uD568\uAED8", model: "Mesh/AlbiStaticLow.glb", eyes: { radius: 0.11, left: [-0.145, 0.425, 0.12], right: [0.145, 0.425, 0.12] } },
    traffic: { label: "\uC6B0\uC8FC \uC2E0\uD638\uB4F1", model: "Mesh/LampBox.glb", eyes: null, traffic: { lamp: "Mesh/LampGeneral.glb", hands: ["Mesh/LampHand1.glb", "Mesh/LampHand2.glb", "Mesh/LampHand3.glb"], count: 3 } },
    launchpad: { label: "\uBC1C\uC0AC\uB300", model: "Mesh/LaunchStation.glb", eyes: null, postProcess: recolorLaunchpadAntenna, radar: true }
  };
  var TOPIC_ORDER = ["albi", "traffic", "launchpad"];
  var DEFAULT_TOPIC = "albi";
  var MISSION_TOPIC = {};
  function defaultTopicForMission() {
    var _a, _b;
    const l = ((_a = document.getElementById("lessonSelect")) == null ? void 0 : _a.value) || "";
    const m = ((_b = document.getElementById("missionSelect")) == null ? void 0 : _b.value) || "";
    return MISSION_TOPIC[`L${l}M${m}`] || DEFAULT_TOPIC;
  }
  function buildSim(THREE, A, stage, loadingEl, cfg) {
    const { GLTFLoader, OrbitControls, RoomEnvironment } = A;
    const EYE = cfg.eyes || null;
    const TRAFFIC = cfg.traffic || null;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    scene.add(new THREE.HemisphereLight(14674687, 3293231, 0.55));
    const key = new THREE.DirectionalLight(16774374, 2);
    key.position.set(3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -3e-4;
    scene.add(key);
    const fill = new THREE.DirectionalLight(10469616, 0.5);
    fill.position.set(-4, 2, 4);
    scene.add(fill);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.ShadowMaterial({ opacity: 0.25 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    let eyeL = null, eyeR = null, glowTex = null;
    if (EYE) {
      const gc = document.createElement("canvas");
      gc.width = gc.height = 128;
      const gx = gc.getContext("2d");
      const gg = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gg.addColorStop(0, "rgba(180,255,210,1)");
      gg.addColorStop(0.25, "rgba(40,255,120,0.65)");
      gg.addColorStop(1, "rgba(0,255,90,0)");
      gx.fillStyle = gg;
      gx.fillRect(0, 0, 128, 128);
      glowTex = new THREE.CanvasTexture(gc);
      glowTex.colorSpace = THREE.SRGBColorSpace;
      const makeEye = (pos) => {
        const grp = new THREE.Group();
        grp.position.fromArray(pos);
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(EYE.radius, 28, 28),
          new THREE.MeshStandardMaterial({ color: 797208, emissive: 65382, emissiveIntensity: 0, transparent: true, opacity: 0.4, roughness: 0.2, metalness: 0 })
        );
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 5635993, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 }));
        glow.scale.setScalar(EYE.radius * 3.3);
        glow.visible = false;
        const light = new THREE.PointLight(3407735, 0, EYE.radius * 22, 2);
        grp.add(sphere, glow, light);
        return { group: grp, sphere, glow, light, on: false };
      };
      eyeL = makeEye(EYE.left);
      eyeR = makeEye(EYE.right);
    }
    function setEye(side, on) {
      if (!EYE) return;
      const e = side === "L" ? eyeL : eyeR;
      e.on = on;
      e.sphere.material.emissiveIntensity = on ? 3.2 : 0;
      e.sphere.material.opacity = on ? 0.92 : 0.4;
      e.glow.visible = on;
      e.light.intensity = on ? 1.8 : 0;
    }
    const frame = (cy, dist) => {
      camera.position.set(0, cy, dist);
      camera.near = dist / 100;
      camera.far = dist * 100;
      camera.updateProjectionMatrix();
      controls.target.set(0, cy, 0);
      controls.update();
    };
    let trafficRoot = null;
    let trafficBox = null;
    let trafficSlots = null;
    let trafficTopY = 0;
    const trafficSlotState = [];
    let trafficMode = null;
    const TRAFFIC_LAMP_COLORS = [16711680, 16763904, 49200];
    const TRAFFIC_HAND_COLOR = 16763904;
    if (cfg.model) {
      new GLTFLoader().load(cfg.model, (gltf) => {
        var _a;
        const root = gltf.scene;
        root.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
          }
        });
        const box = new THREE.Box3().setFromObject(root);
        const sz = box.getSize(new THREE.Vector3());
        const c = box.getCenter(new THREE.Vector3());
        root.position.x -= c.x;
        root.position.z -= c.z;
        root.position.y -= box.min.y;
        const modelH = sz.y;
        if (EYE) root.add(eyeL.group, eyeR.group);
        try {
          (_a = cfg.postProcess) == null ? void 0 : _a.call(cfg, root, THREE);
        } catch (e) {
          console.warn("postProcess \uC2E4\uD328:", e);
        }
        antennaPivot = root.userData.antennaPivot || null;
        rocketGroup = root.userData.rocketGroup || null;
        rocketFlameSprite = root.userData.rocketFlameSprite || null;
        rocketFlameLight = root.userData.rocketFlameLight || null;
        rocketCentroidLocal = root.userData.rocketCentroidLocal || null;
        rocketMeshRef = root.userData.rocketMeshRef || null;
        scene.add(root);
        if (TRAFFIC) {
          trafficRoot = root;
          trafficBox = new THREE.Box3().setFromObject(root);
          const tsz = trafficBox.getSize(new THREE.Vector3());
          const tcn = trafficBox.getCenter(new THREE.Vector3());
          trafficTopY = trafficBox.max.y;
          const n = Math.max(1, TRAFFIC.count || 3);
          const span = tsz.x * 0.8;
          const start = tcn.x - span / 2;
          const step = n === 1 ? 0 : span / (n - 1);
          const slotW = span / n;
          trafficSlots = [];
          for (let i = 0; i < n; i++) trafficSlots.push({ x: start + step * i, z: tcn.z, width: slotW });
          placeLamps();
        }
        const maxDim = Math.max(sz.x, sz.y, sz.z);
        const fov = camera.fov * Math.PI / 180;
        frame(modelH * 0.55, maxDim / 2 / Math.tan(fov / 2) * 1.9);
        if (loadingEl) loadingEl.style.display = "none";
      }, void 0, (err) => {
        console.error("\uC2DC\uBBAC\uB808\uC774\uC158 \uBAA8\uB378 \uB85C\uB4DC \uC2E4\uD328:", err);
        if (loadingEl) loadingEl.textContent = "\uBAA8\uB378\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694 (HTTP \uC11C\uBC84\uC5D0\uC11C \uC2E4\uD589\uD574\uC57C \uD569\uB2C8\uB2E4)";
      });
    } else {
      const ph = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshBasicMaterial({ color: 6269158, wireframe: true, transparent: true, opacity: 0.35 })
      );
      ph.position.y = 0.5;
      scene.add(ph);
      frame(0.5, 2.6);
      if (loadingEl) {
        loadingEl.style.display = "";
        loadingEl.textContent = "\u{1F6A7} \uC900\uBE44 \uC911\uC778 \uC2DC\uBBAC\uB808\uC774\uC158\uC785\uB2C8\uB2E4 (\uBE48 \uAC1D\uCCB4)";
      }
    }
    function resize() {
      const w = stage.clientWidth || 360, h = stage.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    let radarOn = false;
    let antennaPivot = null;
    function setRadar(on) {
      radarOn = !!on;
    }
    let rocketGroup = null, rocketFlameSprite = null, rocketFlameLight = null;
    let rocketCentroidLocal = null, rocketMeshRef = null;
    let rocketLaunchOn = false;
    let rocketAnimT = 0;
    let savedCamPos = null, savedTarget = null, rocketCentroidWorld = null;
    const ROCKET_RISE = 10;
    const ROCKET_SPEED = 267e-5;
    function setRocketLaunch(on) {
      rocketLaunchOn = !!on;
      if (rocketLaunchOn && !savedCamPos) {
        savedCamPos = camera.position.clone();
        savedTarget = controls.target.clone();
        if (rocketCentroidLocal && rocketMeshRef) {
          rocketMeshRef.updateMatrixWorld(true);
          rocketCentroidWorld = rocketCentroidLocal.clone().applyMatrix4(rocketMeshRef.matrixWorld);
        }
      }
    }
    function render2() {
      controls.update();
      if (radarOn && antennaPivot) antennaPivot.rotation.y += 0.15;
      if (rocketGroup) {
        const targetT = rocketLaunchOn ? 1 : 0;
        if (rocketAnimT !== targetT) {
          const dir = Math.sign(targetT - rocketAnimT);
          rocketAnimT = Math.max(0, Math.min(1, rocketAnimT + dir * ROCKET_SPEED));
        }
        const eased = rocketLaunchOn ? 1 - (1 - rocketAnimT) * (1 - rocketAnimT) : rocketAnimT * rocketAnimT;
        rocketGroup.position.y = ROCKET_RISE * eased;
        const showFlame = rocketLaunchOn || rocketAnimT > 0.01;
        if (rocketFlameSprite) {
          rocketFlameSprite.visible = showFlame;
          if (showFlame) {
            const wob = 1 + 0.25 * Math.sin(performance.now() * 0.025);
            rocketFlameSprite.scale.set(0.22 * wob, 0.5 * wob, 1);
            rocketFlameSprite.material.opacity = Math.min(1, rocketAnimT * 4) * 0.95;
          }
        }
        if (rocketFlameLight) {
          rocketFlameLight.intensity = showFlame ? Math.min(1, rocketAnimT * 4) * 1.8 : 0;
        }
        if (savedCamPos && savedTarget && rocketCentroidWorld) {
          const rocketYNow = rocketCentroidWorld.y + ROCKET_RISE * eased;
          if (rocketLaunchOn) {
            controls.target.x = rocketCentroidWorld.x;
            controls.target.y = rocketYNow;
            controls.target.z = rocketCentroidWorld.z;
          } else {
            controls.target.x = savedTarget.x + (rocketCentroidWorld.x - savedTarget.x) * eased;
            controls.target.y = savedTarget.y + (rocketYNow - savedTarget.y) * eased;
            controls.target.z = savedTarget.z + (rocketCentroidWorld.z - savedTarget.z) * eased;
          }
          camera.position.y = savedCamPos.y + ROCKET_RISE * eased;
        }
        if (!rocketLaunchOn && rocketAnimT === 0 && savedCamPos) {
          camera.position.copy(savedCamPos);
          controls.target.copy(savedTarget);
          savedCamPos = null;
          savedTarget = null;
          rocketCentroidWorld = null;
        }
      }
      renderer.render(scene, camera);
    }
    const TRAFFIC_LAMP_ROT_X = Math.PI / 2;
    function disposeSubtree(obj) {
      obj.traverse((o) => {
        var _a, _b;
        if (o.isMesh) {
          (_b = (_a = o.geometry) == null ? void 0 : _a.dispose) == null ? void 0 : _b.call(_a);
          const m = o.material;
          (Array.isArray(m) ? m : [m]).forEach((mm) => {
            var _a2;
            return (_a2 = mm == null ? void 0 : mm.dispose) == null ? void 0 : _a2.call(mm);
          });
        }
      });
      if (obj.parent) obj.parent.remove(obj);
    }
    function clearSlot(i) {
      const s = trafficSlotState[i];
      if (!s) return;
      if (s.inst) disposeSubtree(s.inst);
      if (s.light && s.light.parent) s.light.parent.remove(s.light);
      trafficSlotState[i] = null;
    }
    function clearAllSlots() {
      for (let i = 0; i < trafficSlotState.length; i++) clearSlot(i);
    }
    function fitOnSlot(inst, slot, widthRatio, rotX) {
      if (rotX) inst.rotation.x = rotX;
      inst.updateMatrixWorld(true);
      const tb = new THREE.Box3().setFromObject(inst);
      const ts = tb.getSize(new THREE.Vector3());
      const s = ts.x > 0 ? slot.width * widthRatio / ts.x : 1;
      inst.scale.setScalar(s);
      inst.updateMatrixWorld(true);
      const ib = new THREE.Box3().setFromObject(inst);
      const ic = ib.getCenter(new THREE.Vector3());
      inst.position.set(slot.x - ic.x, trafficTopY - ib.min.y, slot.z - ic.z);
    }
    function cloneInstanceMaterials(obj) {
      obj.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        }
      });
    }
    function collectMaterials(obj) {
      const arr = [];
      obj.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) if (m) arr.push(m);
      });
      return arr;
    }
    function makeSlotLight(slot, colorHex) {
      const l = new THREE.PointLight(colorHex, 0, slot.width * 6, 2);
      l.position.set(slot.x, trafficTopY + slot.width * 0.5, slot.z);
      return l;
    }
    const TRAFFIC_OFF_COLOR = new THREE.Color(6710886);
    function setSlotOn(i, on) {
      const s = trafficSlotState[i];
      if (!s) return;
      s.on = !!on;
      const onCol = new THREE.Color(s.color);
      for (const m of s.materials) {
        if (m.color !== void 0) m.color.copy(s.on ? onCol : TRAFFIC_OFF_COLOR);
        if (m.emissive !== void 0) {
          m.emissive.copy(s.on ? onCol : new THREE.Color(0));
          m.emissiveIntensity = s.on ? 0.7 : 0;
        }
        if (m.metalness !== void 0) m.metalness = Math.min(m.metalness, 0.1);
        if (m.roughness !== void 0) m.roughness = Math.max(m.roughness, 0.55);
        m.transparent = true;
        m.opacity = s.on ? 0.8 : 0.55;
        m.depthWrite = false;
        m.needsUpdate = true;
      }
      if (s.light) s.light.intensity = s.on ? 1.3 : 0;
    }
    function toggleSlot(i) {
      const s = trafficSlotState[i];
      if (!s) return;
      setSlotOn(i, !s.on);
    }
    function placeLamps() {
      if (!TRAFFIC || !trafficRoot || !trafficSlots) return;
      clearAllSlots();
      trafficMode = "lamps";
      const myMode = trafficMode;
      new GLTFLoader().load(TRAFFIC.lamp, (gltf) => {
        if (trafficMode !== myMode) return;
        const template = gltf.scene;
        template.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
          }
        });
        for (let i = 0; i < trafficSlots.length; i++) {
          const inst = template.clone(true);
          cloneInstanceMaterials(inst);
          fitOnSlot(inst, trafficSlots[i], 0.7, TRAFFIC_LAMP_ROT_X);
          scene.add(inst);
          const color = TRAFFIC_LAMP_COLORS[i] !== void 0 ? TRAFFIC_LAMP_COLORS[i] : 16777215;
          const light = makeSlotLight(trafficSlots[i], color);
          scene.add(light);
          trafficSlotState[i] = { kind: "lamp", inst, light, color, materials: collectMaterials(inst), on: false };
          setSlotOn(i, false);
        }
      }, void 0, (err) => console.error("LampGeneral \uB85C\uB4DC \uC2E4\uD328:", err));
    }
    function placeHands() {
      if (!TRAFFIC || !trafficRoot || !trafficSlots) return;
      clearAllSlots();
      trafficMode = "hands";
      const myMode = trafficMode;
      const n = Math.min(trafficSlots.length, TRAFFIC.hands.length);
      for (let i = 0; i < n; i++) {
        const slot = trafficSlots[i], url = TRAFFIC.hands[i], idx = i;
        new GLTFLoader().load(url, (gltf) => {
          if (trafficMode !== myMode) return;
          const inst = gltf.scene;
          inst.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              o.frustumCulled = false;
            }
          });
          cloneInstanceMaterials(inst);
          fitOnSlot(inst, slot, 0.85, 0);
          scene.add(inst);
          const color = TRAFFIC_HAND_COLOR;
          const light = makeSlotLight(slot, color);
          scene.add(light);
          trafficSlotState[idx] = { kind: "hand", inst, light, color, materials: collectMaterials(inst), on: false };
          setSlotOn(idx, false);
        }, void 0, (err) => console.error("LampHand \uB85C\uB4DC \uC2E4\uD328:", err));
      }
    }
    function resetTraffic() {
      clearAllSlots();
      trafficMode = null;
    }
    function dispose() {
      try {
        controls.dispose();
      } catch (e) {
      }
      scene.traverse((o) => {
        var _a, _b;
        if (o.isMesh) {
          (_b = (_a = o.geometry) == null ? void 0 : _a.dispose) == null ? void 0 : _b.call(_a);
          const m = o.material;
          (Array.isArray(m) ? m : [m]).forEach((mm) => {
            var _a2;
            return (_a2 = mm == null ? void 0 : mm.dispose) == null ? void 0 : _a2.call(mm);
          });
        }
      });
      try {
        renderer.dispose();
      } catch (e) {
      }
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    return {
      render: render2,
      resize,
      setEye,
      dispose,
      hasEyes: !!EYE,
      get eyeL() {
        return eyeL;
      },
      get eyeR() {
        return eyeR;
      },
      hasTraffic: !!TRAFFIC,
      placeLamps,
      placeHands,
      resetTraffic,
      toggleSlot,
      get hasRadar() {
        return !!antennaPivot;
      },
      setRadar,
      get radarOn() {
        return radarOn;
      },
      get hasRocket() {
        return !!rocketGroup;
      },
      setRocketLaunch,
      get rocketLaunchOn() {
        return rocketLaunchOn;
      }
    };
  }
  function setupSimulation({ workspace: workspace2 }) {
    const btn = document.getElementById("simToggle");
    const card = document.getElementById("simCard");
    const stage = document.getElementById("simStage");
    const loadingEl = document.getElementById("simLoading");
    const ledWrap = card ? card.querySelector(".sim-led-buttons") : null;
    const trafficWrap = card ? card.querySelector(".sim-traffic-buttons") : null;
    const launchWrap = card ? card.querySelector(".sim-launch-buttons") : null;
    const radarBtn = document.getElementById("simRadar");
    const rocketBtn = document.getElementById("simRocket");
    const simHint = document.getElementById("simHint");
    const HINT_DEFAULT = "\uB85C\uBD07: \uB04C\uC5B4\uC11C \uD68C\uC804 \xB7 \uD720: \uD655\uB300 \xB7 \uC81C\uBAA9\uC904\uC744 \uB04C\uBA74 \uCC3D \uC774\uB3D9 \xB7 LED \uBC84\uD2BC\uC73C\uB85C \uB208 \uCF1C\uACE0 \uB044\uAE30";
    const HINT_TRAFFIC = "1, 2, 3\uBC88 \uD0A4\uB97C \uB20C\uB7EC \uB7A8\uD504\uB97C \uCF1C\uACE0 \uB044\uAE30";
    const HINT_LAUNCH = "\uB808\uC774\uB354 \uAC00\uB3D9 \xB7 \uB85C\uCF13 \uBC1C\uC0AC \uBC84\uD2BC\uC744 \uB20C\uB7EC \uBC1C\uC0AC\uB300\uB97C \uC791\uB3D9\uC2DC\uCF1C \uBCF4\uC138\uC694";
    const RADAR_LABEL_ON = '<span class="dot"></span>\u{1F6F0}\uFE0F \uB808\uC774\uB354<small>\uD68C\uC804 \uBA48\uCDA4</small>';
    const RADAR_LABEL_OFF = '<span class="dot"></span>\u{1F6F0}\uFE0F \uB808\uC774\uB354<small>\uC548\uD14C\uB098 \uD68C\uC804</small>';
    const ROCKET_LABEL_ON = '<span class="dot"></span>\u{1F680} \uBC1C\uC0AC \uC911\uC9C0<small>\uC6D0\uC704\uCE58\uB85C</small>';
    const ROCKET_LABEL_OFF = '<span class="dot"></span>\u{1F680} \uB85C\uCF13 \uBC1C\uC0AC<small>\uC704\uB85C \uC0C1\uC2B9</small>';
    const sel = document.getElementById("simTopic");
    if (!btn || !card || !stage) return null;
    const THREE = window.THREE, A = window.ARES3;
    if (!THREE || !A || !A.GLTFLoader) {
      btn.disabled = true;
      btn.title = "3D \uB77C\uC774\uBE0C\uB7EC\uB9AC(three.js)\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4";
      return null;
    }
    if (sel && !sel.options.length) {
      TOPIC_ORDER.forEach((k) => {
        const o = document.createElement("option");
        o.value = k;
        o.textContent = TOPICS[k].label;
        sel.appendChild(o);
      });
      sel.value = DEFAULT_TOPIC;
    }
    let sim = null, raf = 0, builtTopic = null;
    const loop = () => {
      sim.render();
      raf = requestAnimationFrame(loop);
    };
    const build = (topicKey) => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (sim) {
        sim.dispose();
        sim = null;
      }
      const cfg = TOPICS[topicKey] || TOPICS[DEFAULT_TOPIC];
      if (loadingEl) {
        loadingEl.style.display = "";
        loadingEl.textContent = "\uBD88\uB7EC\uC624\uB294 \uC911\u2026";
      }
      card.querySelectorAll(".sim-led-btn").forEach((b) => b.classList.remove("on"));
      card.querySelectorAll(".sim-traffic-btn").forEach((b) => {
        b.classList.toggle("on", !!cfg.traffic && b.dataset.action === "lamps");
      });
      if (ledWrap) ledWrap.style.display = cfg.eyes ? "" : "none";
      if (trafficWrap) trafficWrap.style.display = cfg.traffic ? "" : "none";
      if (launchWrap) launchWrap.style.display = cfg.radar ? "" : "none";
      if (radarBtn) {
        radarBtn.classList.remove("on");
        radarBtn.innerHTML = RADAR_LABEL_OFF;
        radarBtn.setAttribute("aria-pressed", "false");
      }
      if (rocketBtn) {
        rocketBtn.classList.remove("on");
        rocketBtn.innerHTML = ROCKET_LABEL_OFF;
        rocketBtn.setAttribute("aria-pressed", "false");
      }
      if (simHint) {
        simHint.textContent = cfg.traffic ? HINT_TRAFFIC : cfg.radar ? HINT_LAUNCH : HINT_DEFAULT;
      }
      sim = buildSim(THREE, A, stage, loadingEl, cfg);
      builtTopic = topicKey;
    };
    const open = () => {
      card.hidden = false;
      if (!sim && sel) sel.value = defaultTopicForMission();
      const t = sel && sel.value || DEFAULT_TOPIC;
      if (!sim || builtTopic !== t) build(t);
      sim.resize();
      cancelAnimationFrame(raf);
      loop();
      btn.textContent = "\u{1F916} \uC2DC\uBBAC\uB808\uC774\uC158 \uB2EB\uAE30";
      btn.setAttribute("aria-pressed", "true");
    };
    const close = () => {
      if (card.hidden) return;
      card.hidden = true;
      cancelAnimationFrame(raf);
      raf = 0;
      btn.textContent = "\u{1F916} \uC2DC\uBBAC\uB808\uC774\uC158 \uC5F4\uAE30";
      btn.setAttribute("aria-pressed", "false");
    };
    if (sel) sel.addEventListener("change", () => {
      build(sel.value);
      sim.resize();
      cancelAnimationFrame(raf);
      loop();
    });
    btn.addEventListener("click", () => {
      card.hidden ? open() : close();
    });
    card.querySelectorAll(".sim-led-btn").forEach((b) => {
      b.addEventListener("click", () => {
        if (!sim || !sim.hasEyes) return;
        const side = b.dataset.side;
        const cur = side === "L" ? sim.eyeL.on : sim.eyeR.on;
        sim.setEye(side, !cur);
        b.classList.toggle("on", !cur);
      });
    });
    const setTrafficBtn = (which) => {
      card.querySelectorAll(".sim-traffic-btn").forEach((b) => {
        b.classList.toggle("on", b.dataset.action === which);
      });
    };
    card.querySelectorAll(".sim-traffic-btn").forEach((b) => {
      b.addEventListener("click", () => {
        if (!sim || !sim.hasTraffic) return;
        const action = b.dataset.action;
        if (action === "lamps") {
          sim.placeLamps();
          setTrafficBtn("lamps");
        } else if (action === "hand") {
          sim.placeHands();
          setTrafficBtn("hand");
        }
      });
    });
    if (radarBtn) {
      radarBtn.addEventListener("click", () => {
        if (!sim || !sim.hasRadar) return;
        const next = !sim.radarOn;
        sim.setRadar(next);
        radarBtn.classList.toggle("on", next);
        radarBtn.innerHTML = next ? RADAR_LABEL_ON : RADAR_LABEL_OFF;
        radarBtn.setAttribute("aria-pressed", String(next));
      });
    }
    if (rocketBtn) {
      rocketBtn.addEventListener("click", () => {
        if (!sim || !sim.hasRocket) return;
        const next = !sim.rocketLaunchOn;
        sim.setRocketLaunch(next);
        rocketBtn.classList.toggle("on", next);
        rocketBtn.innerHTML = next ? ROCKET_LABEL_ON : ROCKET_LABEL_OFF;
        rocketBtn.setAttribute("aria-pressed", String(next));
      });
    }
    const simLog = document.getElementById("simLog");
    const simRunBtn = document.getElementById("simRun");
    const simClearBtn = document.getElementById("simLogClear");
    const logLine = (text, cls) => {
      if (!simLog) return;
      const d = document.createElement("div");
      d.className = "sim-log-line" + (cls ? " " + cls : "");
      d.textContent = text;
      simLog.appendChild(d);
      simLog.scrollTop = simLog.scrollHeight;
    };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const simSink = async (command, waitForResponse) => {
      const delay = waitForResponse ? 100 : 20;
      logLine(`\u2192 ${command}`, waitForResponse ? "tx-ack" : "tx");
      await wait(delay);
      let reply = "1";
      if (command.startsWith("DISTANCE")) reply = "DIST:30";
      else if (command.startsWith("MAGNET")) reply = "MAG:0";
      logLine(`     \u21A9 ${reply}  (+${delay}ms, ${waitForResponse ? "Ack" : "\uBE44Ack"})`, "rx");
      return reply;
    };
    let simRunning = false;
    if (simRunBtn) simRunBtn.addEventListener("click", async () => {
      if (simRunning) return;
      if (!workspace2) {
        logLine("\uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4\uAC00 \uC900\uBE44\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4", "err");
        return;
      }
      simRunning = true;
      simRunBtn.disabled = true;
      logLine("\u2500\u2500\u2500\u2500 \uC2DC\uBBAC\uB808\uC774\uC158 \uC2DC\uC791 \u2500\u2500\u2500\u2500", "sys");
      try {
        await CommandExecutor.simulateWorkspace(workspace2, simSink);
        logLine("\u2500\u2500\u2500\u2500 \uC2DC\uBBAC\uB808\uC774\uC158 \uC885\uB8CC \u2500\u2500\u2500\u2500", "sys");
      } catch (e) {
        logLine("\uC624\uB958: " + (e && e.message ? e.message : e), "err");
      } finally {
        simRunning = false;
        simRunBtn.disabled = false;
      }
    });
    if (simClearBtn) simClearBtn.addEventListener("click", () => {
      if (simLog) simLog.textContent = "";
    });
    const head = card.querySelector(".sim-card-head");
    if (head) {
      let dragging = false, startX = 0, startY = 0, baseX = 0, baseY = 0;
      head.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".sim-led-btn") || e.target.closest(".sim-traffic-btn") || e.target.closest(".sim-launch-btn") || e.target.closest(".sim-topic")) return;
        const r = card.getBoundingClientRect();
        card.style.position = "fixed";
        card.style.left = r.left + "px";
        card.style.top = r.top + "px";
        card.style.right = "auto";
        card.style.bottom = "auto";
        card.style.transform = "none";
        card.style.margin = "0";
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        baseX = r.left;
        baseY = r.top;
        try {
          head.setPointerCapture(e.pointerId);
        } catch (e2) {
        }
        e.preventDefault();
      });
      head.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const w = card.offsetWidth;
        let nx = baseX + (e.clientX - startX);
        let ny = baseY + (e.clientY - startY);
        nx = Math.max(40 - w, Math.min(nx, innerWidth - 40));
        ny = Math.max(0, Math.min(ny, innerHeight - 36));
        card.style.left = nx + "px";
        card.style.top = ny + "px";
      });
      const endDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        try {
          head.releasePointerCapture(e.pointerId);
        } catch (e2) {
        }
      };
      head.addEventListener("pointerup", endDrag);
      head.addEventListener("pointercancel", endDrag);
    }
    addEventListener("resize", () => {
      if (!card.hidden && sim) sim.resize();
    });
    addEventListener("keydown", (e) => {
      if (card.hidden || !sim || !sim.hasTraffic) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      const tag = t && t.tagName || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t && t.isContentEditable) return;
      let idx = -1;
      if (e.key === "1") idx = 0;
      else if (e.key === "2") idx = 1;
      else if (e.key === "3") idx = 2;
      if (idx < 0) return;
      sim.toggleSlot(idx);
      e.preventDefault();
    });
    return { close };
  }

  // main.js
  var LESSON_CATALOG = [
    { n: 1, title: "\uCF54\uB529 \uC785\uBB38\uACFC \uC54C\uBE44 \uB9CC\uB0A8", tag: "theory", hardware: "(\uC774\uB860) Bluetooth \uD398\uC5B4\uB9C1", concept: "\uC21C\uCC28/\uBC18\uBCF5 \uAC1C\uB150, \uC571 \uC124\uCE58" },
    { n: 2, title: "LED \uAE30\uCD08: \uC54C\uBE44\uC758 \uCCAB \uD638\uD761", tag: "LED", hardware: "LED 1\uAC1C", concept: "\uB514\uC9C0\uD138 \uCD9C\uB825 HIGH/LOW, time.sleep" },
    { n: 3, title: "LED 2\uAC1C\uB85C \uD45C\uC815 \uB9CC\uB4E4\uAE30", tag: "WINK", hardware: "LED 2\uAC1C", concept: "\uB2E4\uCC44\uB110 \uB3D9\uC2DC \uC81C\uC5B4, \uC719\uD06C \uB9AC\uB4EC" },
    { n: 4, title: "\uBD80\uC800\uB85C \uC18C\uB9AC \uB9CC\uB4E4\uAE30", tag: "BUZZER", hardware: "\uBD80\uC800", concept: "\uC8FC\uD30C\uC218(Hz) \xD7 \uC9C0\uC18D\uC2DC\uAC04" },
    { n: 5, title: "LED 3\uAC1C\uB85C \uC2E0\uD638\uB4F1 \uB9CC\uB4E4\uAE30", tag: "TRAFFIC", hardware: "LED 3\uAC1C", concept: "\uC2DC\uD000\uC2A4 \uC0AC\uACE0, \uBAA8\uB4DC \uBD84\uAE30" },
    { n: 6, title: "\uB79C\uB364 \uD568\uC218\uC640 \uAC00\uC704\uBC14\uC704\uBCF4 \uAC8C\uC784", tag: "RANDOM", hardware: "LED 3\uAC1C", concept: "random.randint, \uBE44\uACB0\uC815\uC801 \uCF54\uB4DC" },
    { n: 7, title: "DC\uBAA8\uD130 \uC785\uBB38: \uD68C\uC804\uACFC \uB8F0\uB81B", tag: "MOTOR", hardware: "DC\uBAA8\uD130 + \uC6D0\uD310", concept: "\uC815/\uC5ED \uD68C\uC804, PWM \uC18D\uB3C4 \uC870\uC808" },
    { n: 8, title: "\uC54C\uBE44 \uCE74\uD2B8 \uC8FC\uD589", tag: "MOTOR", hardware: "DC\uBAA8\uD130 + \uBC14\uD034 2\uAC1C", concept: "\uC804\xB7\uD6C4\uC9C4 \uC8FC\uD589, \uAC00\uAC10\uC18D \uACE1\uC120" },
    { n: 9, title: "\uBC1C\uC0AC\uB300 \uC81C\uC791\uACFC 1\uBD84\uAE30 \uD68C\uACE0", tag: "theory", hardware: "(\uC81C\uC791/\uC774\uB860)", concept: "1\uBD84\uAE30 \uCD1D\uC815\uB9AC, 2\uBD84\uAE30 \uC608\uACE0" },
    { n: 10, title: "LED 5\uAC1C \uC2DC\uD000\uC2A4\uC640 \uCE74\uC6B4\uD2B8\uB2E4\uC6B4", tag: "SEQUENCE", hardware: "LED 5\uAC1C", concept: "\uBC1C\uC0AC \uC2DC\uD000\uC2A4, \uBAA8\uB4C8\uD654 \uC0AC\uACE0" },
    { n: 11, title: "LED\uC640 \uBD80\uC800 \uB3D9\uAE30\uD654", tag: "SYNC", hardware: "LED 5\uAC1C + \uBD80\uC800", concept: "\uBE5B/\uC18C\uB9AC \uB3D9\uAE30, \uC74C\uACC4(\uB3C4\uB808\uBBF8\uD30C\uC194)" },
    { n: 12, title: "\uD654\uC131 \uB85C\uCF13 \uCD5C\uC885 \uBC1C\uC0AC!", tag: "LAUNCH", hardware: "LED 5\uAC1C + \uBD80\uC800 + DC\uBAA8\uD130", concept: "\uD1B5\uD569 \uC2DC\uB098\uB9AC\uC624, \uC790\uC720 \uCC3D\uC791 \uBC1C\uD45C" }
  ];
  var lessonCache = /* @__PURE__ */ new Map();
  var workspace = null;
  var currentView = "overview";
  function initializeBlockly() {
    if (!navigator.bluetooth) {
      alert("\uC774 \uBE0C\uB77C\uC6B0\uC800\uB294 Web Bluetooth API\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. Chrome 56+ \uB610\uB294 Edge 79+\uB97C \uC0AC\uC6A9\uD574\uC8FC\uC138\uC694.");
      Logger.add("[\uC624\uB958] \uBE0C\uB77C\uC6B0\uC800\uAC00 Web Bluetooth API\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4", "error");
    }
    Blockly.defineBlocksWithJsonArray(BlocklyConfig.blocks);
    attachBatchBlockValidator(Blockly);
    applyKoreanMessages();
    workspace = Blockly.inject("blocklyDiv", {
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
  function applyKoreanMessages() {
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
  function parseHash() {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const lessonRaw = parseInt(params.get("lesson"), 10);
    const missionRaw = parseInt(params.get("mission"), 10);
    const lesson = Number.isFinite(lessonRaw) && lessonRaw >= 1 && lessonRaw <= 12 ? lessonRaw : null;
    const mission = Number.isFinite(missionRaw) && missionRaw >= 1 && missionRaw <= 4 ? missionRaw : null;
    return { lesson, mission: lesson ? mission : null };
  }
  function navigate({ lesson = null, mission = null } = {}) {
    let target = "";
    if (lesson) {
      target = `lesson=${lesson}`;
      if (mission) target += `&mission=${mission}`;
    }
    const next = "#" + target;
    if (window.location.hash !== next) {
      window.location.hash = next;
    } else {
      applyRoute();
    }
  }
  async function applyRoute() {
    const { lesson, mission } = parseHash();
    if (lesson && mission) {
      await enterMission(lesson, mission);
    } else if (lesson) {
      await enterLesson(lesson);
    } else {
      enterOverview();
    }
  }
  function showView(view) {
    for (const v of ["overview", "lesson", "mission"]) {
      const el = document.getElementById(v + "View");
      if (el) el.hidden = v !== view;
    }
    currentView = view;
    const inMission = view === "mission";
    const ble = isBleConnected();
    if (elements.saveButton) elements.saveButton.disabled = !inMission;
    if (elements.loadButton) elements.loadButton.disabled = !inMission;
    const exampleSelect = document.getElementById("exampleSelect");
    if (exampleSelect) exampleSelect.disabled = !inMission;
    if (elements.runButton) elements.runButton.disabled = !inMission || !ble;
    const panelToggle = document.getElementById("missionPanelToggle");
    if (panelToggle) panelToggle.hidden = !inMission;
    const simToggle = document.getElementById("simToggle");
    if (simToggle) simToggle.hidden = !inMission;
    if (!inMission && simController) simController.close();
    if (inMission && workspace) {
      setTimeout(() => {
        try {
          Blockly.svgResize(workspace);
        } catch (e) {
        }
      }, 0);
    }
  }
  async function enterOverview() {
    showView("overview");
    document.getElementById("lessonSelect").value = "";
    populateMissionSelect(null);
    updateBreadcrumb(null, null);
    const container = document.getElementById("overviewContent");
    if (container && container.dataset.loaded !== "true") {
      try {
        const res = await fetch("overview.html", { cache: "no-store" });
        container.innerHTML = await res.text();
        container.dataset.loaded = "true";
        const tbody = document.getElementById("overviewLessonTableBody");
        if (tbody) {
          tbody.innerHTML = LESSON_CATALOG.map((l) => `
          <tr data-lesson="${l.n}">
            <td class="lesson-n">${l.n}</td>
            <td class="lesson-title-cell">
              <a href="#lesson=${l.n}">${escapeHtml2(l.title)}</a>
            </td>
            <td>${escapeHtml2(l.hardware)}</td>
            <td>${escapeHtml2(l.concept)}</td>
            <td><span class="tag tag-${l.tag}">${escapeHtml2(l.tag)}</span></td>
          </tr>
        `).join("");
        }
      } catch (e) {
        container.innerHTML = '<p style="color:#E74C3C">\uAC1C\uC694\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.</p>';
        Logger.add(`[\uC624\uB958] overview.html \uB85C\uB4DC \uC2E4\uD328: ${e.message}`, "error");
      }
    }
  }
  async function enterLesson(n) {
    const data = await loadLesson(n);
    if (!data) {
      enterOverview();
      return;
    }
    showView("lesson");
    document.getElementById("lessonSelect").value = String(n);
    populateMissionSelect(n, data);
    updateBreadcrumb(n, null);
    document.getElementById("lessonHeading").textContent = `${n}\uCC28\uC2DC \u2014 ${data.title}`;
    document.getElementById("lessonTagBadge").textContent = data.tag;
    document.getElementById("lessonTagBadge").className = `lesson-tag tag-${data.tag}`;
    document.getElementById("lessonHardware").textContent = `\u{1F527} ${data.hardware}`;
    document.getElementById("lessonConcept").textContent = `\u{1F4A1} ${data.concept}`;
    document.getElementById("lessonIntro").textContent = data.intro;
    const ml = document.getElementById("lessonMissionList");
    ml.innerHTML = data.missions.map((m) => `
    <li class="mission-list-item">
      <a href="#lesson=${n}&mission=${m.id}">
        <span class="mission-id">\uBBF8\uC158 ${m.id}</span>
        <span class="mission-list-title">${escapeHtml2(m.title)}</span>
        <span class="mission-list-hw">${escapeHtml2(m.hardware)}</span>
      </a>
    </li>
  `).join("");
    const sm = document.getElementById("lessonSummary");
    if (data.summary) {
      sm.innerHTML = `
      <div class="summary-box summary-${data.summary.type}">
        <h4>${escapeHtml2(data.summary.title)}</h4>
        <p>${escapeHtml2(data.summary.text)}</p>
      </div>
    `;
    } else {
      sm.innerHTML = "";
    }
  }
  async function enterMission(n, m) {
    const data = await loadLesson(n);
    if (!data) {
      enterOverview();
      return;
    }
    const mission = data.missions.find((x) => x.id === m);
    if (!mission) {
      enterLesson(n);
      return;
    }
    showView("mission");
    document.getElementById("lessonSelect").value = String(n);
    populateMissionSelect(n, data);
    document.getElementById("missionSelect").value = String(m);
    updateBreadcrumb(n, m);
    document.getElementById("missionHeading").textContent = `${n}\uCC28\uC2DC \uBBF8\uC158 ${m} \u2014 ${mission.title}`;
    document.getElementById("missionTagBadge").textContent = mission.tag;
    document.getElementById("missionTagBadge").className = `lesson-tag tag-${mission.tag}`;
    document.getElementById("missionHardware").textContent = `\u{1F527} ${mission.hardware}`;
    const storyEl = document.getElementById("missionStory");
    storyEl.innerHTML = (mission.story || []).map((line) => `
    <div class="story-line story-${line.speaker}">
      <span class="story-avatar">${line.speaker === "ares" ? "\u{1F9D1}\u200D\u{1F680}" : "\u{1F916}"}</span>
      <span class="story-name">${line.speaker === "ares" ? "\uC544\uB808\uC2A4" : "\uC54C\uBE44"}</span>
      <span class="story-text">${escapeHtml2(line.text)}</span>
    </div>
  `).join("");
    const goalsEl = document.getElementById("missionGoals");
    goalsEl.innerHTML = (mission.goals || []).map((g) => `<li>${escapeHtml2(g)}</li>`).join("");
    document.getElementById("missionSampleCode").textContent = mission.sampleCode || "";
    const prev = document.getElementById("prevMissionBtn");
    const next = document.getElementById("nextMissionBtn");
    prev.disabled = m <= 1 && n <= 1;
    next.disabled = m >= 4 && n >= 12;
    prev.onclick = () => {
      if (m > 1) navigate({ lesson: n, mission: m - 1 });
      else if (n > 1) navigate({ lesson: n - 1, mission: 4 });
    };
    next.onclick = () => {
      if (m < 4) navigate({ lesson: n, mission: m + 1 });
      else if (n < 12) navigate({ lesson: n + 1, mission: 1 });
    };
    if (workspace) {
      placeToolboxToggleBtn();
      setTimeout(() => {
        try {
          Blockly.svgResize(workspace);
        } catch (e) {
        }
      }, 0);
    }
  }
  async function loadLesson(n) {
    if (lessonCache.has(n)) return lessonCache.get(n);
    const padded = String(n).padStart(2, "0");
    const url = `Lesson${padded}/lesson.json`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      lessonCache.set(n, json);
      return json;
    } catch (e) {
      Logger.add(`[\uC624\uB958] ${url} \uB85C\uB4DC \uC2E4\uD328: ${e.message}`, "error");
      return null;
    }
  }
  function buildLessonSelect() {
    const sel = document.getElementById("lessonSelect");
    if (!sel) return;
    for (const l of LESSON_CATALOG) {
      const opt = document.createElement("option");
      opt.value = String(l.n);
      opt.textContent = `${l.n}\uCC28\uC2DC \u2014 ${l.title}`;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => {
      const n = parseInt(sel.value, 10);
      if (Number.isFinite(n)) navigate({ lesson: n });
      else navigate({});
    });
  }
  function populateMissionSelect(n, data = null) {
    const sel = document.getElementById("missionSelect");
    if (!sel) return;
    sel.innerHTML = '<option value="">\uBBF8\uC158 \uC120\uD0DD\u2026</option>';
    if (!n) {
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    const missions = (data == null ? void 0 : data.missions) || [];
    if (missions.length === 0) {
      for (let i = 1; i <= 4; i++) {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `\uBBF8\uC158 ${i}`;
        sel.appendChild(opt);
      }
    } else {
      for (const m of missions) {
        const opt = document.createElement("option");
        opt.value = String(m.id);
        opt.textContent = `\uBBF8\uC158 ${m.id} \u2014 ${m.title}`;
        sel.appendChild(opt);
      }
    }
  }
  function updateBreadcrumb(n, m) {
    const bc = document.getElementById("breadcrumb");
    if (!bc) return;
    if (n && m) bc.textContent = `${n}\uCC28\uC2DC \u203A \uBBF8\uC158 ${m}`;
    else if (n) bc.textContent = `${n}\uCC28\uC2DC`;
    else bc.textContent = "";
  }
  function escapeHtml2(s) {
    return String(s != null ? s : "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function toggleDashboard() {
    const blocklyDiv = document.getElementById("blocklyDiv");
    const dashboardFrame = document.getElementById("dashboardFrame");
    const dashboardButton = document.getElementById("dashboardButton");
    const toolboxToggleBtn = document.getElementById("toolboxToggleBtn");
    if (!blocklyDiv || !dashboardFrame || !dashboardButton) return;
    if (currentView !== "mission") {
      navigate({ lesson: 1, mission: 1 });
      setTimeout(() => toggleDashboard(), 100);
      return;
    }
    const isDashboardHidden = dashboardFrame.style.display === "none" || dashboardFrame.style.display === "";
    if (isDashboardHidden) {
      blocklyDiv.style.display = "none";
      dashboardFrame.style.display = "block";
      if (toolboxToggleBtn) toolboxToggleBtn.style.display = "none";
      dashboardButton.textContent = "\u{1F9E9} \uCF54\uB529";
      if (elements.runButton) elements.runButton.disabled = true;
      if (elements.saveButton) elements.saveButton.disabled = true;
      if (elements.loadButton) elements.loadButton.disabled = true;
      BluetoothManager.updateConnectionStatus(isBleConnected());
      Logger.add("[\uBAA8\uB4DC] \uB300\uC2DC\uBCF4\uB4DC \uC804\uD658", "info");
    } else {
      blocklyDiv.style.display = "block";
      dashboardFrame.style.display = "none";
      if (toolboxToggleBtn) toolboxToggleBtn.style.display = "";
      dashboardButton.textContent = "\u{1F50D} \uC810\uAC80";
      if (elements.saveButton) elements.saveButton.disabled = false;
      if (elements.loadButton) elements.loadButton.disabled = false;
      if (elements.runButton) elements.runButton.disabled = !isBleConnected();
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
  function setupLogVisibilityButton() {
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
      btn.textContent = visible ? "\u{1F4DD} \uB85C\uADF8\uB044\uAE30" : "\u{1F4DD} \uB85C\uADF8\uCF1C\uAE30";
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
  function setupMissionPanelToggle() {
    const STORAGE_KEY = "ares.missionPanel.opened";
    const btn = document.getElementById("missionPanelToggle");
    const panel = document.getElementById("missionPanel");
    if (!btn || !panel) return;
    const readOpened = () => {
      try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === null) return true;
        return v === "true";
      } catch (e) {
        return true;
      }
    };
    const writeOpened = (v) => {
      try {
        localStorage.setItem(STORAGE_KEY, String(v));
      } catch (e) {
      }
    };
    const apply = (opened) => {
      panel.classList.toggle("collapsed", !opened);
      btn.setAttribute("aria-pressed", String(opened));
      btn.textContent = opened ? "\u{1F4D6} \uBBF8\uC158 \uC124\uBA85 \uB2EB\uAE30" : "\u{1F4D6} \uBBF8\uC158 \uC124\uBA85 \uC5F4\uAE30";
      btn.title = opened ? "\uBBF8\uC158 \uC124\uBA85 \uD328\uB110 \uC228\uAE30\uAE30" : "\uBBF8\uC158 \uC124\uBA85 \uD328\uB110 \uBCF4\uC774\uAE30";
      if (workspace) {
        setTimeout(() => {
          try {
            Blockly.svgResize(workspace);
          } catch (e) {
          }
        }, 0);
      }
    };
    apply(readOpened());
    btn.addEventListener("click", () => {
      const nextOpened = panel.classList.contains("collapsed");
      apply(nextOpened);
      writeOpened(nextOpened);
    });
  }
  var simController = null;
  var _toggleBtnOpened = true;
  function placeToolboxToggleBtn() {
    const btn = document.getElementById("toolboxToggleBtn");
    if (!btn) return;
    const toolboxDiv = document.querySelector(".blocklyToolboxDiv");
    const ws = document.querySelector(".mission-workspace");
    if (_toggleBtnOpened && toolboxDiv && toolboxDiv.offsetWidth > 0 && toolboxDiv.offsetHeight > 0) {
      if (btn.parentElement !== toolboxDiv) toolboxDiv.prepend(btn);
      btn.classList.remove("toolbox-toggle--handle");
      btn.classList.add("toolbox-toggle--inside");
      return;
    }
    if (ws && btn.parentElement !== ws) ws.appendChild(btn);
    btn.classList.remove("toolbox-toggle--inside");
    btn.classList.add("toolbox-toggle--handle");
  }
  function setupToolboxToggle() {
    var _a;
    const STORAGE_KEY = "ares.toolbox.opened";
    let btn = document.getElementById("toolboxToggleBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "toolboxToggleBtn";
      btn.type = "button";
      btn.title = "\uBE14\uB7ED\uCF54\uB529 \uC5F4\uAE30/\uB2EB\uAE30";
      btn.setAttribute("aria-pressed", "true");
      const stop = (e) => e.stopPropagation();
      btn.addEventListener("pointerdown", stop, true);
      btn.addEventListener("mousedown", stop, true);
      btn.addEventListener("touchstart", stop, true);
      (_a = document.querySelector(".mission-workspace")) == null ? void 0 : _a.appendChild(btn);
    }
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
    const updateToggleText = () => {
      btn.textContent = _toggleBtnOpened ? "\u{1F9E9} \uBE14\uB7ED\uCF54\uB529 \uB2EB\uAE30" : "\u{1F9E9} \uBE14\uB7ED\uCF54\uB529 \uC5F4\uAE30";
      btn.setAttribute("aria-pressed", String(_toggleBtnOpened));
      btn.title = _toggleBtnOpened ? "\uBE14\uB7ED\uCF54\uB529 \uC228\uAE30\uAE30" : "\uBE14\uB7ED\uCF54\uB529 \uBCF4\uAE30";
    };
    const applyToolboxVisibility = (nextOpened) => {
      var _a2;
      _toggleBtnOpened = nextOpened;
      const tb = (_a2 = workspace == null ? void 0 : workspace.getToolbox) == null ? void 0 : _a2.call(workspace);
      if ((tb == null ? void 0 : tb.show) && (tb == null ? void 0 : tb.hide)) {
        _toggleBtnOpened ? tb.show() : tb.hide();
      } else {
        const toolboxDiv = document.querySelector(".blocklyToolboxDiv");
        if (toolboxDiv) toolboxDiv.style.display = _toggleBtnOpened ? "" : "none";
      }
      placeToolboxToggleBtn();
      updateToggleText();
      if (workspace) Blockly.svgResize(workspace);
    };
    const defaultOpened = !window.matchMedia("(max-width: 768px)").matches;
    const savedOpened = readOpened();
    applyToolboxVisibility(savedOpened === null ? defaultOpened : savedOpened);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      applyToolboxVisibility(!_toggleBtnOpened);
      writeOpened(_toggleBtnOpened);
    });
  }
  function initializeAlwaysOnListeners() {
    var _a, _b, _c, _d, _e, _f, _g;
    (_a = elements.connectButton) == null ? void 0 : _a.addEventListener("click", () => BluetoothManager.connect());
    (_b = elements.disconnectButton) == null ? void 0 : _b.addEventListener("click", () => BluetoothManager.disconnect());
    (_c = elements.clearLogBtn) == null ? void 0 : _c.addEventListener("click", () => {
      Logger.clear();
      Logger.refresh();
    });
    (_d = document.getElementById("dashboardButton")) == null ? void 0 : _d.addEventListener("click", toggleDashboard);
    (_e = document.getElementById("emergencyStopButton")) == null ? void 0 : _e.addEventListener("click", async () => {
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
    (_f = document.getElementById("homeButton")) == null ? void 0 : _f.addEventListener("click", () => navigate({}));
    (_g = document.getElementById("missionSelect")) == null ? void 0 : _g.addEventListener("change", (e) => {
      const m = parseInt(e.target.value, 10);
      const n = parseInt(document.getElementById("lessonSelect").value, 10);
      if (Number.isFinite(n) && Number.isFinite(m)) {
        navigate({ lesson: n, mission: m });
      }
    });
    window.addEventListener("beforeunload", () => {
      var _a2, _b2;
      if ((_b2 = (_a2 = state.bluetoothDevice) == null ? void 0 : _a2.gatt) == null ? void 0 : _b2.connected) {
        BluetoothManager.disconnect();
      }
    });
    window.addEventListener("hashchange", applyRoute);
  }
  function initializeMissionListeners(ws) {
    var _a, _b, _c, _d, _e;
    (_a = elements.runButton) == null ? void 0 : _a.addEventListener("click", async () => {
      if (!validateConnection()) return;
      if (state.isExecuting) {
        alert("\uC774\uBBF8 \uBA85\uB839\uC774 \uC2E4\uD589 \uC911\uC785\uB2C8\uB2E4. \uC7A0\uC2DC\uB9CC \uAE30\uB2E4\uB824\uC8FC\uC138\uC694.");
        return;
      }
      try {
        await CommandExecutor.executeWorkspace(ws);
      } catch (error) {
        console.error("\uBA85\uB839 \uC2E4\uD589 \uC624\uB958:", error);
        alert("\uBA85\uB839 \uC2E4\uD589 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4: " + error.message);
        Logger.add(`[\uC624\uB958] \uBA85\uB839 \uC2E4\uD589 \uC2E4\uD328: ${error.message}`, "error");
      }
    });
    (_b = elements.saveButton) == null ? void 0 : _b.addEventListener("click", () => {
      const xml = Blockly.Xml.workspaceToDom(ws);
      const xmlText = Blockly.utils.xml.domToText(xml);
      const fileName = prompt("\uC800\uC7A5\uD560 \uD30C\uC77C \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694 (\uD655\uC7A5\uC790 \uC81C\uC678):", "Ares_Workspace");
      if (!fileName) return;
      const blob = new Blob([xmlText], { type: "text/xml" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${fileName}.xml`;
      link.click();
    });
    (_c = elements.loadButton) == null ? void 0 : _c.addEventListener("click", () => elements.fileInput.click());
    (_d = elements.fileInput) == null ? void 0 : _d.addEventListener("change", (event) => {
      var _a2;
      const file = (_a2 = event.target.files) == null ? void 0 : _a2[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const xmlText = e.target.result;
        try {
          const xml = Blockly.utils.xml.textToDom(xmlText);
          ws.clear();
          Blockly.Xml.domToWorkspace(xml, ws);
          Logger.add(`[\uD30C\uC77C] ${file.name} \uBD88\uB7EC\uC624\uAE30 \uC644\uB8CC`, "info");
        } catch (err) {
          alert("Blockly \uC791\uC5C5 \uACF5\uAC04\uC744 \uBD88\uB7EC\uC624\uB294 \uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uC720\uD6A8\uD55C XML \uD30C\uC77C\uC778\uC9C0 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
          Logger.add(`[\uC624\uB958] ${file.name} \uD30C\uC77C \uB85C\uB4DC \uC2E4\uD328`, "error");
          console.error("Error loading workspace:", err);
        }
      };
      reader.readAsText(file);
    });
    (_e = document.getElementById("exampleSelect")) == null ? void 0 : _e.addEventListener("change", async (e) => {
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
        ws.clear();
        Blockly.Xml.domToWorkspace(xml, ws);
        const blocklyDiv = document.getElementById("blocklyDiv");
        const dashboardFrame = document.getElementById("dashboardFrame");
        if (blocklyDiv && dashboardFrame && dashboardFrame.style.display === "block") {
          dashboardFrame.style.display = "none";
          blocklyDiv.style.display = "block";
        }
        Blockly.svgResize(ws);
        ws.scrollCenter();
        const count = ws.getAllBlocks(false).length;
        Logger.add(`[\uC608\uC81C] ${name} \uB85C\uB4DC \uC644\uB8CC \u2014 \uBE14\uB85D ${count}\uAC1C`, "info");
      } catch (err) {
        alert("\uC608\uC81C \uBD88\uB7EC\uC624\uAE30\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4: " + err.message);
        Logger.add(`[\uC624\uB958] \uC608\uC81C \uBD88\uB7EC\uC624\uAE30 \uC2E4\uD328: ${err.message}`, "error");
        console.error("[\uC608\uC81C \uB85C\uB4DC \uC624\uB958]", err);
      } finally {
        e.target.value = "";
      }
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
      if (data.type === "exit_dashboard") {
        const dashboardFrame = document.getElementById("dashboardFrame");
        if (dashboardFrame && dashboardFrame.style.display === "block") {
          toggleDashboard();
        }
        return;
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
            btn.textContent = data.visible ? "\u{1F4DD} \uB85C\uADF8\uB044\uAE30" : "\u{1F4DD} \uB85C\uADF8\uCF1C\uAE30";
          }
          try {
            Blockly.svgResize(ws);
          } catch (e) {
          }
          Logger.refresh();
        }
      }
    });
    setupToolboxToggle();
  }
  function main() {
    workspace = initializeBlockly();
    initializeAlwaysOnListeners();
    initializeMissionListeners(workspace);
    buildLessonSelect();
    const logContainer = document.getElementById("logContainer");
    if (logContainer) logContainer.classList.add("compact");
    setupLogToggle();
    setupLogVisibilityButton();
    setupMissionPanelToggle();
    simController = setupSimulation({ workspace });
    BluetoothManager.updateConnectionStatus(false);
    Logger.add("[\uC2DC\uC791] ARES \uC900\uBE44 \uC644\uB8CC - BLE \uC5F0\uACB0\uC744 \uC2DC\uC791\uD558\uC138\uC694", "info");
    Logger.refresh();
    applyRoute();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
