// Web/Sim_Parts/dispatch.js
// 시뮬레이션 명령어(패킷)를 매칭하여 각 세부 모듈의 메서드를 분기 호출하고 실행 지연시간을 조율하는 파일입니다.

export class Dispatch {
  constructor(ctx) {
    this.ctx = ctx;
    this.activeWaitCancel = null; // 현재 대기 중인 비동기 SLEEP의 타이머 취소 콜백 함수
  }

  // 해당 명령어가 하드웨어 장치를 동작(대기 점유)하는 시간(초 단위)을 산출하여 반환하는 메서드입니다.
  commandHoldSeconds(c) {
    const head = c.split(',')[0];
    const parts = c.split(',');
    
    // 일괄 실행 패킷인 경우, 각 내부 서브 커맨드의 점유 시간 총합을 구합니다.
    if (c.startsWith('BATCH;')) {
      return c.slice('BATCH;'.length).split('|').reduce((s, sub) => s + this.commandHoldSeconds(sub), 0);
    }
    if (head === 'SLEEP')                          return parseFloat(parts[1]) || 0;
    if (head === 'BUZZER_ON')                      return parseFloat(parts[2]) || 0;
    if (head === 'SERVO_tFORWARD'  || head === 'SERVO_tBACKWARD' ||
        head === 'SERVO_tLEFT'     || head === 'SERVO_tRIGHT')   return parseFloat(parts[1]) || 0;
    if (head === 'DC_tFORWARD'     || head === 'DC_tBACKWARD')   return parseFloat(parts[1]) || 0;
    return 0;
  }

  // 하드웨어 포트 번호에 대응하는 LED 점등 처리를 수행합니다.
  setLedByNum(num, intensity) {
    const ctx = this.ctx;
    const cfg = ctx.cfg;
    if (cfg.eyes) {
      // 알비 로봇
      if (num === 1) ctx.leds.setEye('R', intensity);
      else if (num === 2) ctx.leds.setEye('L', intensity);
    } else if (cfg.traffic) {
      // 우주 신호등
      if (num >= 1 && num <= 3) ctx.traffic.setSlotOn(num - 1, intensity);
    } else if (cfg.launch) {
      // 우주선 발사대
      if (num >= 0 && num <= 5) ctx.leds.setLaunchLed(num, intensity);
    } else if (cfg.parts) {
      // 탐사선 로버
      if (num >= 0 && num <= 5) ctx.leds.setRoverLed(num, intensity);
    }
  }

  // 모든 종류의 LED 장치를 일괄 소등 처리합니다.
  setAllLedsOff() {
    const ctx = this.ctx;
    const cfg = ctx.cfg;
    if (cfg.eyes) {
      ctx.leds.setEye('R', 0);
      ctx.leds.setEye('L', 0);
    }
    if (cfg.chest) {
      ctx.leds.setChest(0);
    }
    if (cfg.traffic) {
      ctx.traffic.setSlotOn(0, 0);
      ctx.traffic.setSlotOn(1, 0);
      ctx.traffic.setSlotOn(2, 0);
    }
    if (cfg.launch) {
      for (let i = 0; i <= 5; i++) ctx.leds.setLaunchLed(i, 0);
    }
    if (cfg.parts) {
      for (let i = 0; i <= 5; i++) ctx.leds.setRoverLed(i, 0);
    }
  }

