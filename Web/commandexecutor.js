import { BluetoothManager } from './bluetooth.js';
import { state, DEBUG } from './state.js';
import { elements } from './elements.js';
import { Logger } from './logger.js';
import { BLUETOOTH_CONFIG, STATUS_COLORS } from './constants.js';
import { BATCH_FORBIDDEN_TYPES } from './blocklyconfig.js';
import { romanizeKorean } from './romanize.js';

export const CommandExecutor = {
  // 응답 대기(ack)가 불필요한 명령 — Pico가 즉시 처리하고 응답을 보내지 않는다.
  // (Pico/main.py의 NO_RESPONSE_CMDS와 반드시 동기화할 것.)
  // BUZZER_ON: 펌웨어가 논블로킹으로 음을 '시작만' 하고 즉시 반환하므로 ack 불필요.
  //   음 길이만큼의 페이싱(멜로디 겹침 방지)은 handleLogicBlock에서 웹이 로컬로 처리.
  // 주의: 값 반환 명령(DISTANCE/MAGNET/PING)과 펌웨어가 여전히 blocking 처리하는
  //   SERVO_t*/DC_t*/SLEEP/BATCH/SING은 이 집합에 넣지 말 것(응답 대기 필요).
  // 마지막 그룹(STOP_ALL~CALIB_SET)은 대시보드/비상정지 경로 전용 명령 —
  // 블록 실행기는 생성하지 않지만 펌웨어 NO_RESPONSE_CMDS와의 동기화를 위해 등재.
  FIRE_AND_FORGET_HEADS: new Set([
    'LED_ON', 'LED_OFF',
    'MSG', 'MSG_XY', 'ICON', 'CLEAR_DISPLAY', 'CLEAR_RECT',
    'SERVO_FORWARD', 'SERVO_BACKWARD', 'SERVO_LEFT', 'SERVO_RIGHT', 'SERVO_STOP',
    'DC_FORWARD', 'DC_BACKWARD', 'DC_STOP',
    'GUN_FIRE',
    'BUZZER_ON',
    'STOP_ALL', 'STOP',
    'tFORWARD', 'tBACKWARD', 'tLEFT', 'tRIGHT',
    'LED_PATTERN', 'SING',
    'SYS_SET', 'CALIB_START', 'CALIB_SET',
  ]),

  _isFireAndForget(command) {
    if (command.startsWith('[')) return true;     // LED 패턴 [v0 v1 v2 v3 v4 v5]
    const head = command.split(',')[0];
    return this.FIRE_AND_FORGET_HEADS.has(head);
  },

  // 전송 경로 추상화: 시뮬레이션 중(simSink 설정)에는 실제 BLE 대신
  // sink 로 명령을 흘려보낸다. sink(command, waitForResponse) 는 회신을
  // 흉내내고 가짜 응답을 반환한다. 평소(simSink=null)에는 실제 BLE 송신.
  // 실제 BLE 는 수신 알림에서 _updateBlocklyVariable 가 DIST/MAG 를 변수에 반영하지만,
  // 시뮬레이션은 그 경로가 없으므로 sink 응답을 여기서 직접 파싱해 동일하게 반영한다.
  simSink: null,
  async _dispatch(command, waitForResponse) {
    if (this.simSink) {
      const reply = await this.simSink(command, waitForResponse);
      this._parseSensorReply(reply);
      return reply;
    }
    return BluetoothManager.sendData(command, waitForResponse);
  },
  // sink/BLE 응답 문자열에서 거리(DIST)·자기(MAG) 값을 추출해 Blockly 변수에 저장.
  // (bluetooth.js 의 _updateBlocklyVariable 와 동일 규칙 — 시뮬레이션용)
  _parseSensorReply(data) {
    if (typeof data !== 'string') return;
    const distMatch = data.match(/DIST[:\s]*([\d.]+)/i);
    if (distMatch) state.variables['_last_distance'] = distMatch[1];
    const magMatch = data.match(/MAG[:\s]*([\d]+)/i);
    if (magMatch) state.variables['_last_magnetic'] = magMatch[1];
  },

  // 시간지정 이동/대기의 초 입력 상한 (펌웨어 MAX_TIMED_SEC와 동기화).
  // 펌웨어가 blocking 처리하므로 과도한 값은 비상정지 지연·타임아웃을 유발한다.
  MAX_TIMED_SEC: 60,

  _clampSeconds(raw) {
    const sec = parseFloat(raw);
    if (!isFinite(sec) || sec < 0) return '0';
    return String(Math.min(sec, this.MAX_TIMED_SEC));
  },

  evaluateValueBlock(block) {
    if (!block) return '0';
    if (block.type === 'math_number') {
      return block.getFieldValue('NUM') || '0';
    } else if (block.type === 'text') {
      return block.getFieldValue('TEXT') || '';
    } else if (block.type === 'variables_get') {
      const varId = block.getFieldValue('VAR');
      const varName = block.workspace.getVariableById(varId)?.name || 'unknown';
      const value = state.variables[varName] || '0';
      if (DEBUG) Logger.add(`변수 ${varName} 값: ${value}`, 'info');
      return value;
    } else if (block.type === 'math_arithmetic') {
      const op = block.getFieldValue('OP');
      const a = this.evaluateValueBlock(block.getInputTargetBlock('A'));
      const b = this.evaluateValueBlock(block.getInputTargetBlock('B'));
      let result = '0';
      try {
        switch (op) {
          case 'ADD': result = (parseFloat(a) + parseFloat(b)).toString(); break;
          case 'MINUS': result = (parseFloat(a) - parseFloat(b)).toString(); break;
          case 'MULTIPLY': result = (parseFloat(a) * parseFloat(b)).toString(); break;
          case 'DIVIDE': result = (parseFloat(b) !== 0 ? (parseFloat(a) / parseFloat(b)).toString() : '0'); break;
          default: result = '0';
        }
        return result;
      } catch (e) {
        return '0';
      }
    } else if (block.type === 'logic_compare') {
      const op = block.getFieldValue('OP');
      const a = this.evaluateValueBlock(block.getInputTargetBlock('A'));
      const b = this.evaluateValueBlock(block.getInputTargetBlock('B'));
      let result = false;

      const numA = parseFloat(a);
      const numB = parseFloat(b);
      const isNum = !isNaN(numA) && !isNaN(numB) && String(a).trim() !== '' && String(b).trim() !== '';

      switch (op) {
        case 'EQ': result = isNum ? numA === numB : a === b; break;
        case 'NEQ': result = isNum ? numA !== numB : a !== b; break;
        case 'LT': result = (isNum ? numA : a) < (isNum ? numB : b); break;
        case 'LTE': result = (isNum ? numA : a) <= (isNum ? numB : b); break;
        case 'GT': result = (isNum ? numA : a) > (isNum ? numB : b); break;
        case 'GTE': result = (isNum ? numA : a) >= (isNum ? numB : b); break;
      }
      return result ? 'true' : 'false';
    } else if (block.type === 'logic_operation') {
      // 그리고/또는 — logic_compare와 동일하게 'true'/'false' 문자열 규약 사용
      const op = block.getFieldValue('OP');
      const a = this.evaluateValueBlock(block.getInputTargetBlock('A')) === 'true';
      const b = this.evaluateValueBlock(block.getInputTargetBlock('B')) === 'true';
      const result = op === 'AND' ? (a && b) : (a || b);
      return result ? 'true' : 'false';
    } else if (block.type === 'logic_negate') {
      // 아니다
      const v = this.evaluateValueBlock(block.getInputTargetBlock('BOOL'));
      return v === 'true' ? 'false' : 'true';
    } else if (block.type === 'logic_boolean') {
      return block.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false';
    } else if (block.type === 'math_random_int') {
      const from = parseInt(this.evaluateValueBlock(block.getInputTargetBlock('FROM'))) || 0;
      const to = parseInt(this.evaluateValueBlock(block.getInputTargetBlock('TO'))) || 100;
      const min = Math.min(from, to);
      const max = Math.max(from, to);
      const result = Math.floor(Math.random() * (max - min + 1)) + min;
      return result.toString();
    } else if (block.type === 'procedures_callreturn') {
      const funcName = block.getFieldValue('NAME');
      const defBlock = this._findProcedureDefinition(block.workspace, funcName, true);
      if (defBlock) {
        const argNames = defBlock.arguments_ || [];
        for (let i = 0; i < argNames.length; i++) {
          const argBlock = block.getInputTargetBlock('ARG' + i);
          if (argBlock) {
            state.variables[argNames[i]] = this.evaluateValueBlock(argBlock);
          }
        }
        const returnBlock = defBlock.getInputTargetBlock('RETURN');
        if (returnBlock) {
          return this.evaluateValueBlock(returnBlock);
        }
      }
      return '0';
    } else {
      return Blockly.Python.valueToCode(block, '', Blockly.Python.ORDER_ATOMIC) || '0';
    }
  },

  async processBlock(block) {
    if (!block) return;
    if (!state.isExecuting) return;

    // [한꺼번에 실행] 블록은 자식들을 BATCH 명령 하나로 묶어 보낸다.
    if (block.type === 'batch_block') {
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
    // 자식 블록을 평탄화해 명령 문자열 배열로 모으면서 금지 블록을 검증한다.
    const commands = [];
    let cur = block.getInputTargetBlock('DO');
    while (cur) {
      if (BATCH_FORBIDDEN_TYPES.has(cur.type)) {
        Logger.add(`[오류] '${cur.type}' 블록은 [한꺼번에 실행] 안에 넣을 수 없습니다. 바깥으로 빼주세요.`, 'error');
        state.isExecuting = false;
        return;
      }
      const cmd = this.generateCommand(cur);
      if (cmd) commands.push(cmd);
      cur = cur.getNextBlock();
    }

    if (commands.length === 0) {
      if (DEBUG) Logger.add('[묶음] 비어 있어 건너뜀', 'info');
      return;
    }

    // BATCH;cmd1|cmd2|cmd3 형태로 한 번에 송신. 응답 대기 유지 (마지막 1/0 ACK).
    const payload = `BATCH;${commands.join('|')}`;
    if (!this.simSink) BluetoothManager.updateStatus('묶음 실행 중...', STATUS_COLORS.ORANGE);
    try {
      await this._dispatch(payload, true);
      if (DEBUG) Logger.add(`[묶음 완료] ${commands.length}개 명령`, 'info');
    } catch (error) {
      Logger.add(`[오류] 묶음 실행 실패: ${error.message}`, 'error');
      if (error.message.includes('연결') || error.message.includes('BLE')) {
        state.isExecuting = false;
        throw error;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  },

  generateCommand(block) {
    switch (block.type) {
      case 'set_lamp': {
        const lamps = [0, 1, 2, 3, 4, 5].map(i =>
          (parseFloat(this.evaluateValueBlock(block.getInputTargetBlock(`LAMP${i}`)) || '0')).toFixed(1)
        );
        return `[${lamps.join(' ')}]`;
      }
      case 'led_on': {
        const ledNum = Math.max(0, Math.min(5, parseInt(this.evaluateValueBlock(block.getInputTargetBlock('LED_NUM')), 10) || 0));
        const brightness = this.evaluateValueBlock(block.getInputTargetBlock('BRIGHTNESS')) || '1';
        return `LED_ON,${ledNum},${brightness}`;
      }
      case 'led_off': {
        const ledNum = Math.max(0, Math.min(5, parseInt(this.evaluateValueBlock(block.getInputTargetBlock('LED_NUM')), 10) || 0));
        return `LED_OFF,${ledNum}`;
      }
      case 'led_off_all': return 'LED_OFF,ALL';
      case 'send_message': {
        // OLED는 ASCII 글꼴만 그리므로 한글은 로마자로 변환해 보낸다.
        const str = romanizeKorean(String(this.evaluateValueBlock(block.getInputTargetBlock('Msg')) || 'Hello'));
        return `MSG,${str}`;
      }
      case 'send_message_xy': {
        const x = parseInt(this.evaluateValueBlock(block.getInputTargetBlock('X')) || '0', 10) || 0;
        const y = parseInt(this.evaluateValueBlock(block.getInputTargetBlock('Y')) || '0', 10) || 0;
        const str = romanizeKorean(String(this.evaluateValueBlock(block.getInputTargetBlock('Msg')) || 'Hello'));
        return `MSG_XY,${x},${y},${str}`;
      }
      case 'display_icon': {
        const name = block.getFieldValue('ICON') || 'rover';
        const x = parseInt(this.evaluateValueBlock(block.getInputTargetBlock('X')) || '0', 10) || 0;
        const y = parseInt(this.evaluateValueBlock(block.getInputTargetBlock('Y')) || '0', 10) || 0;
        return `ICON,${name},${x},${y}`;
      }
      case 'clear_display': return 'CLEAR_DISPLAY';
      case 'clear_rect': {
        const x = parseInt(this.evaluateValueBlock(block.getInputTargetBlock('X')) || '0', 10) || 0;
        const y = parseInt(this.evaluateValueBlock(block.getInputTargetBlock('Y')) || '0', 10) || 0;
        const w = parseInt(this.evaluateValueBlock(block.getInputTargetBlock('W')) || '32', 10) || 32;
        const h = parseInt(this.evaluateValueBlock(block.getInputTargetBlock('H')) || '32', 10) || 32;
        return `CLEAR_RECT,${x},${y},${w},${h}`;
      }
      case 'buzzer_on': {
        const freq = Math.trunc(parseFloat(this.evaluateValueBlock(block.getInputTargetBlock('FREQ')) || '262'));
        const duration = this.evaluateValueBlock(block.getInputTargetBlock('DURATION')) || '1';
        return `BUZZER_ON,${freq},${duration}`;
      }
      case 'buzzer_note': {
        const freq = parseInt(block.getFieldValue('NOTE'), 10) || 262;
        const duration = this.evaluateValueBlock(block.getInputTargetBlock('DURATION')) || '1';
        return `BUZZER_ON,${freq},${duration}`;
      }
      case 'gun_fire': return 'GUN_FIRE';

      // 서보 모터 (시간 제한) - SERVO_t방향,초,속도
      case 'timed_forward': {
        const seconds = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '0');
        const speed = this.evaluateValueBlock(block.getInputTargetBlock('SPEED')) || '100';
        return `SERVO_tFORWARD,${seconds},${speed}`;
      }
      case 'timed_backward': {
        const seconds = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '0');
        const speed = this.evaluateValueBlock(block.getInputTargetBlock('SPEED')) || '100';
        return `SERVO_tBACKWARD,${seconds},${speed}`;
      }
      case 'timed_right': {
        const seconds = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '0');
        const speed = this.evaluateValueBlock(block.getInputTargetBlock('SPEED')) || '100';
        return `SERVO_tRIGHT,${seconds},${speed}`;
      }
      case 'timed_left': {
        const seconds = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '0');
        const speed = this.evaluateValueBlock(block.getInputTargetBlock('SPEED')) || '100';
        return `SERVO_tLEFT,${seconds},${speed}`;
      }

      // 서보 모터 (연속) - SERVO_방향,속도
      case 'move_forward': {
        const speed = this.evaluateValueBlock(block.getInputTargetBlock('SPEED')) || '100';
        return `SERVO_FORWARD,${speed}`;
      }
      case 'move_backward': {
        const speed = this.evaluateValueBlock(block.getInputTargetBlock('SPEED')) || '100';
        return `SERVO_BACKWARD,${speed}`;
      }
      case 'turn_left': {
        const speed = this.evaluateValueBlock(block.getInputTargetBlock('SPEED')) || '100';
        return `SERVO_LEFT,${speed}`;
      }
      case 'turn_right': {
        const speed = this.evaluateValueBlock(block.getInputTargetBlock('SPEED')) || '100';
        return `SERVO_RIGHT,${speed}`;
      }
      case 'stop_moving': return 'SERVO_STOP';

      // DC 모터 (시간 제한) - DC_t방향,초,속도
      case 'main_motor_forward_timed': {
        const seconds = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '1');
        const speed = this.evaluateValueBlock(block.getInputTargetBlock('SPEED')) || '100';
        return `DC_tFORWARD,${seconds},${speed}`;
      }
      case 'main_motor_backward_timed': {
        const seconds = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '1');
        const speed = this.evaluateValueBlock(block.getInputTargetBlock('SPEED')) || '100';
        return `DC_tBACKWARD,${seconds},${speed}`;
      }

      // DC 모터 (연속) - DC_방향,속도
      case 'main_motor_forward': {
        const speed = this.evaluateValueBlock(block.getInputTargetBlock('SPEED')) || '100';
        return `DC_FORWARD,${speed}`;
      }
      case 'main_motor_backward': {
        const speed = this.evaluateValueBlock(block.getInputTargetBlock('SPEED')) || '100';
        return `DC_BACKWARD,${speed}`;
      }
      case 'main_motor_stop': return 'DC_STOP';
      case 'time_sleep': {
        const seconds = this._clampSeconds(this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '0');
        return `SLEEP,${seconds}`;
      }
      case 'pico_check_device': return 'PING';
      case 'check_distance': return 'DISTANCE';
      case 'check_magnetic': return 'MAGNET';
      default: return null;
    }
  },

  async sendCommand(command) {
    if (!state.isExecuting) {
      Logger.add('[중단] 실행이 중단되었습니다', 'warning');
      return;
    }

    if (!this.simSink) BluetoothManager.updateStatus('명령 실행 중...', STATUS_COLORS.ORANGE);

    const fireAndForget = this._isFireAndForget(command);

    try {
      await this._dispatch(command, !fireAndForget);
      if (DEBUG) Logger.add(`[완료] ${command}`, 'info');
    } catch (error) {
      if (error.message.includes('시간 초과')) {
        Logger.add(`[경고] 응답 대기 초과: ${command}`, 'warning');
      } else {
        Logger.add(`[오류] ${command}: ${error.message}`, 'error');
        if (error.message.includes('연결') || error.message.includes('BLE')) {
          state.isExecuting = false;
          throw error;
        }
      }
    }

    // 송신 간격 가드.
    // - fire-and-forget: UART(9600 baud)/BLE 버퍼 오버플로우 방지 최소 마진.
    // - 응답 대기: 이미 라운드트립을 거쳤으므로 가드 단축.
    const cooldown = fireAndForget ? 40 : 20;
    await new Promise(resolve => setTimeout(resolve, cooldown));
  },

  async handleLogicBlock(block) {
    if (block.type === 'variables_set') {
      const varId = block.getFieldValue('VAR');
      const varName = block.workspace.getVariableById(varId)?.name || 'unknown';
      const value = this.evaluateValueBlock(block.getInputTargetBlock('VALUE'));
      state.variables[varName] = value;
      if (DEBUG) Logger.add(`${varName} = ${value}`, 'info');

    } else if (block.type === 'buzzer_on' || block.type === 'buzzer_note') {
      // 부저는 논블로킹: 펌웨어가 음을 '시작만' 하고 즉시 반환하므로 BLE ack를
      // 기다리지 않는다(FIRE_AND_FORGET_HEADS 포함). 대신 멜로디의 다음 음이
      // 현재 음을 덮어써 버려지지 않도록, 웹이 음 길이만큼 로컬에서 페이싱한다.
      // 50ms 단위로 끊어 대기해 실행 중단(정지) 시 음 도중에도 빠르게 멈춘다.
      // 시뮬레이션은 simSink가 holdMs로 음 길이를 재현하므로 여기서는 생략.
      if (!this.simSink) {
        const durSec = parseFloat(this.evaluateValueBlock(block.getInputTargetBlock('DURATION')) || '1');
        const ms = Math.max(0, durSec * 1000);
        for (let waited = 0; waited < ms && state.isExecuting; waited += 50) {
          await new Promise(resolve => setTimeout(resolve, Math.min(50, ms - waited)));
        }
      }

    } else if (block.type === 'assign_variable') {
      const varId = block.getFieldValue('VAR');
      const varName = block.workspace.getVariableById(varId).name;
      const value = this.evaluateValueBlock(block.getInputTargetBlock('VALUE'));
      state.variables[varName] = value;

    } else if (block.type === 'math_change') {
      const varId = block.getFieldValue('VAR');
      const varName = block.workspace.getVariableById(varId).name;
      const delta = parseFloat(this.evaluateValueBlock(block.getInputTargetBlock('DELTA')) || '0');
      state.variables[varName] = (parseFloat(state.variables[varName] || '0') + delta).toString();

    } else if (block.type === 'check_distance') {
      const varId = block.getFieldValue('VAR');
      const varName = block.workspace.getVariableById(varId)?.name || '거리값';
      await new Promise(resolve => setTimeout(resolve, 300));
      const distance = state.variables['_last_distance'] || '0';
      state.variables[varName] = distance;

    } else if (block.type === 'check_magnetic') {
      const varId = block.getFieldValue('VAR');
      const varName = block.workspace.getVariableById(varId)?.name || '자기값';
      await new Promise(resolve => setTimeout(resolve, 300));
      const magnetic = state.variables['_last_magnetic'] || '0';
      state.variables[varName] = magnetic;

    } else if (block.type === 'controls_if') {
      const condition = this.evaluateValueBlock(block.getInputTargetBlock('IF0')) === 'true';
      if (condition) {
        await this.processBlock(block.getInputTargetBlock('DO0'));
      } else if (block.getInput('ELSE')) {
        await this.processBlock(block.getInputTargetBlock('ELSE'));
      }

    } else if (block.type === 'controls_whileUntil') {
      const mode = block.getFieldValue('MODE');
      let condition = this.evaluateValueBlock(block.getInputTargetBlock('BOOL')) === 'true';
      const maxLoops = 100;
      let loopCount = 0;

      while ((mode === 'WHILE' ? condition : !condition) && loopCount < maxLoops && state.isExecuting) {
        const doBlock = block.getInputTargetBlock('DO');
        await this.processBlock(doBlock);
        condition = this.evaluateValueBlock(block.getInputTargetBlock('BOOL')) === 'true';
        loopCount++;
      }

    } else if (block.type === 'controls_repeat_ext') {
      const times = parseInt(this.evaluateValueBlock(block.getInputTargetBlock('TIMES')) || '0');
      const maxLoops = 100;
      const loopTimes = Math.min(times, maxLoops);

      for (let i = 0; i < loopTimes && state.isExecuting; i++) {
        await this.processBlock(block.getInputTargetBlock('DO'));
      }

    } else if (block.type === 'procedures_defnoreturn' || block.type === 'procedures_defreturn') {
      // 함수 정의 - 실행하지 않음

    } else if (block.type === 'procedures_callnoreturn') {
      const funcName = block.getFieldValue('NAME');
      const defBlock = this._findProcedureDefinition(block.workspace, funcName, false);
      if (defBlock) {
        await this._setupProcedureArgs(block, defBlock);
        const statementsBlock = defBlock.getInputTargetBlock('STACK');
        await this.processBlock(statementsBlock);
      } else {
        Logger.add(`[오류] 함수 찾을 수 없음: ${funcName}`, 'error');
      }

    } else if (block.type === 'procedures_callreturn') {
      const funcName = block.getFieldValue('NAME');
      const defBlock = this._findProcedureDefinition(block.workspace, funcName, true);
      if (defBlock) {
        await this._setupProcedureArgs(block, defBlock);
        const statementsBlock = defBlock.getInputTargetBlock('STACK');
        await this.processBlock(statementsBlock);
      }
    }
  },

  _findProcedureDefinition(workspace, name, hasReturn) {
    const defType = hasReturn ? 'procedures_defreturn' : 'procedures_defnoreturn';
    const allBlocks = workspace.getAllBlocks();

    for (const block of allBlocks) {
      if (block.type === defType && block.getFieldValue('NAME') === name) {
        return block;
      }
    }

    for (const block of allBlocks) {
      if ((block.type === 'procedures_defreturn' || block.type === 'procedures_defnoreturn')
          && block.getFieldValue('NAME') === name) {
        return block;
      }
    }

    return null;
  },

  async _setupProcedureArgs(callBlock, defBlock) {
    const argNames = defBlock.arguments_ || [];

    for (let i = 0; i < argNames.length; i++) {
      const argName = argNames[i];
      const argBlock = callBlock.getInputTargetBlock('ARG' + i);

      if (argBlock) {
        const value = this.evaluateValueBlock(argBlock);
        state.variables[argName] = value;
      }
    }
  },

  async executeWorkspace(workspace) {
    state.isExecuting = true;
    // runButton 라벨/색 갱신은 main.js 의 updateRunButtonUI 가 담당
    window.dispatchEvent(new CustomEvent('ares:execution', { detail: { executing: true } }));

    Logger.add('[실행] 프로그램 시작', 'info');

    try {
      const topBlocks = workspace.getTopBlocks(true);
      for (const block of topBlocks) {
        if (!state.isExecuting) {
          Logger.add('[실행] 중단됨', 'warning');
          break;
        }

        if (block.type === 'procedures_defnoreturn' || block.type === 'procedures_defreturn') {
          continue;
        }

        await this.processBlock(block);
      }

      const completed = state.isExecuting;
      if (completed) {
        Logger.add('[실행] 완료', 'info');
      }
      state.isExecuting = false;
      window.dispatchEvent(new CustomEvent('ares:execution', { detail: { executing: false } }));
      return completed;
    } catch (error) {
      Logger.add(`[오류] 프로그램 실행 실패: ${error.message}`, 'error');
      state.isExecuting = false;
      window.dispatchEvent(new CustomEvent('ares:execution', { detail: { executing: false } }));
      return false;
    }
  },

  // 시뮬레이션 실행: 실제 BLE 없이 sink(로그)로 명령을 흘려보낸다.
  // executeWorkspace 와 동일한 블록 처리 로직을 재사용하되, 전송은 _dispatch →
  // simSink 로 라우팅된다. (runButton/BLE 상태는 건드리지 않는다)
  async simulateWorkspace(workspace, sink) {
    if (state.isExecuting) return;
    this.simSink = sink;
    state.isExecuting = true;
    try {
      const topBlocks = workspace.getTopBlocks(true);
      for (const block of topBlocks) {
        if (!state.isExecuting) break;
        if (block.type === 'procedures_defnoreturn' || block.type === 'procedures_defreturn') continue;
        await this.processBlock(block);
      }
    } finally {
      state.isExecuting = false;
      this.simSink = null;
    }
  }
};
