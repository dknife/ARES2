// Web/Sim_Parts/dispatch.js
// Command dispatcher (applyTopicEffect) and execution simulation sink (simSink).

export class Dispatch {
  constructor(ctx) {
    this.ctx = ctx;
    this.activeWaitCancel = null;
  }

  commandHoldSeconds(c) {
    const head = c.split(',')[0];
    const parts = c.split(',');
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

  setLedByNum(num, intensity) {
    const ctx = this.ctx;
    const cfg = ctx.cfg;
    if (cfg.eyes) {
      if (num === 1) ctx.leds.set('eye-r', intensity);
      else if (num === 2) ctx.leds.set('eye-l', intensity);
    } else if (cfg.traffic) {
      if (num >= 1 && num <= 3) ctx.leds.setIndexed('traffic', num - 1, intensity);
    } else if (cfg.launch) {
      if (num >= 0 && num <= 5) ctx.leds.setIndexed('launch', num, intensity);
    } else if (cfg.parts) {
      if (num >= 0 && num <= 5) ctx.leds.setIndexed('rover', num, intensity);
    }
  }

  setAllLedsOff() {
    const ctx = this.ctx;
    const cfg = ctx.cfg;
    if (cfg.eyes) {
      ctx.leds.set('eye-r', 0);
      ctx.leds.set('eye-l', 0);
    }
    if (cfg.chest) {
      ctx.leds.set('chest', 0);
    }
    if (cfg.traffic) {
      ctx.leds.setIndexed('traffic', 0, 0);
      ctx.leds.setIndexed('traffic', 1, 0);
      ctx.leds.setIndexed('traffic', 2, 0);
    }
    if (cfg.launch) {
      for (let i = 0; i <= 5; i++) ctx.leds.setIndexed('launch', i, 0);
    }
    if (cfg.parts) {
      for (let i = 0; i <= 5; i++) ctx.leds.setIndexed('rover', i, 0);
    }
  }

  applyTopicEffect(cmd) {
    const ctx = this.ctx;
    const cfg = ctx.cfg;

    if (cmd.startsWith('DISTANCE')) {
      if (!cfg.parts || !ctx.movement || ctx.movement.irSensorBalls.length === 0) return null;
      ctx.movement.setDistanceSensor(true);
      return () => { ctx.movement.setDistanceSensor(false); };
    }
    
    if (cmd.startsWith('LED_ON,')) {
      const parts = cmd.split(',');
      const num = parseInt(parts[1], 10);
      const intensity = Math.max(0, Math.min(1, parseFloat(parts[2])));
      this.setLedByNum(num, intensity);
      return null;
    }
    
    if (cmd.startsWith('[') && cmd.endsWith(']')) {
      const values = cmd.slice(1, -1).trim().split(/\s+/);
      const toI = (v) => Math.max(0, Math.min(1, parseFloat(v) || 0));
      for (let i = 0; i <= 5; i++) {
        if (values.length > i) this.setLedByNum(i, toI(values[i]));
      }
      return null;
    }
    
    if (cmd.startsWith('LED_OFF,')) {
      const arg = cmd.split(',')[1];
      if (arg === 'ALL') this.setAllLedsOff();
      else this.setLedByNum(parseInt(arg, 10), 0);
      return null;
    }
    
    if (cmd.startsWith('BUZZER_ON,')) {
      const cleanups = [];
      if (cfg.chest) {
        ctx.leds.set('chest', 1);
        cleanups.push(() => { ctx.leds.set('chest', 0); });
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

    // Servo movement commands
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
    
    if (cmd === 'SERVO_FORWARD'  || cmd.startsWith('SERVO_FORWARD,'))  { if (cfg.parts) ctx.movement.setServoMove(true,  1); return null; }
    if (cmd === 'SERVO_BACKWARD' || cmd.startsWith('SERVO_BACKWARD,')) { if (cfg.parts) ctx.movement.setServoMove(true, -1); return null; }
    if (cmd === 'SERVO_LEFT'     || cmd.startsWith('SERVO_LEFT,'))     { if (cfg.parts) ctx.movement.setServoTurn(true,  1); return null; }
    if (cmd === 'SERVO_RIGHT'    || cmd.startsWith('SERVO_RIGHT,'))    { if (cfg.parts) ctx.movement.setServoTurn(true, -1); return null; }
    if (cmd === 'SERVO_STOP'     || cmd.startsWith('SERVO_STOP,'))     { if (cfg.parts) ctx.movement.stopServo();           return null; }

    // DC Motor commands (radar control)
    if (cmd.startsWith('DC_tFORWARD,') || cmd.startsWith('DC_tBACKWARD,')) {
      if (!cfg.radar) return null;
      const dir = cmd.startsWith('DC_tFORWARD,') ? 1 : -1;
      ctx.movement.setRadar(true, dir);
      return () => { ctx.movement.setRadar(false); };
    }
    
    if (cmd === 'DC_FORWARD'  || cmd.startsWith('DC_FORWARD,'))  { if (cfg.radar) ctx.movement.setRadar(true,  1); return null; }
    if (cmd === 'DC_BACKWARD' || cmd.startsWith('DC_BACKWARD,')) { if (cfg.radar) ctx.movement.setRadar(true, -1); return null; }
    if (cmd === 'DC_STOP'     || cmd.startsWith('DC_STOP,'))     { if (cfg.radar) ctx.movement.setRadar(false);    return null; }

    // Gun fire / Rocket Launch
    if (cmd === 'GUN_FIRE' || cmd.startsWith('GUN_FIRE,')) {
      if (cfg.launch) {
        ctx.rocket.setRocketLaunch(true, false);
        ctx.audio.playRocketLaunch();
      }
      if (cfg.parts && ctx.gun && ctx.gun.gunMesh) {
        ctx.gun.setGunFire();
        ctx.audio.playGunFire();
      }
      // 커스텀/빈 씬: Gun 객체 유무와 관계없이 발사 명령 접수 시 폭발음(SIMULATOR.md)
      if (!cfg.launch && !cfg.parts) {
        ctx.audio.playGunFire();
      }
      return null;
    }

    // OLED Emulation
    if (cmd === 'CLEAR_DISPLAY' || cmd.startsWith('CLEAR_DISPLAY')) {
      if (cfg.parts) ctx.leds.clear();
      return null;
    }
    
    if (cmd.startsWith('CLEAR_RECT,')) {
      if (!cfg.parts) return null;
      const parts = cmd.split(',');
      const x = parseInt(parts[1], 10) || 0;
      const y = parseInt(parts[2], 10) || 0;
      const w = parseInt(parts[3], 10) || 0;
      const h = parseInt(parts[4], 10) || 0;
      ctx.leds.clearRect(x, y, w, h);
      return null;
    }
    
    if (cmd.startsWith('MSG,')) {
      if (!cfg.parts) return null;
      ctx.leds.clear();
      let rem = cmd.slice(4) || 'Hello';
      const MAX_CHARS = 16;
      const LINE_H = 8;
      for (let yp = 0; rem && yp < 64; yp += LINE_H) {
        ctx.leds.text(0, yp, rem.slice(0, MAX_CHARS));
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
      ctx.leds.text(x, y, text);
      return null;
    }
    
    if (cmd.startsWith('ICON,')) {
      if (!cfg.parts) return null;
      const parts = cmd.split(',');
      const name = (parts[1] || '').trim().toLowerCase();
      const x = parseInt(parts[2], 10) || 0;
      const y = parseInt(parts[3], 10) || 0;
      ctx.leds.icon(name, x, y);
      return null;
    }

    return null;
  }

  // 센서 컴포넌트 질의(SIMULATOR.md 3단계) — 첫 번째 유효 측정값을 쓴다.
  measureComponentDistance() {
    for (const item of this.ctx.objects?.items || []) {
      const comp = item.components?.UltraSonic;
      if (!comp?.measure) continue;
      const v = comp.measure(this.ctx, item);
      if (v != null) return v;
    }
    return null;
  }

  measureComponentMagnet() {
    for (const item of this.ctx.objects?.items || []) {
      const comp = item.components?.Magnet;
      if (!comp?.measure) continue;
      const v = comp.measure(this.ctx, item);
      if (v != null) return v;
    }
    return null;
  }

  // 명령 효과 = 레거시 토픽 효과 + 컴포넌트 라우팅(SIMULATOR.md 2장) 합성.
  // 둘 다 cleanup 을 반환할 수 있어 합쳐서 돌려준다.
  applyEffect(cmd) {
    const topicCleanup = this.applyTopicEffect(cmd);
    const componentCleanup = this.ctx.objects?.routeCommand?.(cmd) || null;
    if (topicCleanup && componentCleanup) {
      return () => { topicCleanup(); componentCleanup(); };
    }
    return topicCleanup || componentCleanup;
  }

  cancelActiveWait() {
    if (this.activeWaitCancel) this.activeWaitCancel();
  }

  async simSink(command, waitForResponse) {
    const ctx = this.ctx;
    const ackMs = waitForResponse ? 100 : 20;
    ctx.logLine(`→ ${command}`, waitForResponse ? 'tx-ack' : 'tx');
    let holdMs = 0;
    let distMeasured = null;

    const wait = (ms) => new Promise((resolve) => {
      const id = setTimeout(() => { this.activeWaitCancel = null; resolve(); }, ms);
      this.activeWaitCancel = () => { clearTimeout(id); this.activeWaitCancel = null; resolve(); };
    });

    if (command.startsWith('BATCH;')) {
      await wait(ackMs);
      const subs = command.slice('BATCH;'.length).split('|').filter((s) => s.length > 0);
      for (const sub of subs) {
        if (!ctx.state.isExecuting) break;
        const subHoldMs = Math.round(this.commandHoldSeconds(sub) * 1000);
        const cleanup = this.applyEffect(sub);
        if (subHoldMs > 0) {
          await wait(subHoldMs);
        }
        cleanup?.();
        holdMs += subHoldMs;
      }
    } else {
      holdMs = Math.round(this.commandHoldSeconds(command) * 1000);
      const cleanup = this.applyEffect(command);
      await wait(ackMs + holdMs);
      if (command.startsWith('DISTANCE')) {
        // 컴포넌트(UltraSonic) 우선, 없으면 레거시 로버 토픽 측정
        const compDist = this.measureComponentDistance();
        distMeasured = compDist != null ? compDist
          : (ctx.movement ? ctx.movement.measureDistance() : null);
      }
      cleanup?.();
    }

    const total = ackMs + holdMs;
    let reply = '1';
    if (command.startsWith('DISTANCE')) {
      reply = `DIST:${distMeasured != null ? distMeasured : 30}`;
    } else if (command.startsWith('MAGNET')) {
      const compMag = this.measureComponentMagnet();
      reply = `MAG:${compMag != null ? compMag : 0}`;
    }
    
    const holdNote = holdMs > 0 ? ` + 대기 ${holdMs}ms` : '';
    ctx.logLine(`     ↩ ${reply}  (+${total}ms, ${waitForResponse ? 'Ack' : '비Ack'}${holdNote})`, 'rx');
    return reply;
  }
}
