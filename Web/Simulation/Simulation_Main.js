// Simulation_Main.js
// Subsystem orchestrator for 3D simulations, delegating to the modular Sim_Parts library.

import { Context } from '../Sim_Parts/context.js';
import { TOPICS, TOPIC_ORDER, DEFAULT_TOPIC, MISSION_TOPIC, defaultTopicForMission, OLED_ICONS } from '../Sim_Parts/topics.js';
import { Rocket } from '../Sim_Parts/rocket.js';
import { Audio } from '../Sim_Parts/audio.js';

import { Simulation_Rover } from './Simulation_Rover.js';
import { Simulation_Launcher } from './Simulation_Launcher.js';
import { Simulation_Traffic } from './Simulation_Traffic.js';
import { Simulation_AresRobot } from './Simulation_AresRobot.js';

// Imports for setupSimulation (init)
import { CommandExecutor } from '../commandexecutor.js';
import { state } from '../state.js';
import { serializeScene, applyScene, clearSpawnedObjects } from '../Sim_Parts/scene_store.js';
import { attachComponent, detachComponent } from '../Sim_Parts/components.js';

export class Simulation_Main {
  // Topic metadata and OLED icons constants
  static TOPICS = TOPICS;
  static TOPIC_ORDER = TOPIC_ORDER;
  static DEFAULT_TOPIC = DEFAULT_TOPIC;
  static MISSION_TOPIC = MISSION_TOPIC;
  static OLED_ICONS = OLED_ICONS;

  // Delegated static helpers
  static playRocketLaunch = Audio.playRocketLaunch;
  static playGunFire = Audio.playGunFire;
  static recolorLaunchpadAntenna = Rocket.recolorAntenna;
  static defaultTopicForMission = defaultTopicForMission;

  // Factory method to initialize Context and build the matching Simulation subclass instance
  static buildSim(THREE, A, stage, loadingEl, cfg, options = {}) {
    const ctx = new Context(THREE, A, stage, loadingEl, cfg, options);
    let sim;
    if (cfg.parts) {
      sim = new Simulation_Rover(ctx);
    } else if (cfg.traffic) {
      sim = new Simulation_Traffic(ctx);
    } else if (cfg.launch) {
      sim = new Simulation_Launcher(ctx);
    } else {
      sim = new Simulation_AresRobot(ctx);
    }

    if (typeof sim.init === 'function') {
      sim.init();
    }
    return sim;
  }

