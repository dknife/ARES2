// Simulation_Main.js
// 3D 시뮬레이션의 메인 오케스트레이터 클래스입니다.
// WebGL 컨텍스트 생성 및 애니메이션 루프를 제어하고, 각 서브시스템의 UI 라이프사이클을 관리하는 컨테이너 역할을 합니다.

import { CommandExecutor } from '../commandexecutor.js';
import { state } from '../state.js';
import { Context } from '../Sim_Parts/context.js';
import { makeGLTFLoader } from '../Sim_Parts/assets.js';
import { recolorAntenna } from '../Sim_Parts/rocket.js';
import { playRocketLaunch as basePlayRocketLaunch, playGunFire as basePlayGunFire } from '../Sim_Parts/audio.js';
import {
  TOPICS,
  TOPIC_ORDER,
  DEFAULT_TOPIC,
  MISSION_TOPIC,
  defaultTopicForMission,
  OLED_ICONS
} from '../Sim_Parts/topics.js';

import { Simulation_AresRobot } from './Simulation_AresRobot.js';
import { Simulation_Launcher } from './Simulation_Launcher.js';
import { Simulation_Traffic } from './Simulation_Traffic.js';
import { Simulation_Rover } from './Simulation_Rover.js';

export function recolorLaunchpadAntenna(root, THREE) {
  recolorAntenna(root, THREE);
}

export function playRocketLaunch(audioCtx) {
  basePlayRocketLaunch(audioCtx);
}

export function playGunFire(audioCtx) {
  basePlayGunFire(audioCtx);
}

