// ============================================================
// 3D 시뮬레이션 — "시뮬레이션 열기" 버튼으로 카드 토글
//   - 주제(로딩 대상 하드웨어)를 드롭다운에서 선택하면 해당 객체가 로딩된다.
//     "알비와 함께"가 기본이며, 나머지 주제는 아직 빈 객체(준비 중)다.
//   - three.js 는 vendor/three-bundle.min.js 가 window.THREE / window.ARES3 로 노출
// ============================================================
import { CommandExecutor } from './commandexecutor.js';
import { state } from './state.js';
import { Simulation_Main } from './Simulation/Simulation_Main.js';
import {
  TOPICS,
  TOPIC_ORDER,
  DEFAULT_TOPIC,
  defaultTopicForMission
} from './Sim_Parts/topics.js';

// 시뮬레이션 모듈 초기화 — main.js 의 워크스페이스를 받아 컨트롤러 { close } 를 반환.
// 필수 DOM 또는 three.js 라이브러리가 없으면 null 반환.
export function setupSimulation({ workspace, onOpen, onClose }) {
  const btn = document.getElementById('simToggle');
  const card = document.getElementById('simCard');
  const stage = document.getElementById('simStage');
  const loadingEl = document.getElementById('simLoading');
  const ledWrap = card ? card.querySelector('.sim-led-buttons') : null;
  const trafficWrap = card ? card.querySelector('.sim-traffic-buttons') : null;
  const launchWrap = card ? card.querySelector('.sim-launch-buttons') : null;
  const launchLedWrap = card ? card.querySelector('.sim-launch-led-buttons') : null;
  const roverWrap = card ? card.querySelector('.sim-rover-buttons') : null;
  const radarBtn  = document.getElementById('simRadar');
  const rocketBtn = document.getElementById('simRocket');
  const obstacleBtn = document.getElementById('simObstacle');
  const OBSTACLE_REMOVE  = '<span class="dot"></span>장애물 제거';   // 현재 설치됨 → 누르면 제거
  const OBSTACLE_INSTALL = '<span class="dot"></span>장애물 설치';   // 현재 제거됨 → 누르면 설치
  const simHint = document.getElementById('simHint');
  const HINT_DEFAULT = '로봇: 끌어서 회전 · 휠: 확대 · LED 버튼으로 눈·가슴 켜고 끄기';
  const HINT_TRAFFIC = '1, 2, 3번 키를 눌러 램프를 켜고 끄기';
  const HINT_LAUNCH  = '레이더 가동 · 로켓 발사 버튼을 눌러 발사대를 작동시켜 보세요';
  const HINT_ROVER   = '로버 부속 배치 보기 · 1 간격 그리드 바닥 · g 키: 0.1 평면 그리드 토글 · r 키: 박스 다시 배치';
  const RADAR_LABEL_ON   = '<span class="dot"></span>레이더';
  const RADAR_LABEL_OFF  = '<span class="dot"></span>레이더';
  const ROCKET_LABEL_ON  = '<span class="dot"></span>로켓';
  const ROCKET_LABEL_OFF = '<span class="dot"></span>로켓';
  const sel = document.getElementById('simTopic');
  if (!btn || !card || !stage) return null;

  const THREE = window.THREE, A = window.ARES3;
  if (!THREE || !A || !A.GLTFLoader) {
    btn.disabled = true;
    btn.title = '3D 라이브러리(three.js)를 불러오지 못했습니다';
    return null;
  }

  // 주제 드롭다운 채우기 ("알비와 함께"가 기본)
  if (sel && !sel.options.length) {
    TOPIC_ORDER.forEach((k) => {
      const o = document.createElement('option');
      o.value = k; o.textContent = TOPICS[k].label;
      sel.appendChild(o);
    });
    sel.value = DEFAULT_TOPIC;
  }

  let sim = null, raf = 0, builtTopic = null;
  const loop = () => { sim.render(); raf = requestAnimationFrame(loop); };

  // 선택한 주제의 객체를 (재)빌드. 이전 씬은 dispose.
  const build = (topicKey) => {
    cancelAnimationFrame(raf); raf = 0;
    if (sim) { sim.dispose(); sim = null; }

    // 시뮬레이션 선택 주제에 맞춰 activeModel 설정
    if (topicKey === 'launchpad') {
      state.activeModel = 'launchpad';
    } else {
      state.activeModel = 'gun';
    }
    if (window.updateToolboxForActiveState) {
      window.updateToolboxForActiveState();
    }

    const cfg = TOPICS[topicKey] || TOPICS[DEFAULT_TOPIC];
    if (loadingEl) { loadingEl.style.display = ''; loadingEl.textContent = '불러오는 중…'; }
    card.querySelectorAll('.sim-led-btn').forEach((b) => b.classList.remove('on'));
    card.querySelectorAll('.sim-launch-led-btn').forEach((b) => b.classList.remove('on'));
    card.querySelectorAll('.sim-traffic-btn').forEach((b) => {
      b.classList.toggle('on', !!cfg.traffic && b.dataset.action === 'lamps');
    });
    if (ledWrap) {
      ledWrap.style.display = (cfg.eyes || cfg.chest) ? '' : 'none';
      ledWrap.querySelectorAll('.sim-led-btn').forEach((b) => {
        const part = b.dataset.part || 'eye';
        b.style.display = (part === 'chest' ? !!cfg.chest : !!cfg.eyes) ? '' : 'none';
      });
    }
    if (trafficWrap) trafficWrap.style.display = cfg.traffic ? '' : 'none';
    if (launchWrap) launchWrap.style.display = cfg.radar ? '' : 'none';
    if (launchLedWrap) launchLedWrap.style.display = cfg.launch ? '' : 'none';
    if (roverWrap) roverWrap.style.display = cfg.helpers ? '' : 'none';
    if (obstacleBtn) { obstacleBtn.classList.add('on'); obstacleBtn.innerHTML = OBSTACLE_REMOVE; }
    if (radarBtn)  { radarBtn.classList.remove('on');  radarBtn.innerHTML  = RADAR_LABEL_OFF;  radarBtn.setAttribute('aria-pressed', 'false'); }
    if (rocketBtn) { rocketBtn.classList.remove('on'); rocketBtn.innerHTML = ROCKET_LABEL_OFF; rocketBtn.setAttribute('aria-pressed', 'false'); }
    if (simHint) {
      simHint.textContent =
        cfg.traffic ? HINT_TRAFFIC :
        cfg.radar   ? HINT_LAUNCH  :
        cfg.parts   ? HINT_ROVER   : HINT_DEFAULT;
    }
    sim = Simulation_Main.buildSim(THREE, A, stage, loadingEl, cfg, { logLine, ensureAudio, state });
    builtTopic = topicKey;
  };

  const open = () => {
    card.hidden = false;
    if (typeof onOpen === 'function') {
      try { onOpen(); } catch {}
    }
    if (!sim && sel) sel.value = defaultTopicForMission();
    const t = (sel && sel.value) || DEFAULT_TOPIC;
    if (!sim || builtTopic !== t) build(t);
    sim.resize();
    cancelAnimationFrame(raf); loop();
    btn.textContent = '코드 확인';
    btn.setAttribute('aria-pressed', 'true');
  };

  const finalizeClose = () => {
    card.hidden = true;
    cancelAnimationFrame(raf); raf = 0;
    btn.textContent = '시뮬레이션';
    btn.setAttribute('aria-pressed', 'false');
    if (typeof onClose === 'function') {
      try { onClose(); } catch {}
    }
  };
  
  let closing = false;
  const close = () => {
    if (card.hidden || closing) return;
    if (sim && sim.hasRocket && !sim.rocketAtRest) {
      closing = true;
      sim.setRocketLaunch(false);
      if (rocketBtn) {
        rocketBtn.classList.remove('on');
        rocketBtn.innerHTML = ROCKET_LABEL_OFF;
        rocketBtn.setAttribute('aria-pressed', 'false');
      }
      const waitDescend = () => {
        if (!sim || sim.rocketAtRest) { closing = false; finalizeClose(); return; }
        requestAnimationFrame(waitDescend);
      };
      waitDescend();
      return;
    }
    finalizeClose();
  };

  if (sel) sel.addEventListener('change', () => {
    build(sel.value);
    sim.resize();
    cancelAnimationFrame(raf); loop();
  });

  btn.addEventListener('click', () => { ensureAudio(); card.hidden ? open() : close(); });

  card.querySelectorAll('.sim-led-btn').forEach((b) => {
    b.addEventListener('click', () => {
      if (!sim) return;
      const part = b.dataset.part || 'eye';
      if (part === 'chest') {
        if (!sim.hasChest) return;
        const cur = sim.chestLed.on;
        sim.setChest(!cur);
        b.classList.toggle('on', !cur);
      } else {
        if (!sim.hasEyes) return;
        const side = b.dataset.side;
        const cur = (side === 'L') ? sim.eyeL.on : sim.eyeR.on;
        sim.setEye(side, !cur);
        b.classList.toggle('on', !cur);
      }
    });
  });

  const launchLedsBtn = document.getElementById('simLaunchLeds');
  if (launchLedsBtn) {
    launchLedsBtn.addEventListener('click', () => {
      if (!sim || !sim.hasLaunchLeds) return;
      const next = !launchLedsBtn.classList.contains('on');
      for (let i = 0; i <= 5; i++) sim.setLaunchLed(i, next ? 1 : 0);
      launchLedsBtn.classList.toggle('on', next);
    });
  }

  const setTrafficBtn = (which) => {
    card.querySelectorAll('.sim-traffic-btn').forEach((b) => {
      b.classList.toggle('on', b.dataset.action === which);
    });
  };
  card.querySelectorAll('.sim-traffic-btn').forEach((b) => {
    b.addEventListener('click', () => {
      if (!sim || !sim.hasTraffic) return;
      const action = b.dataset.action;
      if (action === 'lamps')      { sim.placeLamps(); setTrafficBtn('lamps'); }
      else if (action === 'hand')  { sim.placeHands(); setTrafficBtn('hand');  }
    });
  });

  if (radarBtn) {
    radarBtn.addEventListener('click', () => {
      if (!sim || !sim.hasRadar) return;
      const next = !sim.radarOn;
      sim.setRadar(next);
      radarBtn.classList.toggle('on', next);
      radarBtn.innerHTML = next ? RADAR_LABEL_ON : RADAR_LABEL_OFF;
      radarBtn.setAttribute('aria-pressed', String(next));
    });
  }

  if (obstacleBtn) {
    obstacleBtn.addEventListener('click', () => {
      if (!sim || !sim.hasBoxes) return;
      const next = !sim.obstaclesOn;
      sim.setObstacles(next);
      obstacleBtn.classList.toggle('on', next);
      obstacleBtn.innerHTML = next ? OBSTACLE_REMOVE : OBSTACLE_INSTALL;
    });
  }

  if (rocketBtn) {
    rocketBtn.addEventListener('click', () => {
      if (!sim || !sim.hasRocket) return;
      const next = !sim.rocketLaunchOn;
      sim.setRocketLaunch(next);
      if (next) sim.playRocketLaunch();
      rocketBtn.classList.toggle('on', next);
      rocketBtn.innerHTML = next ? ROCKET_LABEL_ON : ROCKET_LABEL_OFF;
      rocketBtn.setAttribute('aria-pressed', String(next));
    });
  }

  const simLog = document.getElementById('simLog');
  const simRunBtn = document.getElementById('simRun');
  const simClearBtn = document.getElementById('simLogClear');
  const logLine = (text, cls) => {
    if (!simLog) return;
    const d = document.createElement('div');
    d.className = 'sim-log-line' + (cls ? ' ' + cls : '');
    d.textContent = text;
    simLog.appendChild(d);
    simLog.scrollTop = simLog.scrollHeight;
  };

  let audioCtx = null;
  const ensureAudio = () => {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { console.warn('AudioContext 생성 실패:', e); return null; }
    if (audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch {} }
    if (audioCtx.state !== 'running') {
      try {
        const b = audioCtx.createBuffer(1, 1, 22050);
        const s = audioCtx.createBufferSource();
        s.buffer = b; s.connect(audioCtx.destination); s.start(0);
      } catch {}
    }
    return audioCtx;
  };
  const _unlockOnce = () => ensureAudio();
  document.addEventListener('pointerdown', _unlockOnce, { once: true, passive: true });
  document.addEventListener('touchstart', _unlockOnce, { once: true, passive: true });

  let simRunning = false;
  let simAborted = false;
  const SERVO_LINGER_MS = 10000;
  const SIM_RUN_LABEL = '▶ 시뮬레이션 해보기';
  const SIM_STOP_LABEL = '⏹ 시뮬레이션 중지';

  if (simRunBtn) simRunBtn.addEventListener('click', async () => {
    ensureAudio();
    if (simRunning) {
      simAborted = true;
      state.isExecuting = false;
      if (sim) sim.cancelActiveWait();
      return;
    }
    if (!workspace) { logLine('워크스페이스가 준비되지 않았습니다', 'err'); return; }
    simRunning = true; simAborted = false;
    simRunBtn.textContent = SIM_STOP_LABEL;
    simRunBtn.classList.add('running');
    logLine('──── 시뮬레이션 시작 ────', 'sys');
    try {
      await CommandExecutor.simulateWorkspace(workspace, (cmd, waitResp) => sim.simSink(cmd, waitResp));
      if (!simAborted && sim && sim.hasServo && sim.servoActive) {
        logLine(`연속 SERVO 동작 유지 중 — ${SERVO_LINGER_MS / 1000}초 후 종료`, 'sys');
        await new Promise((resolve) => {
          const id = setTimeout(() => { if (sim) sim.cancelActiveWait(); resolve(); }, SERVO_LINGER_MS);
          const originalCancel = sim.cancelActiveWait;
          if (sim) {
            sim.cancelActiveWait = () => {
              clearTimeout(id);
              sim.cancelActiveWait = originalCancel;
              originalCancel();
              resolve();
            };
          }
        });
        if (sim && sim.hasServo) sim.stopServo();
      }
      logLine(simAborted ? '──── 비상 정지 ────' : '──── 시뮬레이션 종료 ────', 'sys');
    } catch (e) {
      logLine('오류: ' + (e && e.message ? e.message : e), 'err');
    } finally {
      simRunning = false;
      simRunBtn.textContent = SIM_RUN_LABEL;
      simRunBtn.classList.remove('running');
      if (simAborted) {
        if (sim && sim.hasServo) sim.stopServo();
        if (sim) {
          if (sim.hasEyes) { sim.setEye('R', 0); sim.setEye('L', 0); }
          if (sim.hasChest) sim.setChest(0);
          if (sim.hasTraffic) { sim.setSlot(0, 0); sim.setSlot(1, 0); sim.setSlot(2, 0); }
          if (sim.hasLaunchLeds) { for (let i = 0; i <= 5; i++) sim.setLaunchLed(i, 0); }
          if (sim.hasRoverLeds) { for (let i = 0; i <= 5; i++) sim.setRoverLed(i, 0); }
          if (sim.hasRadar) sim.setRadar(false);
        }
      }
      if (sim && sim.hasRocket && !sim.rocketAtRest) {
        sim.setRocketLaunch(false);
        if (rocketBtn) {
          rocketBtn.classList.remove('on');
          rocketBtn.innerHTML = ROCKET_LABEL_OFF;
          rocketBtn.setAttribute('aria-pressed', 'false');
        }
      }
    }
  });

  if (simClearBtn) simClearBtn.addEventListener('click', () => { if (simLog) simLog.textContent = ''; });

  addEventListener('resize', () => { if (!card.hidden && sim) sim.resize(); });

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => { if (!card.hidden && sim) sim.resize(); });
    ro.observe(stage);
  }

  addEventListener('keydown', (e) => {
    if (card.hidden || !sim) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const tag = (t && t.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    if ((e.key === 'g' || e.key === 'G') && sim.hasGrids) {
      sim.toggleGrids();
      e.preventDefault();
      return;
    }
    if ((e.key === 'r' || e.key === 'R') && sim.hasBoxes) {
      sim.respawnBoxes();
      e.preventDefault();
      return;
    }
    if (!sim.hasTraffic) return;
    let idx = -1;
    if (e.key === '1') idx = 0;
    else if (e.key === '2') idx = 1;
    else if (e.key === '3') idx = 2;
    if (idx < 0) return;
    sim.toggleSlot(idx);
    e.preventDefault();
  });

  const isMobileLike = new URLSearchParams(location.search).get('mobile') === 'true'
    || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (isMobileLike && stage) {
    stage.addEventListener('dblclick', () => {
      if (card.hidden || !sim || !sim.hasBoxes) return;
      sim.respawnBoxes();
    });
  }

  return { open, close };
}
