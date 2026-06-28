// Simulation_Launcher.js
// 발사대(launchpad) 토픽을 위한 서브시스템 래퍼 클래스입니다.
// 여러 개별 파츠 클래스(Leds, Rocket, Waves, Movement)들을 조합하여 컨테이너 구조로 구성합니다.

import { Leds } from '../Sim_Parts/leds.js';
import { Rocket } from '../Sim_Parts/rocket.js';
import { Waves } from '../Sim_Parts/waves.js';
import { Movement } from '../Sim_Parts/movement.js';
import { recolorAntenna } from '../Sim_Parts/rocket.js';
import { playRocketLaunch as basePlayRocketLaunch } from '../Sim_Parts/audio.js';

export function recolorLaunchpadAntenna(root, THREE) {
  recolorAntenna(root, THREE);
}

export function playRocketLaunch(audioCtx) {
  basePlayRocketLaunch(audioCtx);
}

export class Simulation_Launcher {
  constructor(ctx) {
    this.ctx = ctx;
    this.leds = new Leds(ctx);
    this.rocket = new Rocket(ctx);
    this.waves = new Waves(ctx);
    this.movement = new Movement(ctx);

    const cfg = ctx.cfg;
    // 발사대 전용 LED 설정을 포함하여 Leds 서브시스템을 초기화합니다.
    this.leds.init(cfg.eyes, cfg.chest, cfg.launch);

    this.radarBtn = null;
    this.rocketBtn = null;
    this.launchLedsBtn = null;

    this.handleRadarClick = null;
    this.handleRocketClick = null;
    this.handleLaunchLedsClick = null;
  }

  // 내부 하위 서브시스템의 속성들을 메인 빌더나 외부 모듈이 원활하게 읽을 수 있도록 Getter/Setter 로 노출합니다.
  get launchLeds() { return this.leds.launchLeds; }
  get antennaPivot() { return this.movement.antennaPivot; }
  set antennaPivot(v) { this.movement.antennaPivot = v; }
  
  get rocketGroup() { return this.rocket.rocketGroup; }
  set rocketGroup(v) { this.rocket.rocketGroup = v; }
  get rocketFlameSprite() { return this.rocket.rocketFlameSprite; }
  set rocketFlameSprite(v) { this.rocket.rocketFlameSprite = v; }
  get rocketFlameLight() { return this.rocket.rocketFlameLight; }
  set rocketFlameLight(v) { this.rocket.rocketFlameLight = v; }
  get rocketCentroidLocal() { return this.rocket.rocketCentroidLocal; }
  set rocketCentroidLocal(v) { this.rocket.rocketCentroidLocal = v; }
  get rocketMeshRef() { return this.rocket.rocketMeshRef; }
  set rocketMeshRef(v) { this.rocket.rocketMeshRef = v; }
  get rocketBottomLocal() { return this.rocket.rocketBottomLocal; }
  set rocketBottomLocal(v) { this.rocket.rocketBottomLocal = v; }
  
  get radarOn() { return this.movement.radarOn; }
  get radarDir() { return this.movement.radarDir; }
  get rocketLaunchOn() { return this.rocket.rocketLaunchOn; }
  get rocketAnimT() { return this.rocket.rocketAnimT; }

  // 3D 모델 로딩이 완료된 후 모델의 영역정보를 기반으로 LED 스트립과 도넛(Torus) LED를 배치하고 속성을 연결합니다.
  attachToRoot(root, box, sz) {
    const THREE = this.ctx.THREE;
    const LAUNCH = this.ctx.cfg.launch;
    if (LAUNCH) {
      // 발사대 하단 파동 효과 반지름 크기를 모델 바운딩 박스 크기에 맞춥니다.
      this.waves.launchFootprintSize = Math.max(sz.x, sz.z);
      const lx = box.min.x + sz.x * LAUNCH.stripXFrac;
      const lz = box.min.z + sz.z * LAUNCH.stripZFrac;
      const yTop = box.min.y + sz.y * LAUNCH.stripYRange[0];
      const yBot = box.min.y + sz.y * LAUNCH.stripYRange[1];
      const n = LAUNCH.stripCount;
      // 세로 기둥형 순차 LED 스트립 구체 생성 및 배치
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        const ly = yTop + (yBot - yTop) * t;
        const led = this.leds.makeLed(LAUNCH.stripRadius, [lx, ly, lz], {
          sphereBase: 0x031a0a, emissive: 0x00ff33, glowTint: 0x00ff44, lightColor: 0x00ff44,
          intensityScale: 0.12, opacityOn: 0.99, glowScale: 0.55,
          glowStops: ['rgba(20,255,80,1)', 'rgba(0,230,50,0.78)', 'rgba(0,255,40,0)'],
        }, this.leds.launchStripGlowTex);
        root.add(led.group);
        this.leds.launchLeds[i + 1] = led;
      }
      
      const rb = root.userData.rocketBottomLocal;
      const rmesh = root.userData.rocketMeshRef;
      // 로켓 바닥부에 위치할 도넛 모양 토러스 LED 생성 및 배치
      if (rb && rmesh) {
        const torusGeom = new THREE.TorusGeometry(LAUNCH.torusRadius, LAUNCH.torusTube, 16, 48);
        torusGeom.rotateX(Math.PI / 2);
        const led0 = this.leds.makeLed(LAUNCH.torusRadius, [rb.x, rb.y + LAUNCH.torusYOffset, rb.z], {
          sphereBase: 0x1f0204, emissive: 0xff0a1e, glowTint: 0xff1828, lightColor: 0xff1422,
          intensityScale: 0.45, opacityOn: 0.99, glowScale: 0.55,
          glowStops: ['rgba(255,80,70,1)', 'rgba(255,20,25,0.78)', 'rgba(255,0,0,0)'],
        }, this.leds.launchGlowTex, torusGeom);
        rmesh.add(led0.group);
        this.leds.launchLeds[0] = led0;
      }
    }