// 개별 시뮬레이션 환경에 적합한 클래스(Rover, Traffic, Launcher, AresRobot)를 분기 생성하여 씬 컨텍스트와 바인딩합니다.
export function buildSim(THREE, A, stage, loadingEl, cfg, options = {}) {
  const ctx = new Context(THREE, A, stage, loadingEl, cfg, options);

  let subsystem;
  if (cfg.parts) {
    // 로버 서브시스템 빌드
    subsystem = new Simulation_Rover(ctx, OLED_ICONS);
    ctx.leds = subsystem.leds;
    ctx.movement = subsystem.movement;
    ctx.oled = subsystem.oled;
    ctx.gun = subsystem.gun;
    ctx.waves = subsystem.waves;
  } else if (cfg.traffic) {
    // 우주 신호등 서브시스템 빌드
    subsystem = new Simulation_Traffic(ctx, () => makeGLTFLoader(A));
    ctx.traffic = subsystem;
  } else if (cfg.radar || cfg.launch) {
    // 발사대 서브시스템 빌드
    subsystem = new Simulation_Launcher(ctx);
    ctx.leds = subsystem.leds;
    ctx.rocket = subsystem.rocket;
    ctx.waves = subsystem.waves;
    ctx.movement = subsystem.movement;
  } else {
    // 기본 알비 로봇 서브시스템 빌드
    subsystem = new Simulation_AresRobot(ctx);
    ctx.leds = subsystem;
  }

  ctx.subsystem = subsystem; // 분산형 커맨드 라우팅을 위해 컨텍스트에 기록

  // 단일 통합 모델 파일이 있는 경우 모델을 비동기 로딩하고 초기화 설정을 적용합니다.
  if (cfg.model) {
    makeGLTFLoader(A).load(cfg.model, (gltf) => {
      if (ctx.disposed) {
        gltf.scene.traverse((o) => {
          if (o.isMesh || o.isSprite) {
            o.geometry?.dispose?.();
            const m = o.material;
            (Array.isArray(m) ? m : [m]).forEach((mm) => { mm?.map?.dispose?.(); mm?.dispose?.(); });
          }
        });
        return;
      }

      const root = gltf.scene;
      let sz = new THREE.Vector3();
      let box = new THREE.Box3();
      let modelH = 0;

      root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      box.setFromObject(root);
      box.getSize(sz);
      const c = box.getCenter(new THREE.Vector3());
      root.position.x -= c.x;
      root.position.z -= c.z;
      root.position.y -= box.min.y;
      modelH = sz.y;

      // 발사대 안테나 분리 및 로켓 절단 회색/노란색 재질 채색
      if (cfg.postProcess || cfg.label === '발사대') {
        recolorAntenna(root, THREE);
      }

      // 서브시스템별 3D 배치 조립 연결 수행
      if (typeof subsystem.attachToRoot === 'function') {
        subsystem.attachToRoot(root, box, sz);
      } else if (typeof subsystem.setupTraffic === 'function') {
        subsystem.setupTraffic(root);
      }

      ctx.scene.add(root);

      const maxDim = Math.max(sz.x, sz.y, sz.z);
      const fov = ctx.camera.fov * Math.PI / 180;
      ctx.frame(modelH * 0.55, (maxDim / 2) / Math.tan(fov / 2) * 1.9);
      if (ctx.loadingEl) ctx.loadingEl.style.display = 'none';
    }, undefined, (err) => {
      console.error('시뮬레이션 모델 로드 실패:', err);
      if (ctx.loadingEl && !ctx.disposed) ctx.loadingEl.textContent = '모델을 불러오지 못했어요';
    });
  } else if (cfg.parts) {
    ctx.frame(0.6, 2.8);
  }

  // 외부 제어 모듈에 노출할 시뮬레이션 인터페이스 객체 반환
  return {
    subsystem, // 활성 서브시스템 노출
    render() {
      const nowSec = performance.now() * 0.001;
      const dt = ctx.lastRenderTime > 0 ? Math.min(0.1, nowSec - ctx.lastRenderTime) : 0.016;
      ctx.lastRenderTime = nowSec;

      ctx.controls.update();

      if (subsystem && typeof subsystem.update === 'function') {
        subsystem.update(dt);
      }

      ctx.renderer.render(ctx.scene, ctx.camera);
    },
    resize() { ctx.resize(); },
    dispose() {
      if (subsystem && typeof subsystem.dispose === 'function') {
        try { subsystem.dispose(); } catch (e) { console.warn('subsystem.dispose failed:', e); }
      }
      ctx.dispose();
    },

    // 알비 눈/가슴 LED 제어 인터페이스
    get hasEyes() { return subsystem && typeof subsystem.hasEyes !== 'undefined' ? subsystem.hasEyes : false; },
    get eyeL() { return subsystem?.eyeL; },
    get eyeR() { return subsystem?.eyeR; },
    setEye(side, val) { subsystem?.setEye?.(side, val); },
    get hasChest() { return subsystem && typeof subsystem.hasChest !== 'undefined' ? subsystem.hasChest : false; },
    get chestLed() { return subsystem?.chestLed; },
    setChest(val) { subsystem?.setChest?.(val); },

    // 발사대 제어 인터페이스
    get hasLaunchLeds() { return subsystem && typeof subsystem.hasLaunchLeds !== 'undefined' ? subsystem.hasLaunchLeds : false; },
    get launchLeds() { return subsystem?.launchLeds; },
    setLaunchLed(i, val) { subsystem?.setLaunchLed?.(i, val); },
    get hasLaunchWave() { return subsystem && typeof subsystem.hasLaunchWave !== 'undefined' ? subsystem.hasLaunchWave : false; },
    setLaunchWave(val) { subsystem?.setLaunchWave?.(val); },
    get hasRocket() { return subsystem && typeof subsystem.hasRocket !== 'undefined' ? subsystem.hasRocket : false; },
    get rocketLaunchOn() { return subsystem?.rocketLaunchOn; },
    get rocketAtRest() { return subsystem && typeof subsystem.rocketAtRest !== 'undefined' ? subsystem.rocketAtRest : true; },
    setRocketLaunch(on, follow) { subsystem?.setRocketLaunch?.(on, follow); },

    // 신호등 제어 인터페이스
    get hasTraffic() { return subsystem && typeof subsystem.hasTraffic !== 'undefined' ? subsystem.hasTraffic : false; },
    placeLamps() { subsystem?.placeLamps?.(); },
    placeHands() { subsystem?.placeHands?.(); },
    resetTraffic() { subsystem?.resetTraffic?.(); },
    toggleSlot(idx) { subsystem?.toggleSlot?.(idx); },
    setSlot(idx, val) { subsystem?.setSlot?.(idx, val); },

    // 로버 제어 인터페이스
    get hasRoverLeds() { return subsystem && typeof subsystem.hasRoverLeds !== 'undefined' ? subsystem.hasRoverLeds : false; },
    setRoverLed(num, val) { subsystem?.setRoverLed?.(num, val); },
    get hasServo() { return subsystem && typeof subsystem.hasServo !== 'undefined' ? subsystem.hasServo : false; },
    setServoMove(on, dir) { subsystem?.setServoMove?.(on, dir); },
    setServoTurn(on, dir) { subsystem?.setServoTurn?.(on, dir); },
    stopServo() { subsystem?.stopServo?.(); },
    get servoActive() { return subsystem && typeof subsystem.servoActive !== 'undefined' ? subsystem.servoActive : false; },
    get hasDistanceSensor() { return subsystem && typeof subsystem.hasDistanceSensor !== 'undefined' ? subsystem.hasDistanceSensor : false; },
    setDistanceSensor(on) { subsystem?.setDistanceSensor?.(on); },
    measureDistance() { return subsystem && typeof subsystem.measureDistance === 'function' ? subsystem.measureDistance() : 30; },
    get hasBoxes() { return subsystem && typeof subsystem.hasBoxes !== 'undefined' ? subsystem.hasBoxes : false; },
    respawnBoxes() { subsystem?.respawnBoxes?.(); },
    get obstaclesOn() { return subsystem?.obstaclesOn; },
    setObstacles(on) { subsystem?.setObstacles?.(on); },
    get hasRoverWave() { return subsystem && typeof subsystem.hasRoverWave !== 'undefined' ? subsystem.hasRoverWave : false; },
    setRoverWave(on) { subsystem?.setRoverWave?.(on); },
    get hasOled() { return subsystem && typeof subsystem.hasOled !== 'undefined' ? subsystem.hasOled : false; },
    oledClear() { subsystem?.oledClear?.(); },
    oledClearRect(x, y, w, h) { subsystem?.oledClearRect?.(x, y, w, h); },
    oledText(x, y, text) { subsystem?.oledText?.(x, y, text); },
    oledIcon(name, x, y) { subsystem?.oledIcon?.(name, x, y); },
    get hasGun() { return subsystem && typeof subsystem.hasGun !== 'undefined' ? subsystem.hasGun : false; },
    setGunFire() { subsystem?.setGunFire?.(); },

    // 레이더 / 보조 격자선 제어 인터페이스
    get hasRadar() { return subsystem && typeof subsystem.hasRadar !== 'undefined' ? subsystem.hasRadar : false; },
    get radarOn() { return subsystem?.radarOn; },
    setRadar(on, dir) { subsystem?.setRadar?.(on, dir); },
    get hasGrids() { return !!ctx.planeGrids; },
    toggleGrids() {
      if (ctx.planeGrids) {
        ctx.planeGrids.visible = !ctx.planeGrids.visible;
        return ctx.planeGrids.visible;
      }
      return false;
    },

    // 음향 효과 발송 인터페이스
    playRocketLaunch() { playRocketLaunch(ctx.getAudioCtx()); },
    playGunFire() { playGunFire(ctx.getAudioCtx()); },

    // 커맨드 싱크 싱크로나이저 및 대기 취소 API
    simSink(command, waitResp) { return ctx.dispatcher.simSink(command, waitResp); },
    cancelActiveWait() { ctx.dispatcher.cancelActiveWait(); }
  };
}