  // 커맨드 분석을 통하여 실제 3D 오브젝트들에 시각적 효과를 부여합니다.
  applyTopicEffect(cmd) {
    const ctx = this.ctx;
    const cfg = ctx.cfg;

    // 만약 현재 활성화된 독자적인 서브시스템(Simulation_Rover 등)의 handleCommand 메서드가 있다면 우선 위임합니다.
    if (ctx.subsystem && typeof ctx.subsystem.handleCommand === 'function') {
      const cleanup = ctx.subsystem.handleCommand(cmd);
      if (cleanup !== undefined) {
        return cleanup; // 처리 결과가 유효한 경우 반환하여 공통 흐름 생략
      }
    }

    // [기본 하위 호환 처리 흐름]
    // 1) 초음파 거리 센서 측정선 가시화 설정
    if (cmd.startsWith('DISTANCE')) {
      if (!cfg.parts || !ctx.movement || ctx.movement.irSensorBalls.length === 0) return null;
      ctx.movement.setDistanceSensor(true);
      return () => { ctx.movement.setDistanceSensor(false); };
    }
    
    // 2) LED 개별 켜기
    if (cmd.startsWith('LED_ON,')) {
      const parts = cmd.split(',');
      const num = parseInt(parts[1], 10);
      const intensity = Math.max(0, Math.min(1, parseFloat(parts[2])));
      this.setLedByNum(num, intensity);
      return null;
    }
    
    // 3) LED 일괄 세팅 ([1 0 0.5])
    if (cmd.startsWith('[') && cmd.endsWith(']')) {
      const values = cmd.slice(1, -1).trim().split(/\s+/);
      const toI = (v) => Math.max(0, Math.min(1, parseFloat(v) || 0));
      for (let i = 0; i <= 5; i++) {
        if (values.length > i) this.setLedByNum(i, toI(values[i]));
      }
      return null;
    }
    
    // 4) LED 끄기
    if (cmd.startsWith('LED_OFF,')) {
      const arg = cmd.split(',')[1];
      if (arg === 'ALL') this.setAllLedsOff();
      else this.setLedByNum(parseInt(arg, 10), 0);
      return null;
    }
    
    // 5) 부저 울림 및 시각 음파 고리(Wave) 처리
    if (cmd.startsWith('BUZZER_ON,')) {
      const cleanups = [];
      if (cfg.chest) {
        ctx.leds.setChest(1);
        cleanups.push(() => { ctx.leds.setChest(0); });
      }
      if (cfg.launch) {
        ctx.waves.setLaunchWave(true);
        cleanups.push(() => { ctx.waves.setLaunchWave(false); });
      }
      if (cfg.parts) {
        ctx.waves.setRoverWave(true);
        cleanups.push(() => { ctx.waves.setRoverWave(false); });
      }
      if (cleanups.length === 0) return null;
      
      const parts = cmd.split(',');
      const hz  = parseFloat(parts[1]) || 0;
      const sec = parseFloat(parts[2]) || 0;
      ctx.audio.playBeep(hz, sec);
      return () => cleanups.forEach((fn) => fn());
    }

    // 6) 탐사선 로버 주행 서보 모터 제어 (시간 한정 주행)
    if (cmd.startsWith('SERVO_tFORWARD,') || cmd.startsWith('SERVO_tBACKWARD,')) {
      if (!cfg.parts) return null;
      const dir = cmd.startsWith('SERVO_tFORWARD,') ? 1 : -1;
      ctx.movement.setServoMove(true, dir);
      return () => { ctx.movement.setServoMove(false); };
    }
    
    if (cmd.startsWith('SERVO_tLEFT,') || cmd.startsWith('SERVO_tRIGHT,')) {
      if (!cfg.parts) return null;
      const dir = cmd.startsWith('SERVO_tLEFT,') ? 1 : -1;
      ctx.movement.setServoTurn(true, dir);
      return () => { ctx.movement.setServoTurn(false); };
    }
    
    // 7) 탐사선 로버 주행 서보 모터 제어 (연속 주행)
    if (cmd === 'SERVO_FORWARD'  || cmd.startsWith('SERVO_FORWARD,'))  { if (cfg.parts) ctx.movement.setServoMove(true,  1); return null; }
    if (cmd === 'SERVO_BACKWARD' || cmd.startsWith('SERVO_BACKWARD,')) { if (cfg.parts) ctx.movement.setServoMove(true, -1); return null; }
    if (cmd === 'SERVO_LEFT'     || cmd.startsWith('SERVO_LEFT,'))     { if (cfg.parts) ctx.movement.setServoTurn(true,  1); return null; }
    if (cmd === 'SERVO_RIGHT'    || cmd.startsWith('SERVO_RIGHT,'))    { if (cfg.parts) ctx.movement.setServoTurn(true, -1); return null; }
    if (cmd === 'SERVO_STOP'     || cmd.startsWith('SERVO_STOP,'))     { if (cfg.parts) ctx.movement.stopServo();           return null; }

    // 8) DC 모터 제어 (발사대 레이더)
    if (cmd.startsWith('DC_tFORWARD,') || cmd.startsWith('DC_tBACKWARD,')) {
      if (!cfg.radar) return null;
      const dir = cmd.startsWith('DC_tFORWARD,') ? 1 : -1;
      ctx.movement.setRadar(true, dir);
      return () => { ctx.movement.setRadar(false); };
    }
    
    if (cmd === 'DC_FORWARD'  || cmd.startsWith('DC_FORWARD,'))  { if (cfg.radar) ctx.movement.setRadar(true,  1); return null; }
    if (cmd === 'DC_BACKWARD' || cmd.startsWith('DC_BACKWARD,')) { if (cfg.radar) ctx.movement.setRadar(true, -1); return null; }
    if (cmd === 'DC_STOP'     || cmd.startsWith('DC_STOP,'))     { if (cfg.radar) ctx.movement.setRadar(false);    return null; }

    // 9) 로켓 격발 발사 / 로버 레이저 총포 사격
    if (cmd === 'GUN_FIRE' || cmd.startsWith('GUN_FIRE,')) {
      if (cfg.launch) {
        ctx.rocket.setRocketLaunch(true, false);
        ctx.audio.playRocketLaunch();
      }
      if (cfg.parts && ctx.gun && ctx.gun.gunMesh) {
        ctx.gun.setGunFire();
        ctx.audio.playGunFire();
      }
      return null;
    }

    // 10) 가상 OLED 텍스트 및 그리기 처리
    if (cmd === 'CLEAR_DISPLAY' || cmd.startsWith('CLEAR_DISPLAY')) {
      if (cfg.parts) ctx.oled.clear();
      return null;
    }
    
    if (cmd.startsWith('CLEAR_RECT,')) {
      if (!cfg.parts) return null;
      const parts = cmd.split(',');
      const x = parseInt(parts[1], 10) || 0;
      const y = parseInt(parts[2], 10) || 0;
      const w = parseInt(parts[3], 10) || 0;
      const h = parseInt(parts[4], 10) || 0;
      ctx.oled.clearRect(x, y, w, h);
      return null;
    }
    
    if (cmd.startsWith('MSG,')) {
      if (!cfg.parts) return null;
      ctx.oled.clear();
      let rem = cmd.slice(4) || 'Hello';
      const MAX_CHARS = 16;
      const LINE_H = 8;
      for (let yp = 0; rem && yp < 64; yp += LINE_H) {
        ctx.oled.text(0, yp, rem.slice(0, MAX_CHARS));
        rem = rem.slice(MAX_CHARS);
      }
      return null;
    }
    
    if (cmd.startsWith('MSG_XY,')) {
      if (!cfg.parts) return null;
      const parts = cmd.split(',');
      const x = parseInt(parts[1], 10) || 0;
      const y = parseInt(parts[2], 10) || 0;
      const text = parts.slice(3).join(',') || 'Hello';
      ctx.oled.text(x, y, text);
      return null;
    }
    
    if (cmd.startsWith('ICON,')) {
      if (!cfg.parts) return null;
      const parts = cmd.split(',');
      const name = (parts[1] || '').trim().toLowerCase();
      const x = parseInt(parts[2], 10) || 0;
      const y = parseInt(parts[3], 10) || 0;
      ctx.oled.icon(name, x, y);
      return null;
    }

    return null;
  }