    // 로켓 발사를 위한 각종 3D 그룹 참조를 하위 Rocket 클래스에 위임합니다.
    this.rocket.rocketGroup = root.userData.rocketGroup;
    this.rocket.rocketFlameSprite = root.userData.rocketFlameSprite;
    this.rocket.rocketFlameLight = root.userData.rocketFlameLight;
    this.rocket.rocketCentroidLocal = root.userData.rocketCentroidLocal;
    this.rocket.rocketMeshRef = root.userData.rocketMeshRef;
    this.rocket.rocketBottomLocal = root.userData.rocketBottomLocal;
    this.movement.antennaPivot = root.userData.antennaPivot;
  }

  // 발사대 스트립 LED 발광 제어 메서드
  setLaunchLed(i, value) {
    this.leds.setLaunchLed(i, value);
  }

  // 안테나 레이더 회전 제어 메서드
  setRadar(on, dir) {
    this.movement.setRadar(on, dir);
  }

  // 로켓 발사 상태 제어 메서드
  setRocketLaunch(on, followCamera) {
    this.rocket.setRocketLaunch(on, followCamera);
  }

  // 발사대 파동 애니메이션 제어 메서드
  setLaunchWave(on) {
    this.waves.setLaunchWave(on);
  }

  // 매 프레임마다 호출되는 업데이트 메서드입니다. 레이더 회전 및 로켓 연기/파동을 갱신합니다.
  update(dt) {
    // 1) 레이더 안테나 회전 처리
    if (this.movement.radarOn && this.movement.antennaPivot) {
      this.movement.antennaPivot.rotation.y += 0.15 * this.movement.radarDir;
    }
    // 2) 소리 파동 효과 프레임 업데이트
    this.waves.updateWaves(dt);
    // 3) 로켓 상승/연기 시뮬레이션 업데이트
    this.rocket.updateRocket(dt);
  }

  // 모든 하위 인스턴스들의 자원을 해제합니다.
  dispose() {
    this.leds.dispose();
    this.rocket.dispose();
    this.waves.dispose();
    this.movement.dispose();
  }

  // 외부 인터페이스를 위한 노출 getter 정의
  get hasLaunchLeds() { return this.leds.launchLeds.length > 0; }
  get hasLaunchWave() { return true; }
  get hasRadar() { return !!this.movement.antennaPivot; }
  get hasRocket() { return !!this.rocket.rocketGroup; }
  get rocketAtRest() { return !this.rocket.rocketLaunchOn && this.rocket.rocketAnimT === 0; }

  // 서브시스템이 활성화될 때 호출되는 메서드입니다.
  // 발사대 전용 컨트롤 버튼 영역을 보이고, 클릭 리스너 및 힌트를 매핑합니다.
  activate() {
    const card = document.getElementById('simCard');
    const launchWrap = card ? card.querySelector('.sim-launch-buttons') : null;
    const launchLedWrap = card ? card.querySelector('.sim-launch-led-buttons') : null;
    if (launchWrap) launchWrap.style.display = '';
    if (launchLedWrap) launchLedWrap.style.display = '';

    this.radarBtn = document.getElementById('simRadar');
    this.rocketBtn = document.getElementById('simRocket');
    this.launchLedsBtn = document.getElementById('simLaunchLeds');

    // 레이더 작동 버튼 이벤트 바인딩
    if (this.radarBtn) {
      this.radarBtn.classList.remove('on');
      this.radarBtn.innerHTML = '<span class="dot"></span>레이더';
      this.radarBtn.setAttribute('aria-pressed', 'false');
      this.handleRadarClick = () => {
        const next = !this.radarOn;
        this.setRadar(next);
        this.radarBtn.classList.toggle('on', next);
        this.radarBtn.setAttribute('aria-pressed', String(next));
      };
      this.radarBtn.addEventListener('click', this.handleRadarClick);
    }

    // 로켓 발사 버튼 이벤트 바인딩
    if (this.rocketBtn) {
      this.rocketBtn.classList.remove('on');
      this.rocketBtn.innerHTML = '<span class="dot"></span>로켓';
      this.rocketBtn.setAttribute('aria-pressed', 'false');
      this.handleRocketClick = () => {
        const next = !this.rocketLaunchOn;
        this.setRocketLaunch(next);
        if (next) basePlayRocketLaunch(this.ctx.getAudioCtx());
        this.rocketBtn.classList.toggle('on', next);
        this.rocketBtn.setAttribute('aria-pressed', String(next));
      };
      this.rocketBtn.addEventListener('click', this.handleRocketClick);
    }

    // 발사대 LED 전체 켜기/끄기 버튼 이벤트 바인딩
    if (this.launchLedsBtn) {
      this.launchLedsBtn.classList.remove('on');
      this.handleLaunchLedsClick = () => {
        const next = !this.launchLedsBtn.classList.contains('on');
        for (let i = 0; i <= 5; i++) this.setLaunchLed(i, next ? 1 : 0);
        this.launchLedsBtn.classList.toggle('on', next);
      };
      this.launchLedsBtn.addEventListener('click', this.handleLaunchLedsClick);
    }

    const simHint = document.getElementById('simHint');
    if (simHint) {
      simHint.textContent = '레이더 가동 · 로켓 발사 버튼을 눌러 발사대를 작동시켜 보세요';
    }
  }

  // 서브시스템이 비활성화될 때 호출되는 메서드입니다.
  // 등록된 버튼 클릭 리스너를 해제하고 제어 영역을 숨깁니다.
  deactivate() {
    if (this.radarBtn && this.handleRadarClick) {
      this.radarBtn.removeEventListener('click', this.handleRadarClick);
    }
    if (this.rocketBtn && this.handleRocketClick) {
      this.rocketBtn.removeEventListener('click', this.handleRocketClick);
    }
    if (this.launchLedsBtn && this.handleLaunchLedsClick) {
      this.launchLedsBtn.removeEventListener('click', this.handleLaunchLedsClick);
    }

    const card = document.getElementById('simCard');
    const launchWrap = card ? card.querySelector('.sim-launch-buttons') : null;
    const launchLedWrap = card ? card.querySelector('.sim-launch-led-buttons') : null;
    if (launchWrap) launchWrap.style.display = 'none';
    if (launchLedWrap) launchLedWrap.style.display = 'none';
  }

  // 분산형 커맨드 핸들러입니다. 발사대 관련 시뮬레이터 명령을 수행합니다.
  handleCommand(cmd) {
    const ctx = this.ctx;

    // LED_ON,num,val
    if (cmd.startsWith('LED_ON,')) {
      const parts = cmd.split(',');
      const num = parseInt(parts[1], 10);
      const intensity = Math.max(0, Math.min(1, parseFloat(parts[2])));
      this.setLaunchLed(num, intensity);
      return null;
    }

    // LED_OFF
    if (cmd.startsWith('LED_OFF,')) {
      const arg = cmd.split(',')[1];
      if (arg === 'ALL') {
        for (let i = 0; i <= 5; i++) this.setLaunchLed(i, 0);
      } else {
        this.setLaunchLed(parseInt(arg, 10), 0);
      }
      return null;
    }

    // Array led command [val1 val2 ...]
    if (cmd.startsWith('[') && cmd.endsWith(']')) {
      const values = cmd.slice(1, -1).trim().split(/\s+/);
      const toI = (v) => Math.max(0, Math.min(1, parseFloat(v) || 0));
      for (let i = 0; i <= 5; i++) {
        if (values.length > i) this.setLaunchLed(i, toI(values[i]));
      }
      return null;
    }

    // BUZZER_ON -> 발사대 경보 효과음 및 바닥 충격 파동 링 발생
    if (cmd.startsWith('BUZZER_ON,')) {
      this.setLaunchWave(true);
      const parts = cmd.split(',');
      const hz = parseFloat(parts[1]) || 0;
      const sec = parseFloat(parts[2]) || 0;
      ctx.audio.playBeep(hz, sec);
      return () => { this.setLaunchWave(false); };
    }

    // DC 모터 작동 시간 한정 (레이더 작동)
    if (cmd.startsWith('DC_tFORWARD,') || cmd.startsWith('DC_tBACKWARD,')) {
      const dir = cmd.startsWith('DC_tFORWARD,') ? 1 : -1;
      this.setRadar(true, dir);
      return () => { this.setRadar(false); };
    }

    // DC 모터 연속 회전
    if (cmd === 'DC_FORWARD' || cmd.startsWith('DC_FORWARD,')) {
      this.setRadar(true, 1);
      return null;
    }
    if (cmd === 'DC_BACKWARD' || cmd.startsWith('DC_BACKWARD,')) {
      this.setRadar(true, -1);
      return null;
    }
    if (cmd === 'DC_STOP' || cmd.startsWith('DC_STOP,')) {
      this.setRadar(false);
      return null;
    }

    // 로켓 발사 (발사대의 격발 처리는 로버의 총 발사와 같은 GUN_FIRE 명령을 공유합니다)
    if (cmd === 'GUN_FIRE' || cmd.startsWith('GUN_FIRE,')) {
      this.setRocketLaunch(true, false);
      basePlayRocketLaunch(ctx.getAudioCtx());
      return null;
    }

    return undefined; // 이 서브시스템에서 처리하지 않는 명령
  }
}
