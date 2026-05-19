import { BluetoothManager } from './bluetooth.js';
import { state, DEBUG } from './state.js';
import { elements } from './elements.js';
import { Logger } from './logger.js';
import { BLUETOOTH_CONFIG, STATUS_COLORS } from './constants.js';

export const CommandExecutor = {
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

    const command = this.generateCommand(block);
    if (command) {
      await this.sendCommand(command);
    }

    await this.handleLogicBlock(block);
    await this.processBlock(block.getNextBlock());
  },

  generateCommand(block) {
    switch (block.type) {
      case 'set_lamp': {
        const lamps = [0, 1, 2, 3, 4].map(i =>
          (parseFloat(this.evaluateValueBlock(block.getInputTargetBlock(`LAMP${i}`)) || '0')).toFixed(1)
        );
        return `[${lamps.join(' ')}]`;
      }
      case 'led_on': {
        const ledNumRaw = this.evaluateValueBlock(block.getInputTargetBlock('LED_NUM'));
        const ledNumInput = parseInt(ledNumRaw, 10);
        const ledNum = isNaN(ledNumInput) ? 0 : Math.max(0, Math.min(4, ledNumInput - 1));
        const brightness = this.evaluateValueBlock(block.getInputTargetBlock('BRIGHTNESS')) || '1';
        return `LED_ON,${ledNum},${brightness}`;
      }
      case 'led_off': {
        const ledNumStr = block.getFieldValue('LED_NUM') || '1';
        if (ledNumStr === 'ALL') return 'LED_OFF,ALL';
        const ledNum = Math.max(0, Math.min(4, parseInt(ledNumStr) - 1));
        return `LED_OFF,${ledNum}`;
      }
      case 'main_led_on': {
        const brightness = this.evaluateValueBlock(block.getInputTargetBlock('BRIGHTNESS')) || '1';
        return `MAIN_LED_ON,${brightness}`;
      }
      case 'main_led_off': {
        return 'MAIN_LED_OFF';
      }
      case 'send_message': {
        const str = String(this.evaluateValueBlock(block.getInputTargetBlock('Msg')) || 'Hello');
        return `MSG,${str}`;
      }
      case 'clear_display': return 'CLEAR_DISPLAY';
      case 'buzzer_on': {
        const freq = Math.trunc(parseFloat(this.evaluateValueBlock(block.getInputTargetBlock('FREQ')) || '262'));
        const duration = this.evaluateValueBlock(block.getInputTargetBlock('DURATION')) || '1';
        return `BUZZER_ON,${freq},${duration}`;
      }
      case 'gun_fire': return 'GUN_FIRE';
      
      // 서보 모터 (시간 제한) - SERVO_t방향,초
      case 'timed_forward': {
        const seconds = this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '0';
        return `SERVO_tFORWARD,${seconds}`;
      }
      case 'timed_backward': {
        const seconds = this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '0';
        return `SERVO_tBACKWARD,${seconds}`;
      }
      case 'timed_right': {
        const seconds = this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '0';
        return `SERVO_tRIGHT,${seconds}`;
      }
      case 'timed_left': {
        const seconds = this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '0';
        return `SERVO_tLEFT,${seconds}`;
      }
      
      // 서보 모터 (연속) - SERVO_방향
      case 'move_forward': return 'SERVO_FORWARD';
      case 'move_backward': return 'SERVO_BACKWARD';
      case 'turn_left': return 'SERVO_LEFT';
      case 'turn_right': return 'SERVO_RIGHT';
      case 'stop_moving': return 'SERVO_STOP';
      
      // DC 모터 (시간 제한) - DC_t방향,초
      case 'main_motor_forward_timed': {
        const seconds = this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '1';
        return `DC_tFORWARD,${seconds}`;
      }
      case 'main_motor_backward_timed': {
        const seconds = this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '1';
        return `DC_tBACKWARD,${seconds}`;
      }
      
      // DC 모터 (연속) - DC_방향
      case 'main_motor_forward': return 'DC_FORWARD';
      case 'main_motor_backward': return 'DC_BACKWARD';
      case 'main_motor_stop': return 'DC_STOP';
      case 'time_sleep': {
        const seconds = this.evaluateValueBlock(block.getInputTargetBlock('SECONDS')) || '0';
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
    
    BluetoothManager.updateStatus('명령 실행 중...', STATUS_COLORS.ORANGE);
    
    try {
      await BluetoothManager.sendData(command, true);
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
    
    await new Promise(resolve => setTimeout(resolve, 100));
  },

  async handleLogicBlock(block) {
    if (block.type === 'variables_set') {
      const varId = block.getFieldValue('VAR');
      const varName = block.workspace.getVariableById(varId)?.name || 'unknown';
      const value = this.evaluateValueBlock(block.getInputTargetBlock('VALUE'));
      state.variables[varName] = value;
      if (DEBUG) Logger.add(`${varName} = ${value}`, 'info');

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
    elements.runButton.disabled = true;

    BluetoothManager.updateStatus('프로그램 실행 중...', STATUS_COLORS.ORANGE);
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
      
      if (state.isExecuting) {
        BluetoothManager.updateStatus('✅ 프로그램 실행 완료!', STATUS_COLORS.GREEN);
        Logger.add('[실행] 완료', 'info');
      }
    } catch (error) {
      BluetoothManager.updateStatus(`❌ 프로그램 실행 실패: ${error.message}`, STATUS_COLORS.RED);
      Logger.add(`[오류] 프로그램 실행 실패: ${error.message}`, 'error');
    }

    state.isExecuting = false;
    
    const isConnected = state.bluetoothDevice?.gatt?.connected && state.characteristic;
    elements.runButton.disabled = !isConnected;
    
    setTimeout(() => {
      BluetoothManager.updateConnectionStatus(isConnected);
    }, 1500);
  }
};