  // 비상 정지 등의 상황 발생 시 지연 타이머를 중단시킵니다.
  cancelActiveWait() {
    if (this.activeWaitCancel) this.activeWaitCancel();
  }

  // 시뮬레이션 패킷 통신 싱크 수신부입니다.
  // 명령어를 분석하고 가상 기기에 연결한 뒤 결과 응답(Ack 패킷 등)을 비동기식으로 보냅니다.
  async simSink(command, waitForResponse) {
    const ctx = this.ctx;
    const ackMs = waitForResponse ? 100 : 20; // 락 방지용 최소 응답 딜레이
    ctx.logLine(`→ ${command}`, waitForResponse ? 'tx-ack' : 'tx');
    let holdMs = 0;
    let distMeasured = null;

    // 타이머 대기용 프로미스 헬퍼
    const wait = (ms) => new Promise((resolve) => {
      const id = setTimeout(() => { this.activeWaitCancel = null; resolve(); }, ms);
      this.activeWaitCancel = () => { clearTimeout(id); this.activeWaitCancel = null; resolve(); };
    });

    // 일괄 명령어 묶음 패킷인 경우 파이프(|) 기호 기준 스플릿 후 순차 딜레이 적용 실행
    if (command.startsWith('BATCH;')) {
      await wait(ackMs);
      const subs = command.slice('BATCH;'.length).split('|').filter((s) => s.length > 0);
      for (const sub of subs) {
        if (!ctx.state.isExecuting) break;
        const subHoldMs = Math.round(this.commandHoldSeconds(sub) * 1000);
        const cleanup = this.applyTopicEffect(sub);
        if (subHoldMs > 0) {
          await wait(subHoldMs);
        }
        cleanup?.();
        holdMs += subHoldMs;
      }
    } else {
      holdMs = Math.round(this.commandHoldSeconds(command) * 1000);
      const cleanup = this.applyTopicEffect(command);
      await wait(ackMs + holdMs);
      if (command.startsWith('DISTANCE') && ctx.movement) {
        distMeasured = ctx.movement.measureDistance(); // 초음파 거리 리턴 데이터 계산
      }
      cleanup?.();
    }

    const total = ackMs + holdMs;
    let reply = '1'; // 기본 성공 신호
    if (command.startsWith('DISTANCE')) {
      reply = `DIST:${distMeasured != null ? distMeasured : 30}`;
    } else if (command.startsWith('MAGNET')) {
      reply = 'MAG:0';
    }
    
    const holdNote = holdMs > 0 ? ` + 대기 ${holdMs}ms` : '';
    ctx.logLine(`     ↩ ${reply}  (+${total}ms, ${waitForResponse ? 'Ack' : '비Ack'}${holdNote})`, 'rx');
    return reply;
  }
}
