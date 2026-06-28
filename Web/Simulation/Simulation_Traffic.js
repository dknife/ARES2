// Simulation_Traffic.js
// 우주 신호등(traffic) 토픽을 위한 서브시스템 래퍼 클래스입니다.
// 모듈화된 Traffic 클래스를 상속받아 사용합니다.

import { Traffic as BaseTraffic } from '../Sim_Parts/traffic.js';

export class Simulation_Traffic extends BaseTraffic {
  constructor(ctx, makeGLTFLoader) {
    super(ctx);
    this.makeGLTFLoader = makeGLTFLoader;
    this.trafficBtns = [];
    this.handleTrafficClick = null;
    this.handleKeyDown = null;
  }

  // 일반 램프 모델을 로드하고 배치하는 메서드입니다.
  placeLamps() {
    super.placeLamps(this.makeGLTFLoader);
  }

  // 가위바위보 손 모양 모델을 로드하고 배치하는 메서드입니다.
  placeHands() {
    super.placeHands(this.makeGLTFLoader);
  }

  // 3D 모델 및 슬롯을 기반으로 신호등을 설정하는 메서드입니다.
  setupTraffic(root) {
    super.setupTraffic(root, this.makeGLTFLoader, this.ctx.cfg.traffic);
  }

  // 신호등 요소 활성화 여부를 반환하는 getter
  get hasTraffic() { return true; }

  // 서브시스템이 활성화될 때 호출되는 메서드입니다.
  // 신호등 전용 제어 버튼 영역을 보이고, 클릭 이벤트 및 1,2,3 숫자 단축키 이벤트를 바인딩합니다.
  activate() {
    const card = document.getElementById('simCard');
    const trafficWrap = card ? card.querySelector('.sim-traffic-buttons') : null;
    if (trafficWrap) {
      trafficWrap.style.display = ''; // 신호등 패널 노출
      const lampsBtn = trafficWrap.querySelector('[data-action="lamps"]');
      if (lampsBtn) lampsBtn.classList.add('on');
      const handBtn = trafficWrap.querySelector('[data-action="hand"]');
      if (handBtn) handBtn.classList.remove('on');
    }

    this.trafficBtns = card ? card.querySelectorAll('.sim-traffic-btn') : [];
    // 일반램프 / 가위바위보 전환 버튼 클릭 핸들러
    this.handleTrafficClick = (e) => {
      const b = e.currentTarget;
      const action = b.dataset.action;
      this.trafficBtns.forEach((btn) => btn.classList.toggle('on', btn === b));
      if (action === 'lamps') {
        this.placeLamps();
      } else if (action === 'hand') {
        this.placeHands();
      }
    };
    this.trafficBtns.forEach((b) => b.addEventListener('click', this.handleTrafficClick));

    // 숫자 키 1, 2, 3 입력 핸들러 (직접 램프 토글 가능)
    this.handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      const tag = (t && t.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      
      let idx = -1;
      if (e.key === '1') idx = 0;
      else if (e.key === '2') idx = 1;
      else if (e.key === '3') idx = 2;
      if (idx >= 0) {
        this.toggleSlot(idx);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', this.handleKeyDown);

    const simHint = document.getElementById('simHint');
    if (simHint) {
      simHint.textContent = '1, 2, 3번 키를 눌러 램프를 켜고 끄기';
    }
  }

  // 서브시스템이 비활성화될 때 호출되는 메서드입니다.
  // 등록한 클릭 이벤트 및 키보드 단축키 이벤트 리스너를 모두 제거하고 패널을 숨깁니다.
  deactivate() {
    if (this.trafficBtns && this.handleTrafficClick) {
      this.trafficBtns.forEach((b) => b.removeEventListener('click', this.handleTrafficClick));
    }
    if (this.handleKeyDown) {
      window.removeEventListener('keydown', this.handleKeyDown);
    }
    const card = document.getElementById('simCard');
    const trafficWrap = card ? card.querySelector('.sim-traffic-buttons') : null;
    if (trafficWrap) {
      trafficWrap.style.display = 'none';
    }
  }

  // 분산형 커맨드 핸들러입니다. 신호등 명령 프로토콜을 처리합니다.
  handleCommand(cmd) {
    // LED 켜기 명령 처리 (예: LED_ON,1,1)
    if (cmd.startsWith('LED_ON,')) {
      const parts = cmd.split(',');
      const num = parseInt(parts[1], 10);
      const intensity = Math.max(0, Math.min(1, parseFloat(parts[2])));
      this.setLedByNum(num, intensity);
      return null;
    }

    // LED 끄기 명령 처리 (예: LED_OFF,ALL)
    if (cmd.startsWith('LED_OFF,')) {
      const arg = cmd.split(',')[1];
      if (arg === 'ALL') {
        this.setSlotOn(0, 0);
        this.setSlotOn(1, 0);
        this.setSlotOn(2, 0);
      } else {
        this.setLedByNum(parseInt(arg, 10), 0);
      }
      return null;
    }

    // 배열 형태의 LED 일괄 처리 명령 (예: [1 0 0])
    if (cmd.startsWith('[') && cmd.endsWith(']')) {
      const values = cmd.slice(1, -1).trim().split(/\s+/);
      const toI = (v) => Math.max(0, Math.min(1, parseFloat(v) || 0));
      for (let i = 0; i < 3; i++) {
        if (values.length > i) this.setSlotOn(i, toI(values[i]));
      }
      return null;
    }

    return undefined; // 처리되지 않은 명령은 undefined 반환
  }

  // 슬롯 인덱스 기준 LED 상태 설정 메서드
  setLedByNum(num, intensity) {
    if (num >= 1 && num <= 3) {
      this.setSlotOn(num - 1, intensity);
    }
  }
}
