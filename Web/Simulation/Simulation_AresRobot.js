// Simulation_AresRobot.js
// Ares Albi 로봇(albi) 토픽을 위한 서브시스템 래퍼 클래스입니다.
// 모듈화된 Leds 클래스를 상속받아 사용합니다.

import { Leds } from '../Sim_Parts/leds.js';

export class Simulation_AresRobot extends Leds {
  constructor(ctx) {
    super(ctx);
    // 부모 Leds 클래스의 초기화 메서드를 호출하여 눈과 가슴 LED 설정을 적용합니다.
    this.init(ctx.cfg.eyes, ctx.cfg.chest, ctx.cfg.launch);
    this.ledBtns = [];
    this.handleLedClick = null;
  }

  // 3D 모델 루트 노드에 LED 그룹들을 부착하는 메서드입니다.
  attachToRoot(root) {
    if (this.eyeL) root.add(this.eyeL.group);
    if (this.eyeR) root.add(this.eyeR.group);
    if (this.chestLed) root.add(this.chestLed.group);
  }

  // 눈 LED 존재 여부를 반환하는 getter
  get hasEyes() { return !!this.eyesCfg; }
  // 가슴 LED 존재 여부를 반환하는 getter
  get hasChest() { return !!this.chestCfg; }

  // 서브시스템이 활성화될 때 호출되는 메서드입니다.
  // UI 패널을 표시하고 클릭 이벤트를 바인딩하며 힌트 텍스트를 설정합니다.
  activate() {
    const card = document.getElementById('simCard');
    const ledWrap = card ? card.querySelector('.sim-led-buttons') : null;
    if (ledWrap) {
      ledWrap.style.display = ''; // LED 제어 버튼 영역 표시
      ledWrap.querySelectorAll('.sim-led-btn').forEach((b) => {
        const part = b.dataset.part || 'eye';
        // 모델 설정에 맞는 버튼만 화면에 표시
        b.style.display = (part === 'chest' ? !!this.chestCfg : !!this.eyesCfg) ? '' : 'none';
      });
    }

    this.ledBtns = card ? card.querySelectorAll('.sim-led-btn') : [];
    // LED 버튼 클릭 핸들러 정의
    this.handleLedClick = (e) => {
      const b = e.currentTarget;
      const part = b.dataset.part || 'eye';
      if (part === 'chest') {
        if (!this.chestLed) return;
        const cur = this.chestLed.on;
        this.setChest(!cur);
        b.classList.toggle('on', !cur);
      } else {
        const side = b.dataset.side;
        const led = side === 'L' ? this.eyeL : this.eyeR;
        if (!led) return;
        const cur = led.on;
        this.setEye(side, !cur);
        b.classList.toggle('on', !cur);
      }
    };
    // 이벤트 리스너 등록
    this.ledBtns.forEach((b) => b.addEventListener('click', this.handleLedClick));

    const simHint = document.getElementById('simHint');
    if (simHint) {
      simHint.textContent = '로봇: 끌어서 회전 · 휠: 확대 · LED 버튼으로 눈·가슴 켜고 끄기';
    }
  }

  // 서브시스템이 비활성화될 때 호출되는 메서드입니다.
  // 등록된 이벤트 핸들러를 제거하고 UI 패널을 숨깁니다.
  deactivate() {
    if (this.ledBtns && this.handleLedClick) {
      this.ledBtns.forEach((b) => b.removeEventListener('click', this.handleLedClick));
    }
    const card = document.getElementById('simCard');
    const ledWrap = card ? card.querySelector('.sim-led-buttons') : null;
    if (ledWrap) {
      ledWrap.style.display = 'none';
    }
  }

  // 분산형 커맨드 핸들러입니다. 시뮬레이션 명령어 패킷을 분석하여 직접 효과를 적용합니다.
  handleCommand(cmd) {
    const ctx = this.ctx;

    // LED 켜기 명령 처리 (예: LED_ON,1,0.8)
    if (cmd.startsWith('LED_ON,')) {
      const parts = cmd.split(',');
      const num = parseInt(parts[1], 10);
      const intensity = Math.max(0, Math.min(1, parseFloat(parts[2])));
      this.setLedByNum(num, intensity);
      return null;
    }

    // LED 끄기 명령 처리 (예: LED_OFF,ALL 또는 LED_OFF,1)
    if (cmd.startsWith('LED_OFF,')) {
      const arg = cmd.split(',')[1];
      if (arg === 'ALL') {
        this.setEye('R', 0);
        this.setEye('L', 0);
        this.setChest(0);
      } else {
        this.setLedByNum(parseInt(arg, 10), 0);
      }
      return null;
    }

    // 배열형 LED 제어 명령 처리 (예: [1 0.5])
    if (cmd.startsWith('[') && cmd.endsWith(']')) {
      const values = cmd.slice(1, -1).trim().split(/\s+/);
      const toI = (v) => Math.max(0, Math.min(1, parseFloat(v) || 0));
      if (values.length > 0) this.setLedByNum(1, toI(values[0]));
      if (values.length > 1) this.setLedByNum(2, toI(values[1]));
      return null;
    }

    // 부저 켜기 명령 처리 (예: BUZZER_ON,1000,0.5)
    if (cmd.startsWith('BUZZER_ON,')) {
      this.setChest(1); // 부저 작동 시 가슴 LED를 켭니다.
      const parts = cmd.split(',');
      const hz = parseFloat(parts[1]) || 0;
      const sec = parseFloat(parts[2]) || 0;
      ctx.audio.playBeep(hz, sec);
      return () => { this.setChest(0); }; // 완료 후 정리 콜백 반환
    }

    return undefined; // 이 서브시스템에서 처리하지 않는 명령인 경우 undefined 반환
  }

  // 번호 기준 LED 매핑 설정 메서드
  setLedByNum(num, intensity) {
    if (num === 1) this.setEye('R', intensity);
    else if (num === 2) this.setEye('L', intensity);
  }
}