export class Simulation_Main {
  constructor({ workspace, onOpen, onClose }) {
    this.workspace = workspace;
    this.onOpen = onOpen;
    this.onClose = onClose;

    this.btn = document.getElementById('simToggle');
    this.card = document.getElementById('simCard');
    this.stage = document.getElementById('simStage');
    this.loadingEl = document.getElementById('simLoading');
    this.sel = document.getElementById('simTopic');
    
    this.sim = null;
    this.raf = 0;
    this.builtTopic = null;
    this.closing = false;
    this.simRunning = false;
    this.simAborted = false;
    this.audioCtx = null;

    this.SERVO_LINGER_MS = 10000;
    this.SIM_RUN_LABEL = '▶ 시뮬레이션 해보기';
    this.SIM_STOP_LABEL = '⏹ 시뮬레이션 중지';

    if (!this.btn || !this.card || !this.stage) return;

    this.THREE = window.THREE;
    this.A = window.ARES3;
    if (!this.THREE || !this.A || !this.A.GLTFLoader) {
      this.btn.disabled = true;
      this.btn.title = '3D 라이브러리(three.js)를 불러오지 못했습니다';
      return;
    }

    this.setupUI();
    this.bindEvents();
  }

  // 주제 선택 드롭다운 목록 초기화
  setupUI() {
    if (this.sel && !this.sel.options.length) {
      TOPIC_ORDER.forEach((k) => {
        const o = document.createElement('option');
        o.value = k; o.textContent = TOPICS[k].label;
        this.sel.appendChild(o);
      });
      this.sel.value = DEFAULT_TOPIC;
    }
  }

