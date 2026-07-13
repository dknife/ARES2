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
    let currentBaseTopic = 'empty';   // 현재 씬의 기반 주제(임시 작업 씬 저장에 기록)
    const loop = () => { sim.render(); raf = requestAnimationFrame(loop); };

    // 선택한 주제의 객체를 (재)빌드. 이전 씬은 dispose.
    // baseCfg — 저장된 씬('scene:<id>')이 기반 주제 위에 객체를 얹을 때 그 주제 cfg 를 넘긴다.
    const build = (topicKey, baseCfg) => {
      cancelAnimationFrame(raf); raf = 0;
      saveWorkScene();   // 개발 중 씬을 임시 백업 — 주제 전환으로 사라지지 않게
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

      // 'scene:<id>'(저장된 씬)는 씬의 기반 주제(topic 필드) 위에 빌드하고, 로더가 객체를 채운다
      const cfg = baseCfg
        || (topicKey.startsWith('scene:') ? TOPICS.empty : (TOPICS[topicKey] || TOPICS[DEFAULT_TOPIC]));
      currentBaseTopic = TOPICS[topicKey] ? topicKey
        : (Object.keys(TOPICS).find((k) => TOPICS[k] === cfg) || 'empty');
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
      // 기본 주제가 서비스에서 제거(hiddenTopics)된 경우: 아직 씬이 없을 때만 첫 주제로 폴백.
      // 개발자 '빈 씬' 작업 중(선택 없음 상태)에는 폴백하지 않아 작업 씬을 보존한다.
      if (sel && !sel.value && sel.options.length && !sim) sel.selectedIndex = 0;
      const t = (sel && sel.value) || builtTopic || DEFAULT_TOPIC;
      if (!sim || builtTopic !== t) {
        if (t.startsWith('scene:')) {
          build('empty');                  // 먼저 빈 씬을 띄우고, 씬 로드가 재빌드한다
          loadSavedScene(t.slice(6));
        } else build(t);
      }
      sim.resize();
      cancelAnimationFrame(raf); loop();
      btn.textContent = '코드 확인';
      btn.setAttribute('aria-pressed', 'true');
    };

    const finalizeClose = () => {
      saveWorkScene();   // 다른 모드로 나가는 동안 새로고침돼도 작업 씬이 남게 백업
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
      // 진행 중이던 모의실행은 다른 모드로 전환할 때 비상정지시킨다.
      // simAborted 로 실행 루프를 끊으면 toggleSimRun 의 finally 가 STOP_ALL·LED OFF·
      // 서보/로켓 원복 등 하드웨어-시뮬 상태 정리를 수행한다.
      if (simRunning) {
        simAborted = true;
        state.isExecuting = false;
        if (sim) sim.cancelActiveWait();
        logLine('──── 비상 정지 (모드 전환) ────', 'sys');
      }
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
      <select data-dev-menu title="씬 도구 메뉴">
        <option value="" selected>씬 메뉴 ▾</option>
        <option value="new">새 씬</option>
        <option value="save">씬 저장</option>
        <option value="load">씬 열기</option>
        <option value="register">서비스 등록</option>
        <option value="unregister">서비스 제거</option>
      </select>`;
    // 씬 이름 드롭다운 패널의 오른쪽 옆에 분리된 박스로 표시(개발자 모드 전용)
    stage.appendChild(devBar);

    const devFileInput = document.createElement('input');
    devFileInput.type = 'file';
    devFileInput.accept = 'application/json,.json';
    devFileInput.hidden = true;
    card.appendChild(devFileInput);

    // build() 마다 Context/editor 가 새로 만들어지므로, 빌드 후에도 다시 적용해야 한다.
    const applyDevMode = () => {
      sim?.ctx?.editor?.setDevMode?.(devMode);
      devBar.hidden = !devMode;
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
          if (!o) return null;
          const T = sim.ctx.THREE;
          o.root.updateWorldMatrix(true, false);
          const wp = o.root.getWorldPosition(new T.Vector3());
          const ws = o.root.getWorldScale(new T.Vector3());
          return {
            pos: o.root.position.toArray(), quat: o.root.quaternion.toArray(),
            scale: o.root.scale.toArray(), worldPos: wp.toArray(), worldScale: ws.toArray(),
          };
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
      if (devMode) saveWorkScene();            // OFF 전환 직전 작업 씬 백업
      devMode = !devMode;
      applyDevMode();
      logLine(devMode ? '── 개발자 모드 ON (Ctrl+E 로 해제) ──' : '── 개발자 모드 OFF ──', 'sys');
      // ON 진입 시, 현재 씬에 작업물이 없고 임시 작업 씬이 있으면 이어서 복원 제안
      if (devMode && !(sim?.ctx?.objects?.items || []).some((o) => o.spawned)) {
        maybeOfferRestore();
      }
    });

    const rebuildTo = (topicKey) => {
      if (sel) {
        sel.value = topicKey;
        // 드롭다운에 없는 주제(빈 씬 등 개발자 전용)면 '선택 없음'으로 표시
        if (sel.value !== topicKey) sel.selectedIndex = -1;
      }
      build(topicKey);
      applyDevMode();
      sim.resize();
      cancelAnimationFrame(raf); loop();
    };

    // ==== 개발 중 씬 임시 보존 (2026-07-09) ====
    // 개발자 모드에서 작업하던 씬이 모드 전환·주제 변경·새로고침으로 사라지지 않도록
    // localStorage 에 임시 저장한다. 씬 저장/서비스 등록(작업 완료) 때 지운다.
    const WORK_KEY = 'ares-sim-workscene';
    const saveWorkScene = () => {
      if (!devMode || !sim?.ctx) return;
      try {
        const json = serializeScene(sim.ctx, { name: '작업 씬(임시)', topic: currentBaseTopic });
        if (json.objects.length > 0) localStorage.setItem(WORK_KEY, JSON.stringify(json));
      } catch {}
    };
    const loadWorkScene = () => {
      try { return JSON.parse(localStorage.getItem(WORK_KEY) || 'null'); } catch { return null; }
    };
    const clearWorkScene = () => { try { localStorage.removeItem(WORK_KEY); } catch {} };

    const restoreWorkScene = async (saved) => {
      rebuildTo(TOPICS[saved.topic] ? saved.topic : 'empty');
      try {
        await applyScene(sim.ctx, saved);
        saveWorkScene();   // 복원된 상태로 임시본 동기화
        logLine(`임시 작업 씬 복원 — 객체 ${saved.objects.length}개`, 'sys');
      } catch (err) {
        logLine('임시 작업 씬 복원 실패: ' + (err && err.message ? err.message : err), 'err');
      }
    };

    const hasWorkScene = () => {
      const saved = loadWorkScene();
      return saved && Array.isArray(saved.objects) && saved.objects.length > 0 ? saved : null;
    };

    // 임시 작업 씬이 있으면 이어서 작업할지 묻는다(개발자 모드 진입 시 호출)
    const maybeOfferRestore = async () => {
      const saved = hasWorkScene();
      if (!saved) return;
      if (!confirm(`임시 저장된 작업 씬(객체 ${saved.objects.length}개)이 있습니다. 이어서 작업할까요?`)) return;
      await restoreWorkScene(saved);
    };

    // 새로고침·탭 전환 시에도 작업 씬을 잃지 않게 백업
    window.addEventListener('beforeunload', saveWorkScene);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveWorkScene(); });

    // 새 씬: 임시 작업 씬이 있으면 이어서 작업할지 묻고, 아니면 빈 씬으로 시작(임시본 폐기)
    const devNewScene = async () => {
      const saved = hasWorkScene();
      if (saved && confirm(`임시 저장된 작업 씬(객체 ${saved.objects.length}개)이 있습니다. 이어서 작업할까요?`)) {
        await restoreWorkScene(saved);
        return;
      }
      rebuildTo('empty');
      clearWorkScene();   // 새 씬 시작 — 직전 작업 임시본 폐기(rebuild 중 자동 백업분 포함)
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
          clearWorkScene();   // 작업 완료 — 임시 작업 씬 폐기
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
      clearWorkScene();   // 작업 완료 — 임시 작업 씬 폐기
      logLine(`씬 저장(다운로드) — 객체 ${json.objects.length}개`, 'sys');
    };

    const devLoadScene = async (file) => {
      try {
        const json = JSON.parse(await file.text());
        const topic = TOPICS[json.topic] ? json.topic : 'empty';
        if (!sim || builtTopic !== topic) rebuildTo(topic);
        await applyScene(sim.ctx, json);
        logLine(`씬 로드 완료 — ${json.name || file.name} (객체 ${json.objects.length}개)`, 'sys');
      } catch (err) {
        logLine('씬 로드 실패: ' + (err && err.message ? err.message : err), 'err');
      }
    };

    devBar.addEventListener('change', (e) => {
      const m = e.target.closest('select[data-dev-menu]');
      if (!m) return;
      const action = m.value;
      m.value = '';   // 실행 후 플레이스홀더로 복귀(메뉴이므로 선택 상태를 남기지 않음)
      if (action === 'new') devNewScene();
      else if (action === 'save') devSaveScene();
      else if (action === 'load') devFileInput.click();
      else if (action === 'register') devRegisterService();
      else if (action === 'unregister') devRemoveService();
    });
    devFileInput.addEventListener('change', () => {
      const f = devFileInput.files && devFileInput.files[0];
      devFileInput.value = '';
      if (f) devLoadScene(f);
    });

    // ==== 저장된 씬(서비스 주제) — 사용자도 읽을 수 있다(SIMULATOR.md 1장). scenes/manifest.json ====
    // manifest 는 서비스 주제 레지스트리를 겸한다: scenes(등록된 주제)와
    // hiddenTopics(서비스에서 제거된 기본 주제)를 함께 담는다.
    let sceneManifest = [];
    let hiddenTopics = [];
    if (sel) {
      fetch('scenes/manifest.json', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => {
          if (!m) return;
          hiddenTopics = Array.isArray(m.hiddenTopics) ? m.hiddenTopics : [];
          hiddenTopics.forEach((k) => sel.querySelector(`option[value="${k}"]`)?.remove());
          if (!Array.isArray(m.scenes)) return;
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
      try {
        const res = await fetch(entry.file, { cache: 'no-store' });
        const json = await res.json();
        // 씬의 기반 주제(topic 필드) 위에 빌드 — devLoadScene(파일 열기)과 동일한 규약
        build(`scene:${id}`, TOPICS[json.topic] || TOPICS.empty);
        applyDevMode();
        sim.resize();
        cancelAnimationFrame(raf); loop();
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

    // ==== 서비스 등록/제거 (2026-07-09) — 개발자 모드에서 현재 주제를 서비스 주제로 ====
    // 웹 서비스가 제공하는 scenes/manifest.json + scenes/<id>.json 을 같은 형식으로 갱신한다.
    // File System Access API 로 Web/scenes 폴더에 직접 쓰면 로컬 서비스에 즉시 반영되고,
    // git push 로 배포에도 반영된다. 미지원 브라우저는 갱신 파일 다운로드로 폴백.
    // 폴더 핸들은 IndexedDB 에 저장해 재사용한다 — 최초 1회만 폴더를 고르면
    // 이후 등록/제거는 선택 창 없이 자동으로 Web/scenes 에 기록된다.
    const idbKv = (mode, fn) => new Promise((resolve) => {
      const req = indexedDB.open('ares-sim-dev', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const tx = req.result.transaction('kv', mode);
        const r = fn(tx.objectStore('kv'));
        tx.oncomplete = () => { resolve(r && 'result' in r ? r.result : null); req.result.close(); };
        tx.onerror = () => { resolve(null); req.result.close(); };
      };
    });
    const idbGetDir = () => idbKv('readonly', (store) => store.get('scenesDir'));
    const idbSetDir = (dir) => idbKv('readwrite', (store) => store.put(dir, 'scenesDir'));

    // 선택한 폴더가 scenes 가 아니면 Web/scenes(또는 scenes) 하위 폴더로 자동 진입
    const descendToScenes = async (dir) => {
      if (!dir || dir.name === 'scenes') return dir;
      try { return await (await dir.getDirectoryHandle('Web')).getDirectoryHandle('scenes'); } catch {}
      try { return await dir.getDirectoryHandle('scenes'); } catch {}
      return dir;
    };

    let scenesDir = null;
    const ensureScenesDir = async () => {
      if (scenesDir) return scenesDir;
      if (!window.showDirectoryPicker) return null;

      // (1) 저장된 핸들 재사용 — 권한만 확인/요청하고 선택 창은 띄우지 않는다
      let dir = await idbGetDir();
      if (dir) {
        try {
          let perm = await dir.queryPermission({ mode: 'readwrite' });
          if (perm === 'prompt') perm = await dir.requestPermission({ mode: 'readwrite' });
          if (perm !== 'granted') dir = null;
        } catch { dir = null; }
      }

      // (2) 저장된 핸들이 없으면 최초 1회 폴더 선택 (id 로 지난 위치를 기억한다)
      if (!dir) {
        try {
          dir = await window.showDirectoryPicker({ id: 'ares-scenes', mode: 'readwrite' });
        } catch { return null; }                        // 폴더 선택 취소
        dir = await descendToScenes(dir);
        idbSetDir(dir);
      }

      scenesDir = dir;
      return dir;
    };

    const downloadJson = (name, text) => {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    // scenes 폴더에 파일 기록. 폴더 접근이 없으면 다운로드 폴백('download' 반환).
    const writeServiceFile = async (name, text) => {
      const dir = await ensureScenesDir();
      if (!dir) { downloadJson(name, text); return 'download'; }
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
      return 'dir';
    };

    const writeManifest = () =>
      writeServiceFile('manifest.json', JSON.stringify({ hiddenTopics, scenes: sceneManifest }, null, 2) + '\n');

    // 현재 화면(기반 주제 + 스폰 객체)을 새 서비스 주제로 등록
    const devRegisterService = async () => {
      if (!sim?.ctx) return;
      const cur = (sel && sel.value) || 'empty';
      const defId = cur.startsWith('scene:') ? cur.slice(6) : '';
      const id = (prompt('등록할 주제 ID (영문 소문자·숫자·-_):', defId) || '').trim();
      if (!id) return;
      if (!/^[a-z0-9_-]+$/.test(id)) { logLine('주제 ID 는 영문 소문자·숫자·-_ 만 사용할 수 있습니다', 'err'); return; }
      if (TOPICS[id]) { logLine(`'${id}' 는 기본 주제 ID 와 겹쳐 사용할 수 없습니다`, 'err'); return; }
      const prev = sceneManifest.find((s) => s.id === id);
      const label = (prompt('주제 이름 (드롭다운 표시):', prev?.label || '') || '').trim();
      if (!label) return;

      const baseTopic = TOPICS[cur] ? cur : 'empty';   // 기반 주제는 로드 시 build 로 재현된다
      const json = serializeScene(sim.ctx, { name: label, topic: baseTopic });
      try {
        const how = await writeServiceFile(`${id}.json`, JSON.stringify(json, null, 2) + '\n');
        if (prev) { prev.file = `scenes/${id}.json`; prev.label = label; }
        else sceneManifest.push({ id, file: `scenes/${id}.json`, label });
        await writeManifest();

        if (sel) {
          let opt = sel.querySelector(`option[value="scene:${id}"]`);
          if (!opt) {
            opt = document.createElement('option');
            opt.value = `scene:${id}`;
            sel.appendChild(opt);
          }
          opt.textContent = label;
          sel.value = `scene:${id}`;
        }
        builtTopic = `scene:${id}`;   // 화면이 등록한 씬 그대로라 재빌드 불필요
        clearWorkScene();             // 작업 완료(서비스 등록) — 임시 작업 씬 폐기
        logLine(how === 'dir'
          ? `서비스 등록 완료 — '${label}' (scenes/${id}.json, 객체 ${json.objects.length}개)`
          : `서비스 등록 — ${id}.json·manifest.json 다운로드됨. Web/scenes/ 에 넣어 반영하세요`, 'sys');
      } catch (err) {
        logLine('서비스 등록 실패: ' + (err && err.message ? err.message : err), 'err');
      }
    };

    // 현재 선택된 주제를 서비스에서 제거 — 등록 주제는 manifest 의 scenes 에서 빼고,
    // 기본 주제는 hiddenTopics 에 넣어 드롭다운에서 숨긴다(씬 파일은 남겨둔다).
    const devRemoveService = async () => {
      const v = (sel && sel.value) || '';
      if (!v || v === 'empty') { logLine('서비스에서 제거할 주제를 드롭다운에서 선택하세요', 'err'); return; }
      const isScene = v.startsWith('scene:');
      const id = isScene ? v.slice(6) : v;
      const label = isScene
        ? (sceneManifest.find((s) => s.id === id)?.label || id)
        : (TOPICS[v]?.label || v);
      if (!confirm(`'${label}' 주제를 서비스에서 제거할까요?`)) return;
      try {
        if (isScene) sceneManifest = sceneManifest.filter((s) => s.id !== id);
        else if (!hiddenTopics.includes(v)) hiddenTopics.push(v);
        const how = await writeManifest();
        sel?.querySelector(`option[value="${v}"]`)?.remove();
        // 남은 첫 주제로 전환
        const next = (sel && sel.value) || DEFAULT_TOPIC;
        if (next.startsWith('scene:')) loadSavedScene(next.slice(6));
        else rebuildTo(next);
        logLine(how === 'dir'
          ? `서비스 제거 완료 — '${label}'${isScene ? ` (scenes/${id}.json 파일은 남겨둠)` : ''}`
          : `서비스 제거 — manifest.json 다운로드됨. Web/scenes/ 에 넣어 반영하세요`, 'sys');
      } catch (err) {
        logLine('서비스 제거 실패: ' + (err && err.message ? err.message : err), 'err');
      }
    };

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
      // 시뮬 시작 브로드캐스트 — 이전 종료의 복귀 애니메이션이 진행 중이면
      // 컴포넌트(Gun 등)가 즉시 원위치로 스냅해 깨끗한 상태로 시작한다.
      sim?.ctx?.objects?.routeCommand?.('SIM_START');
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
        // 시뮬 종료 브로드캐스트(자연 종료·중단 공통) — Gun 원위치 복귀 등
        // 종료 시 원상복구가 필요한 컴포넌트가 이 신호를 받는다.
        sim?.ctx?.objects?.routeCommand?.('SIM_END');
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

    // 더블클릭(모바일 더블탭 포함): 처음 시작할 때의 카메라 상태로 복귀
    if (stage) {
      stage.addEventListener('dblclick', () => {
        if (card.hidden || !sim || !sim.ctx) return;
        sim.ctx.resetCameraHome();
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