  // 3D 시뮬레이션 초기화 — main.js 의 워크스페이스를 받아 컨트롤러 { open, close } 를 반환.
  static init({ workspace, onOpen, onClose }) {
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
    const OBSTACLE_REMOVE  = '<span class="dot"></span>장애물 제거';
    const OBSTACLE_INSTALL = '<span class="dot"></span>장애물 설치';
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

    // 주제 드롭다운 채우기
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

      // 'scene:<id>'(저장된 씬)는 빈 씬을 기반으로 빌드하고, 로더가 객체를 채운다
      const cfg = topicKey.startsWith('scene:') ? TOPICS.empty
        : (TOPICS[topicKey] || TOPICS[DEFAULT_TOPIC]);
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

    // ==== 개발자 모드 (Ctrl+E) — 씬 생성·저장·로드 (SIMULATOR.md 구현 규약 2026-07-08) ====
    // 사용자는 씬 구성을 못 하고(편집 UI 숨김), 개발자 모드에서만 생성·편집·저장이 가능하다.
    let devMode = false;

    const devBar = document.createElement('div');
    devBar.className = 'sim-devbar';
    devBar.hidden = true;
    devBar.innerHTML = `
      <span class="sim-devbar-tag">DEV</span>
      <button type="button" data-dev="new">새 씬</button>
      <button type="button" data-dev="save">씬 저장</button>
      <button type="button" data-dev="load">씬 열기</button>`;
    // 씬 이름 드롭다운 패널의 오른쪽 옆에 분리된 박스로 표시(개발자 모드 전용)
    stage.appendChild(devBar);

    const devFileInput = document.createElement('input');
    devFileInput.type = 'file';
    devFileInput.accept = 'application/json,.json';
    devFileInput.hidden = true;
    card.appendChild(devFileInput);

    // '빈 씬' 토픽 옵션은 개발자 모드에서만 드롭다운에 노출한다.
    const ensureEmptyOption = () => {
      if (!sel || sel.querySelector('option[value="empty"]')) return;
      const o = document.createElement('option');
      o.value = 'empty';
      o.textContent = `${TOPICS.empty.label} (개발자)`;
      sel.appendChild(o);
    };
    const removeEmptyOption = () => {
      const o = sel?.querySelector('option[value="empty"]');
      if (o && sel.value !== 'empty') o.remove();
    };

    // build() 마다 Context/editor 가 새로 만들어지므로, 빌드 후에도 다시 적용해야 한다.
    const applyDevMode = () => {
      sim?.ctx?.editor?.setDevMode?.(devMode);
      devBar.hidden = !devMode;
      if (devMode) ensureEmptyOption(); else removeEmptyOption();
      // 콘솔 디버그 핸들 — 개발자 모드에서만 노출
      window.__aresSimDev = devMode && sim?.ctx ? {
        serialize: (opts) => serializeScene(sim.ctx, { topic: (sel && sel.value) || 'empty', ...opts }),
        apply: (json) => applyScene(sim.ctx, json),
        clear: () => clearSpawnedObjects(sim.ctx),
        // 컴포넌트 부착/해제: id 로 객체를 찾는다(생략 시 현재 선택 객체)
        attach: (type, fields, id) => attachComponent(sim.ctx, id
          ? sim.ctx.objects.items.find((o) => o.id === id)
          : sim.ctx.editor?.getSelectedSimObject(), type, fields || {}),
        detach: (type, id) => detachComponent(sim.ctx, id
          ? sim.ctx.objects.items.find((o) => o.id === id)
          : sim.ctx.editor?.getSelectedSimObject(), type),
        objects: () => sim.ctx.objects.items.map((o) => ({ id: o.id, type: o.type, comps: Object.keys(o.components || {}) })),
        state: (id) => {
          const o = sim.ctx.objects.items.find((x) => x.id === id);
          return o ? { pos: o.root.position.toArray(), quat: o.root.quaternion.toArray() } : null;
        },
        setPos: (id, x, y, z) => {
          const o = sim.ctx.objects.items.find((it) => it.id === id);
          if (o) o.root.position.set(x, y, z);
          return !!o;
        },
        sink: (cmd) => sim.simSink(cmd, false),
        tick: (dt) => sim.ctx.objects.update(dt || 0.016),   // 수동 프레임 진행(테스트·콘솔용)
      } : undefined;
    };

    window.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || (e.key || '').toLowerCase() !== 'e') return;
      if (card.hidden) return;                 // 시뮬 화면이 열려 있을 때만 동작
      e.preventDefault();
      devMode = !devMode;
      applyDevMode();
      logLine(devMode ? '── 개발자 모드 ON (Ctrl+E 로 해제) ──' : '── 개발자 모드 OFF ──', 'sys');
    });

    const rebuildTo = (topicKey) => {
      if (sel) sel.value = topicKey;
      build(topicKey);
      applyDevMode();
      sim.resize();
      cancelAnimationFrame(raf); loop();
    };

    const devSaveScene = async () => {
      if (!sim?.ctx) return;
      const json = serializeScene(sim.ctx, { name: 'ares_scene', topic: (sel && sel.value) || 'empty' });
      const text = JSON.stringify(json, null, 2);
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: 'ares_scene.json',
            types: [{ description: 'ARES 씬 파일', accept: { 'application/json': ['.json'] } }],
          });
          const w = await handle.createWritable();
          await w.write(text);
          await w.close();
          logLine(`씬 저장 완료 — ${handle.name} (객체 ${json.objects.length}개)`, 'sys');
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;   // 저장창 취소
        }
      }
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'ares_scene.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      logLine(`씬 저장(다운로드) — 객체 ${json.objects.length}개`, 'sys');
    };

    const devLoadScene = async (file) => {
      try {
        const json = JSON.parse(await file.text());
        const topic = TOPICS[json.topic] ? json.topic : 'empty';
        if (topic === 'empty') ensureEmptyOption();
        if (!sim || builtTopic !== topic) rebuildTo(topic);
        await applyScene(sim.ctx, json);
        logLine(`씬 로드 완료 — ${json.name || file.name} (객체 ${json.objects.length}개)`, 'sys');
      } catch (err) {
        logLine('씬 로드 실패: ' + (err && err.message ? err.message : err), 'err');
      }
    };

    devBar.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-dev]');
      if (!b) return;
      if (b.dataset.dev === 'new') { ensureEmptyOption(); rebuildTo('empty'); }
      else if (b.dataset.dev === 'save') devSaveScene();
      else if (b.dataset.dev === 'load') devFileInput.click();
    });
    devFileInput.addEventListener('change', () => {
      const f = devFileInput.files && devFileInput.files[0];
      devFileInput.value = '';
      if (f) devLoadScene(f);
    });

    // ==== 저장된 씬 — 사용자도 읽을 수 있다(SIMULATOR.md 1장). scenes/manifest.json ====
    let sceneManifest = [];
    if (sel) {
      fetch('scenes/manifest.json', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => {
          if (!m || !Array.isArray(m.scenes)) return;
          sceneManifest = m.scenes;
          m.scenes.forEach((s) => {
            const o = document.createElement('option');
            o.value = `scene:${s.id}`;
            o.textContent = s.label || s.id;
            sel.appendChild(o);
          });
        })
        .catch(() => {});
    }

    const loadSavedScene = async (id) => {
      const entry = sceneManifest.find((s) => s.id === id);
      if (!entry) { logLine(`씬을 찾을 수 없습니다: ${id}`, 'err'); return; }
      build(`scene:${id}`);
      applyDevMode();
      sim.resize();
      cancelAnimationFrame(raf); loop();
      try {
        const res = await fetch(entry.file, { cache: 'no-store' });
        const json = await res.json();
        await applyScene(sim.ctx, json);
        // 씬 전체가 보이도록 카메라 프레이밍
        const T = sim.ctx.THREE;
        const bb = new T.Box3();
        sim.ctx.scene.updateMatrixWorld(true);
        sim.ctx.objects.items.forEach((o) => bb.expandByObject(o.root));
        if (!bb.isEmpty()) {
          const size = bb.getSize(new T.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 1);
          const fov = sim.ctx.camera.fov * Math.PI / 180;
          sim.ctx.frame(Math.max(0.5, size.y * 0.55), (maxDim / 2) / Math.tan(fov / 2) * 1.9);
        }
        logLine(`씬 '${entry.label || id}' 로드 완료 (객체 ${json.objects.length}개)`, 'sys');
      } catch (err) {
        logLine('씬 로드 실패: ' + (err && err.message ? err.message : err), 'err');
      }
    };

    if (sel) sel.addEventListener('change', () => {
      const v = sel.value;
      if (v.startsWith('scene:')) { loadSavedScene(v.slice(6)); return; }
      build(v);
      applyDevMode();   // 새 Context 의 editor 에 개발자 모드 상태 재적용
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

    // 시뮬 실행/중지 토글 — 하단 중앙 '모의실행' 버튼(main.js)이 호출한다.
    // 실행 상태는 'ares:simrun' 이벤트로 중앙 버튼에 전달한다(주황·정지·'실험중단').
    async function toggleSimRun() {
      ensureAudio();
      if (simRunning) {
        // 실행 중 재호출 = 시뮬레이션 중지
        simAborted = true;
        state.isExecuting = false;
        if (sim) sim.cancelActiveWait();
        return;
      }
      if (!workspace) { logLine('워크스페이스가 준비되지 않았습니다', 'err'); return; }
      simRunning = true; simAborted = false;
      window.dispatchEvent(new CustomEvent('ares:simrun', { detail: { running: true } }));
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
        window.dispatchEvent(new CustomEvent('ares:simrun', { detail: { running: false } }));
        if (simAborted) {
          // 컴포넌트 씬: 연속 명령(SERVO_FORWARD 등)으로 켜진 운동·LED 를 정지/소등
          // (중단은 블록 실행만 끊으므로 컴포넌트 상태를 명시적으로 리셋해야 한다)
          sim?.ctx?.objects?.routeCommand?.('STOP_ALL');
          sim?.ctx?.objects?.routeCommand?.('LED_OFF,ALL');
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
    }

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

    return { open, close, toggleSimRun, isSimRunning: () => simRunning };
  }
}

export function setupSimulation(options) {
  return Simulation_Main.init(options);
}

export {
  TOPICS,
  TOPIC_ORDER,
  DEFAULT_TOPIC,
  MISSION_TOPIC,
  defaultTopicForMission,
  OLED_ICONS
};