  // 메인 애니메이션 렌더링 프레임 루프
  loop = () => {
    if (this.sim) {
      this.sim.render();
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  // 선택한 주제에 기반하여 시뮬레이션 객체를 재생성합니다.
  build(topicKey) {
    cancelAnimationFrame(this.raf); this.raf = 0;
    
    // 이전에 로드되어 있던 서브시스템을 비활성화하고 메모리 해제를 수행합니다.
    if (this.sim) {
      try {
        if (this.sim.subsystem && typeof this.sim.subsystem.deactivate === 'function') {
          this.sim.subsystem.deactivate();
        }
      } catch (e) {
        console.warn('Failed to deactivate old subsystem:', e);
      }
      try {
        this.sim.dispose();
      } catch (e) {
        console.warn('Failed to dispose old simulation:', e);
      }
      this.sim = null;
    }
    
    const cfg = TOPICS[topicKey] || TOPICS[DEFAULT_TOPIC];
    if (this.loadingEl) {
      this.loadingEl.style.display = '';
      this.loadingEl.textContent = '불러오는 중…';
    }

    try {
      // 씬 구성 및 서브시스템 매핑
      this.sim = buildSim(this.THREE, this.A, this.stage, this.loadingEl, cfg, {
        logLine: (text, cls) => this.logLine(text, cls),
        ensureAudio: () => this.ensureAudio(),
        state
      });
      
      // 새로 로드된 서브시스템을 활성화하여 버튼 리스너 및 힌트를 등록합니다.
      if (this.sim.subsystem && typeof this.sim.subsystem.activate === 'function') {
        this.sim.subsystem.activate();
      }
    } catch (e) {
      console.error('Failed to build new simulation:', e);
      if (this.loadingEl) {
        this.loadingEl.textContent = '시뮬레이션을 불러오지 못했습니다';
      }
    }

    this.builtTopic = topicKey;
  }

  // 시뮬레이션 카드 창을 엽니다.
  open() {
    this.card.hidden = false;
    if (typeof this.onOpen === 'function') {
      try { this.onOpen(); } catch {}
    }
    if (!this.sim && this.sel) this.sel.value = defaultTopicForMission();
    const t = (this.sel && this.sel.value) || DEFAULT_TOPIC;
    if (!this.sim || this.builtTopic !== t) this.build(t);
    this.sim.resize();
    cancelAnimationFrame(this.raf); this.loop();
    this.btn.textContent = '코드 확인';
    this.btn.setAttribute('aria-pressed', 'true');
  }

  // 시뮬레이션 카드 창 닫기 완료 작업을 수행합니다.
  finalizeClose() {
    this.card.hidden = true;
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.btn.textContent = '시뮬레이션';
    this.btn.setAttribute('aria-pressed', 'false');
    if (typeof this.onClose === 'function') {
      try { this.onClose(); } catch {}
    }
  }

  // 시뮬레이션 카드 창을 닫습니다. (로켓 발사 도중에는 복귀 애니메이션 대기)
  close() {
    if (this.card.hidden || this.closing) return;
    if (this.sim && this.sim.hasRocket && !this.sim.rocketAtRest) {
      this.closing = true;
      this.sim.setRocketLaunch(false);
      
      const rocketBtn = document.getElementById('simRocket');
      if (rocketBtn) {
        rocketBtn.classList.remove('on');
        rocketBtn.innerHTML = '<span class="dot"></span>로켓';
        rocketBtn.setAttribute('aria-pressed', 'false');
      }
      
      const waitDescend = () => {
        if (!this.sim || this.sim.rocketAtRest) {
          this.closing = false;
          this.finalizeClose();
          return;
        }
        requestAnimationFrame(waitDescend);
      };
      waitDescend();
      return;
    }
    this.finalizeClose();
  }

  // 오디오 컨텍스트가 유효한지 검증하고 지연 활성화합니다.
  ensureAudio() {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { console.warn('AudioContext 생성 실패:', e); return null; }
    if (this.audioCtx.state === 'suspended') { try { this.audioCtx.resume(); } catch {} }
    if (this.audioCtx.state !== 'running') {
      try {
        const b = this.audioCtx.createBuffer(1, 1, 22050);
        const s = this.audioCtx.createBufferSource();
        s.buffer = b; s.connect(this.audioCtx.destination); s.start(0);
      } catch {}
    }
    return this.audioCtx;
  }

  // 로그 터미널 영역에 메인 스트림 메시지를 기록합니다.
  logLine(text, cls) {
    const simLog = document.getElementById('simLog');
    if (!simLog) return;
    const d = document.createElement('div');
    d.className = 'sim-log-line' + (cls ? ' ' + cls : '');
    d.textContent = text;
    simLog.appendChild(d);
    simLog.scrollTop = simLog.scrollHeight;
  }

  // 공통 UI 요소들의 이벤트를 연결합니다. (주행 테스트 작동, 로그 전체 클리어 등)
  bindEvents() {
    if (this.sel) this.sel.addEventListener('change', () => {
      this.build(this.sel.value);
      this.sim.resize();
      cancelAnimationFrame(this.raf); this.loop();
    });

    this.btn.addEventListener('click', () => { this.ensureAudio(); this.card.hidden ? this.open() : this.close(); });

    const simRunBtn = document.getElementById('simRun');
    const simClearBtn = document.getElementById('simLogClear');

    // 시뮬레이션 실행기 작동 버튼 바인딩
    if (simRunBtn) simRunBtn.addEventListener('click', async () => {
      this.ensureAudio();
      if (this.simRunning) {
        this.simAborted = true;
        state.isExecuting = false;
        if (this.sim) this.sim.cancelActiveWait();
        return;
      }
      if (!this.workspace) { this.logLine('워크스페이스가 준비되지 않았습니다', 'err'); return; }
      this.simRunning = true; this.simAborted = false;
      simRunBtn.textContent = this.SIM_STOP_LABEL;
      simRunBtn.classList.add('running');
      this.logLine('──── 시뮬레이션 시작 ────', 'sys');
      try {
        await CommandExecutor.simulateWorkspace(this.workspace, (cmd, waitResp) => this.sim.simSink(cmd, waitResp));
        if (!this.simAborted && this.sim && this.sim.hasServo && this.sim.servoActive) {
          this.logLine(`연속 SERVO 동작 유지 중 — ${this.SERVO_LINGER_MS / 1000}초 후 종료`, 'sys');
          await new Promise((resolve) => {
            const id = setTimeout(() => { if (this.sim) this.sim.cancelActiveWait(); resolve(); }, this.SERVO_LINGER_MS);
            const originalCancel = this.sim.cancelActiveWait;
            if (this.sim) {
              this.sim.cancelActiveWait = () => {
                clearTimeout(id);
                this.sim.cancelActiveWait = originalCancel;
                originalCancel();
                resolve();
              };
            }
          });
          if (this.sim && this.sim.hasServo) this.sim.stopServo();
        }
        this.logLine(this.simAborted ? '──── 비상 정지 ────' : '──── 시뮬레이션 종료 ────', 'sys');
      } catch (e) {
        this.logLine('오류: ' + (e && e.message ? e.message : e), 'err');
      } finally {
        this.simRunning = false;
        simRunBtn.textContent = this.SIM_RUN_LABEL;
        simRunBtn.classList.remove('running');
        if (this.simAborted) {
          if (this.sim && this.sim.hasServo) this.sim.stopServo();
          if (this.sim) {
            if (this.sim.hasEyes) { this.sim.setEye('R', 0); this.sim.setEye('L', 0); }
            if (this.sim.hasChest) this.sim.setChest(0);
            if (this.sim.hasTraffic) { this.sim.setSlot(0, 0); this.sim.setSlot(1, 0); this.sim.setSlot(2, 0); }
            if (this.sim.hasLaunchLeds) { for (let i = 0; i <= 5; i++) this.sim.setLaunchLed(i, 0); }
            if (this.sim.hasRoverLeds) { for (let i = 0; i <= 5; i++) this.sim.setRoverLed(i, 0); }
            if (this.sim.hasRadar) this.sim.setRadar(false);
          }
        }
        if (this.sim && this.sim.hasRocket && !this.sim.rocketAtRest) {
          this.sim.setRocketLaunch(false);
          const rocketBtn = document.getElementById('simRocket');
          if (rocketBtn) {
            rocketBtn.classList.remove('on');
            rocketBtn.innerHTML = '<span class="dot"></span>로켓';
            rocketBtn.setAttribute('aria-pressed', 'false');
          }
        }
      }
    });

    if (simClearBtn) simClearBtn.addEventListener('click', () => {
      const simLog = document.getElementById('simLog');
      if (simLog) simLog.textContent = '';
    });

    // 화면 창 조절에 맞추어 3D 뷰포트 갱신
    addEventListener('resize', () => { if (!this.card.hidden && this.sim) this.sim.resize(); });

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => { if (!this.card.hidden && this.sim) this.sim.resize(); });
      ro.observe(this.stage);
    }

    const _unlockOnce = () => this.ensureAudio();
    document.addEventListener('pointerdown', _unlockOnce, { once: true, passive: true });
    document.addEventListener('touchstart', _unlockOnce, { once: true, passive: true });
  }
}

export function setupSimulation({ workspace, onOpen, onClose }) {
  const controller = new Simulation_Main({ workspace, onOpen, onClose });
  return {
    open: () => controller.open(),
    close: () => controller.close()
  };
}

export {
  TOPICS,
  TOPIC_ORDER,
  DEFAULT_TOPIC,
  MISSION_TOPIC,
  defaultTopicForMission,
  OLED_ICONS
};